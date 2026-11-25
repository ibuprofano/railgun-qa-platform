import type { BugDashboardData, DashboardBug } from '@railgun-qa/reporting';
import type { Bug } from '../lib/bugs-api';

/** A complete Bug with sensible defaults, overridable per test. */
export function makeBug(overrides: Partial<Bug> = {}): Bug {
  return {
    id: 'bug-1',
    title: 'Checkout total is wrong',
    severity: 'Medium',
    status: 'Open',
    description: null,
    stepsToReproduce: null,
    testCaseNameSnapshot: null,
    gherkinSnapshot: null,
    failedStep: null,
    reporterName: 'Test User',
    autoCreated: false,
    createdAt: '2026-10-25T09:00:00.000Z',
    updatedAt: '2026-10-25T09:00:00.000Z',
    resolvedAt: null,
    run: null,
    testCase: null,
    ...overrides,
  };
}

/** "Now" for dashboard fixtures; `daysAgo` counts back from it. */
export const DASHBOARD_NOW = '2026-11-24T12:00:00.000Z';
export const daysAgo = (days: number) => new Date(Date.parse(DASHBOARD_NOW) - days * 86_400_000).toISOString();

let dashboardBugSeq = 0;

/** A Bugs dashboard row (specs/bug-metrics) reported a day before DASHBOARD_NOW. */
export function makeDashboardBug(overrides: Partial<DashboardBug> = {}): DashboardBug {
  dashboardBugSeq += 1;
  const createdAt = overrides.createdAt ?? daysAgo(1);
  return {
    id: `dbug-${dashboardBugSeq}`,
    title: `Bug ${dashboardBugSeq}`,
    severity: 'Medium',
    status: 'Open',
    tagIds: [],
    createdAt,
    updatedAt: createdAt,
    resolvedAt: null,
    reportedOn: createdAt.slice(0, 10),
    resolvedOn: null,
    ...overrides,
  };
}

export function makeBugDashboard(overrides: Partial<BugDashboardData> = {}): BugDashboardData {
  return { today: DASHBOARD_NOW.slice(0, 10), now: DASHBOARD_NOW, bugs: [], tags: [], ...overrides };
}
