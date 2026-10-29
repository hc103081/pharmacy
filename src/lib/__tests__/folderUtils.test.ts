import { describe, it, expect } from 'vitest';
import {
  parseManifestDate,
  calculateRecursiveFolderCount,
  getDescendantFolderIds,
  calculatePaperPages,
  sortFoldersByDateDesc,
} from '../folderUtils';
import { Manifest } from '../../types';

describe('Manifest Folders & AI Classification Logic', () => {
  it('應優先從 delivery_date 正確解析 年/月/日 階層 (斜線格式)', () => {
    const manifest: Manifest = {
      id: 'm-1',
      name: '測試清單',
      delivery_date: '2026/10/26',
      total_items: 50,
      status: 'active',
    };

    const result = parseManifestDate(manifest);
    expect(result.year).toBe('2026年');
    expect(result.month).toBe('10月');
    expect(result.day).toBe('26日');
    expect(result.dateStr).toBe('2026-10-26');
  });

  it('應從 delivery_date 正確解析 年/月/日 階層 (連字號格式)', () => {
    const manifest: Manifest = {
      id: 'm-2',
      name: '測試清單 2',
      delivery_date: '2026-07-17',
      total_items: 20,
      status: 'active',
    };

    const result = parseManifestDate(manifest);
    expect(result.year).toBe('2026年');
    expect(result.month).toBe('7月');
    expect(result.day).toBe('17日');
    expect(result.dateStr).toBe('2026-07-17');
  });

  it('當無 delivery_date 時，應能從藥局特定單號 (如 R012610260004) 解析出日期', () => {
    const manifest: Manifest = {
      id: 'm-3',
      name: 'R012610260004',
      total_items: 87,
      status: 'active',
    };

    const result = parseManifestDate(manifest);
    expect(result.year).toBe('2026年');
    expect(result.month).toBe('10月');
    expect(result.day).toBe('26日');
  });

  it('當無 delivery_date 時，應能從藥局單號 R012607170002 解析出 07/17', () => {
    const manifest: Manifest = {
      id: 'm-4',
      name: 'R012607170002',
      total_items: 244,
      status: 'active',
    };

    const result = parseManifestDate(manifest);
    expect(result.year).toBe('2026年');
    expect(result.month).toBe('7月');
    expect(result.day).toBe('17日');
  });

  it('若無 delivery_date 且單號無日期特徵，應 fallback 至 created_at', () => {
    const manifest: Manifest = {
      id: 'm-5',
      name: '特別手動清單',
      created_at: '2026-05-12T10:00:00Z',
      total_items: 10,
      status: 'active',
    };

    const result = parseManifestDate(manifest);
    expect(result.year).toBe('2026年');
    expect(result.month).toBe('5月');
    expect(result.day).toBe('12日');
  });

  it('應正確遞迴計算資料夾包含子樹狀（年 > 月 > 日）之清單總和', () => {
    const folders = [
      { id: 'f-2026', parent_id: null },
      { id: 'f-7m', parent_id: 'f-2026' },
      { id: 'f-18d', parent_id: 'f-7m' },
      { id: 'f-9m', parent_id: 'f-2026' },
    ];

    const manifests = [
      { id: 'm-1', folder_id: 'f-18d' }, // 在 18日 內
      { id: 'm-2', folder_id: 'f-7m' },  // 在 7月 內
      { id: 'm-3', folder_id: 'f-9m' },  // 在 9月 內
      { id: 'm-4', folder_id: null },    // 未分類
    ];

    // 18日 僅包含自己 (1)
    expect(calculateRecursiveFolderCount('f-18d', folders, manifests)).toBe(1);

    // 7月 包含 7月 + 18日 (1 + 1 = 2)
    expect(calculateRecursiveFolderCount('f-7m', folders, manifests)).toBe(2);

    // 9月 僅包含自己 (1)
    expect(calculateRecursiveFolderCount('f-9m', folders, manifests)).toBe(1);

    // 2026年 包含 2026 + 7月 + 18日 + 9月 (0 + 1 + 1 + 1 = 3)
    expect(calculateRecursiveFolderCount('f-2026', folders, manifests)).toBe(3);
  });

  describe('實體紙本 44 項對位換算 (Paper Alignment)', () => {
    it('0 項藥品應換算為 0 頁', () => {
      const res = calculatePaperPages(0);
      expect(res.totalPages).toBe(0);
      expect(res.pageRanges).toEqual([]);
    });

    it('44 項藥品應精準換算為 1 頁，範圍 1-44', () => {
      const res = calculatePaperPages(44);
      expect(res.totalPages).toBe(1);
      expect(res.pageRanges).toEqual([{ page: 1, start: 1, end: 44 }]);
    });

    it('45 項藥品應換算為 2 頁，第 2 頁為 45-45', () => {
      const res = calculatePaperPages(45);
      expect(res.totalPages).toBe(2);
      expect(res.pageRanges).toEqual([
        { page: 1, start: 1, end: 44 },
        { page: 2, start: 45, end: 45 },
      ]);
    });

    it('244 項藥品應精準換算為 6 頁，最後一頁為 221-244', () => {
      const res = calculatePaperPages(244);
      expect(res.totalPages).toBe(6);
      expect(res.pageRanges).toHaveLength(6);
      expect(res.pageRanges[0]).toEqual({ page: 1, start: 1, end: 44 });
      expect(res.pageRanges[5]).toEqual({ page: 6, start: 221, end: 244 });
    });
  });

  describe('資料夾年月日數值降序排序 (sortFoldersByDateDesc)', () => {
    it('月份應嚴格按照數值由大到小排序，杜絕字典序 10月 < 6月 的錯誤', () => {
      const folders = [
        { name: '10月' },
        { name: '6月' },
        { name: '7月' },
        { name: '12月' },
        { name: '1月' },
      ];
      const sorted = sortFoldersByDateDesc(folders);
      expect(sorted.map((f) => f.name)).toEqual(['12月', '10月', '7月', '6月', '1月']);
    });

    it('年份應由大到小排序 (最新年份置頂)', () => {
      const folders = [
        { name: '2024年' },
        { name: '2026年' },
        { name: '2025年' },
      ];
      const sorted = sortFoldersByDateDesc(folders);
      expect(sorted.map((f) => f.name)).toEqual(['2026年', '2025年', '2024年']);
    });

    it('日期應由大到小排序', () => {
      const folders = [
        { name: '5日' },
        { name: '26日' },
        { name: '17日' },
        { name: '31日' },
      ];
      const sorted = sortFoldersByDateDesc(folders);
      expect(sorted.map((f) => f.name)).toEqual(['31日', '26日', '17日', '5日']);
    });

    it('日期資料夾應優先於非日期自訂資料夾', () => {
      const folders = [
        { name: '特別專案' },
        { name: '7月' },
        { name: '10月' },
        { name: '待確認' },
      ];
      const sorted = sortFoldersByDateDesc(folders);
      expect(sorted.map((f) => f.name)).toEqual(['10月', '7月', '待確認', '特別專案']);
    });
  });

});
