# Checklist

- [x] `pdfParser.ts` 不再包含任何座標解析程式碼
- [x] `pdfParser.ts` 保留 `ParsedItem`、`ParsedPdf` 型態（向後相容）
- [x] `parsePdf()` 使用 `gemini-2.5-flash-lite` 模型
- [x] 表頭（order_number, delivery_date）由第一頁獨立提取
- [x] 藥品項目逐頁提取，每批 3 頁並行
- [x] 單頁失敗自動重試 1 次
- [x] `onProgress` 回呼正常回報進度
- [x] `import.ts` 中 `processPDFPagesWithGemini` 已刪除
- [x] `import.ts` 中 `fixParsedDataWithGemini` 已刪除
- [x] `import/page.tsx` 不再有座標解析 fallback 判斷
- [x] `import/page.tsx` 不再有 `handleGeminiFix` 函數
- [x] `PreviewPanel.tsx` 不再有「Gemini 修正」按鈕
- [x] `PreviewPanel.tsx` 不再接收 `onGeminiFix` prop
- [x] `npx tsc --noEmit` 無型態錯誤 (已修復 pdfUtils.ts 相關錯誤，其餘為非本次範圍錯誤)
- [x] 專案可以正常 build（`npm run build`）