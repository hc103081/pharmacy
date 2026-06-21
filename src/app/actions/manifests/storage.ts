'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * 照片上傳後遞增儲存大小
 * 透過 RPC 原子操作，防止併發寫入問題
 */
export async function incrementStorageSize(
  manifestId: string,
  fileSizeBytes: number,
): Promise<void> {
  try {
    const { error } = await supabaseAdmin.rpc('increment_manifest_storage_size', {
      p_manifest_id: manifestId,
      p_delta: fileSizeBytes,
    });
    if (error) {
      console.error('incrementStorageSize error:', error);
    }
  } catch (err) {
    console.error('incrementStorageSize error:', err);
  }
}

/**
 * 從 photoUrl 解析 drug-photos bucket 中的相對路徑
 */
function extractStoragePath(photoUrl: string): string | null {
  try {
    const urlObj = new URL(photoUrl);
    const pathWithBucket = urlObj.pathname.replace('/storage/v1/object/public/', '');
    const pathParts = pathWithBucket.split('/');
    // 格式：drug-photos/photos/2026/06/21/manifestId/page/barcode_timestamp.jpg
    // pathWithBucket = "drug-photos/photos/..."
    // 需要 slice(1) 去掉 bucket 名稱
    if (pathParts.length > 1) {
      return pathParts.slice(1).join('/');
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 照片刪除時遞減儲存大小（後端自行查 Storage info 取得大小）
 * 1. 從 photoUrl 解析 storage path
 * 2. 查詢 Storage 取得 contentLength
 * 3. 透過 RPC 原子遞減
 */
export async function decrementStorageSize(
  manifestId: string,
  photoUrl: string,
): Promise<void> {
  try {
    const path = extractStoragePath(photoUrl);
    if (!path) return;

    // 查詢 Storage 取得檔案大小
    const { data, error: infoError } = await supabaseAdmin.storage
      .from('drug-photos')
      .info(path);

    if (infoError || !data) {
      console.warn('decrementStorageSize: 無法取得檔案資訊，跳過更新', infoError);
      return;
    }

    const contentLength =
      (data as any).contentLength ?? (data as any).metadata?.size ?? 0;
    if (contentLength <= 0) return;

    const { error } = await supabaseAdmin.rpc('decrement_manifest_storage_size', {
      p_manifest_id: manifestId,
      p_delta: contentLength,
    });

    if (error) {
      console.error('decrementStorageSize RPC error:', error);
    }
  } catch (err) {
    console.error('decrementStorageSize error:', err);
  }
}

/**
 * 直接設定儲存大小（用於封存/還原 Edge Function 呼叫）
 */
export async function setManifestStorageSize(
  manifestId: string,
  bytes: number,
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('manifests')
      .update({ storage_size_bytes: bytes, updated_at: new Date().toISOString() })
      .eq('id', manifestId);

    if (error) {
      console.error('setManifestStorageSize error:', error);
    }
  } catch (err) {
    console.error('setManifestStorageSize error:', err);
  }
}
