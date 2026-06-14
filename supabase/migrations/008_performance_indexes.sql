-- Migration: Performance optimization indexes
-- Created: 2026-06-14

-- 1. Enable pg_trgm extension for ILIKE '%keyword%' acceleration
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. drug_items: composite index for status-based counting queries
-- Covers: .eq('manifest_id', ...).eq('counted_status', 'completed'|'error')
CREATE INDEX IF NOT EXISTS idx_drug_items_manifest_status
  ON drug_items(manifest_id, counted_status);

-- 3. drug_items: composite index for page listing with order
-- Covers: .eq('manifest_id', ...).eq('page_number', ...).order('item_order')
CREATE INDEX IF NOT EXISTS idx_drug_items_manifest_page_order
  ON drug_items(manifest_id, page_number, item_order);

-- 4. drug_items: GIN index for ILIKE '%keyword%' on barcode
-- Allows barcode fuzzy search to use index instead of sequential scan
CREATE INDEX IF NOT EXISTS idx_drug_items_barcode_trgm
  ON drug_items USING gin (barcode gin_trgm_ops);

-- 5. drug_items: GIN index for ILIKE '%keyword%' on name
-- Allows name fuzzy search to use index instead of sequential scan
CREATE INDEX IF NOT EXISTS idx_drug_items_name_trgm
  ON drug_items USING gin (name gin_trgm_ops);

-- 6. manifests: composite index for user's active manifests query
-- Covers: .eq('user_id', ...).eq('status', 'active')
CREATE INDEX IF NOT EXISTS idx_manifests_user_id_status
  ON manifests(user_id, status);
