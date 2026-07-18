# 清單儲存容量大小管理 — 設計規格書

**日期：** 2026-06-21  
**版本：** v2  
**狀態：** 已確認

---

## 1. 需求概述

在清單列表頁面（`/manifests`）中，為每個清單顯示其佔用的儲存空間大小。

| 清單狀態 | 顯示內容 | 資料來源 |
|---------|---------|---------|
| **Active**（進行中） | drug-photos 照片總大小 | DB `storage_size_bytes`（即時累計） |
| **Archived**（已封存） | 封存 ZIP 大小 | DB `storage_size_bytes`（封存時寫入） |

---

## 2. DB Schema 變更

### 2.1 Migration：`013_add_storage_size.sql`

```sql
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS storage_size_bytes BIGINT DEFAULT 0;

COMMENT ON COLUMN manifests.storage_size_bytes
  IS '清單儲存用量（bytes）。Active 時為 drug-photos 總大小，Archived 時為 ZIP 大小';
```

- 預設值 `0` 表示尚無任何儲存用量
- 還原完成後從 data.json 的 `file_size_bytes` 欄位重新加總

---

## 3. 寫入時機總覽

| 時機 | 操作 | 觸發位置 | 說明 |
|------|------|---------|------|
| 照片上傳成功 | `storage_size_bytes += fileSize` | `usePhotoCapture.ts` → Server Action | 遞增該照片 byte 大小 |
| 照片刪除 | 後端查 Storage info → `storage_size_bytes -= contentLength` | 刪除 Server Action（後端全權處理） | 前端只傳 photo_url，後端查 size 後遞減 |
| 封存完成 | `storage_size_bytes = ZIP 實際大小` | `archive-manifest` Edge Function | 取得 ZIP byte 大小後寫入 |
| 還原完成 | 從 data.json 的 `file_size_bytes` 加總 | `restore-manifest` Edge Function | O(1) 記憶體計算，無 Storage API 呼叫 |

---

## 4. Server Action 設計

### 4.1 新建檔案：`src/app/actions/manifests/storage.ts`

```typescript
// 照片上傳後遞增儲存大小
// fileSizeBytes: 壓縮後實際 byte 大小
export async function incrementStorageSize(
  manifestId: string,
  fileSizeBytes: number
): Promise<void>

// 照片刪除時遞減儲存大小（後端自行查 Storage info 取得大小）
// photoUrl: 要刪除的照片公開 URL，後端從中解析 storage path
export async function decrementStorageSize(
  manifestId: string,
  photoUrl: string
): Promise<void>

// 直接設定儲存大小（用於封存/還原 Edge Function 呼叫）
export async function setManifestStorageSize(
  manifestId: string,
  bytes: number
): Promise<void>
```

**`decrementStorageSize` 內部流程：**
1. 從 `photoUrl` 解析出 `drug-photos` bucket 中的相對路徑
2. 呼叫 `supabase.storage.from('drug-photos').info(path)` 取得 `contentLength`
3. 若檔案已不存在（info 失敗），跳過不更新（保守處理）
4. `UPDATE manifests SET storage_size_bytes = GREATEST(storage_size_bytes - contentLength, 0)`
5. 執行照片刪除（從 Storage 刪除檔案）

**防禦邏輯：**
- `incrementStorageSize` 使用 SQL：`UPDATE manifests SET storage_size_bytes = storage_size_bytes + $delta WHERE id = $id`
- `decrementStorageSize` 使用 SQL：`UPDATE manifests SET storage_size_bytes = GREATEST(storage_size_bytes - $delta, 0) WHERE id = $id`
- 確保刪除時不會讓數值低於 0

---

## 5. 前端顯示設計

### 5.1 檔案：`src/app/manifests/page.tsx`

在每個 manifest 卡片中新增容量資訊行。

**格式化規則（`formatStorageSize` 工具函數）：**

```typescript
function formatStorageSize(bytes: number): string {
  if (bytes === 0) return '0 MB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
```

- `0` → 顯示 `0 MB`（表示尚無照片/封存）
- `< 1 KB` → 顯示 Byte 數，避免 `0.0 MB` 造成使用者誤解
- `>= 1 KB, < 1 MB` → `X.X KB`
- `>= 1 MB` → `X.X MB`

**樣式：**
- 位置：卡片下方資訊區，統一尺寸的小字
- Active 清單：`text-[#00f2fe]`（極光藍）
- Archived 清單：`text-gray-400`（次要色）

### 5.2 前端拍照上傳改動：`src/app/scan/hooks/usePhotoCapture.ts`

在照片上傳到 Supabase Storage 成功後，取得壓縮後實際檔案 byte 大小，呼叫：

```typescript
await incrementStorageSize(manifestId, compressedFile.size);
```

### 5.3 照片刪除改動

刪除照片的 Server Action（後端）內部自行處理容量更新：

1. 前端呼叫刪除 Action 時傳入 `manifestId` 和 `photoUrl`
2. 後端在刪除 Storage 檔案前，先查 `info()` 取得檔案大小
3. 後端在同一個 Action 內執行 `storage_size_bytes` 遞減 + Storage 檔案刪除

**前端不需要知道檔案大小**，完全由後端收斂處理。

---

## 6. Edge Function 改動

### 6.1 `supabase/functions/archive-manifest/index.ts`

**改動 A：data.json 結構擴充**

在封存時，將每筆 drug_item 的照片檔案大小寫入 `data.json`：

```json
[
  {
    "id": "drug_item_uuid",
    "photo_ext": "jpg",
    "file_size_bytes": 102455
  }
]
```

- 封存流程中，原本就需要對每張照片發 HEAD 請求取得 `content-length` 以估算總大小
- 將該值直接記入 `data.json`，幾乎零額外成本

**改動 B：寫入 ZIP 大小**

在 ZIP 成功上傳到 `archived-manifests` bucket 後，新增：

```typescript
// 寫入 ZIP 實際大小到 DB
await supabaseAdmin
  .from('manifests')
  .update({ storage_size_bytes: zipSize })
  .eq('id', manifestId);
```

### 6.2 `supabase/functions/restore-manifest/index.ts`

還原完成後，從解壓後的 `data.json` 直接在記憶體中加總，**零 Storage API 呼叫**：

```typescript
// data.json 結構：[{ id, photo_ext, file_size_bytes }, ...]
const drugItemsData = JSON.parse(dataJsonString);
const totalSize = drugItemsData.reduce(
  (sum: number, item: { file_size_bytes?: number }) =>
    sum + (item.file_size_bytes ?? 0),
  0
);

await supabaseAdmin
  .from('manifests')
  .update({ storage_size_bytes: totalSize })
  .eq('id', manifestId);
```

- 複雜度從 O(N) Storage API 呼叫降為 O(1) 記憶體計算
- 完全消除還原流程的效能瓶頸與 Timeout 風險

---

## 7. 邊界情況處理

| 情境 | 處理方式 |
|------|---------|
| 照片上傳成功但 DB 更新失敗 | 不影響照片本身，`storage_size_bytes` 暫時不準確；下次操作會繼續累計 |
| 刪除時 Storage info 失敗（檔案已不存在） | 跳過不更新 `storage_size_bytes`，保守處理 |
| 照片刪除後值可能低於 0 | SQL `GREATEST(storage_size_bytes - delta, 0)` 防禦 |
| 封存失敗（ZIP 未生成） | 不更新 `storage_size_bytes`，保持原值 |
| 還原時 data.json 中舊格式無 `file_size_bytes` | `?? 0` fallback，不影響還原流程 |
| 新建立的 manifest（尚無照片） | DB default = 0 |

---

## 8. 不改動的部分

- 不修改 `drug_items` 表結構
- 不修改 Supabase Storage bucket 設定
- 不修改 `import_screenshots` bucket 相關邏輯
- 不修改 PDF 匯入流程

---

## 9. 實作檔案清單

| 檔案 | 操作 | 說明 |
|------|------|------|
| `supabase/migrations/013_add_storage_size.sql` | 新建 | Migration：新增 `storage_size_bytes` 欄位 |
| `src/app/actions/manifests/storage.ts` | 新建 | Server Action：`incrementStorageSize` / `decrementStorageSize` / `setManifestStorageSize` |
| `src/app/manifests/page.tsx` | 修改 | 卡片 UI 新增容量顯示 + `formatStorageSize` 工具函數 |
| `src/app/scan/hooks/usePhotoCapture.ts` | 修改 | 照片上傳成功後呼叫 `incrementStorageSize` |
| 照片刪除 Server Action（待定位） | 修改 | 刪除前查 Storage info，後端全權處理遞減 |
| `supabase/functions/archive-manifest/index.ts` | 修改 | data.json 擴充 `file_size_bytes`；封存完成後寫入 ZIP 大小 |
| `supabase/functions/restore-manifest/index.ts` | 修改 | 從 data.json 加總 `file_size_bytes`，O(1) 計算 |