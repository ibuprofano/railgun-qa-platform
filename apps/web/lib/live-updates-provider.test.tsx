import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { LiveUpdatesProvider, SILENCE_TIMEOUT_MS, useLiveConnected } from './live-updates';
import { createQueryWrapper } from '../test/render-with-providers';

const getToken = vi.fn(async () => 'token-1');
vi.mock('@clerk/nextjs', () => ({ useAuth: () => ({ getToken }) }));

/** A response body the test writes to, closes or breaks, standing in for the API's stream. */
function controllableStream() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    stream,
    send: (text: string) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
    fail: () => controller.error(new Error('network down')),
  };
}

type Stream = ReturnType<typeof controllableStream>;

describe('LiveUpdatesProvider', () => {
  let streams: Stream[];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    streams = [];
    fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const s = controllableStream();
      streams.push(s);
      init.signal?.addEventListener('abort', () => s.fail());
      return new Response(s.stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function Status() {
    return <span>{useLiveConnected() ? 'connected' : 'disconnected'}</span>;
  }

  function renderProvider(projectId: string) {
    const { Wrapper, queryClient } = createQueryWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const view = render(
      <LiveUpdatesProvider projectId={projectId}>
        <Status />
      </LiveUpdatesProvider>,
      { wrapper: Wrapper },
    );
    const rerenderWith = (next: string) =>
      view.rerender(
        <LiveUpdatesProvider projectId={next}>
          <Status />
        </LiveUpdatesProvider>,
      );
    return { invalidate, rerenderWith, unmount: view.unmount };
  }

  const ready = 'event: ready\ndata: {}\n\n';

  it('opens one stream with the bearer token and reports connected on ready', async () => {
    renderProvider('p1');
    await waitFor(() => expect(streams).toHaveLength(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/projects\/p1\/events$/);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
    expect(screen.getByText('disconnected')).toBeTruthy();

    act(() => streams[0].send(ready));

    expect(await screen.findByText('connected')).toBeTruthy();
  });

  it('execution.changed invalidates the list and that execution', async () => {
    const { invalidate } = renderProvider('p1');
    await waitFor(() => expect(streams).toHaveLength(1));
    act(() => streams[0].send(ready));
    await screen.findByText('connected');

    act(() => streams[0].send('event: execution.changed\ndata: {"type":"execution.changed","projectId":"p1","executionId":"e1"}\n\n'));

    await waitFor(() =>
      expect(invalidate.mock.calls.map(([filters]) => filters)).toEqual([
        { queryKey: ['projects', 'p1', 'executions'], exact: true },
        { queryKey: ['projects', 'p1', 'executions', 'e1'] },
      ]),
    );
  });

  it("report.changed invalidates that report's status (report-pipeline)", async () => {
    const { invalidate } = renderProvider('p1');
    await waitFor(() => expect(streams).toHaveLength(1));
    act(() => streams[0].send(ready));
    await screen.findByText('connected');

    act(() => streams[0].send('event: report.changed\ndata: {"type":"report.changed","projectId":"p1","reportId":"r1"}\n\n'));

    await waitFor(() =>
      expect(invalidate.mock.calls.map(([filters]) => filters)).toEqual([{ queryKey: ['projects', 'p1', 'reports', 'r1'] }]),
    );
  });

  it("run.bugs.changed invalidates that run's bug list and its execution's history", async () => {
    const { invalidate } = renderProvider('p1');
    await waitFor(() => expect(streams).toHaveLength(1));
    act(() => streams[0].send(ready));
    await screen.findByText('connected');

    act(() =>
      streams[0].send(
        'event: run.bugs.changed\ndata: {"type":"run.bugs.changed","projectId":"p1","executionId":"e1","runId":"r1"}\n\n',
      ),
    );

    await waitFor(() =>
      expect(invalidate.mock.calls.map(([filters]) => filters)).toEqual([
        { queryKey: ['projects', 'p1', 'bugs', 'run', 'r1'] },
        { queryKey: ['projects', 'p1', 'executions', 'e1', 'activity'] },
      ]),
    );
  });

  it('a ready after the server closes the stream refetches every execution query; the first ready does not', async () => {
    const { invalidate } = renderProvider('p1');
    await waitFor(() => expect(streams).toHaveLength(1));
    act(() => streams[0].send(ready));
    await screen.findByText('connected');
    expect(invalidate).not.toHaveBeenCalled();

    act(() => streams[0].close());
    await waitFor(() => expect(streams).toHaveLength(2));
    expect(screen.getByText('connected')).toBeTruthy();
    act(() => streams[1].send(ready));

    await waitFor(() =>
      expect(invalidate.mock.calls.map(([filters]) => filters)).toEqual([
        { queryKey: ['projects', 'p1', 'executions'] },
        { queryKey: ['projects', 'p1', 'bugs', 'run'] },
      ]),
    );
  });

  it('resync refetches every execution query', async () => {
    const { invalidate } = renderProvider('p1');
    await waitFor(() => expect(streams).toHaveLength(1));
    act(() => streams[0].send(ready + 'event: resync\ndata: {}\n\n'));

    await waitFor(() =>
      expect(invalidate.mock.calls.map(([filters]) => filters)).toEqual([
        { queryKey: ['projects', 'p1', 'executions'] },
        { queryKey: ['projects', 'p1', 'bugs', 'run'] },
      ]),
    );
  });

  it('switching project aborts the old stream and opens one on the new project', async () => {
    const { rerenderWith } = renderProvider('p1');
    await waitFor(() => expect(streams).toHaveLength(1));
    const firstSignal = (fetchMock.mock.calls[0][1] as RequestInit).signal!;

    rerenderWith('p2');

    await waitFor(() => expect(streams).toHaveLength(2));
    expect(firstSignal.aborted).toBe(true);
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/projects\/p2\/events$/);
  });

  it('an error reports disconnected and retries after a delay', async () => {
    renderProvider('p1');
    await waitFor(() => expect(streams).toHaveLength(1));
    act(() => streams[0].send(ready));
    await screen.findByText('connected');

    act(() => streams[0].fail());

    expect(await screen.findByText('disconnected')).toBeTruthy();
    expect(streams).toHaveLength(1);
    await waitFor(() => expect(streams).toHaveLength(2), { timeout: 2_000 });
    act(() => streams[1].send(ready));
    expect(await screen.findByText('connected')).toBeTruthy();
  });

  it('a refused stream (e.g. 403) is retried, and the screen stays disconnected meanwhile', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('{"message":"Insufficient project role"}', { status: 403 }));
    renderProvider('p1');

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText('disconnected')).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2), { timeout: 2_000 });
  });

  it('a stream silent for 60 s is treated as dead: aborted, disconnected, and reopened', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderProvider('p1');
      await waitFor(() => expect(streams).toHaveLength(1));
      act(() => streams[0].send(ready));
      await screen.findByText('connected');
      const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal!;

      await act(() => vi.advanceTimersByTimeAsync(SILENCE_TIMEOUT_MS - 1_000));
      act(() => streams[0].send(': ping\n\n'));
      await act(() => vi.advanceTimersByTimeAsync(SILENCE_TIMEOUT_MS - 1_000));
      expect(signal.aborted).toBe(false);

      await act(() => vi.advanceTimersByTimeAsync(2_000));
      expect(signal.aborted).toBe(true);
      expect(screen.getByText('disconnected')).toBeTruthy();
      await act(() => vi.advanceTimersByTimeAsync(1_000));
      expect(streams).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes the stream on unmount', async () => {
    const { unmount } = renderProvider('p1');
    await waitFor(() => expect(streams).toHaveLength(1));
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal!;

    unmount();

    expect(signal.aborted).toBe(true);
  });
});

describe('useLiveConnected', () => {
  it('is false outside the provider', () => {
    const { result } = renderHook(() => useLiveConnected());
    expect(result.current).toBe(false);
  });
});
