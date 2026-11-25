-- A third report kind (test-cases-dashboard-report design.md decision 3): the Test Cases
-- dashboard PDF. Its worker builder reads test_case, test_run, test_execution,
-- test_run_attempt, test_case_tag, tag and folder, all already granted to railgun_worker
-- (0014, 0017, 0019, 0020), so only the kind check changes. Run as railgun_migrator.

ALTER TABLE report DROP CONSTRAINT report_kind_check;
ALTER TABLE report ADD CONSTRAINT report_kind_check CHECK (kind IN ('bugs_dashboard', 'executions_dashboard', 'test_cases_dashboard'));
