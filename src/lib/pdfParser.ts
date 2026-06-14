import * as pdfjs from 'pdfjs-dist';

// Set worker source for pdfjs
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

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
 * 基于坐标规则的 PDF 出货单解析引擎
 */
export async function parsePdf(
  data: Uint8Array,
  onProgress?: (page: number, total: number) => void
): Promise<ParsedPdf> {
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  
  let order_number = '';
  let delivery_date = '';
  const items: ParsedItem[] = [];
  let globalLineNumber = 0;

  for (let i = 1; i <= pdf.numPages; i++) {
    if (onProgress) onProgress(i, pdf.numPages);
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const itemsOnPage = textContent.items as any[];

    // 1. 提取表头 (通常在第一页)
    if (i === 1) {
      // 寻找 order_number ([466, 778]) 和 delivery_date ([466, 793])
      // 注意：pdfjs 的坐标系是从左下角开始的，y轴向上
      // 这里我们需要根据实际观察的 x 坐标来过滤
      for (const item of itemsOnPage) {
        const x = item.transform[4];
        const text = item.str.trim();
        
        if (!text) continue;

        // 简单的启发式提取：查找包含 "單號" 或 "日期" 关键字附近的文本
        // 这里的坐标 [466, 778] 可能是相对于某种缩放的，我们使用相对范围
        if (x >= 400 && x <= 800) {
          if (/單號|單號\s*[:：]/.test(text)) {
            // 尝试在同一行后面寻找数字
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

    // 2. 提取行数据
    // 将文本项按 y 坐标分组 (同一行)
    const lines: Map<number, any[]> = new Map();
    for (const item of itemsOnPage) {
      const y = Math.round(item.transform[5]);
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y)!.push(item);
    }

    // 按 y 坐标从高到低排序 (从页顶向下)
    const sortedY = Array.from(lines.keys()).sort((a, b) => b - a);

    for (const y of sortedY) {
      const lineItems = lines.get(y)!;
      // 按 x 坐标排序
      lineItems.sort((a, b) => a.transform[4] - b.transform[4]);

      let line_number = 0;
      let barcode = '';
      let drug_name = '';
      let quantity = 0;
      let bonus_quantity = 0;

      for (const item of lineItems) {
        const x = item.transform[4];
        const text = item.str.trim();
        if (!text) continue;

        // x ∈ [10, 100] → line_number + barcode
        if (x >= 10 && x <= 110) {
          // 尝试解析 "1 12345678" 这种格式
          const match = text.match(/^(\\d+)\\s+(.+)$/);
          if (match) {
            line_number = parseInt(match[1]);
            barcode = match[2];
          } else if (/^\\d+$/.test(text)) {
            // 可能是行号，后面会有条码
            line_number = parseInt(text);
          } else {
            barcode = text;
          }
        } 
        // x ∈ [110, 260] → drug_name
        else if (x >= 110 && x <= 260) {
          drug_name += (drug_name ? ' ' : '') + text;
        }
        // x ∈ [250, 270] → quantity
        else if (x >= 250 && x <= 275) {
          const num = parseInt(text);
          if (!isNaN(num)) quantity = num;
        }
        // x ∈ [280, 300] → bonus_quantity
        else if (x >= 280 && x <= 310) {
          const num = parseInt(text);
          if (!isNaN(num)) bonus_quantity = num;
        }
      }

      // 停止条件：遇到「以下空白」
      const fullLineText = lineItems.map(it => it.str).join(' ');
      if (fullLineText.includes('以下空白')) break;

      // 只有当条码或品名存在时才认为是有效数据行
      if (barcode || drug_name) {
        // 如果提取到了行号，则更新全局行号用于连续性检查
        if (line_number > 0) {
          globalLineNumber = line_number;
        }

        items.push({
          line_number: line_number || items.length + 1,
          barcode: barcode.trim(),
          drug_name: drug_name.trim(),
          quantity,
          bonus_quantity,
        });
      }
    }
  }

  return {
    order_metadata: {
      order_number: order_number || '未知單號',
      delivery_date: delivery_date || '',
      total_items: items.length,
    },
    items,
  };
}
