import { createClient } from 'npm:@supabase/supabase-js@2';
// @ts-expect-error: Deno std module not typed
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

declare const Deno: any;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ARCHIVE_MANIFESTS_FUNCTION = 'archive-manifest';
const CONCURRENCY_LIMIT = 5;
const BATCH_DELAY_MS = 200;

// Helper to sleep
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to create JSON response
function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

serve(async (_req: Request) => {
  try {
    // Step 1: Find manifests that need archiving
    await sendLog('info', 'Starting archive cron job...');
    const { data: manifests, error: queryError } = await supabase
      .from('manifests')
      .select('id')
      .eq('status', 'active')
      .lt('updated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // older than 30 days
      .or(
        `archive_status.is.null,(archive_status.in.(archiving,restoring),archive_locked_at.lt.${new Date(
          Date.now() - 1 * 60 * 60 * 1000, // 1 hour timeout
        ).toISOString()})`
      );

    if (queryError) throw queryError;

    if (!manifests || manifests.length === 0) {
      await sendLog('info', 'No manifests found for archiving');
      return jsonResponse({ message: 'No manifests to archive', count: 0 });
    }

    await sendLog('info', `Found ${manifests.length} manifests to archive`);

    // Step 2: Dispatch with concurrency throttling
    const manifestIds = manifests.map(m => m.id);
    let dispatchedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < manifestIds.length; i += CONCURRENCY_LIMIT) {
      const batch = manifestIds.slice(i, i + CONCURRENCY_LIMIT);
      await sendLog('info', `Dispatching batch ${Math.floor(i / CONCURRENCY_LIMIT) + 1} (${batch.length} manifests)`);

      // Dispatch all in batch concurrently
      const batchPromises = batch.map(id => 
        fetch(`${Deno.env.get('SUPABASE_FUNCTIONS_URL')}/archive-manifest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ manifestId: id, trigger: 'dispatched' }),
        })
        .then(res => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
          return res.json();
        })
        .catch(err => {
          failedCount++;
          console.warn(`Failed to dispatch manifest ${id}:`, err);
          return null;
        })
      );

      const batchResults = await Promise.all(batchPromises);
      dispatchedCount += batchResults.filter(r => r !== null).length;

      // Wait before next batch (except for the last batch)
      if (i + CONCURRENCY_LIMIT < manifestIds.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    await sendLog('info', `Archive cron job completed. Dispatched: ${dispatchedCount}, Failed: ${failedCount}, Total: ${manifestIds.length}`);

    return jsonResponse({
      message: 'Archive cron job completed',
      dispatched: dispatchedCount,
      failed: failedCount,
      total: manifestIds.length,
    });
  } catch (error: any) {
    console.error('Archive cron error:', error);
    await sendLog('error', `Archive cron job failed: ${error.message}`);
    return jsonResponse({ error: error.message || 'Internal server error' }, 500);
  }
});

// Helper to log to Supabase (optional, could also just console.log)
async function sendLog(level: 'info' | 'error', message: string) {
  try {
    // You could insert into a logs table, but for now just console.log
    console.log(`[archive-cron] ${level.toUpperCase()}: ${message}`);
    // Uncomment if you have a logs table:
    // await supabase.from('cron_logs').insert({
    //   level,
    //   message,
    //   created_at: new Date().toISOString(),
    // });
  } catch (e) {
    // Don't let logging errors break the cron
    console.warn('Failed to send log:', e);
  }
}