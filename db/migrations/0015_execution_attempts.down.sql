-- Reverses 0015_execution_attempts.up.sql. Attempt history and bugs' attempt numbers are
-- lost. Recreating the one-auto-bug-per-run index fails if a run already has auto-created
-- bugs from two attempts; delete or un-flag the extra ones first.

DROP INDEX IF EXISTS bug_one_auto_per_run_attempt_idx;
CREATE UNIQUE INDEX bug_one_auto_per_run_idx ON bug (test_run_id) WHERE auto_created AND deleted_at IS NULL;
ALTER TABLE bug DROP CONSTRAINT IF EXISTS bug_run_has_attempt;
ALTER TABLE bug DROP COLUMN IF EXISTS attempt;

DROP TABLE IF EXISTS test_run_attempt;

ALTER TABLE test_run DROP COLUMN IF EXISTS outcome_updated_by_name;
ALTER TABLE test_execution DROP COLUMN IF EXISTS attempt;
