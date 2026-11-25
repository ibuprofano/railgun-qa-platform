import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { DEFAULT_RUN_TABLE_STATE, type DashboardRun, type RunTableState } from '@railgun-qa/reporting';
import { ExecutionRunsTable, RUNS_PAGE_SIZE } from './execution-runs-table';
import { ExecutionDashboard } from './execution-dashboard';
import { getExecutionDashboard } from '../../lib/executions-api';
import { renderWithProviders } from '../../test/render-with-providers';
import { makeDashboardData, makeDashboardExecution, makeDashboardRun } from '../../test/execution-fixtures';
import { shortDate } from '../charts/chart-format';

vi.mock('../../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api-client')>()),
  useApiClient: () => ({ request: vi.fn() }),
}));
vi.mock('../../lib/executions-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/executions-api')>()),
  getExecutionDashboard: vi.fn(),
}));
vi.mock('../../lib/tags-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tags-api')>()),
  listTags: vi.fn(async () => []),
}));
vi.mock('../../lib/activity-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/activity-api')>()),
  listProjectActivity: vi.fn(async () => ({ entries: [], nextCursor: null })),
}));

/** A controllable IntersectionObserver: `reveal()` reports the sentinel as visible. */
let observers: { callback: IntersectionObserverCallback; elements: Element[] }[] = [];
class FakeObserver {
  private entry: { callback: IntersectionObserverCallback; elements: Element[] };
  constructor(callback: IntersectionObserverCallback) {
    this.entry = { callback, elements: [] };
    observers.push(this.entry);
  }
  observe(element: Element) {
    this.entry.elements.push(element);
  }
  disconnect() {
    observers = observers.filter((o) => o !== this.entry);
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
}
const reveal = () =>
  act(() => {
    for (const o of [...observers]) {
      o.callback(o.elements.map((target) => ({ target, isIntersecting: true })) as IntersectionObserverEntry[], {} as IntersectionObserver);
    }
  });

function Table({ runs, initial = {} }: { runs: DashboardRun[]; initial?: Partial<RunTableState> }) {
  const [state, setState] = useState<RunTableState>({ ...DEFAULT_RUN_TABLE_STATE, ...initial });
  return <ExecutionRunsTable runs={runs} state={state} onStateChange={setState} />;
}
const rows = () => screen.queryAllByTestId('dashboard-run-row');
const names = () => rows().map((row) => row.querySelector('.font-medium')!.textContent);

describe('ExecutionRunsTable (specs/executions-screen)', () => {
  beforeEach(() => {
    observers = [];
    vi.stubGlobal('IntersectionObserver', FakeObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens on Needs Attention, with its count and only those runs', () => {
    const runs = [
      ...Array.from({ length: 4 }, (_, i) => makeDashboardRun({ outcome: 'NeedsReview', testCaseName: `Review ${i}` })),
      makeDashboardRun({ outcome: 'Pass', testCaseName: 'Passed one' }),
    ];
    render(<Table runs={runs} />);

    expect(screen.getByRole('tab', { name: /Needs Attention/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('needs-attention-count').textContent).toBe('4');
    expect(rows()).toHaveLength(4);
  });

  it('filters by the test case or the execution name', () => {
    const runs = [
      makeDashboardRun({ outcome: 'Pass', testCaseName: 'Checkout', executionName: 'Nightly smoke' }),
      makeDashboardRun({ outcome: 'Pass', testCaseName: 'Smoke test of search', executionName: 'Regression' }),
      makeDashboardRun({ outcome: 'Pass', testCaseName: 'Sign in', executionName: 'Regression' }),
    ];
    render(<Table runs={runs} initial={{ tab: 'all' }} />);

    fireEvent.change(screen.getByLabelText('Filter runs by name'), { target: { value: 'smoke' } });

    expect(names().sort()).toEqual(['Checkout', 'Smoke test of search']);
  });

  it('names the chart filter, and Clear filter keeps the tab and the name', () => {
    const runs = [
      makeDashboardRun({ outcome: 'Fail', completedOn: '2026-03-04', testCaseName: 'Pay A' }),
      makeDashboardRun({ outcome: 'Pass', completedOn: '2026-03-04', testCaseName: 'Pay B' }),
      makeDashboardRun({ outcome: 'Fail', completedOn: '2026-03-05', testCaseName: 'Other' }),
    ];
    render(<Table runs={runs} initial={{ tab: 'all', name: 'pay', day: { date: '2026-03-04', outcome: 'Fail' } }} />);

    expect(screen.getByTestId('chart-filter-label').textContent).toBe(`${shortDate('2026-03-04')} · Failed`);
    expect(names()).toEqual(['Pay A']);

    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));

    expect(screen.queryByTestId('chart-filter-label')).toBeNull();
    expect(names().sort()).toEqual(['Pay A', 'Pay B']);
    expect(screen.getByRole('tab', { name: 'All Runs' }).getAttribute('aria-selected')).toBe('true');
  });

  it('sorts by Bugs, descending, and marks bugs above 0 in red', () => {
    const runs = [
      makeDashboardRun({ outcome: 'Pass', testCaseName: 'One bug', bugCount: 1 }),
      makeDashboardRun({ outcome: 'Pass', testCaseName: 'No bugs', bugCount: 0 }),
      makeDashboardRun({ outcome: 'Pass', testCaseName: 'Most bugs', bugCount: 3 }),
    ];
    render(<Table runs={runs} initial={{ tab: 'all' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Bugs' }));

    expect(screen.getByRole('columnheader', { name: /Bugs/ }).getAttribute('aria-sort')).toBe('descending');
    expect(names()).toEqual(['Most bugs', 'One bug', 'No bugs']);
    const counts = screen.getAllByTestId('bug-count');
    expect(counts[0].className).toContain('text-fail');
    expect(counts[2].className).not.toContain('text-fail');

    fireEvent.click(screen.getByRole('button', { name: 'Bugs' }));
    expect(names()).toEqual(['No bugs', 'One bug', 'Most bugs']);
  });

  it('shows a recorded failed step in red under the test case name, with the execution below', () => {
    render(<Table runs={[makeDashboardRun({ outcome: 'Fail', failedStep: 'Then the total is $10', executionName: 'Payments' })]} initial={{ tab: 'all' }} />);

    const step = screen.getByTestId('failed-step');
    expect(step.textContent).toBe('Then the total is $10');
    expect(step.className).toContain('text-fail');
    expect(rows()[0].textContent).toContain('Payments');
  });

  it('renders the first rows and adds more as the end comes into view, restarting on any change', () => {
    const runs = Array.from({ length: 120 }, (_, i) => makeDashboardRun({ outcome: 'Pass', testCaseName: `Case ${String(i).padStart(3, '0')}` }));
    render(<Table runs={runs} initial={{ tab: 'all' }} />);

    expect(rows()).toHaveLength(RUNS_PAGE_SIZE);
    expect(screen.getByTestId('runs-counter').textContent).toBe(`${RUNS_PAGE_SIZE} of 120`);

    reveal();
    expect(screen.getByTestId('runs-counter').textContent).toBe(`${2 * RUNS_PAGE_SIZE} of 120`);
    reveal();
    expect(screen.getByTestId('runs-counter').textContent).toBe('120 of 120');
    expect(screen.queryByTestId('runs-sentinel')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Order' }));
    expect(screen.getByTestId('runs-counter').textContent).toBe(`${RUNS_PAGE_SIZE} of 120`);
  });

  it('offers Show more where IntersectionObserver is missing', () => {
    vi.unstubAllGlobals();
    const original = globalThis.IntersectionObserver;
    // @ts-expect-error -- simulating a browser without it
    delete globalThis.IntersectionObserver;
    try {
      render(<Table runs={Array.from({ length: 60 }, () => makeDashboardRun({ outcome: 'Pass' }))} initial={{ tab: 'all' }} />);
      fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
      expect(screen.getByTestId('runs-counter').textContent).toBe('60 of 60');
    } finally {
      if (original) globalThis.IntersectionObserver = original;
    }
  });

  it('opens a run in its execution, in a new tab', () => {
    render(<Table runs={[makeDashboardRun({ id: 'r-9', executionId: 'e-3', outcome: 'NeedsReview' })]} />);

    const link = rows()[0] as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/executions?execution=e-3&run=r-9');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('reads "No runs need review." on an empty Needs Attention, and "No runs match this filter." otherwise', () => {
    render(<Table runs={[makeDashboardRun({ outcome: 'Pass', testCaseName: 'Ok' })]} />);
    expect(screen.getByText('No runs need review.')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'All Runs' }));
    fireEvent.change(screen.getByLabelText('Filter runs by name'), { target: { value: 'zzz' } });
    expect(screen.getByText('No runs match this filter.')).toBeTruthy();
  });
});

describe('the run charts filter the runs table', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.mocked(getExecutionDashboard).mockReset().mockResolvedValue(
      makeDashboardData({
        today: '2026-11-24',
        executions: [makeDashboardExecution({ id: 'exec-1' })],
        runs: [
          makeDashboardRun({ outcome: 'Fail', completedOn: '2026-11-24', testCaseName: 'Failed today' }),
          makeDashboardRun({ outcome: 'Fail', completedOn: '2026-11-23', testCaseName: 'Failed yesterday' }),
          makeDashboardRun({ outcome: 'Pass', completedOn: '2026-11-24', testCaseName: 'Passed today' }),
          makeDashboardRun({ outcome: 'NeedsReview', completedOn: '2026-11-24', testCaseName: 'To review' }),
        ],
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const renderDashboard = async () => {
    renderWithProviders(<ExecutionDashboard projectId="p1" filters={{}} onFiltersChange={() => {}} />);
    return screen.findByRole('figure', { name: 'Runs Over Time' });
  };

  it("selecting a day's Failed segment switches to All Runs and lists those runs", async () => {
    const chart = await renderDashboard();
    expect(names()).toEqual(['To review']);

    fireEvent.click(chart.querySelector('[data-segment="2026-11-24:Fail"]')!);

    expect(screen.getByRole('tab', { name: 'All Runs' }).getAttribute('aria-selected')).toBe('true');
    expect(names()).toEqual(['Failed today']);
    expect(screen.getByTestId('chart-filter-label').textContent).toBe(`${shortDate('2026-11-24')} · Failed`);
  });

  it('selecting an outcome clears the day filter, and selecting it again clears it', async () => {
    const chart = await renderDashboard();
    fireEvent.click(chart.querySelector('[data-segment="2026-11-24:Fail"]')!);
    const outcomes = screen.getByRole('figure', { name: 'Run Outcomes' });

    fireEvent.click(within(outcomes).getByRole('button', { name: /^Pass/ }));

    expect(screen.getByTestId('chart-filter-label').textContent).toBe('Pass');
    expect(names()).toEqual(['Passed today']);

    fireEvent.click(within(screen.getByRole('figure', { name: 'Run Outcomes' })).getByRole('button', { name: /^Pass/ }));

    expect(screen.queryByTestId('chart-filter-label')).toBeNull();
    expect(rows()).toHaveLength(4);
  });
});
