# Google Drive 覆蓋上傳與還原後清理設計規格書

**日期：** 2026-07-07  
**版本：** v1  
**狀態：** 待實作  
**基於：** `2026-07-05-gdrive-cloud-backup-design-v2.md`

---

## 1. 背景與目的

現有 Google Drive 雲端備份系統（v2 設計）處理單一清單的「首次封存 → 遷移到 Drive → 還原」流程完善，但缺少以下兩個場景的處理：

1. **第二次封存**：同一清單封存、還原、再封存時，Drive 上已存在 `archive.zip`，現行邏輯會嘗試建立新檔案導致衝突或重複。
2. **還原後殘留**：使用者還原成功後，Drive 上的 `archive.zip` 及其父資料夾 `PhamaCount/archived/{manifestId}/` 保留佔用空間，無自動清理機制。

本規格定義：
- **覆蓋模式**：第二次封存時直接覆蓋既有 `archive.zip`（保留 fileId、權限、分享連結）。
- **還原後清理**：還原成功後刪除 Drive 上的 `archive.zip` 及其空父資料夾，釋放用戶空間。

---

## 2. 設計決策摘要

| 情境 | 決策 | 理由 |
|------|------|------|
| 第二次封存 | `files.update` + `uploadType=media` 覆蓋既有檔案 | 保留 fileId、權限、歷史連結；避免重複檔案 |
| 還原成功後 | 刪除 `archive.zip` → 確認資料夾為空 → 刪除父資料夾 | 徹底釋放空間，避免孤兒資料夾堆疊 |
| Drive 操作失敗 | 僅記錄 `archive_logs`，**不阻斷**主流程 | 還原/封存主流程已完成，清理屬於事後優化 |

---

## 3. 受影響元件

| 檔案 | 變更類型 | 說明 |
|------|----------|------|
| `supabase/functions/gdrive-migrate/index.ts` | **修改** | 新增覆蓋模式邏輯（檢查 `gdrive_file_id`，決定 update vs create） |
| `supabase/functions/gdrive-pull/index.ts` | **修改** | 還原主流程完成後，新增清理 Drive 檔案與資料夾邏輯 |

---

## 4. 詳細流程設計

### 4.1 `gdrive-migrate`：覆蓋模式流程

```
觸發：Queue Worker 或手動 API 呼叫 gdrive-migrate
輸入：{ manifestId, trigger: 'queue-worker' | 'manual' }

流程：
1. 取得鎖定（同現行 acquireLock）
2. 讀取 manifest：user_id, archived_zip_path, storage_size_bytes, gdrive_file_id
3. 取得有效 access_token
4. 檢查 Drive 空間
5. 確保根資料夾 PhamaCount/archived/ 存在
6. 確保子資料夾 {manifestId}/ 存在 → 取得 subfolderId
7. 從 Supabase Storage 取得簽名下載 URL
8. **關鍵分支**：
   IF manifest.gdrive_file_id 存在：
     → 呼叫 files.update (uploadType=media) 覆蓋內容
     → fileId 保持不變，DB 無需更新 gdrive_file_id
   ELSE：
     → 現行 resumable upload 建立新檔案
     → 取得新 fileId，更新 DB gdrive_file_id
9. 驗證上傳大小（同現行邏輯）
10. 更新 DB：cloud_backup=true, archive_status=null, archive_locked_at=null
11. 刪除 Supabase Storage ZIP
12. 更新 gdrive_migration_jobs：status=completed, storage_deleted=true
13. 記錄 archive_logs 成功
14. 釋放鎖定
```

**Drive API 呼叫差異：**

| 模式 | API 端點 | Method | 備註 |
|------|----------|--------|------|
| 首次建立 | `/files?uploadType=resumable` | POST | 需分片上傳 |
| 覆蓋模式 | `/upload/drive/v3/files/{fileId}?uploadType=media` | PATCH | 單次媒體上傳，body 為 zip stream |

---

### 4.2 `gdrive-pull`：還原後清理流程

```
觸發：前端點擊「還原」→ 呼叫 /api/gdrive/pull → gdrive-pull Edge Function
現行流程：下載 ZIP → 上傳回 Supabase → 更新 DB cloud_backup=false → 完成

新增清理流程（在 DB 更新成功後、回傳成功前）：
1. 取得 gdrive_file_id（從 manifest 讀取，還未清空）
2. 取得父資料夾 ID（subfolderId）：
   - 可從 gdrive_file_id 的 parents 查詢，或重新用 manifestId 查找 PhamaCount/archived/{manifestId}/
3. 刪除 archive.zip：
   DELETE /files/{gdrive_fileId}
4. 列出父資料夾內容：
   GET /files?q='{subfolderId}' in parents and trashed=false&fields=files(id)
5. 若資料夾為空（files.length === 0）：
   刪除父資料夾：
   DELETE /files/{subfolderId}
6. 以上步驟全部包在 try-catch 中，失敗只記 log：
   INSERT INTO archive_logs (manifest_id, action='gdrive_cleanup', status='failed', message=err.message)
```

**錯誤處理策略：**

| 失敗點 | 處理方式 |
|--------|----------|
| 刪除 zip 失敗 (404/403/500) | 記 log，繼續嘗試刪資料夾 |
| 列出資料夾失敗 | 記 log，跳過刪資料夾 |
| 刪資料夾失敗 (非空/權限/404) | 記 log，不阻斷 |
| 任何網路錯誤 | 記 log，主流程回傳 success |

---

## 5. 資料庫變更

**無需 Schema 變更**。僅使用現有欄位：
- `manifests.gdrive_file_id`：判斷是否為覆蓋模式，覆蓋時不變更
- `manifests.cloud_backup`：還原後設為 `false`
- `archive_logs`：記錄 `gdrive_cleanup` 成功/失敗

---

## 6. 介面合約

### 6.1 `gdrive-migrate` Request/Response 不變

```typescript
// Request
{ manifestId: string, trigger?: 'queue-worker' | 'manual' }

// Response (success)
{ success: true, fileId: string, mode: 'created' | 'overwritten' }

// Response (skipped)
{ skipped: 'Already locked or processing' }

// Response (error)
{ error: string }
```

新增回傳 `mode` 供前端/日誌區分首次 vs 覆蓋。

### 6.2 `gdrive-pull` Request/Response 不變

```typescript
// Request
{ manifestId: string }

// Response (success)
{ success: true, zipSize: number, cleanup: { zipDeleted: boolean, folderDeleted: boolean } }

// Response (error)
{ error: string, code?: 'storage_full_prevent' | 'gdrive_auth_expired' | 'cloud_backup_missing' }
```

新增 `cleanup` 欄位回傳清理結果。

---

## 7. 實作細節提醒

### 7.1 `gdrive-migrate` 覆蓋上傳代碼片段

```typescript
// 取得 manifest 含 gdrive_file_id
const { data: manifest } = await supabase
  .from('manifests')
  .select('user_id, archived_zip_path, storage_size_bytes, gdrive_file_id')
  .eq('id', manifestId)
  .single();

const zipSize = manifest.storage_size_bytes;
const signedUrl = (await supabase.storage.from(ARCHIVED_BUCKET).createSignedUrl(...)).data.signedUrl;

// 下載 ZIP stream
const downloadRes = await fetch(signedUrl);
const zipStream = downloadRes.body; // ReadableStream

if (manifest.gdrive_file_id) {
  // === 覆蓋模式 ===
  const uploadRes = await fetch(
    `${GOOGLE_DRIVE_API.replace('/drive/', '/upload/drive/')}/files/${manifest.gdrive_file_id}?uploadType=media`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/zip',
        'Content-Length': zipSize.toString(),
      },
      body: zipStream,
    }
  );
  if (!uploadRes.ok) throw new Error(`Overwrite upload failed: ${uploadRes.status}`);
  // fileId 不變，DB 無需更新 gdrive_file_id
} else {
  // === 首次建立模式（現行 resumable upload 邏輯）===
  const fileId = await uploadToDriveStream(accessToken, signedUrl, subfolderId, 'archive.zip', zipSize);
  // 更新 DB gdrive_file_id = fileId
}
```

### 7.2 `gdrive-pull` 清理代碼片段

```typescript
// 在 DB 更新 cloud_backup=false 成功後
const gdriveFileId = manifest.gdrive_file_id;
let zipDeleted = false;
let folderDeleted = false;

try {
  // 1. 刪除 zip
  const delFileRes = await fetch(`${GOOGLE_DRIVE_API}/files/${gdriveFileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (delFileRes.ok || delFileRes.status === 404) zipDeleted = true;

  // 2. 找父資料夾（用 manifestId 查找 PhamaCount/archived/{manifestId}/）
  const rootFolderId = await ensureRootFolder(accessToken, userId); // 現有函式可取得
  const listFolderRes = await fetch(
    `${GOOGLE_DRIVE_API}/files?q=name='${manifestId}' and '${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const folderData = await listFolderRes.json();
  const subfolderId = folderData.files?.[0]?.id;

  if (subfolderId) {
    // 3. 確認資料夾為空
    const listContentRes = await fetch(
      `${GOOGLE_DRIVE_API}/files?q='${subfolderId}' in parents and trashed=false&fields=files(id)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const contentData = await listContentRes.json();
    
    if (!contentData.files?.length) {
      // 4. 刪除空資料夾
      const delFolderRes = await fetch(`${GOOGLE_DRIVE_API}/files/${subfolderId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (delFolderRes.ok || delFolderRes.status === 404) folderDeleted = true;
    }
  }
} catch (err) {
  await logAction(manifestId, 'gdrive_cleanup', 'failed', err.message);
}

// 回傳 cleanup 結果
return jsonResponse({ success: true, zipSize, cleanup: { zipDeleted, folderDeleted } });
```

---

## 8. 測試案例

| 測試案例 | 預期結果 |
|----------|----------|
| 首次封存 → 遷移到 Drive → 還原 → 再次封存 | 第二次封存走覆蓋模式，fileId 不變，Drive 只有一個 archive.zip |
| 遷移到 Drive 的清單點擊還原 | 還原成功後，Drive 上的 archive.zip 及父資料夾被刪除，DB cloud_backup=false, gdrive_file_id=null |
| 還原成功但 Drive 刪除 zip 失敗 (403) | 主流程回傳 success，archive_logs 記錄 cleanup failed，資料夾殘留（下次清理或手動處理） |
| 還原成功，刪除 zip 成功但資料夾非空（有其他檔案） | zipDeleted=true, folderDeleted=false，資料夾保留 |
| 使用者手動刪除 Drive 上的 archive.zip 再點還原 | gdrive-pull 回傳 `cloud_backup_missing` 錯誤，前端提示「雲端備份遺失」 |

---

## 9. 風險與應對

| 風險 | 應對 |
|------|------|
| `files.update` media upload 超時（大檔） | 維持 8MB chunk 邏輯改用 resumable？→ 覆蓋模式通常檔案較小（已封存過），優先用 media；若 > 50MB 改用 resumable update |
| 並發：同時觸發 migrate 和 pull | DB 鎖機制（archive_status + archive_locked_at）防止並發 |
| Drive API 配額限制 (429) | 現有指數退避重試機制復用 |
| 父資料夾刪除失敗導致孤兒資料夾堆疊 | 週期性 `gdrive-storage-cleanup` 掃描空資料夾清理 |

---

## 10. 驗收條件

- [ ] 首次封存 → 遷移 → 還原 → 再次封存：Drive 僅有一個 `archive.zip`，`gdrive_file_id` 不變
- [ ] 遷移後的清單點擊還原：還原成功，Drive 上 `archive.zip` 及 `PhamaCount/archived/{manifestId}/` 資料夾皆被刪除
- [ ] 還原成功但 Drive 刪除失敗：主流程回傳 success，`archive_logs` 有 `gdrive_cleanup` failed 記錄
- [ ] 手動刪除 Drive 檔案後點還原：回傳 `cloud_backup_missing`，前端正確提示
- [ ] `gdrive-migrate` 回傳 `mode: 'overwritten'` 正確；首次回傳 `mode: 'created'`

---

## 11. 實作順序建議

1. 修改 `gdrive-migrate/index.ts`：新增覆蓋模式邏輯、回傳 `mode`
2. 修改 `gdrive-pull/index.ts`：新增清理邏輯、回傳 `cleanup`
3. 部署 Edge Functions 到 Supabase
4. 手動測試上述驗收案例
5. 觀察 `archive_logs` 確認清理記錄

---

**規格書完成。請審查內容，確認無誤後我將進入 implementation plan 階段。**