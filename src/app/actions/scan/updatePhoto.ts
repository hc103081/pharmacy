'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';

export interface UpdatePhotoResponse {
  success: boolean;
  error?: string;
}

/**
 * 更新藥品清點狀態、實際數量與照片 URL (使用 RPC 原子化操作)
 */
export async function updateDrugStatus(
  drugId: string, 
  photoUrl: string | null, 
  actualQuantity: number
): Promise<UpdatePhotoResponse> {
  try {
    // 1. 獲取當前使用者 ID (Server Side)
    const supabaseServer = await createClient();
    const { data: { user }, error: userError } = await supabaseServer.auth.getUser();

    if (userError) {
      return { success: false, error: `認證錯誤: ${userError.message}` };
    }
    if (!user) {
      return { success: false, error: '未登入或登入已過期，請重新登入' };
    }

    // 2. 使用 RPC 原子化地完成：檢查權限 -> 計算狀態 -> 更新資料
    const { error: rpcError } = await getSupabaseAdmin().rpc('update_drug_status_with_photo', {
      p_drug_id: drugId,
      p_photo_url: photoUrl,
      p_actual_quantity: actualQuantity,
      p_user_id: user.id,
    });

    if (rpcError) {
      return { success: false, error: `更新失敗: ${rpcError.message}` };
    }

    return { success: true };
  } catch (error: unknown) {
    console.error('Update Status Error:', error);
    const errorMessage = error instanceof Error ? error.message : '更新狀態失敗，未知錯誤';
    return { success: false, error: errorMessage };
  }
}
