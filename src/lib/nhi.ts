'use server';

import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { isEnglishOnlyName, getSearchKeyword, pickCandidates, sanitizeProductCode, sanitizeBarcode } from '@/lib/nhiMatch';

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


/** 翻譯輸入（一筆藥品） */
export interface NhiResolveInput {
  line_number: number;
  product_code?: string;
  barcode?: string;
  drug_name: string;
}

/** 翻譯結果（一筆藥品） */
export interface NhiResolveResult {
  line_number: number;
  status: 'auto' | 'pending' | 'none';
  /** auto 時為套用的中文名 */
  chinese_name?: string;
  /** pending 時為候選清單（已依中文名去重、依匹配度排序） */
  candidates?: Array<{ drug_code: string; chinese_name: string; english_name: string; score: number }>;
}

/**
 * 批次解析藥品翻譯（兩層）
 * 第 1 層：product_code（無則 barcode）精準比對 drug_code
 * 第 2 層：未命中且主品名為純英文時，以 english_name 前綴感知匹配度篩選
 *   - 去重後 1 筆：auto
 *   - 去重後 2 筆以上：pending
 *   - 0 筆：none（保留原名）
 * 主品名含中文字者直接視為 none，保留原名。
 */
export async function resolveNhiTranslations(items: NhiResolveInput[]): Promise<NhiResolveResult[]> {
  const results = new Map<number, NhiResolveResult>();

  // 第 1 層：代碼精準比對
  const codes = items
    .map(i => sanitizeProductCode(i.product_code) || sanitizeBarcode(i.barcode))
    .filter((c): c is string => !!c);
  const codeMap = await batchLookupNhi(codes);

  const unresolved: NhiResolveInput[] = [];
  for (const item of items) {
    const code = sanitizeProductCode(item.product_code) || sanitizeBarcode(item.barcode);
    const hit = code ? codeMap.get(code) : undefined;
    if (hit) {
      results.set(item.line_number, { line_number: item.line_number, status: 'auto', chinese_name: hit });
    } else {
      unresolved.push(item);
    }
  }

  // 第 2 層：純英文品名匹配度篩選（並行批次查詢 Supabase，大幅降低等待時間）
  const englishItems = unresolved.filter(i => isEnglishOnlyName(i.drug_name));
  const nonEnglishItems = unresolved.filter(i => !isEnglishOnlyName(i.drug_name));
  for (const item of nonEnglishItems) {
    results.set(item.line_number, { line_number: item.line_number, status: 'none' });
  }

  // 收集所有唯一的搜尋前綴關鍵字
  const uniqueKeywords = [...new Set(
    englishItems
      .map(i => getSearchKeyword(i.drug_name))
      .filter((k): k is string => !!k)
  )];

  const keywordMap = new Map<string, Array<{ drug_code: string; chinese_name: string | null; english_name: string | null }>>();

  // 並行載入所有關鍵字對應的候選清單
  await Promise.all(
    uniqueKeywords.map(async (keyword) => {
      try {
        const { data } = await getSupabaseAdmin()
          .from('nhi_drug_lookup')
          .select('drug_code, chinese_name, english_name')
          .ilike('english_name', `${keyword}%`)
          .limit(500);
        keywordMap.set(keyword, data ?? []);
      } catch {
        keywordMap.set(keyword, []);
      }
    })
  );

  // 比對候選項目
  for (const item of englishItems) {
    const keyword = getSearchKeyword(item.drug_name);
    if (!keyword) {
      results.set(item.line_number, { line_number: item.line_number, status: 'none' });
      continue;
    }

    const rows = keywordMap.get(keyword) ?? [];
    const candidates = pickCandidates(item.drug_name, rows);
    if (candidates.length === 1) {
      results.set(item.line_number, {
        line_number: item.line_number,
        status: 'auto',
        chinese_name: candidates[0].chinese_name,
      });
    } else if (candidates.length >= 2) {
      results.set(item.line_number, { line_number: item.line_number, status: 'pending', candidates });
    } else {
      results.set(item.line_number, { line_number: item.line_number, status: 'none' });
    }
  }

  return items.map(i => results.get(i.line_number) ?? { line_number: i.line_number, status: 'none' as const });
}
