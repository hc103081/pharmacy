-- 014: 新清單格式遷移 — 新增儲位與類別欄位
-- drug_items：新增儲位與類別
ALTER TABLE public.drug_items ADD COLUMN IF NOT EXISTS storage_location TEXT;
ALTER TABLE public.drug_items ADD COLUMN IF NOT EXISTS category TEXT;

-- drug_items：bonus_quantity 保留但不再使用（設預設值 0）
-- 不刪除欄位以避免遷移風險，所有新資料 bonus_quantity 固定為 0
ALTER TABLE public.drug_items ALTER COLUMN bonus_quantity SET DEFAULT 0;
