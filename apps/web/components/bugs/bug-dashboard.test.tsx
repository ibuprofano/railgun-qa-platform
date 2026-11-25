import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { BugDashboard, REPORT_FAILED } from './bug-dashboard';
import { REPORT_POLL_MS } from '../../lib/reports-api';
import { getBugDashboard } from '../../lib/bugs-api';
import { renderWithProviders } from '../../test/render-with-providers';
import { daysAgo, makeBugDashboard, makeDashboardBug } from '../../test/bug-fixtures';

// Reports go through the shared client (lib/reports-api.ts): POST, then status polls, then the file.
const request = vi.hoisted(() => vi.fn());
const requestBlob = vi.hoisted(() => vi.fn());
vi.mock('../../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api-client')>()),
  useApiClient: () => ({ request, requestBlob }),
}));
vi.mock('../../lib/bugs-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/bugs-api')>()),
  getBugDashboard: vi.fn(),
}));

/** 7 bugs: 2 Open, 1 In Progress, 2 Resolved, 1 Closed, 1 Won't Fix; 2 Critical. */
function tileData() {
  return makeBugDashboard({
    bugs: [
      makeDashboardBug({ id: 'o1', status: 'Open', severity: 'Critical' }),
      makeDashboardBug({ id: 'o2', status: 'Open', severity: 'Low' }),
      makeDashboardBug({ id: 'ip', status: 'InProgress' }),
      makeDashboardBug({ id: 'r1', status: 'Resolved', severity: 'High', createdAt: daysAgo(10), resolvedAt: daysAgo(8), resolvedOn: daysAgo(8).slice(0, 10) }),
      makeDashboardBug({ id: 'r2', status: 'Resolved', severity: 'High', createdAt: daysAgo(10), resolvedAt: daysAgo(4), resolvedOn: daysAgo(4).slice(0, 10) }),
      makeDashboardBug({ id: 'c1', status: 'Closed', severity: 'Critical', createdAt: daysAgo(3), resolvedAt: daysAgo(2), resolvedOn: daysAgo(2).slice(0, 10) }),
      makeDashboardBug({ id: 'w1', status: 'WontFix', createdAt: daysAgo(5), resolvedAt: daysAgo(5), resolvedOn: daysAgo(5).slice(0, 10) }),
    ],
  });
}

const tile = (name: string) => screen.getByRole('region', { name });
const legend = (title: string) =>
  within(within(screen.getByRole('figure', { name: title })).getByRole('list', { name: `${title} legend` }))
    .getAllByRole('listitem')
    .map((li) => li.textContent);

describe('BugDashboard (specs/bugs-screen)', () => {
  beforeEach(() => {
    vi.mocked(getBugDashboard).mockReset().mockResolvedValue(tileData());
  });

  it("reads the dashboard in the browser's zone, and again each time it is shown", async () => {
    const { rerender } = renderWithProviders(<BugDashboard projectId="p1" onOpenBug={() => {}} />);
    await screen.findByRole('region', { name: 'Total Bugs' });
    expect(vi.mocked(getBugDashboard).mock.calls[0][2]).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');

    rerender(<p>A bug&apos;s detail</p>);
    rerender(<BugDashboard projectId="p1" onOpenBug={() => {}} />);

    await waitFor(() => expect(getBugDashboard).toHaveBeenCalledTimes(2));
  });

  it('shows a title placeholder and four tile placeholders while loading', () => {
    vi.mocked(getBugDashboard).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<BugDashboard projectId="p1" onOpenBug={() => {}} />);
    expect(screen.getByTestId('dashboard-title-placeholder')).toBeTruthy();
    expect(screen.getAllByTestId('dashboard-tile-placeholder')).toHaveLength(4);
  });

  it('shows the empty state, with no widgets or download button, for a project with no bugs', async () => {
    vi.mocked(getBugDashboard).mockResolvedValue(makeBugDashboard());
    renderWithProviders(<BugDashboard projectId="p1" onOpenBug={() => {}} />);
    expect(await screen.findByText('No bugs yet')).toBeTruthy();
    expect(screen.getByText('Report a bug to start seeing metrics')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Download report/ })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Total Bugs' })).toBeNull();
  });

  it('shows the header with Download report enabled before any report is requested', async () => {
    renderWithProviders(<BugDashboard projectId="p1" onOpenBug={() => {}} />);
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByText('Aggregate bug metrics for this project')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Download report/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/not available yet/)).toBeNull();
  });

  describe('Download report (specs/bugs-screen)', () => {
    const reportAs = (status: string) => ({
      id: 'r1', kind: 'bugs-dashboard', status, error: null, fileName: status === 'Ready' ? 'bugs-dashboard-2026-11-24.pdf' : null,
      byteSize: null, createdAt: '2026-11-24T10:00:00.000Z', completedAt: null, expiresAt: '2026-12-01T10:00:00.000Z',
    });
    let status = 'Generating';

    beforeEach(() => {
      status = 'Generating';
      request.mockReset().mockImplementation(async (_path: string, init?: RequestInit) => (init?.method === 'POST' ? reportAs('Queued') : reportAs(status)));
      requestBlob.mockReset().mockResolvedValue({ blob: new Blob(['%PDF']), fileName: 'bugs-dashboard-2026-11-24.pdf' });
      vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
    });
    afterEach(() => vi.useRealTimers());

    it('requests the report with the chart range and the browser zone', async () => {
      renderWithProviders(<BugDashboard projectId="p1" onOpenBug={() => {}} />);
      const all = await screen.findByRole('figure', { name: 'Reported vs Resolved' });
      fireEvent.click(within(all).getByRole('radio', { name: '15d' }));
      fireEvent.click(screen.getByRole('button', { name: /Download report/ }));

      await waitFor(() => expect(request).toHaveBeenCalledWith('/projects/p1/reports', expect.objectContaining({ method: 'POST' })));
      const body = JSON.parse(request.mock.calls.find(([, init]) => init?.method === 'POST')![1].body);
      expect(body).toEqual({ kind: 'bugs-dashboard', tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', range: 15 });
    });

    it('shows Generating… until the report is Ready, polling without live events, then downloads it', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      renderWithProviders(<BugDashboard projectId="p1" onOpenBug={() => {}} />);
      fireEvent.click(await screen.findByRole('button', { name: /Download report/ }));
      const button = await screen.findByRole('button', { name: 'Generating…' });
      expect((button as HTMLButtonElement).disabled).toBe(true);

      status = 'Ready';
      await act(async () => {
        await vi.advanceTimersByTimeAsync(REPORT_POLL_MS + 10);
      });
      await waitFor(() => expect(requestBlob).toHaveBeenCalledWith('/projects/p1/reports/r1/file'));
      expect(await screen.findByRole('button', { name: /Download report/ })).toBeTruthy();
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    });

    it('says the report failed, and Try again requests a new one', async () => {
      status = 'Failed';
      renderWithProviders(<BugDashboard projectId="p1" onOpenBug={() => {}} />);
      fireEvent.click(await screen.findByRole('button', { name: /Download report/ }));
      expect((await screen.findByRole('alert')).textContent).toContain(REPORT_FAILED);

      status = 'Generating';
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await waitFor(() => expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2));
    });
  });

  it('reads the four tiles', async () => {
    renderWithProviders(<BugDashboard projectId="p1" onOpenBug={() => {}} />);
    await screen.findByRole('region', { name: 'Total Bugs' });
    expect(tile('Total Bugs').textContent).toContain('7');
    expect(tile('Total Bugs').textContent).toContain('1 in progress');
    expect(tile('Open').textContent).toContain('2needs attention');
    expect(tile('Resolved').textContent).toContain('of 7 total');
    expect(tile('Critical (all time)').textContent).toContain('2highest severity');
  });

  it('shares one range between both Reported vs Resolved charts, and hides a series in one only', async () => {
    renderWithProviders(<BugDashboard projectId="p1" onOpenBug={() => {}} />);
    const all = await screen.findByRole('figure', { name: 'Reported vs Resolved' });
    const critical = screen.getByRole('figure', { name: 'Reported vs Resolved — Critical' });

    fireEvent.click(within(all).getByRole('radio', { name: '7d' }));
    expect(within(all).getByRole('radio', { name: '7d' }).getAttribute('aria-checked')).toBe('true');
    expect(within(critical).getByRole('radio', { name: '7d' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(within(critical).getByRole('button', { name: 'Reported' }));
    expect(within(critical).getByRole('button', { name: 'Reported' }).getAttribute('aria-pressed')).toBe('false');
    expect(within(all).getByRole('button', { name: 'Reported' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('colours severities and splits bugs in the four donuts', async () => {
    renderWithProviders(<BugDashboard projectId="p1" onOpenBug={() => {}} />);
    const severity = await screen.findByRole('figure', { name: 'All Bugs by Severity' });
    expect([...severity.querySelectorAll('svg path[data-part]')].map((p) => p.getAttribute('fill'))).toEqual([
      'var(--sev-critical)',
      'var(--sev-high)',
      'var(--sev-medium)',
      'var(--sev-low)',
    ]);
    expect(legend('All Bugs by Status')).toEqual(['Open2 (29%)', 'In Progress1 (14%)', 'Resolved2 (29%)', 'Closed1 (14%)', "Won't Fix1 (14%)"]);
    expect(legend('Open by Severity')).toEqual(['Critical1 (33%)', 'Medium1 (33%)', 'Low1 (33%)']);
    const age = screen.getByRole('figure', { name: 'Backlog Age' });
    expect(within(age).getByRole('button', { name: /Fresh under 7 days/ })).toBeTruthy();
  });

  it('shows empty lines for the open donuts when every bug is resolved', async () => {
    vi.mocked(getBugDashboard).mockResolvedValue(
      makeBugDashboard({ bugs: [makeDashboardBug({ status: 'Closed', resolvedAt: daysAgo(0) })] }),
    );
    renderWithProviders(<BugDashboard projectId="p1" onOpenBug={() => {}} />);
    const open = await screen.findByRole('figure', { name: 'Open by Severity' });
    expect(within(open).getByText('No open bugs.')).toBeTruthy();
    expect(within(screen.getByRole('figure', { name: 'Backlog Age' })).getByText('No open bugs.')).toBeTruthy();
  });

  it('lists Avg Resolution Time per severity, and says when nothing is resolved', async () => {
    const { unmount } = renderWithProviders(<BugDashboard projectId="p1" onOpenBug={() => {}} />);
    const list = await screen.findByRole('list', { name: 'Avg Resolution Time' });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Critical1d(1 bug)',
      'High4d(2 bugs)',
      'Medium0d(1 bug)',
    ]);
    unmount();

    vi.mocked(getBugDashboard).mockResolvedValue(makeBugDashboard({ bugs: [makeDashboardBug()] }));
    renderWithProviders(<BugDashboard projectId="p1" onOpenBug={() => {}} />);
    expect(await screen.findByText('No resolved bugs yet')).toBeTruthy();
  });

  it('draws the tag cloud, larger for more bugs, and says when nothing is tagged', async () => {
    vi.mocked(getBugDashboard).mockResolvedValue(
      makeBugDashboard({
        bugs: [
          ...Array.from({ length: 4 }, () => makeDashboardBug({ tagIds: ['t-checkout'] })),
          makeDashboardBug({ tagIds: ['t-ui'] }),
        ],
        tags: [
          { id: 't-checkout', name: 'checkout', color: 'red' },
          { id: 't-ui', name: 'ui', color: 'blue' },
        ],
      }),
    );
    const { unmount } = renderWithProviders(<BugDashboard projectId="p1" onOpenBug={() => {}} />);
    const cloud = await screen.findByRole('figure', { name: 'Bugs by Tag' });
    const checkout = cloud.querySelector('[data-word="t-checkout"]')!;
    const ui = cloud.querySelector('[data-word="t-ui"]')!;
    expect(checkout.getAttribute('fill')).toBe('var(--tag-red)');
    expect(Number(checkout.getAttribute('font-size'))).toBeGreaterThan(Number(ui.getAttribute('font-size')));
    unmount();

    vi.mocked(getBugDashboard).mockResolvedValue(tileData());
    renderWithProviders(<BugDashboard projectId="p1" onOpenBug={() => {}} />);
    expect(await screen.findByText('No tagged bugs yet.')).toBeTruthy();
  });
});
