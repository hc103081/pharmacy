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
      return new Response(JSON.stringify({ error: 'Missing Supabase env' }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      })
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const NHI_API_URL = 'https://info.nhi.gov.tw/api/iode0000s01/Dataset'
    const NHI_DATASET_ID = 'A21030000I-E41001-001'
    const BATCH_SIZE = 200
    const STATE_TABLE = 'nhi_import_state'
    const MAX_LINES_PER_INVOCATION = 20000

    let { data: stateRows } = await supabase
      .from(STATE_TABLE)
      .select('last_row')
      .limit(1)

    const startLine = (stateRows?.[0]?.last_row ?? 0) as number

    const url = `${NHI_API_URL}?rId=${NHI_DATASET_ID}`
    const res = await fetch(url, {
      headers: {
        accept: 'text/csv,text/plain,*/*',
        'user-agent': 'Mozilla/5.0 (compatible; Supabase Edge Function)'
      }
    })
    if (!res.ok) throw new Error(`NHI fetch failed: ${res.status}`)

    const reader = res.body?.getReader()
    if (!reader) throw new Error('Response body is empty')

    const decoder = new TextDecoder('utf-8')
    let buf = ''
    let lineInFile = 0
    let headerFound = false
    let colDrugCode = -1
    let colChinese = -1
    let colEnglish = -1
    let limitReached = false

    const batch: { drug_code: string; chinese_name: string | null; english_name: string | null; updated_at: string }[] = []
    const seen = new Set<string>()
    let totalProcessed = 0

    async function flushBatch() {
      if (!batch.length) return
      const payload = batch.splice(0)
      seen.clear()
      const { error } = await supabase
        .from('nhi_drug_lookup')
        .upsert(payload, { onConflict: 'drug_code' })
      if (error) throw new Error(`upsert failed: ${error.message}`)
    }

    function parseCsvLine(line: string) {
      const result: string[] = []
      let current = ''
      let inQuotes = false
      let i = 0
      while (i < line.length) {
        const ch = line[i]
        if (inQuotes) {
          if (ch === '"' && i + 1 < line.length && line[i + 1] === '"') {
            current += '"'
            i += 2
            continue
          }
          if (ch === '"') {
            inQuotes = false
          } else {
            current += ch
          }
        } else {
          if (ch === '"') {
            inQuotes = true
          } else if (ch === ',') {
            result.push(current)
            current = ''
          } else {
            current += ch
          }
        }
        i++
      }
      result.push(current)
      return result
    }

    function findColIndices(header: string[]) {
      const norm = header.map(h =>
        h
          .replace(/[`'"「」『』【】\[\]（）\s\u00A0-\u00FF]/g, '')
          .toLowerCase()
      )
      const pick = (cands: string[]) => {
        for (const c of cands) {
          const idx = norm.findIndex(h => h.includes(c) || c.includes(h))
          if (idx !== -1) return idx
        }
        return -1
      }
      colDrugCode = pick(['藥品代號', '藥品代碼', 'drugcode', 'drug_code'])
      colChinese = pick(['藥品中文名稱', '中文名稱', '藥品名稱', 'chinesename', 'chinese_name'])
      colEnglish = pick(['藥品英文名稱', '英文名稱', 'englishname', 'english_name'])
      return colDrugCode !== -1 && colChinese !== -1
    }

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done && !buf.length) break

        if (!done || buf.length) {
          buf += decoder.decode(value ?? new Uint8Array(0), { stream: !!value })
        }

        let prev = 0
        for (let i = 0; i < buf.length; i++) {
          if (buf[i] === '\n') {
            const line = buf.slice(prev, i).replace(/\r$/, '')
            prev = i + 1
            lineInFile++

            if (!headerFound) {
              headerFound = true
              if (!findColIndices(parseCsvLine(line))) {
                throw new Error(`Required columns not found (header sample: ${line.slice(0, 120)})`)
              }
              continue
            }

            if (lineInFile <= startLine) continue

            const cols = parseCsvLine(line)
            if (cols.length <= Math.max(colDrugCode, colChinese)) continue

            const drugCode = (cols[colDrugCode] ?? '').trim()
            const chineseName = (cols[colChinese] ?? '').trim()
            const englishName = colEnglish >= 0 ? (cols[colEnglish] ?? '').trim() : null

            if (!drugCode || !chineseName) continue
            if (seen.has(drugCode)) continue

            seen.add(drugCode)
            batch.push({
              drug_code: drugCode,
              chinese_name: chineseName,
              english_name: englishName,
              updated_at: new Date().toISOString()
            })
            totalProcessed++

            if (batch.length >= BATCH_SIZE) {
              await flushBatch()
            }

            if (lineInFile - startLine >= MAX_LINES_PER_INVOCATION) {
              limitReached = true
              break
            }
          }
        }
        buf = buf.slice(prev)
        if (limitReached) break
      }

      await flushBatch()

      const { error: stateErr } = await supabase
        .from(STATE_TABLE)
        .upsert({ id: 1, last_row: lineInFile }, { onConflict: 'id' })

      if (stateErr) console.error('[NHI] state update failed:', stateErr.message)

      return new Response(
        JSON.stringify({ success: true, processed: totalProcessed, linesInFile: lineInFile, more: limitReached }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    } catch (err) {
      console.error('[NHI] fatal:', err)
      return new Response(
        JSON.stringify({ error: (err as Error).message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }
  } catch (err) {
    console.error('[NHI] outer fatal:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
