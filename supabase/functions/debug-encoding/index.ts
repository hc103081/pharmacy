import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (_req) => {
  try {
    const url = 'https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=A21030000I-E41001-001'
    const res = await fetch(url, {
      headers: {
        accept: 'text/csv,text/plain,*/*',
        'user-agent': 'Mozilla/5.0 (compatible; Test)'
      }
    })
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `fetch failed: ${res.status}` }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    const arrayBuffer = await res.arrayBuffer()
    // Try big5
    const big5Decoder = new TextDecoder('big5', { fatal: false })
    const big5Text = big5Decoder.decode(arrayBuffer)
    // Try utf8
    const utf8Decoder = new TextDecoder('utf-8', { fatal: false })
    const utf8Text = utf8Decoder.decode(arrayBuffer)
    // Get first line of each
    const big5First = big5Text.split('\n')[0]
    const utf8First = utf8Text.split('\n')[0]
    return new Response(
      JSON.stringify({
        big5First: big5First.substring(0, 200),
        utf8First: utf8First.substring(0, 200),
        length: arrayBuffer.byteLength
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})