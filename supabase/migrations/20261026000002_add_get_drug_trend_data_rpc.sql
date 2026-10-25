-- Migration: 20261026000002_add_get_drug_trend_data_rpc.sql
-- Create get_drug_trend_data RPC function for trend analysis

CREATE OR REPLACE FUNCTION get_drug_trend_data(
  p_barcode TEXT,
  p_product_code TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE(
  manifest_id UUID,
  manifest_name TEXT,
  counted_at TIMESTAMPTZ,
  page_number INTEGER,
  expected_quantity NUMERIC,
  actual_quantity NUMERIC,
  discrepancy NUMERIC,
  counted_status TEXT,
  storage_location TEXT,
  category TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    di.manifest_id::UUID,
    m.name as manifest_name,
    di.created_at as counted_at,
    di.page_number,
    di.expected_quantity::numeric,
    COALESCE(di.actual_quantity, 0)::numeric as actual_quantity,
    (COALESCE(di.actual_quantity, 0) - di.expected_quantity)::numeric as discrepancy,
    di.counted_status,
    di.storage_location,
    di.category
  FROM drug_items di
  JOIN manifests m ON di.manifest_id = m.id
  WHERE di.barcode = p_barcode
    AND (p_product_code IS NULL OR di.product_code = p_product_code)
  ORDER BY di.created_at DESC
  LIMIT GREATEST(p_limit, 0);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_drug_trend_data TO authenticated;