/**
 * PDF 處理時間估算工具。根據檔案大小、頁數與模型推論時間計算總耗時（秒）。
 * 此函式可被前端或後端共用，保持估算邏輯一致。
 */
export function estimatePdfProcessingTime(
  sizeBytes: number,
  pageCount?: number
): number {
  const sizeMB = sizeBytes / (1024 * 1024);
  // 上傳時間：根據檔案大小分段
  const uploadSec = sizeMB < 10 ? 1.5 : sizeMB < 50 ? 4 : 8;

  // 若未提供頁數，使用簡易估算：每 MB 約 2 頁
  const pages = pageCount ?? Math.ceil(sizeMB * 2);
  // 解析每頁耗時（OCR / 文字抽取）
  const parseSec = pages * 0.5; // 每頁約 0.5 秒

  // AI 推論固定時間（Gemini / 其他模型）
  const inferSec = 1;

  return Math.round(uploadSec + parseSec + inferSec);
}
