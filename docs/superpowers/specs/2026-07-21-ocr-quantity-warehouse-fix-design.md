# 修正 OCR 數量混淆、新增總倉庫存量、漏品項驗證 設計規格

## 概覽

本規格定義三個相關的 OCR 修正任務，均涉及 Gemini OCR 流程的 prompt 改寫、型態擴充、後端驗證層與前端 UI 調整：

1. **Issue 1**: 修正 OCR 數量混淆 — Gemini 將補貨量誤判為總倉庫存量
2. **Issue 2**: 新增總倉庫存量顯示 — DrugCard 與 PreviewPanel 顯示 warehouse_quantity
3. **Issue 3**: OCR 漏品項偵測與自動重試 — 非末頁不足 44 項時觸發

---

## Issue 1: 修正 OCR 數量混淆（補貨量 vs 總倉庫存量）

### 根因

紙本總倉撿貨單最右側有兩欄數字：
- **左欄：補貨量** — 數字 + 中文單位（如 `1 盒`、`12 包`、`1,000 粒`）
- **右欄：總倉庫存量** — 純整數（如 `1`、`284`、`-12`）

既有 prompt 只用 `quantity` 單一欄位，Gemini 無法區分左右兩欄語意，有機率抓到右欄的總倉庫存量當作補貨量。

### 修正設計

#### 1.1 Prompt 改寫策略

在 `parseBatchWithGemini`（PDF 合併圖模式）和 `processSingleBatchWithGemini`（照片匯入模式）兩處 prompt 同步修改：

新增欄位要求：
```
- expected_quantity: 補貨量（紙本最右側的左欄，數字+中文單位如「1 盒」「12 包」）
- warehouse_quantity: 總倉庫存量（紙本最右側的右欄，純整數如 1、284、-12）
```

⚠️ 區分鐵律：
```
1. 補貨量（expected_quantity）：帶有中文單位的欄位（如「1 盒」「12 包」「1,000 粒」）
   → 用正則提取數字部分（1 盒 → 1，1,000 粒 → 1000）
2. 總倉庫存量（warehouse_quantity）：純整數欄位，不帶任何中文（如 1、284、-12）
3. 兩個欄位都在紙本最右側，補貨量在左、總倉庫存量在右
4. 若某欄位為空白或「-」，對應值設為 null 或 0
```

#### 1.2 欄位定位兜底（無中文單位時）

若補貨量罕見地不含單位（純數字），則依賴相對位置判斷：
- 紙本最右側兩欄中，**靠左的是補貨量、靠右的是總倉庫存量**

---

## Issue 2: 新增總倉庫存量顯示

### 型態擴充

| 型態 | 檔案 | 新增欄位 | 型別 |
|------|------|---------|------|
| `PageItem` | `src/app/actions/import/types.ts` | `warehouse_quantity?: number` | `number \| undefined` |
| `ImportDrugItem` | `src/app/actions/import/types.ts` | `warehouse_quantity?: number` | `number \| undefined` |
| `ParsedItem` | `src/lib/pdfParser.ts` | `warehouse_quantity?: number` | `number \| undefined` |

### UI 變更

#### 2.1 DrugCard（方案 A：並排顯示）

[DrugCard.tsx](file:///c:/project_Code/pharmacy/src/app/scan/components/DrugCard.tsx) 在「預期數量 vs 實際數量」旁新增「倉庫存量」：

```
預期: 10  |  實際: 10  |  倉庫存量: 120
```

- 倉庫存量顏色：`#ff9f0a`（橘色），與預期/實際區分
- 僅在 `warehouse_quantity > 0` 時顯示，為 0/null/undefined 時隱藏
- 手機版面：三欄水平排列，小螢幕時字體自適應縮小

#### 2.2 PreviewPanel

[PreviewPanel.tsx](file:///c:/project_Code/pharmacy/src/app/import/components/PreviewPanel.tsx) 表格新增「倉庫存量」欄位：

- 放在「預期量」欄位右側
- 標頭顏色橘色 `#ff9f0a`
- 動態顯示：資料有 `warehouse_quantity` 時顯示該欄，無資料時隱藏整欄

---

## Issue 3: OCR 漏品項偵測與自動重試

### 核心邏輯

紙本規則：**除了最後一頁（page_number = total_pages），其餘每一頁必定是滿 44 項。**

| 條件 | 判斷 | 動作 |
|------|------|------|
| `page < total` 且 `items.length < 44` | 🔴 確定漏項 | 自動重試（最多 2 次），延遲遞增（1s/2s） |
| `page < total` 且 `items.length = 44` | 🟢 正常 | 通過 |
| `page = total` 且 `items.length ≤ 44` | 🟢 正常（末頁） | 通過 |
| `page = total` 且 `items.length > 44` | 🟡 異常 | 標記 warning |
| `page < total` 且重試後仍 `< 44` | 🔴 漏項無法恢復 | 標記 warning，回傳 `{ missing_count, page_number }` |
| 任何頁 `items.length = 0` | 🔴 該頁完全失敗 | 標記 error，不納入匯入 |
| `total_pages` 無法辨識（null） | 🟡 無法判斷末頁 | 寬容通過（不觸發 44 項檢查） |

### 實作位置

在 `parseBatchWithGemini` 回傳後（[ocr.ts](file:///c:/project_Code/pharmacy/src/app/actions/import/ocr.ts#L138)）和 `processSingleBatchWithGemini` 回傳後，加入 `validatePageItemCount` 驗證函數。

`processImagesWithGemini` 和 `parsePdfWithGemini` 匯總所有批次的 warning，附加到回傳物件中。

### 前端警告（ImportOverlay / PreviewPanel）

```
完整時：
  OCR 辨識完成 ✓
  總頁數 6 頁，辨識 264 項（全部頁數完整）

漏項時：
  OCR 辨識完成 ⚠️
  總頁數 6 頁，辨識 262 項（預期 264 項）
  第 3 頁僅辨識 42 項（缺 2 項，已重試仍不足）
  第 5 頁僅辨識 43 項（缺 1 項，已重試仍不足）
  → 建議人工檢查紙本確認
```

---

## 檔案變更清單

| 檔案 | 變更類型 | 說明 |
|------|----------|------|
| `src/app/actions/import/ocr.ts` | 重構 | 兩處 prompt 改寫 + 新增 `validatePageItemCount` + 匯總 warning |
| `src/app/actions/import/types.ts` | 修改 | `PageItem`、`ImportDrugItem` 新增 `warehouse_quantity` |
| `src/lib/pdfParser.ts` | 修改 | `ParsedItem` 新增 `warehouse_quantity` |
| `src/app/scan/components/DrugCard.tsx` | 修改 | 卡片並排顯示倉庫存量 |
| `src/app/import/components/PreviewPanel.tsx` | 修改 | 預覽表格新增倉庫存量欄 |
| `src/app/import/components/ImportOverlay.tsx` | 修改 | 匯入摘要顯示漏項警告 |

## 資料流程圖

```
用戶上傳照片/PDF → Gemini OCR
                         ↓
              parseBatchWithGemini（prompt 含雙欄位+完整性要求）
                         ↓
              回傳 items[] + page_number + total_pages + item_count
                         ↓
              validatePageItemCount（非末頁 < 44 → 重試）
                         ↓
          匯總所有批次 → 含 warnings[]
                         ↓
        processImagesWithGeminiAsPdf / parsePdfWithGemini
                         ↓
         ParsedPdf（items 含 warehouse_quantity + warnings）
                         ↓
      ┌──────────────────┼──────────────────┐
      ↓                  ↓                  ↓
PreviewPanel        ImportOverlay        importDrugs → DB
（表格+存量欄）      （漏項摘要警告）       （warehouse_quantity
                                         不持久化至 DB）
                         ↓
                    DrugCard（掃描清點）
                    （預期|實際|存量 並排）
```

---

## 邊界測試總表

| # | 類別 | 場景 | 期望 |
|---|------|------|------|
| 1 | 數量 | 補貨量「1 盒」、庫存 284 | expected=1, warehouse=284 |
| 2 | 數量 | 補貨量「1,000 粒」 | expected=1000（正則提取千分位） |
| 3 | 數量 | 補貨量無單位、庫存有數字 | 靠左欄位置判斷取補貨量 |
| 4 | 數量 | 庫存欄為「-」空白 | warehouse=null/0 |
| 5 | 數量 | 庫存 = -12（負數） | warehouse=-12，正常提取 |
| 6 | 數量 | 補貨量 =「0」無單位 | 左欄位置兜底 → expected=0 |
| 7 | 漏項 | 中間頁(p3/6) 42 項 | 重試→仍42→warning |
| 8 | 漏項 | 中間頁(p3/6) 42→重試成功 44 | 清除 warning，通過 |
| 9 | 漏項 | 末頁(p6/6) 30 項 | 通過（末頁正常） |
| 10 | 漏項 | 末頁(p6/6) 45 項 | warning（異常多） |
| 11 | 漏項 | 中間頁(p2/6) 0 項 | error，不納入匯入 |
| 12 | 漏項 | 單頁清單 total_pages=null | 寬容通過（跳過檢查） |
| 13 | UI | warehouse=0 的品項 | DrugCard 不顯示存量欄 |
| 14 | UI | 全部 warehouse 為空 | PreviewPanel 隱藏整欄 |
| 15 | UI | 手機小螢幕 (375px) | 三欄水平排列自適應 |

---

## 實作順序

1. **型態層** — `types.ts` + `pdfParser.ts` 新增 `warehouse_quantity`（無副作用）
2. **Prompt 層** — `ocr.ts` 兩處 prompt 改寫 + `warehouse_quantity` 解析
3. **驗證層** — `ocr.ts` 新增 `validatePageItemCount` + warning 匯總
4. **UI 層** — `DrugCard.tsx` + `PreviewPanel.tsx` + `ImportOverlay.tsx`
5. **整合測試** — 端對端驗證（上傳 6 頁 → OCR → 預覽 → 匯入 → 掃描卡片）

---

## 風險與緩解

| 風險 | 影響 | 緩解 |
|------|------|------|
| Prompt 改寫後 Gemini 行為不如預期 | 中 | 保留舊 prompt 欄位名相容（quantity 仍可 fallback） |
| 末頁判斷依賴 total_pages OCR 準確度 | 中 | total_pages=null 時寬容跳過檢查 |
| warehouse_quantity 一律不持久化至 DB | 低 | 存量僅供清點現場參考，匯入後不保留（避免過期資料） |
| 自動重試增加 API 成本 | 低 | 僅在確定漏項時觸發，非每次重試 |