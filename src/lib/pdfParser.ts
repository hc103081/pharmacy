export interface ParsedItem {
  line_number: number;
  barcode: string;
  drug_name: string;
  quantity: number;
  bonus_quantity: number;
}

export interface ParsedPdf {
  order_metadata: {
    order_number: string;
    delivery_date: string;
    total_items: number;
  };
  items: ParsedItem[];
}

/**
 * 輕量 client-side wrapper：
 * 1. 呼叫 convertPdfToImages() 將 PDF 轉為圖片
 * 2. 呼叫 Server Action parsePdfWithGemini() 執行 Gemini OCR
 * 3. 回傳 ParsedPdf 結果
 */
export async function parsePdf(
  data: Uint8Array,
  onProgress?: (page: number, total: number) => void
): Promise<ParsedPdf> {
  const { convertPdfToImages } = await import('@/lib/pdfUtils');
  const { parsePdfWithGemini } = await import('@/app/actions/import');

  // Step 1: 將 PDF 每頁轉為 Base64 JPEG 圖片
  if (onProgress) onProgress(0, 1);
  const base64Images = await convertPdfToImages(data);
  if (onProgress) onProgress(1, 1);

  // Step 2: 呼叫 Server Action 進行 Gemini OCR
  const result = await parsePdfWithGemini({ images: base64Images });

  // Step 3: 回傳結果
  return result;
}
