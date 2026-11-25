-- A bug records when it was resolved (PRD §2.9, overview-dashboard design.md decision 6):
-- the moment it entered Resolved, Closed or Won't Fix, kept while it moves between
-- those, cleared when it goes back to Open or In Progress. Run as railgun_migrator.

ALTER TABLE bug ADD COLUMN resolved_at timestamptz;

-- Backfill existing resolved bugs from their status history. FORCE RLS applies even to
-- this owner role and a migration has no tenant context, so lift it for the backfill
-- only and restore it (same transaction; the 0010_folder pattern).
ALTER TABLE bug NO FORCE ROW LEVEL SECURITY;
ALTER TABLE activity_entries NO FORCE ROW LEVEL SECURITY;

-- backfill:begin (test/bug-resolved-at-backfill.e2e-spec.ts runs this statement)
-- The newest logged transition INTO the resolved set; else the bug's last update.
UPDATE bug b
SET resolved_at = COALESCE(
    (SELECT max(a.created_at)
     FROM activity_entries a
     WHERE a.workspace_id = b.workspace_id
       AND a.entity_type = 'bug' AND a.entity_id = b.id AND a.action_code = 'bug.updated'
       AND a.details -> 'changes' -> 'status' ->> 'to' IN ('Resolved', 'Closed', 'WontFix')
       AND COALESCE(a.details -> 'changes' -> 'status' ->> 'from', '') NOT IN ('Resolved', 'Closed', 'WontFix')),
    b.updated_at)
WHERE b.status IN ('Resolved', 'Closed', 'WontFix');
-- backfill:end

ALTER TABLE activity_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE bug FORCE ROW LEVEL SECURITY;

-- Every writer (API, seed, a future job) must keep the date and the status in step.
ALTER TABLE bug ADD CONSTRAINT bug_resolved_at_matches_status
    CHECK ((status IN ('Resolved', 'Closed', 'WontFix')) = (resolved_at IS NOT NULL));
