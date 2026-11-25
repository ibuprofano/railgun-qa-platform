-- Reverses 0020_report_kinds.up.sql. Fails while any executions_dashboard report exists:
-- delete those first (they are per-request and expire within 7 days anyway).

REVOKE SELECT ON test_run_attempt, test_case_tag FROM railgun_worker;
ALTER TABLE report DROP CONSTRAINT report_kind_check;
ALTER TABLE report ADD CONSTRAINT report_kind_check CHECK (kind IN ('bugs_dashboard'));
