# 以 Gemini OCR 取代 PDF 座標解析 Spec

## Why
目前 `pdfParser.ts` 使用 pdfjs-dist 座標提取 PDF 藥品資料，因不同 PDF 版型導致座標邊界頻繁失效，經過多次調整仍無法穩定工作。現有 Gemini 備援路徑也有 bug 未正常運作。需要以 Gemini 3.1 Flash Lite 作為 PDF OCR 的主路徑，徹底解決座標問題。

## What Changes
- **BREAKING**: 刪除 `pdfParser.ts` 中所有座標解析邏輯，改為呼叫 Gemini OCR
- **BREAKING**: 刪除 `import.ts` 中 `processPDFPagesWithGemini`（舊備援）和 `fixParsedDataWithGemini`（AI 修正）
- `import/page.tsx` 簡化：移除座標解析 fallback 判斷邏輯
- `PreviewPanel.tsx` 移除「Gemini 修正」按鈕（因 Gemini 已是主路徑，不再需要事後修正）
- 新增表頭提取 API：單獨送第一頁給 Gemini 提取 `order_number`、`delivery_date`
- 新增單頁藥品提取 API：逐頁送 Gemini 提取 `ParsedItem[]`
- 每批 3 頁並行處理，單頁失敗自動重試 1 次
- `convertPdfToImages` 保留不變

## Impact
- Affected specs: 無（全新 spec）
- Affected code:
  - `src/lib/pdfParser.ts` — 重寫
  - `src/app/actions/import.ts` — 簡化
  - `src/app/import/page.tsx` — 簡化
  - `src/app/import/components/PreviewPanel.tsx` — 移除 Gemini 修正按鈕
  - `src/lib/pdfUtils.ts` — 不變

## REMOVED Requirements

### Requirement: 座標式 PDF 解析引擎
**Reason**: 座標邊界依賴特定 PDF 版型，跨供應商/版型無法通用，反覆調整仍失敗。
**Migration**: 改為 Gemini Vision OCR，無需遷移。

### Requirement: Gemini 備援修正 (`fixParsedDataWithGemini`)
**Reason**: Gemini 成為主路徑後不再需要事後修正。使用者可在 PreviewPanel 手動編輯。
**Migration**: PreviewPanel 中的「Gemini 修正」按鈕移除。

## ADDED Requirements

### Requirement: Gemini PDF OCR 主解析引擎
系統 SHALL 使用 `gemini-2.5-flash-lite` 模型將 PDF 頁面圖片進行 OCR，提取藥品清單資料。

#### Scenario: 成功解析標準安得福出貨單
- **GIVEN** 使用者上傳安得福藥局出貨單 PDF（文字型）
- **WHEN** 系統將 PDF 轉為圖片並逐頁送 Gemini OCR
- **THEN** 系統回傳 `ParsedPdf`，包含正確的 `order_number`、`delivery_date` 和所有 `items`

#### Scenario: 單頁 OCR 失敗自動重試
- **GIVEN** 某頁 Gemini API 呼叫失敗（網路錯誤、timeout 等）
- **WHEN** 系統自動重試該頁 1 次
- **THEN** 若重試成功則納入結果；若仍失敗則標記該頁為缺失，其餘成功頁正常回傳

#### Scenario: 分批並行處理
- **GIVEN** PDF 有 8 頁
- **WHEN** 系統以每批 3 頁並行呼叫 Gemini
- **THEN** 第 1-3 頁同時處理，完成後處理 4-6 頁，最後處理 7-8 頁

### Requirement: 表頭獨立提取
系統 SHALL 單獨使用第一頁圖片向 Gemini 請求提取出貨單號與交貨日期。

#### Scenario: 提取表頭成功
- **GIVEN** PDF 第一頁包含「出貨單號: R012606090002」和「出貨日期: 2026/06/09」
- **WHEN** 系統送第一頁圖片給 Gemini，prompt 只要求提取 order_number 和 delivery_date
- **THEN** 回傳 `{ order_number: "R012606090002", delivery_date: "2026-06-09" }`

### Requirement: 藥品項目逐頁提取
系統 SHALL 將每頁圖片送 Gemini，提取該頁所有藥品項目的條碼、品名、數量、贈量。

#### Scenario: 提取單頁 45 項藥品
- **GIVEN** PDF 某頁包含 45 筆藥品明細
- **WHEN** 系統送該頁圖片給 Gemini
- **THEN** 回傳 45 筆 `ParsedItem`，包含 `line_number`、`barcode`、`drug_name`、`quantity`、`bonus_quantity`
- **AND** 品名中的數字（如「輕酵素-2s/包(3包100元)」）不會被誤判為數量

#### Scenario: 跳過表頭行與頁尾行
- **GIVEN** 頁面包含表頭行「序 商品代號 品 名...」和頁尾行「頁計...」
- **WHEN** Gemini 處理該頁
- **THEN** 表頭行和頁尾行不會出現在 items 結果中

### Requirement: PreviewPanel 簡化
系統 SHALL 移除 PreviewPanel 中的「Gemini 修正」按鈕，保留手動編輯和「確認匯入」功能。

#### Scenario: PreviewPanel 顯示
- **GIVEN** Gemini OCR 解析完成
- **WHEN** 顯示 PreviewPanel
- **THEN** 僅顯示「退回重試」和「確認匯入」兩個按鈕，無「Gemini 修正」按鈕