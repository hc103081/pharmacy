import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (_req) => {
  try {
    const url = 'https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=A21030000I-E41001-001'
    const res = await fetch(url, {
      headers: {
        range: 'bytes=0-500',
        accept: 'application/octet-stream',
        'user-agent': 'Mozilla/5.0 (compatible; Test)'
      }
    })
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `fetch failed: ${res.status}` }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    const arrayBuffer = await res.arrayBuffer()
    // Get hex of first 20 bytes
    const bytes = new Uint8Array(arrayBuffer)
    let hex = ''
    for (let i = 0; i < Math.min(20, bytes.length); i++) {
      hex += bytes[i].toString(16).padStart(2, '0') + ' '
    }
    // Try decode as UTF-8
    const utf8Decoder = new TextDecoder('utf-8')
    const utf8Text = utf8Decoder.decode(arrayBuffer)
    // Try decode as Big5
    const big5Decoder = new TextDecoder('big5')
    const big5Text = big5Decoder.decode(arrayBuffer)
    return new Response(
      JSON.stringify({
        hex: hex.trim(),
        utf8First100: utf8Text.substring(0, 100),
        big5First100: big5Text.substring(0, 100),
        length: bytes.length
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})