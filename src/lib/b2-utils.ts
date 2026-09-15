/**
 * B2 工具函數 (Client-safe，無 'use server')
 * 可在 Server/Client 雙方使用
 */

/**
 * 產生標準化的照片儲存路徑
 */
export function generatePhotoKey(
  manifestId: string,
  pageNumber: number,
  barcode: string,
  fileExt: string = 'jpg'
): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const timestamp = Date.now();
  // 移除 barcode 中可能的特殊字元
  const safeBarcode = barcode.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `photos/${year}/${month}/${day}/${manifestId}/${pageNumber}/${safeBarcode}_${timestamp}.${fileExt}`;
}

/**
 * 從 photo_url 解析出 B2 key
 * 支援格式: https://.../file/bucket/photos/... 或 相對路徑
 */
export function extractB2KeyFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    // 格式: /file/bucket-name/photos/...
    const parts = pathname.split('/');
    const fileIndex = parts.indexOf('file');
    if (fileIndex !== -1 && fileIndex + 2 < parts.length) {
      // 跳過 /file/bucket-name/
      return parts.slice(fileIndex + 2).join('/');
    }
    // 可能是相對路徑
    if (pathname.startsWith('/photos/')) {
      return pathname.slice(1);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 檢查是否為 B2 key (相對路徑) 而非完整 URL
 */
export function isB2Key(photoUrl: string): boolean {
  return !photoUrl.startsWith('http');
}