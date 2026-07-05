/**
 * 條碼合併工具：以 barcode / product_code 為鍵合併項目，數量疊加
 * 無條碼項目各自保留
 */

export interface MergeableItem {
  barcode: string;
  product_code?: string;
  expected_quantity: number;
  storage_location?: string;
  category?: string;
  [key: string]: any; // 允許其他欄位通過
}

export function mergeByBarcode<T extends MergeableItem>(items: T[]): T[] {
  const barcodeMap = new Map<string, T>();
  const mergeCountMap = new Map<string, number>();

  for (const item of items) {
    // 先嘗試使用國際條碼，若無則使用商品條碼作為合併鍵
    let key = '';
    if (item.barcode && item.barcode.trim()) {
      key = item.barcode.trim();
    } else if (item.product_code && item.product_code.trim()) {
      key = item.product_code.trim();
    }

    if (!key) {
      // 無條碼項目不合併，各自保留
      const fakeKey = `__NO_BARCODE_${barcodeMap.size}__`;
      barcodeMap.set(fakeKey, { ...item });
      mergeCountMap.set(fakeKey, 1);
      continue;
    }

    mergeCountMap.set(key, (mergeCountMap.get(key) || 0) + 1);
    const existing = barcodeMap.get(key);
    if (existing) {
      existing.expected_quantity += item.expected_quantity;
      // 保留第一個找到的 storage_location 和 category
      if (!existing.storage_location && item.storage_location) {
        existing.storage_location = item.storage_location;
      }
      if (!existing.category && item.category) {
        existing.category = item.category;
      }
    } else {
      barcodeMap.set(key, { ...item });
    }
  }

  return [...barcodeMap.values()];
}