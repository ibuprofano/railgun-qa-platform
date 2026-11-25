import { lineChart, type LineSeries } from './charts/line';
import { lineChartSvg, PRINT_PALETTE } from './charts/svg';
import { TAG_PRINT_COLORS } from './charts/word-cloud';
import { PRINT_OUTCOME_COLORS } from './execution-report';
import { pct } from './health';
import { donut, REPORT_CHART_HEIGHT, REPORT_CHART_WIDTH, type ReportChart, type ReportDonut } from './report-parts';
import {
  filterNeedsAttention,
  ISSUE_LABELS,
  type NeedsAttentionState,
  sortNeedsAttention,
  type TestCaseDashboard,
  unrankedFailingText,
} from './test-case-dashboard';
import { ISSUE_FLAGS } from './test-case-health';

/**
 * The Test Cases dashboard report's data (PRD §8, §6.2.4; specs/test-cases-dashboard-report;
 * test-cases-dashboard-report design.md decision 4): the dashboard's own figures, with the
 * ranges and Needs Attention state the screen showed. Plain data, allow-listed fields only:
 * names, counts and labels, never ids, secrets or trashed items.
 */

export type ReportRange = 7 | 15 | 30 | 90;

/** What a Test Cases dashboard report is requested with. */
export interface TestCaseReportOptions {
  tz: string;
  ranges: { overTime: ReportRange; passRate: ReportRange };
  needsAttention: NeedsAttentionState;
}

/** Hex mirrors of the Source Type donut's theme colours (--tag-violet, --tag-blue), for print. */
export const PRINT_SOURCE_TYPE_COLORS = { gherkin: TAG_PRINT_COLORS.violet, manual: TAG_PRINT_COLORS.blue } as const;
/** Hex mirrors of Test Cases Over Time's series (--primary, --tag-violet, --pass), for print. */
const PRINT_OVER_TIME_COLORS = { created: '#2563eb', added: TAG_PRINT_COLORS.violet, completed: PRINT_OUTCOME_COLORS.Pass } as const;
const PRINT_NEVER_RUN_COLOR = '#94a3b8';

export interface ReportTile {
  label: string;
  value: string;
  subLabel: string;
}

export interface ReportRanking {
  title: string;
  rows: { rank: number; name: string; value: string }[];
  /** Shown instead of rows when there are none. */
  emptyText: string;
  /** Top Failing's line about failing test cases too new to rank; below the rows when there are some. */
  note: string | null;
}

export interface TestCaseReportData {
  projectName: string;
  /** YYYY-MM-DD in the requester's zone. */
  generatedOn: string;
  tiles: ReportTile[];
  /** Test Cases Over Time, then Pass Rate Trend once a run has completed. */
  charts: ReportChart[];
  donuts: ReportDonut[];
  needsAttention: {
    /** Every flagged test case, before the name filter. */
    total: number;
    /** "Name: pay", or null with no filter. */
    filter: string | null;
    rows: { name: string; tags: string[]; issues: string[]; status: string; created: string; updated: string }[];
  };
  rankings: ReportRanking[];
  folderHealth: { path: string; cases: number; issues: string; breakdown: string }[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** An instant as its day in the zone, "24 Nov 2026" (month names fixed, not the locale's). */
export function formatDayInZone(iso: string, timeZone: string): string {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(iso))
    .split('-')
    .map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

const STATUS_LABELS = { Draft: 'Draft', Ready: 'Ready', Deprecated: 'Deprecated' } as const;

export function testCaseReportData(
  data: TestCaseDashboard,
  options: TestCaseReportOptions,
  context: { projectName: string; tagName: (id: string) => string },
): TestCaseReportData {
  const { total, ready, covered, avgConfidencePct } = data.tiles;
  const chart = (title: string, days: ReportRange, kind: 'count' | 'percent', series: LineSeries[]): ReportChart => {
    const shown = data.days.slice(-days);
    const geometry = lineChart({
      dates: shown.map((d) => d.date),
      width: REPORT_CHART_WIDTH,
      height: REPORT_CHART_HEIGHT,
      kind,
      series: series.map((s) => ({ ...s, values: s.values.slice(-days) })),
    });
    return { title: `${title} (last ${days} days)`, svg: lineChartSvg(geometry, PRINT_PALETTE, title), width: geometry.width, height: geometry.height };
  };

  const charts = [
    chart('Test Cases Over Time', options.ranges.overTime, 'count', [
      { key: 'created', label: 'Created', color: PRINT_OVER_TIME_COLORS.created, values: data.days.map((d) => d.created) },
      { key: 'added', label: 'Added to executions', color: PRINT_OVER_TIME_COLORS.added, values: data.days.map((d) => d.added) },
      { key: 'completed', label: 'Completed', color: PRINT_OVER_TIME_COLORS.completed, values: data.days.map((d) => d.completed) },
    ]),
  ];
  if (data.hasCompletedRuns) {
    charts.push(
      chart('Pass Rate Trend', options.ranges.passRate, 'percent', [
        { key: 'passRate', label: 'Pass rate', color: PRINT_OUTCOME_COLORS.Pass, values: data.days.map((d) => pct(d.passed, d.completed)) },
      ]),
    );
  }

  const state = options.needsAttention;
  const filterText = state.name.trim();
  const { rankings } = data;
  const failingNote = rankings.failingBelowMinimum > 0 ? unrankedFailingText(rankings.failingBelowMinimum, rankings.topFailing.length > 0) : null;
  const ranks = <T>(rows: T[], name: (row: T) => string, value: (row: T) => string) =>
    rows.map((row, index) => ({ rank: index + 1, name: name(row), value: value(row) }));

  return {
    projectName: context.projectName,
    generatedOn: data.days[data.days.length - 1].date,
    tiles: [
      { label: 'Total Tests', value: String(total), subLabel: `${ready} ready` },
      { label: 'Ready', value: `${pct(ready, total)}%`, subLabel: `${ready} of ${total} cases` },
      { label: 'Coverage', value: `${pct(covered, total)}%`, subLabel: `${total - covered} never run` },
      { label: 'Avg Confidence', value: avgConfidencePct === null ? '—' : `${avgConfidencePct}%`, subLabel: 'from last run results' },
    ],
    charts,
    donuts: [
      donut(
        'Last Run Outcome',
        [
          { key: 'pass', label: 'Pass', color: PRINT_OUTCOME_COLORS.Pass, count: data.lastOutcome.pass },
          { key: 'fail', label: 'Fail', color: PRINT_OUTCOME_COLORS.Fail, count: data.lastOutcome.fail },
          { key: 'review', label: 'Needs Review', color: PRINT_OUTCOME_COLORS.NeedsReview, count: data.lastOutcome.needsReview },
          { key: 'never', label: 'Never Run', color: PRINT_NEVER_RUN_COLOR, count: data.lastOutcome.neverRun },
        ],
        'No test cases yet.',
      ),
      donut(
        'Source Type',
        [
          { key: 'gherkin', label: 'Gherkin', color: PRINT_SOURCE_TYPE_COLORS.gherkin, count: data.sourceType.gherkin },
          { key: 'manual', label: 'Manual', color: PRINT_SOURCE_TYPE_COLORS.manual, count: data.sourceType.manual },
        ],
        'No test cases yet.',
      ),
    ],
    needsAttention: {
      total: data.needsAttention.length,
      filter: filterText ? `Name: ${filterText}` : null,
      rows: sortNeedsAttention(filterNeedsAttention(data.needsAttention, state.name), state.sort).map((row) => ({
        name: row.name,
        tags: row.tagIds.map(context.tagName),
        issues: row.issues.map((issue) => ISSUE_LABELS[issue]),
        status: STATUS_LABELS[row.status],
        created: formatDayInZone(row.createdAt, options.tz),
        updated: formatDayInZone(row.updatedAt, options.tz),
      })),
    },
    rankings: [
      {
        title: 'Most Run Test Cases',
        rows: ranks(rankings.mostRun, (r) => r.name, (r) => String(r.completed)),
        emptyText: 'No completed runs yet.',
        note: null,
      },
      {
        title: 'Top Failing Test Cases',
        rows: ranks(rankings.topFailing, (r) => r.name, (r) => `${r.failRatePct}% (${r.failed}/${r.completed})`),
        emptyText: 'No failing test cases — nice!',
        note: failingNote,
      },
      {
        title: 'Top Flaky Test Cases',
        rows: ranks(rankings.topFlaky, (r) => r.name, (r) => `${r.flakyPct}% (${r.flaky}/${r.completed})`),
        emptyText: 'No flaky runs.',
        note: null,
      },
      {
        title: 'Top Tags',
        rows: ranks(rankings.topTags, (t) => t.name, (t) => String(t.count)),
        emptyText: 'No tags on test cases yet.',
        note: null,
      },
    ],
    folderHealth: data.folderHealth.map((row) => ({
      path: row.path.join(' / '),
      cases: row.cases,
      issues: row.withIssues === 0 ? '—' : `${row.withIssues} (${row.issuePct}%)`,
      breakdown: ISSUE_FLAGS.filter((flag) => row.breakdown[flag])
        .map((flag) => `${ISSUE_LABELS[flag]} ×${row.breakdown[flag]}`)
        .join(' · '),
    })),
  };
}
