import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error: Deno std module not typed
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// For streaming ZIP creation - using npm
import { ZipWriter, TextReader } from 'npm:@zip.js/zip.js@2.8.26';

console.log('archive-manifest boot');

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
      console.warn(`Failed to HEAD ${url}:`, err);
    }
  }
  return total;
}

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

// 檢查 byte array 是否為有效的 ZIP 檔案（以 PK 開頭）
function isValidZip(data: Uint8Array): boolean {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4B;
}

serve(async (req: Request) => {
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

      // Step 3: Estimate photo total size
      await send({ status: 'estimating_photos', message: '估算照片大小...' });
      const photoUrls = drugItems
        .map(item => item.photo_url)
        .filter((url): url is string => !!url);
      const totalSize = await estimatePhotoTotalSize(photoUrls);

      if (totalSize > MAX_PHOTO_TOTAL_SIZE) {
        await send({ status: 'failed', message: `照片總大小 (${Math.round(totalSize / 1024 / 1024)}MB) 超過限制 (${MAX_PHOTO_TOTAL_SIZE / 1024 / 1024}MB)` });
        await supabase
          .from('manifests')
          .update({ archive_status: null, archive_locked_at: null })
          .eq('id', manifestId);
        writer.close();
        return;
      }

      // Step 4: Create data.json content
      await send({ status: 'preparing_data', message: '準備資料 JSON...' });
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
        photo_ext: item.photo_url ? item.photo_url.split('.').pop()?.toLowerCase() || 'jpg' : 'jpg',
      }));

      // Step 5: Create streaming ZIP and upload to storage
      await send({ status: 'creating_zip', message: '建立 ZIP 檔案...' });

      // 使用 BlobWriter 建立 ZIP 並收集所有 byte chunks
      const allChunks: Uint8Array[] = [];
      const zipStream = new WritableStream({
        write(chunk) {
          if (chunk instanceof Uint8Array) {
            allChunks.push(chunk);
          } else {
            allChunks.push(new Uint8Array(chunk));
          }
        }
      });
      const zipWriter = new ZipWriter(zipStream);

      // Add data.json
      await zipWriter.add('data.json', new TextReader(JSON.stringify(dataJsonItems, null, 2)));

      // Add photos
      const photoPromises = photoUrls.map(async (url) => {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const arrayBuffer = await res.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const drugItemId = drugItems.find(d => d.photo_url === url)?.id || crypto.randomUUID();
          const photoExt = url.split('.').pop()?.toLowerCase() || 'jpg';
          const filename = `photos/${drugItemId}.${photoExt}`;
          await zipWriter.add(filename, uint8Array);
        } catch (err) {
          console.warn(`無法處理照片 ${url}:`, err);
        }
      });

      await Promise.all(photoPromises);
      await zipWriter.close();

      // 合併所有 chunks 為完整的 ArrayBuffer
      const totalLength = allChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const zipArrayBuffer = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of allChunks) {
        zipArrayBuffer.set(chunk, offset);
        offset += chunk.length;
      }

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
        })
        .eq('id', manifestId);

      if (updateError) throw updateError;

      // Step 8: Cleanup photos from drug-photos bucket (non-critical)
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
          await safeLog(manifestId!, 'archive', trigger, 'failed', `Failed to delete some photos from storage: ${deletePhotosError.message}`);
        }
      }

      // Step 9: Log success
      await safeLog(manifestId!, 'archive', trigger, 'success', `Successfully archived manifest with ${drugItems.length} items and ${photoUrls.length} photos`);

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
