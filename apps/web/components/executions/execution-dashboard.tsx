'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  COMPLETED_OUTCOMES,
  DAILY_OUTCOME_LABELS,
  DEFAULT_RUN_TABLE_STATE,
  describeFilters,
  EXECUTION_STATUSES,
  executionDailySeries,
  executionStatusSplit,
  executionTiles,
  hasActiveFilters,
  OUTCOME_LABELS,
  RUN_OUTCOMES,
  runOutcomeSplit,
  scopeDashboard,
  STATUS_LABELS,
  type CompletedOutcome,
  type ExecutionFilters,
  type ExecutionStatus,
  type RunOutcome,
  type RunTableState,
} from '@railgun-qa/reporting';
import { Clock, ListChecks, PlayCircle, Target } from 'lucide-react';
import { useApiClient } from '../../lib/api-client';
import { viewerTimeZone } from '../../lib/overview-api';
import { executionKeys, getExecutionDashboard } from '../../lib/executions-api';
import { listTags, tagKeys } from '../../lib/tags-api';
import { useReportDownload } from '../../lib/reports-api';
import { LineChart } from '../charts/line-chart';
import { StackedBarChart } from '../charts/stacked-bar-chart';
import { DonutChart } from '../charts/donut-chart';
import { DEFAULT_RANGE, type Range } from '../charts/range-select';
import { EXECUTION_STATUS_COLORS, OUTCOME_COLORS } from '../charts/chart-format';
import { StatTile } from '../dashboard/stat-tile';
import { EmptyState, ErrorState } from '../states';
import { DashboardHistory, type HistoryTab } from '../test-cases/dashboard-history';
import { ExecutionRunsTable } from './execution-runs-table';
import { ExportDialog } from './export-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';

/** The History panel's two areas (PRD §6.3.6). */
export const EXECUTION_HISTORY_TABS: HistoryTab[] = [
  { type: 'executions', label: 'Executions', title: 'Execution history', emptyText: 'No execution activity yet.' },
  { type: 'runs', label: 'Runs', title: 'Run history', emptyText: 'No run activity yet.' },
];

export interface ExecutionDashboardProps {
  projectId: string;
  /** The execution list's filters, kept by the screen: the dashboard's scope. */
  filters: ExecutionFilters;
  onFiltersChange: (filters: ExecutionFilters) => void;
}

/**
 * The Executions dashboard view (PRD §6.3.6; specs/executions-screen): the right panel
 * when no execution is selected. It reads every live execution's rows once, then scopes
 * and counts them in the browser with the list's own filter, so every chart click is
 * instant (design.md decisions 1 and 6). Every showing fetches current data.
 */
export function ExecutionDashboard({ projectId, filters, onFiltersChange }: ExecutionDashboardProps) {
  const apiClient = useApiClient();
  const timeZone = viewerTimeZone();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: executionKeys.dashboard(projectId, timeZone),
    queryFn: () => getExecutionDashboard(apiClient, projectId, timeZone),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const tags = useQuery({ queryKey: tagKeys.list(projectId), queryFn: () => listTags(apiClient, projectId) });
  const [table, setTable] = useState<RunTableState>(DEFAULT_RUN_TABLE_STATE);
  const [executionsRange, setExecutionsRange] = useState<Range>(DEFAULT_RANGE);
  const [runsRange, setRunsRange] = useState<Range>(DEFAULT_RANGE);
  // Download PDF (specs/executions-screen): requested with the export dialog's options.
  const download = useReportDownload(projectId, 'executions-dashboard');

  const scope = useMemo(() => (data ? scopeDashboard(data, filters) : null), [data, filters]);
  const tagName = (id: string) => tags.data?.find((t) => t.id === id)?.name ?? 'Unknown tag';
  const history = <DashboardHistory projectId={projectId} tabs={EXECUTION_HISTORY_TABS} />;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading dashboard">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-24 w-full" data-testid="dashboard-tile-placeholder" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-56 w-full" data-testid="dashboard-chart-placeholder" />
            ))}
          </div>
        </div>
        {history}
      </div>
    );
  }
  if (isError || !data || !scope) {
    return <ErrorState message="The dashboard could not be loaded." onRetry={() => void refetch()} />;
  }
  if (data.executions.length === 0) {
    return <EmptyState icon={PlayCircle} title="No executions yet" description="Create an execution to start seeing metrics" />;
  }

  const tiles = executionTiles(scope);
  const series = executionDailySeries(scope, data.today);
  const statusSplit = executionStatusSplit(scope);
  const outcomeSplit = runOutcomeSplit(scope);
  const notice = describeFilters(filters, tagName);

  const toggleStatus = (status: string) =>
    onFiltersChange({ ...filters, status: filters.status === status ? undefined : (status as ExecutionStatus) });
  const toggleOutcome = (outcome: string) =>
    setTable((t) => ({ ...t, tab: 'all', day: null, outcome: t.outcome === outcome ? null : (outcome as RunOutcome) }));
  const toggleDay = ({ date, key }: { date: string; key: string }) =>
    setTable((t) => {
      const same = t.day?.date === date && t.day.outcome === key;
      return { ...t, tab: 'all', day: same ? null : { date, outcome: key as CompletedOutcome } };
    });

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4" data-testid="execution-dashboard">
        <div className="flex flex-wrap items-start justify-between gap-2">
          {hasActiveFilters(filters) ? (
            <div role="note" aria-label="Dashboard scope" className="flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
              <span className="font-medium">Showing executions matching</span>
              {notice.map((entry) => (
                <span key={entry} className="rounded bg-background px-1.5 py-0.5 text-xs">
                  {entry}
                </span>
              ))}
              <Button type="button" size="sm" variant="ghost" onClick={() => onFiltersChange({})}>
                Clear filters
              </Button>
            </div>
          ) : (
            <span />
          )}
          <ExportDialog
            filters={filters}
            runTable={table}
            ranges={{ executionsOverTime: executionsRange, runsOverTime: runsRange }}
            timeZone={timeZone}
            executionCount={tiles.executions}
            tagName={tagName}
            onDownload={download.start}
            downloadState={download.state}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile icon={PlayCircle} label="Executions" value={tiles.executions} subLabel={`${tiles.active} active`} tooltip="Executions in scope; active means In Progress or Paused." />
          <StatTile icon={ListChecks} label="Total Runs" value={tiles.totalRuns} subLabel={`${tiles.completedRuns} completed`} tooltip="Every run of those executions, by its current outcome." />
          <StatTile
            icon={Target}
            label="Pass Rate"
            value={tiles.passRatePct === null ? '—' : `${tiles.passRatePct}%`}
            subLabel={tiles.passRatePct === null ? 'no results yet' : `${tiles.passedRuns} of ${tiles.completedRuns} runs`}
            tooltip="Pass ÷ (Pass + Fail + Needs Review), over their completed runs."
          />
          <StatTile
            icon={Clock}
            label="Avg Duration"
            value={tiles.avgDurationSeconds === null ? '—' : `${tiles.avgDurationSeconds.toFixed(1)}s`}
            subLabel="per test run"
            tooltip="The mean duration of runs that record one. Only automated runs do, so this shows once they exist."
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <LineChart
            title="Executions Over Time"
            description="Executions that reached Completed, per day."
            dates={series.dates}
            kind="count"
            series={[{ key: 'completed', label: 'Completed', color: 'var(--status-completed)', values: series.completedExecutions }]}
            range={executionsRange}
            onRangeChange={setExecutionsRange}
          />
          <StackedBarChart
            title="Runs Over Time"
            description="Runs completed per day, by outcome. Select a segment to list those runs below."
            dates={series.dates}
            series={COMPLETED_OUTCOMES.map((outcome) => ({
              key: outcome,
              label: DAILY_OUTCOME_LABELS[outcome],
              color: OUTCOME_COLORS[outcome],
              values: outcome === 'Pass' ? series.passed : outcome === 'Fail' ? series.failed : series.needsReview,
            }))}
            emptyText="No completed runs in this range."
            range={runsRange}
            onRangeChange={setRunsRange}
            selected={table.day ? { date: table.day.date, key: table.day.outcome } : null}
            onSelect={toggleDay}
          />
          <DonutChart
            title="Execution Status"
            parts={EXECUTION_STATUSES.map((status) => ({
              key: status,
              label: STATUS_LABELS[status],
              color: EXECUTION_STATUS_COLORS[status],
              count: statusSplit[status],
            }))}
            emptyText="No executions match these filters."
            sortByCount
            selectedKey={filters.status ?? null}
            onSelect={toggleStatus}
          />
          <DonutChart
            title="Run Outcomes"
            parts={RUN_OUTCOMES.map((outcome) => ({
              key: outcome,
              label: OUTCOME_LABELS[outcome],
              color: OUTCOME_COLORS[outcome],
              count: outcomeSplit[outcome],
            }))}
            emptyText="No runs yet."
            selectedKey={table.outcome}
            onSelect={toggleOutcome}
          />
        </div>

        <ExecutionRunsTable runs={scope.runs} state={table} onStateChange={setTable} />
        {history}
      </div>
    </TooltipProvider>
  );
}

