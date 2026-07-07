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

-- 新增 archive_status 欄位（追蹤移轉狀態：null=legacy, archived=待移轉, migrating=移轉中, completed=已完成）
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS archive_status TEXT;
COMMENT ON COLUMN manifests.archive_status
  IS '移轉狀態: null=legacy, archived=待移轉, migrating=移轉中, completed=已完成';

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
  gdrive_root_folder_id TEXT,
  UNIQUE(user_id)
);

-- 3. 佇列表：用於 Cron 分派移轉任務
CREATE TABLE IF NOT EXISTS gdrive_migration_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id UUID NOT NULL REFERENCES manifests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL DEFAULT 'cron',
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  storage_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 索引：加速 Cron 查詢（找出待移轉的封存清單：cloud_backup=false, archive_status IN ('archived', null), archived_at > 30天）
CREATE INDEX IF NOT EXISTS idx_manifests_cloud_backup_lookup
ON manifests (cloud_backup, archived_at)
WHERE cloud_backup = false AND archive_status IN ('archived', null);

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

-- 8. RLS：佇列表
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

-- 10. 回填 archive_status：已封存且未移轉的設為 'archived'
UPDATE manifests
SET archive_status = 'archived'
WHERE status = 'archived'
  AND cloud_backup = false
  AND archive_status IS NULL;

-- 11. 已移轉到 Google Drive 的設為 'completed'
UPDATE manifests
SET archive_status = 'completed'
WHERE cloud_backup = true
  AND archive_status IS NULL;