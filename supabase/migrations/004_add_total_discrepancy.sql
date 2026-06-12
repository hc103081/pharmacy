-- Migration to add total_discrepancy for final report
-- Created: 2026-06-12

ALTER TABLE manifests ADD COLUMN total_discrepancy INTEGER DEFAULT 0;
