export interface ParsedItem {
  line_number: number;
  barcode: string;
  drug_name: string;
  quantity: number;
  bonus_quantity: number; // [保留欄位，新格式固定為 0]
  storage_location: string; // 儲位（如 F3）
  category: string; // 類別（如 4）
  /** 合併自幾個相同條碼的項目（1 表示未合併） */
  merged_count?: number;
  /** 來源照片的頁碼（用於排序） */
  page_number?: number;
  /** 原始上傳順序（頁碼 OCR 失敗時的 fallback） */
  upload_index?: number;
}

export interface OrderMetadata {
  order_number: string;
  delivery_date: string;
  total_items: number;
  /** 資料來源類型 */
  source_type?: 'pdf' | 'images';
  /** 上傳照片張數（僅照片匯入） */
  uploaded_image_count?: number;
  /** OCR 辨識出的頁數 */
  ocr_page_count?: number;
  /** OCR API 請求次數 */
  ocr_request_count?: number;
}

export interface ParsedPdf {
  order_metadata: OrderMetadata;
  items: ParsedItem[];
}

/** 進度回報的詳細步驟資訊 */
export interface PdfProgressStep {
  /** 步驟識別碼 */
  step: 'converting' | 'merging' | 'uploading' | 'header' | 'batch' | 'done';
  /** 人類可讀的步驟描述 */
  label: string;
  /** 整體進度 0~100 */
  percent: number;
}

/** 每幾頁合併為一張圖片（減少上傳次數與總體積） */
const MERGE_PAGE_COUNT = 3;

/**
 * 逐步解析 PDF，每個階段都透過 onProgress 回報進度。
 * 拆分 Server Action 呼叫，讓客戶端能在每步之間更新 UI。
 */
export async function parsePdf(
  data: Uint8Array,
  onProgress?: (progress: PdfProgressStep) => void
): Promise<ParsedPdf> {
  const { convertPdfToImages, mergeImagesVertically } = await import('@/lib/pdfUtils');
  const { parseHeaderWithGemini, parseBatchWithGemini } = await import('@/app/actions/import');
  const { clientUploadImportImages } = await import('@/lib/clientUpload');

  // ── Step 1: 將 PDF 每頁轉為 Base64 JPEG 圖片 ──
  onProgress?.({ step: 'converting', label: '正在將 PDF 轉換為圖片...', percent: 5 });
  const base64Images = await convertPdfToImages(data);
  const totalPages = base64Images.length;

  // ── Step 2: 每 MERGE_PAGE_COUNT 頁合併為一張圖片 ──
  onProgress?.({ step: 'merging', label: `正在每 ${MERGE_PAGE_COUNT} 頁合併為一張圖片 (共 ${totalPages} 頁)...`, percent: 15 });
  const mergedImages: string[] = [];
  for (let i = 0; i < totalPages; i += MERGE_PAGE_COUNT) {
    const batch = base64Images.slice(i, i + MERGE_PAGE_COUNT);
    const merged = await mergeImagesVertically(batch);
    mergedImages.push(merged);
  }
  const totalBatches = mergedImages.length;

  // ── Step 3: 從客戶端直接上傳圖片至 Supabase Storage（繞過 Vercel 4.5MB 限制）──
  onProgress?.({ step: 'uploading', label: `正在上傳 ${totalBatches} 張批次圖片...`, percent: 25 });
  const blobs: Blob[] = [];
  for (let i = 0; i < mergedImages.length; i++) {
    const base64 = mergedImages[i];
    const parts = base64.split(',');
    const contentType = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const byteString = atob(parts[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let j = 0; j < byteString.length; j++) {
      ia[j] = byteString.charCodeAt(j);
    }
    blobs.push(new Blob([ab], { type: contentType }));
  }

  const uploadResult = await clientUploadImportImages(blobs);
  const urls = uploadResult.urls;

  // ── Step 4: 解析表頭（單獨呼叫） ──
  onProgress?.({ step: 'header', label: '正在 AI 辨識出貨單表頭...', percent: 35 });
  const headerResult = await parseHeaderWithGemini(urls[0]);
  if (!headerResult.success) {
    throw new Error(`表頭辨識失敗: ${headerResult.error || '未知錯誤'}`);
  }

  // ── Step 5: 逐批 AI 辨識藥品項目 ──
  // 計算進度分配：Step 5 佔 35%~95%（60%的進度空間）
  const BATCH_CONCURRENCY = 3;
  const allBatchResults: any[] = [];
  let completedBatches = 0;

  for (let i = 0; i < urls.length; i += BATCH_CONCURRENCY) {
    const batchSlice = urls.slice(i, i + BATCH_CONCURRENCY);

    onProgress?.({
      step: 'batch',
      label: `AI 辨識藥品項目中... (${completedBatches + 1}-${Math.min(completedBatches + batchSlice.length, totalBatches)} / ${totalBatches} 批次)`,
      percent: 35 + Math.round((completedBatches / totalBatches) * 60),
    });

    const batchResults = await Promise.all(
      batchSlice.map(async (url, batchIdx) => {
        const globalBatchIdx = i + batchIdx;
        let result = await parseBatchWithGemini(url, globalBatchIdx);
        if (!result.success || !result.items) {
          // 重試一次
          await new Promise(resolve => setTimeout(resolve, 1000));
          result = await parseBatchWithGemini(url, globalBatchIdx);
        }
        if (!result.success || !result.items) {
          const errorMsg = result.error || '未知錯誤';
          throw new Error(`批次 ${globalBatchIdx + 1} OCR 辨識失敗: ${errorMsg}`);
        }
        return { batchIndex: globalBatchIdx, items: result.items };
      })
    );
    allBatchResults.push(...batchResults);
    completedBatches += batchSlice.length;
  }

  // ── Step 6: 合併所有 items，按頁碼排序並重新編號 ──
  onProgress?.({ step: 'done', label: '解析完成，正在整理結果...', percent: 98 });
  allBatchResults.sort((a, b) => a.batchIndex - b.batchIndex);
  const mergedItems = allBatchResults.flatMap(r => r.items);

  // 穩健排序：按頁碼排序，頁碼缺失時 fallback 到上傳順序
  mergedItems.sort((a, b) => {
    if (a.page_number && b.page_number) return a.page_number - b.page_number;
    return (a.upload_index ?? 0) - (b.upload_index ?? 0);
  });

  const finalItems: ParsedItem[] = mergedItems.map((item, idx) => ({
    line_number: idx + 1,
    barcode: item.barcode,
    drug_name: item.drug_name,
    quantity: item.quantity,
    bonus_quantity: item.bonus_quantity,
    storage_location: item.storage_location,
    category: item.category,
  }));

  onProgress?.({ step: 'done', label: '解析完成！', percent: 100 });

  return {
    order_metadata: {
      order_number: headerResult.order_number || '未知單號',
      delivery_date: headerResult.delivery_date || '',
      total_items: finalItems.length,
    },
    items: finalItems,
  };
}
