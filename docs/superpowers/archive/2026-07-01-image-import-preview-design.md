# 照片匯入預覽校驗機制設計

## 目標

為照片匯入流程加入與 PDF 匯入相同的 PreviewPanel 預覽階段，讓使用者在 OCR 辨識完成後、寫入 DB 前，能檢視與編輯辨識結果，並自動比對照片數與 OCR 辨識頁數的不一致。

## 現有流程

```
選照片 → 上傳至 Storage → 點「立即匯入並分頁」
  → processImagesWithGemini (OCR) → importDrugs (直接寫 DB) → 跳轉清點面板
```

問題：照片匯入無預覽、無校驗、無法編輯，直接寫入 DB，無法檢查 OCR 遺漏。

## 新流程

```
選照片 → 上傳至 Storage → 點「開始 OCR 辨識」（新按鈕）
  → processImagesWithGemini (OCR) → 轉換為 ParsedPdf → 顯示 PreviewPanel
  → 使用者校驗/編輯 → 確認匯入 → importDrugs → 跳轉清點面板
```

## 具體改動

### 1. 擴充 ParsedPdf 型態

在 `src/lib/pdfParser.ts` 的 `ParsedPdf.order_metadata` 中新增欄位：

```typescript
export interface ParsedPdf {
  order_metadata: {
    order_number: string;
    delivery_date: string;
    total_items: number;
    source_type?: 'pdf' | 'images';      // 資料來源類型
    uploaded_image_count?: number;        // 上傳照片張數
    ocr_page_count?: number;             // OCR 辨識出的頁數
    ocr_request_count?: number;          // OCR API 請求次數
  };
  items: ParsedItem[];
}
```

欄位為 optional，不影響現有 PDF 管線。

### 2. 新增 Server Action: processImagesWithGeminiAsPdf

在 `src/app/actions/import.ts` 中新增函數，將 `processImagesWithGemini` 的 OCR 結果轉為 `ParsedPdf`：

* 呼叫 `processImagesWithGemini({ urls })` 取得 OCR 結果

* 將 `ImportDrugItem[]` 轉換為 `ParsedItem[]`（附 `line_number`、`page_number`）

* 封裝為 `ParsedPdf` 格式，附帶 `source_type: 'images'`、`uploaded_image_count`、`ocr_page_count`、`ocr_request_count`

### 3. 前端匯入頁改動 (import/page.tsx)

**現有按鈕行為調整：**

* 當 `uploadedUrls.length > 0` 且 `!parsedData` 時，顯示「開始 OCR 辨識」按鈕

* 點擊後呼叫 `processImagesWithGeminiAsPdf`，結果存入 `parsedData`

* `parsedData` 有值後，自動切換到 PreviewPanel 顯示

**移除舊流程：**

* 移除照片匯入時直接呼叫 `processImagesWithGemini → importDrugs` 的快捷路徑

* 照片匯入一律走 PreviewPanel 預覽 → 確認匯入

### 4. PreviewPanel 表頭增加照片數比對

在 PreviewPanel 表頭區域，當 `source_type === 'images'` 時，額外顯示：

* 上傳照片：N 張

* OCR 辨識頁數：M 頁

* OCR 請求次數：K 次

若 `N ≠ M`，顯示黃色警告「照片數(N)與 OCR 辨識頁數(M)不一致，可能有遺漏」。

### 5. 不需改動的部分

* `PreviewPanel.tsx`：元件介面不變，仍吃 `ParsedPdf` + `PdfValidationResult`

* `pdfValidator.ts`：校驗規則完全適用於照片 OCR 結果

* `importDrugs`：確認匯入時呼叫的 Server Action 不變

* PDF 匯入流程：不受影響

## 資料流

```
照片上傳 → clientUploadImportImages → uploadedUrls
  → 點「開始 OCR 辨識」
  → processImagesWithGeminiAsPdf({ urls: uploadedUrls })
    → processImagesWithGemini({ urls })  // 1 次 API 請求
    → 轉換為 ParsedPdf
  → setParsedData(parsedPdf)
  → validateParsedPdf(parsedPdf)
  → PreviewPanel 顯示
  → 使用者確認/編輯
  → onConfirm(editedItems)
  → importDrugs(name, drugs, userId, options)
  → 跳轉清點面板
```

## 檢查項目

| 檢查            | 條件                                      | 提示                |
| ------------- | --------------------------------------- | ----------------- |
| 照片數 vs OCR 頁數 | `uploaded_image_count ≠ ocr_page_count` | 黃色警告：照片數與辨識頁數不一致  |
| 條碼缺失          | `barcode === ''`                        | 紅色錯誤（既有校驗）        |
| 品名異常          | 亂碼/全數字/過短/過長/非中文佔比高                     | 橘色 OCR 風險標記（既有校驗） |
| 數量 ≤ 0        | `quantity ≤ 0`                          | 紅色錯誤（既有校驗）        |
| 數量異常大         | `quantity > 999`                        | 黃色警告（既有校驗）        |

