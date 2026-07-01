import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (_req) => {
  try {
    const url = 'https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=A21030000I-E41001-001'
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        accept: 'text/csv,text/plain,*/*',
        range: 'bytes=0-499'
      }
    })
    if (!res.ok) {
      // If range not supported, we might get 200 or 416; still okay
    }
    const arrayBuffer = await res.arrayBuffer()
    // Try to decode as big5 and utf-8
    const big5Dec = new TextDecoder('big5', { fatal: false })
    const utf8Dec = new TextDecoder('utf-8', { fatal: false })
    const big5Text = big5Dec.decode(arrayBuffer)
    const utf8Text = utf8Dec.decode(arrayBuffer)
    // Get first line of each
    const lines = (text) => text.split('\n')
    return new Response(
      JSON.stringify({
        status: res.status,
        ok: res.ok,
        headers: Object.fromEntries(res.headers),
        length: arrayBuffer.byteLength,
        big5FirstLine: lines(big5Text)[0].substring(0, 200),
        utf8FirstLine: lines(utf8Text)[0].substring(0, 200)
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})