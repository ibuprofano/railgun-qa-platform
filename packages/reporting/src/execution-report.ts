import {
  chartFilterLabel,
  COMPLETED_OUTCOMES,
  DAILY_OUTCOME_LABELS,
  describeFilters,
  EXECUTION_STATUSES,
  executionDailySeries,
  executionStatusSplit,
  executionTiles,
  filterRuns,
  OUTCOME_LABELS,
  RUN_OUTCOMES,
  runOutcomeSplit,
  scopeDashboard,
  sortRuns,
  STATUS_LABELS,
  type CompletedOutcome,
  type ExecutionDashboardData,
  type ExecutionReportOptions,
  type ExecutionStatus,
  type ExecutionTiles,
  type RunOutcome,
} from './execution-dashboard';
import { lineChart } from './charts/line';
import { stackedBarChart } from './charts/stacked-bar';
import { lineChartSvg, PRINT_PALETTE, stackedBarChartSvg } from './charts/svg';
import { formatDayLabel } from './execution-dashboard';
import { donut, REPORT_CHART_HEIGHT, REPORT_CHART_WIDTH, type ReportChart, type ReportDonut } from './report-parts';

/**
 * The Executions dashboard report's data (PRD §8, §6.3.6; specs/executions-dashboard-report;
 * executions-dashboard-report design.md decision 5): the dashboard's own scope, figures and
 * runs-table rules, fed the options the export dialog built. Plain data, allow-listed fields.
 */

/** Hex mirrors of the theme's execution status colours (globals.css --status-*), for print. */
export const PRINT_EXECUTION_STATUS_COLORS: Record<ExecutionStatus, string> = {
  Draft: '#8a8f98',
  Ready: '#22a05b',
  InProgress: '#2f6fd6',
  Paused: '#d9a21b',
  Completed: '#1f7a4a',
  Done: '#b7bbc2',
  Canceled: '#c97a6e',
};

/** Hex mirrors of the outcome colours (--pass, --fail, --review, --pending), for print. */
export const PRINT_OUTCOME_COLORS: Record<RunOutcome, string> = {
  Pass: '#16a34a',
  Fail: '#dc2626',
  NeedsReview: '#d97706',
  Pending: '#a3a3a3',
};

export interface ExecutionReportData {
  projectName: string;
  generatedOn: string;
  /** The active list filters, named ("Status: Done"); empty with none. */
  filters: string[];
  tiles: ExecutionTiles;
  charts: ReportChart[];
  donuts: ReportDonut[];
  /** With the Test Executions switch on. */
  executions: { name: string; status: string; environment: string | null; browser: string; completedOn: string | null }[] | null;
  /** With the Runs switch on: the runs the runs table shows, in its order. */
  runs: {
    /** "Needs Attention" or "All Runs", then the chart and name filters. */
    filter: string;
    rows: { execution: string; position: number; testCase: string; outcome: string; attempts: number; bugs: number }[];
  } | null;
}

export function executionReportData(
  data: ExecutionDashboardData,
  options: ExecutionReportOptions,
  context: { projectName: string; tagName: (id: string) => string },
): ExecutionReportData {
  const scope = scopeDashboard(data, options.filters);
  const series = executionDailySeries(scope, data.today);
  const last = <T>(values: T[], days: number) => values.slice(-days);

  const executionsDays = options.ranges.executionsOverTime;
  const executionsChart = lineChart({
    dates: last(series.dates, executionsDays),
    width: REPORT_CHART_WIDTH,
    height: REPORT_CHART_HEIGHT,
    kind: 'count',
    series: [{ key: 'completed', label: 'Completed', color: PRINT_EXECUTION_STATUS_COLORS.Completed, values: last(series.completedExecutions, executionsDays) }],
  });
  const runsDays = options.ranges.runsOverTime;
  const byOutcome: Record<CompletedOutcome, number[]> = { Pass: series.passed, Fail: series.failed, NeedsReview: series.needsReview };
  const runsChart = stackedBarChart({
    dates: last(series.dates, runsDays),
    width: REPORT_CHART_WIDTH,
    height: REPORT_CHART_HEIGHT,
    series: COMPLETED_OUTCOMES.map((o) => ({ key: o, label: DAILY_OUTCOME_LABELS[o], color: PRINT_OUTCOME_COLORS[o], values: last(byOutcome[o], runsDays) })),
  });

  const status = executionStatusSplit(scope);
  const outcomes = runOutcomeSplit(scope);
  const table = options.runTable;
  const runFilter = [
    table.tab === 'needsAttention' ? 'Needs Attention' : 'All Runs',
    chartFilterLabel(table, formatDayLabel),
    table.name.trim() ? `Name: ${table.name.trim()}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    projectName: context.projectName,
    generatedOn: data.today,
    filters: describeFilters(options.filters, context.tagName),
    tiles: executionTiles(scope),
    charts: [
      { title: `Executions Over Time (last ${executionsDays} days)`, svg: lineChartSvg(executionsChart, PRINT_PALETTE, 'Executions Over Time'), width: executionsChart.width, height: executionsChart.height },
      { title: `Runs Over Time (last ${runsDays} days)`, svg: stackedBarChartSvg(runsChart, PRINT_PALETTE, 'Runs Over Time'), width: runsChart.width, height: runsChart.height },
    ],
    donuts: [
      donut(
        'Execution Status',
        EXECUTION_STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s], color: PRINT_EXECUTION_STATUS_COLORS[s], count: status[s] })),
        'No executions match these filters.',
        'count',
      ),
      donut(
        'Run Outcomes',
        RUN_OUTCOMES.map((o) => ({ key: o, label: OUTCOME_LABELS[o], color: PRINT_OUTCOME_COLORS[o], count: outcomes[o] })),
        'No runs yet.',
      ),
    ],
    executions: options.include.executions
      ? scope.executions.map((e) => ({
          name: e.name,
          status: STATUS_LABELS[e.status],
          environment: e.environmentName,
          browser: e.browser,
          completedOn: e.completedOn,
        }))
      : null,
    runs: options.include.runs
      ? {
          filter: runFilter,
          rows: sortRuns(filterRuns(scope.runs, table), table.sort).map((r) => ({
            execution: r.executionName,
            position: r.position,
            testCase: r.testCaseName ?? '(deleted test case)',
            outcome: OUTCOME_LABELS[r.outcome],
            attempts: r.attempts,
            bugs: r.bugCount,
          })),
        }
      : null,
  };
}
