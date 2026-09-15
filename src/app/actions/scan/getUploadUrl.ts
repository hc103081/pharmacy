'use server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createPresignedUploadUrl, getPhotoKey } from '@/lib/b2';

export interface GetUploadUrlResponse {
  success: boolean;
  uploadUrl?: string;
  key?: string;
  publicUrl?: string; // 預覽用 URL (需再呼叫 getViewUrl 取得)
  error?: string;
}

/**
 * 取得 B2 上傳用 Presigned URL
 * 驗證：用戶登入、manifest 擁有權、manifest 狀態 active
 */
export async function getPresignedUploadUrl(
  manifestId: string,
  barcode: string,
  pageNumber: number,
  fileExt: string = 'jpg'
): Promise<GetUploadUrlResponse> {
  // 1. 驗證用戶登入
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: '未登入或登入已過期' };
  }

  // 2. 驗證 manifest 擁有權 + 狀態 active
  const { data: manifest, error: manifestError } = await getSupabaseAdmin()
    .from('manifests')
    .select('id, user_id, status')
    .eq('id', manifestId)
    .single();

  if (manifestError || !manifest) {
    return { success: false, error: '清單不存在' };
  }
  if (manifest.user_id !== user.id) {
    return { success: false, error: '無權限存取此清單' };
  }
  if (manifest.status !== 'active') {
    return { success: false, error: '清單已封存，不可上傳' };
  }

  // 3. 產生儲存路徑 key
  const key = await getPhotoKey(manifestId, pageNumber, barcode, fileExt);

  // 4. 產生 Presigned URL
  try {
    const { uploadUrl } = await createPresignedUploadUrl(key, 'image/jpeg', 3600); // 1小時
    return { success: true, uploadUrl, key };
  } catch (err) {
    console.error('Presign upload error:', err);
    return { success: false, error: '產生上傳連結失敗' };
  }
}