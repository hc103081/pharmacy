import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error: Deno std module not typed
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// Deno-native ZIP library (Supabase 官方推薦)
import { JSZip } from 'https://deno.land/x/jszip/mod.ts';

console.log('restore-manifest boot (v4 - Strategy 2: B2 photos stay in place)');

declare const Deno: any;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ARCHIVED_MANIFESTS_BUCKET = 'archived-manifests';
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

      // Step 4: Restore drug_items using upsert - 直接使用 data.json 中的 photo_url (Strategy 2)
      await send({ status: 'upserting_items', message: '還原藥品項目到資料庫 (照片直接使用 B2 key)...' });
      for (const item of dataJsonItems) {
        const { error: itemError } = await supabase
          .from('drug_items')
          .upsert({
            id: item.id,
            manifest_id: item.manifest_id,
            page_number: item.page_number,
            item_order: item.item_order,
            barcode: item.barcode,
            product_code: item.product_code ?? null,
            name: item.name,
            expected_quantity: item.expected_quantity,
            bonus_quantity: item.bonus_quantity ?? 0,
            actual_quantity: item.actual_quantity,
            counted_status: item.counted_status,
            storage_location: item.storage_location ?? null,
            category: item.category ?? null,
            // Strategy 2: photo_url 直接從 data.json 讀取 (可能是 Supabase URL 或 B2 key)
            photo_url: item.photo_url ?? null,
            created_at: item.created_at ?? new Date().toISOString(),
            updated_at: item.updated_at ?? new Date().toISOString(),
          }, { onConflict: 'id' });
        if (itemError) throw itemError;
      }

      // Step 5: 不需上傳照片 (Strategy 2: 照片留在 B2)
      await send({ status: 'finalizing', message: '完成還原 (照片已在 B2)...' });

      // 從 data.json 計算照片總大小
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
      const photoCount = dataJsonItems.filter((item: any) => item.photo_url).length;
      await safeLog(manifestId!, 'restore', 'manual', 'success', `Successfully restored manifest with ${dataJsonItems.length} items and ${photoCount} photos (B2 keys restored)`);

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