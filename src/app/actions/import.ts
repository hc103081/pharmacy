'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ParsedItem, ParsedPdf } from '@/lib/pdfParser';

export interface ImportDrugItem {
  barcode: string;
  name: string;
  expected_quantity: number;
  bonus_quantity: number; // [保留欄位，新格式固定為 0]
  storage_location?: string; // 儲位
  category?: string; // 類別
}

export interface ImportResponse {
  success: boolean;
  manifestId?: string;
  error?: string;
  totalItems?: number;
}

// ---------------------------------------------------------------------------
// Gemini OCR helpers for PDF parsing
// ---------------------------------------------------------------------------

/**
 * 輔助函數：從 URL 獲取圖片並轉換為 Base64
 */
async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * 將 Gemini API 錯誤轉換為友善的中文提示訊息
 */
function friendlyGeminiError(rawMessage: string): string {
  if (rawMessage.includes('503') || rawMessage.includes('Service Unavailable') || rawMessage.includes('high demand')) {
    return 'AI 服務暫時過載 (503)，請稍後 1-2 分鐘再試。若持續發生，請聯絡管理員。';
  }
  if (rawMessage.includes('429') || rawMessage.includes('rate') || rawMessage.includes('quota')) {
    return 'AI API 配額已用盡或請求過於頻繁 (429)，請稍後再試。';
  }
  if (rawMessage.includes('500') || rawMessage.includes('Internal Error')) {
    return 'AI 服務內部錯誤 (500)，請稍後再試。';
  }
  return rawMessage;
}

/**
 * 從總倉撿貨單第一頁提取表頭資訊（出貨單號、交貨日期、頁碼）
 */
export async function parseHeaderWithGemini(url: string): Promise<{ success: boolean; order_number?: string; delivery_date?: string; page_number?: number; total_pages?: number; error?: string }> {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return { success: false, error: '伺服器未配置 GOOGLE_API_KEY，請在 Vercel 環境變數中設定' };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

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
    const text = result.response.text().replace(/```json|```/g, '').trim();
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
      error: friendlyGeminiError(rawMessage),
    };
  }
}

interface PageItem {
  storage_location: string;
  category: string;
  barcode: string;
  drug_name: string;
  quantity: string; // 原始字串如 "1罐"，後續用正則提取數字
  page_number?: number; // 照片頁碼（用於排序）
  upload_index?: number; // 原始上傳順序（fallback 排序）
}

/**
 * 使用 Gemini OCR 提取一批合併圖片中的藥品項目 (JSON 格式)
 */
export async function parseBatchWithGemini(url: string, _batchIndex: number): Promise<{ success: boolean; items?: PageItem[]; error?: string }> {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return { success: false, error: '伺服器未配置 GOOGLE_API_KEY，請在 Vercel 環境變數中設定' };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

    const base64Data = await fetchImageAsBase64(url);

    const prompt = `這是一組合併後的藥局總倉撿貨單圖片（包含多頁）。
請提取所有藥品項目，並以 JSON 格式輸出。

提取欄位：
- storage_location: 儲位（如 F3），找不到請設為空字串，不要猜測或自動填補
- category: 類別（如 4），找不到請設為空字串，不要猜測或自動填補
- barcode: 健保代碼（格式如 A000015421、AC16496100），找不到請設為空字串
- drug_name: 中文品名
- quantity: 補貨量（保留原始格式如 "1罐"、"5盒"）

同時請找出圖片底部的頁次資訊（如「頁次 3 of 6」），並在回傳中加入 page_number 和 total_pages。

輸出格式（嚴格 JSON，不要 markdown 標記）：
{
  "page_number": 3,
  "total_pages": 6,
  "items": [
    {"storage_location": "F3", "category": "4", "barcode": "AC16496100", "drug_name": "胃利贊膜衣錠20毫克", "quantity": "1罐"},
    {"storage_location": "", "category": "4", "barcode": "", "drug_name": "某藥品名稱", "quantity": "2盒"}
  ]
}

注意事項：
1. 這是一份專業的藥局總倉撿貨單，請特別注意中文字形辨識，避免將藥品名稱誤判為無意義的文字。
2. storage_location 和 category 是選填欄位，如果照片中沒有明確顯示，請務必設為空字串，不要猜測。
3. barcode 欄位如果是健保代碼（格式如 A000015421、AC16496100）或廠商自編碼，請如實回傳；如果完全看不到任何代碼，請設為空字串。
4. 保持項目在圖片中出現的物理順序。
5. 忽略表頭、頁尾及其他非藥品項目內容。
6. quantity 欄位保留原始格式（如 "1罐"、"5盒"），不要轉為純數字。`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64Data, mimeType: 'image/jpeg' } },
    ]);

    const text = result.response.text().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);

    // 提取頁碼資訊
    const pageNumber: number | undefined = parsed.page_number;
    const totalPages: number | undefined = parsed.total_pages;

    // 解析 items 陣列
    const rawItems: Array<{
      storage_location?: string;
      category?: string;
      barcode?: string;
      drug_name?: string;
      quantity?: string;
    }> = Array.isArray(parsed.items) ? parsed.items : [];

    const items: PageItem[] = rawItems.map((item, idx) => {
      const rawQuantity = item.quantity || '';
      const match = rawQuantity.match(/\d+/);
      const expected_quantity = match ? parseInt(match[0], 10) : 0;

      // 若 expected_quantity === 0，在 drug_name 標記需確認
      const drugName = expected_quantity === 0 && item.drug_name
        ? `${item.drug_name}(數量待確認)`
        : (item.drug_name || '');

      return {
        storage_location: item.storage_location || '',
        category: item.category || '',
        barcode: (item.barcode || '').trim(),
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
      error: friendlyGeminiError(rawMessage),
    };
  }
}

/**
 * 主入口 Server Action：使用 Gemini OCR 解析整份 PDF
 * 供 pdfParser.ts 呼叫
 */
export async function parsePdfWithGemini({ urls }: { urls: string[] }): Promise<{ success: boolean; data?: ParsedPdf; error?: string }> {
  try {
    // 1. 第一張合併圖提取表頭（通常第一頁在第一張圖頂部）
    const headerResult = await parseHeaderWithGemini(urls[0]);
    if (!headerResult.success || !headerResult.order_number) {
      return { success: false, error: headerResult.error || '表頭解析失敗' };
    }
    
    // 2. 並行提取每批合併圖 (CSV 模式)
    const BATCH_SIZE = 3; // 這裡的 urls 已經是合併後的結果
    const allBatchResults: { batchIndex: number; items: PageItem[] }[] = [];

    // 由於客戶端已經合併，這裡的 urls.length = ceil(總頁數 / 3)
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
          return { batchIndex: globalBatchIdx, items: result.items || [] };
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
    const barcodeMap = new Map<string, { barcode: string; drug_name: string; expected_quantity: number; storage_location: string; category: string }>();
    const mergeCountMap = new Map<string, number>(); // 記錄每個條碼出現次數
    for (const item of rawItems) {
      const key = item.barcode.trim();
      // 從原始 quantity 字串提取數字
      const match = item.quantity.match(/\d+/);
      const qty = match ? parseInt(match[0], 10) : 0;

      if (!key) {
        const fakeKey = `__NO_BARCODE_${barcodeMap.size}__`;
        barcodeMap.set(fakeKey, {
          barcode: item.barcode,
          drug_name: item.drug_name,
          expected_quantity: qty,
          storage_location: item.storage_location,
          category: item.category,
        });
        mergeCountMap.set(fakeKey, 1);
        continue;
      }
      mergeCountMap.set(key, (mergeCountMap.get(key) || 0) + 1);
      const existing = barcodeMap.get(key);
      if (existing) {
        existing.expected_quantity += qty;
      } else {
        barcodeMap.set(key, {
          barcode: item.barcode,
          drug_name: item.drug_name,
          expected_quantity: qty,
          storage_location: item.storage_location,
          category: item.category,
        });
      }
    }

    // 4. 重新編號（已按頁碼排好序）
    const finalItems: ParsedItem[] = [...barcodeMap.entries()].map(([key, item], idx) => ({
      line_number: idx + 1,
      barcode: item.barcode,
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
      error: friendlyGeminiError(rawMessage),
    };
  }
}

// ---------------------------------------------------------------------------
// 截圖 OCR（保留）
// ---------------------------------------------------------------------------

/**
 * 使用 Gemini Vision OCR 提取藥品數據（總倉撿貨單格式）
 */
export async function processImagesWithGemini({ urls }: { urls: string[] }): Promise<{ success: boolean; order_number?: string; delivery_date?: string; drugs?: ImportDrugItem[]; error?: string }> {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return { success: false, error: '伺服器未配置 GOOGLE_API_KEY' };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

    // 將 URL 轉換為 Gemini 要求的 inlineData 格式
    const imageParts = await Promise.all(urls.map(async (url) => {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      // 使用 btoa + Uint8Array 替代 Buffer（Edge Runtime 相容）
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);
      const mimeType = response.headers.get('content-type') || 'image/jpeg';
      return {
        inlineData: {
          data: base64Data,
          mimeType,
        },
      };
    }));

    const prompt = `你是一個精準的醫藥清單 OCR 提取專家。請分析提供的總倉撿貨單截圖。

請從第一張圖片中找出：
1. 出貨單號 (order_number)，格式如 R012606220001
2. 列印時間 (delivery_date)，請將日期格式化為 YYYY-MM-DD

然後請分析所有圖片，提取出所有藥品項目。

藥品欄位：
- barcode: 健保代碼（格式如 A000015421、AC16496100），找不到請設為空字串
- name: 中文品名
- expected_quantity: 補貨量（數字）
- storage_location: 儲位（如 F3），找不到請設為空字串
- category: 類別（如 4），找不到請設為空字串

同時請找出每張圖片底部的頁次資訊（如「頁次 3 of 6」），並在回傳中包含 page_number 和 total_pages。

輸出格式（嚴格 JSON，不要 markdown 標記）：
{
  "order_number": "R012606220001",
  "delivery_date": "2026-06-22",
  "items": [
    { "barcode": "AC16496100", "name": "胃利贊膜衣錠20毫克", "expected_quantity": 1, "storage_location": "F3", "category": "4", "page_number": 3 },
    { "barcode": "", "name": "某藥品名稱", "expected_quantity": 2, "storage_location": "", "category": "4", "page_number": 3 }
  ]
}

注意事項：
1. 忽略所有表格樣式、頁碼或其他雜訊。
2. 保持項目在截圖中出現的物理順序。
3. storage_location 和 category 是選填欄位，如果圖中沒有明確顯示，請務必設為空字串，不要猜測。
4. barcode 如果是健保代碼（格式如 AC12345678）或廠商自編碼，請如實回傳；完全看不到代碼時請設為空字串。
5. expected_quantity 必須是數字。
6. 不要輸出任何 Markdown 程式碼塊標記，只要純 JSON。`;

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text();

    // 清理可能存在的 Markdown 標記
    const cleanedText = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleanedText);

    // 解析 items 陣列，對 quantity 做正則防禦
    const rawItems: Array<{
      barcode?: string;
      name?: string;
      expected_quantity?: number | string;
      storage_location?: string;
      category?: string;
    }> = Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed) ? parsed : []);

    const drugs: ImportDrugItem[] = rawItems.map((item) => {
      // 若 expected_quantity 是字串（如 "1罐"），用正則提取數字
      let expectedQuantity = 0;
      if (typeof item.expected_quantity === 'number') {
        expectedQuantity = item.expected_quantity;
      } else if (typeof item.expected_quantity === 'string') {
        const match = item.expected_quantity.match(/\d+/);
        expectedQuantity = match ? parseInt(match[0], 10) : 0;
      }

      return {
        barcode: (item.barcode || '').trim(),
        name: item.name || '',
        expected_quantity: expectedQuantity,
        bonus_quantity: 0,
        storage_location: item.storage_location || '',
        category: item.category || '',
      };
    });

    return { success: true, order_number: parsed.order_number, delivery_date: parsed.delivery_date, drugs };
  } catch (error: unknown) {
    console.error('Gemini OCR Error:', error);
    const rawMessage = error instanceof Error ? error.message : 'OCR 辨識失敗';
    return { success: false, error: friendlyGeminiError(rawMessage) };
  }
}

// ---------------------------------------------------------------------------
// 圖片上傳 / 刪除（保留）
// ---------------------------------------------------------------------------

/**
 * 上傳匯入截圖至 Supabase Storage
 * 返回上傳後的檔案路徑清單
 */
export async function uploadImportImages(formData: FormData): Promise<{ success: boolean; urls?: string[]; error?: string }> {
  try {
    const files = formData.getAll('files') as File[];
    if (files.length === 0) {
      return { success: false, error: '沒有選擇任何檔案' };
    }

    const uploadedUrls: string[] = [];

    for (const file of files) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      const filePath = fileName; // 修正：路徑不應包含儲存桶名稱


      const { error } = await supabaseAdmin.storage
        .from('import_screenshots')
        .upload(filePath, file, {
          contentType: file.type,
          upsert: true,
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabaseAdmin.storage
        .from('import_screenshots')
        .getPublicUrl(filePath);

      uploadedUrls.push(publicUrl);
    }

    return { success: true, urls: uploadedUrls };
  } catch (error: unknown) {
    console.error('Upload Error:', error);
    if (error instanceof Error) {
    return { success: false, error: error.message };
  }
  return { success: false, error: '圖片上傳失敗' };
  }
}

/**
 * 從 Supabase Storage 中刪除匯入的圖片
 */
export async function deleteImportImages(urls: string[]): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabaseAdmin.storage
      .from('import_screenshots')
      .remove(urls.map(url => url.split('/').pop()!)); // 取得檔名進行刪除

    if (error) throw error;

    return { success: true };
  } catch (error: unknown) {
    console.error('Delete Images Error:', error);
    if (error instanceof Error) {
    return { success: false, error: error.message };
  }
  return { success: false, error: '刪除圖片失敗' };
  }
}

// ---------------------------------------------------------------------------
// 匯入藥品（保留）
// ---------------------------------------------------------------------------

export async function importDrugs(
  manifestName: string,
  drugs: ImportDrugItem[],
  userId: string,
  options: { order_number?: string, delivery_date?: string, source_file?: string, source_images?: string[] } = {}
): Promise<ImportResponse> {
  try {
    if (!drugs || drugs.length === 0) {
      return { success: false, error: '藥品清單不能為空' };
    }

    // 0. 合併相同條碼的項目（數量疊加，保留 storage_location 和 category）
    const mergedMap = new Map<string, ImportDrugItem>();
    for (const drug of drugs) {
      const key = drug.barcode.trim();
      if (!key) {
        // 無條碼項目不合併，各自保留
        const fakeKey = `__NO_BARCODE_${mergedMap.size}__`;
        mergedMap.set(fakeKey, { ...drug });
        continue;
      }
      const existing = mergedMap.get(key);
      if (existing) {
        existing.expected_quantity += drug.expected_quantity;
      } else {
        mergedMap.set(key, { ...drug });
      }
    }
    const mergedDrugs = [...mergedMap.values()];
    
    // 0.5. NHI 藥品中文名稱查詢與替換
    console.log(`[NHI] 開始查詢，共 ${mergedDrugs.length} 筆藥品`);
    const drugsWithChineseName = await Promise.all(
      mergedDrugs.map(async (drug) => {
        // 如果有條碼（健保代碼），查詢 NHI 取得中文名稱
        if (drug.barcode && drug.barcode.trim() !== '') {
          try {
            const trimmed = drug.barcode.trim();
            console.log(`[NHI] 查詢條碼: "${trimmed}"`);
            const { data, error } = await supabaseAdmin
              .from('nhi_drug_lookup')
              .select('drug_code, chinese_name')
              .eq('drug_code', trimmed)
              .maybeSingle();
            
            console.log(`[NHI] 查詢結果 for "${trimmed}":`, data ? `找到 - ${data.chinese_name}` : '未找到');
            
            if (data && data.chinese_name) {
              // 使用 NHI 查得的中文名稱
              return { ...drug, name: data.chinese_name };
            }
          } catch (error) {
            // 查詢失敗時保留原名稱，不中斷流程
            console.warn(`[NHI] 查詢失敗 for barcode ${drug.barcode}:`, error);
          }
        }
        // 無條碼或查詢失敗時保留原名稱
        return drug;
      })
    );

    // 1. 建構明細資料（分頁與排序）
    const ITEMS_PER_PAGE = 44;
    const drugItemsToInsert = drugsWithChineseName.map((drug, index) => {
      const itemOrder = index + 1;
      const pageNumber = Math.ceil(itemOrder / ITEMS_PER_PAGE);

      return {
        item_order: itemOrder,
        page_number: pageNumber,
        barcode: drug.barcode,
        name: drug.name,
        expected_quantity: drug.expected_quantity,
        bonus_quantity: 0,
        storage_location: drug.storage_location || '',
        category: drug.category || '',
      };
    });

    // 2. 原子化寫入：單一 RPC 交易同時建立 manifest + drug_items
    const { data: manifestId, error: rpcError } = await supabaseAdmin.rpc(
      'create_manifest_with_items',
      {
        p_manifest: {
          name: manifestName,
          order_number: options.order_number ?? '',
          delivery_date: options.delivery_date ?? '',
          source_file: options.source_file ?? '',
          total_items: drugItemsToInsert.length,
          user_id: userId,
          source_images: options.source_images ?? [],
        },
        p_items: drugItemsToInsert,
      },
    );

    if (rpcError || !manifestId) {
      throw new Error(`匯入清單失敗: ${rpcError?.message ?? 'RPC 未回傳 manifestId'}`);
    }

    return {
      success: true,
      manifestId: manifestId as string,
      totalItems: drugsWithChineseName.length,
    };

  } catch (error: unknown) {
      console.error('Import Error:', error);
      let errorMessage = '發生未知錯誤';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      return {
        success: false,
        error: errorMessage,
      };
    }
}
