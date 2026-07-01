import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (_req) => {
  try {
    const url = 'https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=A21030000I-E41001-001'
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; Test)',
        accept: 'application/octet-stream'
      }
    })
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `fetch failed: ${res.status}` }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    const arrayBuffer = await res.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    // Check for UTF-8 BOM
    let offset = 0
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      offset = 3
    }
    const dataBytes = bytes.slice(offset)
    // Try Big5 decode
    try {
      const big5Dec = new TextDecoder('big5')
      const text = big5Dec.decode(dataBytes)
      // Get first line
      const firstLine = text.split('\n')[0]
      return new Response(
        JSON.stringify({ firstLine, length: bytes.length, offset }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    } catch (e) {
      return new Response(JSON.stringify({ error: `Big5 decode failed: ${e}` }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})