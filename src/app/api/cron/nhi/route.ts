import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string
const CRON_SECRET = process.env.CRON_SECRET || process.env.CRON_TOKEN || ''

export const dynamic = 'force-dynamic'

async function startRefresh() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { error: resetErr } = await supabase
    .from('nhi_import_state')
    .upsert({ id: 1, last_row: 0 }, { onConflict: 'id' })

  if (resetErr) {
    return { success: false, error: resetErr.message }
  }

  const functionUrl = `${SUPABASE_URL}/functions/v1/refresh-nhi-lookup`
  const res = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    }
  })

  const text = await res.text()
  let result
  try {
    result = JSON.parse(text)
  } catch {
    result = { raw: text }
  }

  return { success: res.ok, result }
}

export async function GET(request: Request) {
  const expectedSecret = CRON_SECRET
  const providedSecret = request.headers.get('x-cron-secret') || ''
  const cronHeader = request.headers.get('x-vercel-cron')

  if (!cronHeader || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const result = await startRefresh()
    return NextResponse.json(result)
  } catch (err) {
    console.error('cron nhi refresh failed', err)
    return NextResponse.json({ error: 'cron nhi refresh failed' }, { status: 500 })
  }
}
