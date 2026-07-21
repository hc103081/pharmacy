# PhamaCount Web UX 修復與功能增強設計

**日期**: 2026-06-26
**狀態**: 已確認，待實作

---

## 概述

本文件彙整使用者回報的 9 個問題，歸納為 6 項改動，採用「最小改動」策略（方案 A），逐一修復而不改動整體架構。

---

## 1. 「有誤」拍照流程改動

### 問題
點「有誤」後系統強制要求拍照，使用者希望能跳過拍照。

### 設計
- 點「有誤」後進入 `error_actions` 狀態，底部展開兩個按鈕：
  - **「拍照確認」**（相機 icon）→ 觸發拍照流程
  - **「跳過拍照」**（跳過 icon）→ 直接標記為 error，photo_url = null
- 條碼篩選啟用時（`barcodeInput` 有值且非空），**隱藏「正確」/「有誤」按鈕及整個操作區**，避免篩選時誤操作
- 卡片狀態流轉：`pending` → 點「有誤」→ 顯示拍照/跳過 → 點任一 → `error`

### 涉及檔案
- `src/app/scan/components/DrugCard.tsx`：新增 `error_actions` 狀態 UI
- `src/app/scan/ScanContent.tsx`：篩選狀態下隱藏操作區
- `src/app/scan/hooks/usePhotoCapture.ts`：新增「跳過拍照」路徑，不需上傳
- `src/app/actions/scan/updatePhoto.ts`：支援 `photo_url = null` 的更新

### UI 示意
```
初始狀態：
┌──────────────────────────────────┐
│ ① Famotidine 胃利贊 20MG         │
│   AC16496100 · 預期: 1000        │
│   [✓ 正確]  [✗ 有誤]       📷    │
└──────────────────────────────────┘

點「有誤」後：
┌──────────────────────────────────┐
│ ① Famotidine 胃利贊 20MG         │
│   AC16496100 · 預期: 1000        │
│   實際數量: [___]                │
│   [📷 拍照確認]  [⏭ 跳過拍照]    │
└──────────────────────────────────┘

篩選模式下：
┌──────────────────────────────────┐
│ ① Famotidine 胃利贊 20MG         │
│   AC16496100 · 預期: 1000        │
│   (無按鈕，僅顯示資訊)            │
└──────────────────────────────────┘
```

---

## 2. 條碼與預期數量放大

### 問題
條碼與預期數量字體太小、顏色不明顯，不易閱讀。

### 設計
- **條碼**：`text-lg font-semibold text-[#00f2fe]` + `drop-shadow-[0_0_8px_rgba(0,242,254,0.4)]`
- **預期數字**：`text-xl font-bold text-[#00f2fe]` + `drop-shadow-[0_0_8px_rgba(0,242,254,0.4)]`
- **標籤「預期:」**：保持 `text-xs text-slate-500`，與數字形成對比層次
- 兩者同一行，用 `·` 分隔

### 涉及檔案
- `src/app/scan/components/DrugCard.tsx`：修改條碼與數量的樣式

### UI 示意
```
原: AC16496100 | 預期: 1000  (text-[11px], text-slate-500)
新: AC16496100 · 預期: 𝟭𝟬𝟬𝟬  (text-lg + text-xl, #00f2fe 發光)
```

---

## 3. 自訂相機解決 iPhone 模糊問題

### 問題
iPhone 16 Pro 使用 `<input type="file" capture="environment">` 時預覽畫面模糊，原生相機 APP 不糊。

### 根因
iOS Safari 在 `capture` 模式下會降級使用低解析度預覽流，這是已知問題。

### 設計
改用 `getUserMedia()` API 自建相機預覽 Modal：

1. 點拍照按鈕 → 檢查 `getUserMedia` 支援
2. **支援**：開啟自訂相機 Modal（full screen）：
   - 即時 `<video>` 預覽，指定 `ideal: 1920x1080` 解析度
   - 底部：拍照按鈕（圓形，符合原生操作習慣）
   - 左上：關閉按鈕
   - 右上：切換前後鏡頭按鈕
   - 點拍照 → Canvas 截取 frame → 壓縮 → 上傳 → 關閉 Modal
3. **不支援**：fallback 至 `<input type="file" capture="environment">`

### 涉及檔案
- 新增 `src/app/scan/components/CameraModal.tsx`：自訂相機 Modal 元件
- 修改 `src/app/scan/hooks/usePhotoCapture.ts`：整合 CameraModal，保留 fallback
- 修改 `src/app/scan/ScanContent.tsx`：掛載 CameraModal

### 相容性
- iOS Safari 11+ 支援 `getUserMedia`
- Android Chrome 支援
- 不支援時自動 fallback

---

## 4. 健保署藥品中文名稱查詢

### 問題
使用者希望匯入時自動根據健保代碼查詢中文名稱，替換英文名稱。

### 資料來源
健保署「健保用藥品項查詢項目檔」開放資料：
- API: `https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=A21030000I-E41001-001`
- CSV 下載: `https://info.nhi.gov.tw/api/iode0000s01/Dataset?rId=A21030000I-E41001-001`
- 欄位包含：藥品代號、藥品中文名稱、藥品英文名稱、成分、規格量等
- 資料量：約 224,455 筆，每月更新
- 限制：API 只支援 `limit/offset` 分頁，不支援條件篩選

### 設計
因 API 不支援按健保代碼篩選，採用**下載完整 CSV 建立本地對照表**方案：

1. **Supabase 新增快取表** `nhi_drug_lookup`：
   - `drug_code` TEXT PK：健保代碼（如 AC16496100）
   - `chinese_name` TEXT：中文名稱
   - `english_name` TEXT：英文名稱
   - `updated_at` TIMESTAMPTZ：更新時間
   - **必須建立 Primary Key 與 Index**：22 萬筆的 upsert 在後期會非常慢，PK + B-tree index 是必須的

2. **Supabase Edge Function** `refresh-nhi-lookup`（取代 Server Action）：
   - 不使用 Server Action，因 22 萬筆資料在 Vercel Serverless 環境極可能觸發 15~60 秒 Execution Timeout
   - 改用 Supabase Edge Function (Deno) 執行：
     1. 從健保署 API 下載 CSV（支援 limit/offset 分頁）
     2. **使用 Streaming 串流解析 CSV**：一邊從 Response Stream 讀取，一邊按行解析，累積滿 2,000 筆就寫入一次資料庫，寫入後釋放該批記憶體
     3. 每批使用 `ON CONFLICT (drug_code) DO UPDATE` 確保冪等性
   - 可手動觸發（API 呼叫），也可設定 Supabase pg_cron 每月排程自動更新
   - Edge Function 有獨立的 timeout 限制（可設定更長），且不受 Vercel Serverless 限制
   - **記憶體限制注意**：Edge Function 記憶體上限約 150MB，CSV 原始檔案 20~40MB。不可用 `await response.text()` 一次讀入全部，必須用 `ReadableStream` 逐行解析，維持記憶體在幾 MB 內

3. **匯入流程整合**：
   - 照片 OCR 完成後（`processImagesWithGemini`）或 PDF OCR 完成後
   - 對每個 item 的 `barcode`（健保代碼）查詢 `nhi_drug_lookup`
   - 找到中文名 → 替換 `drug_name`
   - 找不到 → 保留 OCR 原始辨識的藥名

4. **觸發點**：`importDrugs` Server Action 中，寫入 drug_items 前統一查詢替換
   - 匯入時僅查詢當次清單涉及的條碼（通常數十~數百筆），不會觸發超時問題

### 涉及檔案
- 新增 Supabase migration：`015_add_nhi_drug_lookup.sql`（含 PK + Index）
- 新增 `supabase/functions/refresh-nhi-lookup/index.ts`：Edge Function 下載 + 分批 upsert
- 修改 `src/app/actions/import.ts`：`importDrugs` 中加入 NHI 查詢步驟（僅查詢，不下載）

---

## 5. 修復匯入解析（空條碼 + 空儲位 + 手動選取）

### 問題
- 部分藥品儲位被 Gemini 自動填補（如 `X-X` 中的 X），應保持空白
- 部分藥品條碼（健保代碼）為空，導致無法掃描匹配、無法操作
- 藥品卡片無法點擊選取

### 設計

#### 5a. 修正 OCR Prompt
明確指示 Gemini 區分欄位，找不到時留空：

```
- barcode: 健保代碼（如 AC16496100），找不到請設為空字串
- storage_location: 儲位（如 F3），找不到請設為空字串，不要猜測
- category: 類別（如 4），找不到請設為空字串，不要猜測
```

範例中包含空值情況：
```json
{"storage_location": "", "category": "4", "barcode": "AC16496100", "drug_name": "胃利贊膜衣錠20毫克", "quantity": "1罐"}
```

#### 5b. 空條碼藥品支援手動選取
- 無條碼的卡片顯示紅色「待補碼」標籤
- 點擊卡片整體 → 選中該藥品（等同條碼匹配效果），顯示操作區
- 已有條碼的卡片行為不變（仍靠掃描匹配）
- **與條碼篩選的互動規則**：手動點擊選取的無條碼卡片，其操作區的顯示權限**高於**條碼篩選的隱藏邏輯。即：即使 `barcodeInput` 有值，手動選取的卡片仍保持操作區可見，避免使用者點了「待補碼」卡片後操作區消失

#### 5c. 空儲位顯示
- 空儲位顯示 `—`（破折號），避免 `X-X` 誤導

### 涉及檔案
- 修改 `src/app/actions/import.ts`：`parseBatchWithGemini` 和 `processImagesWithGemini` 的 prompt
- 修改 `src/app/scan/components/DrugCard.tsx`：支援點擊選取 + 空條碼標籤 + 空儲位顯示
- 修改 `src/app/scan/ScanContent.tsx`：手動選取的狀態管理

---

## 6. 拍照上傳卡頓優化 — Optimistic UI

### 問題
拍照確認後系統卡頓，因為同步阻塞等待：壓縮 → 上傳 → RPC → 遞增容量 → onRefresh() 全頁重查。

### 根因
`usePhotoCapture.ts` 中的 `handleFileUpload` 是完全同步阻塞的 async 流程，最後的 `onRefresh()` 會重新查詢整頁 44 筆藥品。

### 設計
**Optimistic UI + 背景上傳**：

1. **拍照/選取照片後立即更新本地狀態**：
   - 卡片立即顯示為「已完成」/「有誤」狀態（optimistic update）
   - 用本地 `URL.createObjectURL` 建立小縮圖即時顯示
   - 使用者可立即操作下一個藥品

2. **壓縮 + 上傳 + DB 更新全部在背景執行**：
   - 不 await 上傳流程（fire-and-forget）
   - 上傳完成後只更新該單一 item 的 photo_url，不做 `onRefresh()`

3. **「跳過拍照」時**：直接呼叫 RPC 更新 DB（極快，無上傳開銷）

4. **錯誤處理**：背景上傳失敗時 rollback 本地狀態 + 顯示 toast 提示
   - **坑點：Rollback 的「時空錯亂」問題**：若藥師點了「有誤→跳過」，卡片立刻變為已確認，藥師接著看下一張。3 秒後背景 RPC 失敗，卡片突然跳回 pending 狀態，使用者會覺得系統「鬧鬼」
   - **解法**：Rollback 時除了 Toast 提示外，在失敗的卡片上顯示**「重試 (Retry)」按鈕**，而不是默默變回原樣。讓使用者明確知道該項目需要重新操作，而非資料亂跳

### 涉及檔案
- 修改 `src/app/scan/hooks/usePhotoCapture.ts`：重構為 optimistic + 背景上傳
- 修改 `src/app/scan/ScanContent.tsx`：本地狀態 optimistic update 邏輯
- 修改 `src/app/scan/components/DrugCard.tsx`：本地縮圖預覽支援

---

## 實作優先順序

| 優先順序 | 項目 | 理由 |
|----------|------|------|
| 1 | 5. 修復匯入解析 | 資料正確性是根本，影響所有後續操作 |
| 2 | 1. 有誤可跳過拍照 | 解決操作流程阻礙 |
| 3 | 6. 拍照卡頓優化 | 使用體驗立即改善 |
| 4 | 2. 條碼/數量放大 | 快速 UI 修復 |
| 5 | 3. 自訂相機 | 需較多開發工作 |
| 6 | 4. 健保署藥名查詢 | 需建置資料表 + API 串接 |
