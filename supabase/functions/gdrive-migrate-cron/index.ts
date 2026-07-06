import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error: Deno std module not typed
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

declare const Deno: any;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

serve(async (_req: Request) => {
  try {
    console.log('[gdrive-migrate-cron] Starting...');

    // Step 1: Find manifests eligible for migration
    // Criteria: archived > 30 days, cloud_backup = false, has valid gdrive connection
    // archive_status: 'archived' (ready for migration), NULL (legacy), but NOT 'migrating'/'completed'
    const { data: manifests, error: queryError } = await supabase
      .from('manifests')
      .select('id, user_id')
      .eq('status', 'archived')
      .eq('cloud_backup', false)
      .not('archived_at', 'is', null)
      .lt('archived_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .in('archive_status', ['archived', null]);

    if (queryError) throw queryError;

    if (!manifests || manifests.length === 0) {
      console.log('[gdrive-migrate-cron] No manifests to migrate');
      return jsonResponse({ message: 'No manifests to migrate', count: 0 });
    }

    console.log(`[gdrive-migrate-cron] Found ${manifests.length} manifests to migrate`);

    // Filter to only those with valid gdrive connections
    const userIds = [...new Set(manifests.map(m => m.user_id))];
    const { data: connections } = await supabase
      .from('user_gdrive_connections')
      .select('user_id')
      .in('user_id', userIds)
      .not('refresh_token', 'is', null);

    const validUserIds = new Set(connections?.map(c => c.user_id) || []);
    const eligibleManifests = manifests.filter(m => validUserIds.has(m.user_id));

    if (eligibleManifests.length === 0) {
      console.log('[gdrive-migrate-cron] No manifests with valid gdrive connections');
      return jsonResponse({ message: 'No eligible manifests', count: 0 });
    }

    // Step 2: Batch insert into queue (idempotent - upsert on conflict)
    const jobs = eligibleManifests.map(m => ({
      manifest_id: m.id,
      user_id: m.user_id,
      trigger: 'cron',
      status: 'pending',
    }));

    const { error: insertError } = await supabase
      .from('gdrive_migration_jobs')
      .upsert(jobs, { onConflict: 'manifest_id,trigger' });

    if (insertError) {
      if (insertError.code !== '23505') throw insertError;
    }

    console.log(`[gdrive-migrate-cron] Queued ${eligibleManifests.length} jobs`);
    return jsonResponse({
      message: 'Migration jobs queued',
      queued: eligibleManifests.length,
    });
  } catch (error: any) {
    console.error('[gdrive-migrate-cron] Error:', error);
    return jsonResponse({ error: error.message || 'Internal server error' }, 500);
  }
});