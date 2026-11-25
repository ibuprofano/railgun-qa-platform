import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { buildReportOptions } from '@railgun-qa/reporting';
import { ExecutionDashboard } from './execution-dashboard';
import { REPORT_FAILED_TEXT } from './export-dialog';
import { REPORT_POLL_MS } from '../../lib/reports-api';
import { getExecutionDashboard } from '../../lib/executions-api';
import { renderWithProviders } from '../../test/render-with-providers';
import { makeDashboardData, makeDashboardExecution, makeDashboardRun } from '../../test/execution-fixtures';

vi.mock('@railgun-qa/reporting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@railgun-qa/reporting')>();
  return { ...actual, buildReportOptions: vi.fn(actual.buildReportOptions) };
});
// Reports go through the shared client (lib/reports-api.ts): POST, status polls, then the file.
const request = vi.hoisted(() => vi.fn());
const requestBlob = vi.hoisted(() => vi.fn());
vi.mock('../../lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api-client')>()),
  useApiClient: () => ({ request, requestBlob }),
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

const renderDashboard = (filters = {}) =>
  renderWithProviders(<ExecutionDashboard projectId="p1" filters={filters} onFiltersChange={() => {}} />);
const openDialog = async (name: RegExp = /Download/) => {
  fireEvent.click(await screen.findByRole('button', { name }));
  return screen.findByRole('dialog', { name: 'Download report' });
};

describe('Executions dashboard export (specs/executions-screen)', () => {
  beforeEach(() => {
    vi.mocked(buildReportOptions).mockClear();
    vi.mocked(getExecutionDashboard).mockReset().mockResolvedValue(
      makeDashboardData({
        executions: [makeDashboardExecution({ id: 'exec-1', status: 'Done' }), makeDashboardExecution({ id: 'exec-2', status: 'Draft' })],
        runs: [makeDashboardRun({ outcome: 'NeedsReview' })],
      }),
    );
  });

  it('reads "Download filtered report" by default, since Needs Attention is open', async () => {
    renderDashboard();
    expect(await screen.findByRole('button', { name: 'Download filtered report' })).toBeTruthy();
  });

  it('reads "Download report" on All Runs with no list or chart filter', async () => {
    renderDashboard();
    fireEvent.click(await screen.findByRole('tab', { name: 'All Runs' }));
    expect(screen.getByRole('button', { name: 'Download report' })).toBeTruthy();
  });

  it('labels the second switch by the open tab, and shows the scope count', async () => {
    renderDashboard();
    let dialog = await openDialog();
    expect(within(dialog).getByRole('switch', { name: 'Needs Attention' })).toBeTruthy();
    expect(within(dialog).getByText(/2 executions/)).toBeTruthy();
    fireEvent.keyDown(dialog, { key: 'Escape' });

    fireEvent.click(await screen.findByRole('tab', { name: 'All Runs' }));
    dialog = await openDialog();
    expect(within(dialog).getByRole('switch', { name: 'Runs' }).getAttribute('aria-checked')).toBe('false');
    expect(within(dialog).getByRole('switch', { name: /Test Executions/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('enables Download PDF, with no unavailable note, and disables it with both switches off', async () => {
    renderDashboard();
    const dialog = await openDialog();

    expect(within(dialog).queryByText(/not available yet/)).toBeNull();
    const download = within(dialog).getByRole('button', { name: 'Download PDF' }) as HTMLButtonElement;
    expect(download.disabled).toBe(false);

    fireEvent.click(within(dialog).getByRole('switch', { name: /Test Executions/ }));
    expect(within(dialog).getByRole('switch', { name: /Test Executions/ }).getAttribute('aria-checked')).toBe('false');
    expect(download.disabled).toBe(true);
  });

  describe('Download PDF (specs/executions-screen)', () => {
    const reportAs = (status: string) => ({
      id: 'r1', kind: 'executions-dashboard', status, error: null, fileName: status === 'Ready' ? 'executions-dashboard-2026-11-24.pdf' : null,
      byteSize: null, createdAt: '2026-11-24T10:00:00.000Z', completedAt: null, expiresAt: '2026-12-01T10:00:00.000Z',
    });
    let status = 'Generating';
    const posted = () => request.mock.calls.filter(([, init]) => init?.method === 'POST');

    beforeEach(() => {
      status = 'Generating';
      request.mockReset().mockImplementation(async (_path: string, init?: RequestInit) => (init?.method === 'POST' ? reportAs('Queued') : reportAs(status)));
      requestBlob.mockReset().mockResolvedValue({ blob: new Blob(['%PDF']), fileName: 'executions-dashboard-2026-11-24.pdf' });
      vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
    });
    afterEach(() => vi.useRealTimers());

    it('requests the report with the list filter, the Runs Over Time range and both switches', async () => {
      renderDashboard({ status: 'Done' });
      const runs = await screen.findByRole('figure', { name: 'Runs Over Time' });
      fireEvent.click(within(runs).getByRole('radio', { name: '7d' }));
      const dialog = await openDialog();
      fireEvent.click(within(dialog).getByRole('switch', { name: 'Needs Attention' }));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Download PDF' }));

      await waitFor(() => expect(posted()).toHaveLength(1));
      const body = JSON.parse(posted()[0][1].body);
      expect(body).toMatchObject({
        kind: 'executions-dashboard',
        filters: { status: 'Done' },
        ranges: { runsOverTime: 7, executionsOverTime: 30 },
        include: { executions: true, runs: true },
      });
    });

    it('reads "Generating…" until Ready, then downloads the PDF and closes', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      renderDashboard();
      const dialog = await openDialog();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Download PDF' }));
      const button = await within(dialog).findByRole('button', { name: 'Generating…' });
      expect((button as HTMLButtonElement).disabled).toBe(true);

      status = 'Ready';
      await act(async () => {
        await vi.advanceTimersByTimeAsync(REPORT_POLL_MS + 10);
      });
      await waitFor(() => expect(requestBlob).toHaveBeenCalledWith('/projects/p1/reports/r1/file'));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Download report' })).toBeNull());
    });

    it('says the report failed, and Try again requests a new one', async () => {
      status = 'Failed';
      renderDashboard();
      const dialog = await openDialog();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Download PDF' }));
      expect((await within(dialog).findByRole('alert')).textContent).toContain(REPORT_FAILED_TEXT);

      status = 'Generating';
      fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
      await waitFor(() => expect(posted()).toHaveLength(2));
    });
  });

  it('lists the active filters in its notice', async () => {
    renderDashboard({ status: 'Done' });
    const dialog = await openDialog();
    const notice = within(dialog).getByRole('note', { name: 'Active filters' });
    expect(notice.textContent).toContain('Status: Done');
    expect(notice.textContent).toContain('Runs: Needs Attention');
  });

  it("builds the report options from the screen's filters, the runs-table state and both chart ranges", async () => {
    renderDashboard({ environmentName: 'Staging' });
    const runs = await screen.findByRole('figure', { name: 'Runs Over Time' });
    fireEvent.click(within(runs).getByRole('radio', { name: '7d' }));
    fireEvent.click(within(screen.getByRole('figure', { name: 'Executions Over Time' })).getByRole('radio', { name: '15d' }));
    fireEvent.click(screen.getByRole('tab', { name: 'All Runs' }));
    fireEvent.change(screen.getByLabelText('Filter runs by name'), { target: { value: 'pay' } });
    await openDialog();

    const last = vi.mocked(buildReportOptions).mock.lastCall![0];
    expect(last.filters).toEqual({ environmentName: 'Staging' });
    expect(last.runTable).toMatchObject({ tab: 'all', name: 'pay', outcome: null, day: null });
    expect(last.ranges).toEqual({ executionsOverTime: 15, runsOverTime: 7 });
    expect(last.include).toEqual({ executions: true, runs: false });
    expect(last.tz).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  });
});
