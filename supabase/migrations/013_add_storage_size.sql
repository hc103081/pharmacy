-- Migration: Add storage_size_bytes to manifests
-- Created: 2026-06-21

-- 1. 新增儲存用量追蹤欄位
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS storage_size_bytes BIGINT DEFAULT 0;

COMMENT ON COLUMN manifests.storage_size_bytes
  IS '清單儲存用量（bytes）。Active 時為 drug-photos 總大小，Archived 時為 ZIP 大小';

-- 2. 建立 RPC：遞增 storage_size_bytes（原子操作，防併發）
CREATE OR REPLACE FUNCTION increment_manifest_storage_size(
  p_manifest_id UUID,
  p_delta BIGINT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE manifests
  SET storage_size_bytes = storage_size_bytes + p_delta
  WHERE id = p_manifest_id;
END;
$$;

-- 3. 建立 RPC：遞減 storage_size_bytes（原子操作，下限不低於 0）
CREATE OR REPLACE FUNCTION decrement_manifest_storage_size(
  p_manifest_id UUID,
  p_delta BIGINT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE manifests
  SET storage_size_bytes = GREATEST(storage_size_bytes - p_delta, 0)
  WHERE id = p_manifest_id;
END;
$$;
