-- 009_atomic_status_update.sql
CREATE OR REPLACE FUNCTION update_drug_status_with_photo(
    p_drug_id UUID,
    p_photo_url TEXT,
    p_actual_quantity INT,
    p_user_id UUID
)
RETURNS TABLE (
    id UUID,
    barcode TEXT,
    name TEXT,
    counted_status TEXT,
    actual_quantity INT,
    photo_url TEXT
) 
LANGUAGE plpgsql
AS $$
DECLARE
    v_expected_quantity INT;
    v_status TEXT;
BEGIN
    -- 1. 獲取預期數量並檢查權限 (使用 join 確保該藥品屬於該使用者的清單)
    SELECT d.expected_quantity INTO v_expected_quantity
    FROM drug_items d
    JOIN manifests m ON d.manifest_id = m.id
    WHERE d.id = p_drug_id AND m.user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Permission denied or drug item not found.';
    END IF;

    -- 2. 計算狀態
    IF p_actual_quantity = v_expected_quantity THEN
        v_status := 'completed';
    ELSE
        v_status := 'error';
    END IF;

    -- 3. 更新資料庫並返回結果
    RETURN QUERY
    UPDATE drug_items
    SET 
        counted_status = v_status,
        photo_url = p_photo_url,
        actual_quantity = p_actual_quantity,
        updated_at = NOW()
    WHERE id = p_drug_id
    RETURNING 
        drug_items.id, 
        drug_items.barcode, 
        drug_items.name, 
        drug_items.counted_status, 
        drug_items.actual_quantity,
        drug_items.photo_url;
END;
$$;
