import { NextRequest } from 'next/server';
import { fetchImageAsBase64, repairGeminiJson, friendlyGeminiError, createGeminiModel } from '@/lib/gemini';
import { resolveNhiTranslations } from '@/lib/nhi';
import { applyNhiResults, sanitizeProductCode, sanitizeBarcode } from '@/lib/nhiMatch';
import type { ParsedItem, ParsedPdf } from '@/lib/pdfParser';
import type { PageItem } from '@/app/actions/import/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIMARY_MODEL = 'gemini-3.1-flash-lite';
const FALLBACK_MODEL = 'gemini-2.5-flash';
const MAX_RETRIES = 2;

/**
 * 輔助函數：向 SSE Stream 送出格式化事件
 */
function sendSseEvent(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  event: string,
  data: Record<string, unknown>
) {
  try {
    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  } catch (err) {
    console.error('[SSE send error]', err);
  }
}

/**
 * 驗證頁面項目數是否符合預期（非末頁必須滿 44 項）
 */
function validatePageItemCount(
  items: PageItem[],
  pageNumber: number | undefined,
  totalPages: number | undefined
): { warning?: { missing_count: number; page_number: number }; error?: string } {
  if (pageNumber == null || totalPages == null) return {};
  const count = items.length;
  const isLastPage = pageNumber === totalPages;

  if (count === 0) {
    return { error: `第 ${pageNumber} 頁未辨識到任何品項` };
  }

  if (!isLastPage) {
    if (count < 44) {
      return { warning: { missing_count: 44 - count, page_number: pageNumber } };
    }
    if (count > 44) {
      return { warning: { missing_count: count - 44, page_number: pageNumber } };
    }
  } else {
    if (count > 44) {
      return { warning: { missing_count: count - 44, page_number: pageNumber } };
    }
  }
  return {};
}

/**
 * 單一照片批次的 Gemini 辨識核心邏輯
 */
async function callGeminiForBatch(
  urls: string[],
  batchIndex: number,
  modelName: string
): Promise<{
  success: boolean;
  order_number?: string;
  delivery_date?: string;
  total_pages?: number;
  items?: PageItem[];
  error?: string;
}> {
  try {
    const model = await createGeminiModel(modelName);

    const imageParts = await Promise.all(
      urls.map(async (url) => {
        const base64Data = await fetchImageAsBase64(url);
        return {
          inlineData: {
            data: base64Data,
            mimeType: 'image/jpeg',
          },
        };
      })
    );

    const prompt = `你是一個精準的醫藥清單 OCR 提取專家。請分析提供的總倉撿貨單截圖（本批次共 ${urls.length} 張圖片）。

請從第一張圖片中找出：
1. 出貨單號 (order_number)，格式如 R012606220001
2. 列印時間 (delivery_date)，請將日期格式化為 YYYY-MM-DD

然後請分析所有 ${urls.length} 張圖片，逐行輸出每一筆藥品項目，不可跳過任何一行。即使某欄位無法辨識（條碼模糊、品名不清），仍需輸出該行，將無法辨識的欄位設為空字串。

藥品欄位：
- barcode: 國際條碼（純數字，格式如 471020120000），找不到請設為空字串
- product_code: 商品條碼／健保碼（字母開頭格式如 A000015421、AC16496100），找不到請設為空字串
- name: 中文品名
- quantity: 補貨量（紙本最右側的左欄，數字+中文單位如 "1 盒"、"12 包"、"1,000 粒"）
- warehouse_quantity: 總倉庫存量（紙本最右側的右欄，純整數如 1、284、-12）
- storage_location: 儲位（如 F3），找不到請設為空字串
- category: 類別（如 4），找不到請設為空字串
- page_number: 當前項目所在的頁碼數字（從照片底部頁次獲取，如 1）

重要提取規則（請嚴格遵守）：
1. 輸出嚴格純 JSON，不加 markdown 標記（如 \`\`\`json 或 \`\`\`），開頭直接是 {
2. 不要跳過任何一行，紙本清單每頁固定為 44 項，請確保提取項目數完整
3. 欄位找不到請一律輸出空字串，不要自創欄位
4. 儲位格式為字母+數字（如 F3、C2、A1），類別為純數字或單一字母（如 4、1、X、B）
5. 藥品品名（name）中若有雙引號，請一律替換為單引號 ' 或直接去除，嚴禁在字串內部輸出未跳脫的雙引號
6. 藥品品名中若有頓號、逗號或換行，請保持原樣
7. 商品代碼 (product_code) 若為健保碼，末尾字元皆為數字 0（如 AB091021G0、AC426871G0），請嚴格區分數字 0 與英文字母 O，絕不可輸出為字母 O；國際條碼 (barcode) 為純數字

JSON 格式範例：
{
  "order_number": "R012606220001",
  "delivery_date": "2026-06-22",
  "total_pages": 6,
  "items": [
    {
      "barcode": "471020120000",
      "product_code": "A000015421",
      "name": "普拿疼膜衣錠 500毫克",
      "quantity": "2 盒",
      "warehouse_quantity": 284,
      "storage_location": "F3",
      "category": "4",
      "page_number": 1
    }
  ]
}`;

    const result = await model.generateContent([prompt, ...imageParts]);
    const text = result.response.text();
    const cleanedText = await repairGeminiJson(text);
    const parsed = JSON.parse(cleanedText);

    const rawItems: Array<{
      barcode?: string;
      product_code?: string;
      name?: string;
      quantity?: string | number;
      warehouse_quantity?: number | string | null;
      storage_location?: string;
      category?: string;
      page_number?: number;
    }> = Array.isArray(parsed.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];

    const items: PageItem[] = rawItems.map((item, idx) => {
      let expectedQuantity = 0;
      if (typeof item.quantity === 'number') {
        expectedQuantity = item.quantity;
      } else if (typeof item.quantity === 'string') {
        const fullMatch = item.quantity.trim().replace(/,/g, '').match(/-?\d+/);
        expectedQuantity = fullMatch ? parseInt(fullMatch[0], 10) : 0;
      }
      expectedQuantity = Math.max(0, expectedQuantity);

      let warehouseQuantity: number | undefined;
      if (item.warehouse_quantity != null) {
        if (typeof item.warehouse_quantity === 'number') {
          warehouseQuantity = item.warehouse_quantity;
        } else {
          const wqMatch = String(item.warehouse_quantity).replace(/,/g, '').match(/-?\d+/);
          warehouseQuantity = wqMatch ? parseInt(wqMatch[0], 10) : undefined;
        }
      }

      return {
        storage_location: item.storage_location || '',
        category: item.category || '',
        barcode: sanitizeBarcode(item.barcode),
        product_code: sanitizeProductCode(item.product_code),
        drug_name: item.name || '',
        quantity: expectedQuantity.toString(),
        warehouse_quantity: warehouseQuantity,
        page_number: item.page_number,
        upload_index: batchIndex * 100 + idx,
      };
    });

    return {
      success: true,
      order_number: parsed.order_number,
      delivery_date: parsed.delivery_date,
      total_pages: parsed.total_pages,
      items,
    };
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : '未知錯誤';
    return {
      success: false,
      error: rawMessage,
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const urls: string[] = body.urls;

    if (!Array.isArray(urls) || urls.length === 0) {
      return new Response(JSON.stringify({ error: '請提供有效的圖片 URL 列表' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          sendSseEvent(controller, encoder, 'progress', {
            stage: 'init',
            percent: 5,
            message: `已接收 ${urls.length} 張照片，初始化辨識引擎...`,
            model: PRIMARY_MODEL,
          });

          const allBatchResults: Array<{
            batchIndex: number;
            order_number?: string;
            delivery_date?: string;
            total_pages?: number;
            items: PageItem[];
          }> = [];
          const allWarnings: Array<{ missing_count: number; page_number: number }> = [];

          // 逐頁／逐批處理（每批 1 張照片，確保 44 項完整不截斷）
          for (let i = 0; i < urls.length; i++) {
            const pageIndex = i + 1;
            const singleBatch = [urls[i]];
            let currentModel = PRIMARY_MODEL;

            const basePercent = Math.round(10 + (i / urls.length) * 70);
            sendSseEvent(controller, encoder, 'progress', {
              stage: 'ocr',
              page: pageIndex,
              totalPages: urls.length,
              percent: basePercent,
              message: `正在辨識第 ${pageIndex} / ${urls.length} 頁（使用模型：${currentModel}）...`,
              model: currentModel,
            });

            let result = await callGeminiForBatch(singleBatch, i, currentModel);

            // 錯誤與 503 重試判定
            let retryCount = 0;
            while ((!result.success || !result.items) && retryCount < MAX_RETRIES) {
              retryCount++;
              const is503 =
                result.error?.includes('503') ||
                result.error?.includes('high demand') ||
                result.error?.includes('Service Unavailable');

              // 第 1 次 503 重試時切換為備援模型
              if (is503 && retryCount === 1) {
                currentModel = FALLBACK_MODEL;
              }

              const backoffSeconds = is503 ? (retryCount === 1 ? 5 : 8) : 2;

              // 透過 SSE 倒數計時推送，讓前端即時呈現動態秒數
              for (let s = backoffSeconds; s > 0; s--) {
                sendSseEvent(controller, encoder, 'retry', {
                  stage: 'retry_backoff',
                  page: pageIndex,
                  retryCount,
                  maxRetries: MAX_RETRIES,
                  countdown: s,
                  model: currentModel,
                  switchedModel: currentModel !== PRIMARY_MODEL ? currentModel : undefined,
                  reason: is503 ? 'AI 服務暫時過載 (503)' : '辨識未回傳結果',
                  message: is503
                    ? `AI 服務負載過高 (503)，${currentModel !== PRIMARY_MODEL ? `已切換至備援模型 (${currentModel})，` : ''}倒數 ${s} 秒後進行第 ${retryCount}/${MAX_RETRIES} 次重試...`
                    : `正在重試第 ${pageIndex} 頁（${s} 秒後重試 ${retryCount}/${MAX_RETRIES}）...`,
                });
                await new Promise((r) => setTimeout(r, 1000));
              }

              sendSseEvent(controller, encoder, 'progress', {
                stage: 'ocr',
                page: pageIndex,
                totalPages: urls.length,
                percent: basePercent,
                message: `正在重新辨識第 ${pageIndex} 頁（模型：${currentModel}，第 ${retryCount} 次重試）...`,
                model: currentModel,
              });

              result = await callGeminiForBatch(singleBatch, i, currentModel);
            }

            if (!result.success || !result.items) {
              const friendly = await friendlyGeminiError(result.error || '未知錯誤');
              sendSseEvent(controller, encoder, 'error', {
                code: result.error?.includes('503') ? '503' : 'OCR_FAILED',
                page: pageIndex,
                message: `第 ${pageIndex} 頁 OCR 辨識失敗: ${friendly}`,
              });
              controller.close();
              return;
            }

            // 驗證單頁項目數量（44 項檢查）
            const pageValidation = validatePageItemCount(
              result.items,
              result.items[0]?.page_number ?? pageIndex,
              result.total_pages ?? urls.length
            );
            if (pageValidation.warning) {
              allWarnings.push(pageValidation.warning);
              sendSseEvent(controller, encoder, 'warning', {
                page: pageIndex,
                warning: pageValidation.warning,
                message: `第 ${pageIndex} 頁提取 ${result.items.length} 項（預期 44 項，短缺 ${pageValidation.warning.missing_count} 項）`,
              });
            }

            allBatchResults.push({
              batchIndex: i,
              order_number: result.order_number,
              delivery_date: result.delivery_date,
              total_pages: result.total_pages,
              items: result.items,
            });

            sendSseEvent(controller, encoder, 'progress', {
              stage: 'ocr_page_done',
              page: pageIndex,
              totalPages: urls.length,
              percent: Math.round(10 + ((i + 1) / urls.length) * 70),
              message: `第 ${pageIndex} 頁辨識完成，成功提取 ${result.items.length} 筆藥品`,
              model: currentModel,
            });
          }

          // 合併所有項目並排序
          allBatchResults.sort((a, b) => a.batchIndex - b.batchIndex);
          const rawItems: PageItem[] = allBatchResults.flatMap((r) => r.items);

          if (rawItems.length === 0) {
            sendSseEvent(controller, encoder, 'error', {
              code: 'EMPTY_ITEMS',
              message: 'OCR 辨識完成但未取得任何藥品項目，請檢查照片內容是否清晰',
            });
            controller.close();
            return;
          }

          rawItems.sort((a, b) => {
            if (a.page_number != null && b.page_number != null) return a.page_number - b.page_number;
            if (a.page_number != null) return -1;
            if (b.page_number != null) return 1;
            return (a.upload_index ?? 0) - (b.upload_index ?? 0);
          });

          // 階段 3：NHI 藥品資料庫名稱對齊
          sendSseEvent(controller, encoder, 'progress', {
            stage: 'nhi',
            percent: 88,
            message: `正在比對 NHI 健保藥品資料庫（代碼精準比對與前綴模糊匹配，共 ${rawItems.length} 筆）...`,
          });

          const baseItems: ParsedItem[] = rawItems.map((drug, idx) => ({
            line_number: idx + 1,
            barcode: drug.barcode,
            product_code: drug.product_code,
            drug_name: drug.drug_name,
            quantity: Math.max(0, parseInt(drug.quantity, 10) || 0),
            bonus_quantity: 0,
            storage_location: drug.storage_location || '',
            category: drug.category || '',
            warehouse_quantity: drug.warehouse_quantity,
          }));

          const nhiResults = await resolveNhiTranslations(
            baseItems.map((i) => ({
              line_number: i.line_number,
              product_code: i.product_code,
              barcode: i.barcode,
              drug_name: i.drug_name,
            }))
          );

          const finalItems: ParsedItem[] = applyNhiResults(baseItems, nhiResults);

          const firstResult = allBatchResults[0];
          const parsedData: ParsedPdf = {
            order_metadata: {
              order_number: firstResult.order_number || '未知單號',
              delivery_date: firstResult.delivery_date || '',
              total_items: finalItems.length,
              source_type: 'images',
              uploaded_image_count: urls.length,
              ocr_page_count: firstResult.total_pages || urls.length,
              ocr_request_count: urls.length,
            },
            items: finalItems,
            warnings: allWarnings.length > 0 ? allWarnings : undefined,
          };

          sendSseEvent(controller, encoder, 'complete', {
            stage: 'done',
            percent: 100,
            message: `辨識完成！共成功載入 ${finalItems.length} 項藥品。`,
            data: parsedData,
          });
        } catch (err: unknown) {
          console.error('[OCR Stream Error]', err);
          const rawMessage = err instanceof Error ? err.message : '串流辨識過程發生未預期錯誤';
          const friendly = await friendlyGeminiError(rawMessage);
          sendSseEvent(controller, encoder, 'error', {
            code: 'STREAM_FATAL',
            message: friendly,
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err: unknown) {
    const rawMessage = err instanceof Error ? err.message : '無法處理請求';
    return new Response(JSON.stringify({ error: rawMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}
