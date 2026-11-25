import { type Health, health, pct } from './health';

/**
 * The one counting query behind every Health Score (ADR 0024; overview-charts design.md
 * decision 3): the API's live score, the worker's daily snapshot and each recomputed past
 * day all run this same SQL, so the definitions can't drift.
 *
 * Parameters (positional, accepted as written by both Prisma's $queryRawUnsafe and pg):
 * - $1: the project id
 * - $2: timestamptz[] of as-of instants, oldest first; NULL means a single "now"
 *
 * Returns one row per instant, in the same order. For each instant t:
 * - test cases: created by t and not in the Trash; Ready by their current status (test
 *   case status has no history, ADR 0024 decision 2)
 * - completed runs (Pass, Fail, Needs Review) of executions not in the Trash, counted by
 *   when their current outcome was recorded; earlier attempts are never read
 * - bugs: not in the Trash, reported by t, and not yet resolved at t
 *
 * Items in the Trash today are excluded from past instants too: trashed items are hidden
 * from every dashboard (PRD §2.11).
 */
export const AS_OF_COUNTS_SQL = `
SELECT a.ord::int AS ord, a.t AS as_of,
  c.total, c.ready, c.covered, c.fresh,
  r.completed_ever, r.recent, r.recent_pass,
  b.open_total, b.open_critical, b.open_high, b.open_medium
FROM unnest(COALESCE($2::timestamptz[], ARRAY[now()])) WITH ORDINALITY AS a(t, ord)
CROSS JOIN LATERAL (
  SELECT count(*)::int AS total,
    count(*) FILTER (WHERE tc.status = 'Ready')::int AS ready,
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM test_run tr JOIN test_execution te ON te.id = tr.execution_id
      WHERE tr.test_case_id = tc.id AND te.deleted_at IS NULL
        AND tr.outcome IN ('Pass', 'Fail', 'NeedsReview') AND tr.outcome_updated_at <= a.t))::int AS covered,
    count(*) FILTER (WHERE tc.status = 'Ready' AND EXISTS (
      SELECT 1 FROM test_run tr JOIN test_execution te ON te.id = tr.execution_id
      WHERE tr.test_case_id = tc.id AND te.deleted_at IS NULL
        AND tr.outcome IN ('Pass', 'Fail', 'NeedsReview')
        AND tr.outcome_updated_at <= a.t AND tr.outcome_updated_at > a.t - interval '14 days'))::int AS fresh
  FROM test_case tc
  WHERE tc.project_id = $1::uuid AND tc.deleted_at IS NULL AND tc.created_at <= a.t
) c
CROSS JOIN LATERAL (
  SELECT count(*)::int AS completed_ever,
    count(*) FILTER (WHERE tr.outcome_updated_at > a.t - interval '30 days')::int AS recent,
    count(*) FILTER (WHERE tr.outcome_updated_at > a.t - interval '30 days' AND tr.outcome = 'Pass')::int AS recent_pass
  FROM test_run tr JOIN test_execution te ON te.id = tr.execution_id
  WHERE te.project_id = $1::uuid AND te.deleted_at IS NULL
    AND tr.outcome IN ('Pass', 'Fail', 'NeedsReview') AND tr.outcome_updated_at <= a.t
) r
CROSS JOIN LATERAL (
  SELECT count(*)::int AS open_total,
    count(*) FILTER (WHERE bg.severity = 'Critical')::int AS open_critical,
    count(*) FILTER (WHERE bg.severity = 'High')::int AS open_high,
    count(*) FILTER (WHERE bg.severity = 'Medium')::int AS open_medium
  FROM bug bg
  WHERE bg.project_id = $1::uuid AND bg.deleted_at IS NULL
    AND bg.created_at <= a.t AND (bg.resolved_at IS NULL OR bg.resolved_at > a.t)
) b
ORDER BY a.ord
`;

/** One row of AS_OF_COUNTS_SQL. */
export interface AsOfCountsRow {
  ord: number;
  as_of: Date;
  total: number;
  ready: number;
  covered: number;
  fresh: number;
  completed_ever: number;
  recent: number;
  recent_pass: number;
  open_total: number;
  open_critical: number;
  open_high: number;
  open_medium: number;
}

export interface AsOfFigures {
  testCases: { total: number; readyPct: number; coveragePct: number };
  /** Null with no runs completed in the 30 days before the instant. */
  passRate: number | null;
  openBugs: number;
  criticalBugs: number;
  health: Health;
}

/** The figures one counting row stands for, with the shared formulas (specs/project-metrics). */
export function figuresFromCounts(row: AsOfCountsRow): AsOfFigures {
  const passRate = row.recent > 0 ? pct(row.recent_pass, row.recent) : null;
  const coveragePct = pct(row.covered, row.total);
  return {
    testCases: { total: row.total, readyPct: pct(row.ready, row.total), coveragePct },
    passRate,
    openBugs: row.open_total,
    criticalBugs: row.open_critical,
    health: health({
      hasCompletedRun: row.completed_ever > 0,
      passRate,
      coverage: coveragePct,
      openBugs: { critical: row.open_critical, high: row.open_high, medium: row.open_medium },
      freshness: pct(row.fresh, row.ready),
    }),
  };
}
