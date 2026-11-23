-- Try Again and attempt history (ADR 0020, OpenSpec change execution-cancel-and-try-again).
-- Restart copies every run into test_run_attempt before resetting it, so earlier results
-- survive; bugs record the attempt they were found in.
-- Run as railgun_migrator. Needs Postgres >= 15 for ON DELETE SET NULL (column).

-- The execution's current attempt; 1 until it is first restarted.
ALTER TABLE test_execution
  ADD COLUMN attempt integer NOT NULL DEFAULT 1 CHECK (attempt > 0);

-- Who set the outcome, by name: user rows are only readable by their owner under RLS
-- (ADR 0013 decision 6), and attempt history must say who set each result.
ALTER TABLE test_run ADD COLUMN outcome_updated_by_name text;

-- One row per run per ended attempt. It belongs to the execution: the run link is cleared,
-- not cascaded, so a run dropped by Restart keeps its history (ADR 0020 decision 4).
CREATE TABLE test_run_attempt (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id             uuid NOT NULL,
    execution_id             uuid NOT NULL,
    test_run_id              uuid,
    test_case_id             uuid,
    attempt                  integer NOT NULL CHECK (attempt > 0),
    position                 integer NOT NULL CHECK (position > 0),
    outcome                  text NOT NULL
                             CHECK (outcome IN ('Pending', 'Pass', 'Fail', 'NeedsReview')),
    outcome_updated_at       timestamptz,
    outcome_updated_by_name  text,
    test_case_name_snapshot  text,
    gherkin_script_snapshot  text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    UNIQUE (test_run_id, attempt),
    FOREIGN KEY (execution_id, workspace_id) REFERENCES test_execution(id, workspace_id) ON DELETE CASCADE,
    FOREIGN KEY (test_run_id, workspace_id) REFERENCES test_run(id, workspace_id) ON DELETE SET NULL (test_run_id),
    FOREIGN KEY (test_case_id, workspace_id) REFERENCES test_case(id, workspace_id) ON DELETE SET NULL (test_case_id)
);

CREATE INDEX test_run_attempt_execution_idx ON test_run_attempt (execution_id, attempt);
CREATE INDEX test_run_attempt_test_case_idx ON test_run_attempt (test_case_id);

ALTER TABLE test_run_attempt ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_run_attempt FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON test_run_attempt
  USING      (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);

-- Attempts are history: written once, never edited. Purges remove them through the cascade.
GRANT SELECT, INSERT ON test_run_attempt TO railgun_app;

-- The attempt a bug was found in; null for a bug never tied to a run. Kept when a Restart
-- drops the run (the run link is cleared, the attempt is not).
ALTER TABLE bug ADD COLUMN attempt integer CHECK (attempt > 0);
-- FORCE RLS applies even to this owner role and a migration has no tenant context, so
-- lift it for the cross-tenant backfill only, then restore it (same pattern as 0010).
ALTER TABLE bug NO FORCE ROW LEVEL SECURITY;
UPDATE bug SET attempt = 1 WHERE test_run_id IS NOT NULL;
ALTER TABLE bug FORCE ROW LEVEL SECURITY;
ALTER TABLE bug ADD CONSTRAINT bug_run_has_attempt CHECK (test_run_id IS NULL OR attempt IS NOT NULL);

-- At most one auto-created bug per run per attempt (ADR 0020 decision 6, amending ADR 0013).
DROP INDEX bug_one_auto_per_run_idx;
CREATE UNIQUE INDEX bug_one_auto_per_run_attempt_idx ON bug (test_run_id, attempt)
  WHERE auto_created AND deleted_at IS NULL;
