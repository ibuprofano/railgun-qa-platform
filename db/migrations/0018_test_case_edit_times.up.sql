-- A test case records when it last changed and when its script was last edited (ADR 0025,
-- test-cases-dashboard design.md decision 1). Run as railgun_migrator.
--   updated_at        the last change to its name, script, status or tags, or a move;
--                     it starts at creation
--   script_updated_at the last edit of its Gherkin script; null if never edited after creation

ALTER TABLE test_case ADD COLUMN updated_at timestamptz;
ALTER TABLE test_case ADD COLUMN script_updated_at timestamptz;

-- Backfill existing rows from their activity entries. FORCE RLS applies even to this
-- owner role and a migration has no tenant context, so lift it for the backfill only
-- and restore it (same transaction; the 0010_folder / 0016 pattern).
ALTER TABLE test_case NO FORCE ROW LEVEL SECURITY;
ALTER TABLE activity_entries NO FORCE ROW LEVEL SECURITY;

-- backfill:begin (test/test-case-edit-times-backfill.e2e-spec.ts runs this statement)
-- The latest logged update or move, else creation; the latest logged script change, else none.
UPDATE test_case tc
SET updated_at = COALESCE(
      (SELECT max(a.created_at)
       FROM activity_entries a
       WHERE a.workspace_id = tc.workspace_id
         AND a.entity_type = 'test_case' AND a.entity_id = tc.id
         AND a.action_code IN ('test_case.updated', 'test_case.moved')),
      tc.created_at),
    script_updated_at = (
      SELECT max(a.created_at)
      FROM activity_entries a
      WHERE a.workspace_id = tc.workspace_id
        AND a.entity_type = 'test_case' AND a.entity_id = tc.id
        AND a.action_code = 'test_case.updated'
        AND a.details -> 'changes' ? 'gherkinScript');
-- backfill:end

ALTER TABLE activity_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE test_case FORCE ROW LEVEL SECURITY;

-- New rows: both defaults are now(), the same instant within the creating transaction.
ALTER TABLE test_case ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE test_case ALTER COLUMN updated_at SET NOT NULL;
