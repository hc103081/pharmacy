'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { fetchImageAsBase64, repairGeminiJson, friendlyGeminiError, createGeminiModel } from '@/lib/gemini';
import { batchLookupNhi } from '@/lib/nhi';
import type { ParsedItem, ParsedPdf } from '@/lib/pdfParser';
import { PageItem, ImportDrugItem } from './types';

/**
 * 從總倉撿貨單第一頁提取表頭資訊（出貨單號、交貨日期、頁碼）
 */
export async function parseHeaderWithGemini(url: string): Promise<{ success: boolean; order_number?: string; delivery_date?: string; page_number?: number; total_pages?: number; error?: string }> {
  try {
    const model = await createGeminiModel();

    const base64Data = await fetchImageAsBase64(url);

    const prompt = `這是安得福藥局總倉撿貨單（彙總）的圖片。請找出以下資訊：
1. 出貨單號 (order_number)，格式如 R012606220001
2. 列印時間 (delivery_date)，請將日期格式化為 YYYY-MM-DD
3. 頁次 (page_number)，照片底部的當前頁碼數字
4. 總頁數 (total_pages)，照片底部的總頁數數字

輸出嚴格 JSON 格式，不要 markdown 標記：
{ "order_number": "單號", "delivery_date": "YYYY-MM-DD", "page_number": 3, "total_pages": 6 }`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64Data, mimeType: 'image/jpeg' } },
    ]);
    const text = await repairGeminiJson(result.response.text());
    const parsed = JSON.parse(text);
    return {
      success: true,
      order_number: parsed.order_number || '未知單號',
      delivery_date: parsed.delivery_date || '',
      page_number: parsed.page_number,
      total_pages: parsed.total_pages,
    };
  } catch (error: unknown) {
    console.error('parseHeaderWithGemini Error:', error);
    const rawMessage = error instanceof Error ? error.message : '表頭解析失敗';
    return {
      success: false,
      error: await friendlyGeminiError(rawMessage),
    };
  }
}

/**
 * 使用 Gemini OCR 提取一批合併圖片中的藥品項目 (JSON 格式)
 * 用於 PDF 解析流程（每批最多 3 頁合併圖）
 */
export async function parseBatchWithGemini(url: string, _batchIndex: number): Promise<{ success: boolean; items?: PageItem[]; error?: string }> {
  try {
    const model = await createGeminiModel();

    const base64Data = await fetchImageAsBase64(url);

    const prompt = `這是一組合併後的藥局總倉撿貨單圖片（包含多頁）。
請提取所有藥品項目，並以 JSON 格式輸出。

藥品欄位：
- storage_location: 儲位（如 F3），找不到請設為空字串
- category: 類別（如 4），找不到請設為空字串
- barcode: 國際條碼（純數字，格式如 471020120000），找不到請設為空字串
- product_code: 商品條碼／健保碼（字母開頭格式如 A000015421、AC16496100），找不到請設為空字串
- drug_name: 中文品名
- quantity: 補貨量（保留原始格式如 "1罐"、"5盒"）

同時請找出圖片底部的頁次資訊（如「頁次 3 of 6」），並在回傳中加入 page_number 和 total_pages。

輸出格式（嚴格 JSON，不要 markdown 標記）：
{
  "page_number": 3,
  "total_pages": 6,
  "items": [
    {"storage_location": "I3", "category": "30", "barcode": "4719881452117", "product_code": "4719881452117", "drug_name": "銀貝貝ENT棉棒滅菌10支", "quantity": "10包"},
    {"storage_location": "Z9", "category": "X", "barcode": "4719256000387", "product_code": "AC43588157", "drug_name": "CYPROMIN [120mL] SOLUTION 0.4MC", "quantity": "5瓶"},
    {"storage_location": "Z9", "category": "X", "barcode": "", "product_code": "AC46990429", "drug_name": "EYEHELP EYE DROPS 0.01% 10ML", "quantity": "1瓶"},
    {"storage_location": "", "category": "", "barcode": "", "product_code": "", "drug_name": "某藥品名稱", "quantity": "2盒"}
  ]
}

注意事項：
1. 這是一份專業的藥局總倉撿貨單，請特別注意中文字形辨識，避免將藥品名稱誤判為無意義的文字。
2. storage_location 和 category 是選填欄位，如果照片中沒有明確顯示，請務必設為空字串，不要猜測。
3. barcode 是國際條碼，一定是純數字（如 471020120000）；完全看不到數字條碼時請設為空字串。
4. product_code 是商品條碼／健保碼（通常為字母開頭的健保代碼如 AC16496100，或 EAN-13 商品碼），若無則為空字串。
5. 保持項目在圖片中出現的物理順序。
6. 忽略表頭、頁尾及其他非藥品項目內容。
7. quantity 欄位保留原始格式（如 "1罐"、"5盒"），不要轉為純數字。`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64Data, mimeType: 'image/jpeg' } },
    ]);

    const text = await repairGeminiJson(result.response.text());
    const parsed = JSON.parse(text);

    // 提取頁碼資訊
    const pageNumber: number | undefined = parsed.page_number;
    const totalPages: number | undefined = parsed.total_pages;

    // 解析 items 陣列
    const rawItems: Array<{
      storage_location?: string;
      category?: string;
      barcode?: string;
      product_code?: string;
      drug_name?: string;
      quantity?: string;
    }> = Array.isArray(parsed.items) ? parsed.items : [];

    const items: PageItem[] = rawItems.map((item, idx) => {
      const rawQuantity = (item.quantity || '').trim();
      const match = rawQuantity.match(/-?\d+/);
      const expected_quantity = match ? Math.max(0, parseInt(match[0], 10)) : 0;

      // 若 expected_quantity === 0，在 drug_name 標記需確認
      const drugName = expected_quantity === 0 && item.drug_name
        ? `${item.drug_name}(數量待確認)`
        : (item.drug_name || '');

      return {
        storage_location: item.storage_location || '',
        category: item.category || '',
        barcode: (item.barcode || '').trim(),
        product_code: item.product_code ? (item.product_code || '').trim() : '',
        drug_name: drugName,
        quantity: rawQuantity,
        page_number: pageNumber,
        upload_index: _batchIndex * 100 + idx, // 以批次索引為基礎的 fallback 排序值
      };
    });

    return { success: true, items };
  } catch (error: unknown) {
    console.error('parseBatchWithGemini Error:', error);
    const rawMessage = error instanceof Error ? error.message : '未知錯誤';
    return {
      success: false,
      error: await friendlyGeminiError(rawMessage),
    };
  }
}

/**
 * 處理單一批次的多張圖片（最多 3 張）- 用於照片匯入流程
 * 將多張截圖一次送給 Gemini，要求回傳所有頁面的項目
 */
async function processSingleBatchWithGemini(urls: string[], batchIndex: number): Promise<{ success: boolean; order_number?: string; delivery_date?: string; total_pages?: number; items?: PageItem[]; error?: string }> {
  try {
    const model = await createGeminiModel();

    // 將 URL 轉換為 Gemini 要求的 inlineData 格式
    const imageParts = await Promise.all(urls.map(async (url) => {
      const base64Data = await fetchImageAsBase64(url);
      const mimeType = 'image/jpeg';
      return {
        inlineData: {
          data: base64Data,
          mimeType,
        },
      };
    }));

    const prompt = `你是一個精準的醫藥清單 OCR 提取專家。請分析提供的總倉撿貨單截圖（本批次共 ${urls.length} 張圖片）。

請從第一張圖片中找出：
1. 出貨單號 (order_number)，格式如 R012606220001
2. 列印時間 (delivery_date)，請將日期格式化為 YYYY-MM-DD

然後請分析所有 ${urls.length} 張圖片，提取出所有藥品項目。

藥品欄位：
- barcode: 國際條碼（純數字，格式如 471020120000），找不到請設為空字串
- product_code: 商品條碼／健保碼（字母開頭格式如 A000015421、AC16496100），找不到請設為空字串
- name: 中文品名
- expected_quantity: 補貨量（非負整數，>= 0）
- storage_location: 儲位（如 F3），找不到請設為空字串
- category: 類別（如 4），找不到請設為空字串

同時請找出每張圖片底部的頁次資訊（如「頁次 3 of 6」），並在回傳中包含 page_number 和 total_pages。

輸出格式（嚴格 JSON，不要 markdown 標記）：
{
  "order_number": "R012606220001",
  "delivery_date": "2026-06-22",
  "total_pages": 6,
  "items": [
    { "barcode": "4719881452117", "product_code": "4719881452117", "name": "銀貝貝ENT棉棒滅菌10支", "expected_quantity": 10, "storage_location": "I3", "category": "30", "page_number": 1 },
    { "barcode": "4719256000387", "product_code": "AC43588157", "name": "CYPROMIN [120mL] SOLUTION 0.4MC", "expected_quantity": 5, "storage_location": "Z9", "category": "X", "page_number": 1 },
    { "barcode": "", "product_code": "AC46990429", "name": "EYEHELP EYE DROPS 0.01% 10ML", "expected_quantity": 1, "storage_location": "Z9", "category": "X", "page_number": 1 },
    { "barcode": "", "product_code": "", "name": "某藥品名稱", "expected_quantity": 2, "storage_location": "", "category": "", "page_number": 3 }
  ]
}

注意事項：
1. 忽略所有表格樣式、頁碼或其他雜訊。
2. 保持項目在截圖中出現的物理順序。
3. storage_location 和 category 是選填欄位，如果圖中沒有明確顯示，請務必設為空字串，不要猜測。
4. barcode 是國際條碼，一定是純數字（如 471020120000）；完全看不到數字條碼時請設為空字串。
5. product_code 是商品條碼／健保碼（通常為字母開頭的健保代碼如 AC16496100，或 EAN-13 商品碼），若無則為空字串。
6. expected_quantity 必須是非負整數（>= 0），絕不能為負數。
7. 不要輸出任何 Markdown 程式碼塊標記，只要純 JSON。`;

    const result = await model.generateContent([prompt, ...imageParts]);
    const text = result.response.text();
    console.log('Gemini raw response (batch):', text);

    // 清理可能存在的 Markdown 標記
    const cleanedText = await repairGeminiJson(text);
    console.log('Gemini cleaned JSON (batch):', cleanedText);
    const parsed = JSON.parse(cleanedText);

    // 解析 items 陣列，對 quantity 做正則防禦
    const rawItems: Array<{
      barcode?: string;
      product_code?: string;
      name?: string;
      expected_quantity?: number | string;
      storage_location?: string;
      category?: string;
      page_number?: number;
    }> = Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed) ? parsed : []);

    const items: PageItem[] = rawItems.map((item, idx) => {
      // 若 expected_quantity 是字串（如 "1罐" 或 "-102"），用正則提取數字
      let expectedQuantity = 0;
      if (typeof item.expected_quantity === 'number') {
        expectedQuantity = item.expected_quantity;
      } else if (typeof item.expected_quantity === 'string') {
        // 先 trim 再用正則找第一個數字（不限位置）
        const fullMatch = item.expected_quantity.trim().match(/-?\d+/);
        expectedQuantity = fullMatch ? parseInt(fullMatch[0], 10) : 0;
      }
      // 防禦：數量不得為負數
      expectedQuantity = Math.max(0, expectedQuantity);

      return {
        storage_location: item.storage_location || '',
        category: item.category || '',
        barcode: (item.barcode || '').trim(),
        product_code: item.product_code ? (item.product_code || '').trim() : '',
        drug_name: item.name || '',
        quantity: expectedQuantity.toString(),
        page_number: item.page_number,
        upload_index: batchIndex * 100 + idx,
      };
    });

    return { 
      success: true, 
      order_number: parsed.order_number, 
      delivery_date: parsed.delivery_date, 
      total_pages: parsed.total_pages, 
      items 
    };
  } catch (error: unknown) {
    console.error('processSingleBatchWithGemini Error:', error);
    const rawMessage = error instanceof Error ? error.message : '批次 OCR 辨識失敗';
    return { success: false, error: await friendlyGeminiError(rawMessage) };
  }
}

/**
 * 主入口 Server Action：使用 Gemini OCR 解析整份 PDF（合併圖片模式）
 * 供 pdfParser.ts 呼叫
 */
export async function parsePdfWithGemini({ urls }: { urls: string[] }): Promise<{ success: boolean; data?: {
  order_metadata: { order_number: string; delivery_date: string; total_items: number };
  items: Array<{
    line_number: number;
    barcode: string;
    product_code: string | undefined;
    drug_name: string;
    quantity: number;
    bonus_quantity: number;
    storage_location: string;
    category: string;
    merged_count: number;
  }>;
}; error?: string }> {
  try {
    // 1. 第一張合併圖提取表頭（通常第一頁在第一張圖頂部）
    const headerResult = await parseHeaderWithGemini(urls[0]);
    if (!headerResult.success || !headerResult.order_number) {
      return { success: false, error: headerResult.error || '表頭解析失敗' };
    }
    
    // 2. 並行提取每批合併圖 (CSV 模式)
    const BATCH_SIZE = 3; // 限制並發數
    const allBatchResults: Array<{ batchIndex: number; items: PageItem[] }> = [];

    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
      const batch = urls.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (url, batchIdx) => {
          const globalBatchIdx = i + batchIdx;
          // 第一次嘗試
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
    }

    // 3. 合併所有 items，按頁碼排序後重新編號
    allBatchResults.sort((a, b) => a.batchIndex - b.batchIndex);
    const rawItems: PageItem[] = allBatchResults.flatMap(r => r.items);

    if (rawItems.length === 0) {
      return { success: false, error: '未辨識到任何藥品項目，請確認 PDF 內容是否為總倉撿貨單' };
    }

    // 穩健排序：按頁碼排序，頁碼缺失時 fallback 到上傳順序
    rawItems.sort((a, b) => {
      if (a.page_number != null && b.page_number != null) return a.page_number - b.page_number;
      if (a.page_number != null) return -1; // 有頁碼的排前面
      if (b.page_number != null) return 1;
      return (a.upload_index ?? 0) - (b.upload_index ?? 0);
    });

    // 以條碼為鍵合併相同項目（expected_quantity 累加），並記錄合併次數
    const barcodeMap = new Map<string, { barcode: string; product_code?: string; drug_name: string; expected_quantity: number; storage_location: string; category: string }>();
    const mergeCountMap = new Map<string, number>(); // 記錄每個條碼出現次數
    for (const item of rawItems) {
      // 從原始 quantity 字串提取數字
      const match = item.quantity.match(/\d+/);
      const qty = match ? parseInt(match[0], 10) : 0;

      const key = item.barcode || item.product_code || `__NO_BARCODE_${barcodeMap.size}__`;
      const existing = barcodeMap.get(key);
      if (existing) {
        existing.expected_quantity += qty;
      } else {
        barcodeMap.set(key, {
          barcode: item.barcode,
          product_code: item.product_code,
          drug_name: item.drug_name,
          expected_quantity: qty,
          storage_location: item.storage_location,
          category: item.category,
        });
      }
      mergeCountMap.set(key, (mergeCountMap.get(key) || 0) + 1);
    }

    // 4. 重新編號（已按頁碼排好序）
    const finalItems = [...barcodeMap.entries()].map(([key, item], idx) => ({
      line_number: idx + 1,
      barcode: item.barcode,
      product_code: item.product_code && item.product_code !== item.barcode ? item.product_code : undefined,
      drug_name: item.drug_name,
      quantity: item.expected_quantity,
      bonus_quantity: 0,
      storage_location: item.storage_location,
      category: item.category,
      merged_count: mergeCountMap.get(key) || 1,
    }));

    return {
      success: true,
      data: {
        order_metadata: {
          order_number: headerResult.order_number,
          delivery_date: headerResult.delivery_date || '',
          total_items: finalItems.length,
        },
        items: finalItems,
      },
    };
  } catch (error: unknown) {
    console.error('parsePdfWithGemini Error:', error);
    const rawMessage = error instanceof Error ? error.message : 'PDF 解析過程中發生錯誤';
    return {
      success: false,
      error: await friendlyGeminiError(rawMessage),
    };
  }
}

// ---------------------------------------------------------------------------
// 截圖 OCR（照片匯入模式）
// ---------------------------------------------------------------------------

/**
 * 處理單一批次的多張圖片（最多 3 張）- 內部函數
 * 返回 PageItem[] 格式，供分批協調器使用
 */
async function processBatchForImages({ urls, batchIndex }: { urls: string[]; batchIndex: number }): Promise<{ success: boolean; order_number?: string; delivery_date?: string; total_pages?: number; items?: PageItem[]; error?: string }> {
  return processSingleBatchWithGemini(urls, batchIndex);
}

/**
 * 使用 Gemini Vision OCR 提取藥品數據（總倉撿貨單格式）
 * 分批處理：每批最多 3 張圖片，避免 Gemini 輸出 token 截斷
 */
export async function processImagesWithGemini({ urls }: { urls: string[] }): Promise<{ success: boolean; order_number?: string; delivery_date?: string; total_pages?: number; drugs?: ImportDrugItem[]; error?: string }> {
  try {
    const BATCH_SIZE = 1; // 每批 1 張照片，避免 Gemini 輸出 token 截斷（6 張 → 6 次 API 呼叫）
    const MAX_RETRIES = 2; // 每批次最多重試 2 次
    const allBatchResults: Array<{ batchIndex: number; order_number?: string; delivery_date?: string; total_pages?: number; items: PageItem[] }> = [];

    // 分批處理
    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
      const batch = urls.slice(i, i + BATCH_SIZE);
      const batchIndex = i / BATCH_SIZE;
      
      let result = await processBatchForImages({ urls: batch, batchIndex });
      
      // 重試邏輯：最多重試 MAX_RETRIES 次
      let retryCount = 0;
      while ((!result.success || !result.items) && retryCount < MAX_RETRIES) {
        retryCount++;
        console.log(`批次 ${batchIndex + 1} OCR 失敗，重試 ${retryCount}/${MAX_RETRIES}...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // 逐次遞增延遲
        result = await processBatchForImages({ urls: batch, batchIndex });
      }
      
      if (!result.success || !result.items) {
        const errorMsg = result.error || '未知錯誤';
        throw new Error(`批次 ${batchIndex + 1} OCR 辨識失敗: ${errorMsg}`);
      }
      
      allBatchResults.push({
        batchIndex,
        order_number: result.order_number,
        delivery_date: result.delivery_date,
        total_pages: result.total_pages,
        items: result.items,
      });
    }

    if (allBatchResults.length === 0) {
      return { success: false, error: '未辨識到任何藥品項目' };
    }

    // 合併所有批次結果
    // 取第一個成功批次的表頭資訊
    const firstResult = allBatchResults[0];
    const order_number = firstResult.order_number || '未知單號';
    const delivery_date = firstResult.delivery_date || '';
    const total_pages = firstResult.total_pages || 1;

    // 合併所有 items
    const rawItems: PageItem[] = allBatchResults.flatMap(r => r.items);

    // 穩健排序：按頁碼排序，頁碼缺失時 fallback 到上傳順序
    rawItems.sort((a, b) => {
      if (a.page_number != null && b.page_number != null) return a.page_number - b.page_number;
      if (a.page_number != null) return -1;
      if (b.page_number != null) return 1;
      return (a.upload_index ?? 0) - (b.upload_index ?? 0);
    });

    // 轉換為 ImportDrugItem 格式
    const drugs: ImportDrugItem[] = rawItems.map((item) => ({
      barcode: item.barcode,
      product_code: item.product_code || '',
      name: item.drug_name,
      expected_quantity: Math.max(0, parseInt(item.quantity) || 0),
      bonus_quantity: 0,
      storage_location: item.storage_location,
      category: item.category,
    }));

    return { success: true, order_number, delivery_date, total_pages, drugs };
  } catch (error: unknown) {
    console.error('Gemini OCR Error:', error);
    const rawMessage = error instanceof Error ? error.message : 'OCR 辨識失敗';
    return { success: false, error: await friendlyGeminiError(rawMessage) };
  }
}

/**
 * 照片匯入 OCR → ParsedPdf 轉換，用於 PreviewPanel 預覽
 * 同時透過 NHI 將條碼對應為中文品名
 */
export async function processImagesWithGeminiAsPdf({ urls }: { urls: string[] }): Promise<{ success: boolean; data?: ParsedPdf; error?: string }> {
  const ocrResult = await processImagesWithGemini({ urls });
  if (!ocrResult.success || !ocrResult.drugs) {
    return { success: false, error: ocrResult.error };
  }

  // 批次查詢 NHI 中文名稱（一次性 in 查詢，效能最佳）
  // 使用商品代碼 (product_code) 取得中文藥名，因為 NHI 資料庫已改為以 product_code 為鍵
  const barcodes = ocrResult.drugs
    .map(d => d.product_code?.trim())
    .filter((b): b is string => !!b);
  console.log(`[NHI] OCR mapping start, ${barcodes.length} 條碼`);

  const nhiMap = await batchLookupNhi(barcodes);

  const items: ParsedItem[] = ocrResult.drugs.map((drug, idx) => {
      const chineseName = drug.product_code ? nhiMap.get(drug.product_code.trim()) : undefined;
      return {
        line_number: idx + 1,
        barcode: drug.barcode,
        product_code: drug.product_code,
        drug_name: chineseName || drug.name,
        quantity: drug.expected_quantity,
        bonus_quantity: drug.bonus_quantity,
        storage_location: drug.storage_location || '',
        category: drug.category || '',
      };
    });

  const data: ParsedPdf = {
    order_metadata: {
      order_number: ocrResult.order_number || '未知單號',
      delivery_date: ocrResult.delivery_date || '',
      total_items: items.length,
      source_type: 'images',
      uploaded_image_count: urls.length,
      ocr_page_count: ocrResult.total_pages,
      ocr_request_count: urls.length, // 每張照片一次 API 呼叫
    },
    items,
  };

  return { success: true, data };
}