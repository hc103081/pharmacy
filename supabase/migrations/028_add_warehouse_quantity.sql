-- 028: 新增 warehouse_quantity 欄位到 drug_items 表（總倉庫存量）
ALTER TABLE public.drug_items ADD COLUMN IF NOT EXISTS warehouse_quantity INTEGER;

-- 新增索引（可選，如果需要按倉庫存量查詢）
-- CREATE INDEX IF NOT EXISTS idx_drug_items_warehouse_quantity ON drug_items(warehouse_quantity);