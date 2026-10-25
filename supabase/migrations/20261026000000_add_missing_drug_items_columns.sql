-- supabase/migrations/20261026000000_add_missing_drug_items_columns.sql
-- Add missing columns that the searchDrugsCrossManifest RPC expects

ALTER TABLE drug_items 
ADD COLUMN IF NOT EXISTS actual_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS storage_location TEXT,
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS product_code TEXT,
ADD COLUMN IF NOT EXISTS counted_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Add indexes for query performance
CREATE INDEX IF NOT EXISTS idx_drug_items_storage_location ON drug_items(storage_location);
CREATE INDEX IF NOT EXISTS idx_drug_items_category ON drug_items(category);
CREATE INDEX IF NOT EXISTS idx_drug_items_product_code ON drug_items(product_code);
CREATE INDEX IF NOT EXISTS idx_drug_items_counted_status ON drug_items(counted_status);