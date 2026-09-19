/**
 * Web Crypto API 工具函數
 */

/**
 * 計算 ArrayBuffer 的 SHA-1 雜湊值，回傳十六進位字串
 */
export async function sha1Hash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 計算字串的 SHA-1 雜湊值
 */
export async function sha1HashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(str);
  return sha1Hash(buffer.buffer);
}