'use server';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { listB2ObjectsWithPrefix } from '@/lib/b2';

export interface B2UsageInfo {
  manifestUsage: number;
  manifestFileCount: number;
  bucketTotalUsage: number;
  bucketTotalFiles: number;
  bucketFreeSpace: number;
}

export interface GetB2UsageResponse {
  success: boolean;
  data?: B2UsageInfo;
  error?: string;
}

/**
 * 取得 B2 容量使用情況
 * 1. 驗證用戶身份
 * 2. 檢查 Manifest 擁有權
 * 3. 從 DB 讀取 manifest 儲存用量
 * 4. 統計 drug_items 照片數
 * 5. 掃描 B2 Bucket 總量
 */
export async function getB2Usage(manifestId: string): Promise<GetB2UsageResponse> {
  try {
    // 1. 獲取當前使用者 ID
    const supabaseServer = await createClient();
    const { data: { user }, error: userError } = await supabaseServer.auth.getUser();

    if (userError || !user) {
      return { success: false, error: '未登入或登入已過期，請重新登入' };
    }

    // 2. 驗證 Manifest 擁有權
    const { data: manifest, error: manifestError } = await getSupabaseAdmin()
      .from('manifests')
      .select('id, user_id, storage_size_bytes')
      .eq('id', manifestId)
      .single();

    if (manifestError || !manifest) {
      return { success: false, error: '找不到指定的清單' };
    }

    if (manifest.user_id !== user.id) {
      return { success: false, error: '無權限存取此清單' };
    }

    // 3. 從 DB 讀取 manifest 用量
    const manifestUsage = manifest.storage_size_bytes || 0;

    // 4. 統計 drug_items 照片數（有 photo_url 的項目數）
    const { count: photoCount, error: countError } = await getSupabaseAdmin()
      .from('drug_items')
      .select('id', { count: 'exact', head: true })
      .eq('manifest_id', manifestId)
      .not('photo_url', 'is', null);

    if (countError) {
      console.error('[getB2Usage] Failed to count photos:', countError);
      return { success: false, error: `統計照片數失敗: ${countError.message}` };
    }

    const manifestFileCount = photoCount || 0;

    // 5. 掃描 B2 Bucket 總量
    const allObjects = await listB2ObjectsWithPrefix('', 1000);
    const bucketTotalFiles = allObjects.length;
    const bucketTotalUsage = allObjects.reduce((sum, obj) => sum + obj.size, 0);

    // 6. 計算剩餘空間 (B2 免費額度 10GB = 10 * 1024^3 bytes)
    const B2_FREE_TIER_BYTES = 10 * 1024 * 1024 * 1024; // 10GB
    const bucketFreeSpace = Math.max(B2_FREE_TIER_BYTES - bucketTotalUsage, 0);

    return {
      success: true,
      data: {
        manifestUsage,
        manifestFileCount,
        bucketTotalUsage,
        bucketTotalFiles,
        bucketFreeSpace,
      },
    };
  } catch (error: unknown) {
    console.error('[getB2Usage] Error:', error);
    const errorMessage = error instanceof Error ? error.message : '取得 B2 容量資訊失敗';
    return { success: false, error: errorMessage };
  }
}