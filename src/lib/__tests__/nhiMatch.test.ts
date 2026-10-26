import { describe, it, expect } from 'vitest';
import {
  stripPackagingNote,
  isEnglishOnlyName,
  scorePrefixAware,
  pickCandidates,
  getSearchKeyword,
  applyNhiResults,
  sanitizeProductCode,
  sanitizeBarcode,
} from '../nhiMatch';
import type { NhiCandidate } from '../nhiMatch';

describe('stripPackagingNote', () => {
  it('剝離含中文的尾端括號備註', () => {
    expect(stripPackagingNote('CONCOR 5(鋁箔/膠囊)')).toBe('CONCOR 5');
  });
  it('剝離右邊界截斷的未閉合括號', () => {
    expect(stripPackagingNote('GLUTAZONE TABLETS 30MG(30粒/鋁箔')).toBe('GLUTAZONE TABLETS 30MG');
  });
  it('剝離截斷的廠牌引號殘字', () => {
    expect(stripPackagingNote('ADAPINE S.R.F.C. TAB. 30MG "STAN')).toBe('ADAPINE S.R.F.C. TAB. 30MG');
  });
});

describe('isEnglishOnlyName', () => {
  it('純英文品名（含尾端中文包裝備註）為 true', () => {
    expect(isEnglishOnlyName('PROPRANOLOL TABLETS 10MG (鋁箔/膠')).toBe(true);
  });
  it('主品名含中文為 false', () => {
    expect(isEnglishOnlyName('速治疼軟膠囊(ibuprofen) 400毫克')).toBe(false);
  });
});

describe('scorePrefixAware', () => {
  it('縮寫 TAB 可命中 TABLET，截斷名稱不扣分', () => {
    expect(scorePrefixAware('ADAPINE S.R.F.C. TAB. 30MG "STAN', 'ADAPINE S.R.F.C. TABLET 30MG "STANDARD"')).toBe(1);
  });
  it('首 token 不符為 0', () => {
    expect(scorePrefixAware('LIPITOR TABLETS 40MG', 'CRESTOR TABLETS 40MG')).toBe(0);
  });
});

describe('pickCandidates', () => {
  const rows = [
    { drug_code: 'A1', chinese_name: '普洛普拉諾錠10毫克', english_name: 'PROPRANOLOL TABLETS 10MG "A"' },
    { drug_code: 'A2', chinese_name: '普洛普拉諾錠10毫克', english_name: 'PROPRANOLOL TABLETS 10MG "A" (BLISTER)' },
    { drug_code: 'B1', chinese_name: '恩特來諾錠10毫克', english_name: 'PROPRANOLOL TABLETS 10MG "B"' },
    { drug_code: 'C1', chinese_name: '普洛普拉諾錠40毫克', english_name: 'PROPRANOLOL TABLETS 40MG' },
  ];
  it('同中文名去重，多廠牌保留為多筆候選', () => {
    const c = pickCandidates('PROPRANOLOL TABLETS 10MG (鋁箔/膠', rows);
    expect(c.map(x => x.chinese_name).sort()).toEqual(['恩特來諾錠10毫克', '普洛普拉諾錠10毫克']);
  });
  it('無匹配回傳空陣列', () => {
    expect(pickCandidates('ZZZZZ TABLETS', rows)).toEqual([]);
  });
});

describe('getSearchKeyword', () => {
  it('取首個英文 token', () => {
    expect(getSearchKeyword('PROPRANOLOL TABLETS 10MG')).toBe('PROPRANOLOL');
  });
});

describe('applyNhiResults', () => {
  it('auto 套用中文名；pending 保留原名並附候選；none 保留原名', () => {
    const items: Array<{ line_number: number; drug_name: string; nhi_candidates?: NhiCandidate[] }> = [
      { line_number: 1, drug_name: 'AAA' },
      { line_number: 2, drug_name: 'BBB' },
      { line_number: 3, drug_name: 'CCC' },
    ];
    const cands = [
      { drug_code: 'x', chinese_name: '甲', english_name: 'BBB 1', score: 1 },
      { drug_code: 'y', chinese_name: '乙', english_name: 'BBB 2', score: 1 },
    ];
    const out = applyNhiResults(items, [
      { line_number: 1, status: 'auto', chinese_name: '中文甲' },
      { line_number: 2, status: 'pending', candidates: cands },
      { line_number: 3, status: 'none' },
    ]);
    expect(out[0]).toMatchObject({ drug_name: '中文甲', nhi_status: 'auto' });
    expect(out[1]).toMatchObject({ drug_name: 'BBB', nhi_status: 'pending' });
    expect(out[1].nhi_candidates).toHaveLength(2);
    expect(out[2]).toMatchObject({ drug_name: 'CCC', nhi_status: 'none' });
  });
});

describe('sanitizeProductCode & sanitizeBarcode', () => {
  it('將健保代碼末尾誤判的英文字母 O 校正為數字 0 (AB091021GO -> AB091021G0)', () => {
    expect(sanitizeProductCode('AB091021GO')).toBe('AB091021G0');
    expect(sanitizeProductCode('AC426871GO')).toBe('AC426871G0');
    expect(sanitizeProductCode('BC171251GO')).toBe('BC171251G0');
  });

  it('將健保代碼中間藥證數字區間的 O 校正為 0', () => {
    expect(sanitizeProductCode('ABO91021G0')).toBe('AB091021G0');
  });

  it('國際條碼純數字清洗 (把 O 轉為 0, I 轉為 1)', () => {
    expect(sanitizeBarcode('471614O2OO816')).toBe('4716140200816');
  });
});
