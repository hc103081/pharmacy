-- supabase/migrations/20261028000000_enrich_search_drugs_rpc.sql
-- Enrich search_drugs_cross_manifest RPC to return drug_item_id, page_number, item_order, and photo_url

CREATE OR REPLACE FUNCTION search_drugs_cross_manifest(
  p_search_text TEXT DEFAULT NULL,
  p_barcode TEXT DEFAULT NULL,
  p_product_code TEXT DEFAULT NULL,
  p_storage_locations TEXT[] DEFAULT NULL,
  p_categories TEXT[] DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_manifest_status TEXT DEFAULT 'all',
  p_counted_status TEXT DEFAULT 'all',
  p_has_discrepancy BOOLEAN DEFAULT FALSE,
  p_page INTEGER DEFAULT 1,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  barcode TEXT,
  product_code TEXT,
  name TEXT,
  storage_location TEXT,
  category TEXT,
  manifest_count BIGINT,
  total_expected NUMERIC,
  total_actual NUMERIC,
  total_discrepancy NUMERIC,
  avg_discrepancy NUMERIC,
  error_count BIGINT,
  last_counted_at TIMESTAMPTZ,
  history JSONB
) AS $$
DECLARE
  where_conditions TEXT[] := '{}';
  base_query TEXT;
  agg_query TEXT;
  final_query TEXT;
BEGIN
  -- Build WHERE conditions
  IF p_search_text IS NOT NULL THEN
    where_conditions := where_conditions || format('di.name ILIKE %L', '%' || p_search_text || '%');
  END IF;
  
  IF p_barcode IS NOT NULL THEN
    where_conditions := where_conditions || format('di.barcode = %L', p_barcode);
  END IF;
  
  IF p_product_code IS NOT NULL THEN
    where_conditions := where_conditions || format('di.product_code = %L', p_product_code);
  END IF;
  
  IF p_storage_locations IS NOT NULL AND array_length(p_storage_locations, 1) > 0 THEN
    where_conditions := where_conditions || format('di.storage_location = ANY(%L)', p_storage_locations);
  END IF;
  
  IF p_categories IS NOT NULL AND array_length(p_categories, 1) > 0 THEN
    where_conditions := where_conditions || format('di.category = ANY(%L)', p_categories);
  END IF;
  
  IF p_date_from IS NOT NULL THEN
    where_conditions := where_conditions || format('di.created_at >= %L', p_date_from);
  END IF;
  
  IF p_date_to IS NOT NULL THEN
    where_conditions := where_conditions || format('di.created_at <= %L', p_date_to);
  END IF;
  
  IF p_manifest_status != 'all' THEN
    where_conditions := where_conditions || format('m.status = %L', p_manifest_status);
  END IF;
  
  IF p_counted_status != 'all' THEN
    where_conditions := where_conditions || format('di.counted_status = %L', p_counted_status);
  END IF;

  -- Base query with COALESCE and detailed item fields
  base_query := '
    SELECT 
      di.id as drug_item_id,
      di.barcode,
      COALESCE(di.product_code, '''') as product_code,
      di.name,
      COALESCE(di.storage_location, '''') as storage_location,
      COALESCE(di.category, '''') as category,
      COALESCE(di.page_number, 1) as page_number,
      COALESCE(di.item_order, 1) as item_order,
      di.photo_url,
      di.expected_quantity::numeric,
      COALESCE(di.actual_quantity, 0)::numeric as actual_quantity,
      di.counted_status,
      di.created_at,
      m.id as manifest_id,
      m.status as manifest_status
    FROM drug_items di
    JOIN manifests m ON di.manifest_id = m.id
    WHERE 1=1
  ';

  IF array_length(where_conditions, 1) > 0 THEN
    base_query := base_query || ' AND ' || array_to_string(where_conditions, ' AND ');
  END IF;

  -- Aggregation query with full item details in history
  agg_query := format('
    WITH filtered AS (%s)
    SELECT 
      barcode,
      MAX(product_code) as product_code,
      MAX(name) as name,
      MAX(storage_location) as storage_location,
      MAX(category) as category,
      COUNT(*) as manifest_count,
      SUM(expected_quantity) as total_expected,
      SUM(actual_quantity) as total_actual,
      SUM(expected_quantity - actual_quantity) as total_discrepancy,
      AVG(expected_quantity - actual_quantity) as avg_discrepancy,
      SUM(CASE WHEN counted_status = ''error'' THEN 1 ELSE 0 END) as error_count,
      MAX(created_at) as last_counted_at,
      jsonb_agg(
        jsonb_build_object(
          ''drugItemId'', drug_item_id,
          ''manifestId'', manifest_id,
          ''manifestName'', (SELECT name FROM manifests WHERE id = manifest_id),
          ''pageNumber'', page_number,
          ''itemOrder'', item_order,
          ''photoUrl'', photo_url,
          ''expected'', expected_quantity,
          ''actual'', actual_quantity,
          ''discrepancy'', expected_quantity - actual_quantity,
          ''status'', counted_status,
          ''countedAt'', created_at
        ) ORDER BY created_at DESC
      ) as history
    FROM filtered
    GROUP BY barcode
  ', base_query);

  -- Add discrepancy filter
  IF p_has_discrepancy THEN
    agg_query := agg_query || ' HAVING SUM(expected_quantity - actual_quantity) != 0';
  END IF;

  -- Pagination
  final_query := agg_query || format(' ORDER BY last_counted_at DESC LIMIT %s OFFSET %s', p_limit, (p_page - 1) * p_limit);

  RETURN QUERY EXECUTE final_query;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION search_drugs_cross_manifest TO authenticated;
