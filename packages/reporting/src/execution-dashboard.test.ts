import { describe, expect, it } from 'vitest';
import {
  buildReportOptions,
  chartFilterLabel,
  dayRange,
  DEFAULT_RUN_TABLE_STATE,
  describeFilters,
  executionDailySeries,
  executionDashboardFromRows,
  executionStatusSplit,
  executionTiles,
  filterExecutions,
  filterRuns,
  isDashboardFiltered,
  runOutcomeSplit,
  scopeDashboard,
  sortRuns,
  type DashboardExecution,
  type DashboardRun,
  type RunTableState,
} from './execution-dashboard';

function execution(overrides: Partial<DashboardExecution> = {}): DashboardExecution {
  return {
    id: 'e1',
    name: 'Smoke',
    status: 'Done',
    environmentName: 'Staging',
    browser: 'Chromium',
    tagIds: [],
    completedOn: null,
    ...overrides,
  };
}

let seq = 0;
function run(overrides: Partial<DashboardRun> = {}): DashboardRun {
  seq += 1;
  return {
    id: `r${String(seq).padStart(3, '0')}`,
    executionId: 'e1',
    executionName: 'Regression',
    position: seq,
    testCaseId: `tc${seq}`,
    testCaseName: `Case ${seq}`,
    outcome: 'Pending',
    completedOn: null,
    attempts: 1,
    bugCount: 0,
    failedStep: null,
    createdAt: '2026-03-01T10:00:00.000Z',
    outcomeUpdatedAt: null,
    ...overrides,
  };
}

const ids = (list: { id: string }[]) => list.map((r) => r.id);

describe('filterExecutions', () => {
  const list = [
    execution({ id: 'a', name: 'Payments smoke', tagIds: ['payments'] }),
    execution({ id: 'b', name: 'Release regression', status: 'Canceled', environmentName: 'Prod' }),
  ];

  it('matches any picked tag, and every tag when none is picked', () => {
    expect(ids(filterExecutions(list, { tagIds: ['payments'] }))).toEqual(['a']);
    expect(ids(filterExecutions(list, { tagIds: [] }))).toEqual(['a', 'b']);
  });

  it('filters by Canceled', () => {
    expect(ids(filterExecutions(list, { status: 'Canceled' }))).toEqual(['b']);
  });

  it('names the active filters', () => {
    expect(describeFilters({ status: 'InProgress', environmentName: 'Staging', tagIds: ['t1'], name: ' smoke ' }, (id) => `#${id}`)).toEqual([
      'Name: smoke',
      'Status: In Progress',
      'Environment: Staging',
      'Tags: #t1',
    ]);
  });
});

describe('executionDashboardFromRows', () => {
  it('maps rows to the response, with ISO times and numeric counts', () => {
    const data = executionDashboardFromRows(
      '2026-03-04',
      [{ id: 'e1', name: 'Smoke', status: 'Done', environment_name: null, browser: 'Firefox', tag_ids: ['t'], completed_on: '2026-03-04' }],
      [
        {
          id: 'r1',
          execution_id: 'e1',
          execution_name: 'Smoke',
          position: 1,
          test_case_id: null,
          test_case_name: 'Sign in',
          outcome: 'Fail',
          completed_on: '2026-03-04',
          attempts: 2,
          bug_count: 1,
          failed_step: 'Then it fails',
          created_at: new Date('2026-03-01T00:00:00Z'),
          outcome_updated_at: new Date('2026-03-04T08:00:00Z'),
        },
      ],
    );
    expect(data.executions[0]).toMatchObject({ environmentName: null, browser: 'Firefox', tagIds: ['t'], completedOn: '2026-03-04' });
    expect(data.runs[0]).toMatchObject({
      executionId: 'e1',
      attempts: 2,
      bugCount: 1,
      failedStep: 'Then it fails',
      createdAt: '2026-03-01T00:00:00.000Z',
      outcomeUpdatedAt: '2026-03-04T08:00:00.000Z',
    });
  });
});

describe('tiles', () => {
  it('reads the figures for a scope', () => {
    const executions = [execution({ id: 'e1', status: 'InProgress' }), execution({ id: 'e2', status: 'Done' })];
    const runs = [
      ...['Pass', 'Pass', 'Pass', 'Fail', 'Fail', 'NeedsReview'].map((outcome) => run({ executionId: 'e1', outcome: outcome as DashboardRun['outcome'] })),
      ...Array.from({ length: 4 }, () => run({ executionId: 'e2' })),
    ];
    expect(executionTiles({ executions, runs })).toEqual({
      executions: 2,
      active: 1,
      totalRuns: 10,
      completedRuns: 6,
      passedRuns: 3,
      passRatePct: 50,
      avgDurationSeconds: null,
    });
  });

  it('has no pass rate without completed runs', () => {
    expect(executionTiles({ executions: [execution()], runs: [run()] }).passRatePct).toBeNull();
  });

  it('has no average duration for manual runs', () => {
    expect(executionTiles({ executions: [execution()], runs: [run({ outcome: 'Pass', completedOn: '2026-03-04' })] }).avgDurationSeconds).toBeNull();
  });
});

describe('daily series and splits', () => {
  it('builds days ending today across a month boundary', () => {
    expect(dayRange('2026-03-02', 3)).toEqual(['2026-02-28', '2026-03-01', '2026-03-02']);
  });

  it('counts one day of runs by outcome, and 0 elsewhere', () => {
    const runs = [
      ...Array.from({ length: 3 }, () => run({ outcome: 'Pass', completedOn: '2026-03-04' })),
      run({ outcome: 'Fail', completedOn: '2026-03-04' }),
      run({ outcome: 'Pending' }),
    ];
    const series = executionDailySeries({ executions: [execution({ completedOn: '2026-03-03' })], runs }, '2026-03-04', 7);
    expect(series.dates).toHaveLength(7);
    expect(series.passed.at(-1)).toBe(3);
    expect(series.failed.at(-1)).toBe(1);
    expect(series.needsReview.at(-1)).toBe(0);
    expect(series.passed.slice(0, -1).every((n) => n === 0)).toBe(true);
    expect(series.completedExecutions.at(-2)).toBe(1);
  });

  it('ignores days outside the range', () => {
    const series = executionDailySeries({ executions: [], runs: [run({ outcome: 'Pass', completedOn: '2025-01-01' })] }, '2026-03-04');
    expect(series.dates).toHaveLength(90);
    expect(series.passed.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('narrows every figure to the scope', () => {
    const data = {
      executions: [execution({ id: 'stg', environmentName: 'Staging', status: 'Done' }), execution({ id: 'prd', environmentName: 'Prod', status: 'Draft' })],
      runs: [run({ executionId: 'stg', outcome: 'Pass' }), run({ executionId: 'prd', outcome: 'Fail' }), run({ executionId: 'prd' })],
    };
    const scope = scopeDashboard(data, { environmentName: 'Staging' });
    expect(executionTiles(scope)).toMatchObject({ executions: 1, totalRuns: 1, passRatePct: 100 });
    expect(executionStatusSplit(scope)).toMatchObject({ Done: 1, Draft: 0 });
    expect(runOutcomeSplit(scope)).toEqual({ Pass: 1, Fail: 0, NeedsReview: 0, Pending: 0 });
  });
});

describe('runs table', () => {
  const state = (overrides: Partial<RunTableState> = {}): RunTableState => ({ ...DEFAULT_RUN_TABLE_STATE, ...overrides });

  it('applies the tab, outcome, day and name filters in order', () => {
    const review = run({ outcome: 'NeedsReview', completedOn: '2026-03-04', testCaseName: 'Checkout' });
    const failed = run({ outcome: 'Fail', completedOn: '2026-03-04', executionName: 'Nightly smoke' });
    const failedOther = run({ outcome: 'Fail', completedOn: '2026-03-05' });
    const all = [review, failed, failedOther];
    expect(ids(filterRuns(all, state()))).toEqual([review.id]);
    expect(ids(filterRuns(all, state({ tab: 'all', outcome: 'Fail' })))).toEqual([failed.id, failedOther.id]);
    expect(ids(filterRuns(all, state({ tab: 'all', day: { date: '2026-03-04', outcome: 'Fail' } })))).toEqual([failed.id]);
    expect(ids(filterRuns(all, state({ tab: 'all', name: 'SMOKE' })))).toEqual([failed.id]);
    expect(ids(filterRuns(all, state({ tab: 'all', name: 'check' })))).toEqual([review.id]);
  });

  it('sorts missing values last in both directions', () => {
    const pending = run();
    const early = run({ outcome: 'Pass', outcomeUpdatedAt: '2026-03-01T00:00:00Z' });
    const late = run({ outcome: 'Fail', outcomeUpdatedAt: '2026-03-02T00:00:00Z' });
    expect(ids(sortRuns([pending, early, late], { key: 'updatedAt', direction: 'desc' }))).toEqual([late.id, early.id, pending.id]);
    expect(ids(sortRuns([pending, late, early], { key: 'updatedAt', direction: 'asc' }))).toEqual([early.id, late.id, pending.id]);
  });

  it('breaks ties by execution name, then position', () => {
    const b2 = run({ executionName: 'B', position: 2, bugCount: 1 });
    const a5 = run({ executionName: 'A', position: 5, bugCount: 1 });
    const a1 = run({ executionName: 'A', position: 1, bugCount: 1 });
    const most = run({ executionName: 'Z', bugCount: 3 });
    expect(ids(sortRuns([b2, a5, most, a1], { key: 'bugs', direction: 'desc' }))).toEqual([most.id, a1.id, a5.id, b2.id]);
  });

  it('labels the chart filter', () => {
    expect(chartFilterLabel({ outcome: 'Pass', day: null })).toBe('Pass');
    expect(chartFilterLabel({ outcome: null, day: { date: '2026-03-04', outcome: 'Fail' } })).toBe('4 Mar · Failed');
    expect(chartFilterLabel({ outcome: null, day: null })).toBeNull();
  });

  it('counts the Needs Attention tab as a filter', () => {
    expect(isDashboardFiltered({}, state())).toBe(true);
    expect(isDashboardFiltered({}, state({ tab: 'all' }))).toBe(false);
    expect(isDashboardFiltered({ browser: 'Firefox' }, state({ tab: 'all' }))).toBe(true);
    expect(isDashboardFiltered({}, state({ tab: 'all', name: 'x' }))).toBe(true);
  });
});

describe('buildReportOptions', () => {
  it('keeps only active filters and copies the table state and ranges', () => {
    const options = buildReportOptions({
      tz: 'Europe/Madrid',
      filters: { name: '  ', status: 'Done', tagIds: [] },
      runTable: { ...DEFAULT_RUN_TABLE_STATE, tab: 'all', day: { date: '2026-03-04', outcome: 'Fail' }, name: ' smoke ' },
      ranges: { executionsOverTime: 15, runsOverTime: 7 },
      include: { executions: true, runs: false },
    });
    expect(options.filters).toEqual({ status: 'Done' });
    expect(options.runTable).toMatchObject({ tab: 'all', day: { date: '2026-03-04', outcome: 'Fail' }, name: 'smoke' });
    expect(options.ranges).toEqual({ executionsOverTime: 15, runsOverTime: 7 });
  });
});
