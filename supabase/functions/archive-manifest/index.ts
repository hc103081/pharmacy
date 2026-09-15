import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-expect-error: Deno std module not typed
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// Deno-native ZIP library (Supabase 官方推薦)
import { JSZip } from 'https://deno.land/x/jszip/mod.ts';

console.log('archive-manifest boot (v4 - Strategy 2: B2 photos stay in place)');

declare const Deno: any;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// B2 環境變數 (需在 Supabase Dashboard 設定)
const B2_KEY_ID = Deno.env.get('B2_KEY_ID')!;
const B2_APP_KEY = Deno.env.get('B2_APP_KEY')!;
const B2_BUCKET = Deno.env.get('B2_BUCKET')!;
const B2_REGION = Deno.env.get('B2_REGION')!;
const B2_ENDPOINT = `https://s3.${B2_REGION}.backblazeb2.com`;

const ARCHIVED_MANIFESTS_BUCKET = 'archived-manifests';
const MAX_PHOTO_TOTAL_SIZE = 200 * 1024 * 1024; // 200MB (僅計算大小，不實際打包)
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

// AWS Signature V4 for B2 (Deno 相容) - 完整實作
async function b2HeadObject(key: string): Promise<{ size: number; lastModified: string } | null> {
  const url = `${B2_ENDPOINT}/${B2_BUCKET}/${encodeURIComponent(key)}`;
  const now = new Date();
  const dateStamp = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStr = dateStamp.slice(0, 8);
  const host = new URL(B2_ENDPOINT).host;
  
  // HMAC-SHA256 helper
  async function hmacSha256(key: Uint8Array, data: string): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey(
      'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data)));
  }
  
  // 計算 SHA256 hex
  async function sha256Hex(data: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  // 簽名流程
  const canonicalRequest = [
    'HEAD',
    `/${B2_BUCKET}/${encodeURIComponent(key)}`,
    '',
    `host:${host}`,
    `x-amz-date:${dateStamp}`,
    '',
    'host;x-amz-date',
    'UNSIGNED-PAYLOAD'
  ].join('\n');
  
  const credentialScope = `${dateStr}/${B2_REGION}/s3/aws4_request`;
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    dateStamp,
    credentialScope,
    hashedCanonicalRequest
  ].join('\n');
  
  // Derive signing key
  const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${B2_APP_KEY}`), dateStr);
  const kRegion = await hmacSha256(kDate, B2_REGION);
  const kService = await hmacSha256(kRegion, 's3');
  const kSigning = await hmacSha256(kService, 'aws4_request');
  
  const signature = await hmacSha256(kSigning, stringToSign);
  const signatureHex = Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');
  
  const authorization = `AWS4-HMAC-SHA256 Credential=${B2_KEY_ID}/${credentialScope}, SignedHeaders=host;x-amz-date, Signature=${signatureHex}`;
  
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'Authorization': authorization,
        'x-amz-date': dateStamp,
        'host': host,
      },
    });
    if (response.ok) {
      return {
        size: parseInt(response.headers.get('content-length') || '0'),
        lastModified: response.headers.get('last-modified') || now.toISOString(),
      };
    }
    console.warn(`B2 HEAD failed for ${key}: ${response.status}`);
  } catch (err) {
    console.warn(`B2 HEAD error for ${key}:`, err);
  }
  return null;
}

// 獲取 B2 檔案大小 (帶緩存)
const b2SizeCache = new Map<string, number>();
async function getB2FileSize(key: string): Promise<number> {
  if (b2SizeCache.has(key)) return b2SizeCache.get(key)!;
  
  const result = await b2HeadObject(key);
  const size = result?.size || 100 * 1024; // fallback 100KB
  b2SizeCache.set(key, size);
  return size;
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
        .select('id, manifest_id, page_number, item_order, barcode, product_code, name, expected_quantity, bonus_quantity, actual_quantity, counted_status, photo_url, storage_location, category')
        .eq('manifest_id', manifestId);

      if (itemsError) throw itemsError;

      if (!drugItems || drugItems.length === 0) {
        await supabase
          .from('manifests')
          .update({ status: 'archived', archive_status: 'archived', archive_locked_at: null, archived_at: new Date().toISOString() })
          .eq('id', manifestId);
        await send({ status: 'completed', message: '沒有藥品項目，已直接標記為封存' });
        writer.close();
        return;
      }

      // Step 3: Count photos (Strategy 2: 照片留在 B2，只記錄 key 和大小)
      const photoItems = drugItems.filter((item: any) => item.photo_url);
      const photoCount = photoItems.length;

      await send({
        status: 'estimating_photos',
        message: `找到 ${drugItems.length} 個藥品項目，${photoCount} 個有照片 (Strategy 2: 照片留在 B2)`
      });

      // Step 4: Create data.json content - 保留 B2 key，不下載照片
      await send({ status: 'preparing_data', message: '準備資料 JSON (查詢 B2 實際大小)...' });
      
      // 從 photo_url 解析 B2 key
      function extractB2Key(photoUrl: string): string | null {
        if (!photoUrl) return null;
        // Supabase URL: https://xxx.supabase.co/storage/v1/object/public/drug-photos/photos/...
        if (photoUrl.includes('supabase.co')) {
          try {
            const url = new URL(photoUrl);
            const prefix = '/storage/v1/object/public/drug-photos/';
            if (url.pathname.startsWith(prefix)) {
              return url.pathname.slice(prefix.length);
            }
          } catch {}
          return null;
        }
        // B2 public URL: https://bucket.region.backblazeb2.com/file/bucket/photos/...
        if (photoUrl.includes('backblazeb2.com') || photoUrl.includes('b2.cloud')) {
          try {
            const url = new URL(photoUrl);
            const parts = url.pathname.split('/');
            const fileIdx = parts.indexOf('file');
            if (fileIdx !== -1 && fileIdx + 2 < parts.length) {
              return parts.slice(fileIdx + 2).join('/');
            }
            if (url.pathname.startsWith('/photos/')) {
              return url.pathname.slice(1);
            }
          } catch {}
          return null;
        }
        // 已經是 B2 key (相對路徑): photos/...
        if (photoUrl.startsWith('photos/')) {
          return photoUrl;
        }
        return null;
      }
      
      // 先收集所有 B2 keys，並行查詢大小
      const photoKeys = drugItems
        .map(item => extractB2Key(item.photo_url || ''))
        .filter((k): k is string => !!k);
      
      const uniqueKeys = [...new Set(photoKeys)];
      await send({ status: 'fetching_sizes', message: `查詢 ${uniqueKeys.length} 張照片實際大小...` });
      
      // 並行查詢 (限制並發)
      const sizeMap = new Map<string, number>();
      const CONCURRENCY = 10;
      for (let i = 0; i < uniqueKeys.length; i += CONCURRENCY) {
        const batch = uniqueKeys.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (key) => ({ key, size: await getB2FileSize(key) }))
        );
        for (const { key, size } of results) {
          sizeMap.set(key, size);
        }
      }
      
      let totalPhotoSize = 0;
      const dataJsonItems = drugItems.map((item: any) => {
        const b2Key = extractB2Key(item.photo_url || '');
        const fileSizeBytes = b2Key ? (sizeMap.get(b2Key) || 100 * 1024) : 0;
        totalPhotoSize += fileSizeBytes;
        
        return {
          id: item.id,
          manifest_id: item.manifest_id,
          page_number: item.page_number,
          item_order: item.item_order,
          barcode: item.barcode,
          product_code: item.product_code ?? null,
          name: item.name,
          expected_quantity: item.expected_quantity,
          bonus_quantity: item.bonus_quantity,
          actual_quantity: item.actual_quantity,
          counted_status: item.counted_status,
          storage_location: item.storage_location ?? null,
          category: item.category ?? null,
          photo_url: item.photo_url, // 直接保留原本的 photo_url (Supabase URL 或 B2 key)
          file_size_bytes: fileSizeBytes,
        };
      });

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

      // Step 5: Create ZIP (只包含 data.json，不含照片)
      await send({ status: 'creating_zip', message: '建立 ZIP 檔案 (僅資料)...' });
      const zip = new JSZip();
      zip.addFile('data.json', new TextEncoder().encode(JSON.stringify(dataJsonItems, null, 2)));

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
          storage_size_bytes: zipArrayBuffer.byteLength, // ZIP 大小 (不含照片)
          archived_at: new Date().toISOString(),
        })
        .eq('id', manifestId);

      if (updateError) throw updateError;

      // Step 8: 不刪除 B2 照片 (Strategy 2)
      await send({ status: 'completed', message: '封存完成 (照片保留在 B2)' });

      await safeLog(manifestId!, 'archive', trigger, 'success', `Successfully archived manifest with ${drugItems.length} items and ${photoCount} photos (kept in B2)`);
      writer.close();
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
      writer.close();
    }
  })();

  return new Response(transformStream.readable, { headers });
});