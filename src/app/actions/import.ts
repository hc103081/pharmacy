'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export interface ImportDrugItem {
  barcode: string;
  name: string;
  expected_quantity: number;
}

export interface ImportResponse {
  success: boolean;
  manifestId?: string;
  error?: string;
  totalItems?: number;
}

/**
 * 匯入藥品清單並實作 44 項一頁的邏輯分頁
 */
export async function importDrugs(manifestName: string, drugs: ImportDrugItem[]): Promise<ImportResponse> {
  try {
    if (!drugs || drugs.length === 0) {
      return { success: false, error: '藥品清單不能為空' };
    }

    // 1. 建立 Manifest (清單批號)
    const { data: manifest, error: manifestError } = await supabaseAdmin
      .from('manifests')
      .insert({
        name: manifestName,
        total_items: drugs.length,
        status: 'active',
      })
      .select()
      .single();

    if (manifestError || !manifest) {
      throw new Error(`建立清單失敗: ${manifestError?.message}`);
    }

    // 2. 實作 44 項邏輯分頁
    const ITEMS_PER_PAGE = 44;
    const drugItemsToInsert = drugs.map((drug, index) => {
      const pageNumber = Math.floor(index / ITEMS_PER_PAGE) + 1;
      return {
        manifest_id: manifest.id,
        page_number: pageNumber,
        barcode: drug.barcode,
        name: drug.name,
        expected_quantity: drug.expected_quantity,
        counted_status: 'pending',
      };
    });

    // 3. 批量寫入資料庫
    const { error: insertError } = await supabaseAdmin
      .from('drug_items')
      .insert(drugItemsToInsert);

    if (insertError) {
      throw new Error(`批量匯入藥品失敗: ${insertError.message}`);
    }

    return {
      success: true,
      manifestId: manifest.id,
      totalItems: drugs.length,
    };

  } catch (error: any) {
    console.error('Import Error:', error);
    return {
      success: false,
      error: error.message || '發生未知錯誤',
    };
  }
}
