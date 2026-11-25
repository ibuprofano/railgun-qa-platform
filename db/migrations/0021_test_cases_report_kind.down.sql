-- Reverses 0021_test_cases_report_kind.up.sql. Fails while any test_cases_dashboard report
-- exists: delete those first (they are per-request and expire within 7 days anyway).

ALTER TABLE report DROP CONSTRAINT report_kind_check;
ALTER TABLE report ADD CONSTRAINT report_kind_check CHECK (kind IN ('bugs_dashboard', 'executions_dashboard'));
