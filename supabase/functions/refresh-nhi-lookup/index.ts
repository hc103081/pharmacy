import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Missing Supabase environment variables' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const NHI_API_URL = 'https://info.nhi.gov.tw/api/iode0000s01/Dataset'
    const NHI_DATASET_ID = 'A21030000I-E41001-001'
    const BATCH_SIZE = 200          // rows per DB upsert
    const MAX_PER_CALL = 5000       // max rows to process per invocation
    const STATE_TABLE = 'nhi_import_state'

    // ----- State handling -----
    let { data: stateRows, error: stateErr } = await supabase
      .from(STATE_TABLE)
      .select('last_line')
      .limit(1)
    if (stateErr) {
      console.warn(`[NHI] State fetch error: ${stateErr.message}`)
      stateRows = [{ last_line: 0 }]
    }
    let startLine = (stateRows[0]?.last_line ?? 0) as number
    console.log(`[NHI] Starting from line ${startLine}`)

    const url = `${NHI_API_URL}?rId=${NHI_DATASET_ID}`
    console.log(`[NHI] GET ${url}`)
    const res = await fetch(url, {
      headers: {
        accept: 'text/csv,text/plain,*/*',
        'user-agent': 'Mozilla/5.0 (compatible; Supabase Edge Function)'
      }
    })
    if (!res.ok) {
      throw new Error(`NHI fetch failed: ${res.status} ${res.statusText}`)
    }

    // ----- Helpers -----
    function normalizeHeader(h: string) {
      return h
        .replace(/^\uFEFF/, '') // BOM
        .replace(/[`'""「」『』【】\[\]（）\s\u00A0-\u00FF]/g, '')
        .toLowerCase()
    }

    function findIndex(headers: string[], candidates: string[]): number {
      const norm = headers.map(normalizeHeader)
      for (const c of candidates) {
        const i = norm.findIndex(h => h.includes(c) || c.includes(h))
        if (i !== -1) return i
      }
      return -1
    }

    function decodeStream(stream: ReadableStream<Uint8Array>): AsyncIterable<string> {
      const decoder = new TextDecoder('utf-8', { fatal: false })
      const reader = stream.getReader()
      return {
        async *[Symbol.asyncIterator]() {
          let buffer = ''
          const newline = '\n'.charCodeAt(0)
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            let pos = 0
            for (let i = 0; i < buffer.length; i++) {
              if (buffer.charCodeAt(i) === newline) {
                yield buffer.slice(pos, i)
                pos = i + 1
              }
            }
            buffer = buffer.slice(pos)
          }
          if (buffer) yield buffer
        }
      }
    }

    // ----- Processing -----
    const stream = res.body as ReadableStream<Uint8Array>
    const lineIterator = decodeStream(stream)[Symbol.asyncIterator]()

    let totalProcessed = 0
    let headerProcessed = false
    let idxDrugCode = -1
    let idxChinese = -1
    let idxEnglish = -1
    const batch: {
      drug_code: string
      chinese_name: string | null
      english_name: string | null
      updated_at: string
    }[] = []
    const seenInBatch = new Set<string>()
    let lineNumber = 0
    let exceededLimit = false

    for await (const rawLine of lineIterator) {
      lineNumber++
      if (lineNumber < startLine) {
        continue
      }
      if (totalProcessed >= MAX_PER_CALL) {
        exceededLimit = true
        break
      }

      const line = rawLine.replace(/\r/g, '')
      if (!line.trim()) {
        // empty line still counts as a line
        continue
      }

      if (!headerProcessed) {
        const rawHeaders = line.split(',').map(h => h.trim())
        const headers = rawHeaders.map(normalizeHeader)
        console.log(`[NHI] headers=${JSON.stringify(rawHeaders)}`)
        idxDrugCode = findIndex(rawHeaders, ['藥品代號', '藥品代碼', 'drugcode', 'drug_code'])
        idxChinese = findIndex(rawHeaders, ['藥品中文名稱', '中文名稱', '藥品名稱', 'chinesename', 'chinese_name'])
        idxEnglish = findIndex(rawHeaders, ['藥品英文名稱', '英文名稱', 'englishname', 'english_name'])
        console.log(`[NHI] idxDrugCode=${idxDrugCode} idxChinese=${idxChinese} idxEnglish=${idxEnglish}`)
        if (idxDrugCode === -1 || idxChinese === -1) {
          throw new Error(`Required columns not found (DrugCode idx=${idxDrugCode}, Chinese idx=${idxChinese})`)
        }
        headerProcessed = true
        // Note: we do NOT count the header line towards processed rows
        continue
      }

      const cols = line.split(',').map(c => c.trim())
      if (cols.length <= Math.max(idxDrugCode, idxChinese)) {
        continue
      }

      const drugCode = (cols[idxDrugCode] ?? '').trim()
      const chineseName = (cols[idxChinese] ?? '').trim()
      const englishName = idxEnglish >= 0 ? (cols[idxEnglish] ?? '').trim() : null

      if (!drugCode || !chineseName) {
        continue
      }
      if (seenInBatch.has(drugCode)) {
        continue
      }
      seenInBatch.add(drugCode)
      batch.push({
        drug_code: drugCode,
        chinese_name: chineseName,
        english_name: englishName,
        updated_at: new Date().toISOString()
      })

      if (batch.length >= BATCH_SIZE) {
        const { error } = await supabase
          .from('nhi_drug_lookup')
          .upsert(batch, { onConflict: 'drug_code' })
        if (error) {
          console.error(`[NHI] upsert batch failed (${batch.length}): ${error.message}`)
          throw error
        }
        totalProcessed += batch.length
        console.log(`[NHI] progress=${totalProcessed}`)
        batch.length = 0
        seenInBatch.clear()
      }
    }

    // Process any remaining batch
    if (batch.length > 0) {
      const { error } = await supabase
        .from('nhi_drug_lookup')
        .upsert(batch, { onConflict: 'drug_code' })
      if (error) {
        console.error(`[NHI] upsert final batch failed: ${error.message}`)
        throw error
      }
      totalProcessed += batch.length
    }

    // Update state: new start line is the line number we have read up to (including the line we just processed)
    const newLastLine = lineNumber
    const { error: updateErr } = await supabase
      .from(STATE_TABLE)
      .upsert({ id: 1, last_line: newLastLine }, { onConflict: 'id' })
    if (updateErr) {
      console.error(`[NHI] Failed to update state: ${updateErr.message}`)
    }

    const more = exceededLimit // true if we stopped due to limit, meaning there may be more data
    console.log(`[NHI] Finished call: processed=${totalProcessed}, more=${more}, exceededLimit=${exceededLimit}, lastLine=${newLastLine}`)

    return new Response(
      JSON.stringify({ success: true, processed: totalProcessed, more: more }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[NHI] fatal:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})