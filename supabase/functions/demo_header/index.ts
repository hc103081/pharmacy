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
    const BATCH_SIZE = 200
    const MAX_PER_CALL = 10 // just to get headers
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

    const url = `${NHI_API_URL}?rId=${NHI_DATASET_ID}`
    const res = await fetch(url, {
      headers: {
        accept: 'text/csv,text/plain,*/*',
        'user-agent': 'Mozilla/5.0 (compatible; Supabase Edge Function)'
      }
    })
    if (!res.ok) {
      throw new Error(`NHI fetch failed: ${res.status} ${res.statusText}`)
    }

    // ----- Header extraction -----
    const stream = res.body as ReadableStream<Uint8Array>
    const decoder = new TextDecoder('utf-8', { fatal: false })
    const reader = stream.getReader()
    let buffer = ''
    let lineNumber = 0
    let headerLine = ''
    let headers: string[] = []
    let idxDrugCode = -1
    let idxChinese = -1
    let idxEnglish = -1

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        let chunk = decoder.decode(value, { stream: true })
        if (buffer.length === 0 && chunk.startsWith('\uFEFF')) {
          chunk = chunk.slice(1)
        }
        buffer += chunk
        let newlineIndex
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex)
          buffer = buffer.slice(newlineIndex + 1)
          if (line.endsWith('\r')) line = line.slice(0, -1)

          lineNumber++
          if (lineNumber < startLine) {
            continue
          }
          if (!headerProcessed) {
            headerLine = line
            headers = line.split(',').map(c => c.trim())
            function normalizeHeader(h: string) {
              return h
                .replace(/[`'""「」『』【】\[\]（）\s\u00A0-\u00FF]/g, '')
                .toLowerCase()
            }
            const normHeader = headers.map(normalizeHeader)
            function findIndex(candidates: string[]): number {
              for (const c of candidates) {
                const i = normHeader.findIndex(h => h.includes(c) || c.includes(h))
                if (i !== -1) return i
              }
              return -1
            }
            idxDrugCode = findIndex(['藥品代號', '藥品代碼', 'drugcode', 'drug_code'])
            idxChinese = findIndex(['藥品中文名稱', '中文名稱', '藥品名稱', 'chinesename', 'chinese_name'])
            idxEnglish = findIndex(headers, ['藥品英文名稱', '英文名稱', 'englishname', 'english_name'])
            headerProcessed = true
            // We have what we need, break out
            break
          }
        }
        if (headerProcessed) break
      }
    } finally {
      reader.releaseLock()
    }

    // Return debug info
    return new Response(
      JSON.stringify({ 
        success: true,
        headerLine,
        headers,
        idxDrugCode,
        idxChinese,
        idxEnglish
      }), 
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