-- Migration: Add archive support for manifests
-- Created: 2026-06-19

-- 1. Add archive-related columns to manifests table
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS archive_status TEXT;
-- NULL | 'archiving' | 'archived' | 'restoring'

ALTER TABLE manifests ADD COLUMN IF NOT EXISTS archived_zip_path TEXT;

ALTER TABLE manifests ADD COLUMN IF NOT EXISTS archive_locked_at TIMESTAMPTZ;

ALTER TABLE manifests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Create trigger to update updated_at on manifests (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_manifests_updated_at' AND tgrelid = 'manifests'::regclass) THEN
        CREATE TRIGGER update_manifests_updated_at
            BEFORE UPDATE ON manifests
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- 2. Create index for efficient archive lookup (used by cron)
CREATE INDEX IF NOT EXISTS idx_manifests_archive_lookup
ON manifests (archive_status, updated_at)
WHERE archive_status IS NULL;

-- 3. Create archive operation logs table
CREATE TABLE IF NOT EXISTS archive_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id UUID REFERENCES manifests(id) ON DELETE SET NULL,
  action TEXT NOT NULL,   -- 'archive' | 'restore'
  trigger TEXT NOT NULL,  -- 'manual' | 'cron' | 'dispatched'
  status TEXT NOT NULL,   -- 'success' | 'skipped' | 'failed'
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create archived-manifests storage bucket for ZIP files (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'archived-manifests',
  'archived-manifests',
  false,
  524288000, -- 500MB max file size
  ARRAY['application/zip']
)
ON CONFLICT (id) DO NOTHING;

-- 5. RLS policy: Only service_role can manage archived manifests (no public access)
CREATE POLICY "Service role can manage archived manifests"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'archived-manifests')
WITH CHECK (bucket_id = 'archived-manifests');