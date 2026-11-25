'use client';

import type { ComponentType } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  Bug,
  Building2,
  CircleDot,
  Folder,
  FolderKanban,
  History,
  KeyRound,
  ListChecks,
  PlayCircle,
  Server,
  Tag,
} from 'lucide-react';
import { useApiClient } from '../../lib/api-client';
import { useSessionContext } from '../../lib/session-context';
import {
  ACTIVITY_FILTERS,
  type ActivityEntry,
  type ActivityType,
  activityKeys,
  isActivityType,
  listProjectActivity,
} from '../../lib/activity-api';
import { actionKind, actorOf, describeActivity, groupByDay, initialsOf, relativeTime } from '../../lib/activity-format';
import { PageHeader } from '../page-header';
import { EmptyState, ErrorState, ListSkeleton } from '../states';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Query-string key holding the selected filter pill, so a reload or link keeps it. */
export const ACTIVITY_TYPE_PARAM = 'type';

const ENTITY_ICONS: Record<string, { icon: ComponentType<{ className?: string }>; label: string }> = {
  test_case: { icon: ListChecks, label: 'Test case' },
  test_execution: { icon: PlayCircle, label: 'Execution' },
  test_run: { icon: CircleDot, label: 'Run' },
  bug: { icon: Bug, label: 'Bug' },
  folder: { icon: Folder, label: 'Folder' },
  environment: { icon: Server, label: 'Environment' },
  environment_credential: { icon: KeyRound, label: 'Credential' },
  project: { icon: FolderKanban, label: 'Project' },
  tag: { icon: Tag, label: 'Tag' },
  workspace: { icon: Building2, label: 'Workspace' },
};
const FALLBACK_ICON = { icon: Activity, label: 'Item' };

/** Creations and restores, removals, and everything else (design.md decision 6). */
const KIND_CLASSES = {
  create: { text: 'text-pass', dot: 'bg-pass' },
  remove: { text: 'text-fail', dot: 'bg-fail' },
  change: { text: 'text-foreground', dot: 'bg-muted-foreground/40' },
} as const;

/**
 * The Activity screen (PRD §6.6, specs/activity-screen): the project's feed under day
 * headings, narrowed by filter pills kept in `?type=`, 20 entries at a time.
 * Uses useSearchParams, so the page wraps it in <Suspense>.
 */
export function ActivityScreen() {
  const session = useSessionContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (session.loading || !session.data) {
    return null;
  }

  const raw = searchParams.get(ACTIVITY_TYPE_PARAM);
  const type: ActivityType | null = isActivityType(raw) ? raw : null;
  const select = (next: ActivityType | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next) {
      params.set(ACTIVITY_TYPE_PARAM, next);
    } else {
      params.delete(ACTIVITY_TYPE_PARAM);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <>
      <PageHeader title="Activity" description="Everything done in this project, newest first." />
      <div role="radiogroup" aria-label="Filter activity" className="mb-4 flex flex-wrap gap-2">
        {ACTIVITY_FILTERS.map((filter) => {
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
      <ActivityFeed key={type ?? 'all'} projectId={session.data.projectId} type={type} />
    </>
  );
}

export function ActivityFeed({ projectId, type }: { projectId: string; type: ActivityType | null }) {
  const apiClient = useApiClient();
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: activityKeys.project(projectId, type),
    queryFn: ({ pageParam }) => listProjectActivity(apiClient, projectId, type, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last?.nextCursor ?? null,
  });

  if (isLoading) {
    return <ListSkeleton rows={6} />;
  }
  if (isError) {
    return <ErrorState message="The activity could not be loaded." onRetry={() => void refetch()} />;
  }
  const entries = data?.pages.flatMap((page) => page?.entries ?? []) ?? [];
  if (entries.length === 0) {
    return type ? (
      <EmptyState icon={History} title="No activity of this type" description="Try another filter, or All." />
    ) : (
      <EmptyState icon={History} title="No activity yet" description="Changes made in this project will show up here." />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groupByDay(entries).map((group) => (
        <section key={group.label} aria-label={group.label} className="flex flex-col gap-1">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.label}</h2>
          <ol className="flex flex-col divide-y rounded-xl border">
            {group.entries.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} />
            ))}
          </ol>
        </section>
      ))}
      {hasNextPage && (
        <Button
          type="button"
          variant="outline"
          className="self-center"
          disabled={isFetchingNextPage}
          onClick={() => fetchNextPage()}
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  );
}

export function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const actor = actorOf(entry);
  const kind = KIND_CLASSES[actionKind(entry)];
  const { icon: Icon, label } = ENTITY_ICONS[entry.entityType] ?? FALLBACK_ICON;
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 text-sm">
      <Avatar className="size-8">
        <AvatarFallback className="text-xs">{entry.actorName ? initialsOf(entry.actorName) : 'SY'}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="font-medium">{actor}</span>{' '}
        <span className={kind.text}>{describeActivity(entry)}</span>
      </span>
      <span className={cn('size-1.5 shrink-0 rounded-full', kind.dot)} aria-hidden="true" />
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-label={label} />
      <time
        dateTime={entry.createdAt}
        title={new Date(entry.createdAt).toLocaleString()}
        className="w-24 shrink-0 text-right text-xs text-muted-foreground"
      >
        {relativeTime(entry.createdAt)}
      </time>
    </li>
  );
}
