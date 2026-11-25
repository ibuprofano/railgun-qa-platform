import type { ApiClient } from './api-client';
import type { BugDashboardData } from '@railgun-qa/reporting';
import type { RunOutcome } from './executions-api';

export type BugStatus = 'Open' | 'InProgress' | 'Resolved' | 'Closed' | 'WontFix';
export type BugSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

/** Mirrors the API's BugResponse (apps/api/src/bugs/bug-queries.ts). */
export interface Bug {
  id: string;
  title: string;
  severity: BugSeverity;
  status: BugStatus;
  description: string | null;
  stepsToReproduce: string | null;
  testCaseNameSnapshot: string | null;
  gherkinSnapshot: string | null;
  failedStep: string | null;
  reporterName: string;
  autoCreated: boolean;
  createdAt: string;
  updatedAt: string;
  /** When it entered Resolved, Closed or Won't Fix (PRD §2.9); null while unresolved. */
  resolvedAt: string | null;
  /** The execution attempt it was found in (ADR 0020); null if never tied to a run. */
  attempt?: number | null;
  run: {
    id: string;
    executionId: string;
    executionName: string;
    position: number;
    outcome: RunOutcome;
    deleted: boolean;
  } | null;
  testCase: { id: string; deleted: boolean } | null;
  /** Tags carried (ADR 0016), sorted by id; missing = none (older fixtures). */
  tagIds?: string[];
}

export interface CreateBugInput {
  title: string;
  severity: BugSeverity;
  description?: string | null;
  stepsToReproduce?: string | null;
  testRunId?: string;
  failedStep?: string;
  tagIds?: string[];
}

export interface UpdateBugInput {
  title?: string;
  severity?: BugSeverity;
  status?: BugStatus;
  description?: string | null;
  stepsToReproduce?: string | null;
  /** The full set of tags the bug should carry. */
  tagIds?: string[];
}

export const BUG_STATUSES: BugStatus[] = ['Open', 'InProgress', 'Resolved', 'Closed', 'WontFix'];
export const BUG_SEVERITIES: BugSeverity[] = ['Critical', 'High', 'Medium', 'Low'];

export const BUG_STATUS_LABELS: Record<BugStatus, string> = {
  Open: 'Open',
  InProgress: 'In Progress',
  Resolved: 'Resolved',
  Closed: 'Closed',
  WontFix: "Won't Fix",
};

const base = (projectId: string) => `/projects/${projectId}/bugs`;

export function listBugs(client: ApiClient, projectId: string, testRunId?: string): Promise<Bug[]> {
  return client.request(testRunId ? `${base(projectId)}?testRunId=${testRunId}` : base(projectId));
}

/**
 * The Bugs dashboard's rows (specs/bug-metrics): every live bug, dated in `timeZone`, the
 * tags they carry and the database clock. The browser builds the figures from them.
 */
export function getBugDashboard(client: ApiClient, projectId: string, timeZone: string): Promise<BugDashboardData> {
  return client.request(`${base(projectId)}/dashboard?tz=${encodeURIComponent(timeZone)}`);
}

export function getBug(client: ApiClient, projectId: string, bugId: string): Promise<Bug> {
  return client.request(`${base(projectId)}/${bugId}`);
}

export function createBug(client: ApiClient, projectId: string, input: CreateBugInput): Promise<Bug> {
  return client.request(base(projectId), { method: 'POST', body: JSON.stringify(input) });
}

export function updateBug(client: ApiClient, projectId: string, bugId: string, input: UpdateBugInput): Promise<Bug> {
  return client.request(`${base(projectId)}/${bugId}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deleteBug(client: ApiClient, projectId: string, bugId: string): Promise<void> {
  return client.request(`${base(projectId)}/${bugId}`, { method: 'DELETE' });
}

export function linkBugToRun(client: ApiClient, projectId: string, bugId: string, testRunId: string): Promise<Bug> {
  return client.request(`${base(projectId)}/${bugId}/link-run`, {
    method: 'POST',
    body: JSON.stringify({ testRunId }),
  });
}

/**
 * Query keys mirror the REST paths. `all` is the prefix of every bug query, so
 * invalidating it refreshes the list, details and per-run lists together.
 */
export const bugKeys = {
  all: (projectId: string) => ['projects', projectId, 'bugs'] as const,
  list: (projectId: string) => ['projects', projectId, 'bugs', 'list'] as const,
  detail: (projectId: string, bugId: string) => ['projects', projectId, 'bugs', 'detail', bugId] as const,
  forRun: (projectId: string, runId: string) => ['projects', projectId, 'bugs', 'run', runId] as const,
  /** Prefix of every per-run bug list. */
  allForRuns: (projectId: string) => ['projects', projectId, 'bugs', 'run'] as const,
  /**
   * Deliberately not under `all`: live bug events invalidate `all`, and the dashboard only
   * needs fresh data when it is shown (bugs-dashboard design.md decision 6).
   */
  dashboard: (projectId: string, timeZone: string) => ['projects', projectId, 'bugs-dashboard', timeZone] as const,
};
