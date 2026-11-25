import { Prisma } from '@prisma/client';
import {
  EXECUTION_DASHBOARD_EXECUTIONS_SQL,
  EXECUTION_DASHBOARD_RUNS_SQL,
  EXECUTION_DASHBOARD_TODAY_SQL,
  type ExecutionDashboardData,
  type ExecutionDashboardExecutionRow,
  type ExecutionDashboardRunRow,
  executionDashboardFromRows,
} from '@railgun-qa/reporting';
import { parseTimeZone } from '../overview/overview-trends';

/**
 * The Executions dashboard's rows (PRD §6.3.6; specs/execution-metrics; executions-dashboard
 * design.md decisions 1-4), read in the caller's one withTenantContext transaction. The
 * browser scopes them with the list's filters and builds every figure from them, with the
 * same shared functions Phase 10's PDF will use.
 */
export async function loadExecutionDashboard(
  tx: Prisma.TransactionClient,
  projectId: string,
  rawTz: unknown,
): Promise<ExecutionDashboardData> {
  const tz = await parseTimeZone(tx, rawTz);
  const [{ today }] = await tx.$queryRawUnsafe<{ today: string }[]>(EXECUTION_DASHBOARD_TODAY_SQL, tz);
  const executions = await tx.$queryRawUnsafe<ExecutionDashboardExecutionRow[]>(EXECUTION_DASHBOARD_EXECUTIONS_SQL, projectId, tz);
  const runs = await tx.$queryRawUnsafe<ExecutionDashboardRunRow[]>(EXECUTION_DASHBOARD_RUNS_SQL, projectId, tz);
  return executionDashboardFromRows(today, executions, runs);
}
