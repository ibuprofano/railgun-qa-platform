-- Reports (ADR 0006, ADR 0027; report-pipeline design.md decision 1): one row per request,
-- its file beside it in report_file until object storage exists (E3). A report belongs to
-- its requester and expires after 7 days; the daily trash_purge deletes expired rows and
-- their files go by cascade. Run as railgun_migrator.

CREATE TABLE report (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  uuid NOT NULL,
    project_id    uuid NOT NULL,
    requested_by  uuid NOT NULL REFERENCES "user"(id),
    kind          text NOT NULL CHECK (kind IN ('bugs_dashboard')),
    -- { tz, range }: the viewer's zone and the range selected on screen.
    options       jsonb NOT NULL,
    status        text NOT NULL DEFAULT 'Queued' CHECK (status IN ('Queued', 'Generating', 'Ready', 'Failed')),
    error         text,
    file_name     text,
    byte_size     integer,
    created_at    timestamptz NOT NULL DEFAULT now(),
    completed_at  timestamptz,
    expires_at    timestamptz NOT NULL DEFAULT now() + interval '7 days',
    CHECK ((status = 'Ready') = (file_name IS NOT NULL)),
    UNIQUE (id, workspace_id),
    FOREIGN KEY (project_id, workspace_id) REFERENCES project(id, workspace_id) ON DELETE CASCADE
);
CREATE INDEX report_expires_at_idx ON report (expires_at);

-- The bytes, apart from the status row so reads of the status never touch them. Only the
-- ReportStore adapters use this table (ADR 0027).
CREATE TABLE report_file (
    report_id     uuid PRIMARY KEY,
    workspace_id  uuid NOT NULL,
    content       bytea NOT NULL,
    FOREIGN KEY (report_id, workspace_id) REFERENCES report(id, workspace_id) ON DELETE CASCADE
);

ALTER TABLE report ENABLE ROW LEVEL SECURITY;
ALTER TABLE report FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON report
    USING (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);

ALTER TABLE report_file ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_file FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON report_file
    USING (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);

-- The API requests and reads reports and serves files; the worker generates, stores and
-- expires them, reading the Bugs dashboard's rows (bug is already granted by 0014).
GRANT SELECT, INSERT ON report TO railgun_app;
GRANT SELECT ON report_file TO railgun_app;
GRANT SELECT, UPDATE, DELETE ON report TO railgun_worker;
GRANT INSERT ON report_file TO railgun_worker;
GRANT SELECT ON tag, bug_tag TO railgun_worker;

-- The allow-list gains report_generate: 3 attempts in all, and one job per report (the job
-- key), so a repeated enqueue never queues it twice. Other tasks keep Graphile's defaults.
CREATE OR REPLACE FUNCTION public.enqueue_job(task text, payload jsonb DEFAULT '{}', run_at timestamptz DEFAULT now())
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  job_id bigint;
BEGIN
  IF NOT (task = ANY (ARRAY['trash_purge', 'report_generate'])) THEN
    RAISE EXCEPTION 'unknown job task: %', task USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF task = 'report_generate' THEN
    IF payload->>'reportId' IS NULL THEN
      RAISE EXCEPTION 'report_generate needs a reportId' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    SELECT (graphile_worker.add_job(task, payload::json, run_at => run_at, max_attempts => 3,
                                    job_key => 'report:' || (payload->>'reportId'), job_key_mode => 'preserve_run_at')).id
      INTO job_id;
  ELSE
    SELECT (graphile_worker.add_job(task, payload::json, run_at => run_at)).id INTO job_id;
  END IF;
  RETURN job_id;
END
$$;
