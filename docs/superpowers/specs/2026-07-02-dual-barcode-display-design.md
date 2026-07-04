# 雙條碼顯示功能設計

## 概述

同一藥品可能因換包裝而擁有兩個不同的 EAN 條碼（商品代碼 vs 國際代碼）。當兩者不同時，需同時顯示兩個條碼，且掃描任一條碼都能匹配到該藥品。

## 需求

* 照片匯入 (OCR) 時提取「商品代碼」與「國際代碼」兩個欄位

* 兩碼不同時同時顯示；相同時只顯示一個

* 掃描清點時，掃到任一條碼都能匹配到同一藥品卡片

* 不加文字標籤區分，純用亮度差異視覺區分主次

## 方案選擇

採用**方案 A：新增** **`product_code`** **欄位**

| 方案          | 優點            | 缺點            |
| ----------- | ------------- | ------------- |
| A: 新增欄位     | 改動小、向後兼容、查詢簡單 | 需修改多層程式碼      |
| B: JSONB 陣列 | 理論可擴展         | 破壞性改動大、索引困難   |
| C: 關聯表      | 正規化           | 過度設計、查詢需 JOIN |

## 資料模型

### 資料庫變更

```sql
ALTER TABLE drug_items ADD COLUMN product_code TEXT;
CREATE INDEX idx_drug_items_product_code ON drug_items(product_code) WHERE product_code IS NOT NULL;
```

* `barcode` (現有) = 國際代碼（主要）

* `product_code` (新增) = 商品代碼（次要，可為 NULL）

### TypeScript 型別變更

```typescript
// src/types/index.ts - DrugItem
export interface DrugItem {
  // ... 現有欄位
  barcode: string;             // 國際代碼
  product_code: string | null; // 商品代碼（新增）
  // ...
}

// src/lib/pdfParser.ts - ParsedItem
export interface ParsedItem {
  // ... 現有欄位
  barcode: string;              // 國際代碼
  product_code?: string;        // 商品代碼（新增）
  // ...
}

// src/app/actions/import.ts - ImportDrugItem
export interface ImportDrugItem {
  // ... 現有欄位
  barcode: string;              // 國際代碼
  product_code?: string;        // 商品代碼（新增）
  // ...
}
```

### 匯入邏輯

* OCR 提取兩個條碼欄位

* 若兩碼相同 → `product_code` 存 NULL（避免重複儲存）

* 若兩碼不同 → 分別存入 `barcode` 與 `product_code`

* RPC `create_manifest_with_items` 需對應新增欄位

## 條碼匹配

### useBarcodeMatch 擴展

```
分數制擴展：
- 完全匹配 barcode → 3 分
- 完全匹配 product_code → 3 分
- 部分包含 barcode → 2 分
- 部分包含 product_code → 2 分
- 品名模糊匹配 → 1 分
- 不匹配 → 0 分
```

### 跨頁搜尋

Supabase 查詢擴展：新增 `product_code.ilike` 條件（OR 邏輯）。

## UI 顯示

### DrugCard 雙條碼設計

**單碼情境**（product\_code 為 NULL 或與 barcode 相同）：

* 維持現有樣式：一條極光藍條碼 + 放大鏡按鈕

**雙碼情境**（兩者不同）：

* 第一行（國際代碼）：極光藍 `#00f2fe` 全亮度 + `drop-shadow-[0_0_8px_rgba(0,242,254,0.4)]` 發光特效 + 放大鏡按鈕

* 第二行（商品代碼）：極光藍 `#00f2fe/70` 降低亮度 + 無發光 + 放大鏡按鈕

* 兩行無文字標籤，純用亮度和發光特效區分主次

* 兩行的放大鏡按鈕各自以對應條碼值進行篩選

### 篩選行為

* 點任一條碼的放大鏡 → 以該條碼填入搜尋欄

* 掃描器輸入 → 自動匹配任一條碼（分數制）

## 向後兼容

* 舊資料 `product_code` 為 NULL → 只顯示單碼，行為不變

* 現有 `barcode` 欄位完全保留，不做重新命名

* 匯入 RPC 支援 product\_code 為 null 的舊格式資料

## 變更範圍

| 檔案                                             | 變更                                            |
| ---------------------------------------------- | --------------------------------------------- |
| `supabase/migrations/021_add_product_code.sql` | 新增欄位 + 索引                                     |
| `src/types/index.ts`                           | DrugItem 新增 product\_code                     |
| `src/lib/pdfParser.ts`                         | ParsedItem 新增 product\_code                   |
| `src/app/actions/import.ts`                    | ImportDrugItem 新增 product\_code，OCR prompt 修改 |
| `src/app/scan/hooks/useBarcodeMatch.ts`        | 匹配邏輯擴展                                        |
| `src/app/scan/components/DrugCard.tsx`         | 雙條碼 UI 顯示                                     |
| `src/app/scan/ScanContent.tsx`                 | 跨頁搜尋擴展                                        |
| `supabase/migrations/021_*.sql` (RPC)          | create\_manifest\_with\_items 參數擴展            |

