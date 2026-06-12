-- Migration to add item_order for strict sorting
-- Created: 2026-06-12

ALTER TABLE drug_items ADD COLUMN item_order INTEGER;

-- Update existing items with a basic sequence if any exist
-- This is a fallback for already imported data
WITH updated AS (
    SELECT id, row_number() OVER (PARTITION BY manifest_id ORDER BY created_at) as rn
    FROM drug_items
)
UPDATE drug_items
SET item_order = updated.rn
FROM updated
WHERE drug_items.id = updated.id;

CREATE INDEX IF NOT EXISTS idx_drug_items_item_order ON drug_items(item_order);
