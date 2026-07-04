# 藥局智能清點系統 — 全面重構設計

> 日期：2026-07-05
> 狀態：設計階段
> 策略：三階段區塊式重構（Strategy B）

---

## 1. 背景與動機

PharmaCount Web 經過 2 個月密集開發（從 2026-06-17 首份 spec 至今），累積了多項技術債務：

- **超大檔案：** `src/app/actions/import.ts`（804 行）混合 OCR / 上傳 / 匯入三種職責；`ScanContent.tsx`（1177 行）混合 data fetching + 狀態管理 + 完整 UI 佈局
- **重複邏輯：** 條碼合併、Base64 轉換、NHI 查詢、Gemini JSON 修復等邏輯在多處重複實作
- **死碼與遺留檔案：** 根目錄 6 個測試腳本、`supabase/functions/` 下 16 個 debug 用 Edge Function、`import.ts` 內一段被註解的舊實作

本次重構目標：在不改變任何功能行為的前提下，提升程式碼的可維護性、可讀性與模組化程度。

---

## 2. 重構範圍

### 包含
- `src/` 下所有應用程式碼（拆分大檔案、抽取共用模組）
- `supabase/functions/` 廢棄 debug Edge Functions（16 個）
- 根目錄遺留腳本（`testRun.ts`, `testClean.ts`, `testRepair.ts`, `testRunAsync.ts`, `run.js`, `extract-pdf.mjs`）
- `src/app/actions/import.ts` 內被註解的舊 `repairGeminiJson` 實作（L70-L102）

### 不包含
- `supabase/migrations/` — 歷史遷移檔案，保留不動
- `tests/` — 測試檔案，保留不動
- `docs/superpowers/` — 設計文件，保留不動
- `.superpowers/` — 工具內部目錄，保留不動

---

## 3. 重構策略：三階段區塊式

```
Phase 1（零風險）→ Phase 2（低風險）→ Phase 3（中風險）
清理死碼          抽取共用模組        拆分大檔案
```

每個 Phase 完成後獨立驗收（`npm run build` + E2E 測試通過），再進入下一 Phase。

---

## 4. Phase 1：清理死碼與廢棄檔案

### 4.1 根目錄遺留腳本

刪除以下檔案（無任何 import 引用）：

| 檔案 | 說明 |
|------|------|
| `testRun.ts` | 測試用腳本 |
| `testClean.ts` | 測試用腳本 |
| `testRepair.ts` | 測試用腳本 |
| `testRunAsync.ts` | 測試用腳本 |
| `run.js` | 無引用 |
| `extract-pdf.mjs` | 獨立 PDF 提取腳本（功能已整合入 `pdfParser.ts`） |

### 4.2 `supabase/functions/` 廢棄 Edge Functions

刪除以下 16 個 debug/testing 函數目錄：

| 函數目錄 | 說明 |
|----------|------|
| `debug-encoding/` | Debug 用 |
| `debug-lines/` | Debug 用 |
| `debug-sample/` | Debug 用 |
| `detect-encoding/` | Debug 用 |
| `fetch-test/` | Debug 用 |
| `first-ten-lines/` | Debug 用 |
| `first-three-bytes/` | Debug 用 |
| `hello/` | Debug 用 |
| `line-count/` | Debug 用 |
| `lines-sample/` | Debug 用 |
| `preview-bytes/` | Debug 用 |
| `range-text/` | Debug 用 |
| `search-code/` | Debug 用 |
| `test-b5-decoder/` | Debug 用 |
| `test-bom-big5/` | Debug 用 |
| `test-nhi/` | Debug 用 |

**保留的正式函數：** `archive-cron`, `archive-manifest`, `check-bom`, `cleanupPhotos`, `nhi-lookup`, `refresh-nhi-lookup`, `restore-manifest`

### 4.3 `src/app/actions/import.ts` 內死碼

刪除 L70-L102 被註解掉的舊 `repairGeminiJson` 實作（區塊已用 `/* */` 標記）。

### 4.4 Phase 1 驗收標準

- `npm run build` 成功
- 現有 E2E 測試 (`tests/e2e/pharmacy_flow.spec.ts`, `tests/e2e/dual-barcode.spec.ts`) 通過
- 所有現有功能不受影響

---

## 5. Phase 2：抽取共用模組

### 5.1 新增 `src/lib/gemini.ts`

封裝 Gemini API 通用操作，消除 `import.ts` 中 3 處重複的 `new GoogleGenerativeAI()` + `fetchImageAsBase64()`。

**匯出函數：**

| 函數 | 來源 | 說明 |
|------|------|------|
| `getGeminiKey()` | 新建 | 從 `process.env.GOOGLE_API_KEY` 取值並校驗 |
| `createGeminiModel()` | 新建 | 回傳 `gemini-3.1-flash-lite` model 實例 |
| `fetchImageAsBase64(url)` | 從 `import.ts` L33-L42 遷入 | URL → Base64 data URI |
| `repairGeminiJson(text)` | 從 `import.ts` L50-L68 遷入 | 修復 Gemini JSON 格式錯誤 |
| `friendlyGeminiError(rawMessage)` | 從 `import.ts` L104-L115 遷入 | 503/429/500 錯誤轉友善訊息 |

**Consumer 調整：**
- `import.ts` 中的 `parseHeaderWithGemini`, `parseBatchWithGemini`, `processImagesWithGemini` 改用 `gemini.ts` 的共用工具

### 5.2 新增 `src/lib/nhi.ts`

封裝 NHI 藥品中文名稱查詢，消除 `importDrugs` 和 `processImagesWithGeminiAsPdf` 中各自實作的查詢邏輯。

**匯出函數：**

| 函數 | 說明 |
|------|------|
| `batchLookupNhi(codes: string[])` | 一次性 `IN` 查詢，回傳 `Map<code, chineseName>` |
| `lookupNhiName(productCode?, barcode?)` | 單筆查詢（先 product_code 後 barcode fallback） |

**Consumer 調整：**
- `importDrugs` 和 `processImagesWithGeminiAsPdf` 改用 `nhi.ts`

### 5.3 新增 `src/lib/barcodeMerge.ts`

封裝條碼合併邏輯，消除 `importDrugs` 和 `parsePdfWithGemini` 中重複的合併實作。

**匯出函數：**

| 函數 | 說明 |
|------|------|
| `mergeByBarcode<T>(items: T[])` | 以 `barcode` / `product_code` 為鍵合併，數量疊加；無條碼項目各自保留 |

**Consumer 調整：**
- `importDrugs` 和 `parsePdfWithGemini` 改用 `barcodeMerge.ts`

### 5.4 新增 `src/lib/base64.ts`

封裝 Base64 ↔ ArrayBuffer ↔ Blob 轉換，消除 `import.ts`, `pdfParser.ts`, `pdfUtils.ts` 中重複的低階轉換。

**匯出函數：**

| 函數 | 說明 |
|------|------|
| `arrayBufferToDataUri(buffer, mimeType)` | ArrayBuffer → `data:image/jpeg;base64,...` |
| `dataUriToBlob(dataUri)` | `data:...;base64,...` → Blob |

**Consumer 調整：**
- `import.ts`（`processImagesWithGemini`）、`pdfParser.ts`（base64→Blob）、`pdfUtils.ts` 改用 `base64.ts`

### 5.5 Phase 2 驗收標準

- 所有 4 個共用模組獨立可用
- 被影響的 Server Action 和 Client 函數行為不變
- `npm run build` 成功
- E2E 測試通過
- `import.ts` 從 804 行縮減至約 500 行（中間狀態）

---

## 6. Phase 3：拆分超大檔案

目標：每個檔案 ≤ ~300 行，每個模組有單一明確職責。

### 6.1 `src/app/actions/import.ts` → 拆為 4 個檔案

Phase 2 後 `import.ts` 約 500 行。Phase 3 按職責拆為：

```
src/app/actions/import/
  types.ts         (~30 行)  ImportDrugItem, ImportResponse, PageItem 型別
  ocr.ts           (~250 行) parseHeaderWithGemini, parseBatchWithGemini,
                             parsePdfWithGemini, processImagesWithGemini,
                             processImagesWithGeminiAsPdf
  storage.ts       (~60 行)  uploadImportImages, deleteImportImages
  importDrugs.ts   (~130 行) importDrugs（含 NHI 查詢 + 分頁 + RPC 呼叫）
```

**Consumer 調整：**
- `ImportPage` import 路徑改為 `@/app/actions/import/ocr`
- `pdfParser.ts` import 路徑改為 `@/app/actions/import/ocr`
- `manifest-operation/route.ts` 若引用則調整路徑

### 6.2 `src/app/scan/ScanContent.tsx`（1177 行）→ 拆為 hooks + UI

```
src/app/scan/
  hooks/
    useScanData.ts      (~150 行)  fetchPageData + refreshStatsOnly +
                                   manifestName 查詢 + loading 狀態
    useScanKeyboard.ts  (~30 行)   visualViewport 鍵盤偵測
    useScanPageNav.ts   (~80 行)   頁碼導覽 + persistence + jump + 回溯
  ScanContent.tsx       (~200 行)  純 UI 組合層（接收 hooks 回傳值）
```

**現有 hooks 保持不動：** `useBarcodeMatch.ts`, `usePhotoCapture.ts`, `usePagePersistence.ts`

### 6.3 `src/app/import/page.tsx`（545 行）→ 拆為 hooks + components

```
src/app/import/
  hooks/
    useImportState.ts     (~80 行)  sessionStorage + visibility restore + useState
    useImportPipeline.ts  (~120 行) handlePdfSelect / handleUploadImages /
                                    handleOcrImages / handleImport / handleReset
  components/
    ImportProgressBar.tsx (~100 行) PDF 轉換進度條 UI
    ImportOverlay.tsx     (~60 行)  匯入中全畫面動畫覆蓋層
  page.tsx               (~200 行)  純 UI 組合層
```

### 6.4 `src/app/manifests/page.tsx`（558 行）→ 分離批次邏輯

```
src/app/manifests/
  hooks/
    useManifestOperations.ts  (~100 行) startOperation / handleArchive /
                                       handleRestore / handleArchiveAll /
                                       handleDeleteAll
  components/
    OperationProgressModal.tsx (~60 行)  操作進度 Modal
    DeleteConfirmDialog.tsx    (~50 行)  刪除確認 Dialog
  page.tsx                     (~250 行) 純 UI 組合層
```

### 6.5 Phase 3 驗收標準

- 每個新建檔案 ≤ 300 行
- `npm run build` 成功
- E2E 測試通過
- 所有現有功能不受影響

---

## 7. 整體驗收標準

| Phase | 檢查項目 | 標準 |
|-------|----------|------|
| 1 | Build | `npm run build` 成功 |
| 1 | Test | E2E 測試通過 |
| 1 | 功能 | 所有頁面手動 smoke test 正常 |
| 2 | Build | `npm run build` 成功 |
| 2 | Test | E2E 測試通過 |
| 2 | 行數 | `import.ts` ≤ 550 行 |
| 3 | Build | `npm run build` 成功 |
| 3 | Test | E2E 測試通過 |
| 3 | 行數 | 每個新建檔案 ≤ 300 行 |

---

## 8. 不納入範圍的項目（明確排除）

以下項目在探索過程中識別為潛在問題，但本次重構不處理：

- **`ScanContent.tsx` 的重複 JSX（手機/電腦兩套佈局）** — 這屬於 UI 層的響應式設計選擇，拆分後兩套佈局仍各自獨立，不強制統一
- **`import.ts` 中 `processImagesWithGemini` vs `parsePdfWithGemini` 的路徑分歧** — 照片匯入和 PDF 匯入是兩條不同的 pipeline，各有獨立的 prompt 和處理邏輯，保留現狀
- **型別定義分散問題** — `ParsedItem` 定義在 `pdfParser.ts` 而非 `types/index.ts`。這屬於設計選擇（型別靠近 consumer），本次不搬遷
- **`supabase/migrations/` 清理** — 歷史遷移檔案為稽核用途保留