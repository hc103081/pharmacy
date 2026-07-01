import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (_req) => {
  try {
    const url = 'https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=A21030000I-E41001-001'
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; Supabase Edge Function)',
        accept: 'text/csv,text/plain,*/*'
      }
    })
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `fetch failed: ${res.status}` }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    const arrayBuffer = await res.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    let hex = ''
    for (let i = 0; i < Math.min(8, bytes.length); i++) {
      hex += bytes[i].toString(16).padStart(2, '0') + ' '
    }
    return new Response(
      JSON.stringify({ length: bytes.length, hexPrefix: hex.trim() }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})