import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://epjyodyjdssgjqrzgtnc.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwanlvZHlqZHNzZ2pxcnpndG5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTI0ODIyNSwiZXhwIjoyMDk2ODI0MjI1fQ.rzePXeqQzsTiQxgosduqvEFGdnfbylV2CIp_XxrA8oA'

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 1. Reset import state
  console.log('Resetting import state...')
  const { error: resetErr } = await supabase
    .from('nhi_import_state')
    .upsert({ id: 1, last_row: 0 }, { onConflict: 'id' })
  if (resetErr) {
    console.error('Reset state failed:', resetErr.message)
    Deno.exit(1)
  }
  console.log('State reset to last_row=0')

  // 2. Invoke the deployed function
  console.log('Invoking refresh-nhi-lookup function...')
  const functionUrl = `${SUPABASE_URL}/functions/v1/refresh-nhi-lookup`
  const res = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    }
  })
  const result = await res.json()
  console.log('Function response:', JSON.stringify(result, null, 2))
}

main().catch((err) => {
  console.error('Script error:', err)
  Deno.exit(1)
})
