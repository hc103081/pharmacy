-- Migration: add product_code to drug_items
ALTER TABLE drug_items ADD COLUMN product_code TEXT;
CREATE INDEX idx_drug_items_product_code ON drug_items(product_code) WHERE product_code IS NOT NULL;
