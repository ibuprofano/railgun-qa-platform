'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExecutionReportOptions, ReportApiKind, TestCaseReportOptions } from '@railgun-qa/reporting';
import { useApiClient, type ApiClient } from './api-client';

/** Mirrors the API's ReportResponse (apps/api/src/reports/report-queries.ts). */
export type ReportStatus = 'Queued' | 'Generating' | 'Ready' | 'Failed';
export type ReportKind = ReportApiKind;

export interface Report {
  id: string;
  kind: ReportKind;
  status: ReportStatus;
  error: string | null;
  fileName: string | null;
  byteSize: number | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
}

/** Each kind's request options (executions-dashboard-report design.md decision 7). */
export interface ReportOptionsByKind {
  'bugs-dashboard': { tz: string; range: 7 | 15 | 30 | 90 };
  'executions-dashboard': ExecutionReportOptions;
  'test-cases-dashboard': TestCaseReportOptions;
}
export type ReportOptions<K extends ReportKind = ReportKind> = ReportOptionsByKind[K];

const base = (projectId: string) => `/projects/${projectId}/reports`;

export function requestReport<K extends ReportKind>(client: ApiClient, projectId: string, kind: K, options: ReportOptions<K>): Promise<Report> {
  return client.request(base(projectId), { method: 'POST', body: JSON.stringify({ kind, ...options }) });
}

export function getReport(client: ApiClient, projectId: string, reportId: string): Promise<Report> {
  return client.request(`${base(projectId)}/${reportId}`);
}

export function downloadReportFile(client: ApiClient, projectId: string, reportId: string) {
  return client.requestBlob(`${base(projectId)}/${reportId}/file`);
}

export const reportKeys = {
  all: (projectId: string) => ['projects', projectId, 'reports'] as const,
  detail: (projectId: string, reportId: string) => ['projects', projectId, 'reports', reportId] as const,
};

/** How often a generating report is checked when the live stream is quiet or down. */
export const REPORT_POLL_MS = 3000;

/** Hands a Blob to the browser as a download (a temporary object URL and <a download>). */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** What a dashboard shows when its report fails or is refused (specs/bugs-screen, specs/test-cases-screen). */
export const REPORT_FAILED = "The report couldn't be generated.";

export type ReportDownloadState = 'idle' | 'generating' | 'failed';

/**
 * Requests a report, follows it until it is Ready (live events invalidate its query;
 * polling covers a dropped stream), then downloads it once (specs/bugs-screen).
 */
export function useReportDownload<K extends ReportKind>(projectId: string, kind: K, save: (blob: Blob, fileName: string) => void = saveBlob) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const [reportId, setReportId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const downloaded = useRef<string | null>(null);

  const request = useMutation({
    mutationFn: (options: ReportOptions<K>) => requestReport(client, projectId, kind, options),
    onSuccess: (report) => {
      queryClient.setQueryData(reportKeys.detail(projectId, report.id), report);
      setReportId(report.id);
    },
    onError: () => setFailed(true),
  });

  const report = useQuery({
    queryKey: reportKeys.detail(projectId, reportId ?? 'none'),
    queryFn: () => getReport(client, projectId, reportId!),
    enabled: reportId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'Queued' || status === 'Generating' ? REPORT_POLL_MS : false;
    },
  });

  const status = report.data?.status;
  useEffect(() => {
    if (!reportId) return;
    if (status === 'Failed' || report.isError) {
      setFailed(true);
      setReportId(null);
      return;
    }
    if (status !== 'Ready' || downloaded.current === reportId) return;
    downloaded.current = reportId;
    const id = reportId;
    downloadReportFile(client, projectId, id)
      .then(({ blob, fileName }) => save(blob, fileName ?? report.data?.fileName ?? 'report.pdf'))
      .catch(() => setFailed(true))
      .finally(() => setReportId((current) => (current === id ? null : current)));
  }, [client, projectId, reportId, status, report.isError, report.data?.fileName, save]);

  const start = useCallback(
    (options: ReportOptions<K>) => {
      setFailed(false);
      request.mutate(options);
    },
    [request],
  );

  const state: ReportDownloadState = request.isPending || reportId !== null ? 'generating' : failed ? 'failed' : 'idle';
  return { start, state };
}
