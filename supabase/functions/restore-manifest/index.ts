import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error: Deno std module not typed
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// Deno-native ZIP library (Supabase 官方推薦)
import { JSZip } from 'https://deno.land/x/jszip/mod.ts';

console.log('restore-manifest boot (v3 - JSZip native)');

declare const Deno: any;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ARCHIVED_MANIFESTS_BUCKET = 'archived-manifests';
const DRUG_PHOTOS_BUCKET = 'drug-photos';
const LOCK_TIMEOUT_HOURS = 1;

// Helper to create SSE formatted message
function sseMessage(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// 安全的 archive_logs 寫入：表不存在時不報錯
async function safeLog(manifestId: string, action: string, trigger: string, status: string, message: string) {
  try {
    const { error } = await supabase.from('archive_logs').insert({
      manifest_id: manifestId,
      action,
      trigger,
      status,
      message,
    });
    if (error) console.warn('archive_logs insert warning:', error.message);
  } catch (logErr: any) {
    console.warn('archive_logs insert failed (table may not exist):', logErr.message);
  }
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
        .select('archive_status, archive_locked_at, archived_zip_path')
        .eq('id', manifestId)
        .single();

      if (lockCheckError) throw lockCheckError;
      if (lockCheck.archive_status !== 'restoring' || !lockCheck.archive_locked_at) {
        await send({ status: 'skipped', message: '此清單狀態不可還原' });
        writer.close();
        return;
      }

      const zipPath = lockCheck.archived_zip_path;
      if (!zipPath) {
        throw new Error('archived_zip_path not found for manifest');
      }

      // Step 2: Download ZIP from archived-manifests bucket
      await send({ status: 'downloading_zip', message: '下載封存 ZIP...' });
      const { data: zipBlob, error: downloadError } = await supabase.storage
        .from(ARCHIVED_MANIFESTS_BUCKET)
        .download(zipPath);

      if (downloadError) throw downloadError;
      if (!zipBlob) {
        throw new Error('ZIP file not found in storage');
      }

      // Step 3: Load ZIP with JSZip
      await send({ status: 'restoring_items', message: '載入封存資料...' });
      const zipArrayBuffer = await zipBlob.arrayBuffer();
      const zip = new JSZip();
      await zip.loadAsync(new Uint8Array(zipArrayBuffer));

      // Find and parse data.json
      const dataJsonFile = zip.file('data.json');
      if (!dataJsonFile) {
        throw new Error('data.json not found in archive');
      }

      const dataJsonText = await dataJsonFile.async('text');
      let dataJsonItems: any[] = [];
      try {
        dataJsonItems = JSON.parse(dataJsonText);
      } catch (e) {
        throw new Error('Failed to parse data.json');
      }

      // Restore drug_items using upsert
      await send({ status: 'upserting_items', message: '還原藥品項目到資料庫...' });
      for (const item of dataJsonItems) {
        const { error: itemError } = await supabase
          .from('drug_items')
          .upsert({
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
            photo_url: null, // Will be updated after photo restore
            created_at: item.created_at ?? new Date().toISOString(),
            updated_at: item.updated_at ?? new Date().toISOString(),
          }, { onConflict: 'id' });
        if (itemError) throw itemError;
      }

      // Step 4: Extract photos and upload to drug-photos bucket
      await send({ status: 'uploading_photos', message: '還原照片...' });

      const photoUrlUpdates: { [drugItemId: string]: string } = { };

      // 使用 deno.land/x/jszip 的 iterator 遍歷所有檔案
      for (const entry of zip) {
        const filename = (entry as any).name;
        if (!filename || !filename.startsWith('photos/')) continue;

        try {
          const basename = filename.split('/').pop();
          const drugItemId = basename?.split('.')[0];
          if (!drugItemId) continue;

          const photoUint8 = await (entry as any).async('uint8array');
          const ext = filename.split('.').pop();

          const photoPath = `${manifestId}/${drugItemId}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from(DRUG_PHOTOS_BUCKET)
            .upload(photoPath, photoUint8, {
              contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
              upsert: true,
            });

          if (uploadError) {
            console.warn(`Failed to upload photo for drug_item ${drugItemId}:`, uploadError);
            continue;
          }

          const { data: publicUrlData } = await supabase.storage
            .from(DRUG_PHOTOS_BUCKET)
            .getPublicUrl(photoPath);

          if (publicUrlData?.publicUrl) {
            photoUrlUpdates[drugItemId] = publicUrlData.publicUrl;
          }
        } catch (err) {
          console.warn(`Failed to process photo entry ${filename}:`, err);
        }
      }

      // Batch update photo_url for all successfully uploaded photos
      if (Object.keys(photoUrlUpdates).length > 0) {
        await send({ status: 'updating_photo_urls', message: '更新照片 URL...' });
        for (const [drugItemId, photoUrl] of Object.entries(photoUrlUpdates)) {
          const { error: itemError } = await supabase
            .from('drug_items')
            .update({ photo_url: photoUrl })
            .eq('id', drugItemId);
          if (itemError) {
            console.warn(`Failed to update photo_url for drug_item ${drugItemId}:`, itemError);
          }
        }
      }

      // Step 5: Update manifest to active and release lock
      await send({ status: 'finalizing', message: '完成還原...' });

      // 從 data.json 計算照片總大小（O(1) 記憶體計算，無 Storage API 呼叫）
      const totalPhotoSize = dataJsonItems.reduce(
        (sum: number, item: any) => sum + (item.file_size_bytes ?? 0),
        0
      );

      const { error: updateError } = await supabase
        .from('manifests')
        .update({
          status: 'active',
          archive_status: null,
          archived_zip_path: null,
          archive_locked_at: null,
          updated_at: new Date().toISOString(),
          storage_size_bytes: totalPhotoSize,
        })
        .eq('id', manifestId);

      if (updateError) throw updateError;

      // Step 6: Delete ZIP from archived-manifests bucket (non-critical)
      await send({ status: 'cleaning_up', message: '清理封存 ZIP...' });
      const { error: deleteZipError } = await supabase.storage
        .from(ARCHIVED_MANIFESTS_BUCKET)
        .remove([zipPath]);
      if (deleteZipError) {
        console.warn('Failed to delete archive ZIP:', deleteZipError);
        await safeLog(manifestId!, 'restore', 'manual', 'failed', `Failed to delete archive ZIP from storage: ${deleteZipError.message}`);
      }

      // Step 7: Log success
      await safeLog(manifestId!, 'restore', 'manual', 'success', `Successfully restored manifest with ${dataJsonItems.length} items and ${Object.keys(photoUrlUpdates).length} photos`);

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
      await safeLog(manifestId!, 'restore', 'manual', 'failed', error.message || 'Unknown error');
      await send({ status: 'error', message: error.message || 'Internal server error' });
    } finally {
      writer.close();
    }
  })();

  return new Response(transformStream.readable, { headers });
});