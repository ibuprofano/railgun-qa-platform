'use client';

import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useApiClient } from '../../lib/api-client';
import { activityKeys, listProjectActivity, type ActivityType } from '../../lib/activity-api';
import { ActivityFeed, ActivityRow } from '../activity/activity-screen';
import { ErrorState } from '../states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** How many entries the panel shows (PRD §6.12.4). */
export const DASHBOARD_HISTORY_SIZE = 5;

/** One area of activity the panel can show. */
export interface HistoryTab {
  type: ActivityType;
  /** The tab's label; unused with a single tab. */
  label: string;
  /** The entry list's and the full-history dialog's name. */
  title: string;
  emptyText: string;
}

export const TEST_CASE_HISTORY: HistoryTab = {
  type: 'test-cases',
  label: 'Test Cases',
  title: 'Test case history',
  emptyText: 'No test case activity yet.',
};

/**
 * A dashboard's History panel (PRD §6.12.4): collapsed by default, the latest 5 entries
 * of the open area worded as on the Activity screen, a count badge ("5+" when there are
 * more), and "See full history" for the open area. With several tabs (the Executions
 * dashboard's Executions and Runs, PRD §6.3.6) a tab row picks the area; only the open
 * tab is fetched, from the Activity screen's cache.
 */
export function DashboardHistory({ projectId, tabs = [TEST_CASE_HISTORY] }: { projectId: string; tabs?: HistoryTab[] }) {
  const apiClient = useApiClient();
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [tabIndex, setTabIndex] = useState(0);
  const tab = tabs[tabIndex] ?? tabs[0];
  const { data, isLoading, isError, refetch } = useInfiniteQuery({
    queryKey: activityKeys.project(projectId, tab.type),
    queryFn: ({ pageParam }) => listProjectActivity(apiClient, projectId, tab.type, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last?.nextCursor ?? null,
  });
  const first = data?.pages[0];
  const all = first?.entries ?? [];
  const entries = all.slice(0, DASHBOARD_HISTORY_SIZE);
  const more = all.length > DASHBOARD_HISTORY_SIZE || (first?.nextCursor ?? null) !== null;
  const badge = more ? `${DASHBOARD_HISTORY_SIZE}+` : String(entries.length);

  return (
    <section aria-label="History" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground"
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          History
          {!isLoading && !isError && (
            <span data-testid="history-count" className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">
              {badge}
            </span>
          )}
        </button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setFull(true)}>
          See full history
        </Button>
      </div>
      {open && tabs.length > 1 && (
        <div role="tablist" aria-label="History area" className="flex gap-1">
          {tabs.map((t, i) => (
            <button
              key={t.type}
              type="button"
              role="tab"
              aria-selected={i === tabIndex}
              onClick={() => setTabIndex(i)}
              className={cn(
                'rounded-md px-2 py-1 text-xs',
                i === tabIndex ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {open &&
        (isLoading ? (
          <p className="text-sm text-muted-foreground">Loading history…</p>
        ) : isError ? (
          <ErrorState message="The history could not be loaded." onRetry={() => void refetch()} />
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tab.emptyText}</p>
        ) : (
          <ol aria-label={tab.title} className="flex flex-col divide-y border-l-2 border-muted pl-2">
            {entries.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} />
            ))}
          </ol>
        ))}
      <Dialog open={full} onOpenChange={setFull}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{tab.title}</DialogTitle>
          </DialogHeader>
          {full && <ActivityFeed projectId={projectId} type={tab.type} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}
