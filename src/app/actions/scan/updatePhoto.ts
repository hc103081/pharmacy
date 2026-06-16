'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
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
  photoUrl: string, 
  actualQuantity: number
): Promise<UpdatePhotoResponse> {
  try {
    // 1. 獲取當前使用者 ID (Server Side)
    const supabaseServer = await createClient();
    const { data: { user }, error: userError } = await supabaseServer.auth.getUser();
    
    if (userError || !user) throw new Error('未取得使用者認證資訊');
    const userId = user.id;

    // 2. 使用 RPC 原子化地完成：檢查權限 -> 計算狀態 -> 更新資料
    const { error: rpcError } = await supabaseAdmin.rpc('update_drug_status_with_photo', {
      p_drug_id: drugId,
      p_photo_url: photoUrl,
      p_actual_quantity: actualQuantity,
      p_user_id: userId,
    });

    if (rpcError) throw rpcError;

    return { success: true };
  } catch (error: unknown) {
    console.error('Update Status Error:', error);
    let errorMessage = '更新狀態失敗';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return { 
      success: false, 
      error: errorMessage 
    };
  }
}
