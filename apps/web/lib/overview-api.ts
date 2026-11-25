import type { ApiClient } from './api-client';

/** Mirrors the API's OverviewResponse (apps/api/src/overview/overview-queries.ts). */
export type HealthBand = 'Healthy' | 'AtRisk' | 'Critical';

export interface Overview {
  testCases: { total: number; readyPct: number; coveragePct: number };
  /** Null with no runs completed in the last 30 days. */
  passRate: number | null;
  activeExecutions: number;
  openBugs: number;
  criticalBugs: number;
  health: {
    /** Null, with a null band, for a project with no completed run. */
    score: number | null;
    band: HealthBand | null;
    components: { passRate: number; coverage: number; bugPressure: number; freshness: number };
  };
  topFailingTests: { id: string; name: string; failed: number; completed: number; failRatePct: number }[];
  /** Failing test cases with fewer than 3 completed runs, so not listed. */
  failingBelowMinimum: number;
  urgentBugs: { id: string; title: string; severity: 'Critical' | 'High'; status: 'Open' | 'InProgress'; createdAt: string }[];
}

/** The Overview's figures in one read (specs/project-metrics). */
export function getOverview(client: ApiClient, projectId: string): Promise<Overview> {
  return client.request(`/projects/${projectId}/overview`);
}

/** Mirrors the API's OverviewTrends (apps/api/src/overview/overview-trends.ts): 90 days, oldest first. */
export interface OverviewTrends {
  /** Run and bug counts per calendar day in the requested time zone. */
  days: { date: string; completed: number; passed: number; reported: number; resolved: number }[];
  /** The Health Score per UTC day (ADR 0024); null before the first completed run. */
  health: { day: string; score: number | null; band: HealthBand | null; source: 'snapshot' | 'recomputed' | 'live' }[];
  outcomes30d: { pass: number; fail: number; needsReview: number };
}

export function getOverviewTrends(client: ApiClient, projectId: string, timeZone: string): Promise<OverviewTrends> {
  return client.request(`/projects/${projectId}/overview/trends?tz=${encodeURIComponent(timeZone)}`);
}

/** The viewer's IANA time zone, which the run and bug series follow (PRD §6.12.2). */
export function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export const overviewKeys = {
  detail: (projectId: string) => ['projects', projectId, 'overview'] as const,
  trends: (projectId: string, timeZone: string) => ['projects', projectId, 'overview', 'trends', timeZone] as const,
};
