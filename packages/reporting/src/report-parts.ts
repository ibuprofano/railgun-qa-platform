import { donutChart } from './charts/donut';
import { donutChartSvg, PRINT_PALETTE } from './charts/svg';

/** Building blocks shared by every report's data (report-pipeline, executions-dashboard-report). */

export const REPORT_CHART_WIDTH = 500;
export const REPORT_CHART_HEIGHT = 180;
export const REPORT_DONUT_SIZE = 120;

export interface ReportLegendEntry {
  label: string;
  count: number;
  pct: number;
  color: string;
}

export interface ReportChart {
  title: string;
  svg: string;
  width: number;
  height: number;
}

export interface ReportDonut extends ReportChart {
  total: number;
  legend: ReportLegendEntry[];
  /** Shown instead of the donut when the total is 0. */
  emptyText: string;
}

/** A donut with its print SVG and legend; parts with a count of 0 are left out. */
export function donut(
  title: string,
  parts: { key: string; label: string; color: string; count: number }[],
  emptyText: string,
  sort?: 'count',
): ReportDonut {
  const geometry = donutChart({ parts, size: REPORT_DONUT_SIZE, sort });
  return {
    title,
    svg: donutChartSvg(geometry, PRINT_PALETTE, title),
    width: geometry.size,
    height: geometry.size,
    total: geometry.total,
    legend: geometry.arcs.map((a) => ({ label: a.label, count: a.count, pct: a.pct, color: a.color })),
    emptyText,
  };
}

