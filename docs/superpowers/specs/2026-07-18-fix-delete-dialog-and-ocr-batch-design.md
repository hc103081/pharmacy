# 修正刪除確認對話框與 OCR 分批處理設計規格

## 概覽

本規格文件定義兩個獨立但相關的修正任務：

1. **Issue 1**: 修正刪除確認對話框的 HTML 標籤渲染問題與刪除後清單不自動刷新
2. **Issue 2**: 修正 OCR 匯入（照片模式）分批處理邏輯，解決多張圖片僅回傳單頁 44 項的問題

---

## Issue 1: 刪除確認對話框修正

### 問題分析

#### 1.1 HTML 標籤顯示為純文字
- **檔案**: `src/app/manifests/components/DeleteConfirmDialog.tsx:48`
- **程式碼**: `<p className="text-slate-400 mb-6">{message}</p>`
- **預設訊息**: `此操作將永久刪除該清單及其所有藥品項目，<strong className="text-red-400">無法恢復</strong>。請確認後再執行。`
- **原因**: 使用 `{message}` 文字插值而非 `dangerouslySetInnerHTML`

#### 1.2 刪除按鈕點擊無反應 / 清單不刷新
- **檔案**: `src/app/manifests/page.tsx:772-776`
- **程式碼**:
  ```tsx
  onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
  ```
- **問題**:
  1. `handleDelete` 成功後未關閉對話框（需呼叫 `setConfirmDeleteId(null)`）
  2. `handleDelete` 成功後未重新整理清單（註解說 "fetchManifests will be called by parent" 但父組件未執行）

### 修正設計

#### 1.1 修正 HTML 渲染
```tsx
// DeleteConfirmDialog.tsx
<p className="text-slate-400 mb-6" dangerouslySetInnerHTML={{ __html: message }} />
```

#### 1.2 修正刪除確認邏輯
```tsx
// ManifestsPage.tsx - onConfirm 改為 async 函數
onConfirm={async () => {
  if (!confirmDeleteId) return;
  await handleDelete(confirmDeleteId);
  setConfirmDeleteId(null);  // 關閉對話框
  fetchManifests();          // 重新整理清單
}}
```

#### 1.3 清理註解
- 移除 `useManifestOperations.ts:238` 的 "Note: fetchManifests will be called by parent" 註解

---

## Issue 2: OCR 匯入分批處理

### 問題分析

#### 現狀流程
```
用戶上傳 6 張圖片
       ↓
processImagesWithGemini({ urls: 6張 })
       ↓
單次 Gemini 請求發送 6 張圖片
       ↓
Gemini 輸出 token 截斷（~8K tokens 上限）
       ↓
僅回傳第一頁 ~44 項資料
```

#### 參考實作：PDF 解析流程 (`parsePdfWithGemini`)
```typescript
// 每 3 張合併圖為一批，並行處理
const BATCH_SIZE = 3;
for (let i = 0; i < urls.length; i += BATCH_SIZE) {
  const batch = urls.slice(i, i + BATCH_SIZE);
  const batchResults = await Promise.all(
    batch.map(url => parseBatchWithGemini(url, batchIndex))
  );
}
// 合併所有批次結果，按 page_number 排序
```

### 修正設計

#### 2.1 新增單批處理函數
從 `processImagesWithGemini` 抽離核心 OCR 邏輯：

```typescript
// 新增：處理單批圖片（1-3 張）
async function processSingleBatchWithGemini(
  urls: string[], 
  batchIndex: number
): Promise<{ success: boolean; items: ParsedItem[]; error?: string }>
```

#### 2.2 重構 `processImagesWithGemini` 為分批協調器
```typescript
export async function processImagesWithGemini({ urls }: { urls: string[] }) {
  const BATCH_SIZE = 3;
  const allBatchResults = [];
  
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((url, idx) => processSingleBatchWithGemini([url], i + idx))
    );
    // 重試邏輯...
    allBatchResults.push(...batchResults);
  }
  
  // 合併所有結果，按 page_number 排序
  // 返回統一格式
}
```

#### 2.3 更新 `processImagesWithGeminiAsPdf`
- 使用新的分批 `processImagesWithGemini`
- 合併邏輯保持不變（已包含 NHI 查詢與 ParsedPdf 轉換）

---

## 資料流程圖

### Issue 1 修正後流程
```
用戶點擊刪除按鈕
       ↓
開啟 DeleteConfirmDialog（正確渲染紅字 "無法恢復"）
       ↓
用戶點擊「確定刪除」
       ↓
onConfirm: await handleDelete(id) → setConfirmDeleteId(null) → fetchManifests()
       ↓
對話框關閉，清單重新整理顯示最新狀態
```

### Issue 2 修正後流程
```
用戶上傳 6 張照片 → 按下 OCR 匯入
       ↓
processImagesWithGemini({ urls: 6張 })
       ↓
分批：Batch 0 (3張) + Batch 1 (3張) 並行處理
       ↓
每批呼叫 processSingleBatchWithGemini → Gemini OCR
       ↓
合併 6 頁結果 → 按 page_number 排序
       ↓
回傳完整 6 頁 × 44 項 = 264 項資料
       ↓
processImagesWithGeminiAsPdf → NHI 查詢 → PreviewPanel 預覽
```

---

## 檔案變更清單

### Issue 1 檔案
| 檔案 | 變更類型 | 說明 |
|------|----------|------|
| `src/app/manifests/components/DeleteConfirmDialog.tsx` | 修改 | 第 48 行改用 `dangerouslySetInnerHTML` |
| `src/app/manifests/page.tsx` | 修改 | 第 772-776 行 `onConfirm` 改為 async 並加入關閉對話框 + 重新整理 |
| `src/app/manifests/hooks/useManifestOperations.ts` | 修改 | 移除第 238 行無效註解 |

### Issue 2 檔案
| 檔案 | 變更類型 | 說明 |
|------|----------|------|
| `src/app/actions/import/ocr.ts` | 重構 | 新增 `processSingleBatchWithGemini`、重構 `processImagesWithGemini` 為分批協調器 |

---

## 驗收標準

### Issue 1
- [ ] 刪除確認對話框顯示「無法**恢復**」紅字（非 HTML 標籤）
- [ ] 點擊「確定刪除」後對話框自動關閉
- [ ] 刪除成功後清單自動重新整理，該清單消失

### Issue 2
- [ ] 上傳 6 張總倉撿貨單照片，按下 OCR 匯入
- [ ] PreviewPanel 顯示 6 頁完整資料（約 264 項，每頁 44 項）
- [ ] 無資料截斷、無重複、順序正確（按頁碼排序）

---

## 風險與緩解

| 風險 | 影響 | 緩解措施 |
|------|------|----------|
| `dangerouslySetInnerHTML` XSS 風險 | 低 | 訊息為系統固定字串，非用戶輸入 |
| 分批 OCR 增加 API 呼叫次數/成本 | 中 | BATCH_SIZE=3，6 張圖 = 2 次呼叫（原 1 次），可接受 |
| 批次間頁碼重複/排序錯誤 | 中 | 參考 `parsePdfWithGemini` 成熟排序邏輯，按 `page_number` + `upload_index` 雙重排序 |
| 重試邏輯導致重複項目 | 低 | 合併階段以 `barcode + product_code` 去重 |

---

## 實作順序

1. **Issue 1 修正**（優先，風險低、見效快）
   - 修改 `DeleteConfirmDialog.tsx`
   - 修改 `ManifestsPage.tsx` onConfirm
   - 修改 `useManifestOperations.ts` 註解

2. **Issue 2 修正**
   - 新增 `processSingleBatchWithGemini` 函數
   - 重構 `processImagesWithGemini` 分批邏輯
   - 驗證 `processImagesWithGeminiAsPdf` 相容性
   - 整合測試：上傳 6 張圖 → OCR → 預覽 264 項

---

## 規格自查

- [x] 無 TBD / TODO 預留
- [x] 兩問題獨立，無相互依賴
- [x] 參考現有成熟模式（PDF 解析分批邏輯）
- [x] 變更範圍最小化，不影響其他功能
- [x] 驗收標準可測試、可驗證