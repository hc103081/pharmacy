/**
 * 原型測試：純文字規則解析安得福藥局 PDF 出貨單
 * 
 * 策略：使用 pdfjs-dist 提取文字，完全不依賴 x/y 座標
 * 將同 y 座標的文字拼成整行，再用正則表達式提取欄位
 */

import fs from 'fs';
import path from 'path';

// 使用 legacy build 避免 Node.js 環境的 DOMMatrix 問題
const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
import { fileURLToPath, pathToFileURL } from 'url';
const __filename = fileURLToPath(import.meta.url);
// Windows 相容：使用 file:// URL
const workerUrl = pathToFileURL(path.resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs')).href;
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const PDF_PATH = path.resolve('c:/project_Code/pharmacy/出貨.pdf');

// --- 核心解析邏輯 ---

/**
 * 從整行文字中提取藥品欄位
 * 安得福格式: 序號 條碼 品名 數量 贈量 單位 單價 折數 小計 備註
 */
function parseDrugLine(lineText) {
  const text = lineText.trim();
  if (!text) return null;

  // 正則：序號(數字) + 條碼(數字) + 品名(任意直到遇到數量格式) + 數量(x.x) + 贈量(x.x)
  // 關鍵洞察：條碼是連續數字（4-20位），後面是品名，再後面是數字 x.x
  const pattern = /^(\d{1,3})\s+(\d{4,20})\s+(.+?)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+/;
  const match = text.match(pattern);

  if (!match) {
    // 嘗試更寬鬆的匹配：品名中可能包含數字（如「3M」）
    // 改用：序號 + 條碼 + 品名 + 兩個連續的 x.x 數字
    const loosePattern = /^(\d{1,3})\s+(\d{4,20})\s+(.+?)\s+(\d+\.\d+)\s+(\d+\.\d+)/;
    const looseMatch = text.match(loosePattern);
    if (looseMatch) {
      return {
        line_number: parseInt(looseMatch[1]),
        barcode: looseMatch[2],
        drug_name: looseMatch[3].trim(),
        quantity: parseFloat(looseMatch[4]),
        bonus_quantity: parseFloat(looseMatch[5]),
      };
    }
    return null;
  }

  return {
    line_number: parseInt(match[1]),
    barcode: match[2],
    drug_name: match[3].trim(),
    quantity: parseFloat(match[4]),
    bonus_quantity: parseFloat(match[5]),
  };
}

/**
 * 檢查是否為需要跳過的非藥品行
 */
function isSkipLine(text) {
  const skipPatterns = [
    /^(電話|傳真|地址|客戶代號|統一編號|發票號碼|聯絡人|送貨地址)/,
    /^(安得福藥局)/,
    /^(出\s*貨\s*單)/,
    /^(序\s+商品代號)/,  // 表頭列
    /^(頁計|總計|客戶簽收|業務員|備註|檢貨員)/,
    /^(\d{4}\/\d{2}\/\d{2}\s*\d{4}\/\d{2}\/\d{2})/, // 日期行
    /^(以下空白)/,
    /^\s*$/,  // 空行
  ];

  const trimmed = text.trim();
  if (!trimmed) return true;

  for (const pattern of skipPatterns) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

/**
 * 主解析函數：逐頁提取藥品
 */
async function parsePdfByText(data) {
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;

  let order_number = '';
  let delivery_date = '';
  const allItems = [];
  let totalParsed = 0;
  let totalFailed = 0;
  const failedLines = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items;

    // 步驟 1: 按 y 座標分組，拼成整行文字
    // （這裡只用 y 做分組，不用 x 做欄位切割）
    const lineMap = new Map();
    for (const item of items) {
      const y = Math.round(item.transform[5]);
      const text = item.str;
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y).push({ x: item.transform[4], text });
    }

    // 步驟 2: 每行內按 x 排序，拼成完整字串
    const lines = [];
    for (const [y, fragments] of lineMap) {
      fragments.sort((a, b) => a.x - b.x);
      const fullText = fragments.map(f => f.text).join(' ').replace(/\s+/g, ' ').trim();
      lines.push({ y, text: fullText });
    }

    // 步驟 3: 按 y 座標降序排列（PDF 通常從上到下，y 越大越靠近頂部）
    lines.sort((a, b) => b.y - a.y);

    console.log(`\n===== 第 ${i} 頁 =====`);
    console.log(`  原始行數: ${lines.length}`);

    // 步驟 4: 遍歷每行，提取藥品
    let pageItems = 0;
    for (const line of lines) {
      const text = line.text;

      // 提取表頭資訊
      if (i === 1) {
        const orderMatch = text.match(/出貨單號[:\s]*(\S+)/);
        if (orderMatch) order_number = orderMatch[1];
        const dateMatch = text.match(/出貨日期[:\s]*(\d{4}\/\d{2}\/\d{2})/);
        if (dateMatch) delivery_date = dateMatch[1];
      }

      // 跳過非藥品行
      if (isSkipLine(text)) continue;

      // 嘗試解析藥品行
      const result = parseDrugLine(text);
      if (result) {
        allItems.push(result);
        pageItems++;
        totalParsed++;
      } else if (text.length > 5) {
        // 記錄無法解析的行（可能是有問題的行）
        totalFailed++;
        failedLines.push({ page: i, text: text.substring(0, 100) });
      }
    }

    console.log(`  解析成功: ${pageItems} 項`);
  }

  return {
    order_number,
    delivery_date,
    items: allItems,
    totalParsed,
    totalFailed,
    failedLines,
  };
}

// --- 執行測試 ---

console.log('========================================');
console.log('  安得福 PDF 純文字規則解析 - 原型測試');
console.log('========================================');

try {
  const pdfBuffer = fs.readFileSync(PDF_PATH);
  const result = await parsePdfByText(new Uint8Array(pdfBuffer));

  console.log('\n========================================');
  console.log('  解析結果摘要');
  console.log('========================================');
  console.log(`出貨單號: ${result.order_number}`);
  console.log(`出貨日期: ${result.delivery_date}`);
  console.log(`成功解析: ${result.totalParsed} 項`);
  console.log(`解析失敗: ${result.totalFailed} 行`);

  // 顯示前 10 項
  console.log('\n--- 前 10 項預覽 ---');
  for (const item of result.items.slice(0, 10)) {
    console.log(`  #${item.line_number} | ${item.barcode} | ${item.drug_name} | ${item.quantity} + ${item.bonus_quantity}`);
  }

  // 顯示後 10 項
  console.log(`\n--- 最後 10 項預覽 (共 ${result.items.length} 項) ---`);
  for (const item of result.items.slice(-10)) {
    console.log(`  #${item.line_number} | ${item.barcode} | ${item.drug_name} | ${item.quantity} + ${item.bonus_quantity}`);
  }

  if (result.failedLines.length > 0) {
    console.log(`\n--- 無法解析的行 (${result.failedLines.length}) ---`);
    for (const f of result.failedLines) {
      console.log(`  第 ${f.page} 頁: "${f.text}"`);
    }
  }

  // 匯出 JSON 供檢查
  const outputPath = path.resolve('c:/project_Code/pharmacy/test-parse-output.json');
  fs.writeFileSync(outputPath, JSON.stringify(result.items, null, 2), 'utf-8');
  console.log(`\n完整結果已匯出至: ${outputPath}`);

} catch (error) {
  console.error('解析失敗:', error);
}