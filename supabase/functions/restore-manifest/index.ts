import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error: Deno std module not typed
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

console.log('restore-manifest boot');

declare const Deno: any;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const LOCK_TIMEOUT_HOURS = 1;

function sseMessage(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let manifestId: string | null = null;

  try {
    const { manifestId: id } = await req.json();
    manifestId = id;
  } catch (e) {
    return new Response('manifestId required in JSON body', { status: 400 });
  }

  if (!manifestId) {
    return new Response('manifestId required', { status: 400 });
  }

  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  headers.set('Access-Control-Allow-Origin', '*');

  const transformStream = new TransformStream();
  const writer = transformStream.writable.getWriter();

  const send = async (data: object) => {
    const chunk = new TextEncoder().encode(sseMessage(data));
    await writer.write(chunk);
  };

  (async () => {
    try {
      // Step 1: Acquire lock
      await send({ status: 'locking', message: '取得還原鎖...' });
      const lockUntil = new Date(Date.now() - LOCK_TIMEOUT_HOURS * 60 * 60 * 1000).toISOString();
      const { error: lockError } = await supabase
        .from('manifests')
        .update({ archive_status: 'restoring', archive_locked_at: new Date().toISOString() })
        .eq('id', manifestId)
        .eq('archive_status', 'archived')
        .or(
          `archive_locked_at.is.null`,
          `archive_locked_at.lt.${lockUntil}`
        );

      if (lockError) throw lockError;

      // Check if we actually acquired the lock
      const { data: lockCheck, error: lockCheckError } = await supabase
        .from('manifests')
        .select('archive_status, archive_locked_at')
        .eq('id', manifestId)
        .single();

      if (lockCheckError) throw lockCheckError;
      if (lockCheck.archive_status !== 'restoring' || !lockCheck.archive_locked_at) {
        await send({ status: 'skipped', message: '此清單狀態不可還原' });
        writer.close();
        return;
      }

      // Step 2: Update manifest to active and release lock (simplified restore - no ZIP processing)
      await send({ status: 'finalizing', message: '還原清單狀態...' });
      const { error: updateError } = await supabase
        .from('manifests')
        .update({
          status: 'active',
          archive_status: null,
          archived_zip_path: null,
          archive_locked_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', manifestId);

      if (updateError) throw updateError;

      // Log success
      await supabase.from('archive_logs').insert({
        manifest_id: manifestId,
        action: 'restore',
        trigger: 'manual',
        status: 'success',
        message: `Successfully restored manifest (simplified - no ZIP processing)`,
      });

      await send({ status: 'completed', message: '還原完成' });
    } catch (error: any) {
      console.error('Restore manifest error:', error);
      try {
        await supabase
          .from('manifests')
          .update({ archive_status: 'archived', archive_locked_at: null })
          .eq('id', manifestId);
      } catch (lockErr) {
        console.error('Failed to release lock:', lockErr);
      }
      try {
        await supabase.from('archive_logs').insert({
          manifest_id: manifestId,
          action: 'restore',
          trigger: 'manual',
          status: 'failed',
          message: error.message || 'Unknown error',
        });
      } catch (logErr) {
        console.error('Failed to log error:', logErr);
      }
      await send({ status: 'error', message: error.message || 'Internal server error' });
    } finally {
      writer.close();
    }
  })();

  return new Response(transformStream.readable, { headers });
});
