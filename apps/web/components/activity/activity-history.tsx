'use client';

import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import type { ActivityPage } from '../../lib/activity-api';
import { actorOf, describeActivity, relativeTime } from '../../lib/activity-format';
import { Button } from '@/components/ui/button';

export interface ActivityHistoryProps {
  /** The item's history key (lib/activity-api `activityKeys`), under its detail key. */
  queryKey: QueryKey;
  /** Fetches one page; `before` is the previous page's cursor, null for the newest. */
  fetchPage: (before: string | null) => Promise<ActivityPage>;
  /** Accessible name of the section, e.g. "Execution history". */
  label: string;
}

/**
 * An item's history (ADR 0021): newest first, 20 at a time, "Load more" while older
 * entries exist. Each entry reads "<who> <did what>", with the exact time on hover.
 */
export function ActivityHistory({ queryKey, fetchPage, label }: ActivityHistoryProps) {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last?.nextCursor ?? null,
  });
  const entries = data?.pages.flatMap((page) => page?.entries ?? []) ?? [];

  return (
    <section className="flex flex-col gap-2" aria-label={label}>
      <span className="text-sm font-medium">History</span>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading history…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">The history could not be loaded.</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No history yet.</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span>
                <span className="font-medium">{actorOf(entry)}</span> {describeActivity(entry)}
              </span>
              <time
                dateTime={entry.createdAt}
                title={new Date(entry.createdAt).toLocaleString()}
                className="shrink-0 text-xs text-muted-foreground"
              >
                {relativeTime(entry.createdAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
      {hasNextPage && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start"
          disabled={isFetchingNextPage}
          onClick={() => fetchNextPage()}
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </section>
  );
}
