import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://epjyodyjdssgjqrzgtnc.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwanlvZHlqZHNzZ2pxcnpndG5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTI0ODIyNSwiZXhwIjoyMDk2ODI0MjI1fQ.rzePXeqQzsTiQxgosduqvEFGdnfbylV2CIp_XxrA8oA'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const CRON_API_URL = 'https://emp-xx-qq-qq.vercel.app/api/cron/nhi'

async function main() {
  const res = await fetch(CRON_API_URL, {
    headers: {
      'x-cron-secret': process.argv[2] || ''
    }
  })
  const text = await res.text()
  console.log('Trigger response status:', res.status)
  console.log(text)
}

main().catch((err) => {
  console.error('cron trigger failed:', err)
  process.exit(1)
})
