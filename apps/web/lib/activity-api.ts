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

/** Under each item's detail key, so refreshing the item refreshes its history (design.md decision 6). */
export const activityKeys = {
  execution: (projectId: string, executionId: string) => [...executionKeys.detail(projectId, executionId), 'activity'] as const,
  bug: (projectId: string, bugId: string) => [...bugKeys.detail(projectId, bugId), 'activity'] as const,
};
