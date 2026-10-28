import { Manifest } from '@/types';

/**
 * 輔助解析清單日期（年、月、日）
 * 1. 優先從 delivery_date 提取 (如 "2026/10/26", "2026-10-26")
 * 2. 次之從單號名稱正則推導 (如 R012610260004 ➔ 2026年 10月 26日)
 * 3. 最後 Fallback 到 created_at 或當前時間
 */
export function parseManifestDate(manifest: Manifest): {
  year: string;
  month: string;
  day: string;
  dateStr: string;
} {
  // 1. 優先使用 delivery_date
  if (manifest.delivery_date) {
    const match = manifest.delivery_date.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
      const year = `${match[1]}年`;
      const month = `${parseInt(match[2], 10)}月`;
      const day = `${parseInt(match[3], 10)}日`;
      const dateStr = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
      return { year, month, day, dateStr };
    }
  }

  // 2. 從單號名稱解析 (如 R012610260004: 10/26, 或包含 20261026)
  const candidate = `${manifest.order_number || ''} ${manifest.name || ''}`;
  // 格式 A: 20261026
  const yyyymmdd = candidate.match(/\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\b/);
  if (yyyymmdd) {
    const year = `${yyyymmdd[1]}年`;
    const month = `${parseInt(yyyymmdd[2], 10)}月`;
    const day = `${parseInt(yyyymmdd[3], 10)}日`;
    const dateStr = `${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]}`;
    return { year, month, day, dateStr };
  }

  // 格式 B: 藥局單號常用前綴 R + 0126(民國115/2026) + MMDD (如 R012610260004)
  const rCodeMatch = candidate.match(/R0?1?(\d{2})(\d{2})(\d{2})\d*/i);
  if (rCodeMatch) {
    const year = `20${rCodeMatch[1]}年`;
    const month = `${parseInt(rCodeMatch[2], 10)}月`;
    const day = `${parseInt(rCodeMatch[3], 10)}日`;
    const dateStr = `20${rCodeMatch[1]}-${rCodeMatch[2].padStart(2, '0')}-${rCodeMatch[3].padStart(2, '0')}`;
    return { year, month, day, dateStr };
  }

  // 3. Fallback: 使用建立時間 created_at
  const fallbackDate = manifest.created_at ? new Date(manifest.created_at) : new Date();
  const y = fallbackDate.getFullYear();
  const m = fallbackDate.getMonth() + 1;
  const d = fallbackDate.getDate();

  return {
    year: `${y}年`,
    month: `${m}月`,
    day: `${d}日`,
    dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
  };
}

/**
 * 取得指定資料夾的所有子孫資料夾 ID 集合（包含自身）
 */
export function getDescendantFolderIds(
  folderId: string,
  allFolders: Array<{ id: string; parent_id?: string | null }>
): Set<string> {
  const result = new Set<string>([folderId]);
  const queue = [folderId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const f of allFolders) {
      if (f.parent_id === currentId && !result.has(f.id)) {
        result.add(f.id);
        queue.push(f.id);
      }
    }
  }

  return result;
}

/**
 * 計算指定資料夾在包含子樹狀目錄情況下的所有清單數量（遞迴總和）
 */
export function calculateRecursiveFolderCount(
  folderId: string,
  allFolders: Array<{ id: string; parent_id?: string | null }>,
  manifests: Array<{ id: string; folder_id?: string | null }>
): number {
  const descendantIds = getDescendantFolderIds(folderId, allFolders);
  return manifests.filter((m) => m.folder_id && descendantIds.has(m.folder_id)).length;
}

/**
 * 實體紙本 44 項對位換算介面
 */
export interface PaperPageInfo {
  page: number;
  start: number;
  end: number;
}

/**
 * 實體紙本 44 項對位換算函式
 * 藥局每頁紙本固定 44 項
 */
export function calculatePaperPages(totalItems: number): {
  totalPages: number;
  pageRanges: PaperPageInfo[];
} {
  if (!totalItems || totalItems <= 0) {
    return { totalPages: 0, pageRanges: [] };
  }

  const ITEMS_PER_PAGE = 44;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const pageRanges: PaperPageInfo[] = [];

  for (let p = 1; p <= totalPages; p++) {
    const start = (p - 1) * ITEMS_PER_PAGE + 1;
    const end = Math.min(p * ITEMS_PER_PAGE, totalItems);
    pageRanges.push({ page: p, start, end });
  }

  return { totalPages, pageRanges };
}
