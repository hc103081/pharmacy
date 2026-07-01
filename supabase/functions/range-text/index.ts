import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (_req) => {
  try {
    const url = 'https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=A21030000I-E41001-001'
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; Test)',
        accept: 'text/csv,text/plain,*/*',
        range: 'bytes=0-9'
      }
    })
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `HTTP ${res.status}` }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    const text = await res.text()
    return new Response(
      JSON.stringify({ first10Chars: text.substring(0, 10), length: text.length }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})