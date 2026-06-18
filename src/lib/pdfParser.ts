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
  const { uploadImportImages, parseHeaderWithGemini, parseBatchWithGemini } = await import('@/app/actions/import');

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

  // ── Step 3: 上傳合併後圖片至 Storage ──
  onProgress?.({ step: 'uploading', label: `正在上傳 ${totalBatches} 張批次圖片...`, percent: 25 });
  const formData = new FormData();
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
    const blob = new Blob([ab], { type: contentType });
    formData.append('files', new File([blob], `merged_batch_${i + 1}.jpg`, { type: contentType }));
  }

  const uploadResult = await uploadImportImages(formData);
  if (!uploadResult.success || !uploadResult.urls) {
    throw new Error(`圖片上傳失敗: ${uploadResult.error || '未知錯誤'}`);
  }
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
  const allBatchResults: { batchIndex: number; items: ParsedItem[] }[] = [];
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
          throw new Error(`批次 ${globalBatchIdx + 1} OCR 辨識失敗: ${result.error || '未知錯誤'}`);
        }
        return { batchIndex: globalBatchIdx, items: result.items };
      })
    );
    allBatchResults.push(...batchResults);
    completedBatches += batchSlice.length;
  }

  // ── Step 6: 合併所有 items 並重新編號 ──
  onProgress?.({ step: 'done', label: '解析完成，正在整理結果...', percent: 98 });
  allBatchResults.sort((a, b) => a.batchIndex - b.batchIndex);
  const mergedItems = allBatchResults.flatMap(r => r.items);

  const finalItems: ParsedItem[] = mergedItems.map((item, idx) => ({
    line_number: idx + 1,
    barcode: item.barcode,
    drug_name: item.drug_name,
    quantity: item.quantity,
    bonus_quantity: item.bonus_quantity,
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
