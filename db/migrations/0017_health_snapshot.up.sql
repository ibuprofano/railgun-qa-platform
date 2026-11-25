-- One recorded Health Score per project per UTC day (ADR 0024; overview-charts design.md
-- decision 4). Written once by the worker's health_snapshot task, never overwritten; a
-- project purge removes its rows through the FK. Run as railgun_migrator.

CREATE TABLE health_snapshot (
    workspace_id  uuid NOT NULL,
    project_id    uuid NOT NULL,
    day           date NOT NULL,
    -- Null, with a null band, for a project that had no completed run yet.
    score         integer CHECK (score BETWEEN 0 AND 100),
    band          text CHECK (band IN ('Healthy', 'AtRisk', 'Critical')),
    pass_rate     integer NOT NULL,
    coverage      integer NOT NULL,
    bug_pressure  integer NOT NULL,
    freshness     integer NOT NULL,
    recorded_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, day),
    CHECK ((score IS NULL) = (band IS NULL)),
    FOREIGN KEY (project_id, workspace_id) REFERENCES project(id, workspace_id) ON DELETE CASCADE
);

ALTER TABLE health_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_snapshot FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON health_snapshot
    USING (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = nullif(current_setting('app.workspace_id', true), '')::uuid);

-- The API reads history; only the worker records it.
GRANT SELECT ON health_snapshot TO railgun_app;
GRANT SELECT, INSERT ON health_snapshot TO railgun_worker;
-- The snapshot computes the score itself, which needs the runs.
GRANT SELECT ON test_run TO railgun_worker;
