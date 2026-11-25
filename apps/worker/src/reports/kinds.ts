import type { PoolClient } from 'pg';
import {
  BUG_DASHBOARD_BUGS_SQL,
  BUG_DASHBOARD_CLOCK_SQL,
  BUG_DASHBOARD_TAGS_SQL,
  bugDashboardFromRows,
  bugReportData,
  EXECUTION_DASHBOARD_EXECUTIONS_SQL,
  EXECUTION_DASHBOARD_RUNS_SQL,
  EXECUTION_DASHBOARD_TODAY_SQL,
  executionDashboardFromRows,
  executionReportData,
  type BugDashboardBugRow,
  type BugDashboardClockRow,
  type BugDashboardTagRow,
  type BugReportOptions,
  type ExecutionDashboardExecutionRow,
  type ExecutionDashboardRunRow,
  type ExecutionReportOptions,
  type ReportDbKind,
  TEST_CASE_DASHBOARD_ANY_COMPLETED_SQL,
  TEST_CASE_DASHBOARD_CASES_SQL,
  TEST_CASE_DASHBOARD_DAYS_SQL,
  TEST_CASE_DASHBOARD_FOLDERS_SQL,
  TEST_CASE_DASHBOARD_STATS_SQL,
  TEST_CASE_DASHBOARD_TAGS_SQL,
  TEST_CASE_FACTS_SQL,
  testCaseDashboardFromRows,
  testCaseReportData,
  type DashboardDay,
  type TestCaseDashboardCaseRow,
  type TestCaseDashboardFolderRow,
  type TestCaseDashboardStatsRow,
  type TestCaseDashboardTagRow,
  type TestCaseFactsRow,
  type TestCaseReportOptions,
} from '@railgun-qa/reporting';
import { bugsDashboardDocument } from './bugs-dashboard-document';
import { executionsDashboardDocument } from './executions-dashboard-document';
import { testCasesDashboardDocument } from './test-cases-dashboard-document';

/**
 * One builder per report kind (executions-dashboard-report design.md decision 4): reads the
 * kind's rows under the caller's tenant transaction, in the requester's zone, and returns
 * the pdfmake definition and the day the file is named after. Typed by kind, so a kind
 * can't be added without its builder.
 */
export interface BuiltReport {
  definition: unknown;
  /** YYYY-MM-DD in the requester's zone. */
  fileDay: string;
}

export type ReportBuilder = (client: PoolClient, report: { projectId: string; options: Record<string, unknown> }) => Promise<BuiltReport>;

async function projectName(client: PoolClient, projectId: string): Promise<string> {
  return (await client.query<{ name: string }>('SELECT name FROM project WHERE id = $1', [projectId])).rows[0].name;
}

const bugsDashboard: ReportBuilder = async (client, { projectId, options }) => {
  const { tz, range } = options as unknown as { tz: string; range: BugReportOptions['range'] };
  const [clock] = (await client.query<BugDashboardClockRow>(BUG_DASHBOARD_CLOCK_SQL, [tz])).rows;
  const bugs = (await client.query<BugDashboardBugRow>(BUG_DASHBOARD_BUGS_SQL, [projectId, tz])).rows;
  const tags = (await client.query<BugDashboardTagRow>(BUG_DASHBOARD_TAGS_SQL, [projectId])).rows;
  const dashboard = bugDashboardFromRows(clock, bugs, tags);
  const report = bugReportData(dashboard, { range, projectName: await projectName(client, projectId) });
  return { definition: bugsDashboardDocument(report), fileDay: dashboard.today };
};

const executionsDashboard: ReportBuilder = async (client, { projectId, options }) => {
  const opts = options as unknown as ExecutionReportOptions;
  const [{ today }] = (await client.query<{ today: string }>(EXECUTION_DASHBOARD_TODAY_SQL, [opts.tz])).rows;
  const executions = (await client.query<ExecutionDashboardExecutionRow>(EXECUTION_DASHBOARD_EXECUTIONS_SQL, [projectId, opts.tz])).rows;
  const runs = (await client.query<ExecutionDashboardRunRow>(EXECUTION_DASHBOARD_RUNS_SQL, [projectId, opts.tz])).rows;
  // Tags are named as they are now: "the moment it is generated" (specs/executions-dashboard-report).
  const tagIds = opts.filters.tagIds ?? [];
  const names = new Map(
    tagIds.length === 0
      ? []
      : (await client.query<{ id: string; name: string }>('SELECT id, name FROM tag WHERE id = ANY($1::uuid[])', [tagIds])).rows.map((t) => [t.id, t.name]),
  );
  const dashboard = executionDashboardFromRows(today, executions, runs);
  const report = executionReportData(dashboard, opts, {
    projectName: await projectName(client, projectId),
    tagName: (id) => names.get(id) ?? 'Deleted tag',
  });
  return { definition: executionsDashboardDocument(report), fileDay: today };
};

/** The Test Cases dashboard's rows, read with the same queries the API's dashboard runs. */
export async function loadTestCaseDashboardRows(client: PoolClient, projectId: string, tz: string) {
  const rows = async <T>(sql: string, params: unknown[]) => (await client.query(sql, params)).rows as T[];
  return testCaseDashboardFromRows({
    facts: await rows<TestCaseFactsRow>(TEST_CASE_FACTS_SQL, [projectId, null]),
    cases: await rows<TestCaseDashboardCaseRow>(TEST_CASE_DASHBOARD_CASES_SQL, [projectId]),
    stats: await rows<TestCaseDashboardStatsRow>(TEST_CASE_DASHBOARD_STATS_SQL, [projectId]),
    tags: await rows<TestCaseDashboardTagRow>(TEST_CASE_DASHBOARD_TAGS_SQL, [projectId]),
    folders: await rows<TestCaseDashboardFolderRow>(TEST_CASE_DASHBOARD_FOLDERS_SQL, [projectId]),
    days: await rows<DashboardDay>(TEST_CASE_DASHBOARD_DAYS_SQL, [projectId, tz]),
    anyCompleted: (await rows<{ any: boolean }>(TEST_CASE_DASHBOARD_ANY_COMPLETED_SQL, [projectId]))[0].any,
  });
}

const testCasesDashboard: ReportBuilder = async (client, { projectId, options }) => {
  const opts = options as unknown as TestCaseReportOptions;
  const dashboard = await loadTestCaseDashboardRows(client, projectId, opts.tz);
  // Tags are named as they are now: "the moment it is generated" (specs/test-cases-dashboard-report).
  const tagIds = [...new Set(dashboard.needsAttention.flatMap((r) => r.tagIds))];
  const names = new Map(
    tagIds.length === 0
      ? []
      : (await client.query<{ id: string; name: string }>('SELECT id, name FROM tag WHERE id = ANY($1::uuid[])', [tagIds])).rows.map((t) => [t.id, t.name]),
  );
  const report = testCaseReportData(dashboard, opts, {
    projectName: await projectName(client, projectId),
    tagName: (id) => names.get(id) ?? 'Deleted tag',
  });
  // The dashboard's last day is today in the requester's zone.
  return { definition: testCasesDashboardDocument(report), fileDay: report.generatedOn };
};

export const BUILDERS: Record<ReportDbKind, ReportBuilder> = {
  bugs_dashboard: bugsDashboard,
  executions_dashboard: executionsDashboard,
  test_cases_dashboard: testCasesDashboard,
};
