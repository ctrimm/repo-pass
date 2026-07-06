-- Migration: Add payment provider support and update user schema
-- No-op: this migration duplicated schema changes already applied in
-- 0002_violet_butterfly.sql (column rename, role/pricing_type enum
-- updates, payment provider columns). Kept as a no-op to preserve the
-- migration sequence/journal.
SELECT 1;
