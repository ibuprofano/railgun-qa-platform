import { Prisma } from '@prisma/client';
import {
  TEST_CASE_DASHBOARD_ANY_COMPLETED_SQL,
  TEST_CASE_DASHBOARD_CASES_SQL,
  TEST_CASE_DASHBOARD_DAYS_SQL,
  TEST_CASE_DASHBOARD_FOLDERS_SQL,
  TEST_CASE_DASHBOARD_STATS_SQL,
  TEST_CASE_DASHBOARD_TAGS_SQL,
  TEST_CASE_FACTS_SQL,
  testCaseDashboardFromRows,
  type DashboardDay,
  type TestCaseDashboard,
  type TestCaseDashboardCaseRow,
  type TestCaseDashboardFolderRow,
  type TestCaseDashboardStatsRow,
  type TestCaseDashboardTagRow,
  type TestCaseFactsRow,
} from '@railgun-qa/reporting';

export type { DashboardDay, FolderHealthRow, RankedTestCase, TestCaseNeedsAttentionRow, TestCaseDashboard } from '@railgun-qa/reporting';

/**
 * The Test Cases dashboard (PRD §6.2.4, specs/test-case-metrics), read in the caller's one
 * withTenantContext transaction. The queries and the figures live in @railgun-qa/reporting
 * so the worker's PDF reads exactly the same (test-cases-dashboard-report design.md
 * decision 1); `tz` must already be checked against pg_timezone_names.
 */
export async function loadTestCaseDashboard(tx: Prisma.TransactionClient, projectId: string, tz: string): Promise<TestCaseDashboard> {
  const facts = await tx.$queryRawUnsafe<TestCaseFactsRow[]>(TEST_CASE_FACTS_SQL, projectId, null);
  const cases = await tx.$queryRawUnsafe<TestCaseDashboardCaseRow[]>(TEST_CASE_DASHBOARD_CASES_SQL, projectId);
  const stats = await tx.$queryRawUnsafe<TestCaseDashboardStatsRow[]>(TEST_CASE_DASHBOARD_STATS_SQL, projectId);
  const tags = await tx.$queryRawUnsafe<TestCaseDashboardTagRow[]>(TEST_CASE_DASHBOARD_TAGS_SQL, projectId);
  const folders = await tx.$queryRawUnsafe<TestCaseDashboardFolderRow[]>(TEST_CASE_DASHBOARD_FOLDERS_SQL, projectId);
  const days = await tx.$queryRawUnsafe<DashboardDay[]>(TEST_CASE_DASHBOARD_DAYS_SQL, projectId, tz);
  const [anyCompleted] = await tx.$queryRawUnsafe<{ any: boolean }[]>(TEST_CASE_DASHBOARD_ANY_COMPLETED_SQL, projectId);
  return testCaseDashboardFromRows({ facts, cases, stats, tags, folders, days, anyCompleted: anyCompleted.any });
}
