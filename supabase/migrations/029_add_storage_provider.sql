-- Add storage_provider column to track which storage backend photos are stored in
-- Values: 'supabase' | 'b2'

ALTER TABLE drug_items 
ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'supabase' 
CHECK (storage_provider IN ('supabase', 'b2'));

ALTER TABLE manifests 
ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'supabase' 
CHECK (storage_provider IN ('supabase', 'b2'));

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_drug_items_storage_provider ON drug_items(storage_provider);
CREATE INDEX IF NOT EXISTS idx_manifests_storage_provider ON manifests(storage_provider);

-- Comment for documentation
COMMENT ON COLUMN drug_items.storage_provider IS 'Storage backend for photo_url: supabase or b2';
COMMENT ON COLUMN manifests.storage_provider IS 'Default storage backend for manifest photos';