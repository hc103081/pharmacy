'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
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

    if (userError || !user) throw new Error('未取得使用者認證資訊');

    // 取得藥品資訊以驗證權限（透過 manifest owner 檢查）
    const { data: drug, error: drugError } = await supabaseAdmin
      .from('drug_items')
      .select('manifest_id')
      .eq('id', drugId)
      .single();

    if (drugError || !drug) throw new Error('找不到該藥品');

    const { data: manifest, error: manifestError } = await supabaseAdmin
      .from('manifests')
      .select('user_id')
      .eq('id', drug.manifest_id)
      .single();

    if (manifestError || !manifest) throw new Error('找不到所屬清單');
    if (manifest.user_id !== user.id) throw new Error('無權限操作此藥品');

    const { error: updateError } = await supabaseAdmin
      .from('drug_items')
      .update({
        counted_status: 'pending',
        actual_quantity: 0,
        photo_url: null,
      })
      .eq('id', drugId);

    if (updateError) throw updateError;

    return { success: true };
  } catch (error: unknown) {
    console.error('Reset Drug Status Error:', error);
    let errorMessage = '重置狀態失敗';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return {
      success: false,
      error: errorMessage,
    };
  }
}