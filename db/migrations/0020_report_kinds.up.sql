-- A second report kind (executions-dashboard-report design.md decision 3): the Executions
-- dashboard PDF. Its worker builder reads the execution dashboard's rows, whose queries
-- count earlier attempts and read test case tags. Run as railgun_migrator.

ALTER TABLE report DROP CONSTRAINT report_kind_check;
ALTER TABLE report ADD CONSTRAINT report_kind_check CHECK (kind IN ('bugs_dashboard', 'executions_dashboard'));

GRANT SELECT ON test_run_attempt, test_case_tag TO railgun_worker;
