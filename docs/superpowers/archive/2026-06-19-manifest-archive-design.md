# 清單壓縮封存系統 - 設計規格書

**日期:** 2026-06-19
**狀態:** 已定案 (v3)
**作者:** PhamaCount Web Team

---

## 1. 概述

### 1.1 目的

將超過 30 天未操作的藥品清單（manifest）及其所有 drug_items 資料與照片，打包成 ZIP 壓縮檔存入 Supabase Storage，並清理原始資料庫記錄與照片，以節省資料庫空間。後續使用者可點擊按鈕將壓縮檔解壓還原，重新載入資料庫。

### 1.2 核心功能

- **封存 (Archive):** 手動或排程觸發，將清單資料 + 照片打包成 ZIP，清理 DB + Storage
- **還原 (Restore):** 手動觸發，解壓 ZIP，將資料寫回 DB，照片重新上傳 Storage
- **進度顯示:** SSE streaming 回傳即時進度
- **排程自動化:** Cron 每天檢查，自動封存符合條件的清單

### 1.3 技術決策摘要

| 決策 | 選擇 |
|------|------|
| 觸發方式 | 手動按鈕 + Cron 排程（兩者都要） |
| 時間判斷 | `manifests.updated_at` 超過 30 天 |
| ZIP 儲存位置 | 新建 `archived-manifests` bucket（非公開） |
| 壓縮格式 | ZIP（@zipjs/zip.js streaming） |
| 還原後狀態 | 保留原始 counted_status |
| 執行環境 | Supabase Edge Function (Deno) |
| 進度回傳 | SSE (Server-Sent Events) streaming |
| 核心處理 | Edge Function，單次只處理一個 manifest |

---

## 2. 架構

```
┌─ 手動觸發 ─────────────────────────────────────────────┐
│  前端 manifests 頁面                                     │
│  「封存舊清單」按鈕 → fetch(/archive-manifest)           │
│  「解壓還原」按鈕   → fetch(/restore-manifest)           │
│  ← SSE streaming 進度                                    │
└────────────────────────────────────────────────────────┘

┌─ Cron 觸發 (每天 03:00 UTC) ───────────────────────────┐
│  pg_cron → archive-cron Edge Function                   │
│  1. SELECT 符合條件 manifestId 列表                      │
│  2. 分派: 每次 5 筆併發, 間隔 200ms                      │
│     → archive-manifest (trigger: 'dispatched')           │
└────────────────────────────────────────────────────────┘

┌─ archive-manifest (單一清單) ──────────────────────────┐
│  1. ACQUIRE LOCK (含 1hr 逾時搶佔)                       │
│  2. SELECT drug_items, 估算照片大小                       │
│  3. Streaming ZIP (data.json + photos)                   │
│  4. Streaming 上傳到 archived-manifests                  │
│  5. DB Transaction: DELETE drug_items + UPDATE manifest  │
│  6. Storage 清理 (非關鍵, 失敗只記 log)                   │
│  ★ GLOBAL CATCH → 釋放鎖, 記錄 failed log                │
│  ★ SSE 推送進度                                          │
└────────────────────────────────────────────────────────┘

┌─ restore-manifest (單一清單) ──────────────────────────┐
│  1. ACQUIRE LOCK (含 1hr 逾時搶佔)                       │
│  2. 下載 ZIP (streaming)                                 │
│  3. INSERT drug_items ... ON CONFLICT (id) DO UPDATE     │
│  4a. 逐一上傳照片, 收集 Map{drug_id → url}               │
│  4b. 批次 UPDATE photo_url (一條 SQL)                    │
│  5. UPDATE manifest → active, 釋放鎖                     │
│  6. 刪除 ZIP (非關鍵)                                    │
│  ★ GLOBAL CATCH → 退回 'archived' 狀態, 記錄 failed log │
│  ★ SSE 推送進度                                          │
└────────────────────────────────────────────────────────┘
```

---

## 3. Edge Function 詳細流程

### 3.1 `archive-manifest` (封存單一清單)

**Request:**
```json
{ "manifestId": "uuid", "trigger": "manual" | "cron" | "dispatched" }
```

**流程:**

1. **取得鎖定 (TRY ACQUIRE LOCK)**
   ```sql
   UPDATE manifests
   SET archive_status = 'archiving', archive_locked_at = NOW()
   WHERE id = :manifestId
     AND (archive_status IS NULL
          OR (archive_status IN ('archiving','restoring') AND archive_locked_at < NOW() - INTERVAL '1 hour'))
   ```
   若 `affected_rows = 0`，回傳 `{"skipped":"已鎖定或處理中"}`

2. **查詢 drug_items**
   ```sql
   SELECT * FROM drug_items WHERE manifest_id = :manifestId
   ```

3. **估算照片總大小**
   對每個 `photo_url` 發 HEAD 請求取 `content-length`，總和 > 200MB 則記錄 log 並跳過（釋放鎖）

4. **建立 data.json**
   內容包含所有 drug_items 的結構化資料（不含 photo_url，改記錄 `drug_item_id` 對應的照片檔名）

5. **Streaming ZIP 建立**
   使用 `@zipjs/zip.js` streaming API，在 Deno 原生 ReadableStream pipeline 中：
   - 寫入 `data.json`
   - 逐一 fetch 照片 → pipe 進 ZIP stream → 不緩衝記憶體

6. **Streaming 上傳 ZIP**
   使用 Deno 原生 `fetch()` PUT 到 Supabase Storage S3-compatible endpoint，body 直接 pipe ZIP ReadableStream（不轉 Blob）
   路徑：`{manifestId}/archive.zip`

7. **DB Transaction**
   ```sql
   BEGIN;
     DELETE FROM drug_items WHERE manifest_id = :manifestId;
     UPDATE manifests SET status = 'archived', archive_status = 'archived', archived_zip_path = :zipPath WHERE id = :manifestId;
   COMMIT;
   ```

8. **Storage 照片清理（非關鍵）**
   從 `drug-photos` bucket 刪除步驟 2 中收集的照片路徑，失敗只記錄 `archive_logs`

9. **SSE 推送進度**
   ```
   data: {"manifestId":"xxx","status":"done","name":"..."}
   ```

10. **GLOBAL CATCH**
    任何未捕獲錯誤 → 釋放鎖：`UPDATE manifests SET archive_status = NULL, archive_locked_at = NULL`
    記錄 `archive_logs`：`status='failed'`

---

### 3.2 `restore-manifest` (還原單一清單)

**Request:**
```json
{ "manifestId": "uuid" }
```

**流程:**

1. **取得鎖定 (TRY ACQUIRE LOCK)**
   ```sql
   UPDATE manifests
   SET archive_status = 'restoring', archive_locked_at = NOW()
   WHERE id = :manifestId
     AND archive_status = 'archived'
     AND (archive_locked_at IS NULL OR archive_locked_at < NOW() - INTERVAL '1 hour')
   ```

2. **下載 ZIP**
   從 `archived-manifests/{manifestId}/archive.zip` streaming 下載

3. **解壓 data.json → INSERT（冪等）**
   批次每 100 筆：
   ```sql
   INSERT INTO drug_items (id, manifest_id, page_number, item_order, barcode, name,
                            expected_quantity, bonus_quantity, actual_quantity,
                            counted_status, photo_url, created_at, updated_at)
   VALUES (...)
   ON CONFLICT (id) DO UPDATE SET
     manifest_id = EXCLUDED.manifest_id,
     page_number = EXCLUDED.page_number,
     item_order = EXCLUDED.item_order,
     barcode = EXCLUDED.barcode,
     name = EXCLUDED.name,
     expected_quantity = EXCLUDED.expected_quantity,
     bonus_quantity = EXCLUDED.bonus_quantity,
     actual_quantity = EXCLUDED.actual_quantity,
     counted_status = EXCLUDED.counted_status,
     photo_url = EXCLUDED.photo_url,
     updated_at = NOW();
   ```

4a. **解壓照片 → 逐一上傳到 drug-photos**
   每上傳成功一個 → 記錄到記憶體 Map：`{ drug_item_id: new_public_url }`
   單張失敗 → Try-Catch → 記錄 `archive_logs` → 繼續處理（不中斷）

4b. **批次更新 photo_url（一條 SQL）**
   ```sql
   UPDATE drug_items AS d
   SET photo_url = u.new_url
   FROM (VALUES
     ('uuid-1', 'https://...'),
     ('uuid-2', 'https://...')
   ) AS u(id, new_url)
   WHERE d.id = u.id;
   ```

5. **更新 manifest 狀態**
   ```sql
   UPDATE manifests
   SET status = 'active', archive_status = NULL, archived_zip_path = NULL, archive_locked_at = NULL, updated_at = NOW()
   WHERE id = :manifestId
   ```

6. **刪除 ZIP（非關鍵）**
   從 `archived-manifests` 刪除 ZIP，失敗不影響

7. **SSE 推送進度**

8. **GLOBAL CATCH**
   崩潰時 → `archive_status` 退回 `'archived'`，釋放鎖，記錄 `archive_logs`：`status='failed'`

---

### 3.3 `archive-cron` (Cron 專用分派入口)

**Request:** 由 `pg_cron` 定時觸發（每天 03:00 UTC）

**流程:**

1. **查詢符合條件清單**
   ```sql
   SELECT id FROM manifests
   WHERE status = 'active'
     AND updated_at < NOW() - INTERVAL '30 days'
     AND (archive_status IS NULL
          OR (archive_status IN ('archiving','restoring') AND archive_locked_at < NOW() - INTERVAL '1 hour'))
   ```

2. **併發節流分派**
   - 每次最多 5 筆併發（`Promise.all`）
   - 每批之間間隔 200ms
   - 單筆 fetch 失敗不影響其他
   - 對每個 manifestId 呼叫 `archive-manifest` with `trigger: 'dispatched'`

---

## 4. 資料庫變更

### 4.1 Migration: `012_add_archive_support.sql`

```sql
-- 1. manifests 新增欄位
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS archive_status TEXT;
-- NULL | 'archiving' | 'archived' | 'restoring'

ALTER TABLE manifests ADD COLUMN IF NOT EXISTS archived_zip_path TEXT;

ALTER TABLE manifests ADD COLUMN IF NOT EXISTS archive_locked_at TIMESTAMPTZ;

-- 2. 索引：加速 Cron 查詢
CREATE INDEX IF NOT EXISTS idx_manifests_archive_lookup
ON manifests (archive_status, updated_at)
WHERE archive_status IS NULL;

-- 3. archive 操作記錄表
CREATE TABLE IF NOT EXISTS archive_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id UUID REFERENCES manifests(id) ON DELETE SET NULL,
  action TEXT NOT NULL,   -- 'archive' | 'restore'
  trigger TEXT NOT NULL,  -- 'manual' | 'cron' | 'dispatched'
  status TEXT NOT NULL,   -- 'success' | 'skipped' | 'failed'
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.2 FK 安全檢查（實作前執行）

```sql
SELECT
  tc.table_schema,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
WHERE ccu.table_name = 'drug_items'
  AND tc.constraint_type = 'FOREIGN KEY';
```

若無結果 → 可直接 DELETE drug_items。若有結果 → 需評估改用備份表方案。

---

## 5. Storage 變更

### 5.1 新建 `archived-manifests` bucket

- 公開：否 (`public: false`)
- 檔案大小上限：500MB
- 允許 MIME：`application/zip`
- RLS：僅 service_role 可存取（Edge Function 內部使用）

### 5.2 ZIP 檔案結構

```
archive.zip
├── data.json          # 所有 drug_items 結構化資料陣列
└── photos/
    ├── {drug_item_id_1}.jpg
    ├── {drug_item_id_2}.jpg
    └── ...
```

### 5.3 data.json 格式

```json
[
  {
    "id": "uuid",
    "manifest_id": "uuid",
    "page_number": 1,
    "item_order": 1,
    "barcode": "4711234567890",
    "name": "藥品名稱",
    "expected_quantity": 10,
    "bonus_quantity": 2,
    "actual_quantity": 10,
    "counted_status": "completed",
    "photo_ext": "jpg"
  }
]
```

---

## 6. 前端變更

### 6.1 manifests 頁面 (`src/app/manifests/page.tsx`)

- 新增「封存舊清單」按鈕
- 點擊後 fetch `POST /functions/v1/archive-manifest`（不傳 manifestId = 處理所有符合條件）
- 讀取 SSE stream，顯示進度條（modal/inline）
- 新增「已封存」分頁 tab，列出 `status = 'archived'` 的清單
- 每個已封存清單有「解壓還原」按鈕 → fetch `POST /functions/v1/restore-manifest`
- 同樣 SSE stream 顯示還原進度

### 6.2 manifest 狀態顯示

| 狀態 | 顯示 | 操作 |
|------|------|------|
| `active` | 正常 | 進入清點 / 刪除 |
| `archiving` | 封存中... | 無（顯示 loader） |
| `archived` | 已封存 | 解壓還原 |
| `restoring` | 還原中... | 無（顯示 loader） |

---

## 7. 風險與應對總表

| # | 風險 | 應對 |
|---|------|------|
| 1 | Cron SSE 長連接無效 | `trigger` 參數分流；cron 寫 log，不回傳 stream |
| 2 | JSZip OOM | 用 `@zipjs/zip.js` streaming；Deno 原生 fetch pipe；限制 200MB |
| 3 | CASCADE DELETE 資料蒸發 | 實作前檢查 FK；若安全則直接 DELETE，否則用備份表 |
| 4 | 重複操作 / 狀態鎖 | `archive_locked_at` + 1hr 逾時搶佔 + `archive_status` 狀態機 |
| 5 | 還原半殘 (照片失敗) | 單張 Try-Catch 不中斷；最後批次 UPDATE photo_url |
| 6 | 孤兒鎖 (crash 後卡死) | 1hr 逾時搶佔；GLOBAL CATCH 釋放鎖 |
| 7 | Cron 50 筆併發瓶頸 | 批次 5 筆 + 200ms 間隔節流 |
| 8 | 還原逐筆 UPDATE I/O 負擔 | 記憶體收集 Map → 一條 SQL 批次更新 |
| 9 | INSERT Unique Violation | `ON CONFLICT (id) DO UPDATE` 冪等防禦 |
| 10 | Storage 上傳把 Stream 轉 Blob (OOM) | 使用 Deno 原生 fetch PUT（非 Supabase SDK），直接 pipe Stream |
| 11 | 邊緣函數逾時 | 單次只處理一個 manifest；Cron 用分派模式各別執行 |

---

## 8. 檔案清單（預計新增 / 修改）

| 檔案 | 變更類型 | 說明 |
|------|----------|------|
| `supabase/functions/archive-manifest/index.ts` | 新增 | 封存單一清單 Edge Function |
| `supabase/functions/restore-manifest/index.ts` | 新增 | 還原單一清單 Edge Function |
| `supabase/functions/archive-cron/index.ts` | 新增 | Cron 分派入口 Edge Function |
| `supabase/functions/archive-cron/supabase_cron.yaml` | 新增 | Cron 排程設定 (每天 03:00 UTC) |
| `supabase/migrations/012_add_archive_support.sql` | 新增 | DB Schema 遷移 |
| `src/app/manifests/page.tsx` | 修改 | 新增封存/還原按鈕、進度條、已封存分頁 |
| `src/app/actions/manifests/archive.ts` | 可能修改 | 可能需要調整 status 相關邏輯 |

---

## 9. 驗收條件

- [ ] 手動點擊「封存舊清單」能成功將符合條件清單封存，SSE 顯示進度
- [ ] 手動點擊「解壓還原」能成功將已封存清單還原，資料與照片完整
- [ ] Cron 排程能自動觸發封存，批次分派不超過 5 筆併發
- [ ] 封存中的清單不會被重複封存（狀態鎖）
- [ ] 還原中的清單不會被重複還原（狀態鎖）
- [ ] 還原後的 drug_items counted_status 與原始一致
- [ ] 超過 1 小時的孤兒鎖能被搶佔
- [ ] 封存/還原失敗時，狀態能正確回退，不卡死
- [ ] 總照片 > 200MB 的清單正確跳過並記錄
- [ ] archive_logs 正確記錄所有操作