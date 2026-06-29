import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://epjyodyjdssgjqrzgtnc.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwanlvZHlqZHNzZ2pxcnpndG5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTI0ODIyNSwiZXhwIjoyMDk2ODI0MjI1fQ.rzePXeqQzsTiQxgosduqvEFGdnfbylV2CIp_XxrA8oA'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/refresh-nhi-lookup`

async function main() {
  console.log('Resetting import state...')
  const { error: resetErr } = await supabase
    .from('nhi_import_state')
    .upsert({ id: 1, last_row: 0 }, { onConflict: 'id' })
  if (resetErr) {
    console.error('Reset state failed:', resetErr.message)
    process.exit(1)
  }
  console.log('State reset to last_row=0')

  for (;;) {
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    })
    const text = await res.text()
    let result
    try {
      result = JSON.parse(text)
    } catch {
      result = { raw: text }
      console.log('Function raw response:', text)
    }
    console.log('Function response:', JSON.stringify(result, null, 2))
    if (!res.ok || result.error) {
      console.error('Function errored, stopping retries.')
      process.exit(1)
    }
    if (result.more) {
      console.log('More rows remain, continuing...')
      continue
    }
    console.log('Import complete.')
    break
  }
}

main().catch((err) => {
  console.error('Script error:', err)
  process.exit(1)
})
