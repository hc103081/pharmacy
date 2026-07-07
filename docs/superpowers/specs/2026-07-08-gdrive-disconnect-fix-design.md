# Google Drive 斷開連線修復與資料顯示優化設計文件

**日期**: 2026-07-08
**狀態**: 設計中

---

## 1. 問題背景

### 1.1 問題 1：儲存空間用量和根資料夾 ID 未顯示
- **現象**：下拉選單中「儲存空間用量」與「根資料夾 ID」區域顯示為空
- **根因**：
  - `gdrive_root_folder_id` 僅在 `gdrive-migrate` / `gdrive-pull` Edge Functions 執行 `ensureRootFolder()` 時才會被寫入資料庫
  - 前端連線成功（OAuth callback）時**未**自動觸發根資料夾建立/快取
  - `storageQuota` 直接呼叫 Google Drive API，token 過期或網路錯誤時靜默失敗，無錯誤提示

### 1.2 問題 2：斷開連線按鈕點擊無反應
- **現象**：點擊「斷開連線」按鈕後，UI 狀態不更新，按鈕仍保持連線狀態
- **根因**：`handleGdriveDisconnect` 中的 Supabase 刪除語法錯誤：
  ```typescript
  await supabase
    .from('user_gdrive_connections')
    .delete()  // ❌ 缺少 .eq('user_id', user.id)
    .eq('user_id', user.id);
  ```
  這會嘗試刪除**整張表所有資料**，RLS 政策會阻擋，導致靜默失敗。

---

## 2. 解決方案（方案 A：最小修復）

### 2.1 修復項目清單

| # | 檔案 | 修改內容 | 優先級 |
|---|------|----------|--------|
| 1 | `src/app/manifests/page.tsx` | 修復 `handleGdriveDisconnect` 的 `.delete().eq()` 鏈式調用順序 | P0 |
| 2 | `src/app/auth/gdrive/callback/route.ts` | 連線成功後自動呼叫 `ensureRootFolder` 建立/快取根資料夾 ID | P0 |
| 3 | `src/app/manifests/page.tsx` | 改善 `checkGdriveConnection`：<br>• 加入 `rootFolderId` 載入狀態<br>• `storageQuota` 失敗時顯示錯誤提示而非靜默忽略 | P1 |
| 4 | `src/app/manifests/page.tsx` | 修正按鈕 `disabled` 邏輯：`disabled={gdriveConnected === null}` | P1 |

### 2.2 詳細設計

#### 2.2.1 修復斷開連線邏輯
```typescript
// 修正前（錯誤）
await supabase
  .from('user_gdrive_connections')
  .delete()
  .eq('user_id', user.id);

// 修正後（正確）
const { error } = await supabase
  .from('user_gdrive_connections')
  .delete()
  .eq('user_id', user.id);

if (error) throw error;
```

#### 2.2.2 連線時自動建立根資料夾
在 `callback/route.ts` 寫入資料庫後、重定向前，加入：
```typescript
// 確保根資料夾存在並快取 ID
try {
  const rootFolderRes = await fetch(
    `${request.nextUrl.origin}/api/gdrive/ensure-root-folder`,
    { method: 'POST' }
  );
  if (!rootFolderRes.ok) console.warn('Root folder ensure failed');
} catch (e) {
  console.warn('Root folder ensure error:', e);
}
```

需要新增 `src/app/api/gdrive/ensure-root-folder/route.ts`。

#### 2.2.3 改善前端狀態管理
- 新增 `gdriveLoading` 狀態區分「檢查中」vs「已斷開」
- `storageQuota` 抓取失敗時顯示「無法取得用量」而非隱藏
- `rootFolderId` 為 null 時顯示「尚未建立」並提供重試按鈕

---

## 3. 架構影響評估

| 面向 | 影響 | 風險 |
|------|------|------|
| 資料庫 | 無 schema 變更，僅多寫入 `gdrive_root_folder_id` | 低 |
| API | 新增 1 個輕量 API（ensure-root-folder） | 低 |
| 前端 | 僅修改 `page.tsx` 邏輯，無 UI 結構變更 | 低 |
| 權限 | 現有 RLS 政策足夠，無需調整 | 無 |

---

## 4. 測試計畫

1. **斷開連線流程**：連線 → 開啟下拉選單 → 點擊斷開 → 確認按鈕變紅（未連線）→ 點擊重新連線 → 完成 OAuth → 確認恢復連線
2. **根資料夾 ID 顯示**：首次連線後檢查下拉選單是否顯示 `rootFolderId`
3. **儲存空間用量**：有額度時顯示「已用 / 總量」；無額度/錯誤時顯示友善提示
4. **邊界情況**：token 過期時自動刷新、網路斷線時的錯誤處理

---

## 5. 實作順序

1. 建立 `ensure-root-folder` API
2. 修改 `callback/route.ts` 整合自動建立根資料夾
3. 修復 `page.tsx` 中的 `handleGdriveDisconnect`
4. 改善 `page.tsx` 的連線狀態檢查與顯示邏輯
5. 手動測試驗證