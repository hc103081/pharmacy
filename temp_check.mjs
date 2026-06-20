import pkg from './node_modules/@supabase/supabase-js/dist/main/index.js';
const { createClient } = pkg;
const supabase = createClient('https://epjyodyjdssgjqrzgtnc.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwanlvZHlqZHNzZ2pxcnpndG5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODAyMzQ4MiwiZXhwIjoyMDYzNTk5NDgyfQ.fZtD7vJ3NqQa6f2Z3Yt5X8Wr9Kb3cD4eF6gH8iJ9kL0');
const { data: logs } = await supabase.from('archive_logs').select('*').order('created_at', { ascending: false }).limit(10);
console.log('=== archive_logs ===');
console.log(JSON.stringify(logs, null, 2));
