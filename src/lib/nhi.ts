'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * 批次查詢 NHI 藥品中文名稱
 * 回傳 Map<drug_code, chinese_name>
 */
export async function batchLookupNhi(codes: string[]): Promise<Map<string, string>> {
  const nhiMap = new Map<string, string>();
  if (codes.length === 0) return nhiMap;

  try {
    const uniqueCodes = [...new Set(codes)];
    const { data: nhiData } = await getSupabaseAdmin()
      .from('nhi_drug_lookup')
      .select('drug_code, chinese_name')
      .in('drug_code', uniqueCodes);

    nhiData?.forEach(row => {
      nhiMap.set(row.drug_code, row.chinese_name);
    });
  } catch {
    // 查詢失敗時保留原名稱，不中斷流程
  }
  return nhiMap;
}

/**
 * 單筆查詢 NHI 藥品中文名稱
 * 先嘗試 product_code，再 fallback 到 barcode
 */
export async function lookupNhiName(productCode?: string, barcode?: string): Promise<string | null> {
  // 先嘗試商品代碼
  if (productCode?.trim()) {
    try {
      const { data } = await getSupabaseAdmin().from('nhi_drug_lookup')
        .select('drug_code, chinese_name')
        .eq('drug_code', productCode.trim())
        .maybeSingle();
      if (data?.chinese_name) return data.chinese_name;
    } catch {
      // 忽略錯誤
    }
  }
  // 再嘗試國際條碼
  if (barcode?.trim()) {
    try {
      const { data } = await getSupabaseAdmin().from('nhi_drug_lookup')
        .select('drug_code, chinese_name')
        .eq('drug_code', barcode.trim())
        .maybeSingle();
      if (data?.chinese_name) return data.chinese_name;
    } catch {
      // 忽略錯誤
    }
  }
  return null;
}