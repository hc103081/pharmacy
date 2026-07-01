-- 015_nhi_drug_lookup.sql
-- 健保署藥品中文名稱快取表

CREATE TABLE IF NOT EXISTS nhi_drug_lookup (
  drug_code TEXT PRIMARY KEY,
  chinese_name TEXT NOT NULL,
  english_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for lookup performance
CREATE INDEX IF NOT EXISTS idx_nhi_drug_lookup_updated ON nhi_drug_lookup(updated_at);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_nhi_drug_lookup_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_nhi_drug_lookup_updated_at ON nhi_drug_lookup;
CREATE TRIGGER trigger_nhi_drug_lookup_updated_at
  BEFORE UPDATE ON nhi_drug_lookup
  FOR EACH ROW EXECUTE FUNCTION update_nhi_drug_lookup_updated_at();
