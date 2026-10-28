/**
 * NHI 品名比對純函式（無 'use server'，客戶端與伺服端皆可使用）
 *
 * 用途：撿貨單品名超出欄位邊界被截斷時，product_code 無法精準命中，
 * 改以「前綴感知」的英文品名匹配度篩選 nhi_drug_lookup.english_name。
 */

/** 單一健保翻譯候選 */
export interface NhiCandidate {
  drug_code: string;
  chinese_name: string;
  english_name: string;
  /** 匹配度 0~1 */
  score: number;
}

/** 翻譯狀態 */
export type NhiTranslationStatus =
  | 'auto' // 唯一碼或唯一候選，已自動套用
  | 'pending' // 多筆候選，待使用者選擇
  | 'chosen' // 使用者已選擇候選
  | 'kept' // 使用者選擇保留原始品名或手動輸入
  | 'none'; // 無命中，保留原名

/** 匹配度門檻：OCR 品名 token 至少 75% 能對上候選 token */
export const NHI_MATCH_THRESHOLD = 0.75;

const CJK_REGEX = /[\u3400-\u9fff\uf900-\ufaff]/;

/** 是否含中文字 */
export function hasCjk(text: string): boolean {
  return CJK_REGEX.test(text);
}

/**
 * 剝離品名尾端的倉管包裝備註與右邊界截斷殘字
 * 例：`GLUTAZONE TABLETS 30MG(30粒/鋁箔` → `GLUTAZONE TABLETS 30MG`
 *     `CONCOR 5(鋁箔/膠囊)` → `CONCOR 5`
 *     `ADAPINE S.R.F.C. TAB. 30MG "STAN` → `ADAPINE S.R.F.C. TAB. 30MG`
 */
export function stripPackagingNote(rawName: string): string {
  let name = (rawName || '').trim();
  // 含中文字的完整括號備註
  name = name.replace(/[(（【[][^)）】\]]*[\u3400-\u9fff][^)）】\]]*[)）】\]]/g, ' ');
  // 尾端未閉合的括號（右邊界截斷）
  name = name.replace(/[(（【[][^)）】\]]*$/, ' ');
  // 尾端未閉合的雙引號與其後殘字（廠牌引號被截斷）
  name = name.replace(/["“”][^"“”]*$/, ' ');
  // 其餘引號直接移除
  name = name.replace(/["“”']/g, ' ');
  return name.replace(/\s+/g, ' ').trim();
}

/** 是否為「純英文品名」：剝離包裝備註後不含中文字，且至少含一個英文字母 */
export function isEnglishOnlyName(rawName: string): boolean {
  const main = stripPackagingNote(rawName);
  return !!main && !hasCjk(main) && /[A-Za-z]/.test(main);
}

/** 切成大寫 token：英文字母串與數字串分開（30MG → 30, MG） */
export function tokenizeName(name: string): string[] {
  return (name.toUpperCase().match(/[A-Z]+|\d+(?:\.\d+)?/g) || []);
}

/**
 * 前綴感知匹配度
 * 規則：OCR token 皆可被候選 token 以「相等或前綴」命中（TAB 命中 TABLET），
 * 因 OCR 可能被右邊界截斷，OCR token 數少於候選屬正常。
 * 首個 token 必須命中，否則為 0。
 */
export function scorePrefixAware(ocrName: string, candidateEnglish: string): number {
  const ocrTokens = tokenizeName(stripPackagingNote(ocrName));
  const candTokens = tokenizeName(candidateEnglish);
  if (ocrTokens.length === 0 || candTokens.length === 0) return 0;
  if (!candTokens[0].startsWith(ocrTokens[0])) return 0;

  let matched = 0;
  const used = new Set<number>();
  for (let n = 0; n < ocrTokens.length; n++) {
    const t = ocrTokens[n];
    const isNumeric = /^\d/.test(t);
    const isLast = n === ocrTokens.length - 1;
    // 劑量數字必須完全一致（10 不可命中 40 或 100）；僅最後一個 token 因可能被截斷允許前綴
    const idx = candTokens.findIndex(
      (c, i) => !used.has(i) && (isNumeric && !isLast ? c === t : c.startsWith(t))
    );
    if (idx !== -1) {
      used.add(idx);
      matched++;
    } else if (isNumeric && !isLast) {
      return 0;
    }
  }
  return matched / ocrTokens.length;
}

/**
 * 以中文名去重（同藥不同包裝碼），保留匹配度最高者，結果依匹配度由高到低
 */
export function dedupeByChineseName(candidates: NhiCandidate[]): NhiCandidate[] {
  const best = new Map<string, NhiCandidate>();
  for (const c of candidates) {
    const key = c.chinese_name.trim();
    if (!key) continue;
    const existing = best.get(key);
    if (!existing || c.score > existing.score) best.set(key, c);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/**
 * 從查詢取回的資料列中，依匹配度篩出候選並去重
 */
export function pickCandidates(
  ocrName: string,
  rows: Array<{ drug_code: string; chinese_name: string | null; english_name: string | null }>
): NhiCandidate[] {
  const scored: NhiCandidate[] = [];
  for (const row of rows) {
    if (!row.chinese_name || !row.english_name) continue;
    const score = scorePrefixAware(ocrName, row.english_name);
    if (score >= NHI_MATCH_THRESHOLD) {
      scored.push({
        drug_code: row.drug_code,
        chinese_name: row.chinese_name,
        english_name: row.english_name,
        score,
      });
    }
  }
  return dedupeByChineseName(scored);
}

/** 取查詢用的首個英文 token（至少 3 字元） */
export function getSearchKeyword(ocrName: string): string | null {
  const first = tokenizeName(stripPackagingNote(ocrName)).find(t => /^[A-Z]+$/.test(t) && t.length >= 3);
  return first ?? null;
}

/** 翻譯結果套用所需的最小欄位 */
interface TranslatableItem {
  line_number: number;
  drug_name: string;
  nhi_status?: NhiTranslationStatus;
  nhi_candidates?: NhiCandidate[];
  nhi_original_name?: string;
}

/** 翻譯結果（與 resolveNhiTranslations 回傳結構一致） */
export interface AppliedNhiResult {
  line_number: number;
  status: 'auto' | 'pending' | 'none';
  chinese_name?: string;
  candidates?: NhiCandidate[];
}

/**
 * 將翻譯結果套用到項目：
 * auto → 改為中文名；pending → 保留原名並附候選；none → 保留原名
 */
export function applyNhiResults<T extends TranslatableItem>(items: T[], results: AppliedNhiResult[]): T[] {
  const byLine = new Map(results.map(r => [r.line_number, r]));
  return items.map(item => {
    const r = byLine.get(item.line_number);
    if (!r || r.status === 'none') return { ...item, nhi_status: 'none' as const };
    if (r.status === 'auto' && r.chinese_name) {
      return {
        ...item,
        drug_name: r.chinese_name,
        nhi_status: 'auto' as const,
        nhi_original_name: item.drug_name,
      };
    }
    if (r.status === 'pending' && r.candidates && r.candidates.length >= 2) {
      return {
        ...item,
        nhi_status: 'pending' as const,
        nhi_candidates: r.candidates,
        nhi_original_name: item.drug_name,
      };
    }
    return { ...item, nhi_status: 'none' as const };
  });
}

/**
 * 清洗與校正商品代碼／健保代碼（NHI Code）
 * 針對 OCR 常將數字 0 誤判為字母 O 的混淆進行自動校正
 * 例：AB091021GO → AB091021G0
 *     AC426871GO → AC426871G0
 */
export function sanitizeProductCode(rawCode?: string): string {
  if (!rawCode) return '';
  let cleaned = rawCode.trim().toUpperCase();

  // 若符合台灣 10 碼健保碼外觀（8~11 碼，字母開頭）
  if (/^[A-Z][A-Z0-9]{7,10}$/.test(cleaned)) {
    // 1. 健保碼末尾（第 9、10 碼包裝碼）絕無英文字母 O，必為數字 0
    cleaned = cleaned.replace(/O+$/, m => '0'.repeat(m.length));

    // 2. 第 3 至 7 碼為藥證 5 位純數字流水號，若誤判為 O 則校正為 0
    if (cleaned.length >= 7) {
      const prefix = cleaned.slice(0, 2);
      const middle = cleaned.slice(2, 7).replace(/O/g, '0');
      const suffix = cleaned.slice(7);
      cleaned = prefix + middle + suffix;
    }
  }

  return cleaned;
}

/**
 * 清洗與校正國際條碼（Barcode）
 * 國際條碼為純數字格式，OCR 誤讀為字母 O/o 時自動轉為數字 0，字母 I/l 轉為數字 1
 */
export function sanitizeBarcode(rawBarcode?: string): string {
  if (!rawBarcode) return '';
  let cleaned = rawBarcode.trim();
  if (/^[0-9A-Za-z\s-]+$/.test(cleaned)) {
    cleaned = cleaned
      .replace(/[Oo]/g, '0')
      .replace(/[Il|]/g, '1')
      .replace(/[\s-]/g, '');
  }
  return cleaned;
}
