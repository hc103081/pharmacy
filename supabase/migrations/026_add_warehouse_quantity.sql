-- 新增 warehouse_quantity 欄位到 drug_items 表
-- 在 Supabase SQL Editor 執行此腳本

ALTER TABLE drug_items 
ADD COLUMN IF NOT EXISTS warehouse_quantity integer;

-- 可選：加上註解
COMMENT ON COLUMN drug_items.warehouse_quantity IS '總倉庫存量（紙本最右欄純整數，可能為負）';