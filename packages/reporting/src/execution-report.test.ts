import { describe, expect, it } from 'vitest';
import { executionReportData } from './execution-report';
import {
  DEFAULT_RUN_TABLE_STATE,
  executionTiles,
  scopeDashboard,
  type DashboardExecution,
  type DashboardRun,
  type ExecutionDashboardData,
  type ExecutionReportOptions,
} from './execution-dashboard';

const execution = (o: Partial<DashboardExecution>): DashboardExecution => ({
  id: 'e1', name: 'Smoke', status: 'Done', environmentName: 'Staging', browser: 'Chromium', tagIds: [], completedOn: null, ...o,
});
let seq = 0;
const run = (o: Partial<DashboardRun>): DashboardRun => {
  seq += 1;
  return {
    id: `r${seq}`, executionId: 'e1', executionName: 'Smoke', position: seq, testCaseId: `tc${seq}`, testCaseName: `Case ${seq}`,
    outcome: 'Pending', completedOn: null, attempts: 1, bugCount: 0, failedStep: null,
    createdAt: '2026-03-01T10:00:00.000Z', outcomeUpdatedAt: null, ...o,
  };
};

const data: ExecutionDashboardData = {
  today: '2026-03-10',
  executions: [
    execution({ id: 'e1', name: 'Staging smoke', environmentName: 'Staging', status: 'Done', completedOn: '2026-03-04', tagIds: ['t1'] }),
    execution({ id: 'e2', name: 'Prod regression', environmentName: 'Prod', status: 'InProgress' }),
  ],
  runs: [
    run({ executionId: 'e1', executionName: 'Staging smoke', outcome: 'Fail', completedOn: '2026-03-04', bugCount: 1, outcomeUpdatedAt: '2026-03-04T10:00:00.000Z' }),
    run({ executionId: 'e1', executionName: 'Staging smoke', outcome: 'Fail', completedOn: '2026-03-04', bugCount: 3, outcomeUpdatedAt: '2026-03-04T11:00:00.000Z' }),
    run({ executionId: 'e1', executionName: 'Staging smoke', outcome: 'Pass', completedOn: '2026-03-04', outcomeUpdatedAt: '2026-03-04T12:00:00.000Z' }),
    run({ executionId: 'e1', executionName: 'Staging smoke', outcome: 'NeedsReview', completedOn: '2026-03-09', outcomeUpdatedAt: '2026-03-09T12:00:00.000Z' }),
    run({ executionId: 'e2', executionName: 'Prod regression', outcome: 'Fail', completedOn: '2026-03-08', outcomeUpdatedAt: '2026-03-08T12:00:00.000Z' }),
  ],
};

const options = (o: Partial<ExecutionReportOptions> = {}): ExecutionReportOptions => ({
  tz: 'UTC',
  filters: {},
  runTable: { ...DEFAULT_RUN_TABLE_STATE },
  ranges: { executionsOverTime: 30, runsOverTime: 30 },
  include: { executions: true, runs: false },
  ...o,
});
const context = { projectName: 'ShopFlow', tagName: (id: string) => (id === 't1' ? 'payments' : id) };

describe('executionReportData (specs/executions-dashboard-report)', () => {
  it('scopes tiles, charts and donuts to the filtered executions', () => {
    const report = executionReportData(data, options({ filters: { environmentName: 'Staging' } }), context);
    expect(report.filters).toEqual(['Environment: Staging']);
    expect(report.tiles).toEqual(executionTiles(scopeDashboard(data, { environmentName: 'Staging' })));
    expect(report.executions!.map((e) => e.name)).toEqual(['Staging smoke']);
    expect(report.donuts[0].legend.map((l) => [l.label, l.count])).toEqual([['Done', 1]]);
    expect(report.donuts[1].total).toBe(4);
  });

  it('draws each chart over its own range', () => {
    const report = executionReportData(data, options({ ranges: { executionsOverTime: 30, runsOverTime: 7 } }), context);
    expect(report.charts.map((c) => c.title)).toEqual(['Executions Over Time (last 30 days)', 'Runs Over Time (last 7 days)']);
    expect(report.charts[0].svg).toContain('>9 Feb</text>');
    expect(report.charts[1].svg).toContain('>4 Mar</text>');
    expect(report.charts[1].svg).not.toContain('>3 Mar</text>');
  });

  it('lists only Needs Review runs with Needs Attention and Runs only, and no executions table', () => {
    const report = executionReportData(data, options({ include: { executions: false, runs: true } }), context);
    expect(report.executions).toBeNull();
    expect(report.runs!.filter).toBe('Needs Attention');
    expect(report.runs!.rows.map((r) => r.outcome)).toEqual(['Needs Review']);
  });

  it('applies a day filter and the bugs sort, naming the filter', () => {
    const runTable = { ...DEFAULT_RUN_TABLE_STATE, tab: 'all' as const, day: { date: '2026-03-04', outcome: 'Fail' as const }, sort: { key: 'bugs' as const, direction: 'desc' as const } };
    const report = executionReportData(data, options({ runTable, include: { executions: false, runs: true } }), context);
    expect(report.runs!.filter).toBe('All Runs · 4 Mar · Failed');
    expect(report.runs!.rows.map((r) => r.bugs)).toEqual([3, 1]);
  });

  it('names tag filters by their tag names', () => {
    expect(executionReportData(data, options({ filters: { tagIds: ['t1'] } }), context).filters).toEqual(['Tags: payments']);
  });
});
