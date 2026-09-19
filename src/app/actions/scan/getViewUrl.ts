'use server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createPresignedViewUrl } from '@/lib/b2';
import { extractB2KeyFromUrl } from '@/lib/b2-utils';

export interface GetViewUrlResponse {
  success: boolean;
  viewUrl?: string;
  error?: string;
}

/**
 * 取得照片預覽/下載 URL
 * 支援三種輸入格式：
 * 1. Supabase public URL (舊資料) - 直接回傳
 * 2. B2 key 相對路徑 (新資料) - 產生 presigned URL
 * 3. B2 public URL - 解析 key 後產生 presigned URL
 */
export async function getPresignedViewUrl(
  manifestId: string,
  photoKeyOrUrl: string,
  expiresIn: number = 3600,
  responseContentDisposition?: 'inline' | 'attachment'
): Promise<GetViewUrlResponse> {
  // 1. 驗證用戶登入
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: '未登入或登入已過期' };
  }

  // 2. 驗證 manifest 擁有權 + 取得 storage_provider
  const { data: manifest, error: manifestError } = await getSupabaseAdmin()
    .from('manifests')
    .select('id, user_id, storage_provider')
    .eq('id', manifestId)
    .single();

  if (manifestError || !manifest) {
    return { success: false, error: '清單不存在' };
  }
  if (manifest.user_id !== user.id) {
    return { success: false, error: '無權限存取此清單' };
  }

  // 3. 判斷儲存來源：優先看 manifest.storage_provider，其次看 photo_url 格式
  const manifestProvider = manifest.storage_provider || 'supabase';
  const isB2Provider = manifestProvider === 'b2';

  // 4. 處理邏輯：優先嘗試 B2，失敗才回退 Supabase
  let viewUrl: string;

  if (photoKeyOrUrl.startsWith('http')) {
    // 完整 URL 格式
    if (photoKeyOrUrl.includes('supabase.co')) {
      // Supabase URL：若 manifest 是 b2，嘗試轉為 B2 key 查找
      if (isB2Provider) {
        const storagePath = photoKeyOrUrl.replace(/.*\/storage\/v1\/object\/public\/drug-photos\//, '');
        if (storagePath && storagePath !== photoKeyOrUrl) {
          try {
            viewUrl = await createPresignedViewUrl(storagePath, expiresIn, responseContentDisposition);
            return { success: true, viewUrl };
          } catch {
            // B2 找不到，回退 Supabase URL
            viewUrl = photoKeyOrUrl;
          }
        } else {
          viewUrl = photoKeyOrUrl;
        }
      } else {
        viewUrl = photoKeyOrUrl;
      }
    } else if (photoKeyOrUrl.includes('backblazeb2.com') || photoKeyOrUrl.includes('b2.cloud')) {
      // B2 public URL - 解析 key 後產生 presigned URL
      const extracted = extractB2KeyFromUrl(photoKeyOrUrl);
      if (!extracted) {
        return { success: false, error: '無法解析 B2 照片路徑' };
      }
      viewUrl = await createPresignedViewUrl(extracted, expiresIn, responseContentDisposition);
    } else {
      // 未知域名，嘗試當作 B2 key 解析
      const extracted = extractB2KeyFromUrl(photoKeyOrUrl);
      if (extracted) {
        viewUrl = await createPresignedViewUrl(extracted, expiresIn, responseContentDisposition);
      } else {
        viewUrl = photoKeyOrUrl;
      }
    }
  } else {
    // 相對路徑 (photos/...) - 視為 B2 key
    viewUrl = await createPresignedViewUrl(photoKeyOrUrl, expiresIn, responseContentDisposition);
  }

  return { success: true, viewUrl };
}

/**
 * 批次取得多張照片的預覽 URL (用於 ErrorDrawer、總結報告等)
 */
export async function getBatchPresignedViewUrls(
  manifestId: string,
  photoKeysOrUrls: string[],
  expiresIn: number = 3600
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  
  // 並行處理，但限制並發數
  const CONCURRENCY = 5;
  for (let i = 0; i < photoKeysOrUrls.length; i += CONCURRENCY) {
    const batch = photoKeysOrUrls.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (photoKeyOrUrl) => {
      const res = await getPresignedViewUrl(manifestId, photoKeyOrUrl, expiresIn);
      return { original: photoKeyOrUrl, url: res.success ? res.viewUrl : null };
    });
    const results = await Promise.all(promises);
    for (const r of results) {
      if (r.url) result[r.original] = r.url;
    }
  }
  
  return result;
}