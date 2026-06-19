import { createClient } from 'npm:@supabase/supabase-js@2';
// @ts-expect-error: Deno std module not typed
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// For streaming ZIP creation
import { ZIPStore, ZIPWriter } from 'jsr:@zip-js/zip-js';
console.log('Testing if changes are picked up');

declare const Deno: any;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ARCHIVED_MANIFESTS_BUCKET = 'archived-manifests';
const DRUG_PHOTOS_BUCKET = 'drug-photos';
const MAX_PHOTO_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB
const LOCK_TIMEOUT_HOURS = 1;

// Helper to sleep
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to estimate photo total size via HEAD requests
async function estimatePhotoTotalSize(photoUrls: string[]): Promise<number> {
  let total = 0;
  for (const url of photoUrls) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      const contentLength = res.headers.get('content-length');
      if (contentLength) {
        total += parseInt(contentLength, 10);
      }
    } catch (err) {
      // If HEAD fails, we'll skip this photo later; assume 0 for estimation
      console.warn(`Failed to HEAD ${url}:`, err);
    }
  }
  return total;
}

// Helper to create SSE formatted message
function sseMessage(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

serve(async (req: Request) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let trigger: 'manual' | 'cron' | 'dispatched' = 'manual';
  let manifestId: string | null = null;
  let dryRun = false;

  try {
    const { manifestId: id, trigger: t, dryRun: dr } = await req.json();
    manifestId = id;
    if (t) trigger = t;
    dryRun = dr ?? false;
  } catch (e) {
    // If JSON parsing fails, maybe it's a cron trigger with no body
    // We'll handle manifestId from query params for cron? Not needed.
  }

  // If no manifestId provided, this function should not be called directly by cron
  // Cron should use archive-cron function which dispatches to this with manifestId
  if (!manifestId) {
    return new Response('manifestId required', { status: 400 });
  }

  // Set up SSE response headers
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  headers.set('Access-Control-Allow-Origin', '*');

  // Create a transform stream for SSE
  const transformStream = new TransformStream();
  const writer = transformStream.writable.getWriter();

  // Function to send SSE message
  const send = async (data: object) => {
    const chunk = new TextEncoder().encode(sseMessage(data));
    await writer.write(chunk);
  };

  // Run the main logic in a background task so we can start streaming immediately
  (async () => {
    try {
      // Step 1: Acquire lock
      await send({ status: 'locking', message: 'Acquiring lock...' });
      const { error: lockError } = await supabase
        .from('manifests')
        .update({
          archive_status: 'archiving',
          archive_locked_at: new Date().toISOString(),
        })
        .eq('id', manifestId)
        .is('archive_status', null)
        .or(
          `archive_status.in.(archiving,restoring),archive_locked_at.lt.${new Date(
            Date.now() - LOCK_TIMEOUT_HOURS * 60 * 60 * 1000,
          ).toISOString()}`
        );

      if (lockError) throw lockError;

      // Check if we actually acquired the lock (by checking affected rows)
      // Supabase-js doesn't return affected rows directly; we'll do a select after
      const { data: lockCheck, error: lockCheckError } = await supabase
        .from('manifests')
        .select('archive_status, archive_locked_at')
        .eq('id', manifestId)
        .single();

      if (lockCheckError) throw lockCheckError;
      if (
        lockCheck.archive_status !== 'archiving' ||
        !lockCheck.archive_locked_at
      ) {
        // Another process got the lock
        await send({ status: 'skipped', message: 'Manifest is locked by another process' });
        writer.close();
        return;
      }

      // Step 2: Fetch drug_items
      await send({ status: 'fetching_items', message: 'Fetching drug items...' });
      const { data: drugItems, error: itemsError } = await supabase
        .from('drug_items')
        .select('id, manifest_id, page_number, item_order, barcode, name, expected_quantity, bonus_quantity, actual_quantity, counted_status, photo_url')
        .eq('manifest_id', manifestId);

      if (itemsError) throw itemsError;

      if (!drugItems || drugItems.length === 0) {
        await send({ status: 'completed', message: 'No drug items found' });
        // Still need to release lock and update manifest? No items to archive.
        // We'll just release lock and mark as completed.
        await supabase
          .from('manifests')
          .update({ archive_status: null, archive_locked_at: null })
          .eq('id', manifestId);
        writer.close();
        return;
      }

      // Step 3: Estimate photo total size
      await send({ status: 'estimating_photos', message: 'Estimating photo total size...' });
      const photoUrls = drugItems
        .map(item => item.photo_url)
        .filter((url): url is string => !!url);
      const totalSize = await estimatePhotoTotalSize(photoUrls);

      if (totalSize > MAX_PHOTO_TOTAL_SIZE) {
        await send({ status: 'failed', message: `Total photo size (${Math.round(totalSize / 1024 / 1024)}MB) exceeds limit (${MAX_PHOTO_TOTAL_SIZE / 1024 / 1024}MB)` });
        // Release lock
        await supabase
          .from('manifests')
          .update({ archive_status: null, archive_locked_at: null })
          .eq('id', manifestId);
        writer.close();
        return;
      }

      // Step 4: Create data.json content (without photo_url, but we need to know photo filename)
      await send({ status: 'preparing_data', message: 'Preparing data JSON...' });
      const dataJsonItems = drugItems.map(item => ({
        id: item.id,
        manifest_id: item.manifest_id,
        page_number: item.page_number,
        item_order: item.item_order,
        barcode: item.barcode,
        name: item.name,
        expected_quantity: item.expected_quantity,
        bonus_quantity: item.bonus_quantity,
        actual_quantity: item.actual_quantity,
        counted_status: item.counted_status,
        // We'll store photo extension or filename; for simplicity, we'll use a placeholder
        // In ZIP, we'll use {id}.{ext} where ext is derived from photo_url or default to jpg
        photo_ext: item.photo_url ? item.photo_url.split('.').pop().toLowerCase() || 'jpg' : 'jpg',
      }));

      // Step 5: Create streaming ZIP and upload to storage
      await send({ status: 'creating_zip', message: 'Creating ZIP archive...' });

      // We'll create a readable stream that outputs the ZIP data
      const zipStore = new ZIPStore();
      const zipWriter = new ZIPWriter(zipStore);

      // Add data.json
      await zipWriter.add(
        new TextEncoder().encode('data.json'),
        JSON.stringify(dataJsonItems, null, 2)
      );

      // Add photos
      const photoPromises = photoUrls.map(async (url, index) => {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const arrayBuffer = await blob.arrayBuffer();
          // Find the drug_item_id for this photo (by index matching photoUrls array)
          const drugItemId = drugItems[index].id;
          const filename = `photos/${drugItemId}.${dataJsonItems[index].photo_ext}`;
          await zipWriter.add(new TextEncoder().encode(filename), arrayBuffer);
        } catch (err) {
          console.warn(`Failed to process photo ${url}:`, err);
          // Skip this photo; we'll log later
        }
      });

      await Promise.all(photoPromises);
      await zipWriter.close();

      // Get the ZIP data as a Blob
      const zipBlob = await zipStore.getBlob({ type: 'application/zip' });
      const zipArrayBuffer = await zipBlob.arrayBuffer();

      // Step 6: Upload ZIP to storage
      await send({ status: 'uploading_zip', message: 'Uploading ZIP to storage...' });
      const zipPath = `${manifestId}/archive.zip`;
      const { error: uploadError } = await supabase.storage
        .from(ARCHIVED_MANIFESTS_BUCKET)
        .upload(zipPath, zipArrayBuffer, {
          contentType: 'application/zip',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Step 7: Database transaction (delete drug_items, update manifest)
      await send({ status: 'updating_database', message: 'Updating database...' });
      // We'll do this in two steps; Supabase doesn't have multi-statement transactions in JS client
      // But we can rely on foreign key constraints and do delete then update
      // Start by deleting drug_items
      const { error: deleteError } = await supabase
        .from('drug_items')
        .delete()
        .eq('manifest_id', manifestId);

      if (deleteError) throw deleteError;

      // Update manifest
      const { error: updateError } = await supabase
        .from('manifests')
        .update({
          status: 'archived',
          archive_status: 'archived',
          archived_zip_path: zipPath,
          archive_locked_at: null, // Release lock
          // Note: archive_status will be set to 'archived' to indicate completion.
          // But we also need to release the lock. We'll set archive_locked_at to null and keep archive_status as 'archived'.
        })
        .eq('id', manifestId);

      if (updateError) throw updateError;

      // Step 8: Cleanup photos from drug-photos bucket (non-critical)
      await send({ status: 'cleaning_up', message: 'Cleaning up photos...' });
      const photoPathsToDelete = photoUrls.map(url => {
        try {
          const urlObj = new URL(url);
          // Extract path from Supabase storage URL
          // Format: https://[project].supabase.co/storage/v1/object/public/[bucket]/[path]
          const pathname = urlObj.pathname; // /storage/v1/object/public/drug-photos/...
          const parts = pathname.split('/');
          // Find index of 'drug-photos'
          const bucketIndex = parts.indexOf(DRUG_PHOTOS_BUCKET);
          if (bucketIndex !== -1 && bucketIndex + 1 < parts.length) {
            // Return everything after the bucket name
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
          // Log to archive_logs but don't fail the whole operation
          await supabase.from('archive_logs').insert({
            manifest_id: manifestId,
            action: 'archive',
            trigger: trigger,
            status: 'failed',
            message: `Failed to delete some photos from storage: ${deletePhotosError.message}`,
          });
        }
      }

      // Step 9: Log success to archive_logs
      await supabase.from('archive_logs').insert({
        manifest_id: manifestId,
        action: 'archive',
        trigger: trigger,
        status: 'success',
        message: `Successfully archived manifest with ${drugItems.length} items and ${photoUrls.length} photos`,
      });

      // Step 10: Send completion message
      await send({ status: 'completed', message: 'Archive completed successfully' });
    } catch (error: any) {
      console.error('Archive manifest error:', error);
      // Release lock on error
      try {
        await supabase
          .from('manifests')
          .update({ archive_status: null, archive_locked_at: null })
          .eq('id', manifestId);
      } catch (lockErr) {
        console.error('Failed to release lock:', lockErr);
      }

      // Log failure
      try {
        await supabase.from('archive_logs').insert({
          manifest_id: manifestId,
          action: 'archive',
          trigger: trigger,
          status: 'failed',
          message: error.message || 'Unknown error',
        });
      } catch (logErr) {
        console.error('Failed to log error:', logErr);
      }

      // Send error via SSE
      await send({ status: 'error', message: error.message || 'Internal server error' });
    } finally {
      writer.close();
    }
  })();

  // Return the streaming response
  return new Response(transformStream.readable, { headers });
});