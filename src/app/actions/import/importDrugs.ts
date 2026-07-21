'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { mergeByBarcode } from '@/lib/barcodeMerge';
import { batchLookupNhi } from '@/lib/nhi';
import type { ImportDrugItem, ImportResponse, ImportOptions } from './types';

/**
 * 匯入藥品清單到資料庫（含 NHI 中文名稱查詢、分頁、RPC 原子化寫入）
 */
export async function importDrugs(
  manifestName: string,
  drugs: ImportDrugItem[],
  userId: string,
  options: ImportOptions = {}
): Promise<ImportResponse> {
  try {
    console.log('[importDrugs] 開始', { manifestName, drugsCount: drugs.length, userId });
    if (!drugs || drugs.length === 0) {
      return { success: false, error: '藥品清單不能為空' };
    }

    // 0. 合併相同條碼的項目（數量疊加，保留 storage_location 和 category）
    // 使用共用的 mergeByBarcode 工具，可透過 options.mergeByBarcode 停用
    const mergedDrugs = options.mergeByBarcode !== false ? mergeByBarcode(drugs) : drugs;
    console.log('[importDrugs] 合併後藥品數:', mergedDrugs.length);

    // 0.5. NHI 藥品中文名稱查詢與替換
    console.log('[importDrugs] 開始 NHI 查詢...');
    const barcodes = mergedDrugs
      .map(d => d.product_code?.trim() || d.barcode?.trim())
      .filter((b): b is string => !!b);
    const nhiMap = await batchLookupNhi(barcodes);
    console.log('[importDrugs] NHI 查詢完成，找到:', nhiMap.size);

    const drugsWithChineseName = mergedDrugs.map(drug => {
      const chineseName = drug.product_code?.trim() 
        ? nhiMap.get(drug.product_code.trim()) 
        : drug.barcode?.trim() ? nhiMap.get(drug.barcode.trim()) : undefined;
      return chineseName ? { ...drug, name: chineseName } : drug;
    });

    // 1. 建構明細資料（分頁與排序）
    const ITEMS_PER_PAGE = 44;
    const drugItemsToInsert = drugsWithChineseName.map((drug, index) => {
      const itemOrder = index + 1;
      const pageNumber = Math.ceil(itemOrder / ITEMS_PER_PAGE);

      return {
        item_order: itemOrder,
        page_number: pageNumber,
        barcode: drug.barcode,
        product_code: drug.product_code ?? null,
        name: drug.name,
        expected_quantity: drug.expected_quantity,
        warehouse_quantity: drug.warehouse_quantity ?? null,
        bonus_quantity: 0,
        storage_location: drug.storage_location || '',
        category: drug.category || '',
      };
    });
    console.log('[importDrugs] 準備插入項目數:', drugItemsToInsert.length);
    console.log('[importDrugs] 第一項範例:', drugItemsToInsert[0]);

    // 2. 原子化寫入：單一 RPC 交易同時建立 manifest + drug_items
    console.log('[importDrugs] 呼叫 RPC create_manifest_with_items...');
    const { data: manifestId, error: rpcError } = await getSupabaseAdmin().rpc('create_manifest_with_items', {
      p_manifest: {
        name: manifestName,
        order_number: options.order_number ?? '',
        delivery_date: options.delivery_date ?? '',
        source_file: options.source_file ?? '',
        total_items: drugItemsToInsert.length,
        user_id: userId,
        source_images: options.source_images ?? [],
      },
      p_items: drugItemsToInsert,
      p_user_id: userId,
    });

    console.log('[importDrugs] RPC 回傳:', { manifestId, rpcError });

    if (rpcError || !manifestId) {
      throw new Error(`匯入清單失敗: ${rpcError?.message ?? 'RPC 未回傳 manifestId'}`);
    }

    return {
      success: true,
      manifestId: manifestId as string,
      totalItems: drugsWithChineseName.length,
    };

  } catch (error: unknown) {
      console.error('[importDrugs] Import Error:', error);
      let errorMessage = '發生未知錯誤';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      return {
        success: false,
        error: errorMessage,
      };
    }
}