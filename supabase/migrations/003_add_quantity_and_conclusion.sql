-- Migration to add actual_quantity and conclusion_type
-- Created: 2026-06-12

-- 1. Add actual_quantity to drug_items
ALTER TABLE drug_items ADD COLUMN actual_quantity INTEGER DEFAULT 0;

-- 2. Add conclusion_type to manifests
-- 'normal' for no discrepancies, 'discrepancy' for items with errors
ALTER TABLE manifests ADD COLUMN conclusion_type TEXT DEFAULT 'pending' CHECK (conclusion_type IN ('pending', 'normal', 'discrepancy'));
