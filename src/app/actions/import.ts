'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

/**
 * 使用 Gemini Vision OCR 提取藥品數據
 */
export async function processImagesWithGemini(urls: string[]): Promise<{ success: boolean; drugs?: ImportDrugItem[]; error?: string }> {
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

/**
 * 使用 Gemini Vision 進行 PDF 頁面的 OCR 修正 (Fallback)
 * 處理規則解析可能失敗或出現亂碼的情況
 */
export async function processPDFPagesWithGemini(base64Images: string[]): Promise<{ success: boolean; order_metadata?: { order_number: string; delivery_date: string }; drugs?: ImportDrugItem[]; error?: string }> {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return { success: false, error: '伺服器未配置 GOOGLE_API_KEY' };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // Use flash for speed and vision support

    const imageParts = base64Images.map((base64) => ({
      inlineData: {
        data: base64.split(',')[1] || base64, // Ensure only the base64 part is sent
        mimeType: 'image/jpeg',
      },
    }));

    const prompt = `
      你是一個精準的醫藥清單 OCR 提取專家。
      請分析提供的圖片（這些是出貨單的截圖），提取出所有相關資訊。
      
      提取要求：
      1. 必須提取以下資訊，並以 JSON 格式輸出：
         - order_metadata:
           - order_number: 出貨單號 (請務必精確)
           - delivery_date: 交貨日期 (格式: YYYY-MM-DD)
         - items: 藥品項目陣列
           - barcode: 藥品條碼 (請務必精確，不要腦補，若不確定請設為空字串)
           - name: 藥品名稱 (請務必精確，若有亂碼請根據上下文推斷正確名稱)
           - quantity: 應有數量 (數字)
           - bonus_quantity: 贈量 (數字，若無則設為 0)
           - line_number: 序號 (數字)
      2. 忽略所有表格樣式、頁碼、標題或其他雜訊。
      3. 保持項目在圖片中出現的物理順序。
      4. 如果某個欄位缺失，請設為 0 或空字串。
      5. 輸出格式必須是嚴格的 JSON 物件，例如:
         {
           "order_metadata": { "order_number": "SN12345", "delivery_date": "2026-06-14" },
           "items": [
             { "line_number": 1, "barcode": "12345678", "name": "藥品 A", "quantity": 10, "bonus_quantity": 2 },
             { "line_number": 2, "barcode": "87654321", "name": "藥品 B", "quantity": 5, "bonus_quantity": 0 }
           ]
         }
      不要輸出任何 Markdown 程式碼塊標記 (如 \`\`\`json)，只要純 JSON。
    `;

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text();
    
    const cleanedText = text.replace(/```json|```/g, '').trim();
    const parsedData = JSON.parse(cleanedText);

    // Map items to ImportDrugItem structure
    const mappedDrugs: ImportDrugItem[] = parsedData.items.map((d: any) => ({
      barcode: d.barcode,
      name: d.name,
      expected_quantity: (d.quantity || 0) + (d.bonus_quantity || 0),
      bonus_quantity: d.bonus_quantity || 0,
    }));

    return { 
      success: true, 
      order_metadata: parsedData.order_metadata,
      drugs: mappedDrugs 
    };
  } catch (error: any) {
    console.error('Gemini Vision Fallback Error:', error);
    return { success: false, error: error.message || 'Gemini Vision 辨識失敗' };
  }
}

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
