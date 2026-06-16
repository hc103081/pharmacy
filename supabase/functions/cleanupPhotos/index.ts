import { createClient } from '@supabase/supabase-js';
import { serve } from 'std/server';

serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const bucket = supabase.storage.from('drug-photos');
  const retentionDays = 180; // 6 個月
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffISO = cutoff.toISOString();

  const limit = 1000;
  let offset = 0;
  const toDelete: string[] = [];

  while (true) {
    const { data, error } = await bucket.list('', {
      limit,
      offset,
      sortBy: { column: 'created_at', order: 'asc' },
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
    if (!data?.length) break;

    for (const file of data) {
      if (file.created_at && file.created_at < cutoffISO) {
        toDelete.push(file.name);
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }

  if (toDelete.length) {
    const { error: delErr } = await bucket.remove(toDelete);
    if (delErr) {
      return new Response(JSON.stringify({ deleted: toDelete.length, error: delErr.message }), { status: 500 });
    }
    return new Response(JSON.stringify({ deleted: toDelete.length, message: 'Old photos removed' }), { status: 200 });
  }

  return new Response(JSON.stringify({ deleted: 0, message: 'No old photos found' }), { status: 200 });
});