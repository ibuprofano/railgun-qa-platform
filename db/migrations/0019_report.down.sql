-- Reverses 0019_report.up.sql: restores 0014's enqueue_job body and drops the report tables.

CREATE OR REPLACE FUNCTION public.enqueue_job(task text, payload jsonb DEFAULT '{}', run_at timestamptz DEFAULT now())
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  job_id bigint;
BEGIN
  IF NOT (task = ANY (ARRAY['trash_purge'])) THEN
    RAISE EXCEPTION 'unknown job task: %', task USING ERRCODE = 'invalid_parameter_value';
  END IF;
  SELECT (graphile_worker.add_job(task, payload::json, run_at => run_at)).id INTO job_id;
  RETURN job_id;
END
$$;

REVOKE SELECT ON tag, bug_tag FROM railgun_worker;
DROP TABLE IF EXISTS report_file;
DROP TABLE IF EXISTS report;
