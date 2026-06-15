 // Set worker source for pdfjs
// Removed top-level configuration to avoid SSR issues

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
 * 基于坐标规则的 PDF 出货单解析引擎 (已升级为動態邊界追蹤模式)
 */
export async function parsePdf(
  data: Uint8Array,
  onProgress?: (page: number, total: number) => void
): Promise<ParsedPdf> {
  const pdfjs = await import('pdfjs-dist');

  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
  }

  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  
  let order_number = '';
  let delivery_date = '';
  const items: ParsedItem[] = [];

  const HEADER_KEYWORDS_REGEX = /^(電話|傳真|地址|客戶代號|統一編號|發票號碼|出貨單號|交貨日期|頁次|日期|客戶|負責人|連絡|fax|tel|addr|單號|編號|收件人|寄件人|聯絡|款項|總計|小計|總數量|金額|品名數|折扣|單價|數量|已收|收件|寄件)/i;

  for (let i = 1; i <= pdf.numPages; i++) {
    if (onProgress) onProgress(i, pdf.numPages);
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const itemsOnPage = textContent.items as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any

    // 1. 提取表頭 (通常在第一頁)
    if (i === 1) {
      for (const item of itemsOnPage) {
        const x = item.transform[4];
        const text = item.str.trim();
        if (!text) continue;
        if (x >= 400 && x <= 800) {
          if (/單號|單號\s*[:：]/.test(text)) {
            const sameLine = itemsOnPage.filter(it => Math.abs(it.transform[5] - item.transform[5]) < 5 && it.transform[4] > x);
            if (sameLine.length > 0) order_number = sameLine[0].str.trim();
          }
          if (/日期|日期\s*[:：]/.test(text)) {
            const sameLine = itemsOnPage.filter(it => Math.abs(it.transform[5] - item.transform[5]) < 5 && it.transform[4] > x);
            if (sameLine.length > 0) delivery_date = sameLine[0].str.trim();
          }
        }
      }
    }

    // 2. 按座標提取欄位
    const lines: Map<number, any[]> = new Map(); // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const item of itemsOnPage) {
      const y = Math.round(item.transform[5]);
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y)!.push(item);
    }

    const sortedY = Array.from(lines.keys()).sort((a, b) => b - a);

    // ---- x 座標欄位邊界 ----
    // 序號: x < 35
    // 條碼: 35 <= x < 110
    // 品名: 110 <= x < 250
    // 數量: 250 <= x < 275
    // 贈量: 275 <= x < 300
    // (單價、折扣、小計、效期等不需要)
    const X_IDX_END = 35;
    const X_BARCODE_END = 110;
    const X_NAME_END = 250;
    const X_QTY_END = 275;
    const X_BONUS_END = 300;

    for (const y of sortedY) {
      const lineItems = lines.get(y)!;
      lineItems.sort((a, b) => a.transform[4] - b.transform[4]);

      // 停止條件：遇到「以下空白」
      const fullLineText = lineItems.map(it => it.str).join(' ');
      if (fullLineText.includes('以下空白')) break;

      // 跳過表頭區域關鍵字行 (忽略前面的序號)
      const cleanLineText = fullLineText.trim().replace(/^\d+[\.\s:]*/, '');
      if (HEADER_KEYWORDS_REGEX.test(cleanLineText)) continue;

      // 按座標分區提取各欄位文字
      let idxText = '';
      let barcodeText = '';
      let nameText = '';
      let qtyText = '';
      let bonusText = '';

      for (const item of lineItems) {
        const x = item.transform[4];
        const text = item.str.trim();
        if (!text) continue;

        if (x < X_IDX_END) {
          idxText += text;
        } else if (x < X_BARCODE_END) {
          barcodeText += text;
        } else if (x < X_NAME_END) {
          nameText += text;
        } else if (x < X_QTY_END) {
          qtyText += text;
        } else if (x < X_BONUS_END) {
          bonusText += text;
        }
      }

      // --- DEBUG LOG START ---
      console.log(`[PDF Debug] Y:${y} | Raw: { idx: "${idxText}", barcode: "${barcodeText}", name: "${nameText}", qty: "${qtyText}", bonus: "${bonusText}" }`);
      // --- DEBUG LOG END ---

      // 1. 嘗試解析序號與條碼 (可能同時存在於 idx 欄)
      let line_number = 0;
      let idxBarcode = '';
      const trimmedIdx = idxText.trim();
      if (trimmedIdx) {
        const splitMatch = trimmedIdx.match(/^(\d{1,3})\s+(\d{4,20})$/);
        if (splitMatch) {
          line_number = parseInt(splitMatch[1]);
          idxBarcode = splitMatch[2];
        } else {
          if (/^\d{1,3}$/.test(trimmedIdx)) {
            line_number = parseInt(trimmedIdx);
          } else if (/^\d{4,20}$/.test(trimmedIdx)) {
            idxBarcode = trimmedIdx;
          }
        }
      }

      // 2. 如果既沒有序號，也沒有條碼或品名，則跳過 (這可能是雜訊)
      if (line_number === 0 && !barcodeText && !nameText && !qtyText && !bonusText) {
        continue;
      }

      // 3. 如果有品名但看起來像表頭或雜訊，則跳過
      if (nameText) {
        const cleanName = nameText.replace(/^\d+[\.\s:]*/, '').trim();
        // 檢查是否匹配表頭關鍵字
        if (HEADER_KEYWORDS_REGEX.test(cleanName)) continue;
        // 檢查是否只是純數字或金額 (例如 "7,415.64")
        if (/^[\d,.]+(?:\s*[\d,.]*)?$/.test(cleanName)) continue;
        // 檢查是否是常見的雜訊標籤 (例如 "品名數")
        if (/^(品名數|小計|總計|總數量|折扣|單價|金額|數量|已收)$/.test(cleanName)) continue;
      }

      // 品名跨行處理：如果主行沒有品名，查看下一行 (y-1)
      if (!nameText && lines.has(y - 1)) {
        const nextLineItems = lines.get(y - 1)!;
        nextLineItems.sort((a, b) => a.transform[4] - b.transform[4]);
        let continuationName = '';
        for (const item of nextLineItems) {
          const x = item.transform[4];
          const text = item.str.trim();
          if (!text) continue;
          // 品名區域: x >= X_BARCODE_END 且不包含數量/贈量等數值欄位
          if (x >= X_BARCODE_END && x < X_NAME_END) {
            continuationName += text;
          }
        }
        if (continuationName) {
          nameText = continuationName;
        }
      }

      // 如果主行同時有品名文字在 x≈113 區域且品名區末尾也在 x≈113-273
      // 那品名可能跨行，下一行 (y-1) 也有品名續行
      if (nameText && lines.has(y - 1)) {
        const nextLineItems = lines.get(y - 1)!;
        nextLineItems.sort((a, b) => a.transform[4] - b.transform[4]);
        // 檢查下一行是否有品名文字但沒有序號 (純品名續行)
        let nextIdx = '';
        let nextName = '';
        let nextHasQty = false;
        for (const item of nextLineItems) {
          const x = item.transform[4];
          const text = item.str.trim();
          if (!text) continue;
          if (x < X_IDX_END) nextIdx += text;
          else if (x >= X_BARCODE_END && x < X_NAME_END) nextName += text;
          else if (x >= X_QTY_END - 5 && x < X_QTY_END) nextHasQty = true;
        }
        // 下一行沒有序號、沒有數量、但有品名 → 續行
        if (!nextIdx && !nextHasQty && nextName) {
          nameText += nextName;
        }
      }

      const barcode = barcodeText.trim();
      let drug_name = nameText.trim();
      
      // 數量解析：處理可能同時包含 數量 與 贈量 的情況 (例如 "1.0 0.0")
      const qtyParts = qtyText.trim().split(/\s+/).filter(p => p);
      let quantity = qtyParts.length > 0 ? Math.round(parseFloat(qtyParts[0])) || 0 : 0;
      
      const bonusParts = bonusText.trim().split(/\s+/).filter(p => p);
      let bonus_quantity = 0;
      if (bonusParts.length > 0) {
        bonus_quantity = Math.round(parseFloat(bonusParts[0])) || 0;
      } else if (qtyParts.length > 1) {
        // 如果 qtyText 包含了兩個數字，第二個應該是贈量
        bonus_quantity = Math.round(parseFloat(qtyParts[1])) || 0;
      }

      // --- 條碼補救機制 ---
      let final_barcode = barcode;
      let final_quantity = quantity;

      if (!final_barcode) {
        // 1. 檢查是否條碼在序號欄位
        if (idxBarcode) {
          final_barcode = idxBarcode;
        } else if (idxText.match(/(\d{6,20})/)) {
          const idxMatch = idxText.match(/(\d{6,20})/);
          final_barcode = idxMatch[1];
        }
        // 2. 檢查是否條碼在品名欄位 (優先檢查開頭)
        else if (drug_name.match(/^(\d{4,20})\s*(.*)$/)) {
          const nameStartMatch = drug_name.match(/^(\d{4,20})\s*(.*)$/);
          if (nameStartMatch) {
            final_barcode = nameStartMatch[1];
            drug_name = nameStartMatch[2];
          } else {
            // 嘗試在品名中任何位置尋找 6-20 位的數字
            const nameAnyMatch = drug_name.match(/(\d{4,20})/);
            if (nameAnyMatch) {
              final_barcode = nameAnyMatch[1];
              drug_name = drug_name.replace(final_barcode, '').trim();
            }
          }
        } 
        // 3. 檢查是否條碼在數量欄位 (例如 "品名 [barcode] [qty]")
        else if (/^\d{4,20}$/.test(qtyText.trim())) {
          final_barcode = qtyText.trim();
          // 如果條碼被誤抓成數量，嘗試從贈量(bonus)欄位提取真正的數量
          const bonusVal = Math.round(parseFloat(bonusText.trim())) || 0;
          final_quantity = bonusVal > 0 ? bonusVal : 0;
        }
      }

      // 清理品名中的亂碼符號 (例如 ?) 及不可見控制字元
      drug_name = drug_name.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').replace(/\?+/g, '').trim();

      // --- 數量補救機制：如果數量為 0，嘗試從品名中提取 ---
      if (final_quantity === 0 && drug_name) {
        // 1. 嘗試從贈量欄位補救 (如果主數量為0但贈量有值，可能是欄位偏移)
        if (bonus_quantity > 0) {
          final_quantity = bonus_quantity;
          bonus_quantity = 0;
        } else {
          // 2. 檢查開頭是否為數值 (例如 "60.0輕酵素...")
          const startMatch = drug_name.match(/^(\d+(\.\d+)?)\s*([^\d].*)$/);
          if (startMatch) {
            final_quantity = Math.round(parseFloat(startMatch[1]));
            drug_name = startMatch[3];
          } else {
            // 3. 檢查結尾是否為數值 (例如 "指套(大)-1入12.0")
            const endMatch = drug_name.match(/(.*)\s*(\d+(\.\d+)?)$/);
            if (endMatch) {
              final_quantity = Math.round(parseFloat(endMatch[2]));
              drug_name = endMatch[1];
            }
          }
        }
      }

      const isContinuation = !final_barcode && final_quantity === 0 && bonus_quantity === 0 && line_number === 0;

      if (!isContinuation && (final_barcode || drug_name)) {
        items.push({
          line_number: line_number || items.length + 1,
          barcode: final_barcode,
          drug_name: drug_name.trim(),
          quantity: final_quantity,
          bonus_quantity,
        });
      }
    }
  }

  // --- 合併重複條碼 ---
  const mergedMap = new Map<string, ParsedItem>();
  for (const item of items) {
    if (item.barcode) {
      const existing = mergedMap.get(item.barcode);
      if (existing) {
        existing.quantity += item.quantity;
        existing.bonus_quantity += item.bonus_quantity;
      } else {
        mergedMap.set(item.barcode, { ...item });
      }
    } else {
      // 沒有條碼的項直接保留
      mergedMap.set(`no-barcode-${items.indexOf(item)}`, { ...item });
    }
  }
  const finalItems = Array.from(mergedMap.values());

  return {
    order_metadata: {
      order_number: order_number || '未知單號',
      delivery_date: delivery_date || '',
      total_items: finalItems.length,
    },
    items: finalItems,
  };
}
