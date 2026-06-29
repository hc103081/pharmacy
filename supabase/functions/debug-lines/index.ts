import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (_req) => {
  try {
    const url = 'https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=A21030000I-E41001-001'
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; Debug)',
        accept: 'text/csv,text/plain,*/*'
      }
    })
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `fetch failed: ${res.status}` }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    const stream = res.body as ReadableStream<Uint8Array>
    const decoder = new TextDecoder('utf-8', { fatal: false })
    const reader = stream.getReader()
    let buffer = ''
    const newline = '\n'.charCodeAt(0)
    let lineNumber = 0
    const lines: string[] = []
    const targetStart = 224400 // just before the state
    const targetEnd = 224420
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let pos = 0
      for (let i = 0; i < buffer.length; i++) {
        if (buffer.charCodeAt(i) === newline) {
          const line = buffer.slice(pos, i)
          if (lineNumber >= targetStart && lineNumber < targetEnd) {
            lines.push(line)
          }
          lineNumber++
          pos = i + 1
        }
      }
      buffer = buffer.slice(pos)
    }
    if (buffer) {
      // last line
      if (lineNumber >= targetStart && lineNumber < targetEnd) {
        lines.push(buffer)
      }
      lineNumber++
    }
    return new Response(JSON.stringify({ lines, lineNumber }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})