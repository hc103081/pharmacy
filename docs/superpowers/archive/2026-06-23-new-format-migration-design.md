# 新清單格式遷移 — 設計規格書

**日期：** 2026-06-23  
**版本：** v1  
**狀態：** 已確認

---

## 1. 需求概述

將系統從舊的「安得福藥局標準出貨單」格式，全面遷移至新的「總倉撿貨單(彙總)」格式（報表編號 `w_im307_1`）。

### 新格式欄位

| 欄位 | 說明 | 範例 | 使用方式 |
|------|------|------|---------|
| 儲位 | 貨架位置 | F3 | 僅供參考顯示 |
| 類別 | 藥品分類 | 4 | 僅供參考顯示 |
| 商品代號 | 即國際條碼 | 4987241141005 | 條碼掃描比對 |
| 中文品名 | 藥品名稱 | 樂敦-維他眼藥水 | 卡片顯示 |
| 補貨量 | 數量+單位 | 1罐 | 只取數字，單位忽略 |

### 表頭資訊

| 欄位 | 對應現有欄位 | 範例 |
|------|-------------|------|
| 出貨單號 | `order_number` | R012606220001 |
| 列印時間 | `delivery_date` | 2026/6/22 16:42:58 |
| 頁次 X of Y | 排序依據 | 頁次 3 of 6 |

### 新格式變更摘要

- **完全取代舊格式**，舊格式不再支援
- **贈量（bonus_quantity）移除**，新格式無贈量
- **新增儲位（storage_location）和類別（category）**兩個參考欄位
- **匯入入口簡化**：只保留 PDF 匯入 + 照片匯入，移除 JSON 手動輸入
- **照片頁碼排序**：按照片底部「頁次 X of Y」排序，而非上傳順序
- 每頁固定 **44 項** 不變
- Gemini AI OCR 繼續使用

---

## 2. DB Schema 變更

### 2.1 Migration：`014_new_format.sql`

```sql
-- drug_items：新增儲位與類別
ALTER TABLE public.drug_items ADD COLUMN IF NOT EXISTS storage_location TEXT;
ALTER TABLE public.drug_items ADD COLUMN IF NOT EXISTS category TEXT;

-- drug_items：bonus_quantity 保留但不再使用（設預設值 0）
-- 不刪除欄位以避免遷移風險，所有新資料 bonus_quantity 固定為 0
ALTER TABLE public.drug_items ALTER COLUMN bonus_quantity SET DEFAULT 0;
```

---

## 3. 型態定義變更

### 3.1 `src/types/index.ts`

```typescript
export interface DrugItem {
  id: string;
  manifest_id: string;
  page_number: number;
  item_order: number;
  barcode: string;           // 商品代號（國際條碼）
  name: string;              // 中文品名
  expected_quantity: number; // 補貨量（只取數字）
  bonus_quantity: number;    // [保留欄位，固定為 0]
  storage_location: string;  // [新增] 儲位（如 F3）
  category: string;          // [新增] 類別（如 4）
  actual_quantity: number;
  counted_status: 'pending' | 'completed' | 'error';
  photo_url: string | null;
}

export interface SummaryDrugItem {
  id: string;
  barcode: string;
  name: string;
  expected_quantity: number;
  bonus_quantity: number;
  storage_location: string;  // [新增]
  category: string;          // [新增]
  actual_quantity: number;
  counted_status: 'pending' | 'completed' | 'error';
}
```

---

## 4. Gemini OCR Prompt 變更

### 4.1 表頭解析（`parseHeaderWithGemini`）

舊輸出：
```json
{ "order_number": "xxx", "delivery_date": "2026-06-22" }
```

新輸出（新增頁碼）：
```json
{ "order_number": "R012606220001", "delivery_date": "2026-06-22", "page_number": 3, "total_pages": 6 }
```

### 4.2 藥品解析（`parseBatchWithGemini`）

舊 CSV 格式：
```
line_number,barcode,drug_name,quantity,bonus_quantity
```

**新格式改用 JSON 陣列輸出**（與表頭解析一致，避免 CSV 中文逗號導致欄位錯位）：

```json
[
  {
    "storage_location": "F3",
    "category": "4",
    "barcode": "4987241141005",
    "drug_name": "樂敦-維他眼藥水",
    "quantity": "1罐"
  }
]
```

#### 補貨量正則防禦

`quantity` 欄位為「數字+單位」字串（如 "1罐"、"12盒"），解析時必須用正則提取數字：

```typescript
const rawQuantity = item.quantity;
const match = rawQuantity.match(/\d+/);
const expected_quantity = match ? parseInt(match[0], 10) : 0;
```

若 `expected_quantity === 0`，`pdfValidator` 必須標記為 `warn`，提示人工確認。

---

## 5. 需要修改的檔案清單

### 5.1 核心資料層

| # | 檔案 | 變更內容 |
|---|------|---------|
| 1 | `src/types/index.ts` | DrugItem + SummaryDrugItem：新增 `storage_location`、`category` |
| 2 | `src/lib/pdfParser.ts` | ParsedItem 新增 `storage_location`、`category`、`page_number`、`total_pages`；合併結果時按頁碼排序 |
| 3 | `src/lib/pdfValidator.ts` | 驗證規則適配新欄位（儲位/類別/補貨量檢查） |
| 4 | `src/app/actions/import.ts` | ImportDrugItem 新增欄位、Gemini prompt 改用新 CSV 格式、CSV 解析邏輯重寫、合併邏輯移除贈量累加 |
| 5 | `supabase/migrations/014_new_format.sql` | 新增 migration |

### 5.2 UI 元件層

| # | 檔案 | 變更內容 |
|---|------|---------|
| 6 | `src/app/scan/components/DrugCard.tsx` | 移除贈量 info tooltip，新增「F3-4」小字顯示在序號下方 |
| 7 | `src/app/scan/ScanContent.tsx` | Supabase select 新增 `storage_location`、`category` |
| 8 | `src/app/import/page.tsx` | 簡化為兩個入口（PDF + 照片），移除 JSON 手動輸入區塊，移除 `bonus_quantity` 相關合併邏輯 |
| 9 | `src/app/import/components/DrugListUploader.tsx` | 合併截圖+照片入口，調整 UI 文案為「照片匯入」 |
| 10 | `src/app/import/components/PreviewPanel.tsx` | 移除贈量欄，新增儲位/類別欄，更新預覽表格表頭 |
| 11 | `src/app/summary/[manifestId]/page.tsx` | Supabase select 新增欄位、CSV 匯出表頭調整 |

### 5.3 其他層

| # | 檔案 | 變更內容 |
|---|------|---------|
| 12 | `supabase/functions/archive-manifest/index.ts` | select/序列化新增 `storage_location`、`category` |
| 13 | `supabase/functions/restore-manifest/index.ts` | upsert 新增 `storage_location`、`category`；加上 `?? null` nullish 防禦以相容舊格式 ZIP |
| 14 | `src/supabase/functions/restore-manifest/index.ts`（備份） | 同步更新，加上 nullish 防禦 |

---

## 6. 匯入流程變更

### 6.1 入口簡化

```
現有：PDF 上傳 | 截圖 OCR | JSON 手動輸入
  ↓
新版：PDF 匯入 | 照片匯入
```

- DrugListUploader 的 `mode` prop 改為 `'pdf' | 'photos'`
- 照片匯入支援多張 PNG/JPG，沿用 `import_screenshots` bucket
- 移除 JSON textarea + 匯入按鈕

### 6.2 照片頁碼排序

1. 每張照片底部有「頁次 X of Y」
2. Gemini OCR 同時提取頁碼
3. `parsePdfWithGemini` 回傳時附加 `page_number` 和 `total_pages`
4. `parsePdf` 合併所有批次結果後，按 `page_number` 排序再分配 `item_order`

#### 穩健排序演算法（Fallback 處理）

若部分照片的頁碼 OCR 失敗（回傳 `null` 或 `undefined`），排序時以 `upload_index`（原始上傳順序）作為備用參考，確保缺失頁碼的頁面保留在相對位置而非被推到陣列首尾：

```typescript
// 每張照片保留原始上傳序號 upload_index
items.sort((a, b) => {
  // 兩者都有頁碼 → 按頁碼排序
  if (a.page_number && b.page_number) return a.page_number - b.page_number;
  // 其中一筆缺失頁碼 → 按上傳順序排序
  return a.upload_index - b.upload_index;
});
```

### 6.3 照片合併策略

沿用現有邏輯：每 3 頁垂直拼接成一張大圖，減少 API 呼叫次數。頁碼從底部文字提取。

---

## 7. DrugCard 顯示變更

```
變更前                          變更後
┌──────────────────────┐      ┌──────────────────────┐
│ #1  [📷]    正確/有誤  │      │ #1  [📷]    正確/有誤  │
│ 品名: 安得福止痛錠      │      │ F3-4                  │  ← 小字灰色
│ 條碼: 4711234567890   │      │ 品名: 樂敦維他眼藥水    │
│ 預期: 10 | 贈: 0      │      │ 條碼: 4987241141005    │
│ 實際: [__]            │      │ 預期: 1                │
└──────────────────────┘      │ 實際: [__]            │
                               └──────────────────────┘
```

- 序號下方新增 `{storage_location}-{category}` 小字（灰色，`text-xs text-gray-400`）
- `expected_quantity` 顯示位置不變，標籤用「預期」
- 條碼標籤保持「條碼」
- 移除贈量相關的 info icon + tooltip

---

## 8. 不需變更的部分

- `ITEMS_PER_PAGE = 44`
- `import_screenshots` bucket
- PDF → 圖片轉換 + 銳化 + 垂直合併邏輯
- 條碼掃描比對 + 發光高亮邏輯（`useBarcodeMatch`）
- 正確/有誤按鈕邏輯
- 照片拍攝留證功能（`usePhotoCapture`）
- 分頁導覽與持久化（`usePagePersistence`）
- 封存/還原整體流程
- 錯誤抽屜（`ErrorDrawer`）
- `pdf-progress` API route（未使用，保留不動）

---

## 9. CSV 匯出變更

`summary/[manifestId]/page.tsx` 的 CSV 表頭調整：

```
變更前：藥品名稱,條碼,預期數量,贈量,實際數量,差異,狀態
變更後：藥品名稱,條碼,預期數量,儲位,類別,實際數量,差異,狀態
```

---

## 10. 風險與注意事項

1. **現有資料相容性**：`bonus_quantity` 保留在 DB 中不刪除，舊資料不受影響，新資料固定為 0
2. **封存 ZIP 新舊格式相容**：舊封存 ZIP 的 `data.json` 含 `bonus_quantity`，不含 `storage_location` 和 `category`；新 ZIP 則相反。`restore-manifest` Edge Function 必須做 nullish 防禦：
   ```typescript
   const storage_location = item.storage_location ?? null;
   const category = item.category ?? null;
   const bonus_quantity = item.bonus_quantity ?? 0;
   ```
   確保新 Function 解壓半年前的舊格式 ZIP 時不會因欄位缺失而失敗。
3. **Gemini API 成本**：prompt 變更後建議先用少量樣本測試辨識準確率
4. **照片頁碼 OCR**：若照片底部頁碼被裁切或模糊，需有 fallback（使用 `upload_index` 穩健排序演算法，詳見 6.2 節）