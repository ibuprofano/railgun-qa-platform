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
  type BugDashboardData,
  type BugReportOptions,
  type BugSeverity,
  type BugStatus,
  type BugTiles,
  type ResolutionTime,
} from './bug-dashboard';
import { lineChart } from './charts/line';
import { lineChartSvg, PRINT_PALETTE } from './charts/svg';
import { donut, REPORT_CHART_HEIGHT, REPORT_CHART_WIDTH, type ReportChart, type ReportDonut } from './report-parts';

export type { ReportChart, ReportDonut, ReportLegendEntry } from './report-parts';
import { TAG_PRINT_COLORS } from './charts/word-cloud';

/**
 * The Bugs dashboard report's data (PRD §8; specs/bugs-dashboard-report; report-pipeline
 * design.md decision 6): every figure the PDF prints, built with the dashboard's own rules,
 * with print colours and chart SVGs. Plain data, no PDF library types, allow-listed fields
 * only: titles, counts and labels, never ids, secrets or trashed items.
 */

/** Hex mirrors of the screen's theme colours (globals.css), for print. */
export const PRINT_SEVERITY_COLORS: Record<BugSeverity, string> = {
  Critical: '#dc2626',
  High: '#ea580c',
  Medium: '#d97706',
  Low: '#2563eb',
};
export const PRINT_BUG_STATUS_COLORS: Record<BugStatus, string> = {
  Open: '#dc2626',
  InProgress: '#2563eb',
  Resolved: '#16a34a',
  Closed: '#15803d',
  WontFix: '#94a3b8',
};
export const PRINT_BACKLOG_AGE_COLORS = { Fresh: '#16a34a', Aging: '#d97706', Old: '#dc2626' } as const;
export const PRINT_REPORTED_COLOR = '#dc2626';
export const PRINT_RESOLVED_COLOR = '#16a34a';

const BACKLOG_AGE_LABELS = { Fresh: 'Fresh (< 7 days)', Aging: 'Aging (7–30 days)', Old: 'Old (> 30 days)' } as const;

export interface BugReportData {
  projectName: string;
  /** YYYY-MM-DD in the requester's zone. */
  generatedOn: string;
  range: BugReportOptions['range'];
  tiles: BugTiles;
  charts: ReportChart[];
  donuts: ReportDonut[];
  resolution: ResolutionTime[];
  tags: { name: string; count: number; color: string }[];
  needsAttention: { title: string; severity: BugSeverity; status: string; idle: boolean; unattended: boolean }[];
}

export function bugReportData(data: BugDashboardData, options: { range: BugReportOptions['range']; projectName: string }): BugReportData {
  const series = bugDailySeries(data, options.range);
  const chart = (title: string, reported: number[], resolved: number[]): ReportChart => {
    const geometry = lineChart({
      dates: series.dates,
      width: REPORT_CHART_WIDTH,
      height: REPORT_CHART_HEIGHT,
      kind: 'count',
      series: [
        { key: 'reported', label: 'Reported', color: PRINT_REPORTED_COLOR, values: reported },
        { key: 'resolved', label: 'Resolved', color: PRINT_RESOLVED_COLOR, values: resolved },
      ],
    });
    return { title, svg: lineChartSvg(geometry, PRINT_PALETTE, title), width: geometry.width, height: geometry.height };
  };
  const severityParts = (split: Record<BugSeverity, number>) =>
    BUG_SEVERITIES.map((s) => ({ key: s, label: s, color: PRINT_SEVERITY_COLORS[s], count: split[s] }));
  const status = bugStatusSplit(data);
  const age = backlogAgeSplit(data);

  return {
    projectName: options.projectName,
    generatedOn: data.today,
    range: options.range,
    tiles: bugTiles(data),
    charts: [
      chart('Reported vs Resolved', series.reported, series.resolved),
      chart('Reported vs Resolved — Critical', series.criticalReported, series.criticalResolved),
    ],
    donuts: [
      donut('All Bugs by Severity', severityParts(bugSeveritySplit(data)), 'No bugs yet.'),
      donut(
        'All Bugs by Status',
        BUG_STATUSES.map((s) => ({ key: s, label: BUG_STATUS_LABELS[s], color: PRINT_BUG_STATUS_COLORS[s], count: status[s] })),
        'No bugs yet.',
      ),
      donut('Open by Severity', severityParts(openSeveritySplit(data)), 'No open bugs.'),
      donut(
        'Backlog Age',
        BACKLOG_AGES.map((a) => ({ key: a, label: BACKLOG_AGE_LABELS[a], color: PRINT_BACKLOG_AGE_COLORS[a], count: age[a] })),
        'No open bugs.',
      ),
    ],
    resolution: avgResolutionTime(data),
    tags: bugTagCounts(data)
      .map((t) => ({ name: t.name, count: t.count, color: TAG_PRINT_COLORS[t.color] }))
      .sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    needsAttention: needsAttention(data).map(({ bug, idle, unattended }) => ({
      title: bug.title,
      severity: bug.severity,
      status: BUG_STATUS_LABELS[bug.status],
      idle,
      unattended,
    })),
  };
}
