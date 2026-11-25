import { Prisma } from '@prisma/client';
import {
  BUG_DASHBOARD_BUGS_SQL,
  BUG_DASHBOARD_CLOCK_SQL,
  BUG_DASHBOARD_TAGS_SQL,
  type BugDashboardBugRow,
  type BugDashboardClockRow,
  type BugDashboardData,
  type BugDashboardTagRow,
  bugDashboardFromRows,
} from '@railgun-qa/reporting';
import { parseTimeZone } from '../overview/overview-trends';

/**
 * The Bugs dashboard's rows (PRD §6.4.4; specs/bug-metrics; bugs-dashboard design.md
 * decisions 1-3), read in the caller's one withTenantContext transaction. The browser
 * builds every figure from them with the shared functions Phase 10's PDF will use.
 */
export async function loadBugDashboard(tx: Prisma.TransactionClient, projectId: string, rawTz: unknown): Promise<BugDashboardData> {
  const tz = await parseTimeZone(tx, rawTz);
  const [clock] = await tx.$queryRawUnsafe<BugDashboardClockRow[]>(BUG_DASHBOARD_CLOCK_SQL, tz);
  const bugs = await tx.$queryRawUnsafe<BugDashboardBugRow[]>(BUG_DASHBOARD_BUGS_SQL, projectId, tz);
  const tags = await tx.$queryRawUnsafe<BugDashboardTagRow[]>(BUG_DASHBOARD_TAGS_SQL, projectId);
  return bugDashboardFromRows(clock, bugs, tags);
}
