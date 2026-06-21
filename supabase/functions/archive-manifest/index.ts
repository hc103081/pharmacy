import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error: Deno std module not typed
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// Deno-native ZIP library (Supabase 官方推薦)
import { JSZip } from 'https://deno.land/x/jszip/mod.ts';

console.log('archive-manifest boot (v3 - JSZip native)');

declare const Deno: any;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ARCHIVED_MANIFESTS_BUCKET = 'archived-manifests';
const DRUG_PHOTOS_BUCKET = 'drug-photos';
const MAX_PHOTO_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB
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

// 從 photoUrls 解析出 storage path
function extractPhotoStoragePath(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const parts = pathname.split('/');
    const bucketIndex = parts.indexOf(DRUG_PHOTOS_BUCKET);
    if (bucketIndex !== -1 && bucketIndex + 1 < parts.length) {
      return parts.slice(bucketIndex + 1).join('/');
    }
    return null;
  } catch {
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let trigger: 'manual' | 'cron' | 'dispatched' = 'manual';
  let manifestId: string | null = null;

  try {
    const { manifestId: id, trigger: t } = await req.json();
    manifestId = id;
    if (t) trigger = t;
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

      // Step 3: Count photos
      const photoUrls = drugItems
        .map((item: any) => item.photo_url)
        .filter((url: any): url is string => !!url);

      await send({
        status: 'estimating_photos',
        message: `找到 ${drugItems.length} 個藥品項目，${photoUrls.length} 個有照片`
      });

      const fileSizeMap = new Map<string, number>();

      // Step 4: Create data.json content
      await send({ status: 'preparing_data', message: '準備資料 JSON...' });
      const dataJsonItems = drugItems.map((item: any) => {
        let fileSizeBytes = 0;
        if (item.photo_url) {
          fileSizeBytes = fileSizeMap.get(item.photo_url) ?? 0;
        }
        return {
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
          photo_ext: item.photo_url ? item.photo_url.split('.').pop()?.toLowerCase() || 'jpg' : 'jpg',
          file_size_bytes: fileSizeBytes,
        };
      });

      // Step 5: Create ZIP with JSZip
      await send({ status: 'creating_zip', message: '建立 ZIP 檔案...' });
      const zip = new JSZip();

      // Add data.json
      zip.addFile('data.json', new TextEncoder().encode(JSON.stringify(dataJsonItems, null, 2)));

      // 下載照片並加入 ZIP（串列處理）
      let photoCount = 0;
      let failedPhotoCount = 0;
      let totalPhotoSize = 0;

      // 建立 photo_url -> drugItemId 的映射
      const photoUrlToItemId = new Map<string, string>();
      for (const item of drugItems) {
        if ((item as any).photo_url) {
          photoUrlToItemId.set((item as any).photo_url, item.id);
        }
      }

      for (const url of photoUrls) {
        try {
          const drugItemId = photoUrlToItemId.get(url) || crypto.randomUUID();
          const storagePath = extractPhotoStoragePath(url);
          if (!storagePath) {
            console.warn(`無法解析 storage path: ${url}`);
            failedPhotoCount++;
            continue;
          }

          const { data: photoBlob, error: downloadError } = await supabase.storage
            .from(DRUG_PHOTOS_BUCKET)
            .download(storagePath);

          if (downloadError || !photoBlob) {
            console.warn(`無法下載照片 ${storagePath}:`, downloadError);
            failedPhotoCount++;
            continue;
          }

          const arrayBuffer = await photoBlob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const photoExt = url.split('.').pop()?.toLowerCase() || 'jpg';
          const filename = `photos/${drugItemId}.${photoExt}`;

          zip.addFile(filename, uint8Array);
          fileSizeMap.set(url, uint8Array.length);
          totalPhotoSize += uint8Array.length;
          photoCount++;
        } catch (err) {
          console.warn(`無法處理照片 ${url}:`, err);
          failedPhotoCount++;
        }
      }

      // 檢查照片總大小
      if (totalPhotoSize > MAX_PHOTO_TOTAL_SIZE) {
        await send({ status: 'failed', message: `照片總大小 (${Math.round(totalPhotoSize / 1024 / 1024)}MB) 超過限制 (${MAX_PHOTO_TOTAL_SIZE / 1024 / 1024}MB)` });
        await supabase
          .from('manifests')
          .update({ archive_status: null, archive_locked_at: null })
          .eq('id', manifestId);
        writer.close();
        return;
      }

      await send({ status: 'creating_zip', message: `照片處理完成：成功 ${photoCount} 張，失敗 ${failedPhotoCount} 張` });

      // 用 fileSizeMap 重新生成 data.json（確保 file_size_bytes 正確）
      zip.addFile('data.json', new TextEncoder().encode(JSON.stringify(
        drugItems.map((item: any) => ({
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
          photo_ext: item.photo_url ? item.photo_url.split('.').pop()?.toLowerCase() || 'jpg' : 'jpg',
          file_size_bytes: item.photo_url ? (fileSizeMap.get(item.photo_url) ?? 0) : 0,
        })),
        null, 2
      )));

      // 生成 ZIP Uint8Array
      const zipArrayBuffer = await zip.generateAsync({ type: 'uint8array' });

      // Step 6: Upload ZIP to storage
      await send({ status: 'uploading_zip', message: '上傳 ZIP 到儲存空間...' });
      const zipPath = `${manifestId}/archive.zip`;
      const { error: uploadError } = await supabase.storage
        .from(ARCHIVED_MANIFESTS_BUCKET)
        .upload(zipPath, zipArrayBuffer, {
          contentType: 'application/zip',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Step 7: Database transaction (delete drug_items, update manifest)
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
          archived_zip_path: zipPath,
          archive_locked_at: null,
          storage_size_bytes: zipArrayBuffer.length,
        })
        .eq('id', manifestId);

      if (updateError) throw updateError;

      // Step 8: Cleanup photos from drug-photos bucket (non-critical)
      await send({ status: 'cleaning_up', message: '清理照片...' });
      const photoPathsToDelete = photoUrls.map((url: string) => {
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
      }).filter((path: any): path is string => !!path);

      if (photoPathsToDelete.length > 0) {
        const { error: deletePhotosError } = await supabase.storage
          .from(DRUG_PHOTOS_BUCKET)
          .remove(photoPathsToDelete);

        if (deletePhotosError) {
          console.warn('Failed to delete some photos:', deletePhotosError);
          await safeLog(manifestId!, 'archive', trigger, 'failed', `Failed to delete some photos from storage: ${deletePhotosError.message}`);
        }
      }

      // Step 9: Log success
      await safeLog(manifestId!, 'archive', trigger, 'success', `Successfully archived manifest with ${drugItems.length} items and ${photoCount} photos`);

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
      await safeLog(manifestId!, 'archive', trigger, 'failed', error.message || 'Unknown error');
      await send({ status: 'error', message: error.message || 'Internal server error' });
    } finally {
      writer.close();
    }
  })();

  return new Response(transformStream.readable, { headers });
});