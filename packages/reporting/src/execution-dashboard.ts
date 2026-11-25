import { pct } from './health';

/**
 * The Executions dashboard (PRD §6.3.6; specs/execution-metrics), written once for the
 * screen and for Phase 10's PDF: the execution list's filter (the dashboard's scope), the
 * two queries that read its rows, and the pure figures and runs-table rules built on them.
 */

export type ExecutionStatus = 'Draft' | 'Ready' | 'InProgress' | 'Paused' | 'Completed' | 'Done' | 'Canceled';
export type RunOutcome = 'Pending' | 'Pass' | 'Fail' | 'NeedsReview';
export type CompletedOutcome = Exclude<RunOutcome, 'Pending'>;
export type ExecutionBrowser = 'Chromium' | 'Firefox' | 'WebKit';

/** Lifecycle order (PRD §6.3.4): Draft → … → Done, then Canceled. */
export const EXECUTION_STATUSES: readonly ExecutionStatus[] = ['Draft', 'Ready', 'InProgress', 'Paused', 'Completed', 'Done', 'Canceled'];
export const RUN_OUTCOMES: readonly RunOutcome[] = ['Pass', 'Fail', 'NeedsReview', 'Pending'];
export const COMPLETED_OUTCOMES: readonly CompletedOutcome[] = ['Pass', 'Fail', 'NeedsReview'];

// ---------------------------------------------------------------------------------------
// Scope: the execution list's filter (PRD §6.3.2)
// ---------------------------------------------------------------------------------------

/** The fields the execution list filters on. */
export interface ExecutionFilterable {
  name: string;
  status: ExecutionStatus;
  /** The kept environment name, so deleted environments still filter. */
  environmentName: string | null;
  browser: ExecutionBrowser;
  /** Tags its test cases currently carry. */
  tagIds?: readonly string[];
}

export interface ExecutionFilters {
  name?: string;
  status?: ExecutionStatus;
  environmentName?: string;
  browser?: ExecutionBrowser;
  /** Executions with a test case carrying any of these tags (PRD §6.3.2). */
  tagIds?: string[];
}

/** ADR 0016 decision 7: an item matches a tag filter when it carries any picked tag; none picked = no filter. */
export function carriesAnyTag(itemTagIds: readonly string[] | undefined, picked: readonly string[] | undefined): boolean {
  return !picked || picked.length === 0 || (itemTagIds ?? []).some((id) => picked.includes(id));
}

export function filterExecutions<T extends ExecutionFilterable>(list: readonly T[], filters: ExecutionFilters): T[] {
  const name = filters.name?.trim().toLowerCase();
  return list.filter(
    (execution) =>
      (!name || execution.name.toLowerCase().includes(name)) &&
      (!filters.status || execution.status === filters.status) &&
      (!filters.environmentName || execution.environmentName === filters.environmentName) &&
      (!filters.browser || execution.browser === filters.browser) &&
      carriesAnyTag(execution.tagIds, filters.tagIds),
  );
}

export function hasActiveFilters(filters: ExecutionFilters): boolean {
  return (
    Boolean(filters.name?.trim()) ||
    Boolean(filters.status) ||
    Boolean(filters.environmentName) ||
    Boolean(filters.browser) ||
    (filters.tagIds?.length ?? 0) > 0
  );
}

export const STATUS_LABELS: Record<ExecutionStatus, string> = {
  Draft: 'Draft',
  Ready: 'Ready',
  InProgress: 'In Progress',
  Paused: 'Paused',
  Completed: 'Completed',
  Done: 'Done',
  Canceled: 'Canceled',
};

export const OUTCOME_LABELS: Record<RunOutcome, string> = {
  Pass: 'Pass',
  Fail: 'Fail',
  NeedsReview: 'Needs Review',
  Pending: 'Pending',
};

/** Runs Over Time's series names, used in the day filter's label. */
export const DAILY_OUTCOME_LABELS: Record<CompletedOutcome, string> = {
  Pass: 'Passed',
  Fail: 'Failed',
  NeedsReview: 'Needs Review',
};

/** The active list filters as "Label: value" entries, for the scope notice and the report. */
export function describeFilters(filters: ExecutionFilters, tagName: (id: string) => string = (id) => id): string[] {
  const entries: string[] = [];
  if (filters.name?.trim()) entries.push(`Name: ${filters.name.trim()}`);
  if (filters.status) entries.push(`Status: ${STATUS_LABELS[filters.status]}`);
  if (filters.environmentName) entries.push(`Environment: ${filters.environmentName}`);
  if (filters.browser) entries.push(`Browser: ${filters.browser}`);
  if (filters.tagIds?.length) entries.push(`Tags: ${filters.tagIds.map(tagName).join(', ')}`);
  return entries;
}

// ---------------------------------------------------------------------------------------
// Rows: the two queries and the response shape
// ---------------------------------------------------------------------------------------

/**
 * Parameters for both row queries (positional, as written by Prisma's $queryRawUnsafe
 * and by pg): $1 the project id, $2 the caller's time zone, already checked against
 * pg_timezone_names.
 *
 * Executions not in the Trash. `tag_ids` restates the execution list's subquery
 * (apps/api/src/executions/execution-queries.ts), so the same filter scopes both; an e2e
 * test holds them together. `completed_on` is the tz day of `completed_at`, which
 * Restart clears and Cancel never sets.
 */
export const EXECUTION_DASHBOARD_EXECUTIONS_SQL = `
  SELECT e.id, e.name, e.status, e.environment_name, e.browser,
         COALESCE((SELECT array_agg(DISTINCT tt.tag_id) FROM test_run r
                   JOIN test_case_tag tt ON tt.test_case_id = r.test_case_id
                   WHERE r.execution_id = e.id), '{}') AS tag_ids,
         to_char((e.completed_at AT TIME ZONE $2::text)::date, 'YYYY-MM-DD') AS completed_on
  FROM test_execution e
  WHERE e.project_id = $1::uuid AND e.deleted_at IS NULL
  ORDER BY e.created_at, e.id
`;

/**
 * Every current run of an execution not in the Trash, runs of trashed test cases included
 * (PRD §2.11). Earlier attempts are read only to count them. The failed step comes from
 * the newest live bug filed from the run in its execution's current attempt.
 */
export const EXECUTION_DASHBOARD_RUNS_SQL = `
  SELECT r.id, r.execution_id, e.name AS execution_name, r.position, r.test_case_id,
         COALESCE(r.test_case_name_snapshot, tc.name) AS test_case_name, r.outcome,
         CASE WHEN r.outcome <> 'Pending' AND r.outcome_updated_at IS NOT NULL
              THEN to_char((r.outcome_updated_at AT TIME ZONE $2::text)::date, 'YYYY-MM-DD') END AS completed_on,
         (1 + (SELECT count(*) FROM test_run_attempt a WHERE a.test_run_id = r.id))::int AS attempts,
         (SELECT count(*) FROM bug b WHERE b.test_run_id = r.id AND b.deleted_at IS NULL)::int AS bug_count,
         (SELECT b.failed_step_snapshot FROM bug b
          WHERE b.test_run_id = r.id AND b.attempt = e.attempt AND b.deleted_at IS NULL
            AND b.failed_step_snapshot IS NOT NULL
          ORDER BY b.created_at DESC, b.id DESC LIMIT 1) AS failed_step,
         r.created_at,
         CASE WHEN r.outcome <> 'Pending' THEN r.outcome_updated_at END AS outcome_updated_at
  FROM test_run r
  JOIN test_execution e ON e.id = r.execution_id
  LEFT JOIN test_case tc ON tc.id = r.test_case_id
  WHERE e.project_id = $1::uuid AND e.deleted_at IS NULL
  ORDER BY e.created_at, e.id, r.position
`;

/** Today in the caller's zone; $1 is the time zone. */
export const EXECUTION_DASHBOARD_TODAY_SQL = `SELECT to_char((now() AT TIME ZONE $1::text)::date, 'YYYY-MM-DD') AS today`;

export interface ExecutionDashboardExecutionRow {
  id: string;
  name: string;
  status: ExecutionStatus;
  environment_name: string | null;
  browser: ExecutionBrowser;
  tag_ids: string[];
  completed_on: string | null;
}

export interface ExecutionDashboardRunRow {
  id: string;
  execution_id: string;
  execution_name: string;
  position: number;
  test_case_id: string | null;
  test_case_name: string | null;
  outcome: RunOutcome;
  completed_on: string | null;
  attempts: number;
  bug_count: number;
  failed_step: string | null;
  created_at: Date;
  outcome_updated_at: Date | null;
}

export interface DashboardExecution extends ExecutionFilterable {
  id: string;
  tagIds: string[];
  /** YYYY-MM-DD in the caller's zone, or null while not completed. */
  completedOn: string | null;
}

export interface DashboardRun {
  id: string;
  executionId: string;
  executionName: string;
  position: number;
  testCaseId: string | null;
  testCaseName: string | null;
  outcome: RunOutcome;
  /** YYYY-MM-DD in the caller's zone, for completed runs. */
  completedOn: string | null;
  attempts: number;
  bugCount: number;
  failedStep: string | null;
  createdAt: string;
  /** When the current outcome was recorded; null while Pending. */
  outcomeUpdatedAt: string | null;
}

export interface ExecutionDashboardData {
  /** YYYY-MM-DD in the caller's zone. */
  today: string;
  executions: DashboardExecution[];
  runs: DashboardRun[];
}

export function executionDashboardFromRows(
  today: string,
  executions: readonly ExecutionDashboardExecutionRow[],
  runs: readonly ExecutionDashboardRunRow[],
): ExecutionDashboardData {
  return {
    today,
    executions: executions.map((e) => ({
      id: e.id,
      name: e.name,
      status: e.status,
      environmentName: e.environment_name,
      browser: e.browser,
      tagIds: e.tag_ids ?? [],
      completedOn: e.completed_on,
    })),
    runs: runs.map((r) => ({
      id: r.id,
      executionId: r.execution_id,
      executionName: r.execution_name,
      position: r.position,
      testCaseId: r.test_case_id,
      testCaseName: r.test_case_name,
      outcome: r.outcome,
      completedOn: r.completed_on,
      attempts: Number(r.attempts),
      bugCount: Number(r.bug_count),
      failedStep: r.failed_step,
      createdAt: new Date(r.created_at).toISOString(),
      outcomeUpdatedAt: r.outcome_updated_at ? new Date(r.outcome_updated_at).toISOString() : null,
    })),
  };
}

// ---------------------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------------------

export interface DashboardScope {
  executions: DashboardExecution[];
  runs: DashboardRun[];
}

/** The executions the list shows, and their runs (PRD §6.3.6, "Scope follows the list filters"). */
export function scopeDashboard(data: Pick<ExecutionDashboardData, 'executions' | 'runs'>, filters: ExecutionFilters): DashboardScope {
  const executions = filterExecutions(data.executions, filters);
  const ids = new Set(executions.map((e) => e.id));
  return { executions, runs: data.runs.filter((r) => ids.has(r.executionId)) };
}

export interface ExecutionTiles {
  executions: number;
  /** In Progress or Paused. */
  active: number;
  totalRuns: number;
  completedRuns: number;
  passedRuns: number;
  /** Pass over completed runs; null with none ("no results yet"). */
  passRatePct: number | null;
  /** Mean duration of runs that have one; null until runs record a duration (PRD §6.12.1). */
  avgDurationSeconds: number | null;
}

export function executionTiles(scope: DashboardScope): ExecutionTiles {
  const completed = scope.runs.filter((r) => r.outcome !== 'Pending');
  const passed = completed.filter((r) => r.outcome === 'Pass').length;
  return {
    executions: scope.executions.length,
    active: scope.executions.filter((e) => e.status === 'InProgress' || e.status === 'Paused').length,
    totalRuns: scope.runs.length,
    completedRuns: completed.length,
    passedRuns: passed,
    passRatePct: completed.length > 0 ? pct(passed, completed.length) : null,
    avgDurationSeconds: null,
  };
}

/** `days` calendar dates ending at `today` (YYYY-MM-DD), oldest first; UTC arithmetic on the strings. */
export function dayRange(today: string, days: number): string[] {
  const end = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

export const DASHBOARD_DAYS = 90;

export interface ExecutionDailySeries {
  dates: string[];
  completedExecutions: number[];
  passed: number[];
  failed: number[];
  needsReview: number[];
}

export function executionDailySeries(scope: DashboardScope, today: string, days = DASHBOARD_DAYS): ExecutionDailySeries {
  const dates = dayRange(today, days);
  const index = new Map(dates.map((d, i) => [d, i]));
  const zeros = () => dates.map(() => 0);
  const series: ExecutionDailySeries = { dates, completedExecutions: zeros(), passed: zeros(), failed: zeros(), needsReview: zeros() };
  for (const e of scope.executions) {
    const i = e.completedOn === null ? undefined : index.get(e.completedOn);
    if (i !== undefined) series.completedExecutions[i] += 1;
  }
  const byOutcome: Record<CompletedOutcome, number[]> = { Pass: series.passed, Fail: series.failed, NeedsReview: series.needsReview };
  for (const r of scope.runs) {
    if (r.outcome === 'Pending' || r.completedOn === null) continue;
    const i = index.get(r.completedOn);
    if (i !== undefined) byOutcome[r.outcome][i] += 1;
  }
  return series;
}

export function executionStatusSplit(scope: DashboardScope): Record<ExecutionStatus, number> {
  const split = Object.fromEntries(EXECUTION_STATUSES.map((s) => [s, 0])) as Record<ExecutionStatus, number>;
  for (const e of scope.executions) split[e.status] += 1;
  return split;
}

export function runOutcomeSplit(scope: DashboardScope): Record<RunOutcome, number> {
  const split: Record<RunOutcome, number> = { Pass: 0, Fail: 0, NeedsReview: 0, Pending: 0 };
  for (const r of scope.runs) split[r.outcome] += 1;
  return split;
}

// ---------------------------------------------------------------------------------------
// The runs table
// ---------------------------------------------------------------------------------------

export type RunsTab = 'needsAttention' | 'all';
export type RunSortKey = 'order' | 'testCase' | 'outcome' | 'attempts' | 'bugs' | 'createdAt' | 'updatedAt';
export type SortDirection = 'asc' | 'desc';

export interface RunDayFilter {
  date: string;
  outcome: CompletedOutcome;
}

export interface RunTableState {
  tab: RunsTab;
  /** From the Run Outcomes donut. */
  outcome: RunOutcome | null;
  /** From a Runs Over Time segment. */
  day: RunDayFilter | null;
  /** Matches the test case's or the execution's name. */
  name: string;
  sort: { key: RunSortKey; direction: SortDirection };
}

export const DEFAULT_RUN_TABLE_STATE: RunTableState = {
  tab: 'needsAttention',
  outcome: null,
  day: null,
  name: '',
  sort: { key: 'updatedAt', direction: 'desc' },
};

/** The PRD order: the tab, then the outcome filter, then the day-and-outcome filter, then the name. */
export function filterRuns(runs: readonly DashboardRun[], state: Pick<RunTableState, 'tab' | 'outcome' | 'day' | 'name'>): DashboardRun[] {
  const name = state.name.trim().toLowerCase();
  return runs
    .filter((r) => state.tab === 'all' || r.outcome === 'NeedsReview')
    .filter((r) => state.outcome === null || r.outcome === state.outcome)
    .filter((r) => state.day === null || (r.completedOn === state.day.date && r.outcome === state.day.outcome))
    .filter(
      (r) => !name || (r.testCaseName ?? '').toLowerCase().includes(name) || r.executionName.toLowerCase().includes(name),
    );
}

const sortValue = (r: DashboardRun, key: RunSortKey): string | number | null => {
  switch (key) {
    case 'order':
      return r.position;
    case 'testCase':
      return r.testCaseName === null ? null : r.testCaseName.toLowerCase();
    case 'outcome':
      return RUN_OUTCOMES.indexOf(r.outcome);
    case 'attempts':
      return r.attempts;
    case 'bugs':
      return r.bugCount;
    case 'createdAt':
      return Date.parse(r.createdAt);
    case 'updatedAt':
      return r.outcomeUpdatedAt === null ? null : Date.parse(r.outcomeUpdatedAt);
  }
};

/** Sorts by one column; missing values last in both directions; ties by execution name, then position. */
export function sortRuns(runs: readonly DashboardRun[], sort: RunTableState['sort']): DashboardRun[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  const tieBreak = (a: DashboardRun, b: DashboardRun) =>
    a.executionName.localeCompare(b.executionName) || a.position - b.position || a.id.localeCompare(b.id);
  return [...runs].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    if (va === null || vb === null) {
      if (va === null && vb === null) return tieBreak(a, b);
      return va === null ? 1 : -1;
    }
    const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : va - (vb as number);
    return cmp !== 0 ? sign * cmp : tieBreak(a, b);
  });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-03-04" → "4 Mar". */
export function formatDayLabel(date: string): string {
  const [, month, day] = date.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

/** The active chart filter's label, e.g. "Pass" or "4 Mar · Failed"; null with none. */
export function chartFilterLabel(state: Pick<RunTableState, 'outcome' | 'day'>, formatDay: (date: string) => string = formatDayLabel): string | null {
  const parts: string[] = [];
  if (state.outcome) parts.push(OUTCOME_LABELS[state.outcome]);
  if (state.day) parts.push(`${formatDay(state.day.date)} · ${DAILY_OUTCOME_LABELS[state.day.outcome]}`);
  return parts.length ? parts.join(' · ') : null;
}

/** Whether any dashboard filter is on; the Needs Attention tab counts as one (PRD §6.3.6, Export). */
export function isDashboardFiltered(filters: ExecutionFilters, table: Pick<RunTableState, 'tab' | 'outcome' | 'day' | 'name'>): boolean {
  return hasActiveFilters(filters) || table.tab === 'needsAttention' || table.outcome !== null || table.day !== null || Boolean(table.name.trim());
}

// ---------------------------------------------------------------------------------------
// Report options (consumed by Phase 10's PDF job)
// ---------------------------------------------------------------------------------------

export interface ExecutionReportOptions {
  tz: string;
  filters: ExecutionFilters;
  runTable: Pick<RunTableState, 'tab' | 'outcome' | 'day' | 'name' | 'sort'>;
  /** The chart ranges selected on screen, in days (PRD §6.12.2). */
  ranges: { executionsOverTime: number; runsOverTime: number };
  include: { executions: boolean; runs: boolean };
}

export function buildReportOptions(input: ExecutionReportOptions): ExecutionReportOptions {
  const { filters } = input;
  const cleanFilters: ExecutionFilters = {};
  if (filters.name?.trim()) cleanFilters.name = filters.name.trim();
  if (filters.status) cleanFilters.status = filters.status;
  if (filters.environmentName) cleanFilters.environmentName = filters.environmentName;
  if (filters.browser) cleanFilters.browser = filters.browser;
  if (filters.tagIds?.length) cleanFilters.tagIds = [...filters.tagIds];
  return {
    tz: input.tz,
    filters: cleanFilters,
    runTable: {
      tab: input.runTable.tab,
      outcome: input.runTable.outcome,
      day: input.runTable.day,
      name: input.runTable.name.trim(),
      sort: { ...input.runTable.sort },
    },
    ranges: { ...input.ranges },
    include: { ...input.include },
  };
}
