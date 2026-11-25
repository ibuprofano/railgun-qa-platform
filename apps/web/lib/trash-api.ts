import type { ApiClient } from './api-client';

/** The trash's item types, as the API names them (specs/trash-restore). */
export type TrashType = 'test-case' | 'folder' | 'execution' | 'bug';

/** The Trash screen's filter (PRD §6.11), in order. */
export const TRASH_FILTERS: { label: string; type: TrashType | null }[] = [
  { label: 'All', type: null },
  { label: 'Test Cases', type: 'test-case' },
  { label: 'Folders', type: 'folder' },
  { label: 'Executions', type: 'execution' },
  { label: 'Bugs', type: 'bug' },
];

export function isTrashType(value: string | null): value is TrashType {
  return TRASH_FILTERS.some((filter) => filter.type !== null && filter.type === value);
}

/** One deletion in the trash: an item, or a folder with everything its delete took. */
export interface TrashEntry {
  type: TrashType;
  id: string;
  name: string;
  deletedAt: string;
  /** As recorded when it was deleted; null if unknown. */
  deletedByName: string | null;
  /** From this moment the next daily cleanup removes it permanently. */
  purgeAfter: string;
  daysLeft: number;
  /** Folder entries only; `folders` counts the deleted folder itself. */
  folders?: number;
  testCases?: number;
}

export interface RestoredItem {
  type: TrashType;
  id: string;
  name: string;
}

export function listTrash(client: ApiClient, projectId: string, type: TrashType | null): Promise<TrashEntry[]> {
  return client.request(`/projects/${projectId}/trash${type ? `?type=${type}` : ''}`);
}

/** Restores one entry; the requested item comes first, then folders restored with it. */
export function restoreTrashItem(
  client: ApiClient,
  projectId: string,
  entry: Pick<TrashEntry, 'type' | 'id'>,
): Promise<{ restored: RestoredItem[] }> {
  return client.request(`/projects/${projectId}/trash/${entry.type}/${entry.id}/restore`, { method: 'POST' });
}

export const trashKeys = {
  all: (projectId: string) => ['projects', projectId, 'trash'] as const,
  list: (projectId: string, type: TrashType | null) => ['projects', projectId, 'trash', type ?? 'all'] as const,
};
