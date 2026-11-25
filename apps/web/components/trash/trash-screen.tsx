'use client';

import type { ComponentType } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Bug, Folder, ListChecks, PlayCircle, RotateCcw, Trash2 } from 'lucide-react';
import { useApiClient } from '../../lib/api-client';
import { useSessionContext } from '../../lib/session-context';
import { notifySuccess } from '../../lib/notify';
import {
  isTrashType,
  listTrash,
  type RestoredItem,
  restoreTrashItem,
  TRASH_FILTERS,
  type TrashEntry,
  trashKeys,
  type TrashType,
} from '../../lib/trash-api';
import { activityKeys } from '../../lib/activity-api';
import { folderKeys } from '../../lib/folders-api';
import { executionKeys } from '../../lib/executions-api';
import { bugKeys } from '../../lib/bugs-api';
import { relativeTime } from '../../lib/activity-format';
import { AccessDenied } from '../access-denied';
import { ActionError } from '../action-error';
import { PageHeader } from '../page-header';
import { EmptyState, ErrorState, ListSkeleton } from '../states';
import { Button } from '@/components/ui/button';

/** Query-string key holding the type filter, so a reload keeps it. */
export const TRASH_TYPE_PARAM = 'type';

const TYPES: Record<TrashType, { icon: ComponentType<{ className?: string }>; label: string; noun: string }> = {
  'test-case': { icon: ListChecks, label: 'Test case', noun: 'test case' },
  folder: { icon: Folder, label: 'Folder', noun: 'folder' },
  execution: { icon: PlayCircle, label: 'Execution', noun: 'execution' },
  bug: { icon: Bug, label: 'Bug', noun: 'bug' },
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "1 folder, 4 test cases": what a folder delete took besides the folder itself. */
export function folderContents(entry: Pick<TrashEntry, 'folders' | 'testCases'>): string {
  const subfolders = Math.max(0, (entry.folders ?? 1) - 1);
  const parts = [subfolders > 0 && plural(subfolders, 'folder'), (entry.testCases ?? 0) > 0 && plural(entry.testCases ?? 0, 'test case')];
  const text = parts.filter(Boolean).join(', ');
  return text || 'Empty';
}

export function daysLeftText(daysLeft: number): string {
  return daysLeft <= 0 ? 'Removed at the next cleanup' : `${plural(daysLeft, 'day')} left`;
}

/** "Restored “Pay”", plus " with folder “Checkout”" for parent folders that came back too. */
export function restoredMessage(restored: RestoredItem[]): string {
  const [item, ...folders] = restored;
  if (!item) return 'Restored';
  const withFolders =
    folders.length === 0 ? '' : ` with ${folders.length === 1 ? 'folder' : 'folders'} ${folders.map((f) => `“${f.name}”`).join(', ')}`;
  return `Restored “${item.name}”${withFolders}`;
}

/**
 * The Trash screen (PRD §6.11, specs/trash-screen), Project Admins only: one row per
 * deletion with its countdown, a type filter in `?type=`, and Restore per row.
 * Uses useSearchParams, so the page wraps it in <Suspense>.
 */
export function TrashScreen() {
  const session = useSessionContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (session.loading || !session.data) {
    return null;
  }
  if (session.data.role !== 'Admin') {
    return <AccessDenied message="Only Project Admins can see and restore deleted items." />;
  }

  const raw = searchParams.get(TRASH_TYPE_PARAM);
  const type: TrashType | null = isTrashType(raw) ? raw : null;
  const select = (next: TrashType | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next) {
      params.set(TRASH_TYPE_PARAM, next);
    } else {
      params.delete(TRASH_TYPE_PARAM);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <>
      <PageHeader title="Trash" description="Deleted items stay here for 30 days, then they are removed for good." />
      <div role="radiogroup" aria-label="Filter the trash" className="mb-4 flex flex-wrap gap-2">
        {TRASH_FILTERS.map((filter) => {
          const selected = filter.type === type;
          return (
            <Button
              key={filter.label}
              type="button"
              role="radio"
              aria-checked={selected}
              size="sm"
              variant={selected ? 'default' : 'outline'}
              className="rounded-full"
              onClick={() => select(filter.type)}
            >
              {filter.label}
            </Button>
          );
        })}
      </div>
      <TrashList projectId={session.data.projectId} type={type} />
    </>
  );
}

function TrashList({ projectId, type }: { projectId: string; type: TrashType | null }) {
  const apiClient = useApiClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: trashKeys.list(projectId, type),
    queryFn: () => listTrash(apiClient, projectId, type),
  });

  if (isLoading) {
    return <ListSkeleton rows={4} />;
  }
  if (isError || !data) {
    return <ErrorState message="The trash could not be loaded." onRetry={() => void refetch()} />;
  }
  if (data.length === 0) {
    return type ? (
      <EmptyState icon={Trash2} title="Nothing of this type in the trash" />
    ) : (
      <EmptyState icon={Trash2} title="The trash is empty" description="Deleted test cases, folders, executions and bugs show up here." />
    );
  }
  return (
    <ul className="flex flex-col divide-y rounded-xl border" aria-label="Deleted items">
      {data.map((entry) => (
        <TrashRow key={`${entry.type}:${entry.id}`} projectId={projectId} entry={entry} />
      ))}
    </ul>
  );
}

function TrashRow({ projectId, entry }: { projectId: string; entry: TrashEntry }) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const { icon: Icon, label } = TYPES[entry.type];
  const restore = useMutation({
    mutationFn: () => restoreTrashItem(apiClient, projectId, entry),
    onSuccess: async ({ restored }) => {
      notifySuccess(restoredMessage(restored));
      // Restored items reappear on their own screens without a reload (specs/trash-screen).
      await Promise.all(
        [
          trashKeys.all(projectId),
          activityKeys.projectAll(projectId),
          folderKeys.list(projectId),
          ['projects', projectId, 'test-cases'],
          executionKeys.list(projectId),
          bugKeys.all(projectId),
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });

  return (
    <li className="flex flex-col gap-2 px-3 py-3" aria-label={`${label} ${entry.name}`}>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-label={label} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{entry.name}</span>
          <span className="text-xs text-muted-foreground">
            {entry.type === 'folder' ? `${folderContents(entry)} · ` : ''}
            Deleted by {entry.deletedByName ?? 'Unknown'}{' '}
            <time dateTime={entry.deletedAt} title={new Date(entry.deletedAt).toLocaleString()}>
              {relativeTime(entry.deletedAt)}
            </time>
          </span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground" title={new Date(entry.purgeAfter).toLocaleString()}>
          {daysLeftText(entry.daysLeft)}
        </span>
        <Button type="button" size="sm" variant="outline" disabled={restore.isPending} onClick={() => restore.mutate()}>
          <RotateCcw /> {restore.isPending ? 'Restoring…' : 'Restore'}
        </Button>
      </div>
      <ActionError error={restore.error} />
    </li>
  );
}
