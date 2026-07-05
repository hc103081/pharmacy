# Google Drive 雲端備份移轉 — 設計規格書 (v2)

**日期：** 2026-07-05  
**版本：** v2 (更新自 2026-06-26 v1)  
**狀態：** 待實作  
**基於：** 2026-06-26 版本 + 10 天專案變化補強

---

## 變更摘要 (v1 → v2)

| 項目 | v1 (06-26) | v2 (07-05) | 說明 |
|------|------------|------------|------|
| Migration 編號 | `015_add_gdrive_backup.sql` | `023_add_gdrive_backup.sql` | 專案已推進至 022，順延編號 |
| `data.json` 結構 | 僅含原有欄位 | **新增 `product_code`** | 雙條碼功能 (07-04 規格) 需同步序列化 |
| `Manifest` TypeScript 型態 | 缺 3 欄位 | **補齊 `cloud_backup`、`gdrive_file_id`、`archived_at`** | 前端顯示與流程判斷需用 |
| Middleware | 僅 session refresh | **新增 GDrive 強制綁定檢查** | 含死循環防禦白名單 |
| 實作檔案清單 | 舊架構路徑 | **對齊重構後結構 (hooks、components)** | `useManifestOperations.ts` 等 |
| 測試 | 無 | **新增 Playwright Smoke Test** | 驗證 OAuth、Cron、還原、空間預判 |

---

## 1. 需求概述 (同 v1)

### 1.1 問題
現有封存機制將已封存清單的 ZIP 存放在 Supabase Storage `archived-manifests` bucket。Supabase Free Tier 僅提供 1GB Storage 空間，隨時間累積 ZIP 檔案將佔滿配額，導致新封存無法上傳。

### 1.2 解決方案
將已封存超過 1 個月的清單 ZIP 移轉到用戶自己的 Google Drive，並從 Supabase Storage 中刪除原始 ZIP，釋放空間。用戶還原時系統自動從 Google Drive 下載 ZIP 回 Supabase 再執行還原，流程無感。

### 1.3 核心功能
* **強制綁定 Google Drive：** 用戶首次登入必須 OAuth 授權 Google Drive 才能進入系統
* **Cron 定期移轉：** 每天自動將「已封存 > 1 個月」的 ZIP 移轉到 Google Drive
* **自動還原：** 用戶點「還原」時，系統自動從 Google Drive 下載 ZIP 並執行還原
* **Supabase 空間釋放：** 移轉成功後刪除 Supabase 中的 ZIP

### 1.4 技術決策摘要 (同 v1)

| 決策 | 選擇 | 原因 |
|------|------|------|
| 雲端類型 | 用戶自己的 Google Drive | 用戶個人空間，不佔開發者配額 |
| 授權方式 | 強制綁定，不可跳過 | 確保備份路徑可用 |
| 移轉時機 | 定期 Cron（已封存 > 1 個月） | 有空間緩衝，實作簡單 |
| 還原體驗 | 同步等待，自動從 Google Drive 拉 | 用戶無感 |
| 備份後處置 | Supabase 完全釋放（刪除 ZIP） | 1GB 限制的解法 |
| 執行環境 | Supabase Edge Function (Deno) | 150s 逾時比 Vercel 10s 寬裕 |
| Google Drive 上傳 | Resumable Upload（分片） | 支援斷點續傳，降低網路中斷風險 |
| OAuth Scope | `drive.file` | 只能存取應用自己建立的檔案，不碰用戶其他資料 |

---

## 2. 架構 (同 v1，細節微調)

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

| 
| 狀態 | archive_status | cloud_backup | 說明 |
|------|----------------|--------------|------|
| `archived` | NULL | false | ZIP 在 Supabase Storage |
| `migrating` | 'migrating' | false | 正在移轉到 Google Drive |
| `cloud_archived` | NULL | true | ZIP 在 Google Drive，Supabase 已釋放 |
| `restoring` | 'restoring' | false | 正在還原（ZIP 已拉回 Supabase） |

### 2.2 整體架構圖 (同 v1，佇列機制已在 v1 完善)

---

## 3. OAuth 2.0 流程 (同 v1)

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

### 3.3 OAuth 流程 (同 v1)
### 3.4 Token 刷新策略 (同 v1)

---

## 4. DB Schema 變更 (更新：Migration 編號 023 + product_code)

### 4.1 Migration：`023_add_gdrive_backup.sql`

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

-- 3. 佇列表：用於 Cron 分派移轉任務
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

-- 4. 索引：加速 Cron 查詢
CREATE INDEX IF NOT EXISTS idx_manifests_cloud_backup_lookup
ON manifests (cloud_backup, archived_at)
WHERE cloud_backup = false AND archive_status IS NULL;

-- 5. 索引：用戶 gdrive 連線查詢
CREATE INDEX IF NOT EXISTS idx_user_gdrive_user_id
ON user_gdrive_connections (user_id);

-- 6. 索引：佇列查詢
CREATE INDEX IF NOT EXISTS idx_gdrive_jobs_status
ON gdrive_migration_jobs (status, created_at);

-- 7. RLS：用戶只能存取自己的 gdrive 連線
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

-- 8. RLS：佇列表（用戶只能看自己的 job，Service Role 可全權存取）
ALTER TABLE gdrive_migration_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own migration jobs"
ON gdrive_migration_jobs
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 9. 回填現有已封存清單的 archived_at
UPDATE manifests
SET archived_at = updated_at
WHERE status = 'archived'
  AND archived_at IS NULL;
```

### 4.2 archive-manifest Edge Function 改動 (v2 確認)

封存完成時，額外寫入 `archived_at`（已在 v1 指出，現確認現有程式碼尚未實作，需補上）：

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

### 4.3 data.json 結構更新 (新增：雙條碼支援)

**v2 關鍵變更：** `data.json` 每個項目需包含 `product_code` 欄位，對應 `drug_items.product_code`。

```typescript
// archive-manifest/index.ts 中的 dataJsonItems 生成邏輯更新：
const dataJsonItems = drugItems.map((item: any) => ({
  id: item.id,
  manifest_id: item.manifest_id,
  page_number: item.page_number,
  item_order: item.item_order,
  barcode: item.barcode,
  product_code: item.product_code ?? null,  // ★ 新增：商品條碼
  name: item.name,
  expected_quantity: item.expected_quantity,
  bonus_quantity: item.bonus_quantity,
  actual_quantity: item.actual_quantity,
  counted_status: item.counted_status,
  storage_location: item.storage_location ?? null,
  category: item.category ?? null,
  photo_ext: item.photo_url ? item.photo_url.split('.').pop()?.toLowerCase() || 'jpg' : 'jpg',
  file_size_bytes: item.photo_url ? (fileSizeMap.get(item.photo_url) ?? 0) : 0,
}));
```

**restore-manifest/index.ts 同步更新 upsert：**

```typescript
const { error: itemError } = await supabase
  .from('drug_items')
  .upsert({
    id: item.id,
    manifest_id: item.manifest_id,
    page_number: item.page_number,
    item_order: item.item_order,
    barcode: item.barcode,
    product_code: item.product_code ?? null,  // ★ 新增：還原商品條碼
    name: item.name,
    expected_quantity: item.expected_quantity,
    bonus_quantity: item.bonus_quantity ?? 0,
    actual_quantity: item.actual_quantity,
    counted_status: item.counted_status,
    storage_location: item.storage_location ?? null,
    category: item.category ?? null,
    photo_url: null,
    created_at: item.created_at ?? new Date().toISOString(),
    updated_at: item.updated_at ?? new Date().toISOString(),
  }, { onConflict: 'id' });
```

---

## 5. Edge Function 詳細流程 (同 v1，佇列機制已完善)

### 5.1 `gdrive-migrate-cron`（Cron 分派入口）
* 觸發：`pg_cron` 每天 04:00 UTC
* 流程：查詢符合條件清單 → 批次寫入 `gdrive_migration_jobs` 佇列 → 結束（2-5 秒）
* 實際移轉由 `gdrive-queue-worker` 處理

### 5.2 `gdrive-queue-worker`（每 5 分鐘執行）
* 批次取得最多 6 筆 pending/timeout job
* 按 user_id 分組，最多 3 用戶併發，同用戶內序列執行
* 呼叫 `gdrive-migrate` 處理單筆
* 429 rate limit → exponential backoff + 中止本批次

### 5.3 `gdrive-migrate`（單一清單移轉到 Google Drive）
* 觸發來源：Queue Worker / 手動 API
* 流程：取得鎖 → 刷新 Token（樂觀鎖模式，不在 DB 鎖內做網路 I/O） → 檢查 Drive 空間 → 確保資料夾 → Stream Pipe 上傳（256KB 倍數 chunk） → 驗證 → 更新 DB → 刪除 Supabase ZIP → 記錄 log

**關鍵實作細節（v2 確認）：**
- **OOM 防禦：** Deno 記憶體限制 ~150-256MB，使用固定 8MB buffer (256KB × 32) 串流
- **Google Drive 規範：** Resumable Upload 每 chunk 必須是 256KB 整數倍
- **Token 刷新：** 採「查詢鎖 → 釋放 → 網路請求 → 重新鎖更新」模式，避免長時間佔用 DB 連接池

### 5.4 `gdrive-pull`（從 Google Drive 下載 ZIP 回 Supabase）
* 觸發：用戶點「還原」且 `cloud_backup = true`
* 容量預判關卡：`current_usage + ZIP + 預估照片 > 950MB` → 阻斷
* 404 容錯：用戶手動刪除 Drive 檔案 → 標記 `cloud_backup = false`、清 `gdrive_file_id`、前端提示「雲端備份遺失」
* 上傳回 Supabase → 更新 DB `cloud_backup = false`、`archived_zip_path`、`storage_size_bytes = ZIP size`

### 5.5 `gdrive-storage-cleanup`（每週日 02:00 UTC）
* 掃描 `storage_deleted = false` 的 job 記錄
* 重試刪除 Supabase Storage ZIP，最多 3 次失敗後標記已處理
* 記錄 `storage_logs` 供審計

---

## 6. Google Drive 檔案結構 (同 v1)

```
PhamaCount/
├── archived/
│   ├── {manifestId_1}/
│   │   └── archive.zip
│   ├── {manifestId_2}/
│   │   └── archive.zip
│   └── ...
```

---

## 7. 前端變更 (v2 更新：對齊重構後架構)

### 7.1 新增路由

| 路由 | 類型 | 說明 |
|------|------|------|
| `/auth/gdrive/connect` | API Route (GET) | 產生 Google OAuth URL 並跳轉 |
| `/auth/gdrive/callback` | API Route (GET) | OAuth callback，用 code 換 token 並存 DB |
| `/api/gdrive/token-refresh` | API Route (POST) | 用 refresh_token 換 access_token，回傳新 token |
| `/api/gdrive/status` | API Route (GET) | 檢查連線狀態 + Google Drive 剩餘空間 |
| `/api/gdrive/migrate` | API Route (POST) | 手動觸發單一清單移轉（可選） |
| `/api/gdrive/pull` | API Route (POST) | 觸發 gdrive-pull Edge Function |

### 7.2 強制綁定流程 (v2 新增：Middleware 實作)

**Middleware 完整邏輯（含未登入防禦 + 死循環防禦）：**

```typescript
// src/middleware.ts
import { updateSession } from '@/lib/supabase/middleware';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function middleware(request: NextRequest) {
  // 先執行 session refresh
  const response = await updateSession(request);
  
  const { pathname } = request.nextUrl;

  // 第一道關卡：白名單絕對不能攔截（防死循環）
  if (
    pathname.startsWith('/auth/gdrive') ||
    pathname.startsWith('/api/gdrive') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return response;
  }

  // 第二道關卡：未登入用戶直接放行（讓其走向登入頁）
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return response;
  }

  // 第三道關卡：已登入但無 gdrive 連線 → 強制綁定
  const { data: gdriveConn } = await supabase
    .from('user_gdrive_connections')
    .select('id')
    .eq('user_id', session.user.id)
    .single();

  if (!gdriveConn) {
    return NextResponse.redirect(new URL('/auth/gdrive/connect', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

**執行順序保證：**
1. **白名單檢查**（OAuth/API/靜態資源）
2. **登入狀態檢查**（未登入直接放行，不做 GDrive 檢查）
3. **Google Drive 連線檢查**（已登入但無連線 → 強制跳轉授權）

這樣確保：
- 訪客訪問首頁 → 步驟 2 放行 → 走向登入頁（不觸發 GDrive 檢查）
- 已登入無連線用戶 → 步驟 3 攔截 → 跳轉 OAuth
- OAuth callback 路由 → 步驟 1 白名單放行 → 正常處理 code 換 token

### 7.3 manifests 頁面改動 (v2 更新：使用 hooks 架構)

**型態更新 (`src/types/index.ts`)：**

```typescript
export interface Manifest {
  id: string;
  name: string;
  order_number?: string;
  delivery_date?: string;
  source_file?: string;
  total_items: number;
  status: string;
  created_at?: string;
  total_discrepancy?: number;
  conclusion_type?: string;
  storage_size_bytes?: number;
  // ★ v2 新增欄位
  cloud_backup?: boolean;
  gdrive_file_id?: string;
  archived_at?: string;
}
```

**狀態顯示邏輯更新：**

| 清單狀態 | 顯示文字 | 圖示 | 樣式 |
|----------|---------|------|------|
| `active` | 進行中 | Package (極光藍) | `text-[#00f2fe]` |
| `archived` (cloud_backup=false) | 已封存（本地） | Package (灰) | `text-gray-400` |
| `cloud_archived` (cloud_backup=true) | **已封存（雲端）** | **Cloud (極光藍)** | `text-[#00f2fe]` + 雲朵圖示 |
| `migrating` | 移轉中... | Loader2 (極光藍) | 動畫 |

**實作位置：**
- `src/app/manifests/page.tsx`：卡片渲染邏輯，區分 `cloud_backup` 顯示不同圖示/文字
- `src/app/manifests/hooks/useManifestOperations.ts`：`handleRestore` 先判斷 `cloud_backup`，若 true 先呼叫 `/api/gdrive/pull` 再觸發 restore

**「還原」按鈕行為：**
* `cloud_backup = false` → 直接觸發現有 `restore-manifest`
* `cloud_backup = true` → 兩階段：
  1. 「正在從 Google Drive 下載備份...」→ 呼叫 `/api/gdrive/pull` → `gdrive-pull` Edge Function
  2. 「正在還原資料...」→ 觸發現有 `restore-manifest`

**新增 Google Drive 連線狀態指示器：**
* 頁面頂部小圖示：已連線（雲朵+勾） / 未連線（雲朵+驚嘆號）
* 點擊可前往設定/重新授權

### 7.4 Storage 用量警告 (同 v1)
* 超過 800MB → 黃色警告：「儲存空間即將滿載」
* 超過 950MB → 紅色警告：「儲存空間接近上限」

---

## 8. 風險與應對總表 (同 v1，已完善)

---

## 9. 實作檔案清單 (v2 更新：對齊現有專案結構)

| 檔案 | 操作 | 說明 |
|------|------|------|
| `supabase/migrations/023_add_gdrive_backup.sql` | **新增** | DB Schema 遷移（編號順延至 023） |
| `supabase/functions/gdrive-migrate-cron/index.ts` | **新增** | Cron 分派入口 |
| `supabase/functions/gdrive-migrate-cron/supabase_cron.yaml` | **新增** | Cron 排程設定 (每天 04:00 UTC) |
| `supabase/functions/gdrive-migrate/index.ts` | **新增** | 單一清單移轉到 Google Drive |
| `supabase/functions/gdrive-pull/index.ts` | **新增** | 從 Google Drive 拉 ZIP 回 Supabase |
| `supabase/functions/gdrive-queue-worker/index.ts` | **新增** | 佇列處理 Worker (每 5 分鐘) |
| `supabase/functions/gdrive-queue-worker/supabase_cron.yaml` | **新增** | Worker 排程設定 (每 5 分鐘) |
| `supabase/functions/gdrive-storage-cleanup/index.ts` | **新增** | 每週 Storage 清理 |
| `supabase/functions/gdrive-storage-cleanup/supabase_cron.yaml` | **新增** | 清理排程 (每週日 02:00 UTC) |
| `src/app/auth/gdrive/connect/route.ts` | **新增** | OAuth 授權跳轉 |
| `src/app/auth/gdrive/callback/route.ts` | **新增** | OAuth callback |
| `src/app/api/gdrive/token-refresh/route.ts` | **新增** | Token 刷新 |
| `src/app/api/gdrive/status/route.ts` | **新增** | 連線狀態 + 剩餘空間 |
| `src/app/api/gdrive/migrate/route.ts` | **新增** | 手動移轉入口 |
| `src/app/api/gdrive/pull/route.ts` | **新增** | 觸發 gdrive-pull |
| `src/app/manifests/page.tsx` | **修改** | 雲端封存狀態顯示、兩階段還原、Storage 用量警告 |
| `src/app/manifests/hooks/useManifestOperations.ts` | **修改** | handleRestore 支援 cloud_backup 兩階段流程 |
| `src/app/actions/manifests/archive.ts` | **修改** | 封存完成時寫入 archived_at |
| `supabase/functions/archive-manifest/index.ts` | **修改** | 封存完成時寫入 archived_at；data.json 加入 product_code |
| `supabase/functions/restore-manifest/index.ts` | **修改** | upsert 寫入 product_code |
| `src/middleware.ts` | **修改** | **強制綁定 Google Drive 檢查（含白名單死循環防禦）** |
| `src/types/index.ts` | **修改** | Manifest 型態新增 cloud_backup, gdrive_file_id, archived_at |

**測試檔案 (v2 新增)：**
| 檔案 | 操作 | 說明 |
|------|------|------|
| `tests/e2e/gdrive-oauth.spec.ts` | **新增** | Playwright: OAuth 導向與 callback 驗證 |
| `tests/e2e/gdrive-migration.spec.ts` | **新增** | Playwright: Cron 移轉、手動移轉、佇列處理 |
| `tests/e2e/gdrive-restore.spec.ts` | **新增** | Playwright: 還原流程、空間預判阻斷、404 容錯 |
| `tests/e2e/gdrive-storage-warning.spec.ts` | **新增** | Playwright: 800MB/950MB 警告顯示 |

---

## 10. storage_size_bytes 一致性維護 (同 v1，已聯動 013 號規格)

---

## 11. 驗收條件 (v2 更新：含測試)

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
* [ ] archive_logs 正確記錄所有移轉操作
* [ ] **data.json 正確序列化/反序列化 product_code 欄位**
* [ ] **Middleware 白名單正確防禦死循環**
* [ ] **Playwright smoke test 全部通過**

---

## 12. 附錄：關鍵程式碼片段參考

### 12.1 archive-manifest 關鍵修改點 (product_code + archived_at)

```typescript
// 1. SELECT 查詢加入 product_code
const { data: drugItems } = await supabase
  .from('drug_items')
  .select('id, manifest_id, page_number, item_order, barcode, product_code, name, ...')

// 2. data.json 生成加入 product_code
const dataJsonItems = drugItems.map((item: any) => ({
  // ...
  barcode: item.barcode,
  product_code: item.product_code ?? null,  // ★ 新增
  // ...
}))

// 3. 更新 DB 時寫入 archived_at
await supabase
  .from('manifests')
  .update({
    // ...
    archived_at: new Date().toISOString(),  // ★ 新增
  })
  .eq('id', manifestId);
```

### 12.2 restore-manifest 關鍵修改點 (product_code)

```typescript
const { error: itemError } = await supabase
  .from('drug_items')
  .upsert({
    // ...
    barcode: item.barcode,
    product_code: item.product_code ?? null,  // ★ 新增
    // ...
  }, { onConflict: 'id' });
```

### 12.3 Middleware 關鍵邏輯

```typescript
// 白名單優先
if (pathname.startsWith('/auth/gdrive') || pathname.startsWith('/api/') || ...) return response;

// 未登入放行
const { data: { session } } = await supabase.auth.getSession();
if (!session) return response;

// 已登入但無 GDrive 連線 → 強制導向
const { data: gdriveConn } = await supabase
  .from('user_gdrive_connections')
  .select('id').eq('user_id', session.user.id).single();
if (!gdriveConn) return NextResponse.redirect(new URL('/auth/gdrive/connect', request.url));
```

---

**規格書 v2 完成。請審查內容，確認無誤後我將進入 implementation plan 階段。**