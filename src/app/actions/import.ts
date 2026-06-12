'use server';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ImportDrugItem {
  barcode: string;
  name: string;
  expected_quantity: number;
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
      const buffer = await response.arrayBuffer();
      const base64Data = Buffer.from(buffer).toString('base64');
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
      const filePath = `import_screenshots/${fileName}`;

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
 * 匯入藥品清單並實作嚴格的 44 項邏輯分頁
 * 依據原始輸入順序 (item_order) 進行切分
 */
export async function importDrugs(manifestName: string, drugs: ImportDrugItem[], sourceImages: string[] = []): Promise<ImportResponse> {
  try {
    if (!drugs || drugs.length === 0) {
      return { success: false, error: '藥品清單不能為空' };
    }

    // 1. 建立 Manifest (清單批號)
    const { data: manifest, error: manifestError } = await supabaseAdmin
      .from('manifests')
      .insert({
        name: manifestName,
        total_items: drugs.length,
        status: 'active',
        source_images: sourceImages,
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
