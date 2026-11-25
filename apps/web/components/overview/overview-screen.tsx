'use client';

import { useState, type ReactNode } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertOctagon,
  Bug,
  CheckCircle2,
  Gauge,
  HeartPulse,
  ListChecks,
  PlayCircle,
  Target,
} from 'lucide-react';
import { useApiClient } from '../../lib/api-client';
import { useSessionContext } from '../../lib/session-context';
import { getOverview, getOverviewTrends, type HealthBand, type Overview, overviewKeys, viewerTimeZone } from '../../lib/overview-api';
import { pct } from '@railgun-qa/reporting';
import { LineChart } from '../charts/line-chart';
import { DonutChart } from '../charts/donut-chart';
import { activityKeys, listProjectActivity } from '../../lib/activity-api';
import { relativeTime } from '../../lib/activity-format';
import { BUG_STATUS_LABELS } from '../../lib/bugs-api';
import { ActivityFeed, ActivityRow } from '../activity/activity-screen';
import { SEVERITY_COLORS } from '../bugs/bug-badges';
import { PageHeader } from '../page-header';
import { StatTile } from '../dashboard/stat-tile';
import { failRateClass, SectionCard, SectionSkeleton, unrankedFailingText } from '../dashboard/section-card';
import { ErrorState } from '../states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** How many activity entries Recent History shows (PRD §6.1). */
export const RECENT_HISTORY_SIZE = 10;

export const HEALTH_TOOLTIP =
  'A 0–100 score combining pass rate over the last 30 days (40%), coverage (20%), bug pressure from open Critical, High and Medium bugs (25%), and freshness: Ready test cases run in the last 14 days (15%).';

const BAND_LABELS: Record<HealthBand, string> = { Healthy: 'Healthy', AtRisk: 'At Risk', Critical: 'Critical' };

/** The band's colour on the Health Score tile's value, icon and outline (PRD §6.1). */
const BAND_CLASSES: Record<HealthBand, { text: string; ring: string }> = {
  Healthy: { text: 'text-pass', ring: 'ring-pass/40' },
  AtRisk: { text: 'text-review', ring: 'ring-review/40' },
  Critical: { text: 'text-fail', ring: 'ring-fail/40' },
};

export { failRateClass };

/**
 * The Overview (PRD §6.1, specs/overview-screen): KPI tiles, the tests and bugs that need
 * attention, and recent activity. The trend charts arrive with Phase 9 Slice 3.
 */
export function OverviewScreen() {
  const session = useSessionContext();
  if (session.loading || !session.data) {
    return null;
  }
  const { projectId, projectName } = session.data;
  return (
    <TooltipProvider>
      <PageHeader title="Overview" description={projectName} />
      <OverviewBody projectId={projectId} />
    </TooltipProvider>
  );
}

function OverviewBody({ projectId }: { projectId: string }) {
  const apiClient = useApiClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: overviewKeys.detail(projectId),
    queryFn: () => getOverview(apiClient, projectId),
  });

  if (isError) {
    return <ErrorState message="The overview could not be loaded." onRetry={() => void refetch()} />;
  }
  return (
    <div className="flex flex-col gap-6">
      <KpiTiles data={isLoading ? null : (data ?? null)} />
      <OverviewCharts projectId={projectId}>
        <SectionCard title="Top Failing Tests">{isLoading || !data ? <SectionSkeleton /> : <TopFailingTests data={data} />}</SectionCard>
        <SectionCard title="Urgent Bugs">{isLoading || !data ? <SectionSkeleton /> : <UrgentBugs data={data} />}</SectionCard>
      </OverviewCharts>
      <RecentHistory projectId={projectId} />
    </div>
  );
}

export const PASS_RATE_TOOLTIP =
  'Each day: Pass ÷ (Pass + Fail + Needs Review) over the runs completed that day. Days with no runs are drawn as 0%.';

/**
 * PRD §6.1 rows 2–4 (specs/overview-screen): the Health Score trend across the width,
 * Pass Rate and Bug Velocity side by side, then Run Outcomes next to the two panels
 * passed in as children. Each trend keeps its own range (specs/dashboard-charts).
 */
function OverviewCharts({ projectId, children }: { projectId: string; children: ReactNode }) {
  const apiClient = useApiClient();
  const timeZone = viewerTimeZone();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: overviewKeys.trends(projectId, timeZone),
    queryFn: () => getOverviewTrends(apiClient, projectId, timeZone),
  });

  const chartSkeleton = (title: string) => (
    <SectionCard title={title}>
      <Skeleton className="h-48 w-full" aria-label="Loading" />
    </SectionCard>
  );
  if (isError) {
    return (
      <>
        <ErrorState message="The charts could not be loaded." onRetry={() => void refetch()} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{children}</div>
      </>
    );
  }
  const trends = isLoading ? null : (data ?? null);
  const dates = trends?.days.map((d) => d.date) ?? [];
  return (
    <>
      <div data-testid="overview-row-health">
        {trends ? (
          <LineChart
            title="Health Score trend"
            description="The Health Score as it stood at the end of each UTC day; today is the live score."
            dates={trends.health.map((h) => h.day)}
            kind="percent"
            emptyText="No data yet."
            height={240}
            series={[{ key: 'health', label: 'Health Score', color: 'var(--primary)', values: trends.health.map((h) => h.score) }]}
          />
        ) : (
          chartSkeleton('Health Score trend')
        )}
      </div>
      <div data-testid="overview-row-trends" className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {trends ? (
          <>
            <LineChart
              title="Pass Rate trend"
              description={PASS_RATE_TOOLTIP}
              dates={dates}
              kind="percent"
              series={[
                {
                  key: 'passRate',
                  label: 'Pass rate',
                  color: 'var(--pass)',
                  // 0 on a day with no runs (PRD §6.12.2), with the shared rounding.
                  values: trends.days.map((d) => pct(d.passed, d.completed)),
                },
              ]}
            />
            <LineChart
              title="Bug Velocity"
              description="Bugs reported and bugs resolved each day."
              dates={dates}
              kind="count"
              series={[
                { key: 'reported', label: 'Reported', color: 'var(--fail)', values: trends.days.map((d) => d.reported) },
                { key: 'resolved', label: 'Resolved', color: 'var(--pass)', values: trends.days.map((d) => d.resolved) },
              ]}
            />
          </>
        ) : (
          <>
            {chartSkeleton('Pass Rate trend')}
            {chartSkeleton('Bug Velocity')}
          </>
        )}
      </div>
      <div data-testid="overview-row-lists" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {trends ? (
          <DonutChart
            title="Run Outcomes · 30d"
            emptyText="No completed runs yet."
            parts={[
              { key: 'pass', label: 'Pass', color: 'var(--pass)', count: trends.outcomes30d.pass },
              { key: 'fail', label: 'Fail', color: 'var(--fail)', count: trends.outcomes30d.fail },
              { key: 'review', label: 'Needs Review', color: 'var(--review)', count: trends.outcomes30d.needsReview },
            ]}
          />
        ) : (
          chartSkeleton('Run Outcomes · 30d')
        )}
        {children}
      </div>
    </>
  );
}

function KpiTiles({ data }: { data: Overview | null }) {
  const health = data?.health;
  const tone = health?.band ? BAND_CLASSES[health.band] : undefined;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
      <StatTile
        icon={HeartPulse}
        label="Health Score"
        value={data ? (health!.score ?? 'No data') : null}
        subLabel={health?.band ? BAND_LABELS[health.band] : 'No completed runs yet'}
        tooltip={HEALTH_TOOLTIP}
        tone={tone}
      />
      <StatTile
        icon={ListChecks}
        label="Total Test Cases"
        value={data ? data.testCases.total : null}
        subLabel={`${data?.testCases.readyPct ?? 0}% ready`}
        tooltip="All test cases in this project, and the share whose status is Ready."
      />
      <StatTile
        icon={Target}
        label="Coverage"
        value={data ? `${data.testCases.coveragePct}%` : null}
        subLabel="run at least once"
        tooltip="The share of test cases with at least one completed run (Pass, Fail or Needs Review)."
      />
      <StatTile
        icon={Gauge}
        label="Pass Rate"
        value={data ? (data.passRate === null ? '—' : `${data.passRate}%`) : null}
        subLabel="last 30 days"
        tooltip="Pass ÷ (Pass + Fail + Needs Review) over the runs completed in the last 30 days."
      />
      <StatTile icon={PlayCircle} label="Active Runs" value={data ? data.activeExecutions : null} subLabel="executions in progress" />
      <StatTile
        icon={Bug}
        label="Open Bugs"
        value={data ? data.openBugs : null}
        subLabel="open + in progress"
        tooltip="Bugs whose status is Open or In Progress."
      />
      <StatTile icon={AlertOctagon} label="Critical Bugs" value={data ? data.criticalBugs : null} subLabel="open critical" />
    </div>
  );
}

function TopFailingTests({ data }: { data: Overview }) {
  const unranked = data.failingBelowMinimum;
  if (data.topFailingTests.length === 0) {
    // "— nice!" only when nothing has failed (design.md decision 7).
    return unranked > 0 ? (
      <p className="text-sm text-muted-foreground">{unrankedFailingText(unranked, false)}</p>
    ) : (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="size-4 text-pass" /> No failing tests — nice!
      </p>
    );
  }
  return (
    <>
      <ol className="flex flex-col divide-y">
        {data.topFailingTests.map((test, index) => (
          <li key={test.id}>
            <a
              href={`/test-cases?testCase=${test.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 py-2 text-sm hover:bg-muted/50"
            >
              <span className="w-4 text-xs text-muted-foreground tabular-nums">{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{test.name}</span>
                <span className="text-xs text-muted-foreground">
                  {test.failed} of {test.completed} runs failed
                </span>
              </span>
              <span className={cn('font-semibold tabular-nums', failRateClass(test.failRatePct))}>{test.failRatePct}%</span>
            </a>
          </li>
        ))}
      </ol>
      {unranked > 0 && <p className="text-xs text-muted-foreground">{unrankedFailingText(unranked, true)}</p>}
    </>
  );
}

function UrgentBugs({ data }: { data: Overview }) {
  if (data.urgentBugs.length === 0) {
    return <p className="text-sm text-muted-foreground">No critical or high open bugs.</p>;
  }
  return (
    <ol className="flex flex-col divide-y">
      {data.urgentBugs.map((bug) => (
        <li key={bug.id}>
          <a href={`/bugs?bug=${bug.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 py-2 text-sm hover:bg-muted/50">
            <span className="inline-flex w-20 shrink-0 items-center gap-1.5 text-xs font-medium">
              <span aria-hidden className={`size-2 rounded-full ${SEVERITY_COLORS[bug.severity]}`} />
              {bug.severity}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{bug.title}</span>
              <span className="text-xs text-muted-foreground">
                {BUG_STATUS_LABELS[bug.status]} · opened {relativeTime(bug.createdAt)}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ol>
  );
}

/** The latest entries of the project feed, sharing the Activity screen's cache (design.md decision 7). */
function RecentHistory({ projectId }: { projectId: string }) {
  const apiClient = useApiClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useInfiniteQuery({
    queryKey: activityKeys.project(projectId, null),
    queryFn: ({ pageParam }) => listProjectActivity(apiClient, projectId, null, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last?.nextCursor ?? null,
  });
  const entries = (data?.pages[0]?.entries ?? []).slice(0, RECENT_HISTORY_SIZE);

  return (
    <SectionCard
      title="Recent History"
      action={
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <Activity /> Full History
        </Button>
      }
    >
      {isLoading ? (
        <SectionSkeleton />
      ) : isError ? (
        <ErrorState message="The history could not be loaded." onRetry={() => void refetch()} />
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ol aria-label="Recent history" className="flex flex-col divide-y border-l-2 border-muted pl-2">
          {entries.map((entry) => (
            <ActivityRow key={entry.id} entry={entry} />
          ))}
        </ol>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Full History</DialogTitle>
          </DialogHeader>
          {open && <ActivityFeed projectId={projectId} type={null} />}
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
