'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ParsedItem, ParsedPdf } from '@/lib/pdfParser';

export interface ImportDrugItem {
  barcode: string;
  name: string;
  expected_quantity: number;
  bonus_quantity: number;
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
 * 從出貨單第一頁提取表頭資訊（出貨單號、交貨日期）
 */
async function parseHeaderWithGemini(firstPageBase64: string): Promise<{ order_number: string; delivery_date: string }> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('伺服器未配置 GOOGLE_API_KEY');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  const base64Data = firstPageBase64.replace(/^data:image\/\w+;base64,/, '');

  const prompt = `這是安得福藥局出貨單的第一頁。請找出以下資訊：
1. 出貨單號 (order_number)
2. 出貨日期 (delivery_date)，請將日期格式化為 YYYY-MM-DD

輸出嚴格 JSON 格式，不要 markdown 標記：
{ "order_number": "單號", "delivery_date": "YYYY-MM-DD" }`;

  const result = await model.generateContent([
    prompt,
    { inlineData: { data: base64Data, mimeType: 'image/jpeg' } },
  ]);
  const text = result.response.text().replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(text);
  return {
    order_number: parsed.order_number || '未知單號',
    delivery_date: parsed.delivery_date || '',
  };
}

interface PageItem {
  line_number: number;
  barcode: string;
  drug_name: string;
  quantity: number;
  bonus_quantity: number;
}

/**
 * 使用 Gemini OCR 提取單頁藥品項目
 */
async function parsePageWithGemini(pageBase64: string, pageIndex: number): Promise<PageItem[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('伺服器未配置 GOOGLE_API_KEY');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  const base64Data = pageBase64.replace(/^data:image\/\w+;base64,/, '');

  const prompt = `這是安得福藥局出貨單的第 ${pageIndex + 1} 頁。
每行格式為：序號 商品代號(條碼) 品名 數量 贈量 單位 單價 折數 小計 備註

提取規則：
1. 只提取以下欄位：line_number(序號)、barcode(商品代號)、drug_name(品名)、quantity(數量)、bonus_quantity(贈量)
2. 不要提取表頭行（「序 商品代號 品 名...」那一行）
3. 不要提取頁尾行（「頁計」、「已收」、「折扣」、「稅額」、「應收」、「總計」等）
4. 不要提取「以下空白」之後的內容
5. 品名可能含數字（如「輕酵素-2s/包(3包100元)」），這些是品名的一部分，不要誤判為數量
6. quantity 和 bonus_quantity 必須是數字型態
7. 輸出嚴格 JSON 陣列，不要 markdown 標記：
[
  { "line_number": 1, "barcode": "12345678", "drug_name": "品名", "quantity": 10, "bonus_quantity": 0 }
]`;

  const result = await model.generateContent([
    prompt,
    { inlineData: { data: base64Data, mimeType: 'image/jpeg' } },
  ]);
  const text = result.response.text().replace(/```json|```/g, '').trim();
  const items: PageItem[] = JSON.parse(text);
  return items;
}

/**
 * 主入口 Server Action：使用 Gemini OCR 解析整份 PDF
 * 供 pdfParser.ts 呼叫
 */
export async function parsePdfWithGemini({ images: base64Images }: { images: string[] }): Promise<ParsedPdf> {
  // 1. 第一頁提取表頭（只送第一頁）
  const header = await parseHeaderWithGemini(base64Images[0]);

  // 2. 分批並行提取每頁藥品（每批 3 頁）
  const BATCH_SIZE = 3;
  const allPageResults: { pageIndex: number; items: PageItem[] }[] = [];

  for (let i = 0; i < base64Images.length; i += BATCH_SIZE) {
    const batch = base64Images.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (img, batchIdx) => {
        const pageIndex = i + batchIdx;
        // 單頁失敗自動重試 1 次
        try {
          const items = await parsePageWithGemini(img, pageIndex);
          return { pageIndex, items };
        } catch {
          // 等 1 秒後重試
          await new Promise(resolve => setTimeout(resolve, 1000));
          const items = await parsePageWithGemini(img, pageIndex);
          return { pageIndex, items };
        }
      })
    );
    allPageResults.push(...batchResults);
  }

  // 3. 合併所有頁的 items，按照 pageIndex 排序
  allPageResults.sort((a, b) => a.pageIndex - b.pageIndex);
  const mergedItems: PageItem[] = allPageResults.flatMap(r => r.items);

  // 4. line_number 重新從 1 開始連續編號
  const finalItems: ParsedItem[] = mergedItems.map((item, idx) => ({
    line_number: idx + 1,
    barcode: item.barcode,
    drug_name: item.drug_name,
    quantity: item.quantity,
    bonus_quantity: item.bonus_quantity,
  }));

  return {
    order_metadata: {
      order_number: header.order_number,
      delivery_date: header.delivery_date,
      total_items: finalItems.length,
    },
    items: finalItems,
  };
}

// ---------------------------------------------------------------------------
// 截圖 OCR（保留）
// ---------------------------------------------------------------------------

/**
 * 使用 Gemini Vision OCR 提取藥品數據
 */
export async function processImagesWithGemini({ urls }: { urls: string[] }): Promise<{ success: boolean; drugs?: ImportDrugItem[]; error?: string }> {
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

    const prompt = `
      你是一個精準的醫藥清單 OCR 提取專家。
      請分析提供的截圖，提取出所有藥品項目。

      提取要求：
      1. 僅提取以下三個欄位：
         - barcode: 藥品條碼 (數字字串)
         - name: 藥品名稱
         - expected_quantity: 應有數量 (數字)
      2. 忽略所有表格樣式、頁碼或其他雜訊。
      3. 保持項目在截圖中出現的物理順序。
      4. 如果某個欄位缺失，請設為空字串或 0。
      5. 輸出格式必須是嚴格的 JSON 陣列，例如:
         [
           { "barcode": "12345678", "name": "藥品 A", "expected_quantity": 10 },
           { "barcode": "87654321", "name": "藥品 B", "expected_quantity": 5 }
         ]
      不要輸出任何 Markdown 程式碼塊標記 (如 \`\`\`json)，只要純 JSON。
    `;

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text();

    // 清理可能存在的 Markdown 標記
    const cleanedText = text.replace(/```json|```/g, '').trim();
    const drugs: ImportDrugItem[] = JSON.parse(cleanedText);

    return { success: true, drugs };
  } catch (error: any) {
    console.error('Gemini OCR Error:', error);
    return { success: false, error: error.message || 'OCR 辨識失敗' };
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


      const { data, error } = await supabaseAdmin.storage
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
  } catch (error: any) {
    console.error('Upload Error:', error);
    return { success: false, error: error.message || '圖片上傳失敗' };
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
  } catch (error: any) {
    console.error('Delete Images Error:', error);
    return { success: false, error: error.message || '刪除圖片失敗' };
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

    // 1. 建立 Manifest (清單批號)
    const { data: manifest, error: manifestError } = await supabaseAdmin
      .from('manifests')
      .insert({
        name: manifestName,
        order_number: options.order_number,
        delivery_date: options.delivery_date,
        source_file: options.source_file,
        total_items: drugs.length,
        status: 'active',
        user_id: userId,
        source_images: options.source_images,
      })
      .select()
      .single();

    if (manifestError || !manifest) {
      throw new Error(`建立清單失敗: ${manifestError?.message}`);
    }

    // 2. 實作嚴格的分頁與排序
    const ITEMS_PER_PAGE = 44;
    const drugItemsToInsert = drugs.map((drug, index) => {
      const itemOrder = index + 1; // 原始流水號 (1, 2, 3...)
      const pageNumber = Math.ceil(itemOrder / ITEMS_PER_PAGE);

      return {
        manifest_id: manifest.id,
        item_order: itemOrder,
        page_number: pageNumber,
        barcode: drug.barcode,
        name: drug.name,
        expected_quantity: drug.expected_quantity,
        bonus_quantity: drug.bonus_quantity,
        counted_status: 'pending',
      };
    });

    // 3. 批量寫入資料庫
    const { error: insertError } = await supabaseAdmin
      .from('drug_items')
      .insert(drugItemsToInsert);

    if (insertError) {
      throw new Error(`批量匯入藥品失敗: ${insertError.message}`);
    }

    return {
      success: true,
      manifestId: manifest.id,
      totalItems: drugs.length,
    };

  } catch (error: any) {
    console.error('Import Error:', error);
    return {
      success: false,
      error: error.message || '發生未知錯誤',
    };
  }
}
