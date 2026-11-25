'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, Download, ListChecks, Sparkles, Target } from 'lucide-react';
import { DEFAULT_NEEDS_ATTENTION, type NeedsAttentionState, pct } from '@railgun-qa/reporting';
import { useApiClient } from '../../lib/api-client';
import { viewerTimeZone } from '../../lib/overview-api';
import { REPORT_FAILED, useReportDownload } from '../../lib/reports-api';
import { listTags, tagKeys } from '../../lib/tags-api';
import { getTestCaseDashboard, testCaseKeys, type TestCaseDashboard as DashboardData } from '../../lib/test-cases-api';
import { LineChart } from '../charts/line-chart';
import { DEFAULT_RANGE, type Range } from '../charts/range-select';
import { DonutChart } from '../charts/donut-chart';
import { StatTile } from '../dashboard/stat-tile';
import { PASS_RATE_TOOLTIP } from '../overview/overview-screen';
import { EmptyState, ErrorState } from '../states';
import { DashboardHistory } from './dashboard-history';
import { FolderHealthTable } from './folder-health-table';
import { NeedsAttentionTable } from './needs-attention-table';
import { Rankings } from './rankings';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export const OVER_TIME_TOOLTIP =
  'Each day: test cases created, runs added to executions, and runs completed (Pass, Fail or Needs Review).';

/**
 * The Test Cases dashboard view (PRD §6.2.4, specs/test-cases-screen): the right panel
 * when nothing is selected. Every showing fetches current figures (PRD §6.12.4).
 */
export function TestCaseDashboard({ projectId }: { projectId: string }) {
  const apiClient = useApiClient();
  const timeZone = viewerTimeZone();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: testCaseKeys.dashboard(projectId, timeZone),
    queryFn: () => getTestCaseDashboard(apiClient, projectId, timeZone),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const tags = useQuery({ queryKey: tagKeys.list(projectId), queryFn: () => listTags(apiClient, projectId) });
  // What Download report asks for: the charts' ranges and Needs Attention as shown
  // (specs/test-cases-screen; test-cases-dashboard-report design.md decision 6).
  const [ranges, setRanges] = useState<{ overTime: Range; passRate: Range }>({ overTime: DEFAULT_RANGE, passRate: DEFAULT_RANGE });
  const [needsAttention, setNeedsAttention] = useState<NeedsAttentionState>(DEFAULT_NEEDS_ATTENTION);
  const download = useReportDownload(projectId, 'test-cases-dashboard');
  const requestReport = () => download.start({ tz: timeZone, ranges, needsAttention });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading dashboard">
        <Skeleton className="h-6 w-48" data-testid="dashboard-title-placeholder" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full" data-testid="dashboard-tile-placeholder" />
          ))}
        </div>
      </div>
    );
  }
  if (isError || !data) {
    return <ErrorState message="The dashboard could not be loaded." onRetry={() => void refetch()} />;
  }
  if (data.tiles.total === 0) {
    return <EmptyState icon={ClipboardList} title="No test cases yet" description="Create test cases to start seeing metrics" />;
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4" aria-label="Test Cases dashboard">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">Dashboard</h2>
          <div className="flex flex-col items-end gap-1">
            <Button type="button" size="sm" variant="outline" disabled={download.state === 'generating'} onClick={requestReport}>
              <Download className="size-4" />
              {download.state === 'generating' ? 'Generating…' : 'Download report'}
            </Button>
            {download.state === 'failed' && (
              <p role="alert" className="flex items-center gap-2 text-xs text-fail">
                {REPORT_FAILED}
                <Button type="button" size="sm" variant="ghost" className="h-6 px-2" onClick={requestReport}>
                  Try again
                </Button>
              </p>
            )}
          </div>
        </div>
        <Tiles data={data} />
        <Trends data={data} ranges={ranges} onRangesChange={setRanges} />
        <div data-testid="tc-dashboard-donuts" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <DonutChart
            title="Last Run Outcome"
            emptyText="No test cases yet."
            parts={[
              { key: 'pass', label: 'Pass', color: 'var(--pass)', count: data.lastOutcome.pass },
              { key: 'fail', label: 'Fail', color: 'var(--fail)', count: data.lastOutcome.fail },
              { key: 'review', label: 'Needs Review', color: 'var(--review)', count: data.lastOutcome.needsReview },
              { key: 'never', label: 'Never Run', color: 'var(--muted-foreground)', count: data.lastOutcome.neverRun },
            ]}
          />
          <DonutChart
            title="Source Type"
            emptyText="No test cases yet."
            parts={[
              { key: 'gherkin', label: 'Gherkin', color: 'var(--tag-violet)', count: data.sourceType.gherkin },
              { key: 'manual', label: 'Manual', color: 'var(--tag-blue)', count: data.sourceType.manual },
            ]}
          />
        </div>
        <NeedsAttentionTable rows={data.needsAttention} tags={tags.data ?? []} state={needsAttention} onStateChange={setNeedsAttention} />
        <Rankings rankings={data.rankings} />
        <FolderHealthTable rows={data.folderHealth} />
        <DashboardHistory projectId={projectId} />
      </div>
    </TooltipProvider>
  );
}

function Tiles({ data }: { data: DashboardData }) {
  const { total, ready, covered, avgConfidencePct } = data.tiles;
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StatTile icon={ListChecks} label="Total Tests" value={total} subLabel={`${ready} ready`} />
      <StatTile
        icon={CheckCircle2}
        label="Ready"
        value={`${pct(ready, total)}%`}
        subLabel={`${ready} of ${total} cases`}
        tooltip="The share of test cases whose status is Ready."
      />
      <StatTile
        icon={Target}
        label="Coverage"
        value={`${pct(covered, total)}%`}
        subLabel={`${total - covered} never run`}
        tooltip="The share of test cases with at least one completed run (Pass, Fail or Needs Review), as on the Overview."
      />
      <StatTile
        icon={Sparkles}
        label="Avg Confidence"
        value={avgConfidencePct === null ? '—' : `${avgConfidencePct}%`}
        subLabel="from last run results"
        tooltip="The mean AI confidence of each test case's latest completed automated run. Shown once automated runs exist."
      />
    </div>
  );
}

/** Test Cases Over Time and Pass Rate Trend; the latter only once a run has completed. */
function Trends({
  data,
  ranges,
  onRangesChange,
}: {
  data: DashboardData;
  ranges: { overTime: Range; passRate: Range };
  onRangesChange: (ranges: { overTime: Range; passRate: Range }) => void;
}) {
  const dates = data.days.map((d) => d.date);
  return (
    <div data-testid="tc-dashboard-trends" className={cn('grid grid-cols-1 gap-4', data.hasCompletedRuns && 'xl:grid-cols-2')}>
      <LineChart
        title="Test Cases Over Time"
        description={OVER_TIME_TOOLTIP}
        dates={dates}
        kind="count"
        range={ranges.overTime}
        onRangeChange={(overTime) => onRangesChange({ ...ranges, overTime })}
        series={[
          { key: 'created', label: 'Created', color: 'var(--primary)', values: data.days.map((d) => d.created) },
          { key: 'added', label: 'Added to executions', color: 'var(--tag-violet)', values: data.days.map((d) => d.added) },
          { key: 'completed', label: 'Completed', color: 'var(--pass)', values: data.days.map((d) => d.completed) },
        ]}
      />
      {data.hasCompletedRuns && (
        <LineChart
          title="Pass Rate Trend"
          description={PASS_RATE_TOOLTIP}
          dates={dates}
          kind="percent"
          range={ranges.passRate}
          onRangeChange={(passRate) => onRangesChange({ ...ranges, passRate })}
          series={[{ key: 'passRate', label: 'Pass rate', color: 'var(--pass)', values: data.days.map((d) => pct(d.passed, d.completed)) }]}
        />
      )}
    </div>
  );
}
