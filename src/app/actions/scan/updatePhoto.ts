'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export interface UpdatePhotoResponse {
  success: boolean;
  error?: string;
}

/**
 * 更新藥品清點狀態、實際數量與照片 URL
 */
export async function updateDrugStatus(
  drugId: string, 
  photoUrl: string, 
  actualQuantity: number
): Promise<UpdatePhotoResponse> {
  try {
    // 1. 獲取預期數量以確定狀態
    const { data: drug, error: fetchError } = await supabaseAdmin
      .from('drug_items')
      .select('expected_quantity')
      .eq('id', drugId)
      .single();

    if (fetchError || !drug) throw new Error('找不到該藥品項目');

    const status = actualQuantity === drug.expected_quantity ? 'completed' : 'error';

    // 2. 更新資料庫
    const { error: updateError } = await supabaseAdmin
      .from('drug_items')
      .update({
        counted_status: status,
        photo_url: photoUrl,
        actual_quantity: actualQuantity,
        updated_at: new Date().toISOString(),
      })
      .eq('id', drugId);

    if (updateError) throw updateError;

    return { success: true };
  } catch (error: any) {
    console.error('Update Status Error:', error);
    return { 
      success: false, 
      error: error.message || '更新狀態失敗' 
    };
  }
}
