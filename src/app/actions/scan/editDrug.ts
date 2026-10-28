'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { createClient } from '@/lib/supabase/server';
import type { DrugItem } from '@/types';

export interface EditDrugResponse {
  success: boolean;
  error?: string;
  data?: DrugItem;
}

interface EditDrugInput {
  drugId: string;
  updates: {
    name?: string;
    barcode?: string;
    product_code?: string | null;
    expected_quantity?: number;
    warehouse_quantity?: number | null;
    storage_location?: string;
    category?: string;
  };
}

/**
 * 編輯藥品基本資料 (名稱、條碼、預期數量、儲位、類別等)
 * 僅允許 counted_status === 'pending' 的藥品編輯
 */
export async function editDrug(input: EditDrugInput): Promise<EditDrugResponse> {
  try {
    // 1. 獲取當前使用者 ID
    const supabaseServer = await createClient();
    const { data: { user }, error: userError } = await supabaseServer.auth.getUser();

    if (userError) {
      return { success: false, error: `認證錯誤: ${userError.message}` };
    }
    if (!user) {
      return { success: false, error: '未登入或登入已過期，請重新登入' };
    }

    // 2. 取得藥品資料並檢查權限
    const { data: drug, error: drugError } = await getSupabaseAdmin()
      .from('drug_items')
      .select('manifest_id, counted_status')
      .eq('id', input.drugId)
      .single();

    if (drugError || !drug) {
      return { success: false, error: '找不到該藥品' };
    }

    // 3. 檢查清單擁有者權限
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

    // 4. 僅允許 pending 狀態編輯
    if (drug.counted_status !== 'pending') {
      return { success: false, error: '僅未清點狀態的藥品可編輯' };
    }

    // 5. 準備更新資料 (過濾 undefined)
    const updateData: Record<string, unknown> = {};
    const allowedFields = ['name', 'barcode', 'product_code', 'expected_quantity', 'warehouse_quantity', 'storage_location', 'category'] as const;

    for (const field of allowedFields) {
      const value = input.updates[field];
      if (value !== undefined) {
        updateData[field] = value;
      }
    }

    // 基本驗證
    if (updateData.name !== undefined && !updateData.name?.toString().trim()) {
      return { success: false, error: '藥品名稱不可為空' };
    }
    if (updateData.barcode !== undefined && !updateData.barcode?.toString().trim()) {
      return { success: false, error: '條碼不可為空' };
    }
    if (updateData.expected_quantity !== undefined && (typeof updateData.expected_quantity !== 'number' || updateData.expected_quantity < 0)) {
      return { success: false, error: '預期數量必須為非負整數' };
    }
    if (updateData.warehouse_quantity !== undefined && updateData.warehouse_quantity !== null && (typeof updateData.warehouse_quantity !== 'number' || updateData.warehouse_quantity < 0)) {
      return { success: false, error: '倉庫數量必須為非負整數' };
    }

    updateData.updated_at = new Date().toISOString();

    // 6. 更新資料庫並返回完整資料
    const { data: updatedDrug, error: updateError } = await getSupabaseAdmin()
      .from('drug_items')
      .update(updateData)
      .eq('id', input.drugId)
      .select('id, manifest_id, page_number, name, barcode, product_code, actual_quantity, expected_quantity, warehouse_quantity, storage_location, category, bonus_quantity, counted_status, item_order, photo_url')
      .single();

    if (updateError) {
      return { success: false, error: `更新失敗: ${updateError.message}` };
    }

    return { success: true, data: updatedDrug as DrugItem };
  } catch (error: unknown) {
    console.error('Edit Drug Error:', error);
    const errorMessage = error instanceof Error ? error.message : '編輯藥品失敗，未知錯誤';
    return { success: false, error: errorMessage };
  }
}