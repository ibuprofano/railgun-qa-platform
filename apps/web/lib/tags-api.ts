import type { ApiClient } from './api-client';

/** ADR 0016's palette, in the order new tags take it (mirrors apps/api/src/tags/tag-rules.ts). */
export const TAG_COLORS = ['gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet'] as const;
export type TagColor = (typeof TAG_COLORS)[number];

/** Mirrors the API's TagResponse (apps/api/src/tags/tags.controller.ts). */
export interface Tag {
  id: string;
  name: string;
  color: TagColor;
  /** Non-deleted test cases carrying the tag. */
  testCaseCount: number;
  /** Non-deleted bugs carrying the tag. */
  bugCount: number;
}

/** ADR 0016 decision 7, shared with the dashboards' scope (packages/reporting). */
export { carriesAnyTag } from '@railgun-qa/reporting';

const base = (projectId: string) => `/projects/${projectId}/tags`;

export function listTags(client: ApiClient, projectId: string): Promise<Tag[]> {
  return client.request(base(projectId));
}

export function createTag(client: ApiClient, projectId: string, input: { name: string; color?: TagColor }): Promise<Tag> {
  return client.request(base(projectId), { method: 'POST', body: JSON.stringify(input) });
}

export function updateTag(
  client: ApiClient,
  projectId: string,
  tagId: string,
  input: { name?: string; color?: TagColor },
): Promise<Tag> {
  return client.request(`${base(projectId)}/${tagId}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function deleteTag(client: ApiClient, projectId: string, tagId: string): Promise<void> {
  return client.request(`${base(projectId)}/${tagId}`, { method: 'DELETE' });
}

/** Query keys mirror the REST paths (frontend-ui-stack convention). */
export const tagKeys = {
  list: (projectId: string) => ['projects', projectId, 'tags'] as const,
};
