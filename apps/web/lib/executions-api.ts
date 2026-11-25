import type { ExecutionDashboardData } from '@railgun-qa/reporting';
import type { ApiClient } from './api-client';

export type ExecutionStatus = 'Draft' | 'Ready' | 'InProgress' | 'Paused' | 'Completed' | 'Done' | 'Canceled';
export type RunOutcome = 'Pending' | 'Pass' | 'Fail' | 'NeedsReview';
export type RecordableOutcome = Exclude<RunOutcome, 'Pending'>;
export type Browser = 'Chromium' | 'Firefox' | 'WebKit';
export type RunMode = 'Manual' | 'Automated';
export type TestCaseStatus = 'Draft' | 'Ready' | 'Deprecated';

export interface Run {
  id: string;
  position: number;
  testCaseId: string | null;
  /** The snapshot once started; the test case's current values before that. */
  testCaseName: string | null;
  gherkinScript: string | null;
  testCaseDeleted: boolean;
  /** The test case's status now; null once deleted. Missing = unknown (older fixtures). */
  testCaseStatus?: TestCaseStatus | null;
  outcome: RunOutcome;
  outcomeUpdatedAt: string | null;
}

/** One earlier attempt of a run, kept by Restart (ADR 0020). */
export interface RunAttempt {
  attempt: number;
  position: number;
  outcome: RunOutcome;
  outcomeUpdatedAt: string | null;
  outcomeUpdatedByName: string | null;
  testCaseName: string | null;
  gherkinScript: string | null;
}

/** Mirrors the API's ExecutionResponse (apps/api/src/executions/execution-queries.ts). */
export interface Execution {
  id: string;
  name: string;
  description: string | null;
  status: ExecutionStatus;
  environmentId: string | null;
  environmentName: string | null;
  browser: Browser;
  viewportWidth: number;
  viewportHeight: number;
  locale: string;
  timezone: string;
  autoCreateBug: boolean;
  elapsedMsAccumulated: number;
  lastResumedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  signedOffAt: string | null;
  signedOffBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Current attempt (ADR 0020): 1 until first restarted. Missing = 1 (older fixtures). */
  attempt?: number;
  counts: { total: number; done: number; pass: number; fail: number; needsReview: number };
  /** Tags currently carried by the test cases of its runs; missing = none (older fixtures). */
  tagIds?: string[];
  /** Server time when the response was built, for clock-skew correction. */
  now: string;
  /** Present on detail responses only. */
  runs?: Run[];
}

export interface ExecutionInput {
  name: string;
  description?: string | null;
  testCaseIds?: string[];
  environmentId?: string | null;
  browser?: Browser;
  viewportWidth?: number;
  viewportHeight?: number;
  locale?: string;
  timezone?: string;
  autoCreateBug?: boolean;
}

/** The lifecycle verbs, as the API's route segments. */
export type LifecycleVerb =
  | 'mark-ready'
  | 'back-to-draft'
  | 'run-all'
  | 'pause'
  | 'resume'
  | 'sign-off'
  | 'cancel'
  | 'restart';

const base = (projectId: string) => `/projects/${projectId}/executions`;

export function listExecutions(client: ApiClient, projectId: string): Promise<Execution[]> {
  return client.request(base(projectId));
}

/**
 * The Executions dashboard's rows (specs/execution-metrics): every live execution and its
 * current runs, dated in `timeZone`. The browser scopes and counts them (design.md decision 1).
 */
export function getExecutionDashboard(client: ApiClient, projectId: string, timeZone: string): Promise<ExecutionDashboardData> {
  return client.request(`${base(projectId)}/dashboard?tz=${encodeURIComponent(timeZone)}`);
}

export function getExecution(client: ApiClient, projectId: string, executionId: string): Promise<Execution> {
  return client.request(`${base(projectId)}/${executionId}`);
}

export function createExecution(client: ApiClient, projectId: string, input: ExecutionInput): Promise<Execution> {
  return client.request(base(projectId), { method: 'POST', body: JSON.stringify(input) });
}

export function updateExecution(
  client: ApiClient,
  projectId: string,
  executionId: string,
  input: Partial<ExecutionInput>,
): Promise<Execution> {
  return client.request(`${base(projectId)}/${executionId}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deleteExecution(client: ApiClient, projectId: string, executionId: string): Promise<void> {
  return client.request(`${base(projectId)}/${executionId}`, { method: 'DELETE' });
}

export function transitionExecution(
  client: ApiClient,
  projectId: string,
  executionId: string,
  verb: LifecycleVerb,
  mode?: RunMode,
): Promise<Execution> {
  return client.request(`${base(projectId)}/${executionId}/${verb}`, {
    method: 'POST',
    ...(mode ? { body: JSON.stringify({ mode }) } : {}),
  });
}

export function setRunOutcome(
  client: ApiClient,
  projectId: string,
  executionId: string,
  runId: string,
  outcome: RecordableOutcome,
): Promise<Execution> {
  return client.request(`${base(projectId)}/${executionId}/runs/${runId}`, {
    method: 'PATCH',
    body: JSON.stringify({ outcome }),
  });
}

/** Moves a Draft execution's run right after `afterRunId` (first when null). */
export function moveRun(
  client: ApiClient,
  projectId: string,
  executionId: string,
  runId: string,
  afterRunId: string | null,
): Promise<Execution> {
  return client.request(`${base(projectId)}/${executionId}/runs/${runId}/move`, {
    method: 'POST',
    body: JSON.stringify({ afterRunId }),
  });
}

/** Adds a Ready test case to a Draft execution as its last run (ADR 0021 decision 4). */
export function addRun(client: ApiClient, projectId: string, executionId: string, testCaseId: string): Promise<Execution> {
  return client.request(`${base(projectId)}/${executionId}/runs`, { method: 'POST', body: JSON.stringify({ testCaseId }) });
}

/** Removes one run of a Draft execution; the last run can't be removed (ADR 0021 decision 3). */
export function removeRun(client: ApiClient, projectId: string, executionId: string, runId: string): Promise<Execution> {
  return client.request(`${base(projectId)}/${executionId}/runs/${runId}`, { method: 'DELETE' });
}

/** A run's earlier attempts, newest first. */
export function listRunAttempts(
  client: ApiClient,
  projectId: string,
  executionId: string,
  runId: string,
): Promise<RunAttempt[]> {
  return client.request(`${base(projectId)}/${executionId}/runs/${runId}/attempts`);
}

/** The execution's attempt number; 1 when the response predates attempts. */
export const attemptOf = (execution: Pick<Execution, 'attempt'>): number => execution.attempt ?? 1;

/** Query keys mirror the REST paths (frontend-ui-stack convention). */
export const executionKeys = {
  /**
   * Deliberately not under the list key: live events invalidate the list on every change,
   * and the dashboard only needs fresh data when it is shown (design.md decision 5).
   */
  dashboard: (projectId: string, timeZone: string) => ['projects', projectId, 'executions-dashboard', timeZone] as const,
  list: (projectId: string) => ['projects', projectId, 'executions'] as const,
  detail: (projectId: string, executionId: string) => ['projects', projectId, 'executions', executionId] as const,
  /** Under the detail key, so refetching an execution (SSE, Restart) refreshes it too. */
  runAttempts: (projectId: string, executionId: string, runId: string) =>
    ['projects', projectId, 'executions', executionId, 'runs', runId, 'attempts'] as const,
};
