-- 019: Atomic manifest + drug_items import RPC
-- Ensures manifest creation and drug_items insertion succeed or fail together.

CREATE OR REPLACE FUNCTION create_manifest_with_items(
  p_manifest jsonb,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_manifest_id uuid;
  v_source_images text[] := '{}';
BEGIN
  -- 1. Insert manifest
  INSERT INTO manifests (
    name,
    order_number,
    delivery_date,
    source_file,
    total_items,
    status,
    user_id,
    source_images
  )
  VALUES (
    p_manifest->>'name',
    p_manifest->>'order_number',
    NULLIF(
      NULLIF(p_manifest->>'delivery_date', ''),
      'invalid-date'
    )::date,
    p_manifest->>'source_file',
    (p_manifest->>'total_items')::int,
    'active',
    (p_manifest->>'user_id')::uuid,
    CASE
      WHEN p_manifest->'source_images' IS NOT NULL
       AND jsonb_array_length(p_manifest->'source_images') > 0
      THEN ARRAY(SELECT value::text FROM jsonb_array_elements(p_manifest->'source_images'))
      ELSE '{}'
    END
  )
  RETURNING id INTO v_manifest_id;

  -- 2. Insert drug_items in the same transaction
  INSERT INTO drug_items (
    manifest_id, item_order, page_number, barcode, name,
    expected_quantity, bonus_quantity, storage_location, category, counted_status
  )
  SELECT
    v_manifest_id,
    x.item_order,
    x.page_number,
    x.barcode,
    x.name,
    x.expected_quantity,
    x.bonus_quantity,
    x.storage_location,
    x.category,
    'pending'
  FROM jsonb_to_recordset(p_items) AS x(
    item_order int,
    page_number int,
    barcode text,
    name text,
    expected_quantity int,
    bonus_quantity int,
    storage_location text,
    category text
  );

  RETURN v_manifest_id;
END;
$$;
