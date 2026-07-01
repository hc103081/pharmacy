'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';

export interface ResetDrugResponse {
  success: boolean;
  error?: string;
}

/**
 * 將藥品清點狀態重置為 pending，清除實際數量和照片
 */
export async function resetDrugStatus(drugId: string): Promise<ResetDrugResponse> {
  try {
    const supabaseServer = await createClient();
    const { data: { user }, error: userError } = await supabaseServer.auth.getUser();

    if (userError) {
      return { success: false, error: `認證錯誤: ${userError.message}` };
    }
    if (!user) {
      return { success: false, error: '未登入或登入已過期，請重新登入' };
    }

    const { data: drug, error: drugError } = await getSupabaseAdmin()
      .from('drug_items')
      .select('manifest_id')
      .eq('id', drugId)
      .single();

    if (drugError || !drug) {
      return { success: false, error: '找不到該藥品' };
    }

    const { data: manifest, error: manifestError } = await getSupabaseAdmin()
      .from('manifests')
      .select('user_id')
      .eq('id', drug.manifest_id)
      .single();

    if (manifestError || !manifest) {
      return { success: false, error: '找不到所屬清單' };
    }
    if (manifest.user_id !== user.id) {
      return { success: false, error: '無權限操作此藥品' };
    }

    const { error: updateError } = await getSupabaseAdmin()
      .from('drug_items')
      .update({
        counted_status: 'pending',
        actual_quantity: 0,
        photo_url: null,
      })
      .eq('id', drugId);

    if (updateError) {
      return { success: false, error: `重置失敗: ${updateError.message}` };
    }

    return { success: true };
  } catch (error: unknown) {
    console.error('Reset Drug Status Error:', error);
    const errorMessage = error instanceof Error ? error.message : '重置狀態失敗，未知錯誤';
    return { success: false, error: errorMessage };
  }
}
