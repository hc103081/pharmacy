# 雙條碼 OCR 與顯示設計 (2026-07-04)

## 目標
讓系統在匯入藥品清單時，同時抽取 **國際條碼 (barcode)** 與 **商品條碼 (product_code)**，在 UI 中正確顯示兩個條碼，且掃描任一條碼都能匹配到對應的藥品卡片。

## 資料模型
- **ParsedItem** (`src/lib/pdfParser.ts`)
  ```ts
  export interface ParsedItem {
    line_number: number;
    barcode: string;            // 國際條碼（主要）
    product_code?: string;      // 商品條碼（次要）
    drug_name: string;
    quantity: number;
    bonus_quantity: number;
    storage_location: string;
    category: string;
    merged_count?: number;
    page_number?: number;
    upload_index?: number;
  }
  ```
- **DrugItem** (`src/types/index.ts`) 已有 `product_code: string | null`。
- **ImportDrugItem** (`src/app/actions/import.ts`) 加入 `product_code?: string`。
- **資料庫**：`drug_items` 新增 `product_code TEXT` 欄位與索引（已在 migration 中完成）。

## OCR Prompt 更新
1. **圖片 OCR (`processImagesWithGemini`)**
   - Prompt 加入 `product_code` 欄位，要求回傳 JSON 如下：
   ```json
   {
     "barcode": "AC12345678",
     "product_code": "1234567890123",
     "name": "藥品名稱",
     "expected_quantity": 1,
     "storage_location": "F3",
     "category": "4",
     "page_number": 3
   }
   ```
2. **PDF 批次 OCR (`parseBatchWithGemini`)** 同樣加入 `product_code`。
   - 若商品條碼不存在，返回空字串。

## 解析與匯入流程
- 在 `processImagesWithGeminiAsPdf`、`parseBatchWithGemini` 中，將 `product_code` 直接映射至 `ParsedItem.product_code`。
- 若 `barcode === product_code`（或 `product_code` 為空），則將 `product_code` 設為 `null`，避免重複儲存。
- 匯入 RPC `create_manifest_with_items` 已支援 `product_code`，保持向後相容。

## UI 顯示
- **DrugCard**：
  - 單碼情況：只顯示 `barcode`（現有樣式）。
  - 雙碼情況：第一行顯示 `barcode`（全亮度、發光），第二行顯示 `product_code`（亮度 70%，無發光），兩行皆有放大鏡按鈕，可分別以對應條碼觸發篩選。
- **PreviewPanel**（表格與卡片模式）：新增「商品條碼」欄位，只要 `item.product_code` 有值就顯示，否則隱藏。

## 條碼匹配與搜尋
- `useBarcodeMatch` 擴展：將 `product_code` 計入完整匹配與包含匹配（分數 3/2）。
- 跨頁搜尋在 Supabase 查詢中加入 `OR product_code.ilike '%${input}%'`。

## 錯誤處理與 fallback
- OCR 若未返回 `product_code`（空字串），在資料模型中存 `null`，前端不會顯示第二條碼。
- UI 允許使用者在清單卡片編輯時手動填寫 `product_code`（備選），不影響主要流程。

## 向後相容性
- 既有資料 `product_code` 為 `null`，行為與單條碼完全相同。
- `barcode` 欄位保持不變，所有舊有查詢仍然有效。

## 變更範圍
| 檔案 | 變更說明 |
|------|----------|
| `supabase/migrations/021_add_product_code.sql` | 新增 `product_code` 欄位與索引 |
| `src/types/index.ts` | `DrugItem` 新增 `product_code`
| `src/lib/pdfParser.ts` | `ParsedItem` 新增 `product_code`
| `src/app/actions/import.ts` | `ImportDrugItem`、OCR 解析、匯入 RPC 均納入 `product_code`
| `src/app/scan/hooks/useBarcodeMatch.ts` | 匹配分數擴充至 `product_code`
| `src/app/scan/components/DrugCard.tsx` | 雙條碼 UI 渲染
| `src/app/import/components/PreviewPanel.tsx` | 表格與卡片模式新增商品條碼欄位
| `src/app/scan/ScanContent.tsx` | 跨頁搜尋支援 `product_code`

---

**已完成設計說明，請您檢視此規格檔案**（`docs/superpowers/specs/2026-07-04-dual-barcode-ocr-design.md`），若需要調整請告訴我，我會再次修改。