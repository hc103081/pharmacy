# Tasks

- [x] Task 1: 重寫 `pdfParser.ts` — 以 Gemini OCR 取代座標解析
  - [x] 1.1 刪除所有座標解析邏輯，保留 `ParsedItem`、`ParsedPdf` 型態定義
  - [x] 1.2 實作 `parseHeaderWithGemini()` — 送第 1 頁圖片提取 order_number、delivery_date
  - [x] 1.3 實作 `parsePageWithGemini()` — 送單頁圖片提取 ParsedItem[]
  - [x] 1.4 實作分批並行邏輯：每批 3 頁，單頁失敗自動重試 1 次
  - [x] 1.5 重寫 `parsePdf()` 主入口：轉圖片 → 提取表頭 → 逐頁提取藥品 → 合併結果
  - [x] 1.6 保留 `onProgress` 回呼以回報處理進度

- [x] Task 2: 簡化 `import.ts` — 刪除舊備援函數
  - [x] 2.1 刪除 `processPDFPagesWithGemini()`，替換所有引用為新的 `parsePdf()`
  - [x] 2.2 刪除 `fixParsedDataWithGemini()`

- [x] Task 3: 簡化 `import/page.tsx` — 移除座標 fallback 邏輯
  - [x] 3.1 刪除座標解析失敗後的 Gemini fallback 判斷（第 66-90 行）
  - [x] 3.2 刪除 `handleGeminiFix` 及相關狀態呼叫
  - [x] 3.3 確保 `parsePdf` 直接作為唯一解析路徑（無條件分支）

- [x] Task 4: 簡化 `PreviewPanel.tsx` — 移除 Gemini 修正按鈕
  - [x] 4.1 刪除 `onGeminiFix` prop 及對應按鈕
  - [x] 4.2 調整底部操作區：僅保留「退回重試」和「確認匯入」

- [x] Task 5: 清理未使用 import 與型態檢查
  - [x] 5.1 確保 `import/page.tsx` 移除對 `processPDFPagesWithGemini`、`fixParsedDataWithGemini` 的 import
  - [x] 5.2 執行 `npx tsc --noEmit` 確認無型態錯誤 (已修復 pdfUtils.ts 相關錯誤，其餘為非本次範圍錯誤)

# Task Dependencies
- Task 2 依賴 Task 1（import.ts 刪除舊函數後才能正確 import 新的 parsePdf）
- Task 3 依賴 Task 2（page.tsx 移除參考舊函數的import）
- Task 4 可與 Task 1-3 並行
- Task 5 依賴 Task 1-4 全部完成