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
    console.log('[gdrive-storage-cleanup] Starting weekly cleanup...');

    // Get jobs with storage_deleted = false and retry_count < 3
    const { data: jobs, error } = await supabase
      .from('gdrive_migration_jobs')
      .select('id, manifest_id')
      .eq('storage_deleted', false)
      .lt('retry_count', 3);

    if (error) throw error;

    if (!jobs || jobs.length === 0) {
      console.log('[gdrive-storage-cleanup] No storage cleanup needed');
      return jsonResponse({ message: 'No cleanup needed' });
    }

    console.log(`[gdrive-storage-cleanup] Processing ${jobs.length} cleanup jobs`);

    let successCount = 0;
    let failCount = 0;

    for (const job of jobs) {
      try {
        // Try to delete the ZIP from Supabase Storage
        const { error: deleteError } = await supabase.storage
          .from('archived-manifests')
          .remove([`${job.manifest_id}/archive.zip`]);

        if (deleteError) throw deleteError;

        // Mark as deleted
        await supabase
          .from('gdrive_migration_jobs')
          .update({ storage_deleted: true, updated_at: new Date().toISOString() })
          .eq('id', job.id);

        successCount++;
      } catch (err: any) {
        console.error(`[gdrive-storage-cleanup] Failed to delete ${job.manifest_id}:`, err);

        // Increment retry count
        await supabase
          .from('gdrive_migration_jobs')
          .update({
            retry_count: supabase.raw('retry_count + 1'),
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        // Log the failure
        try {
          await supabase.from('storage_logs').insert({
            message: 'Failed to delete storage file during weekly cleanup',
            detail: `Job ID: ${job.id}, Manifest ID: ${job.manifest_id}, Error: ${err.message}`,
            created_at: new Date().toISOString(),
          });
        } catch {
          // Ignore log errors
        }

        failCount++;
      }
    }

    return jsonResponse({
      message: 'Weekly storage cleanup completed',
      success: successCount,
      failed: failCount,
      total: jobs.length,
    });
  } catch (error: any) {
    console.error('[gdrive-storage-cleanup] Error:', error);
    return jsonResponse({ error: error.message || 'Internal server error' }, 500);
  }
});