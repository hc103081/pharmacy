'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export interface UpdatePhotoResponse {
  success: boolean;
  error?: string;
}

/**
 * 更新藥品清點狀態並儲存照片 URL
 */
export async function updateDrugStatus(drugId: string, photoUrl: string): Promise<UpdatePhotoResponse> {
  try {
    const { error } = await supabaseAdmin
      .from('drug_items')
      .update({
        counted_status: 'completed',
        photo_url: photoUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', drugId);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error('Update Status Error:', error);
    return { 
      success: false, 
      error: error.message || '更新狀態失敗' 
    };
  }
}
