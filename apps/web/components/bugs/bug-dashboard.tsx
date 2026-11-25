'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  avgResolutionTime,
  BACKLOG_AGES,
  backlogAgeSplit,
  BUG_SEVERITIES,
  BUG_STATUS_LABELS,
  BUG_STATUSES,
  bugDailySeries,
  bugSeveritySplit,
  bugStatusSplit,
  bugTagCounts,
  bugTiles,
  needsAttention,
  openSeveritySplit,
  type BugSeverity,
} from '@railgun-qa/reporting';
import { Bug as BugIcon, CheckCircle2, CircleDot, Download, Flame } from 'lucide-react';
import { useApiClient } from '../../lib/api-client';
import { viewerTimeZone } from '../../lib/overview-api';
import { bugKeys, getBugDashboard } from '../../lib/bugs-api';
import { REPORT_FAILED, useReportDownload } from '../../lib/reports-api';
import { LineChart } from '../charts/line-chart';
import { DonutChart } from '../charts/donut-chart';
import { WordCloud } from '../charts/word-cloud';
import { DEFAULT_RANGE, type Range } from '../charts/range-select';
import { BACKLOG_AGE_COLORS, BUG_STATUS_COLORS, SEVERITY_CHART_COLORS, tagChartColor } from '../charts/chart-format';
import { StatTile } from '../dashboard/stat-tile';
import { SectionCard } from '../dashboard/section-card';
import { EmptyState, ErrorState } from '../states';
import { SEVERITY_COLORS } from './bug-badges';
import { BugNeedsAttention } from './bug-needs-attention';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';

export { REPORT_FAILED };
export const BACKLOG_AGE_HELP =
  'Open bugs by time since they were reported: Fresh under 7 days, Aging 7–30 days, Old over 30 days.';

const BACKLOG_AGE_LABELS = { Fresh: 'Fresh (< 7 days)', Aging: 'Aging (7–30 days)', Old: 'Old (> 30 days)' } as const;

export interface BugDashboardProps {
  projectId: string;
  /** Opens a bug's detail, from a Needs Attention row. */
  onOpenBug: (id: string) => void;
}

const severityParts = (split: Record<BugSeverity, number>) =>
  BUG_SEVERITIES.map((severity) => ({ key: severity, label: severity, color: SEVERITY_CHART_COLORS[severity], count: split[severity] }));

function Header({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold">Dashboard</h2>
        <p className="text-sm text-muted-foreground">Aggregate bug metrics for this project</p>
      </div>
      {children}
    </div>
  );
}

/**
 * The Bugs dashboard view (PRD §6.4.4; specs/bugs-screen): the right panel when no bug is
 * selected. It reads every live bug's rows once and builds each widget with the shared
 * rules in @railgun-qa/reporting (bugs-dashboard design.md decisions 1, 2 and 7). Every
 * showing fetches current data.
 */
export function BugDashboard({ projectId, onOpenBug }: BugDashboardProps) {
  const apiClient = useApiClient();
  const timeZone = viewerTimeZone();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: bugKeys.dashboard(projectId, timeZone),
    queryFn: () => getBugDashboard(apiClient, projectId, timeZone),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const [range, setRange] = useState<Range>(DEFAULT_RANGE);
  // Download report (specs/bugs-screen): the browser's zone and the charts' shared range.
  const download = useReportDownload(projectId, 'bugs-dashboard');

  const figures = useMemo(
    () =>
      data
        ? {
            tiles: bugTiles(data),
            series: bugDailySeries(data),
            severity: bugSeveritySplit(data),
            status: bugStatusSplit(data),
            openSeverity: openSeveritySplit(data),
            age: backlogAgeSplit(data),
            resolution: avgResolutionTime(data),
            tags: bugTagCounts(data),
            attention: needsAttention(data),
          }
        : null,
    [data],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading dashboard">
        <Skeleton className="h-10 w-64" data-testid="dashboard-title-placeholder" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full" data-testid="dashboard-tile-placeholder" />
          ))}
        </div>
      </div>
    );
  }
  if (isError || !data || !figures) {
    return <ErrorState message="The dashboard could not be loaded." onRetry={() => void refetch()} />;
  }
  if (data.bugs.length === 0) {
    return <EmptyState icon={BugIcon} title="No bugs yet" description="Report a bug to start seeing metrics" />;
  }

  const { tiles, series } = figures;

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4" data-testid="bug-dashboard">
        <Header>
          <div className="flex flex-col items-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={download.state === 'generating'}
              onClick={() => download.start({ tz: timeZone, range })}
            >
              <Download className="size-4" />
              {download.state === 'generating' ? 'Generating…' : 'Download report'}
            </Button>
            {download.state === 'failed' && (
              <p role="alert" className="flex items-center gap-2 text-xs text-fail">
                {REPORT_FAILED}
                <Button type="button" size="sm" variant="ghost" className="h-6 px-2" onClick={() => download.start({ tz: timeZone, range })}>
                  Try again
                </Button>
              </p>
            )}
          </div>
        </Header>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile icon={BugIcon} label="Total Bugs" value={tiles.total} subLabel={`${tiles.inProgress} in progress`} tooltip="Every bug of the project, in any status." />
          <StatTile icon={CircleDot} label="Open" value={tiles.open} subLabel="needs attention" tooltip="Bugs whose status is Open." />
          <StatTile
            icon={CheckCircle2}
            label="Resolved"
            value={tiles.resolved}
            subLabel={`of ${tiles.total} total`}
            tooltip="Bugs whose status is Resolved, not Closed or Won't Fix."
          />
          <StatTile
            icon={Flame}
            label="Critical (all time)"
            value={tiles.critical}
            subLabel="highest severity"
            tooltip="Critical bugs in every status, unlike the Overview's Critical Bugs, which counts open ones only."
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <LineChart
            title="Reported vs Resolved"
            description="Per day: bugs reported, and bugs resolved by their resolution date."
            dates={series.dates}
            kind="count"
            series={[
              { key: 'reported', label: 'Reported', color: 'var(--fail)', values: series.reported },
              { key: 'resolved', label: 'Resolved', color: 'var(--pass)', values: series.resolved },
            ]}
            range={range}
            onRangeChange={setRange}
          />
          <LineChart
            title="Reported vs Resolved — Critical"
            description="The same, for bugs whose severity is Critical."
            dates={series.dates}
            kind="count"
            series={[
              { key: 'reported', label: 'Reported', color: 'var(--fail)', values: series.criticalReported },
              { key: 'resolved', label: 'Resolved', color: 'var(--pass)', values: series.criticalResolved },
            ]}
            range={range}
            onRangeChange={setRange}
          />
          <DonutChart title="All Bugs by Severity" parts={severityParts(figures.severity)} emptyText="No bugs yet." />
          <DonutChart
            title="All Bugs by Status"
            parts={BUG_STATUSES.map((status) => ({
              key: status,
              label: BUG_STATUS_LABELS[status],
              color: BUG_STATUS_COLORS[status],
              count: figures.status[status],
            }))}
            emptyText="No bugs yet."
          />
          <DonutChart title="Open by Severity" parts={severityParts(figures.openSeverity)} emptyText="No open bugs." />
          <DonutChart
            title="Backlog Age"
            description={BACKLOG_AGE_HELP}
            parts={BACKLOG_AGES.map((age) => ({ key: age, label: BACKLOG_AGE_LABELS[age], color: BACKLOG_AGE_COLORS[age], count: figures.age[age] }))}
            emptyText="No open bugs."
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SectionCard title="Avg Resolution Time">
            {figures.resolution.length === 0 ? (
              <p className="text-sm text-muted-foreground">No resolved bugs yet</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm" aria-label="Avg Resolution Time">
                {figures.resolution.map((row) => (
                  <li key={row.severity} className="flex items-center gap-2">
                    <span aria-hidden className={`size-2 rounded-full ${SEVERITY_COLORS[row.severity]}`} />
                    <span className="flex-1">{row.severity}</span>
                    <span className="font-semibold tabular-nums">{row.days}d</span>
                    <span className="text-muted-foreground">({row.count} {row.count === 1 ? 'bug' : 'bugs'})</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="Bugs by Tag">
            <WordCloud
              title="Bugs by Tag"
              words={figures.tags.map((t) => ({ key: t.tagId, label: t.name, count: t.count, color: tagChartColor(t.color) }))}
              emptyText="No tagged bugs yet."
            />
          </SectionCard>
        </div>

        <BugNeedsAttention rows={figures.attention} onOpenBug={onOpenBug} />
      </div>
    </TooltipProvider>
  );
}
