-- Reverses 0016_bug_resolved_at.up.sql. Resolution dates are lost; the up migration
-- rebuilds them from the activity log.

ALTER TABLE bug DROP CONSTRAINT IF EXISTS bug_resolved_at_matches_status;
ALTER TABLE bug DROP COLUMN IF EXISTS resolved_at;
