# Google Drive 雲端備份移轉 — 設計規格書

**日期：** 2026-06-26
**版本：** v1
**狀態：** 草案

***

## 1. 需求概述

### 1.1 問題

現有封存機制將已封存清單的 ZIP 存放在 Supabase Storage `archived-manifests` bucket。Supabase Free Tier 僅提供 1GB Storage 空間，隨時間累積 ZIP 檔案將佔滿配額，導致新封存無法上傳。

### 1.2 解決方案

將已封存超過 1 個月的清單 ZIP 移轉到用戶自己的 Google Drive，並從 Supabase Storage 中刪除原始 ZIP，釋放空間。用戶還原時系統自動從 Google Drive 下載 ZIP 回 Supabase 再執行還原，流程無感。

### 1.3 核心功能

* **強制綁定 Google Drive：** 用戶首次登入必須 OAuth 授權 Google Drive 才能進入系統

* **Cron 定期移轉：** 每天自動將「已封存 > 1 個月」的 ZIP 移轉到 Google Drive

* **自動還原：** 用戶點「還原」時，系統自動從 Google Drive 下載 ZIP 並執行還原

* **Supabase 空間釋放：** 移轉成功後刪除 Supabase 中的 ZIP

### 1.4 技術決策摘要

| 決策              | 選擇                            | 原因                     |
| --------------- | ----------------------------- | ---------------------- |
| 雲端類型            | 用戶自己的 Google Drive            | 用戶個人空間，不佔開發者配額         |
| 授權方式            | 強制綁定，不可跳過                     | 確保備份路徑可用               |
| 移轉時機            | 定期 Cron（已封存 > 1 個月）           | 有空間緩衝，實作簡單             |
| 還原體驗            | 同步等待，自動從 Google Drive 拉       | 用戶無感                   |
| 備份後處置           | Supabase 完全釋放（刪除 ZIP）         | 1GB 限制的解法              |
| 執行環境            | Supabase Edge Function (Deno) | 150s 逾時比 Vercel 10s 寬裕 |
| Google Drive 上傳 | Resumable Upload（分片）          | 支援斷點續傳，降低網路中斷風險        |
| OAuth Scope     | `drive.file`                  | 只能存取應用自己建立的檔案，不碰用戶其他資料 |

***

## 2. 架構

### 2.1 狀態機（擴充）

現有狀態機：

```
active → archiving → archived → restoring → active
```

擴充後：

```
active → archiving → archived → migrating → cloud_archived → restoring → active
                      ↑           │
                      └───────────┘ (移轉失敗，退回 archived)
```

| 狀態               | archive\_status | cloud\_backup | 說明                              |
| ---------------- | --------------- | ------------- | ------------------------------- |
| `archived`       | NULL            | false         | ZIP 在 Supabase Storage          |
| `migrating`      | 'migrating'     | false         | 正在移轉到 Google Drive              |
| `cloud_archived` | NULL            | true          | ZIP 在 Google Drive，Supabase 已釋放 |
| `restoring`      | 'restoring'     | false         | 正在還原（ZIP 已拉回 Supabase）          |

### 2.2 整體架構圖

```
┌─ 用戶首次登入 (強制綁定) ──────────────────────────┐
│  1. 檢查 user_gdrive_connections 是否有記錄          │
│  2. 無 → 跳轉 Google OAuth 授權頁                    │
│  3. 用戶同意 → callback 回存 refresh_token           │
│  4. 進入系統                                         │
└──────────────────────────────────────────────────────┘

┌─ gdrive-migrate-cron (每天 04:00 UTC) ───────────────┐
│  1. 查詢「已封存 > 1 個月」且 cloud_backup = false    │
│  2. 逐一檢查用戶 gdrive token 有效性                   │
│  3. 逐一檢查 Google Drive 剩餘空間                     │
│  4. 分派 gdrive-migrate (Edge Function)               │
│     每次 3 筆併發，間隔 500ms                          │
│  5. 遇到 429 → exponential backoff                    │
└──────────────────────────────────────────────────────┘

┌─ gdrive-migrate (單一清單移轉) ──────────────────────┐
│  1. ACQUIRE LOCK (archive_status = 'migrating')       │
│  2. 刷新 OAuth token                                  │
│  3. 確保 PhamaCount 資料夾存在於 Google Drive          │
│  4. 從 Supabase Storage 下載 ZIP                      │
│  5. Resumable Upload 上傳到 Google Drive               │
│     資料夾: PhamaCount/archived/{manifestId}/         │
│  6. 驗證上傳完整（比對 size）                          │
│  7. UPDATE DB: cloud_backup=true, gdrive_file_id=xxx  │
│     archive_status=NULL                               │
│  8. 刪除 Supabase archived-manifests 中的 ZIP          │
│  9. 釋放鎖，記錄 archive_logs                          │
│  ★ 失敗 → 退回 archived, 釋放鎖, archive_logs 記錄    │
└──────────────────────────────────────────────────────┘

┌─ 還原流程 (cloud_archived 清單) ────────────────────┐
│  前端點「還原」                                        │
│  → gdrive-pull (Edge Function)                       │
│    1. 刷新 OAuth token                                │
│    2. 從 Google Drive 下載 ZIP                        │
│    3. 上傳回 Supabase archived-manifests              │
│    4. UPDATE: cloud_backup=false, archived_zip_path    │
│       storage_size_bytes = zipSize                    │
│  → 前端收到成功                                       │
│  → 觸發現有 restore-manifest (Edge Function)          │
│  → 還原完成                                           │
└──────────────────────────────────────────────────────┘
```

***

## 3. OAuth 2.0 流程

### 3.1 Google Cloud Console 設定（開發者手動）

* 建立 OAuth 2.0 Client（Web application）

* Redirect URI：`https://{domain}/auth/gdrive/callback`

* Scope：`https://www.googleapis.com/auth/drive.file`

* 啟用 Drive API

**⚠️ 上線前強制檢核：** Google OAuth 同意畫面必須切換為 **Production** 狀態。若維持 Testing 模式，Google 會強制讓所有 Refresh Token 在 7 天後過期，導致系統上線一週內所有背景移轉全部癱瘓。

### 3.2 環境變數

```
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=https://{domain}/auth/gdrive/callback
```

### 3.3 OAuth 流程

```
用戶登入 → 檢查 user_gdrive_connections
  → 無記錄 → 跳轉 /auth/gdrive/connect
    → Google OAuth 授權頁
    → 用戶同意
    → callback 回到 /auth/gdrive/callback
      → Next.js API Route 用 authorization code 換 token
      → 存 refresh_token + access_token 到 user_gdrive_connections
      → 重新導向回首頁
  → 有記錄且 token 有效 → 進入系統
  → 有記錄但 access_token 過期 → 自動用 refresh_token 刷新
  → refresh_token 也失效 → 提示重新授權（跳轉 /auth/gdrive/connect）
```

### 3.4 Token 刷新策略

* `access_token` 有效期約 1 小時

* `refresh_token` 只要不被撤銷就長期有效（Google 6 個月未使用會撤銷）

* **刷新時機：** 每次需要呼叫 Google Drive API 前，檢查 `token_expires_at`，過期則用 `refresh_token` 換新的 `access_token`

* **刷新失敗（refresh\_token 失效）：** 標記 `user_gdrive_connections` 為失效狀態，前端提示重新授權

***

## 4. DB Schema 變更

### 4.1 Migration：`015_add_gdrive_backup.sql`

```sql
-- 1. manifests 表新增欄位
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS cloud_backup BOOLEAN DEFAULT false;
COMMENT ON COLUMN manifests.cloud_backup
  IS 'false: ZIP 在 Supabase Storage, true: ZIP 已移轉到 Google Drive';

ALTER TABLE manifests ADD COLUMN IF NOT EXISTS gdrive_file_id TEXT;
COMMENT ON COLUMN manifests.gdrive_file_id
  IS 'Google Drive 中的檔案 ID，用於下載/刪除';

-- 新增 archived_at 欄位（追蹤封存時間，Cron 據此判斷移轉條件）
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
COMMENT ON COLUMN manifests.archived_at
  IS '清單被封存的時間，用於判斷何時移轉到 Google Drive';

-- 2. 建立用戶 Google Drive 連線表
CREATE TABLE IF NOT EXISTS user_gdrive_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  scope TEXT,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  gdrive_root_folder_id TEXT,  -- PhamaCount 根資料夾 ID（快取避免重複查詢）
  UNIQUE(user_id)
);

-- 3. 索引：加速 Cron 查詢
CREATE INDEX IF NOT EXISTS idx_manifests_cloud_backup_lookup
ON manifests (cloud_backup, archived_at)
WHERE cloud_backup = false AND archive_status IS NULL;

-- 4. 索引：用戶 gdrive 連線查詢
CREATE INDEX IF NOT EXISTS idx_user_gdrive_user_id
ON user_gdrive_connections (user_id);

-- 5. RLS：用戶只能存取自己的 gdrive 連線
ALTER TABLE user_gdrive_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gdrive connection"
ON user_gdrive_connections
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own gdrive connection"
ON user_gdrive_connections
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own gdrive connection"
ON user_gdrive_connections
FOR UPDATE
TO authenticated
USING (user_id = auth.uid());
```

### 4.2 archive-manifest Edge Function 改動

封存完成時，額外寫入 `archived_at`：

```typescript
await supabase
  .from('manifests')
  .update({
    status: 'archived',
    archive_status: 'archived',
    archived_zip_path: zipPath,
    archive_locked_at: null,
    storage_size_bytes: zipArrayBuffer.length,
    archived_at: new Date().toISOString(),  // 新增
  })
  .eq('id', manifestId);
```

***

## 5. Edge Function 詳細流程

### 5.1 `gdrive-migrate-cron`（Cron 分派入口）

**觸發：** `pg_cron` 每天 04:00 UTC（與現有 archive-cron 錯開 1 小時）

**流程：**

1. **查詢符合條件清單：**

   ```sql
   SELECT m.id, m.user_id
   FROM manifests m
   JOIN user_gdrive_connections g ON m.user_id = g.user_id
   WHERE m.status = 'archived'
     AND m.archive_status IS NULL
     AND m.cloud_backup = false
     AND m.archived_at < NOW() - INTERVAL '30 days'
     AND g.refresh_token IS NOT NULL
   ```

2. **按 user_id 分組後一次性分派（避免 Cron 本身逾時）：**

   **問題：** 當有數百筆清單需要移轉時，`sleep(500) + await invokeGdriveMigrate()` 的序列等待模式會導致 Cron Edge Function 本身超過 150 秒硬性限制，後半段的移轉任務根本沒被派發。

   **解法：** Cron 函數「只負責查詢與分派」，不做序列等待。將結果寫入一個 `gdrive_migration_jobs` 佇列表，由 Cron 快速批次寫入後結束。實際移轉由 `gdrive-migrate` 自行處理佇列，或改用 Supabase Database Webhook 觸發。

   ```sql
   -- 新建 gdrive_migration_jobs 佇列表
CREATE TABLE IF NOT EXISTS gdrive_migration_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id UUID NOT NULL REFERENCES manifests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL DEFAULT 'cron', -- 'cron' | 'manual'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'dispatched' | 'processing' | 'completed' | 'failed'
  retry_count INTEGER DEFAULT 0,
  storage_deleted BOOLEAN DEFAULT FALSE,  -- 標記 Supabase Storage 中的 ZIP 是否已成功刪除
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

   CREATE INDEX IF NOT EXISTS idx_gdrive_jobs_status
   ON gdrive_migration_jobs (status, created_at);
   ```

   Cron 流程改為：

   1. **查詢符合條件清單**（同前）
   2. **批次寫入佇列**（一次寫入最多 50 筆，單次 SQL 操作）：
      ```sql
      INSERT INTO gdrive_migration_jobs (manifest_id, user_id, trigger)
      VALUES (...), (...), ...
      ON CONFLICT DO NOTHING; -- 冪等防重複
      ```
   3. **結束 Cron**（通常只需 2-5 秒，完全不擔心逾時）

   實際移轉由以下方式觸發：
   - **選項 A（建議）：** 另設一個短間隔的 `gdrive-queue-worker` Cron（每 5 分鐘），查詢 `pending` 狀態的 job，按 `user_id` 分組序列執行
   - **選項 B：** 在 Step 2 寫入佇列後，同步用 `Promise.all` 分派最多 3 個用戶的 `gdrive-migrate`，但不等待結果（Fire-and-Forget）

   本規格書採用**選項 A**（Queue Worker 模式），理由：
   - Cron 負載極低（單次只 INSERT，2-5 秒完成）
   - Worker 有充裕時間處理每筆移轉，不擔心 150s 限制
   - 失敗可自動重試（`retry_count` 追蹤）

   - 每次最多 3 個**用戶**併發處理
   - 同一用戶的多筆清單嚴格序列執行，確保 token 刷新不衝突
- 遇到 429 rate limit → exponential backoff（1s, 2s, 4s）
- 同一用戶內部的清單間隔 500ms，不同用戶批次間隔 500ms

**新增 `gdrive-queue-worker`（每 5 分鐘執行一次）：**

```typescript
// gdrive-queue-worker Edge Function
serve(async () => {
  // 1. 批次取得最多 6 筆需要處理的 job
  //    - pending 狀態的 job（等待處理）
  //    - processing 超時的 job（已處理超時，視為孤兒任務，需重試）
  const { data: jobs } = await supabase
    .from('gdrive_migration_jobs')
    .select('id, manifest_id, user_id')
    .or(
      `and(status.eq.pending),and(status.eq.processing,updated_at.lt.${new Date(
        Date.now() - 30 * 60 * 1000
      ).toISOString()})` // processing 超過 30 分鐘視為超時
    )
    .order('created_at')
    .limit(6);

  if (!jobs || jobs.length === 0) return jsonResponse({ message: 'No jobs' });

  // 2. 標記為 processing（避免重複處理）
  await supabase
    .from('gdrive_migration_jobs')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .in('id', jobs.map(j => j.id));

  // 3. 按 user_id 分組序列執行（防止同一用戶的 token 競爭）
  const grouped = new Map<string, typeof jobs>();
  for (const job of jobs) {
    if (!grouped.has(job.user_id)) grouped.set(job.user_id, []);
    grouped.get(job.user_id)!.push(job);
  }

  const userBatches = chunk([...grouped.entries()], 3);
  for (const batch of userBatches) {
    await Promise.all(
      batch.map(async ([userId, userJobs]) => {
        for (const job of userJobs) {
          try {
            await invokeGdriveMigrate(job.manifest_id);
            await supabase
              .from('gdrive_migration_jobs')
              .update({ status: 'completed', updated_at: new Date().toISOString() })
              .eq('id', job.id);
          } catch (err) {
            // 檢查是否為 429 Rate Limit 錯誤
            const isRateLimitError = err?.message?.includes('429') || 
                                    err?.message?.includes('Too Many Requests');

            // 失敗重試機制
            const { data: jobData } = await supabase
              .from('gdrive_migration_jobs')
              .select('retry_count')
              .eq('id', job.id)
              .single();

            const newRetryCount = (jobData?.retry_count || 0) + 1;
            const shouldRetry = newRetryCount < 3;

            // 特別處理 429 錯誤：直接中止本批次處理，讓餘下的 job 保持 pending 狀態
            // 以避免在短時間內連續觸發 429 錯誤，耗盡所有重試機會
            if (isRateLimitError) {
              // 將當前 job 設置為 failed（因為已達到重試上限或是首次就遇到 429）
              await supabase
                .from('gdrive_migration_jobs')
                .update({
                  status: 'failed',
                  retry_count: newRetryCount,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', job.id);
                
              // 中止本批次的後續處理，等待下一個週期再重試
              break;
            }

            // 一般錯誤處理
            await supabase
              .from('gdrive_migration_jobs')
              .update({
                status: shouldRetry ? 'pending' : 'failed',
                retry_count: newRetryCount,
                updated_at: new Date().toISOString(),
              })
              .eq('id', job.id);
          }
          await sleep(500);
        }
      })
    );
    await sleep(500);
  }
});
```

***

### 5.2 `gdrive-migrate`（單一清單移轉到 Google Drive）

**觸發來源：**
- `gdrive-queue-worker`（主要）：從佇列表讀取 job 後呼叫
- 手動 API Route（可選）：用戶手動觸發單一清單移轉

**Request：**
```json
{ "manifestId": "uuid", "trigger": "queue-worker" | "manual" }
```

**流程：**

1. **取得鎖定 (TRY ACQUIRE LOCK)：**

   ```sql
   UPDATE manifests
   SET archive_status = 'migrating', archive_locked_at = NOW()
   WHERE id = :manifestId
     AND status = 'archived'
     AND (archive_status IS NULL
          OR (archive_status = 'migrating' AND archive_locked_at < NOW() - INTERVAL '1 hour'))
   ```

   若 `affected_rows = 0`，回傳 `{"skipped":"已鎖定或處理中"}`

2. **刷新 OAuth token（避免在行鎖內執行外部網路 I/O）：**

   **問題：** 原始設計在 `SELECT ... FOR UPDATE` 行鎖期間執行網路請求（向 Google Token Endpoint 發送請求），這會導致：
   - 資料庫連接和行鎖必須維持開啟，直到 Google API 回應為止
   - 如果 Google API 響應緩慢（例如 5-10 秒）或網路不穩，會佔用寶貴的資料庫連接池資源
   - 在高負載下可能導致連接池耗盡，造成其他資料庫操作逢失敗（例如用戶登入、查詢等）
   - 本質上是一種自願性的阻斷服務攻擊（Self-DoS）

   **解決方案：** 採用「樂觀鎖定」模式：
   1. 在短暫的事務中取得當前 token 資訊並加上行鎖
   2. 立即釋放鎖（提交事務）
   3. 執行網路請求向 Google 更新 token
   4. 重新取得行鎖，檢查 token 是否在這期間被其他進程更新
   5. 若未被更新，則寫入新 token；否則重試或放棄

   ```typescript
   // 步驟 1：在極短的事務中獲取當前 token 資訊（帶行鎖）
   const { data: connection, error } = await supabase
     .from('user_gdrive_connections')
     .select('*')
     .eq('user_id', userId)
     .single();

   if (error || !connection) throw new Error('No gdrive connection');

   // 檢查 token 是否需要刷新（已過期或即將過期）
   const needsRefresh = !connection.token_expires_at || 
                        new Date(connection.token_expires_at) < new Date(Date.now() + 5 * 60 * 1000); // 提前 5 分鐘刷新

   if (!needsRefresh) {
     // Token 仍然有效，無需刷新
     return { accessToken: connection.access_token };
   }

   // 步驟 2：執行網路請求向 Google 更新 token（此時不持有任何資料庫鎖）
   const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
     method: 'POST',
     headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
     body: new URLSearchParams({
       client_id: env.GOOGLE_CLIENT_ID,
       client_secret: env.GOOGLE_CLIENT_SECRET,
       refresh_token: connection.refresh_token,
       grant_type: 'refresh_token',
     }),
   });

   if (!tokenRes.ok) {
     throw new Error(`Failed to refresh token: ${tokenRes.status}`);
   }

   const tokenData = await tokenRes.json();

   // 步驟 3：重新獲取行鎖並更新 token（檢查是否被其他進程搶先更新）
   const { data: updatedConnection, error: updateError } = await supabase
     .from('user_gdrive_connections')
     .update({
       access_token: tokenData.access_token,
       token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
     })
     .eq('user_id', userId)
     .eq('token_expires_at', connection.token_expires_at) // 確保沒有人在這期間更新過 token
     .single();

   if (updateError || !updatedConnection) {
     // 另一個進程已經更新了 token，重新嘗試整個流程（最多重試 3 次）
     // 在實際實作中，這裡會有重試邏輯，但為了簡化說明，我們直接拋出錯誤讓上層處理重試
     throw new Error('Token was updated by another process, please retry');
   }

   return { accessToken: tokenData.access_token };
   ```

   - **資料庫友好：** 行鎖僅在極短的查詢和更新期間持有（通常不到 10ms）
   - **網路彈性：** 網路請求完全獨立於資料庫操作，不會影響連接池
   - **競爭安全：** 通過檢查 `token_expires_at` 未被修改來確保我們不會覆寫其他進程較新的 token
   - **失敗復原：** 如果發現 token 被其他進程更新，調用方可以安全地重試整個流程

3. **檢查 Google Drive 剩餘空間：**

   * `GET https://www.googleapis.com/drive/v3/about?fields=storageQuota`

   * `limit - usage` < ZIP 大小 → 跳過並記錄 `archive_logs`

4. **確保 PhamaCount 資料夾存在（同名資料夾防禦）：**

   **競爭風險：** Google Drive 允許在同一目錄下存在多個名稱完全相同的資料夾。若兩次搜尋間隔過長，或用戶手動建立了同名資料夾，`drive.files.list` 可能回傳多筆記錄。

   **防禦策略：** 不在每次移轉時重複查詢，而是在 `user_gdrive_connections` 表中快取根資料夾 ID，之後直接使用快取值。

   ```typescript
   // 1. 先從 DB 快取讀取（若已儲存）
   const folderId = connection.gdrive_root_folder_id;

   if (!folderId) {
     // 2. 查詢是否已存在於 Google Drive
     const listRes = await fetch(
       `https://www.googleapis.com/drive/v3/files?q=name='PhamaCount' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name,createdTime)`,
       { headers: { 'Authorization': `Bearer ${accessToken}` } }
     );
     const listData = await listRes.json();

     if (listData.files && listData.files.length > 0) {
       // 3. 多筆同名時，取最近建立的為準
       listData.files.sort((a, b) => b.createdTime.localeCompare(a.createdTime));
       folderId = listData.files[0].id;
     } else {
       // 4. 不存在 → 建立
       const createRes = await fetch(
         'https://www.googleapis.com/drive/v3/files',
         {
           method: 'POST',
           headers: {
             'Authorization': `Bearer ${accessToken}`,
             'Content-Type': 'application/json',
           },
           body: JSON.stringify({
             name: 'PhamaCount',
             mimeType: 'application/vnd.google-apps.folder',
           }),
         }
       );
       const createData = await createRes.json();
       folderId = createData.id;
     }

     // 5. 寫回 DB 快取（Row Lock 保護）
     await supabase
       .from('user_gdrive_connections')
       .update({ gdrive_root_folder_id: folderId })
       .eq('user_id', userId);
   }

   // 6. 確保 archived/{manifestId} 子資料夾存在（同理快取）
   // 子資料夾不需要快取，因為只在移轉該筆清單時建立一次
   ```

   - 根資料夾 ID 快取到 DB，避免每次重複查詢
   - 多筆同名時取 **最近建立** 的（通常是真正的應用資料夾）
   - 子資料夾命名為 `archived/{manifestId}`，因為 manifestId 是唯一值，不會衝突

5. **從 Supabase Storage 串流下載 ZIP 並 Pipe 到 Google Drive：**

   **OOM 防禦（關鍵）：** Supabase Edge Function (Deno) 記憶體限制約 150~256MB。不可將整個 ZIP（最大 200MB）載入記憶體，必須使用 **Stream Pipe** 模式。

   **⚠️ Google Drive 規範相容性（關鍵）：** Google Drive 的 Resumable Upload 要求每個 upload chunk（除了最後一個）必須是 256 KB 的整數倍。直接轉發網路讀取的隨機大小 chunk 會導致 400 Bad Request 錯誤。

   透過 Supabase Storage 提供的 S3-compatible Signed URL，取得可串流讀取的 download URL：

   ```typescript
   // Step A: 產生 Supabase Storage 的 signed download URL（24hr 有效）
   const { data: signedData, error: signedError } = await supabase.storage
     .from('archived-manifests')
     .createSignedUrl(`${manifestId}/archive.zip`, 86400); // 24hr

   if (signedError || !signedData) throw signedError;
   const downloadUrl = signedData.signedUrl;

   // Step B: 發起 Resumable Upload session
   const resumableMeta = {
     name: 'archive.zip',
     parents: [subfolderId],
   };
   const initRes = await fetch(
     'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
     {
       method: 'POST',
       headers: {
         'Authorization': `Bearer ${accessToken}`,
         'Content-Type': 'application/json',
         'X-Upload-Content-Type': 'application/zip',
         'X-Upload-Content-Length': `${zipSizeBytes}`,
       },
       body: JSON.stringify(resumableMeta),
     }
   );
   const resumableUrl = initRes.headers.get('Location');

   // Step C: 串流下載 Supabase ZIP → 建立 256KB 緩衝區後傳送到 Google Drive
   // Google Drive Resumable Upload 要求：每個 chunk 必須是 256KB 的整數倍（最後一個 chunk 例外）
   const CHUNK_SIZE = 8 * 256 * 1024; // 8MB = 256KB × 32（符合 256KB 倍數要求）
   const buffer = new Uint8Array(CHUNK_SIZE);
   let bufferOffset = 0;
   let uploadedBytes = 0;

   // 使用 AbortController 管理逾時
   const controller = new AbortController();
   const timeoutId = setTimeout(() => controller.abort(), 120_000); // 120s

   const response = await fetch(downloadUrl, { signal: controller.signal });
   clearTimeout(timeoutId);
   if (!response.ok || !response.body) throw new Error('Download failed');

   const reader = response.body.getReader();

   while (true) {
     const { done, value } = await reader.read();
     if (done) break;

     // 將網路讀取的隨機大小 chunk 寫入固定 buffer
     let offset = 0;
     while (offset < value.length) {
       const spaceLeft = CHUNK_SIZE - bufferOffset;
       const chunkRemaining = value.length - offset;
       const toCopy = Math.min(spaceLeft, chunkRemaining);

       buffer.set(value.subarray(offset, offset + toCopy), bufferOffset);
       bufferOffset += toCopy;
       offset += toCopy;

       // buffer 滿了 → 發出一次符合規範的 PUT（256KB 的整數倍）
       if (bufferOffset === CHUNK_SIZE) {
         const chunkSize = CHUNK_SIZE;
         const start = uploadedBytes;
         const end = start + chunkSize - 1;

         const chunkRes = await fetch(resumableUrl, {
           method: 'PUT',
           headers: {
             'Content-Range': `bytes ${start}-${end}/${zipSizeBytes}`,
           },
           body: buffer,
         });

         if (chunkRes.status === 200 || chunkRes.status === 201) {
           uploadedBytes = end + 1;
           bufferOffset = 0;
           break; // 完成
         }

         if (chunkRes.status === 308) {
           uploadedBytes = end + 1;
           bufferOffset = 0;
           continue;
         }

         // 查詢已上傳進度（支援續傳）
         const rangeRes = await fetch(resumableUrl, {
           method: 'PUT',
           headers: { 'Content-Range': `bytes */${zipSizeBytes}` },
         });
         if (rangeRes.status === 308) {
           const rangeHeader = rangeRes.headers.get('Range');
           uploadedBytes = rangeHeader
             ? parseInt(rangeHeader.split('-')[1]) + 1
             : uploadedBytes;
           bufferOffset = 0;
           continue;
         }

         throw new Error(
           `Resumable upload failed with status ${chunkRes.status}`
         );
       }
     }
   }

   // 處理最後一塊不足 8MB 的 buffer（必須發送，即使不是 256KB 的整數倍）
   if (bufferOffset > 0) {
     const start = uploadedBytes;
     const end = start + bufferOffset - 1;

     const finalRes = await fetch(resumableUrl, {
       method: 'PUT',
       headers: {
         'Content-Range': `bytes ${start}-${end}/${zipSizeBytes}`,
       },
       body: buffer.slice(0, bufferOffset),
     });

     if (finalRes.status !== 200 && finalRes.status !== 201) {
       throw new Error(
         `Final chunk failed with status ${finalRes.status}`
       );
     }
   }
   ```

   - **記憶體佔用極低：** 每次只讀取約 8MB chunk 到記憶體，但僅保留固定大小的 8MB buffer
   - **符合 Google Drive 規範：** 每次送出的 chunk 大小為 8MB（= 256KB × 32），是 256KB 的整數倍（最後一個 chunk 可能較小，但這是允許的）
   - 支援 Google Drive Resumable Upload 續傳（失敗時查詢已上傳進度）
   - 120s 逾時保護，避免卡死

6. **驗證上傳完整性：**

   * 比對 Google Drive 回傳的 `size` 與原始 ZIP 的 `byteLength`

   * 不一致 → 視為失敗，退回 `archived`，不刪 Supabase ZIP

7. **更新 DB（在刪除 Storage 之前）：**

   ```sql
   UPDATE manifests
   SET cloud_backup = true,
       gdrive_file_id = :fileId,
       archive_status = NULL,
       archive_locked_at = NULL
   WHERE id = :manifestId;
   ```

   注意：`storage_size_bytes` 保留原值，用於前端顯示「雲端備份佔用大小」參考值。

8. **刪除 Supabase Storage 中的 ZIP（非關鍵）：**

   ```typescript
   await supabase.storage
     .from('archived-manifests')
     .remove([`${manifestId}/archive.zip`]);
   ```

   成功後更新 job 記錄：
   ```typescript
   await supabase
     .from('gdrive_migration_jobs')
     .update({ storage_deleted: true })
     .eq('manifest_id', manifestId);
   ```

   失敗只記錄 `archive_logs`，不影響（DB 已標記 cloud_backup = true，下次 Cron 不會重複移轉）

9. **記錄** **`archive_logs`**：成功

**GLOBAL CATCH：**

* 任何未捕獲錯誤 → 退回 `archive_status = NULL`，釋放鎖

* 記錄 `archive_logs`：`action = 'gdrive_migrate'`，`status = 'failed'`

***

### 5.3 `gdrive-pull`（從 Google Drive 下載 ZIP 回 Supabase）

**觸發：** 用戶點「還原」且 `cloud_backup = true` 時

**Request：**

```json
{ "manifestId": "uuid" }
```

**流程：**

1. **取得 manifest 資訊：** 確認 `cloud_backup = true` 且 `gdrive_file_id` 存在

2. **容量預判關卡（防止空間炸彈）：**

   **問題：** 如果 Supabase Storage 已接近 1GB 上限，gdrive-pull 將 ZIP 寫入後，後續 restore-manifest 解壓照片寫回 `drug-photos` bucket 時會因空間不足全部失敗，導致清單卡死在 `restoring` 半殘狀態。

   **解法：** 在下載前計算容量是否充足，不足則直接阻斷。

   ```sql
   -- 計算目前非雲端清單的儲存用量總和
   SELECT COALESCE(SUM(storage_size_bytes), 0) AS current_usage
   FROM manifests
   WHERE cloud_backup = false;
   ```

   預判公式：

   ```
   // JPG/PNG 已是高度壓縮格式，ZIP 壓縮率僅 5%~10%，幾乎不縮減體積
   // estimatedPhotoSize ≈ ZIP 大小（壓縮後 ≈ 原始大小）
   estimatedPhotoSize = storage_size_bytes * 1.15
   requiredSpace = storage_size_bytes (ZIP本身) + estimatedPhotoSize (解壓後照片)

   if (current_usage + requiredSpace > 950MB) {
     → 阻斷，回傳錯誤：
     {
       "error": "storage_full_prevent",
       "message": "Supabase 空間不足以容納還原檔案，請先封存其他進行中清單以釋放空間。"
     }
   }
   ```

   - 安全閾值設為 950MB（預留 50MB 緩衝）
   - 使用 **1.15 係數**：JPG/PNG 在 ZIP 中壓縮率極低（約 90%~95%），ZIP 大小與原始照片體積幾乎相同
   - 前端收到此錯誤 → 顯示明確提示，建議用戶先封存其他清單
   - 用戶可透過手動封存 active 清單並等待 Cron 移轉來釋放空間後重試

3. **刷新 OAuth token：**

   * 從 `user_gdrive_connections` 讀取 refresh\_token

   * 直接在 Edge Function 中呼叫 Google Token Endpoint：`POST https://oauth2.googleapis.com/token`

   * 取得新 access\_token → 更新 DB 中的 access\_token + token\_expires\_at

   * 失敗 → 回傳錯誤 `{ error: 'gdrive_auth_expired', message: 'Google Drive 授權已過期，請重新連結' }`

   * 前端收到此錯誤 → 提示用戶重新授權

4. **從 Google Drive 下載 ZIP：**

   * `GET https://www.googleapis.com/drive/v3/files/{gdrive_file_id}?alt=media`

   * Headers：`Authorization: Bearer {access_token}`

   * **404 容錯（關鍵）：** 如果用戶在 Google Drive 中手動刪除了該 ZIP 檔案，Google API 會回傳 404。

     此時系統必須主動標記該備份為永久遺失，不應讓用戶陷入無限重試的死循環：

     ```sql
     -- 更新 DB：標記為 corrupted
     UPDATE manifests
     SET cloud_backup = false,
         gdrive_file_id = NULL,
         archive_status = NULL,
         archive_locked_at = NULL
     WHERE id = :manifestId;
     ```

     前端收到 `{ error: 'cloud_backup_missing', message: '雲端備份檔案已被移除，無法還原' }` 後：
     - 顯示明確錯誤：「此清單的雲端備份檔案已被從 Google Drive 移除，無法還原」
     - 卡片狀態改為「已封存（本地遺失）」
     - 提供選項：重新封存 active 清單以建立新備份

   * **其他 Google API 錯誤處理：** 401 → token 失效提示重新授權；403 → 權限不足；429 → 稍後重試

6. **上傳到 Supabase Storage：**

   ```typescript
   await supabase.storage
     .from('archived-manifests')
     .upload(`${manifestId}/archive.zip`, zipBlob, {
       contentType: 'application/zip',
       upsert: true,
     });
   ```

7. **更新 DB（冪等）：**

   ```sql
   UPDATE manifests
   SET cloud_backup = false,
       archived_zip_path = '{manifestId}/archive.zip',
       storage_size_bytes = :zipSize
   WHERE id = :manifestId;
   ```

8. **回傳成功** → 前端繼續觸發現有 `restore-manifest`

**GLOBAL CATCH：**

* 失敗 → 回傳錯誤，前端提示用戶重試

* DB 狀態不變（仍為 `cloud_archived`），下次可重試

***

## 6. Google Drive 檔案結構

```
PhamaCount/                    (應用專用根資料夾)
├── archived/
│   ├── {manifestId_1}/
│   │   └── archive.zip
│   ├── {manifestId_2}/
│   │   └── archive.zip
│   └── ...
```

* 使用 `drive.file` scope，應用只能看到自己建立的檔案

* 不碰用戶其他資料

* 資料夾結構方便用戶在 Google Drive 中手動瀏覽

***

## 7. 前端變更

### 7.1 新增路由

| 路由                          | 類型               | 說明                                         |
| --------------------------- | ---------------- | ------------------------------------------ |
| `/auth/gdrive/connect`      | API Route (GET)  | 產生 Google OAuth URL 並跳轉                    |
| `/auth/gdrive/callback`     | API Route (GET)  | OAuth callback，用 code 換 token 並存 DB        |
| `/api/gdrive/token-refresh` | API Route (POST) | 用 refresh\_token 換 access\_token，回傳新 token |
| `/api/gdrive/status`        | API Route (GET)  | 檢查連線狀態 + Google Drive 剩餘空間                 |
| `/api/gdrive/migrate`       | API Route (POST) | 手動觸發單一清單移轉（可選）                             |

### 7.2 強制綁定流程

- Middleware 層：用戶已登入但無 `user_gdrive_connections` 記錄 → 跳轉 OAuth 授權
- 不可跳過，這是進入系統的前置條件
- 授權完成後重新導向回首頁

**死循環防禦（關鍵）：**

Middleware 必須排除以下路由，否則會造成無窮重導向（`ERR_TOO_MANY_REDIRECTS`）：

**Middleware 完整邏輯（含未登入防禦）：**

```typescript
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 第一道關卡：白名單絕對不能攔截
  if (
    pathname.startsWith('/auth/gdrive') ||
    pathname.startsWith('/api/gdrive') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // 第二道關卡：未登入用戶直接放行（讓其走向登入頁）
  const session = await getSupabaseSession(request);
  if (!session) {
    return NextResponse.next();
  }

  // 第三道關卡：已登入但無 gdrive 連線 → 強制綁定
  const hasGdriveConnection = await checkUserGdriveConnection(session.user.id);
  if (!hasGdriveConnection) {
    return NextResponse.redirect(new URL('/auth/gdrive/connect', request.url));
  }

  return NextResponse.next();
}
```

執行順序：
1. **白名單檢查**（OAuth/API/靜態資源）
2. **登入狀態檢查**（未登入直接放行，不做 GDrive 檢查）
3. **Google Drive 連線檢查**（已登入但無連線 → 強制跳轉授權）

這樣的順序確保：
- 訪客訪問首頁 → 步驟 2 放行 → 走向登入頁（不觸發 GDrive 檢查）
- 已登入無連線用戶 → 步驟 3 攔截 → 跳轉 OAuth
- OAuth callback 路由 → 步驟 1 白名單放行 → 正常處理 code 換 token

### 7.3 manifests 頁面改動

**狀態顯示：**

| 清單狀態                                  | 顯示文字    | 圖示            |
| ------------------------------------- | ------- | ------------- |
| `active`                              | 進行中     | Package (極光藍) |
| `archived` (cloud\_backup=false)      | 已封存（本地） | Package (灰)   |
| `cloud_archived` (cloud\_backup=true) | 已封存（雲端） | Cloud (極光藍)   |
| `migrating`                           | 移轉中...  | Loader2 (極光藍) |

**「還原」按鈕行為改動：**

* `cloud_backup = false` → 直接觸發現有 `restore-manifest`

* `cloud_backup = true` → 先觸發 `gdrive-pull`，完成後再觸發 `restore-manifest`

* 兩階段進度提示：

  1. 「正在從 Google Drive 下載備份...」
  2. 「正在還原資料...」

**新增 Google Drive 連線狀態指示器：**

* 頁面頂部小圖示：已連線（雲朵+勾） / 未連線（雲朵+驚嘆號）

* 點擊可前往設定/重新授權

### 7.4 Storage 用量警告

* 前端 manifest 列表頁計算所有 active + archived (本機) 清單的 `storage_size_bytes` 總和

* 超過 800MB → 顯示黃色警告：「儲存空間即將滿載」

* 超過 950MB → 顯示紅色警告：「儲存空間接近上限」

***

## 8. 風險與應對總表

| #  | 風險                      | 等級 | 應對                                                                            |
| -- | ----------------------- | -- | ----------------------------------------------------------------------------- |
| 1  | Token 過期/撤銷             | 中  | 每次操作前刷新；DB 狀態追蹤；前端提示重新授權；Google 6 個月未用撤銷 refresh\_token → 定期 Cron 本身就是保持活躍    |
| 2  | Drive 空間不足              | 低  | Cron 移轉前 `about.get` 檢查剩餘空間；不足則跳過記 log；前端設定頁顯示剩餘空間                            |
| 3  | 網路中斷資料不一致               | 高  | 嚴格順序：上傳→驗證→更新DB→刪Storage；Resumable Upload 支援續傳；驗證失敗不刪 Supabase ZIP；下次 Cron 重試 |
| 4  | 併發移轉衝突（同用戶 token 競爭）    | 高  | Cron 按 user_id 分組，同一用戶序列執行，不同用戶才併發；避免同一 refresh_token 併發刷新                   |
| 5  | 還原時網路不穩                 | 高  | 明確錯誤提示可重試；gdrive-pull 冪等（重複執行安全）；手機端顯示兩階段進度                                   |
| 6  | Google API 限流           | 低  | 批次 3 用戶併發+500ms 間隔；429 exponential backoff（1s, 2s, 4s）                      |
| 7  | 用戶撤銷 Google Drive 授權    | 中  | 操作前偵測 token 有效性；標記 disconnected；前端提示重新授權；Google Drive 檔案不會因此消失（用戶仍可手動管理）      |
| 8  | 1GB 在移轉前佔滿              | 中  | 每日 Cron 移轉；條件可由 1 個月縮短為 7 天；前端 Storage 用量警告（800MB 黃/950MB 紅）                  |
| 9  | Edge Function 逾時 (150s) | 中  | Resumable Upload 分片處理；單次只移轉一個 manifest；大 ZIP（>200MB）已在封存階段被拒絕                 |
| 10 | archived\_at 回填         | 低  | Migration 需為現有已封存清單回填 `archived_at`（用 `updated_at` 替代）                        |
| 11 | Middleware 死循環          | 高  | 白名單排除 `/auth/gdrive/*`、`/api/*`、`/_next/*`、`/favicon.ico`                   |
| 12 | 還原時 Storage 空間炸彈        | 高  | gdrive-pull 下載前容量預判：current\_usage + ZIP + 預估解壓照片 > 950MB 則阻斷               |

***

## 9. archived\_at 回填策略

現有已封存清單沒有 `archived_at` 欄位。Migration 中需回填：

```sql
-- 回填現有已封存清單的 archived_at
UPDATE manifests
SET archived_at = updated_at
WHERE status = 'archived'
  AND archived_at IS NULL;
```

這樣現有封存清單也會在 30 天後被 Cron 移轉。

---

## 10. storage_size_bytes 一致性維護（聯動 013 號規格書）

本功能與 013 號規格書（清單儲存容量大小管理）深度聯動。`storage_size_bytes` 在不同狀態下的語意必須保持一致，避免前端顯示錯亂。

### 10.1 各狀態下的 storage_size_bytes 語意

| Manifest 狀態 | cloud_backup | storage_size_bytes 含義 | 前端顯示 |
|--------------|-------------|----------------------|---------|
| active | - | drug-photos 照片累計大小 | `text-[#00f2fe]` 極光藍 |
| archived | false | 封存 ZIP 大小 | `text-gray-400` 灰色 |
| migrating | false | 封存 ZIP 大小（移轉中不變） | `text-gray-400` + Loader |
| cloud_archived | true | 封存 ZIP 大小（保留原值作為參考） | `text-gray-400` 灰色 + 雲端圖示 |
| restoring | false | 還原後照片總大小（由 restore-manifest 寫入） | `text-[#00f2fe]` 極光藍 |

### 10.2 各流程中的 storage_size_bytes 寫入時機

| 流程 | 寫入時機 | 值 | 依據規格書 |
|------|---------|---|----------|
| 照片上傳 | 上傳成功後 | `+= fileSize` | 013 |
| 照片刪除 | 刪除前查 Storage info | `-= contentLength` | 013 |
| 封存完成 (archive-manifest) | ZIP 上傳後 | `= ZIP byteLength` | 012 + 013 |
| 移轉完成 (gdrive-migrate) | 更新 DB 時 | **保留原值不變** | 本規格書 |
| 還原前拉回 (gdrive-pull) | ZIP 上傳回 Supabase 後 | `= ZIP byteLength` | 本規格書 |
| 還原完成 (restore-manifest) | 照片全部上傳後 | `= Σ file_size_bytes` (from data.json) | 013 |

### 10.3 關鍵原則

- **cloud_archived 狀態保留 ZIP 大小**：即使 ZIP 已移轉到 Google Drive，前端仍可顯示「雲端備份 45.2 MB」供用戶參考
- **gdrive-pull 不覆寫為 0**：ZIP 拉回 Supabase 後，`storage_size_bytes` 寫入實際 ZIP 大小（與封存完成時一致）
- **restore-manifest 完成後由 data.json 加總**：沿用 013 號規格書的 O(1) 記憶體計算邏輯，無額外 Storage API 呼叫

***

## 11. 每週儲存清理機制

為確保因偶發失敗而未刪除的 Supabase Storage ZIP 檔案不會長期佔用空間，系統實施每週清理機制。

### 11.1 清理原則

- 每週掃描標記為 `storage_deleted = false` 的 gdrive_migration_jobs 記錄
- 對於每個記錄，嘗試重新刪除對應的 Supabase Storage ZIP 檔案
- 成功刪除後更新 `storage_deleted = true`
- 連續失敗 3 次後標記為 `storage_deleted = true`（避免無限重試），並記錄警告日誌

### 11.2 實作細節

**新增 `gdrive-storage-cleanup` Cron（每週日 02:00 UTC 執行）：**

```sql
-- 每週執行的清理腳本
CREATE OR REPLACE FUNCTION cleanup_failed_storage_deletions()
RETURNS void AS $$
DECLARE
    job_record RECORD;
    deletion_success BOOLEAN;
BEGIN
    FOR job_record IN
        SELECT id, manifest_id
        FROM gdrive_migration_jobs
        WHERE storage_deleted = false
          AND (retry_count < 3 OR retry_count IS NULL)  -- 只處理重試次數小於 3 的記錄
    LOOP
        BEGIN
            -- 嘗試刪除 Storage 檔案
            PERFORM supabase.storage
                .from('archived-manifests')
                .remove([job_record.manifest_id || '/archive.zip']);
            
            deletion_success := TRUE;
        EXCEPTION WHEN OTHERS THEN
            deletion_success := FALSE;
            -- 記錄錯誤但不中斷流程
            PERFORM supabase.storage
                .from('storage_logs')
                .insert({
                    message: 'Failed to delete storage file during weekly cleanup',
                    detail: 'Job ID: ' || job_record.id ||
                            ', Manifest ID: ' || job_record.manifest_id ||
                            ', Error: ' || SQLERRM,
                    created_at: NOW()
                });
        END;
        
        -- 更新 job 記錄
        IF deletion_success THEN
            UPDATE gdrive_migration_jobs
            SET storage_deleted = true,
                updated_at = NOW()
            WHERE id = job_record.id;
        ELSE
            -- 增加重試計數，但設定上限避免無限重試
            UPDATE gdrive_migration_jobs
            SET retry_count = COALESCE(retry_count, 0) + 1,
                updated_at = NOW()
            WHERE id = job_record.id;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 設置每週執行的 Cron
INSERT INTO cron.job (jobid, schedule, command)
VALUES (
    'cleanup_failed_storage_deletions',
    '0 2 * * 0',  -- 每週日 02:00
    $$CALL cleanup_failed_storage_deletions()$$
)
ON CONFLICT (jobid) DO UPDATE SET
    schedule = EXCLUDED.schedule,
    command = EXCLUDED.command;
```

### 11.3 說明

- 此程序只處理 `storage_deleted = false` 的記錄，避免對已成功刪除的記錄進行無異義操作
- 每個失敗的刪除嘗試會增加 `retry_count`，當達到 3 次後仍會標記為 `storage_deleted = true`（視為已處理），以避免無限重試導致資源浪費
- 所有失敗嘗試都會記錄到 `storage_logs` 表供審計使用
- 這確保了即使偶發的 Storage API 失敗也不會導致長期的空間洩漏

***

## 11. 實作檔案清單

| 檔案                                                          | 操作 | 說明                                                          |
| ----------------------------------------------------------- | -- | ----------------------------------------------------------- |
| `supabase/migrations/015_add_gdrive_backup.sql`             | 新增 | DB Schema 遷移                                                |
| `supabase/functions/gdrive-migrate-cron/index.ts`           | 新增 | Cron 分派入口                                                   |
| `supabase/functions/gdrive-migrate-cron/supabase_cron.yaml` | 新增 | Cron 排程設定 (每天 04:00 UTC)                                    |
| `supabase/functions/gdrive-migrate/index.ts`                | 新增 | 單一清單移轉到 Google Drive                                        |
| `supabase/functions/gdrive-pull/index.ts`                   | 新增 | 從 Google Drive 拉 ZIP 回 Supabase                             |
| `src/app/auth/gdrive/connect/route.ts`                      | 新增 | OAuth 授權跳轉                                                  |
| `src/app/auth/gdrive/callback/route.ts`                     | 新增 | OAuth callback                                              |
| `src/app/api/gdrive/token-refresh/route.ts`                 | 新增 | Token 刷新                                                    |
| `src/app/api/gdrive/status/route.ts`                        | 新增 | 連線狀態 + 剩餘空間                                                 |
| `src/app/api/gdrive/migrate/route.ts`                       | 新增 | 手動移轉入口                                                      |
| `src/app/manifests/page.tsx`                                | 修改 | 雲端封存狀態顯示、兩階段還原、Storage 用量警告                                 |
| `src/app/actions/manifests/archive.ts`                      | 修改 | 封存完成時寫入 archived\_at                                        |
| `supabase/functions/archive-manifest/index.ts`              | 修改 | 封存完成時寫入 archived\_at                                        |
| `src/middleware.ts`                                         | 修改 | 強制綁定 Google Drive 檢查                                        |
| `src/types/index.ts`                                        | 修改 | Manifest 型態新增 cloud\_backup, gdrive\_file\_id, archived\_at |

***

## 12. 驗收條件

* [ ] 用戶首次登入時，無 Google Drive 連線 → 被導向 OAuth 授權頁

* [ ] OAuth 授權完成 → 回到系統，DB 有 `user_gdrive_connections` 記錄

* [ ] 已封存 > 1 個月的清單 → Cron 自動移轉到 Google Drive

* [ ] 移轉成功 → Supabase Storage 中的 ZIP 被刪除，DB 標記 `cloud_backup = true`

* [ ] 移轉失敗（token失效/空間不足/網路斷）→ 退回 archived 狀態，下次 Cron 重試

* [ ] 用戶點「還原」`cloud_backup = true` 的清單 → 自動從 Google Drive 下載 ZIP → 還原成功

* [ ] 還原過程中網路斷線 → 明確錯誤提示，可重試

* [ ] Token 被撤銷 → 前端提示重新授權

* [ ] Google Drive 空間不足 → 移轉跳過，記錄 log，前端顯示警告

* [ ] Storage 用量超過 800MB → 前端黃色警告

* [ ] 併發移轉不會衝突（鎖機制正常運作）

* [ ] archive\_logs 正確記錄所有移轉操作

