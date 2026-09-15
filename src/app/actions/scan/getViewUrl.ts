'use server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createPresignedViewUrl, getB2KeyFromUrl } from '@/lib/b2';

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

  // 2. 驗證 manifest 擁有權
  const { data: manifest, error: manifestError } = await getSupabaseAdmin()
    .from('manifests')
    .select('id, user_id')
    .eq('id', manifestId)
    .single();

  if (manifestError || !manifest) {
    return { success: false, error: '清單不存在' };
  }
  if (manifest.user_id !== user.id) {
    return { success: false, error: '無權限存取此清單' };
  }

  // 3. 判斷格式並處理
  let viewUrl: string;

  if (photoKeyOrUrl.startsWith('http')) {
    // 完整 URL：可能是 Supabase 或 B2
    if (photoKeyOrUrl.includes('supabase.co')) {
      // Supabase public URL - 直接使用，不需簽名
      viewUrl = photoKeyOrUrl;
    } else if (photoKeyOrUrl.includes('backblazeb2.com') || photoKeyOrUrl.includes('b2.cloud')) {
      // B2 public URL - 解析 key 後產生 presigned URL
      const extracted = await getB2KeyFromUrl(photoKeyOrUrl);
      if (!extracted) {
        return { success: false, error: '無法解析 B2 照片路徑' };
      }
      viewUrl = await createPresignedViewUrl(extracted, expiresIn, responseContentDisposition);
    } else {
      // 未知域名，嘗試當作 B2 key 解析
      const extracted = await getB2KeyFromUrl(photoKeyOrUrl);
      if (extracted) {
        viewUrl = await createPresignedViewUrl(extracted, expiresIn, responseContentDisposition);
      } else {
        // 兜底：直接回傳原 URL
        viewUrl = photoKeyOrUrl;
      }
    }
  } else {
    // 相對路徑 - 視為 B2 key，產生 presigned URL
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