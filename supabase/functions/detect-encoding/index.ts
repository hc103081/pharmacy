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
    // Take first 50 bytes
    const slice = bytes.slice(0, Math.min(50, bytes.length))
    // UTF-8 decode
    const utf8Dec = new TextDecoder('utf-8')
    const utf8Text = utf8Dec.decode(slice)
    // Big5 decode
    try {
      const big5Dec = new TextDecoder('big5')
      const big5Text = big5Dec.decode(slice)
      return new Response(
        JSON.stringify({
          utf8: utf8Text,
          big5: big5Text,
          length: bytes.length
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    } catch (e) {
      return new Response(JSON.stringify({ error: `Big5 decode failed: ${e}` }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})