-- Reverses 0018_test_case_edit_times.up.sql. Edit times are lost; the up migration
-- rebuilds them from the activity log.

ALTER TABLE test_case DROP COLUMN IF EXISTS script_updated_at;
ALTER TABLE test_case DROP COLUMN IF EXISTS updated_at;
