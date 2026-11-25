import { pct } from './health';

/**
 * Test case health (ADR 0025; specs/test-case-health): the rules behind the detail's
 * banners and the Test Cases dashboard's issues, written once. SQL only reads each test
 * case's run facts; the rules below are pure.
 */

/** PRD §6.12.3 thresholds. Dormant and Degrading are meant to become project settings. */
export const DORMANT_DAYS = 14;
export const TREND_WINDOW = 5;
export const TREND_MIN_RUNS = 2 * TREND_WINDOW;
export const TREND_DELTA_PCT = 20;
/** Completed runs a test case needs to be ranked as failing (Overview and dashboard). */
export const MIN_RUNS_TO_RANK = 3;

export type HealthFlag = 'NoScript' | 'Orphan' | 'NeverRun' | 'Dormant' | 'Degrading' | 'Improving' | 'TrendReset';

/** Every flag, in the order they are reported. */
export const HEALTH_FLAGS: readonly HealthFlag[] = ['NoScript', 'Orphan', 'NeverRun', 'Dormant', 'Degrading', 'Improving', 'TrendReset'];

/** The flags the dashboard counts as issues (PRD §6.12.1); Improving and Trend Reset aren't. */
export const ISSUE_FLAGS = ['NoScript', 'Orphan', 'NeverRun', 'Dormant', 'Degrading'] as const;
export type IssueFlag = (typeof ISSUE_FLAGS)[number];

export function isIssueFlag(flag: HealthFlag): flag is IssueFlag {
  return (ISSUE_FLAGS as readonly HealthFlag[]).includes(flag);
}

/**
 * Each live test case's run facts. Parameters (positional, accepted as written by both
 * Prisma's $queryRawUnsafe and pg):
 * - $1: the project id
 * - $2: one test case id, or NULL for every live test case of the project
 *
 * Runs counted: those of executions not in the Trash, by their current outcome; earlier
 * attempts (test_run_attempt) are never read. A run is completed when its outcome is
 * Pass, Fail or Needs Review, at the moment that outcome was recorded. "Since the edit"
 * means completed after `script_updated_at`, or ever when the script was never edited.
 */
export const TEST_CASE_FACTS_SQL = `
SELECT tc.id,
  (tc.gherkin_script IS NOT NULL AND tc.gherkin_script <> '') AS has_script,
  tc.script_updated_at,
  f.run_count, f.completed_count, f.last_completed_at, f.completed_before_edit, f.completed_since_edit,
  COALESCE(t.outcomes, '{}'::text[]) AS trend_outcomes,
  now() AS as_of
FROM test_case tc
CROSS JOIN LATERAL (
  SELECT count(*)::int AS run_count,
    count(*) FILTER (WHERE tr.outcome IN ('Pass', 'Fail', 'NeedsReview'))::int AS completed_count,
    max(tr.outcome_updated_at) FILTER (WHERE tr.outcome IN ('Pass', 'Fail', 'NeedsReview')) AS last_completed_at,
    COALESCE(bool_or(tr.outcome IN ('Pass', 'Fail', 'NeedsReview') AND tr.outcome_updated_at < tc.script_updated_at), false)
      AS completed_before_edit,
    count(*) FILTER (WHERE tr.outcome IN ('Pass', 'Fail', 'NeedsReview')
      AND (tc.script_updated_at IS NULL OR tr.outcome_updated_at > tc.script_updated_at))::int AS completed_since_edit
  FROM test_run tr JOIN test_execution te ON te.id = tr.execution_id
  WHERE tr.test_case_id = tc.id AND te.deleted_at IS NULL
) f
CROSS JOIN LATERAL (
  SELECT array_agg(x.outcome ORDER BY x.at DESC, x.id) AS outcomes
  FROM (
    SELECT tr.outcome, tr.outcome_updated_at AS at, tr.id
    FROM test_run tr JOIN test_execution te ON te.id = tr.execution_id
    WHERE tr.test_case_id = tc.id AND te.deleted_at IS NULL
      AND tr.outcome IN ('Pass', 'Fail', 'NeedsReview')
      AND (tc.script_updated_at IS NULL OR tr.outcome_updated_at > tc.script_updated_at)
    ORDER BY tr.outcome_updated_at DESC, tr.id
    LIMIT ${TREND_MIN_RUNS}
  ) x
) t
WHERE tc.project_id = $1::uuid AND tc.deleted_at IS NULL AND ($2::uuid IS NULL OR tc.id = $2::uuid)
ORDER BY tc.id
`;

/** One row of TEST_CASE_FACTS_SQL. */
export interface TestCaseFactsRow {
  id: string;
  has_script: boolean;
  script_updated_at: Date | null;
  /** Runs in live executions, any outcome. */
  run_count: number;
  completed_count: number;
  last_completed_at: Date | null;
  completed_before_edit: boolean;
  completed_since_edit: number;
  /** Up to 10 completed outcomes since the edit, newest first. */
  trend_outcomes: string[];
  /** The database clock. */
  as_of: Date;
}

export interface TestCaseHealth {
  flags: HealthFlag[];
  /** The two 5-run pass rates, when Degrading and Improving were evaluated. */
  trend: { recentPassPct: number; previousPassPct: number } | null;
  /** When its latest completed run was recorded; null with none. */
  lastCompletedAt: string | null;
  /** The instant the rules were evaluated at (the database clock). */
  asOf: string;
}

const DAY_MS = 86_400_000;

/** The health flags of one test case (ADR 0025 decision 2). */
export function testCaseHealth(facts: TestCaseFactsRow): TestCaseHealth {
  const flags = new Set<HealthFlag>();
  if (!facts.has_script) flags.add('NoScript');
  if (facts.run_count === 0) flags.add('Orphan');
  else if (facts.completed_count === 0) flags.add('NeverRun');
  if (facts.last_completed_at && facts.as_of.getTime() - facts.last_completed_at.getTime() > DORMANT_DAYS * DAY_MS) {
    flags.add('Dormant');
  }

  const trendReset = facts.script_updated_at !== null && facts.completed_before_edit && facts.completed_since_edit < TREND_MIN_RUNS;
  let trend: TestCaseHealth['trend'] = null;
  if (trendReset) {
    flags.add('TrendReset');
  } else if (facts.trend_outcomes.length >= TREND_MIN_RUNS) {
    const passes = (outcomes: string[]) => outcomes.filter((o) => o === 'Pass').length;
    const recent = passes(facts.trend_outcomes.slice(0, TREND_WINDOW));
    const previous = passes(facts.trend_outcomes.slice(TREND_WINDOW, TREND_MIN_RUNS));
    trend = { recentPassPct: pct(recent, TREND_WINDOW), previousPassPct: pct(previous, TREND_WINDOW) };
    // Compared on exact counts, so rounding can't move a case across the threshold.
    const delta = (100 * (recent - previous)) / TREND_WINDOW;
    if (delta <= -TREND_DELTA_PCT) flags.add('Degrading');
    if (delta >= TREND_DELTA_PCT) flags.add('Improving');
  }

  return {
    flags: HEALTH_FLAGS.filter((flag) => flags.has(flag)),
    trend,
    lastCompletedAt: facts.last_completed_at?.toISOString() ?? null,
    asOf: facts.as_of.toISOString(),
  };
}
