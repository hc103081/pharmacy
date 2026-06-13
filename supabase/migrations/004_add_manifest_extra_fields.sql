-- Migration: Add extra manifest fields (source_images, total_discrepancy)
-- Merged from 004_add_source_images + 004_add_total_discrepancy to resolve duplicate migration numbering
-- Created: 2026-06-12

ALTER TABLE manifests ADD COLUMN IF NOT EXISTS source_images TEXT[];
ALTER TABLE manifests ADD COLUMN IF NOT EXISTS total_discrepancy INTEGER DEFAULT 0;