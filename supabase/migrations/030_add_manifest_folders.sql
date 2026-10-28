-- Migration: 030_add_manifest_folders.sql
-- Description: 支援雲端硬碟式樹狀資料夾管理與 AI 智慧整理

-- 1. 建立資料夾表 manifest_folders
CREATE TABLE IF NOT EXISTS manifest_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES manifest_folders(id) ON DELETE CASCADE,
    folder_type TEXT DEFAULT 'custom' CHECK (folder_type IN ('system_date', 'custom')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 建立索引加速樹狀查詢與使用者隔離
CREATE INDEX IF NOT EXISTS idx_manifest_folders_parent_id ON manifest_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_manifest_folders_user_id ON manifest_folders(user_id);

-- 2. 啟用 RLS 與存取策略
ALTER TABLE manifest_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own manifest folders"
    ON manifest_folders
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 3. 擴充 manifests 表以支援資料夾關聯
ALTER TABLE manifests 
ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES manifest_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_manifests_folder_id ON manifests(folder_id);
