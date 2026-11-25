import type { ApiClient } from './api-client';
import { bugKeys } from './bugs-api';
import { executionKeys } from './executions-api';

/** One activity entry, as the history endpoints return it (ADR 0021). */
export interface ActivityEntry {
  id: string;
  /** Null for system actions, such as the trash purge. */
  actorName: string | null;
  actionCode: string;
  entityType: string;
  entityId: string;
  entityName: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface ActivityPage {
  entries: ActivityEntry[];
  /** Cursor for the next, older page; null on the last page. */
  nextCursor: string | null;
}

const withCursor = (path: string, before: string | null) =>
  before ? `${path}?before=${encodeURIComponent(before)}` : path;

export function listExecutionActivity(
  client: ApiClient,
  projectId: string,
  executionId: string,
  before: string | null = null,
): Promise<ActivityPage> {
  return client.request(withCursor(`/projects/${projectId}/executions/${executionId}/activity`, before));
}

export function listBugActivity(
  client: ApiClient,
  projectId: string,
  bugId: string,
  before: string | null = null,
): Promise<ActivityPage> {
  return client.request(withCursor(`/projects/${projectId}/bugs/${bugId}/activity`, before));
}

/** The Activity screen's filter pills (PRD §6.6), in order; `type` is the API's value. */
export const ACTIVITY_FILTERS = [
  { label: 'All', type: null },
  { label: 'Test Cases', type: 'test-cases' },
  { label: 'Executions', type: 'executions' },
  { label: 'Runs', type: 'runs' },
  { label: 'Bugs', type: 'bugs' },
  { label: 'Folders', type: 'folders' },
  { label: 'Environments', type: 'environments' },
  { label: 'Projects', type: 'projects' },
  { label: 'Tags', type: 'tags' },
] as const;

export type ActivityType = NonNullable<(typeof ACTIVITY_FILTERS)[number]['type']>;

export function isActivityType(value: string | null): value is ActivityType {
  return ACTIVITY_FILTERS.some((filter) => filter.type !== null && filter.type === value);
}

/** The project-wide feed (specs/activity-log), newest first; `type` narrows to one pill. */
export function listProjectActivity(
  client: ApiClient,
  projectId: string,
  type: ActivityType | null,
  before: string | null = null,
): Promise<ActivityPage> {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (before) params.set('before', before);
  const query = params.toString();
  return client.request(`/projects/${projectId}/activity${query ? `?${query}` : ''}`);
}

/** Under each item's detail key, so refreshing the item refreshes its history (design.md decision 6). */
export const activityKeys = {
  /** Prefix of every Activity screen query of a project. */
  projectAll: (projectId: string) => ['projects', projectId, 'activity'] as const,
  project: (projectId: string, type: ActivityType | null) => ['projects', projectId, 'activity', type ?? 'all'] as const,
  execution: (projectId: string, executionId: string) => [...executionKeys.detail(projectId, executionId), 'activity'] as const,
  bug: (projectId: string, bugId: string) => [...bugKeys.detail(projectId, bugId), 'activity'] as const,
};
