import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error: Deno std module not typed
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

console.log('archive-manifest boot');

declare const Deno: any;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const DRUG_PHOTOS_BUCKET = 'drug-photos';
const MAX_PHOTO_TOTAL_SIZE = 200 * 1024 * 1024;
const LOCK_TIMEOUT_HOURS = 1;

function sseMessage(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

async function estimatePhotoTotalSize(photoUrls: string[]): Promise<number> {
  let total = 0;
  for (const url of photoUrls) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      const contentLength = res.headers.get('content-length');
      if (contentLength) total += parseInt(contentLength, 10);
    } catch (err) {
      console.warn(`Failed to HEAD ${url}:`, err);
    }
  }
  return total;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let trigger: 'manual' | 'cron' | 'dispatched' = 'manual';
  let manifestId: string | null = null;

  try {
    const body = await req.json();
    manifestId = body.manifestId as string;
    if (body.trigger) trigger = body.trigger;
  } catch (e) {
    // ignore
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
      await send({ status: 'locking', message: '取得封存鎖...' });
      const lockUntil = new Date(Date.now() - LOCK_TIMEOUT_HOURS * 60 * 60 * 1000).toISOString();
      const { error: lockError } = await supabase
        .from('manifests')
        .update({ archive_status: 'archiving', archive_locked_at: new Date().toISOString() })
        .eq('id', manifestId)
        .or(
          `archive_status.is.null`,
          `and(archive_status.eq.archiving,archive_locked_at.lt.${lockUntil})`,
          `and(archive_status.eq.restoring,archive_locked_at.lt.${lockUntil})`
        );

      if (lockError) throw lockError;

      const { data: lockCheck, error: lockCheckError } = await supabase
        .from('manifests')
        .select('archive_status, archive_locked_at')
        .eq('id', manifestId)
        .single();

      if (lockCheckError) throw lockCheckError;
      if (lockCheck.archive_status !== 'archiving' || !lockCheck.archive_locked_at) {
        await send({ status: 'skipped', message: '此清單正在被其他程序封存中' });
        writer.close();
        return;
      }

      // Step 2: Fetch drug_items
      await send({ status: 'fetching_items', message: '讀取藥品資料...' });
      const { data: drugItems, error: itemsError } = await supabase
        .from('drug_items')
        .select('id, manifest_id, page_number, item_order, barcode, name, expected_quantity, bonus_quantity, actual_quantity, counted_status, photo_url')
        .eq('manifest_id', manifestId);

      if (itemsError) throw itemsError;

      if (!drugItems || drugItems.length === 0) {
        await supabase
          .from('manifests')
          .update({ status: 'archived', archive_status: 'archived', archive_locked_at: null })
          .eq('id', manifestId);
        await send({ status: 'completed', message: '沒有藥品項目，已直接標記為封存' });
        writer.close();
        return;
      }

      // Step 3: Estimate photo size (non-blocking)
      await send({ status: 'estimating_photos', message: '估算照片大小...' });
      const photoUrls = drugItems
        .map(item => item.photo_url)
        .filter((url): url is string => !!url);

      const totalSize = await estimatePhotoTotalSize(photoUrls);

      // Step 4: Delete drug_items and update manifest (ZIP creation skipped temporarily)
      await send({ status: 'updating_database', message: '更新資料庫...' });

      const { error: deleteError } = await supabase
        .from('drug_items')
        .delete()
        .eq('manifest_id', manifestId);

      if (deleteError) throw deleteError;

      const { error: updateError } = await supabase
        .from('manifests')
        .update({
          status: 'archived',
          archive_status: 'archived',
          archived_zip_path: null,
          archive_locked_at: null,
        })
        .eq('id', manifestId);

      if (updateError) throw updateError;

      // Step 5: Cleanup photos
      await send({ status: 'cleaning_up', message: '清理照片...' });
      const photoPathsToDelete = photoUrls.map(url => {
        try {
          const urlObj = new URL(url);
          const pathname = urlObj.pathname;
          const parts = pathname.split('/');
          const bucketIndex = parts.indexOf(DRUG_PHOTOS_BUCKET);
          if (bucketIndex !== -1 && bucketIndex + 1 < parts.length) {
            return parts.slice(bucketIndex + 1).join('/');
          }
          return null;
        } catch (e) {
          return null;
        }
      }).filter((path): path is string => !!path);

      if (photoPathsToDelete.length > 0) {
        const { error: deletePhotosError } = await supabase.storage
          .from(DRUG_PHOTOS_BUCKET)
          .remove(photoPathsToDelete);

        if (deletePhotosError) {
          console.warn('Failed to delete some photos:', deletePhotosError);
          await supabase.from('archive_logs').insert({
            manifest_id: manifestId,
            action: 'archive',
            trigger,
            status: 'failed',
            message: `Failed to delete some photos from storage: ${deletePhotosError.message}`,
          });
        }
      }

      // Log success
      await supabase.from('archive_logs').insert({
        manifest_id: manifestId,
        action: 'archive',
        trigger,
        status: 'success',
        message: `Successfully archived manifest with ${drugItems.length} items and ${photoUrls.length} photos`,
      });

      await send({ status: 'completed', message: '封存完成' });
    } catch (error: any) {
      console.error('Archive manifest error:', error);
      try {
        await supabase
          .from('manifests')
          .update({ archive_status: null, archive_locked_at: null })
          .eq('id', manifestId);
      } catch (lockErr) {
        console.error('Failed to release lock:', lockErr);
      }
      try {
        await supabase.from('archive_logs').insert({
          manifest_id: manifestId,
          action: 'archive',
          trigger,
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
