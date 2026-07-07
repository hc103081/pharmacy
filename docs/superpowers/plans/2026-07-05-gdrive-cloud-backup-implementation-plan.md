# Google Drive 雲端備份移轉 — 實作計畫

**對應規格書：** `docs/superpowers/specs/2026-07-05-gdrive-cloud-backup-design-v2.md`  
**日期：** 2026-07-05  
**預估工期：** ~10-12 個工作階段（可並行）

---

## 實作階段總覽

| 階段 | 主題 | 預估階段數 | 依賴關係 |
|------|------|------------|----------|
| 1 | 資料庫遷移與核心型態 | 1 | 無（最優先） |
| 2 | OAuth 流程與 Middleware | 2 | 階段 1 |
| 3 | Edge Functions：Cron 分派與佇列 Worker | 2 | 階段 1 |
| 4 | Edge Functions：移轉與拉回核心邏輯 | 3 | 階段 3 |
| 5 | 前端整合：manifests 頁面與 Hooks | 2 | 階段 2, 4 |
| 6 | 測試與驗收 | 2 | 階段 5 |
| 7 | 部署設定與環境變數 | 1 | 階段 1-6 並行可做 |

---

## 階段 1：資料庫遷移與核心型態（1 階段）

### 任務清單

| # | 任務 | 檔案/位置 | 驗收標準 |
|---|------|-----------|----------|
| 1.1 | 建立 Migration `023_add_gdrive_backup.sql` | `supabase/migrations/023_add_gdrive_backup.sql` | 執行 `supabase db push` 成功；`manifests` 表新增 3 欄位、`user_gdrive_connections`、`gdrive_migration_jobs` 表建立完成、索引與 RLS 生效 |
| 1.2 | 更新 `Manifest` TypeScript 型態 | `src/types/index.ts` | 型態包含 `cloud_backup?`、`gdrive_file_id?`、`archived_at?`；TypeScript 編譯無錯誤 |
| 1.3 | 更新 `archive-manifest` 寫入 `archived_at` + `product_code` | `supabase/functions/archive-manifest/index.ts` | 封存完成時 DB 有 `archived_at`；ZIP 內 `data.json` 每項含 `product_code`（可為 null） |
| 1.4 | 更新 `restore-manifest` 讀寫 `product_code` | `supabase/functions/restore-manifest/index.ts` | 還原時 upsert 寫入 `product_code`；現有單條碼資料相容（null） |
| 1.5 | 更新 `archive.ts` Server Action 同步寫入 `archived_at` | `src/app/actions/manifests/archive.ts` | 手動封存也寫入 `archived_at` |

### 執行順序建議
```
1.1 → (1.2 並行 1.3 並行 1.4) → 1.5
```

---

## 階段 2：OAuth 流程與 Middleware（2 階段）

### 2.1 階段 2a：API Routes 實作

| # | 任務 | 檔案/位置 | 驗收標準 |
|---|------|-----------|----------|
| 2.1.1 | 建立 `/auth/gdrive/connect` 導向 Google OAuth | `src/app/auth/gdrive/connect/route.ts` | 導向正確的 Google OAuth URL（含 `drive.file` scope、redirect_uri、state） |
| 2.1.2 | 建立 `/auth/gdrive/callback` 處理 code 換 token | `src/app/auth/gdrive/callback/route.ts` | 正確換取 access/refresh token → 寫入 `user_gdrive_connections` → 導向首頁 |
| 2.1.3 | 建立 `/api/gdrive/token-refresh` 刷新 access_token | `src/app/api/gdrive/token-refresh/route.ts` | 用 refresh_token 向 Google 換新 access_token，更新 DB 並回傳 |
| 2.1.4 | 建立 `/api/gdrive/status` 查詢連線狀態與剩餘空間 | `src/app/api/gdrive/status/route.ts` | 回傳 `{ connected: true, email, storageQuota: { limit, usage } }` |
| 2.1.5 | 建立 `/api/gdrive/migrate` 手動觸發單一清單移轉 | `src/app/api/gdrive/migrate/route.ts` | 寫入 `gdrive_migration_jobs` 佇列，回傳 job ID |
| 2.1.6 | 建立 `/api/gdrive/pull` 觸發 gdrive-pull Edge Function | `src/app/api/gdrive/pull/route.ts` | 呼叫 `gdrive-pull` Edge Function，回傳結果 |

### 2.2 階段 2b：Middleware 強制綁定

| # | 任務 | 檔案/位置 | 驗收標準 |
|---|------|-----------|----------|
| 2.2.1 | 修改 `src/middleware.ts` 加入 GDrive 檢查邏輯 | `src/middleware.ts` | 白名單正確放行 OAuth/API/_next/favicon；未登入放行；已登入無連線導向 `/auth/gdrive/connect`；無死循環 |
| 2.2.2 | 單元測試 Middleware 白名單與導向邏輯 | `tests/unit/middleware-gdrive.test.ts` | 覆蓋：白名單路徑、未登入、已登入有連線、已登入無連線 |

### 執行順序建議
```
2.1.1 → 2.1.2 → (2.1.3 並行 2.1.4 並行 2.1.5 並行 2.1.6) → 2.2.1 → 2.2.2
```

---

## 階段 3：Edge Functions - Cron 分派與佇列 Worker（2 階段）

### 3.1 階段 3a：gdrive-migrate-cron

| # | 任務 | 檔案/位置 | 驗收標準 |
|---|------|-----------|----------|
| 3.1.1 | 實作 `gdrive-migrate-cron/index.ts` | `supabase/functions/gdrive-migrate-cron/index.ts` | 查詢條件正確（archived > 30 天、cloud_backup=false、有 gdrive 連線）；批次寫入佇列；5 秒內完成；不做序列等待 |
| 3.1.2 | 建立 `supabase_cron.yaml` 排程 | `supabase/functions/gdrive-migrate-cron/supabase_cron.yaml` | 每天 04:00 UTC 觸發 |
| 3.1.3 | 本地測試 Cron 邏輯（模擬資料） | 手動測試 | 佇列正確建立 job 記錄 |

### 3.2 階段 3b：gdrive-queue-worker

| # | 任務 | 檔案/位置 | 驗收標準 |
|---|------|-----------|----------|
| 3.2.1 | 實作 `gdrive-queue-worker/index.ts` | `supabase/functions/gdrive-queue-worker/index.ts` | 取得 pending/timeout jobs；按 user_id 分組；最多 3 用戶併發；同用戶序列；500ms 間隔；429 處理；更新 job 狀態 |
| 3.2.2 | 建立 `supabase_cron.yaml` 排程 | `supabase/functions/gdrive-queue-worker/supabase_cron.yaml` | 每 5 分鐘觸發 |
| 3.2.2 | 實作 `gdrive-storage-cleanup/index.ts` | `supabase/functions/gdrive-storage-cleanup/index.ts` | 掃描 storage_deleted=false；重試刪除最多 3 次；記錄 storage_logs |
| 3.2.3 | 建立清理排程 | `supabase/functions/gdrive-storage-cleanup/supabase_cron.yaml` | 每週日 02:00 UTC |

### 執行順序建議
```
3.1.1 → 3.1.2 → 3.2.1 → 3.2.2 → (3.2.3 並行 3.2.4)
```

---

## 階段 4：Edge Functions - 移轉與拉回核心邏輯（3 階段）

### 4.1 階段 4a：gdrive-migrate（單一清單移轉）

| # | 任務 | 檔案/位置 | 驗收標準 |
|---|------|-----------|----------|
| 4.1.1 | 實作鎖機制（archive_status='migrating'） | `supabase/functions/gdrive-migrate/index.ts` | 僅取得鎖的實例能執行；timeout 1 小時自動釋放 |
| 4.1.2 | 實作 Token 刷新（樂觀鎖模式） | 同上 | 不在 DB 鎖內做網路 I/O；競爭安全；重試 3 次 |
| 4.1.3 | 實作 Google Drive 空間檢查 | 同上 | `about.get` 取得 quota；不足則跳過並記錄 log |
| 4.1.4 | 實作資料夾確保（根資料夾快取 + 子資料夾） | 同上 | 根資料夾 ID 存 DB 快取；多筆同名取最新建立；子資料夾 `archived/{manifestId}` |
| 4.1.5 | 實作 Stream Pipe 上傳（Resumable Upload + 256KB chunk） | 同上 | 8MB buffer (256KB×32)；記憶體 < 50MB；支援續傳；120s timeout |
| 4.1.6 | 實作驗證與 DB 更新 → 刪除 Supabase ZIP | 同上 | size 比對通過 → 更新 cloud_backup=true、gdrive_file_id → 刪除 Storage → 記錄 log |
| 4.1.7 | 實作失敗退回邏輯 | 同上 | 任何錯誤 → archive_status=NULL、釋放鎖、記錄 failed log |

### 4.2 階段 4b：gdrive-pull（從 Drive 拉回）

| # | 任務 | 檔案/位置 | 驗收標準 |
|---|------|-----------|----------|
| 4.2.1 | 實作容量預判關卡（950MB 閾值 + 1.15 係數） | `supabase/functions/gdrive-pull/index.ts` | 正確計算 current_usage + ZIP + 照片預估；超過阻斷並回傳 `storage_full_prevent` |
| 4.2.2 | 實作 Token 刷新（同 4.1.2 模式） | 同上 | 正確刷新、更新 DB |
| 4.2.3 | 實作下載 ZIP + 404 容錯 | 同上 | 404 → 標記 cloud_backup=false、清 gdrive_file_id、回傳 `cloud_backup_missing` |
| 4.2.4 | 實作上傳回 Supabase + DB 更新 | 同上 | 上傳到 `archived-manifests`；更新 cloud_backup=false、archived_zip_path、storage_size_bytes |

### 4.3 階段 4c：整合測試

| # | 任務 | 驗收標準 |
|---|------|----------|
| 4.3.1 | 本地端對端測試：封存 → 等待移轉 → 還原 | 完整流程跑通；data.json 含 product_code 正確還原 |
| 4.3.2 | 併發測試：同用戶多筆移轉 | 序列執行、無 token 衝突 |
| 4.3.3 | 錯誤情境測試：token 失效、Drive 空間不足、網路中斷 | 正確退回/重試/錯誤碼 |

### 執行順序建議
```
4.1.1 → 4.1.2 → 4.1.3 → 4.1.4 → 4.1.5 → 4.1.6 → 4.1.7 →
4.2.1 → 4.2.2 → 4.2.3 → 4.2.4 →
4.3.1 → 4.3.2 → 4.3.3
```

---

## 階段 5：前端整合（2 階段）

### 5.1 階段 5a：Manifests 頁面與 Hooks

| # | 任務 | 檔案/位置 | 驗收標準 |
|---|------|-----------|----------|
| 5.1.1 | 更新 `useManifestOperations.ts` 的 `handleRestore` 兩階段邏輯 | `src/app/manifests/hooks/useManifestOperations.ts` | cloud_backup=true 先呼叫 `/api/gdrive/pull` 再觸發 restore；進度訊息正確 |
| 5.1.2 | 更新 `page.tsx` 卡片渲染：cloud_archived 狀態顯示 | `src/app/manifests/page.tsx` | 狀態文字「已封存（雲端）」；Cloud 圖示極光藍；storage_size 灰色顯示 |
| 5.1.3 | 新增 GDrive 連線狀態指示器（頁面頂部） | 同上 | 已連線：雲朵+勾；未連線：雲朵+驚嘆號；點擊可去設定 |
| 5.1.4 | 實作 Storage 用量警告（800MB 黃 / 950MB 紅） | 同上 | 正確計算 active + archived(local) 總和；閾值觸發顯示 |

### 5.2 階段 5b：OAuth 頁面體驗

| # | 任務 | 檔案/位置 | 驗收標準 |
|---|------|-----------|----------|
| 5.2.1 | 美化 `/auth/gdrive/connect` 導向頁（可選） | `src/app/auth/gdrive/connect/page.tsx` | 顯示「正在連結 Google Drive...」Loading 狀態 |
| 5.2.2 | 美化 callback 完成頁 | `src/app/auth/gdrive/callback/page.tsx` | 顯示成功訊息並自動導向首頁 |

### 執行順序建議
```
5.1.1 → 5.1.2 → 5.1.3 → 5.1.4 → 5.2.1 → 5.2.2
```

---

## 階段 6：測試與驗收（2 階段）

### 6.1 階段 6a：Playwright E2E 測試

| # | 測試檔案 | 覆蓋情境 |
|---|----------|----------|
| 6.1.1 | `tests/e2e/gdrive-oauth.spec.ts` | 首次登入無連線→導向 OAuth→授權→回到系統→DB 有記錄 |
| 6.1.2 | `tests/e2e/gdrive-migration.spec.ts` | 手動觸發移轉→佇列處理→移轉成功→Supabase ZIP 刪除→cloud_backup=true |
| 6.1.3 | `tests/e2e/gdrive-restore.spec.ts` | cloud_backup=true 清單點還原→兩階段進度→還原成功；空間預判阻斷；404 容錯 |
| 6.1.4 | `tests/e2e/gdrive-storage-warning.spec.ts` | Mock storage usage 800MB/950MB→警告正確顯示 |

### 6.2 階段 6b：驗收清單核對

對應規格書第 11 節 14 項驗收條件逐一確認。

---

## 階段 7：部署設定與環境變數（1 階段，可並行）

| # | 任務 | 位置/說明 |
|---|------|-----------|
| 7.1 | Vercel 環境變數設定 | `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_REDIRECT_URI`（生產域名） |
| 7.2 | Supabase 環境變數設定 | 同樣三個變數 + `SUPABASE_SERVICE_ROLE_KEY` |
| 7.3 | Google Cloud Console 設定 | OAuth 同意畫面切 **Production**；Redirect URI 加入生產域名 |
| 7.4 | Supabase Cron 部署 | `supabase functions deploy gdrive-migrate-cron` 等 5 支 functions |
| 7.5 | 執行 Migration | `supabase db push`（生產環境） |
| 7.6 | 執行 `archived_at` 回填 | Migration 內已包含 `UPDATE manifests SET archived_at = updated_at WHERE status='archived' AND archived_at IS NULL` |

---

## 風險與緩解

| 風險 | 等級 | 緩解策略 |
|------|------|----------|
| Google Drive Resumable Upload chunk 規範不符 | 高 | 開發階段用小檔測試；8MB buffer 固定為 256KB × 32；失敗時查詢已上傳進度續傳 |
| Token 刷新併發導致覆寫 | 高 | 樂觀鎖模式（檢查 token_expires_at 未變才更新）；重試 3 次 |
| Cron 150s 逾時 | 中 | 已拆分為「分派 Cron」+「Queue Worker」，各自負載極低 |
| Middleware 死循環 | 高 | 白名單優先、未登入放行、已登入檢查的三階段順序；單元測試覆蓋 |
| 既有已封存資料無 archived_at | 低 | Migration 內已含回填 SQL |
| data.json product_code 向後相容 | 低 | 既有資料 product_code=null；前端 `?? null` 兜底 |

---

## 里程碑檢查點

| 里程碑 | 完成條件 | 預估時間點 |
|--------|----------|------------|
| M1: DB 就緒 | Migration 成功、型態正確、既有封存流程含 archived_at/product_code | 階段 1 完成 |
| M2: OAuth 通 | 首次登入強制綁定流程跑通、Middleware 無死循環 | 階段 2 完成 |
| M3: 佇列運轉 | Cron 分派→Worker 取 job→呼叫 gdrive-migrate 鏈路通 | 階段 3 完成 |
| M4: 核心移轉/拉回通 | 單一清單移轉成功、Drive 有檔、Supabase ZIP 刪除、還原流程通 | 階段 4 完成 |
| M5: 前端整合通 | manifests 頁面正確顯示雲端/本地狀態、兩階段還原、用量警告 | 階段 5 完成 |
| M6: 全流程驗收 | Playwright 全綠、14 項驗收條件全部勾選 | 階段 6 完成 |
| M7: 生產部署 | 環境變數、Cron、Migration 全上線 | 階段 7 完成 |

---

## 並行化建議

- **階段 1.2/1.3/1.4** 可三人並行（型態、archive-manifest、restore-manifest）
- **階段 2.1.3-2.1.6** 四個 API Route 可並行
- **階段 3.2.3/3.2.4** 兩個清理相關 function 可並行
- **階段 4.1 與 4.2** 可由不同人員並行開發
- **階段 7** 可在階段 1-6 進行中同步準備（環境變數、Google Console 設定）

---

**總計任務數：~45 個原子任務**  
**建議團隊規模：2-3 人可在 2 週內完成**