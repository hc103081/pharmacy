-- 027: 更新 create_manifest_with_items RPC 函數，支援 warehouse_quantity + 由參數接收 user_id
-- 請在 Supabase SQL Editor 執行此腳本

-- 先檢查並刪除舊函數（如果存在）
DROP FUNCTION IF EXISTS create_manifest_with_items(jsonb, jsonb, uuid);

-- 重新建立支援 warehouse_quantity + user_id 參數的函數
CREATE OR REPLACE FUNCTION create_manifest_with_items(
  p_manifest jsonb,
  p_items jsonb,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_manifest_id uuid;
  v_item jsonb;
BEGIN
  -- 建立 manifest（source_images 為 text[]，從 jsonb 正確轉換）
  INSERT INTO manifests (
    name,
    order_number,
    delivery_date,
    source_file,
    total_items,
    status,
    user_id,
    source_images
  ) VALUES (
    p_manifest->>'name',
    p_manifest->>'order_number',
    (p_manifest->>'delivery_date')::date,
    p_manifest->>'source_file',
    (p_manifest->>'total_items')::int,
    'active',
    p_user_id,
    COALESCE(
      (SELECT array_agg(elem::text) FROM jsonb_array_elements_text(p_manifest->'source_images') AS elem),
      '{}'::text[]
    )
  )
  RETURNING id INTO v_manifest_id;

  -- 遍歷 jsonb 陣列插入 drug_items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO drug_items (
      manifest_id,
      page_number,
      item_order,
      barcode,
      product_code,
      name,
      expected_quantity,
      warehouse_quantity,
      bonus_quantity,
      storage_location,
      category,
      counted_status,
      actual_quantity
    ) VALUES (
      v_manifest_id,
      (v_item->>'page_number')::int,
      (v_item->>'item_order')::int,
      v_item->>'barcode',
      NULLIF(v_item->>'product_code', ''),
      v_item->>'name',
      (v_item->>'expected_quantity')::int,
      CASE 
        WHEN v_item ? 'warehouse_quantity' AND v_item->>'warehouse_quantity' <> '' 
        THEN (v_item->>'warehouse_quantity')::int 
        ELSE NULL 
      END,
      0,
      COALESCE(v_item->>'storage_location', ''),
      COALESCE(v_item->>'category', ''),
      'pending',
      0
    );
  END LOOP;

  RETURN v_manifest_id;
END;
$$;

-- 權限：允許 authenticated 角色呼叫
GRANT EXECUTE ON FUNCTION create_manifest_with_items(jsonb, jsonb, uuid) TO authenticated;