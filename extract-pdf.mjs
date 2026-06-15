import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import path from "path";
import url from "url";
import fs from "fs";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 設定 worker 路徑
const workerPath = path.resolve(
  __dirname,
  "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
);
GlobalWorkerOptions.workerSrc = url.pathToFileURL(workerPath).href;

const pdfPath = path.resolve(__dirname, "出貨.pdf");
const outputPath = path.resolve(__dirname, "出貨_提取文字.txt");

async function extractText() {
  const data = new Uint8Array(fs.readFileSync(pdfPath));

  const loadingTask = getDocument({ data });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;

  const lines = [];
  lines.push(`總頁數: ${numPages}`);
  lines.push("=".repeat(60));

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    lines.push(`\n===== 第 ${i} 頁 =====`);
    lines.push("-".repeat(60));

    // 按 y 座標排序（由上到下），再按 x 座標排序（由左到右）
    const items = textContent.items.slice().sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5];
      if (Math.abs(yDiff) > 2) return yDiff;
      return a.transform[4] - b.transform[4];
    });

    // 換行感知輸出
    let lastY = null;
    let currentLine = [];
    for (const item of items) {
      const str = item.str;
      if (!str || !str.trim()) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 4) {
        lines.push(currentLine.join(" "));
        currentLine = [];
      }
      currentLine.push(str);
      lastY = y;
    }
    if (currentLine.length > 0) {
      lines.push(currentLine.join(" "));
    }
  }

  fs.writeFileSync(outputPath, lines.join("\n"), "utf-8");
  console.log(`提取完成！輸出檔案: ${outputPath}`);
  console.log(`總頁數: ${numPages}`);
}

extractText().catch((err) => {
  console.error("提取失敗:", err);
  process.exit(1);
});