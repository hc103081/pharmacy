-- 022_add_product_code_manual.sql
-- 為 drug_items 表新增 product_code 欄位（如先前 021 已有，但若未成功則此檔提供備援）
ALTER TABLE drug_items ADD COLUMN IF NOT EXISTS product_code TEXT;
CREATE INDEX IF NOT EXISTS idx_drug_items_product_code ON drug_items(product_code) WHERE product_code IS NOT NULL;
