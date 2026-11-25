import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { OverviewScreen } from './overview-screen';
import { getOverview, getOverviewTrends, type Overview, type OverviewTrends } from '../../lib/overview-api';
import { listProjectActivity, type ActivityEntry } from '../../lib/activity-api';
import { useSessionContext } from '../../lib/session-context';
import { renderWithProviders } from '../../test/render-with-providers';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/overview',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../../lib/session-context', () => ({ useSessionContext: vi.fn() }));
vi.mock('../../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api-client')>()),
  useApiClient: () => ({ request: vi.fn() }),
}));
vi.mock('../../lib/overview-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/overview-api')>()),
  getOverview: vi.fn(),
  getOverviewTrends: vi.fn(),
}));
vi.mock('../../lib/activity-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/activity-api')>()),
  listProjectActivity: vi.fn(),
}));

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const overview = (overrides: Partial<Overview> = {}): Overview => ({
  testCases: { total: 33, readyPct: 70, coveragePct: 82 },
  passRate: 76,
  activeExecutions: 1,
  openBugs: 5,
  criticalBugs: 1,
  health: { score: 72, band: 'AtRisk', components: { passRate: 76, coverage: 82, bugPressure: 52, freshness: 60 } },
  topFailingTests: [{ id: 'tc-1', name: 'Pay with card', failed: 3, completed: 4, failRatePct: 75 }],
  failingBelowMinimum: 0,
  urgentBugs: [{ id: 'bug-1', title: 'Checkout total wrong', severity: 'Critical', status: 'Open', createdAt: daysAgo(3) }],
  ...overrides,
});

const entry = (i: number): ActivityEntry => ({
  id: `a${i}`,
  actorName: 'Ana',
  actionCode: 'test_case.created',
  entityType: 'test_case',
  entityId: `t${i}`,
  entityName: `Case ${i}`,
  details: {},
  createdAt: daysAgo(0),
});

const tile = (name: string) => screen.getByRole('region', { name });

const DATES = Array.from({ length: 90 }, (_, i) => new Date(Date.UTC(2026, 10, 24 - 89 + i)).toISOString().slice(0, 10));

/** 90 quiet days ending in a busy one: 8 of 10 runs passed, 3 bugs reported and 1 resolved. */
const trends = (overrides: Partial<OverviewTrends> = {}): OverviewTrends => ({
  days: DATES.map((date, i) =>
    i === 89 ? { date, completed: 10, passed: 8, reported: 3, resolved: 1 } : { date, completed: 0, passed: 0, reported: 0, resolved: 0 },
  ),
  health: DATES.map((day, i) => ({ day, score: i < 80 ? null : 60 + (i - 80), band: i < 80 ? null : 'AtRisk', source: i === 89 ? 'live' : 'recomputed' })),
  outcomes30d: { pass: 30, fail: 6, needsReview: 4 },
  ...overrides,
});

const chart = (name: string) => screen.findByRole('figure', { name });
const lastDay = async (name: string) => {
  const figure = await chart(name);
  fireEvent.keyDown(within(figure).getByLabelText(/use the arrow keys/), { key: 'End' });
  return within(figure).getByRole('status').textContent ?? '';
};

describe('OverviewScreen', () => {
  beforeEach(() => {
    vi.mocked(useSessionContext).mockReturnValue({
      data: { workspaceId: 'w1', projectId: 'p1', projectName: 'ShopFlow', role: 'Viewer' },
      loading: false,
    } as unknown as ReturnType<typeof useSessionContext>);
    vi.mocked(getOverview).mockReset();
    vi.mocked(listProjectActivity).mockReset();
    vi.mocked(listProjectActivity).mockResolvedValue({ entries: [entry(0)], nextCursor: null });
    vi.mocked(getOverviewTrends).mockReset();
    vi.mocked(getOverviewTrends).mockResolvedValue(trends());
  });

  it('shows the header and the seven tiles with their sub-labels', async () => {
    vi.mocked(getOverview).mockResolvedValue(overview());

    renderWithProviders(<OverviewScreen />);

    expect(await screen.findByText('72')).toBeTruthy();
    expect(screen.getByText('ShopFlow')).toBeTruthy();
    const expected: [string, string, string][] = [
      ['Health Score', '72', 'At Risk'],
      ['Total Test Cases', '33', '70% ready'],
      ['Coverage', '82%', 'run at least once'],
      ['Pass Rate', '76%', 'last 30 days'],
      ['Active Runs', '1', 'executions in progress'],
      ['Open Bugs', '5', 'open + in progress'],
      ['Critical Bugs', '1', 'open critical'],
    ];
    for (const [name, value, subLabel] of expected) {
      const region = tile(name);
      expect(within(region).getByText(value)).toBeTruthy();
      expect(within(region).getByText(subLabel)).toBeTruthy();
    }
  });

  it('colours the Health Score by its band and explains it', async () => {
    vi.mocked(getOverview).mockResolvedValue(overview());

    renderWithProviders(<OverviewScreen />);

    const value = await within(await screen.findByRole('region', { name: 'Health Score' })).findByText('72');
    expect(value.className).toContain('text-review');
    expect(within(tile('Health Score')).getByText('At Risk')).toBeTruthy();
    const info = within(tile('Health Score')).getByRole('button');
    for (const weight of ['(40%)', '(20%)', '(25%)', '(15%)']) {
      expect(info.getAttribute('aria-label')).toContain(weight);
    }
    expect(info.getAttribute('aria-label')).toMatch(/pass rate.*coverage.*bug pressure.*freshness/);
  });

  it('shows "—" for no pass rate and "No data" for no score', async () => {
    vi.mocked(getOverview).mockResolvedValue(
      overview({ passRate: null, health: { score: null, band: null, components: { passRate: 0, coverage: 0, bugPressure: 100, freshness: 0 } } }),
    );

    renderWithProviders(<OverviewScreen />);

    expect(await within(await screen.findByRole('region', { name: 'Pass Rate' })).findByText('—')).toBeTruthy();
    const health = tile('Health Score');
    expect(within(health).getByText('No data')).toBeTruthy();
    expect(within(health).getByText('No data').className).not.toMatch(/text-(pass|review|fail)/);
  });

  it('links a failing test and an urgent bug to their screens in a new tab', async () => {
    vi.mocked(getOverview).mockResolvedValue(overview());

    renderWithProviders(<OverviewScreen />);

    const failing = await within(await screen.findByRole('region', { name: 'Top Failing Tests' })).findByRole('link');
    expect(failing.getAttribute('href')).toBe('/test-cases?testCase=tc-1');
    expect(failing.getAttribute('target')).toBe('_blank');
    expect(failing.textContent).toContain('3 of 4 runs failed');
    expect(within(failing).getByText('75%').className).toContain('text-fail');

    const urgent = within(screen.getByRole('region', { name: 'Urgent Bugs' })).getByRole('link');
    expect(urgent.getAttribute('href')).toBe('/bugs?bug=bug-1');
    expect(urgent.getAttribute('target')).toBe('_blank');
    expect(urgent.textContent).toContain('Critical');
    expect(urgent.textContent).toContain('Checkout total wrong');
    expect(urgent.textContent).toContain('Open · opened 3 days ago');
  });

  it('shows each panel’s empty line, and an empty project still shows every tile', async () => {
    vi.mocked(getOverview).mockResolvedValue(
      overview({
        testCases: { total: 0, readyPct: 0, coveragePct: 0 },
        passRate: null,
        activeExecutions: 0,
        openBugs: 0,
        criticalBugs: 0,
        health: { score: null, band: null, components: { passRate: 0, coverage: 0, bugPressure: 100, freshness: 0 } },
        topFailingTests: [],
        failingBelowMinimum: 0,
        urgentBugs: [],
      }),
    );
    vi.mocked(listProjectActivity).mockResolvedValue({ entries: [], nextCursor: null });

    renderWithProviders(<OverviewScreen />);

    expect(await screen.findByText('No failing tests — nice!')).toBeTruthy();
    expect(screen.getByText('No critical or high open bugs.')).toBeTruthy();
    expect(await screen.findByText('No activity yet.')).toBeTruthy();
    expect(within(tile('Total Test Cases')).getByText('0')).toBeTruthy();
    expect(within(tile('Health Score')).getByText('No data')).toBeTruthy();
  });

  it('says failing test cases are too new to rank, instead of "nice!" (design.md decision 7)', async () => {
    vi.mocked(getOverview).mockResolvedValue(overview({ topFailingTests: [], failingBelowMinimum: 2 }));
    vi.mocked(listProjectActivity).mockResolvedValue({ entries: [], nextCursor: null });

    renderWithProviders(<OverviewScreen />);

    expect(await screen.findByText("2 failing test cases have fewer than 3 completed runs, so they aren't ranked yet.")).toBeTruthy();
    expect(screen.queryByText('No failing tests — nice!')).toBeNull();
  });

  it('notes one unranked failing test case below the ranked ones', async () => {
    vi.mocked(getOverview).mockResolvedValue(overview({ failingBelowMinimum: 1 }));
    vi.mocked(listProjectActivity).mockResolvedValue({ entries: [], nextCursor: null });

    renderWithProviders(<OverviewScreen />);

    expect(await screen.findByText("1 more failing test case has fewer than 3 completed runs and isn't ranked yet.")).toBeTruthy();
    expect(screen.getByText('3 of 4 runs failed')).toBeTruthy();
  });

  it('Recent History shows the 10 newest entries, and Full History pages the feed', async () => {
    vi.mocked(getOverview).mockResolvedValue(overview());
    const page1 = Array.from({ length: 20 }, (_, i) => entry(i));
    // Answers by cursor: the dialog's feed refetches the first page it shares with Recent History.
    vi.mocked(listProjectActivity).mockImplementation(async (_client, _projectId, _type, before) =>
      before === 'c1'
        ? { entries: [entry(20), entry(21), entry(22), entry(23), entry(24)], nextCursor: null }
        : { entries: page1, nextCursor: 'c1' },
    );

    renderWithProviders(<OverviewScreen />);

    const recent = await screen.findByRole('list', { name: 'Recent history' });
    await waitFor(() => expect(within(recent).getAllByRole('listitem')).toHaveLength(10));
    expect(within(recent).getByText('created test case “Case 0”')).toBeTruthy();
    expect(within(recent).queryByText('created test case “Case 10”')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Full History/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('created test case “Case 19”')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Load more' }));
    expect(await within(dialog).findByText('created test case “Case 24”')).toBeTruthy();
    expect(listProjectActivity).toHaveBeenLastCalledWith(expect.anything(), 'p1', null, 'c1');
  });

  it('shows placeholders while loading, and an error with a working Retry', async () => {
    let fail = true;
    vi.mocked(getOverview).mockImplementation(async () => {
      if (fail) {
        fail = false;
        throw new Error('boom');
      }
      return overview();
    });

    renderWithProviders(<OverviewScreen />);

    expect(screen.getAllByLabelText('Loading').length).toBeGreaterThan(0);
    fireEvent.click(await screen.findByRole('button', { name: /Retry/ }));
    expect(await screen.findByText('72')).toBeTruthy();
  });

  describe('charts', () => {
    it('lays out the PRD rows: Health across, two trends, then the donut with both panels', async () => {
      vi.mocked(getOverview).mockResolvedValue(overview());

      renderWithProviders(<OverviewScreen />);

      await chart('Health Score trend');
      expect(within(screen.getByTestId('overview-row-health')).getByRole('figure', { name: 'Health Score trend' })).toBeTruthy();
      const row2 = screen.getByTestId('overview-row-trends');
      expect(within(row2).getAllByRole('figure').map((f) => f.getAttribute('aria-label'))).toEqual(['Pass Rate trend', 'Bug Velocity']);
      const row3 = screen.getByTestId('overview-row-lists');
      expect(within(row3).getByRole('figure', { name: 'Run Outcomes · 30d' })).toBeTruthy();
      expect(within(row3).getByRole('region', { name: 'Top Failing Tests' })).toBeTruthy();
      expect(within(row3).getByRole('region', { name: 'Urgent Bugs' })).toBeTruthy();
    });

    it('asks for the browser’s time zone', async () => {
      vi.mocked(getOverview).mockResolvedValue(overview());

      renderWithProviders(<OverviewScreen />);

      await chart('Health Score trend');
      expect(getOverviewTrends).toHaveBeenCalledWith(expect.anything(), 'p1', Intl.DateTimeFormat().resolvedOptions().timeZone);
    });

    it('ends the Health Score trend on the tile’s score, and reads "No data yet." without one', async () => {
      // The trend's last (live) point is 69, as the API's live score would be.
      vi.mocked(getOverview).mockResolvedValue(
        overview({ health: { score: 69, band: 'AtRisk', components: { passRate: 76, coverage: 82, bugPressure: 52, freshness: 60 } } }),
      );
      const { unmount } = renderWithProviders(<OverviewScreen />);

      const health = await chart('Health Score trend');
      expect(within(tile('Health Score')).getByText('69')).toBeTruthy();
      expect(health.querySelector('figcaption')!.textContent).toContain('69% today');
      expect(await lastDay('Health Score trend')).toContain('69%');
      unmount();

      vi.mocked(getOverviewTrends).mockResolvedValue(trends({ health: DATES.map((day) => ({ day, score: null, band: null, source: 'recomputed' as const })) }));
      renderWithProviders(<OverviewScreen />);
      expect(await within(await chart('Health Score trend')).findByText('No data yet.')).toBeTruthy();
    });

    it('shows a day’s pass rate and both Bug Velocity series, and explains 0-days', async () => {
      vi.mocked(getOverview).mockResolvedValue(overview());

      renderWithProviders(<OverviewScreen />);

      expect(await lastDay('Pass Rate trend')).toContain('Pass rate 80%');
      const info = within(await chart('Pass Rate trend')).getByRole('button', { name: /drawn as 0%/ });
      expect(info).toBeTruthy();
      const velocity = await lastDay('Bug Velocity');
      expect(velocity).toContain('Reported 3');
      expect(velocity).toContain('Resolved 1');
    });

    it('shows the 30-day outcome split, or its empty line', async () => {
      vi.mocked(getOverview).mockResolvedValue(overview());
      const { unmount } = renderWithProviders(<OverviewScreen />);
      expect((await chart('Run Outcomes · 30d')).querySelector('figcaption')!.textContent).toContain('40 in total');
      unmount();

      vi.mocked(getOverviewTrends).mockResolvedValue(trends({ outcomes30d: { pass: 0, fail: 0, needsReview: 0 } }));
      renderWithProviders(<OverviewScreen />);
      expect(await within(await chart('Run Outcomes · 30d')).findByText('No completed runs yet.')).toBeTruthy();
    });
  });
});
