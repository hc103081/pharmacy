-- Initial Schema for PhamaCount Web
-- Created: 2026-06-12

-- 1. Create manifests table
CREATE TABLE IF NOT EXISTS manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    total_items INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create drug_items table
CREATE TABLE IF NOT EXISTS drug_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manifest_id UUID NOT NULL REFERENCES manifests(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    barcode TEXT NOT NULL,
    name TEXT NOT NULL,
    expected_quantity INTEGER DEFAULT 0,
    counted_status TEXT DEFAULT 'pending' CHECK (counted_status IN ('pending', 'completed', 'error')),
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for common queries
CREATE INDEX IF NOT EXISTS idx_drug_items_manifest_id ON drug_items(manifest_id);
CREATE INDEX IF NOT EXISTS idx_drug_items_page_number ON drug_items(page_number);
CREATE INDEX IF NOT EXISTS idx_drug_items_barcode ON drug_items(barcode);

-- 3. Setup updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_drug_items_updated_at
    BEFORE UPDATE ON drug_items
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
