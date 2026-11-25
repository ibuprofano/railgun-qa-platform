'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from './api-client';
import { bugKeys } from './bugs-api';
import { reportKeys } from './reports-api';
import { activityKeys } from './activity-api';
import { executionKeys } from './executions-api';
import { useSessionContext } from './session-context';

export interface StreamEvent {
  event: string;
  data: string;
}

/**
 * Reads a `text/event-stream` body until it ends, calling `onEvent` for each
 * dispatched event and `onActivity` for every chunk (heartbeat comments included).
 * Native EventSource can't send an Authorization header (ADR 0009), hence this
 * small parser over fetch: line splits across chunks, `event:`, multi-line `data:`,
 * comments, and LF, CRLF or CR line endings.
 */
export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: StreamEvent) => void,
  onActivity: () => void = () => {},
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = '';
  let dataLines: string[] = [];

  const processLine = (line: string) => {
    if (line === '') {
      if (dataLines.length > 0) {
        onEvent({ event: eventName || 'message', data: dataLines.join('\n') });
      }
      eventName = '';
      dataLines = [];
      return;
    }
    if (line.startsWith(':')) {
      return;
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }
    if (field === 'event') {
      eventName = value;
    } else if (field === 'data') {
      dataLines.push(value);
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      // A held trailing CR was a line ending after all.
      if (buffer.endsWith('\r')) {
        buffer.slice(0, -1).split(/\r\n|\r|\n/).forEach(processLine);
      }
      return;
    }
    onActivity();
    buffer += decoder.decode(value, { stream: true });
    // A trailing CR may be the first half of a CRLF split across chunks, so it waits.
    const lines = buffer.split(/\r\n|\r(?!$)|\n/);
    buffer = lines.pop() ?? '';
    lines.forEach(processLine);
  }
}

const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
/** The server sends a heartbeat every 25 s; this long without a byte means the stream is dead. */
export const SILENCE_TIMEOUT_MS = 60_000;

const LiveConnectedContext = createContext(false);

/** Whether the live stream is connected. False outside the provider, so screens keep polling. */
export function useLiveConnected(): boolean {
  return useContext(LiveConnectedContext);
}

/**
 * Keeps one live stream per tab for `projectId` (specs/live-updates) and turns its
 * events into query invalidations (design.md decision 6). Reconnects with backoff
 * after an error, at once after the server's periodic close, and refetches the
 * project's execution data after every reconnect to repair missed events.
 */
export function LiveUpdatesProvider({ projectId, children }: { projectId: string | null; children: ReactNode }) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!projectId) {
      return;
    }
    let cancelled = false;
    let controller: AbortController | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    let retryMs = INITIAL_RETRY_MS;
    let readyCount = 0;

    const repair = () => {
      void queryClient.invalidateQueries({ queryKey: executionKeys.list(projectId) });
      void queryClient.invalidateQueries({ queryKey: bugKeys.allForRuns(projectId) });
    };

    const handle = ({ event, data }: StreamEvent) => {
      if (event === 'ready') {
        setConnected(true);
        retryMs = INITIAL_RETRY_MS;
        if (readyCount++ > 0) {
          repair();
        }
        return;
      }
      if (event === 'resync') {
        repair();
        return;
      }
      let payload: { executionId?: string; runId?: string; reportId?: string };
      try {
        payload = JSON.parse(data);
      } catch {
        return;
      }
      if (event === 'execution.changed' && payload.executionId) {
        void queryClient.invalidateQueries({ queryKey: executionKeys.list(projectId), exact: true });
        void queryClient.invalidateQueries({ queryKey: executionKeys.detail(projectId, payload.executionId) });
      } else if (event === 'report.changed' && payload.reportId) {
        // A requested report started, finished or failed (report-pipeline): refetch its status.
        void queryClient.invalidateQueries({ queryKey: reportKeys.detail(projectId, payload.reportId) });
      } else if (event === 'run.bugs.changed' && payload.runId) {
        void queryClient.invalidateQueries({ queryKey: bugKeys.forRun(projectId, payload.runId) });
        // The execution's history includes its runs' bugs (ADR 0021 decision 1).
        if (payload.executionId) {
          void queryClient.invalidateQueries({ queryKey: activityKeys.execution(projectId, payload.executionId) });
        }
      }
    };

    const resetSilenceTimer = () => {
      if (silenceTimer) {
        clearTimeout(silenceTimer);
      }
      silenceTimer = setTimeout(() => controller?.abort(), SILENCE_TIMEOUT_MS);
    };

    const connect = async () => {
      retryTimer = null;
      controller = new AbortController();
      let closedByServer = false;
      try {
        const token = await getToken();
        const response = await fetch(`${API_BASE_URL}/projects/${projectId}/events`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok || !response.body) {
          throw new Error(`live stream refused: ${response.status}`);
        }
        resetSilenceTimer();
        await readEventStream(response.body, handle, resetSilenceTimer);
        closedByServer = true;
      } catch {
        // Refused, dropped, aborted by the silence timer, or aborted by cleanup.
      } finally {
        if (silenceTimer) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
      }
      if (cancelled) {
        return;
      }
      if (closedByServer) {
        // The server's periodic close (re-authorization): reconnect at once, stay "connected".
        retryTimer = setTimeout(connect, 0);
        return;
      }
      setConnected(false);
      retryTimer = setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
    };

    void connect();

    return () => {
      cancelled = true;
      controller?.abort();
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      if (silenceTimer) {
        clearTimeout(silenceTimer);
      }
      setConnected(false);
    };
  }, [projectId, getToken, queryClient]);

  return <LiveConnectedContext.Provider value={connected}>{children}</LiveConnectedContext.Provider>;
}

/** The provider for the session's active project; mounted once in the app layout. */
export function SessionLiveUpdates({ children }: { children: ReactNode }) {
  const { data } = useSessionContext();
  return <LiveUpdatesProvider projectId={data?.projectId ?? null}>{children}</LiveUpdatesProvider>;
}
