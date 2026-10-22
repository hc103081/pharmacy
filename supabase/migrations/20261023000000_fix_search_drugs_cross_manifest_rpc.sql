-- Migration: 20261023000000_fix_search_drugs_cross_manifest_rpc.sql
-- 修復 search_drugs_cross_manifest RPC 函數
-- Bug: WHERE 條件引用 drug_items 表不存在的 `status` 欄位
-- Fix: JOIN manifests 表並使用 m.status 進行篩選

-- 1. 修復 search_drugs_cross_manifest 函數
CREATE OR REPLACE FUNCTION public.search_drugs_cross_manifest(
  p_search_text text DEFAULT NULL::text,
  p_barcode text DEFAULT NULL::text,
  p_product_code text DEFAULT NULL::text,
  p_storage_locations text[] DEFAULT NULL::text[],
  p_categories text[] DEFAULT NULL::text[],
  p_date_from text DEFAULT NULL::text,
  p_date_to text DEFAULT NULL::text,
  p_manifest_status text[] DEFAULT NULL::text[],
  p_counted_status text DEFAULT NULL::text,
  p_has_discrepancy integer DEFAULT NULL::integer,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  barcode text,
  name text,
  product_code text,
  category text,
  storage_location text,
  expected_quantity numeric,
  actual_quantity numeric,
  counted_status text,
  created_at timestamptz,
  manifest_id UUID
)
LANGUAGE sql
STABLE
AS $$
SELECT 
  di.id::UUID, 
  di.barcode, 
  di.name, 
  di.product_code, 
  di.category, 
  di.storage_location, 
  di.expected_quantity::numeric, 
  di.actual_quantity::numeric, 
  di.counted_status, 
  di.created_at::timestamptz, 
  di.manifest_id::UUID
FROM drug_items di
JOIN manifests m ON di.manifest_id = m.id
WHERE
  (p_search_text IS NULL OR di.barcode ILIKE '%' || p_search_text || '%' OR di.name ILIKE '%' || p_search_text || '%' OR di.product_code ILIKE '%' || p_search_text || '%')
  AND (p_barcode IS NULL OR di.barcode = p_barcode)
  AND (p_product_code IS NULL OR di.product_code = p_product_code)
  AND (p_storage_locations IS NULL OR di.storage_location = ANY(p_storage_locations))
  AND (p_categories IS NULL OR di.category = ANY(p_categories))
  AND (p_date_from IS NULL OR di.created_at >= p_date_from::timestamptz)
  AND (p_date_to IS NULL OR di.created_at <= p_date_to::timestamptz)
  AND (p_manifest_status IS NULL OR m.status = ANY(p_manifest_status))
  AND (p_counted_status IS NULL OR di.counted_status = p_counted_status)
  AND (p_has_discrepancy IS NULL OR (di.actual_quantity - di.expected_quantity) != 0)
ORDER BY di.created_at DESC, di.id DESC
LIMIT GREATEST(p_limit, 0)
OFFSET GREATEST(p_offset, 0);
$$;

-- 2. 授權 authenticated 角色執行此函數
GRANT EXECUTE ON FUNCTION public.search_drugs_cross_manifest TO authenticated;