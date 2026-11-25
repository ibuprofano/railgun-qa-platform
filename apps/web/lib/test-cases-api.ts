import type { HealthFlag, IssueFlag, TestCaseDashboard, TestCaseHealth } from '@railgun-qa/reporting';
import type { ApiClient } from './api-client';
import type { RunOutcome } from './executions-api';

export type { HealthFlag, IssueFlag, TestCaseHealth };

export type TestCaseStatus = 'Draft' | 'Ready' | 'Deprecated';
export type SourceType = 'Gherkin' | 'Manual';

export interface TestCase {
  id: string;
  name: string;
  gherkinScript: string | null;
  status: TestCaseStatus;
  sourceType: SourceType;
  /*
   * Tree placement (folder-tree). Always sent by the API; optional here only so test
   * fixtures that predate the tree can stay minimal (missing = root / no outcome).
   */
  /** null = the root of the tree. */
  folderId?: string | null;
  /** Fractional ordering key among sibling test cases (ADR 0014). */
  positionKey?: string;
  /** Newest recorded run outcome, or null if never run. */
  lastOutcome?: RunOutcome | null;
  /** Tags carried (ADR 0016), sorted by id; missing = none. */
  tagIds?: string[];
  /** Edit times (ADR 0025), ISO strings; optional here only so older fixtures stay minimal. */
  createdAt?: string;
  /** The last change to its name, script, status or tags, or a move. */
  updatedAt?: string;
  /** The last edit of its script; null if never edited after creation. */
  scriptUpdatedAt?: string | null;
  /** Its health flags (specs/test-case-health). Sent on the detail and write responses, not the list. */
  health?: TestCaseHealth;
}

export interface CreateTestCaseInput {
  name: string;
  gherkinScript?: string;
  /** Destination folder; omitted or null = the root. */
  folderId?: string | null;
  /** Tags to create it with. */
  tagIds?: string[];
}

export interface UpdateTestCaseInput {
  name?: string;
  gherkinScript?: string | null;
  status?: TestCaseStatus;
  /** The full set of tags the test case should carry. */
  tagIds?: string[];
}

export function listTestCases(client: ApiClient, projectId: string): Promise<TestCase[]> {
  return client.request(`/projects/${projectId}/test-cases`);
}

export function getTestCase(client: ApiClient, projectId: string, testCaseId: string): Promise<TestCase> {
  return client.request(`/projects/${projectId}/test-cases/${testCaseId}`);
}

export function createTestCase(client: ApiClient, projectId: string, input: CreateTestCaseInput): Promise<TestCase> {
  return client.request(`/projects/${projectId}/test-cases`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateTestCase(
  client: ApiClient,
  projectId: string,
  testCaseId: string,
  input: UpdateTestCaseInput,
): Promise<TestCase> {
  return client.request(`/projects/${projectId}/test-cases/${testCaseId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteTestCase(client: ApiClient, projectId: string, testCaseId: string): Promise<void> {
  return client.request(`/projects/${projectId}/test-cases/${testCaseId}`, { method: 'DELETE' });
}

/** Moves a test case to a folder (null = root), after a sibling test case (null = first). */
export function moveTestCase(
  client: ApiClient,
  projectId: string,
  testCaseId: string,
  target: { folderId: string | null; afterId: string | null },
): Promise<TestCase> {
  return client.request(`/projects/${projectId}/test-cases/${testCaseId}/move`, {
    method: 'POST',
    body: JSON.stringify(target),
  });
}

/** The dashboard's shape, written once in @railgun-qa/reporting for the API, the PDF and the screen. */
export type { TestCaseDashboard } from '@railgun-qa/reporting';

/** The Test Cases dashboard (specs/test-case-metrics); daily series follow `timeZone`. */
export function getTestCaseDashboard(client: ApiClient, projectId: string, timeZone: string): Promise<TestCaseDashboard> {
  return client.request(`/projects/${projectId}/test-cases/dashboard?tz=${encodeURIComponent(timeZone)}`);
}

export const testCaseKeys = {
  /** The list; every edit invalidates it, and so everything nested under it. */
  list: (projectId: string) => ['projects', projectId, 'test-cases'] as const,
  /** Under the list key, so the edits' invalidations also mark the dashboard stale. */
  dashboard: (projectId: string, timeZone: string) => ['projects', projectId, 'test-cases', 'dashboard', timeZone] as const,
};
