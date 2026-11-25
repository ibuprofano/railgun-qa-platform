import { DASHBOARD_DAYS, type CompletedOutcome } from './execution-dashboard';
import { pct } from './health';
import {
  ISSUE_FLAGS,
  type IssueFlag,
  isIssueFlag,
  MIN_RUNS_TO_RANK,
  type TestCaseFactsRow,
  testCaseHealth,
} from './test-case-health';

/**
 * The Test Cases dashboard (PRD §6.2.4; specs/test-case-metrics), written once for the
 * screen and for Phase 10's PDF (test-cases-dashboard-report design.md decision 1): the
 * queries that read its rows, and the pure figures built on them.
 *
 * What counts:
 * - test-case figures (tiles, splits, Needs Attention, rankings, Folder Health): live test
 *   cases, and runs of live executions by their current outcome
 * - daily run series: every run of a live execution, including runs of a test case now
 *   in the Trash, so this Pass Rate Trend agrees with the Overview's (PRD §2.11)
 * - the issues: the shared health rules in ./test-case-health, as on the detail
 *
 * Every query takes the project id as $1; the days query also takes the time zone as $2,
 * already checked against pg_timezone_names. Parameters are positional, so Prisma's
 * $queryRawUnsafe and pg run them as written.
 */

/** How many rows each ranking shows (PRD §6.2.4). */
export const RANKING_LIMIT = 10;
const COMPLETED = `tr.outcome IN ('Pass', 'Fail', 'NeedsReview')`;

export type TestCaseStatus = 'Draft' | 'Ready' | 'Deprecated';

// ---------------------------------------------------------------------------------------
// Rows: the queries and their shapes
// ---------------------------------------------------------------------------------------

/** Live test cases with their tags and their latest completed outcome in a live execution. */
export const TEST_CASE_DASHBOARD_CASES_SQL = `
  SELECT tc.id, tc.name, tc.status, tc.folder_id, tc.created_at, tc.updated_at,
    (tc.gherkin_script IS NOT NULL AND tc.gherkin_script <> '') AS has_script,
    COALESCE((SELECT array_agg(tt.tag_id ORDER BY tt.tag_id) FROM test_case_tag tt WHERE tt.test_case_id = tc.id), '{}') AS tag_ids,
    last.outcome AS last_outcome
  FROM test_case tc
  LEFT JOIN LATERAL (
    SELECT tr.outcome FROM test_run tr JOIN test_execution te ON te.id = tr.execution_id
    WHERE tr.test_case_id = tc.id AND te.deleted_at IS NULL AND ${COMPLETED}
    ORDER BY tr.outcome_updated_at DESC, tr.id
    LIMIT 1
  ) last ON true
  WHERE tc.project_id = $1::uuid AND tc.deleted_at IS NULL
`;

/** Completed, failed and flaky runs per live test case. A flaky run: completed as Pass now, with an earlier attempt that recorded Fail or Needs Review. */
export const TEST_CASE_DASHBOARD_STATS_SQL = `
  SELECT tr.test_case_id AS id, count(*)::int AS completed,
    count(*) FILTER (WHERE tr.outcome = 'Fail')::int AS failed,
    count(*) FILTER (WHERE tr.outcome = 'Pass' AND EXISTS (
      SELECT 1 FROM test_run_attempt a WHERE a.test_run_id = tr.id AND a.outcome IN ('Fail', 'NeedsReview')))::int AS flaky
  FROM test_run tr
  JOIN test_execution te ON te.id = tr.execution_id
  JOIN test_case tc ON tc.id = tr.test_case_id
  WHERE te.project_id = $1::uuid AND te.deleted_at IS NULL AND tc.deleted_at IS NULL AND ${COMPLETED}
  GROUP BY tr.test_case_id
`;

/** The most used tags on live test cases. */
export const TEST_CASE_DASHBOARD_TAGS_SQL = `
  SELECT t.id, t.name, t.color, count(*)::int AS count
  FROM tag t
  JOIN test_case_tag tt ON tt.tag_id = t.id
  JOIN test_case tc ON tc.id = tt.test_case_id AND tc.deleted_at IS NULL
  WHERE t.project_id = $1::uuid
  GROUP BY t.id, t.name, t.color
  ORDER BY count(*) DESC, t.name, t.id
  LIMIT ${RANKING_LIMIT}
`;

/** Every live folder with its path of names from the root down. */
export const TEST_CASE_DASHBOARD_FOLDERS_SQL = `
  WITH RECURSIVE tree AS (
    SELECT id, ARRAY[name] AS path FROM folder
    WHERE project_id = $1::uuid AND deleted_at IS NULL AND parent_folder_id IS NULL
    UNION ALL
    SELECT f.id, tree.path || f.name FROM folder f JOIN tree ON f.parent_folder_id = tree.id
    WHERE f.deleted_at IS NULL
  )
  SELECT id, path FROM tree
`;

/** One row per day of the last DASHBOARD_DAYS days in the zone, oldest first. */
export const TEST_CASE_DASHBOARD_DAYS_SQL = `
  WITH span AS (
    SELECT (now() AT TIME ZONE $2::text)::date AS today
  ),
  days AS (
    SELECT d::date AS day FROM span, generate_series(span.today - ${DASHBOARD_DAYS - 1}::int, span.today, interval '1 day') AS d
  ),
  created AS (
    SELECT (created_at AT TIME ZONE $2::text)::date AS day, count(*)::int AS n FROM test_case
    WHERE project_id = $1::uuid AND deleted_at IS NULL
      AND created_at > now() - interval '${DASHBOARD_DAYS + 1} days'
    GROUP BY 1
  ),
  added AS (
    SELECT (tr.created_at AT TIME ZONE $2::text)::date AS day, count(*)::int AS n
    FROM test_run tr JOIN test_execution te ON te.id = tr.execution_id
    WHERE te.project_id = $1::uuid AND te.deleted_at IS NULL
      AND tr.created_at > now() - interval '${DASHBOARD_DAYS + 1} days'
    GROUP BY 1
  ),
  completed AS (
    SELECT (tr.outcome_updated_at AT TIME ZONE $2::text)::date AS day,
      count(*)::int AS n, count(*) FILTER (WHERE tr.outcome = 'Pass')::int AS passed
    FROM test_run tr JOIN test_execution te ON te.id = tr.execution_id
    WHERE te.project_id = $1::uuid AND te.deleted_at IS NULL AND ${COMPLETED}
      AND tr.outcome_updated_at > now() - interval '${DASHBOARD_DAYS + 1} days'
    GROUP BY 1
  )
  SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
    COALESCE(created.n, 0) AS created, COALESCE(added.n, 0) AS added,
    COALESCE(completed.n, 0) AS completed, COALESCE(completed.passed, 0) AS passed
  FROM days
  LEFT JOIN created ON created.day = days.day
  LEFT JOIN added ON added.day = days.day
  LEFT JOIN completed ON completed.day = days.day
  ORDER BY days.day
`;

/** Whether any run of a live execution has completed. */
export const TEST_CASE_DASHBOARD_ANY_COMPLETED_SQL = `
  SELECT EXISTS (
    SELECT 1 FROM test_run tr JOIN test_execution te ON te.id = tr.execution_id
    WHERE te.project_id = $1::uuid AND te.deleted_at IS NULL AND ${COMPLETED}
  ) AS any
`;

export interface TestCaseDashboardCaseRow {
  id: string;
  name: string;
  status: TestCaseStatus;
  folder_id: string | null;
  has_script: boolean;
  created_at: Date;
  updated_at: Date;
  tag_ids: string[];
  last_outcome: CompletedOutcome | null;
}

export interface TestCaseDashboardStatsRow {
  id: string;
  completed: number;
  failed: number;
  flaky: number;
}

export interface TestCaseDashboardTagRow {
  id: string;
  name: string;
  color: string;
  count: number;
}

export interface TestCaseDashboardFolderRow {
  id: string;
  path: string[];
}

export interface DashboardDay {
  date: string;
  created: number;
  added: number;
  completed: number;
  passed: number;
}

/** Everything testCaseDashboardFromRows needs, one entry per query. */
export interface TestCaseDashboardRows {
  facts: TestCaseFactsRow[];
  cases: TestCaseDashboardCaseRow[];
  stats: TestCaseDashboardStatsRow[];
  tags: TestCaseDashboardTagRow[];
  folders: TestCaseDashboardFolderRow[];
  days: DashboardDay[];
  anyCompleted: boolean;
}

// ---------------------------------------------------------------------------------------
// The dashboard
// ---------------------------------------------------------------------------------------

export interface TestCaseNeedsAttentionRow {
  id: string;
  name: string;
  tagIds: string[];
  status: TestCaseStatus;
  createdAt: string;
  updatedAt: string;
  issues: IssueFlag[];
}

export interface RankedTestCase {
  id: string;
  name: string;
}

export interface FolderHealthRow {
  folderId: string;
  /** Folder names from the root down. */
  path: string[];
  cases: number;
  withIssues: number;
  issuePct: number;
  breakdown: Partial<Record<IssueFlag, number>>;
}

export interface TestCaseDashboard {
  tiles: { total: number; ready: number; covered: number; avgConfidencePct: number | null };
  days: DashboardDay[];
  hasCompletedRuns: boolean;
  lastOutcome: { pass: number; fail: number; needsReview: number; neverRun: number };
  sourceType: { gherkin: number; manual: number };
  needsAttention: TestCaseNeedsAttentionRow[];
  rankings: {
    mostRun: (RankedTestCase & { completed: number })[];
    topFailing: (RankedTestCase & { failed: number; completed: number; failRatePct: number })[];
    topFlaky: (RankedTestCase & { flaky: number; completed: number; flakyPct: number })[];
    topTags: { tagId: string; name: string; color: string; count: number }[];
    /** Live test cases with a Fail but fewer than 3 completed runs, so not in Top Failing. */
    failingBelowMinimum: number;
  };
  folderHealth: FolderHealthRow[];
}

const byName = (a: { name: string; id: string }, b: { name: string; id: string }) =>
  a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

/** Descending by part/whole, compared exactly (cross-multiplied) so ties are true ties. */
const byRatioDesc = (part: (r: TestCaseDashboardStatsRow) => number) => (a: TestCaseDashboardStatsRow, b: TestCaseDashboardStatsRow) =>
  part(b) * a.completed - part(a) * b.completed;

/** The dashboard's figures from its rows (pure; the same for the screen and the PDF). */
export function testCaseDashboardFromRows({ facts, cases, stats, tags, folders, days, anyCompleted }: TestCaseDashboardRows): TestCaseDashboard {
  const factsById = new Map(facts.map((f) => [f.id, f]));
  const issuesById = new Map(
    cases.map((c) => [c.id, testCaseHealth(factsById.get(c.id)!).flags.filter(isIssueFlag)] as const),
  );
  const names = new Map(cases.map((c) => [c.id, c.name]));
  const ranked = (row: TestCaseDashboardStatsRow) => ({ id: row.id, name: names.get(row.id)! });
  const tieByName = (a: TestCaseDashboardStatsRow, b: TestCaseDashboardStatsRow) => byName(ranked(a), ranked(b));

  const needsAttention = cases
    .filter((c) => issuesById.get(c.id)!.length > 0)
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime() || byName(a, b))
    .map((c) => ({
      id: c.id,
      name: c.name,
      tagIds: c.tag_ids,
      status: c.status,
      createdAt: c.created_at.toISOString(),
      updatedAt: c.updated_at.toISOString(),
      issues: issuesById.get(c.id)!,
    }));

  const paths = new Map(folders.map((f) => [f.id, f.path]));
  const byFolder = new Map<string, TestCaseDashboardCaseRow[]>();
  for (const c of cases) {
    if (c.folder_id) byFolder.set(c.folder_id, [...(byFolder.get(c.folder_id) ?? []), c]);
  }
  const folderHealth = [...byFolder.entries()]
    .map(([folderId, held]): FolderHealthRow => {
      const breakdown: Partial<Record<IssueFlag, number>> = {};
      for (const flag of ISSUE_FLAGS) {
        const n = held.filter((c) => issuesById.get(c.id)!.includes(flag)).length;
        if (n > 0) breakdown[flag] = n;
      }
      const withIssues = held.filter((c) => issuesById.get(c.id)!.length > 0).length;
      return { folderId, path: paths.get(folderId) ?? [], cases: held.length, withIssues, issuePct: pct(withIssues, held.length), breakdown };
    })
    .sort((a, b) => b.withIssues * a.cases - a.withIssues * b.cases || a.path.join(' / ').localeCompare(b.path.join(' / ')));

  const count = (outcome: TestCaseDashboardCaseRow['last_outcome']) => cases.filter((c) => c.last_outcome === outcome).length;
  const gherkin = cases.filter((c) => c.has_script).length;

  return {
    tiles: {
      total: cases.length,
      ready: cases.filter((c) => c.status === 'Ready').length,
      covered: cases.filter((c) => c.last_outcome !== null).length,
      // AI confidence exists only for automated runs, which don't exist yet (PRD §6.12.1).
      avgConfidencePct: null,
    },
    days,
    hasCompletedRuns: anyCompleted,
    lastOutcome: { pass: count('Pass'), fail: count('Fail'), needsReview: count('NeedsReview'), neverRun: count(null) },
    sourceType: { gherkin, manual: cases.length - gherkin },
    needsAttention,
    rankings: {
      mostRun: [...stats]
        .sort((a, b) => b.completed - a.completed || tieByName(a, b))
        .slice(0, RANKING_LIMIT)
        .map((row) => ({ ...ranked(row), completed: row.completed })),
      topFailing: stats
        .filter((row) => row.completed >= MIN_RUNS_TO_RANK && row.failed > 0)
        .sort((a, b) => byRatioDesc((r) => r.failed)(a, b) || b.failed - a.failed || tieByName(a, b))
        .slice(0, RANKING_LIMIT)
        .map((row) => ({ ...ranked(row), failed: row.failed, completed: row.completed, failRatePct: pct(row.failed, row.completed) })),
      topFlaky: stats
        .filter((row) => row.flaky > 0)
        .sort((a, b) => byRatioDesc((r) => r.flaky)(a, b) || b.flaky - a.flaky || tieByName(a, b))
        .slice(0, RANKING_LIMIT)
        .map((row) => ({ ...ranked(row), flaky: row.flaky, completed: row.completed, flakyPct: pct(row.flaky, row.completed) })),
      topTags: tags.map((t) => ({ tagId: t.id, name: t.name, color: t.color, count: t.count })),
      failingBelowMinimum: stats.filter((row) => row.failed > 0 && row.completed < MIN_RUNS_TO_RANK).length,
    },
    folderHealth,
  };
}

// ---------------------------------------------------------------------------------------
// Needs Attention's filter and sort, and the dashboard's display text (shared with the PDF)
// ---------------------------------------------------------------------------------------

/** Display names of the dashboard's issues (PRD §6.2.4). */
export const ISSUE_LABELS: Record<IssueFlag, string> = {
  NoScript: 'No Script',
  Orphan: 'Orphan',
  NeverRun: 'Never Run',
  Dormant: 'Dormant',
  Degrading: 'Degrading',
};

export type NeedsAttentionSortKey = 'name' | 'issue' | 'status' | 'createdAt' | 'updatedAt';
export const NEEDS_ATTENTION_SORT_KEYS: readonly NeedsAttentionSortKey[] = ['name', 'issue', 'status', 'createdAt', 'updatedAt'];

/** What the Needs Attention table shows: its name filter and its sorted column. */
export interface NeedsAttentionState {
  name: string;
  sort: { key: NeedsAttentionSortKey; direction: 'asc' | 'desc' };
}

/** Created, oldest first, with no filter (PRD §6.2.4). */
export const DEFAULT_NEEDS_ATTENTION: NeedsAttentionState = { name: '', sort: { key: 'createdAt', direction: 'asc' } };

/** The rows whose name contains the filter, ignoring case and surrounding spaces. */
export function filterNeedsAttention<R extends Pick<TestCaseNeedsAttentionRow, 'name'>>(rows: readonly R[], name: string): R[] {
  const needle = name.trim().toLowerCase();
  return needle ? rows.filter((r) => r.name.toLowerCase().includes(needle)) : [...rows];
}

/** Issues sort by their first flag, in the rules' order, then by how many. */
const issueRank = (issues: IssueFlag[]) => ISSUE_FLAGS.indexOf(issues[0]) * 10 + (10 - issues.length);

function compareBy(a: TestCaseNeedsAttentionRow, b: TestCaseNeedsAttentionRow, key: NeedsAttentionSortKey): number {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name);
    case 'issue':
      return issueRank(a.issues) - issueRank(b.issues);
    case 'status':
      return a.status.localeCompare(b.status);
    default:
      return Date.parse(a[key]) - Date.parse(b[key]);
  }
}

/** Sorted by the column, then created time, then id; `desc` reverses the whole order. */
export function sortNeedsAttention<R extends TestCaseNeedsAttentionRow>(rows: readonly R[], sort: NeedsAttentionState['sort']): R[] {
  return [...rows].sort((a, b) => {
    const order = compareBy(a, b, sort.key) || Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id);
    return sort.direction === 'desc' ? -order : order;
  });
}

/** Top Failing's line for failing test cases with too few completed runs to rank. */
export function unrankedFailingText(count: number, listed: boolean): string {
  const one = count === 1;
  return listed
    ? `${count} more failing test ${one ? 'case has' : 'cases have'} fewer than ${MIN_RUNS_TO_RANK} completed runs and ${one ? "isn't" : "aren't"} ranked yet.`
    : `${count} failing test ${one ? 'case has' : 'cases have'} fewer than ${MIN_RUNS_TO_RANK} completed runs, so ${one ? "it isn't" : "they aren't"} ranked yet.`;
}
