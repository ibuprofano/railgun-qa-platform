import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { TestCaseDashboard } from './test-case-dashboard';
import { getTestCaseDashboard } from '../../lib/test-cases-api';
import { REPORT_FAILED, REPORT_POLL_MS } from '../../lib/reports-api';
import { renderWithProviders } from '../../test/render-with-providers';
import { makeAttentionRow, makeDashboard, makeDays } from '../../test/test-case-dashboard-fixtures';

// Reports go through the shared client (lib/reports-api.ts): POST, then status polls, then the file.
const request = vi.hoisted(() => vi.fn());
const requestBlob = vi.hoisted(() => vi.fn());
vi.mock('../../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api-client')>()),
  useApiClient: () => ({ request, requestBlob }),
}));
vi.mock('../../lib/test-cases-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/test-cases-api')>()),
  getTestCaseDashboard: vi.fn(),
}));
vi.mock('../../lib/tags-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tags-api')>()),
  listTags: vi.fn(async () => []),
}));
vi.mock('../../lib/activity-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/activity-api')>()),
  listProjectActivity: vi.fn(async () => ({ entries: [], nextCursor: null })),
}));

const tile = (name: string) => screen.getByRole('region', { name });
const chart = (name: string) => screen.findByRole('figure', { name });
const lastDay = async (name: string) => {
  const figure = await chart(name);
  fireEvent.keyDown(within(figure).getByLabelText(/use the arrow keys/), { key: 'End' });
  return within(figure).getByRole('status').textContent ?? '';
};

describe('TestCaseDashboard (specs/test-cases-screen)', () => {
  beforeEach(() => {
    vi.mocked(getTestCaseDashboard).mockReset().mockResolvedValue(makeDashboard());
  });

  it('shows the four tiles: 10 ("6 ready"), 60%, 70% ("3 never run") and "—"', async () => {
    renderWithProviders(<TestCaseDashboard projectId="p1" />);
    await screen.findByRole('region', { name: 'Total Tests' });

    expect(tile('Total Tests').textContent).toContain('10');
    expect(tile('Total Tests').textContent).toContain('6 ready');
    expect(tile('Ready').textContent).toContain('60%');
    expect(tile('Ready').textContent).toContain('6 of 10 cases');
    expect(tile('Coverage').textContent).toContain('70%');
    expect(tile('Coverage').textContent).toContain('3 never run');
    expect(tile('Avg Confidence').textContent).toContain('—');
    expect(tile('Avg Confidence').textContent).toContain('from last run results');
    expect(within(tile('Coverage')).getByRole('button', { name: /at least one completed run/ })).toBeTruthy();
  });

  it("shows one day's created, added and completed, and can hide a series", async () => {
    vi.mocked(getTestCaseDashboard).mockResolvedValue(
      makeDashboard({ days: makeDays({ '2026-11-25': { created: 2, added: 5, completed: 3, passed: 2 } }) }),
    );
    renderWithProviders(<TestCaseDashboard projectId="p1" />);

    const readout = await lastDay('Test Cases Over Time');
    expect(readout).toContain('Created 2');
    expect(readout).toContain('Added to executions 5');
    expect(readout).toContain('Completed 3');

    const figure = await chart('Test Cases Over Time');
    const toggle = within(figure).getByRole('button', { name: /Added to executions/ });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(await lastDay('Test Cases Over Time')).not.toContain('Added to executions');
    expect(await lastDay('Pass Rate Trend')).toContain('67%');
  });

  it('hides Pass Rate Trend without completed runs, so Over Time takes the full width', async () => {
    vi.mocked(getTestCaseDashboard).mockResolvedValue(makeDashboard({ hasCompletedRuns: false }));
    renderWithProviders(<TestCaseDashboard projectId="p1" />);

    await chart('Test Cases Over Time');
    expect(screen.queryByRole('figure', { name: 'Pass Rate Trend' })).toBeNull();
    expect(screen.getByTestId('tc-dashboard-trends').className).not.toContain('xl:grid-cols-2');
  });

  it('shows the donut parts', async () => {
    renderWithProviders(<TestCaseDashboard projectId="p1" />);

    const outcome = await chart('Last Run Outcome');
    expect(within(within(outcome).getByRole('list', { name: 'Last Run Outcome legend' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Pass4 (40%)',
      'Fail1 (10%)',
      'Never Run5 (50%)',
    ]);
    const source = await chart('Source Type');
    expect(within(within(source).getByRole('list', { name: 'Source Type legend' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Gherkin8 (80%)',
      'Manual2 (20%)',
    ]);
  });

  it('shows the empty state for a project with no test cases', async () => {
    vi.mocked(getTestCaseDashboard).mockResolvedValue(makeDashboard({ tiles: { total: 0, ready: 0, covered: 0, avgConfidencePct: null } }));
    renderWithProviders(<TestCaseDashboard projectId="p1" />);

    expect(await screen.findByText('No test cases yet')).toBeTruthy();
    expect(screen.getByText('Create test cases to start seeing metrics')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Total Tests' })).toBeNull();
  });

  it('shows a title placeholder and four tile placeholders while loading', async () => {
    vi.mocked(getTestCaseDashboard).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<TestCaseDashboard projectId="p1" />);

    expect(screen.getByTestId('dashboard-title-placeholder')).toBeTruthy();
    expect(screen.getAllByTestId('dashboard-tile-placeholder')).toHaveLength(4);
  });

  it('fetches again on every showing, with the viewer time zone', async () => {
    const { unmount, queryClient } = renderWithProviders(<TestCaseDashboard projectId="p1" />);
    await screen.findByRole('region', { name: 'Total Tests' });
    unmount();
    expect(getTestCaseDashboard).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getTestCaseDashboard).mock.calls[0][2]).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');

    const { QueryClientProvider } = await import('@tanstack/react-query');
    const { render } = await import('@testing-library/react');
    render(
      <QueryClientProvider client={queryClient}>
        <TestCaseDashboard projectId="p1" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(getTestCaseDashboard).toHaveBeenCalledTimes(2));
  });

  describe('Download report (specs/test-cases-screen)', () => {
    const reportAs = (status: string) => ({
      id: 'r1', kind: 'test-cases-dashboard', status, error: null, fileName: status === 'Ready' ? 'test-cases-dashboard-2026-11-25.pdf' : null,
      byteSize: null, createdAt: '2026-11-25T10:00:00.000Z', completedAt: null, expiresAt: '2026-12-02T10:00:00.000Z',
    });
    let status = 'Generating';
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const postedBody = () => JSON.parse(request.mock.calls.find(([, init]) => init?.method === 'POST')![1].body);

    beforeEach(() => {
      status = 'Generating';
      request.mockReset().mockImplementation(async (_path: string, init?: RequestInit) => (init?.method === 'POST' ? reportAs('Queued') : reportAs(status)));
      requestBlob.mockReset().mockResolvedValue({ blob: new Blob(['%PDF']), fileName: 'test-cases-dashboard-2026-11-25.pdf' });
      vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
    });
    afterEach(() => vi.useRealTimers());

    it('shows the header with Download report enabled before any report is requested', async () => {
      renderWithProviders(<TestCaseDashboard projectId="p1" />);
      expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
      expect((screen.getByRole('button', { name: /Download report/ }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('requests the report with both ranges, the Needs Attention filter and sort, and the browser zone', async () => {
      vi.mocked(getTestCaseDashboard).mockResolvedValue(makeDashboard({ needsAttention: [makeAttentionRow('Pay by card', 2), makeAttentionRow('Login', 1)] }));
      renderWithProviders(<TestCaseDashboard projectId="p1" />);
      fireEvent.click(within(await chart('Test Cases Over Time')).getByRole('radio', { name: '30d' }));
      fireEvent.click(within(await chart('Pass Rate Trend')).getByRole('radio', { name: '7d' }));
      fireEvent.change(screen.getByLabelText('Filter needs attention by name'), { target: { value: 'pay' } });
      const table = screen.getByRole('table', { name: 'Needs Attention' });
      fireEvent.click(within(table).getByRole('button', { name: /Last Updated/ }));
      fireEvent.click(within(table).getByRole('button', { name: /Last Updated/ }));
      fireEvent.click(screen.getByRole('button', { name: /Download report/ }));

      await waitFor(() => expect(request).toHaveBeenCalledWith('/projects/p1/reports', expect.objectContaining({ method: 'POST' })));
      expect(postedBody()).toEqual({
        kind: 'test-cases-dashboard',
        tz: zone,
        ranges: { overTime: 30, passRate: 7 },
        needsAttention: { name: 'pay', sort: { key: 'updatedAt', direction: 'desc' } },
      });
    });

    it("requests Pass Rate Trend's default range while the chart is hidden", async () => {
      vi.mocked(getTestCaseDashboard).mockResolvedValue(makeDashboard({ hasCompletedRuns: false }));
      renderWithProviders(<TestCaseDashboard projectId="p1" />);
      fireEvent.click(await screen.findByRole('button', { name: /Download report/ }));
      await waitFor(() => expect(request).toHaveBeenCalledWith('/projects/p1/reports', expect.objectContaining({ method: 'POST' })));
      expect(postedBody().ranges).toEqual({ overTime: 30, passRate: 30 });
      expect(postedBody().needsAttention).toEqual({ name: '', sort: { key: 'createdAt', direction: 'asc' } });
    });

    it('shows Generating… until the report is Ready, polling without live events, then downloads it', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      renderWithProviders(<TestCaseDashboard projectId="p1" />);
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
      renderWithProviders(<TestCaseDashboard projectId="p1" />);
      fireEvent.click(await screen.findByRole('button', { name: /Download report/ }));
      expect((await screen.findByRole('alert')).textContent).toContain(REPORT_FAILED);

      status = 'Generating';
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await waitFor(() => expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2));
    });
  });
});
