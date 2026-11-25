import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createQueryWrapper } from '../test/render-with-providers';
import { REPORT_POLL_MS, useReportDownload, type Report } from './reports-api';

const request = vi.fn();
const requestBlob = vi.fn();
vi.mock('./api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api-client')>()),
  useApiClient: () => ({ request, requestBlob }),
}));

const report = (status: Report['status'], extra: Partial<Report> = {}): Report => ({
  id: 'r1',
  kind: 'bugs-dashboard',
  status,
  error: null,
  fileName: status === 'Ready' ? 'bugs-dashboard-2026-11-25.pdf' : null,
  byteSize: null,
  createdAt: '2026-11-25T10:00:00.000Z',
  completedAt: null,
  expiresAt: '2026-12-02T10:00:00.000Z',
  ...extra,
});

describe('useReportDownload (specs/bugs-screen)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    request.mockReset();
    requestBlob.mockReset().mockResolvedValue({ blob: new Blob(['%PDF']), fileName: 'bugs-dashboard-2026-11-25.pdf' });
  });
  afterEach(() => vi.useRealTimers());

  const render = (save = vi.fn()) => {
    const { Wrapper } = createQueryWrapper();
    return { save, ...renderHook(() => useReportDownload('p1', 'bugs-dashboard', save), { wrapper: Wrapper }) };
  };

  it('requests with the options, polls while generating, and downloads once when Ready', async () => {
    let status: Report['status'] = 'Generating';
    request.mockImplementation(async (_path: string, init?: RequestInit) =>
      init?.method === 'POST' ? report('Queued') : report(status),
    );
    const { result, save } = render();

    act(() => result.current.start({ tz: 'Europe/Madrid', range: 15 }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('/projects/p1/reports', {
        method: 'POST',
        body: JSON.stringify({ kind: 'bugs-dashboard', tz: 'Europe/Madrid', range: 15 }),
      }),
    );
    await waitFor(() => expect(result.current.state).toBe('generating'));

    status = 'Ready';
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REPORT_POLL_MS + 10);
    });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(expect.any(Blob), 'bugs-dashboard-2026-11-25.pdf');
    expect(requestBlob).toHaveBeenCalledWith('/projects/p1/reports/r1/file');
    await waitFor(() => expect(result.current.state).toBe('idle'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REPORT_POLL_MS * 2);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('reports a Failed report as failed, and can start again', async () => {
    request.mockImplementation(async (_path: string, init?: RequestInit) =>
      init?.method === 'POST' ? report('Queued') : report('Failed', { error: 'boom' }),
    );
    const { result, save } = render();
    act(() => result.current.start({ tz: 'UTC', range: 30 }));
    await waitFor(() => expect(result.current.state).toBe('failed'));
    expect(save).not.toHaveBeenCalled();

    act(() => result.current.start({ tz: 'UTC', range: 30 }));
    await waitFor(() => expect(result.current.state).not.toBe('failed'));
  });

  it('reports a refused request as failed', async () => {
    request.mockRejectedValue(new Error('400'));
    const { result } = render();
    act(() => result.current.start({ tz: 'UTC', range: 30 }));
    await waitFor(() => expect(result.current.state).toBe('failed'));
  });

  it('requests an Executions dashboard report with its own options (executions-dashboard-report)', async () => {
    request.mockResolvedValue(report('Queued'));
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useReportDownload('p1', 'executions-dashboard', vi.fn()), { wrapper: Wrapper });
    const options = {
      tz: 'UTC',
      filters: { status: 'Done' as const },
      runTable: { tab: 'all' as const, outcome: null, day: null, name: '', sort: { key: 'updatedAt' as const, direction: 'desc' as const } },
      ranges: { executionsOverTime: 30, runsOverTime: 7 },
      include: { executions: true, runs: true },
    };
    act(() => result.current.start(options));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('/projects/p1/reports', { method: 'POST', body: JSON.stringify({ kind: 'executions-dashboard', ...options }) }),
    );
  });
});
