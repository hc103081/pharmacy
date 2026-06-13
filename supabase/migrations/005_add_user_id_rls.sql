-- Migration: Add user_id to manifests and enable RLS
-- Created: 2026-06-14

-- 1. Add user_id to manifests
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Enable RLS on manifests
ALTER TABLE manifests ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies for manifests
CREATE POLICY "Users can view own manifests" ON manifests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own manifests" ON manifests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own manifests" ON manifests
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own manifests" ON manifests
  FOR DELETE USING (auth.uid() = user_id);

-- 4. Enable RLS on drug_items
ALTER TABLE drug_items ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies for drug_items (check via manifest owner)
CREATE POLICY "Users can view own drug items" ON drug_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM manifests
      WHERE manifests.id = drug_items.manifest_id
      AND manifests.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own drug items" ON drug_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM manifests
      WHERE manifests.id = drug_items.manifest_id
      AND manifests.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own drug items" ON drug_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM manifests
      WHERE manifests.id = drug_items.manifest_id
      AND manifests.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own drug items" ON drug_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM manifests
      WHERE manifests.id = drug_items.manifest_id
      AND manifests.user_id = auth.uid()
    )
  );