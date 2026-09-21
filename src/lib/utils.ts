/**
 * 格式化位元組大小為人類可讀格式
 * @param bytes 位元組數
 * @returns 格式化後的字串 (B, KB, MB, GB)
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1))} ${sizes[i]}`;
}

/**
 * 格式化位元組大小為人類可讀格式 (支援字串輸入)
 * @param bytes 位元組數 (字串或數字)
 * @returns 格式化後的字串
 */
export function formatBytesFromString(bytes: string | number): string {
  const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  return formatBytes(num);
}