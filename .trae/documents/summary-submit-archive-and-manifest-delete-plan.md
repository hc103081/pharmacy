# 計畫：提交差異結案改為 ZIP 封存 + 清單頁封存按鈕改回垃圾桶

## 摘要

1. **清點總結報告頁**（`src/app/summary/[manifestId]/page.tsx`）的「提交差異結案」按鈕，從舊版簡易封存（只改 `status = 'completed'`）改為觸發真正的 ZIP 封存壓縮上傳流程（Edge Function `archive-manifest`）
2. **清單頁**（`src/app/manifests/page.tsx`）active tab 中每個清單卡片的 `Save` 封存按鈕，改回原本的 `Trash2` 垃圾桶永久刪除按鈕
3. **清單頁** archived tab 的「解壓還原」按鈕保留不變

---

## 現狀分析

### 3 套「結案/刪除/封存」邏輯共存

| 邏輯 | 位置 | 行為 | status 結果 |
|------|------|------|-------------|
| 舊版簡易封存 (A) | `summary/[manifestId]/page.tsx` → `handleArchive` | 計算差異 → UPDATE `status='completed'`, `conclusion_type`, `total_discrepancy` | `completed` |
| 新版 ZIP 封存 (B) | Edge Function `archive-manifest`（透過 `manifest-operation` API 路由） | 打包 ZIP（data.json + photos）→ 上傳 Storage → DELETE drug_items → `status='archived'` | `archived` |
| 永久刪除 (C) | `actions/manifests/archive.ts` → `deleteManifest`（Server Action） | 刪除 Storage 照片 → DELETE manifest（CASCADE drug_items） | 不存在 |

### 目前按鈕狀態

- **總結報告頁** → 使用 (A) 舊版簡易封存（按鈕文字：確認封存清單 / 提交差異結案）
- **清單頁 active tab** → 使用 (B) 新版 ZIP 封存（Save icon，hover: 封存舊清單）
- **清單頁 archived tab** → 還原按鈕（RefreshCw icon，hover: 解壓還原）
- **垃圾桶永久刪除 (C)** → UI 按鈕已移除，但 `confirmDeleteId`、`handleDelete`、`Trash2` icon、`AlertTriangle` icon、刪除 Dialog JSX、以及 `deleteManifest` 導入仍殘留為 dead code

### 相關檔案

| 檔案 | 角色 |
|------|------|
| `src/app/summary/[manifestId]/page.tsx` | 總結報告頁：需修改的 **handleArchive 按鈕行為** |
| `src/app/manifests/page.tsx` | 清單選擇頁：需修改的 **active tab 按鈕（封存→垃圾桶）** |
| `src/app/actions/manifests/archive.ts` | Server Action：`deleteManifest`（永久刪除）、`archiveManifest`（舊版簡易封存） |
| `src/app/api/manifest-operation/route.ts` | API 路由：轉發 SSE 到 Edge Function |
| `supabase/functions/archive-manifest/index.ts` | Edge Function：真正的 ZIP 封存壓縮邏輯 |
| `supabase/functions/restore-manifest/index.ts` | Edge Function：解壓還原邏輯 |
| `supabase/functions/archive-cron/index.ts` | Cron 分派邏輯 |
| `src/types/index.ts` | 型別定義（`Manifest` interface） |
| `supabase/migrations/012_add_archive_support.sql` | DB Schema（archive_status 等欄位） |
| `supabase/migrations/001_initial_schema.sql` | 初始 Schema（status CHECK 值） |
| `docs/superpowers/specs/2026-06-19-manifest-archive-design.md` | 設計規格書 |

---

## 變更計畫

### 變更 1：總結報告頁「提交差異結案」改為 ZIP 封存

**檔案：** `src/app/summary/[manifestId]/page.tsx`

**要做的事：**
1. 重寫 `handleArchive` 函數：不再直接呼叫 Supabase UPDATE，改為調用 `startZIPArchive` 函數
2. 新增 `startZIPArchive` 函數：仿照 `manifests/page.tsx` 中的 `startOperation` 模式，透過 EventSource (SSE) 連接到 `/api/manifest-operation?operation=archive&manifestId=xxx`
3. 先計算並更新 `conclusion_type` 和 `total_discrepancy`（保留舊版差異記錄邏輯），再觸發 ZIP 封存
4. 在 ZIP 封存期間，按鈕顯示進度 spinner 和狀態文字（如「封存中...」「壓縮中...」）
5. 完成後導航至 `/manifests`

**新增匯入：**
- 無需新套件，只需在元件內新增 SSE 相關邏輯

**實作要點：**
- 先執行 UPDATE 設定 `conclusion_type` 和 `total_discrepancy`
- 再透過 EventSource 觸發 ZIP 封存流程
- SSE 完成後關閉 EventSource，`router.push('/manifests')`

---

### 變更 2：清單頁 active tab「封存」按鈕改回垃圾桶刪除

**檔案：** `src/app/manifests/page.tsx`

**要做的事：**
1. 將第 333-341 行的 `Save` 封存按鈕區塊替換為 `Trash2` 垃圾桶刪除按鈕
2. 垃圾桶按鈕點擊後設定 `confirmDeleteId`（觸發現有的刪除確認 Dialog，第 372-405 行）
3. 移除不再需要的 `handleArchive`（第 167-169 行）、`startOperation`（第 83-165 行）中與 archive 相關的部分 — **但要保留 restore 功能**
4. 移除不再需要的 `Save` icon 匯入（第 16 行）
5. 確保「封存符合條件的所有清單」按鈕和 `handleArchiveAll` 仍保留（批次封存功能不變）
6. 確保 archived tab 的還原按鈕和 `handleRestore` 仍保留

**精確的 JSX 替換：**
- 將 `Save` 按鈕 → 改為 `Trash2` 按鈕，點擊設定 `confirmDeleteId(m.id)`
- 保留 operationProgress 相關邏輯（restore 仍需要）
- 注意：`Save` icon 也在「封存符合條件的所有清單」按鈕使用，不應移除該 import

---

### 變更 3：保留「封存符合條件的所有清單」功能

**檔案：** `src/app/manifests/page.tsx`

**要做的事：**
- 第 246-268 行的全域封存按鈕與 `handleArchiveAll` 保持不變
- 這個功能是批次將所有符合條件（超過 30 天）的清單進行 ZIP 封存，屬於管理員操作

---

### 變更 4：清理不再使用的 import

**檔案：** `src/app/manifests/page.tsx`

**要做的事：**
- 確認 `Save` icon 仍在「封存符合條件的所有清單」按鈕中使用（第 262 行）→ **不移除**
- `Trash2` icon 已存在於 import（第 12 行），不需新增
- `AlertTriangle` icon 已在 import 中（第 14 行），刪除 Dialog 會用到

---

### 不變更的項目

- `src/app/actions/manifests/archive.ts` — `deleteManifest` 和 `archiveManifest` 不變
- `src/app/api/manifest-operation/route.ts` — 不變
- `supabase/functions/archive-manifest/index.ts` — 不變
- `supabase/functions/restore-manifest/index.ts` — 不變
- `supabase/functions/archive-cron/index.ts` — 不變
- `src/types/index.ts` — 不變（即使缺少部分欄位，這屬於額外改進）
- `supabase/migrations/*.sql` — 不變
- 測試檔案 — 不變

---

## 假設與決策

1. **結論記錄優先**：「提交差異結案」時，先寫入 `conclusion_type` 和 `total_discrepancy` 再觸發 ZIP 封存 —— 這樣即使封存失敗，結論記錄也已保存
2. **SSE 模式沿用**：使用與 manifests 頁面相同的 SSE (EventSource) 模式，確保進度透明
3. **垃圾桶僅限 active 清單**：archived 清單不顯示垃圾桶（已透過 ZIP 封存壓縮，若要刪除需先還原）
4. **保留批次封存**：「封存符合條件的所有清單」按鈕保留，這是排程自動化之外的補充手動操作

---

## 驗證步驟

1. **總結報告頁 ZIP 封存**：
   - 進入總結報告頁，點擊「提交差異結案」
   - 確認按鈕顯示封存進度
   - 完成後回到 `/manifests`，清單應在 archived tab 中

2. **清單頁垃圾桶刪除**：
   - 在 active tab 點擊垃圾桶按鈕
   - 確認跳出「確認刪除清單」Dialog
   - 點擊「確定刪除」後清單消失

3. **清單頁還原功能不變**：
   - 切換到 archived tab
   - 確認「解壓還原」按鈕仍存在且可點擊
   - 還原後清單回到 active tab

4. **刪除確認 Dialog 正常**：
   - 確認 Dialog 中的「取消」和「確定刪除」按鈕都正常運作
   - 刪除過程中有 loading 狀態