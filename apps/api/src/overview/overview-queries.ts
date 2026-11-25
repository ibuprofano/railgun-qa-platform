import { Prisma } from '@prisma/client';
import { AS_OF_COUNTS_SQL, type AsOfCountsRow, figuresFromCounts, type Health, pct } from '@railgun-qa/reporting';

/**
 * The Overview's figures (specs/project-metrics), all read in the caller's one
 * withTenantContext transaction so they are consistent with each other. The KPIs and
 * Health Score come from the shared counting query and formulas in @railgun-qa/reporting
 * (ADR 0024); Top Failing Tests, Urgent Bugs and Active Runs are read here.
 *
 * What counts:
 * - a completed run: outcome Pass, Fail or Needs Review, in an execution not in the
 *   Trash; only its current outcome (earlier attempts live in test_run_attempt, never read)
 * - execution-level figures (pass rate) count every such run, including runs of a
 *   trashed test case, which stay in their execution (PRD §2.11)
 * - test-case figures (totals, coverage, freshness, Top Failing) count live test cases
 * - "last N days" is rolling from the database clock
 */
const COMPLETED = Prisma.sql`r.outcome IN ('Pass', 'Fail', 'NeedsReview')`;

export interface TopFailingTest {
  id: string;
  name: string;
  failed: number;
  completed: number;
  failRatePct: number;
}

export interface UrgentBug {
  id: string;
  title: string;
  severity: 'Critical' | 'High';
  status: 'Open' | 'InProgress';
  createdAt: string;
}

export interface OverviewResponse {
  testCases: { total: number; readyPct: number; coveragePct: number };
  /** Null with no runs completed in the last 30 days. */
  passRate: number | null;
  activeExecutions: number;
  openBugs: number;
  criticalBugs: number;
  health: Health;
  topFailingTests: TopFailingTest[];
  /** Live test cases with a Fail but fewer than 3 completed runs, so not in Top Failing Tests. */
  failingBelowMinimum: number;
  urgentBugs: UrgentBug[];
}

const TOP_FAILING_LIMIT = 6;
const URGENT_BUGS_LIMIT = 6;
const MIN_RUNS_TO_RANK = 3;

export async function loadOverview(tx: Prisma.TransactionClient, projectId: string): Promise<OverviewResponse> {
  // The shared counting query at "now" (NULL): the same definitions as each snapshot and
  // recomputed day (ADR 0024).
  const [counts] = await tx.$queryRawUnsafe<AsOfCountsRow[]>(AS_OF_COUNTS_SQL, projectId, null);
  const figures = figuresFromCounts(counts);

  const [executions] = await tx.$queryRaw<{ active: number }[]>`
    SELECT count(*) FILTER (WHERE status = 'InProgress')::int AS active
    FROM test_execution WHERE project_id = ${projectId}::uuid AND deleted_at IS NULL
  `;

  // Ordered by the exact ratio, not the rounded percentage, so ties are true ties.
  const failing = await tx.$queryRaw<{ id: string; name: string; failed: number; completed: number }[]>`
    SELECT tc.id, tc.name,
      count(*) FILTER (WHERE r.outcome = 'Fail')::int AS failed,
      count(*)::int AS completed
    FROM test_case tc
    JOIN test_run r ON r.test_case_id = tc.id
    JOIN test_execution e ON e.id = r.execution_id
    WHERE tc.project_id = ${projectId}::uuid AND tc.deleted_at IS NULL
      AND e.deleted_at IS NULL AND ${COMPLETED}
    GROUP BY tc.id, tc.name
    HAVING count(*) >= ${MIN_RUNS_TO_RANK} AND count(*) FILTER (WHERE r.outcome = 'Fail') > 0
    ORDER BY count(*) FILTER (WHERE r.outcome = 'Fail')::numeric / count(*) DESC,
      count(*) FILTER (WHERE r.outcome = 'Fail') DESC, tc.name, tc.id
    LIMIT ${TOP_FAILING_LIMIT}
  `;

  // Same run scope as the ranking above, just below its minimum (test-cases-dashboard design.md decision 7).
  const [unranked] = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM (
      SELECT tc.id
      FROM test_case tc
      JOIN test_run r ON r.test_case_id = tc.id
      JOIN test_execution e ON e.id = r.execution_id
      WHERE tc.project_id = ${projectId}::uuid AND tc.deleted_at IS NULL
        AND e.deleted_at IS NULL AND ${COMPLETED}
      GROUP BY tc.id
      HAVING count(*) < ${MIN_RUNS_TO_RANK} AND count(*) FILTER (WHERE r.outcome = 'Fail') > 0
    ) below
  `;

  const urgent = await tx.$queryRaw<{ id: string; title: string; severity: UrgentBug['severity']; status: UrgentBug['status']; created_at: Date }[]>`
    SELECT id, title, severity, status, created_at FROM bug
    WHERE project_id = ${projectId}::uuid AND deleted_at IS NULL
      AND status IN ('Open', 'InProgress') AND severity IN ('Critical', 'High')
    ORDER BY (severity = 'Critical') DESC, created_at DESC, id
    LIMIT ${URGENT_BUGS_LIMIT}
  `;

  return {
    testCases: figures.testCases,
    passRate: figures.passRate,
    activeExecutions: executions.active,
    openBugs: figures.openBugs,
    criticalBugs: figures.criticalBugs,
    health: figures.health,
    topFailingTests: failing.map((row) => ({ ...row, failRatePct: pct(row.failed, row.completed) })),
    failingBelowMinimum: unranked.n,
    urgentBugs: urgent.map((row) => ({
      id: row.id,
      title: row.title,
      severity: row.severity,
      status: row.status,
      createdAt: row.created_at.toISOString(),
    })),
  };
}
