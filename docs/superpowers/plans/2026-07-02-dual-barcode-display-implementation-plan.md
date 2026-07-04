# 雙條碼顯示功能 - 實作計畫

## 目標
在藥品清點系統中加入 `product_code` 欄位，支援雙條碼顯示與掃描匹配，並在 UI 上同時呈現兩個條碼（不加文字標籤、使用亮度區分）。

## 工作項目與順序

1. **資料庫遷移**
   - 新增 migration `021_add_product_code.sql`（`ALTER TABLE drug_items ADD COLUMN product_code TEXT;`）
   - 建立索引 `idx_drug_items_product_code`（`WHERE product_code IS NOT NULL`）
   - 更新 Supabase RPC `create_manifest_with_items`，接受 `product_code` 參數並寫入
   - **測試**：執行 `supabase db reset` 後確認 `product_code` 欄位正確新增。

2. **型別更新**
   - `src/types/index.ts` 中 `DrugItem` 新增 `product_code: string | null`。
   - `src/lib/pdfParser.ts` 中 `ParsedItem` 加入 `product_code?: string`。
   - `src/app/actions/import.ts` 中 `ImportDrugItem` 加入 `product_code?: string`。
   - **測試**：使用 TypeScript 編譯確認無錯誤。

3. **OCR 匯入調整**
   - 更新 Gemini OCR prompt（`src/app/actions/import.ts` 或相關文件）使其同時抽取兩個欄位（`商品代碼`、`國際代碼`）。
   - 在 `import` 流程中，若兩碼相同則 `product_code = null`，否則分別寫入 `barcode` 與 `product_code`。
   - **測試**：上傳包含兩欄位的 PDF，檢查資料庫記錄是否正確。

4. **條碼匹配邏輯**
   - 修改 `src/app/scan/hooks/useBarcodeMatch.ts`：
     - 計算 `barcode` 與 `product_code` 的匹配分數（完全匹配 3 分、包含 2 分）。
     - 合併分數最高的項目返回。
   - 更新跨頁搜尋在 `ScanContent.tsx` 中加入 `product_code.ilike` 條件（OR 與 `barcode`）。
   - **測試**：掃描任一條碼能正確定位藥品卡片。

5. **UI 更新**
   - 編輯 `src/app/scan/components/DrugCard.tsx`：
     - 判斷 `product_code` 是否存在且與 `barcode` 不同。
     - 雙條碼情境下渲染兩行文字：
       - 第一行：`barcode`（全亮度 `#00f2fe` + 發光）
       - 第二行：`product_code`（亮度 70%）
     - 為兩行分別加入放大鏡按鈕，呼叫 `onFilterByBarcode` 使用相應條碼。
   - 調整樣式確保在暗色主題下仍保持可讀性（使用 Tailwind `text-[#00f2fe]`、`text-[#00f2fe]/70`）。
   - **測試**：在本機 `npm run dev`，確認 UI 正確顯示雙條碼，且點擊放大鏡可以篩選。

6. **端到端測試**
   - 新增或更新 e2e 測試 (`tests/e2e/dual-barcode.spec.ts`)，流程：
     1. 匯入含雙條碼的 PDF
     2. 進入掃描頁面
     3. 確認卡片顯示兩條碼
     4. 使用掃描模擬（呼叫 `useBarcodeMatch`）掃描 `product_code`
     5. 驗證卡片被正確高亮
   - **CI**：確保在 GitHub Actions 中執行成功。

7. **文件與說明**
   - 更新 `README.md` 中的「條碼」說明，新增 `product_code` 的描述與使用情境。
   - 在 `docs/superpowers` 新增 `dual-barcode-display.md` 小結，說明 UI 變更與使用者操作。

## 時程估算（不列於回應）
- 每個項目大約 1~2 天，整體 2 週內完成。

## 風險與因應
- **舊資料遷移**：若已有大量 `drug_items`，`product_code` 為 NULL 不影響既有功能。
- **OCR 失敗**：若 OCR 未正確抽取兩欄位，系統仍允許 `product_code` 為 null，功能仍可運作。
- **搜尋效能**：新增索引避免搜尋慢速。

---

*此計畫已根據已批准的設計文件撰寫，若需要調整請回饋。