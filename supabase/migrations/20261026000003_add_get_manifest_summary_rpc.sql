-- Migration: 20261026000003_add_get_manifest_summary_rpc.sql
-- Create get_manifest_summary RPC function for report dashboard

CREATE OR REPLACE FUNCTION get_manifest_summary()
RETURNS TABLE(
  manifest_id UUID,
  name TEXT,
  created_at TIMESTAMPTZ,
  status TEXT,
  total_items BIGINT,
  completed_count BIGINT,
  error_count BIGINT,
  total_discrepancy_qty NUMERIC,
  completion_rate NUMERIC,
  location_category_breakdown JSONB
) AS $$
DECLARE
  manifest_rec RECORD;
  breakdown_json JSONB;
BEGIN
  RETURN QUERY
  SELECT 
    m.id as manifest_id,
    m.name,
    m.created_at,
    m.status,
    COUNT(di.id) as total_items,
    COUNT(CASE WHEN di.counted_status = 'completed' THEN 1 END) as completed_count,
    COUNT(CASE WHEN di.counted_status = 'error' THEN 1 END) as error_count,
    COALESCE(SUM((COALESCE(di.actual_quantity, 0) - di.expected_quantity)::numeric), 0) as total_discrepancy_qty,
    CASE 
      WHEN COUNT(di.id) > 0 
      THEN ROUND(COUNT(CASE WHEN di.counted_status = 'completed' THEN 1 END)::numeric / COUNT(di.id) * 100, 1)
      ELSE 0
    END as completion_rate,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'storage_location', lb.storage_location,
          'category', lb.category,
          'item_count', lb.item_count,
          'error_count', lb.error_count
        )
      )
      FROM (
        SELECT 
          di.storage_location,
          di.category,
          COUNT(*) as item_count,
          COUNT(CASE WHEN di.counted_status = 'error' THEN 1 END) as error_count
        FROM drug_items di
        WHERE di.manifest_id = m.id
          AND di.storage_location IS NOT NULL
          AND di.category IS NOT NULL
        GROUP BY di.storage_location, di.category
      ) lb
    ) as location_category_breakdown
  FROM manifests m
  LEFT JOIN drug_items di ON di.manifest_id = m.id
  GROUP BY m.id, m.name, m.created_at, m.status
  ORDER BY m.created_at DESC;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_manifest_summary TO authenticated;