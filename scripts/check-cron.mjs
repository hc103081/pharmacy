import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://epjyodyjdssgjqrzgtnc.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwanlvZHlqZHNzZ2pxcnpndG5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTI0ODIyNSwiZXhwIjoyMDk2ODI0MjI1fQ.rzePXeqQzsTiQxgosduqvEFGdnfbylV2CIp_XxrA8oA'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  // Try to list cron jobs from pg_cron.job
  const { data, error } = await supabase.rpc('cron_job_list') // Not sure if this exists
  // Actually we can query the cron.job table directly if the user has permission
  // Let's try to select from cron.job
  const { data: jobs, error: jobErr } = await supabase
    .from('cron.job')
    .select('*')
  
  if (jobErr) {
    console.error('Error fetching cron jobs:', jobErr.message)
    // Maybe the schema is not exposed; try to call a function we know
    // We can try to see if our function exists
    const { data: funcs, error: funcErr } = await supabase
      .from('pg_proc')
      .select('proname')
      .like('proname', '%reset_nhi_state%')
    if (funcErr) {
      console.error('Error checking for function:', funcErr.message)
    } else {
      console.log('Found functions:', fns)
    }
    return
  }
  
  console.log('Cron jobs:', jobs)
}

main().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})