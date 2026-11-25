import { dateTicks, linearScale, niceTicks, type DateTick } from './scale';

/** One stacked part of a daily bar chart, its counts aligned with the chart's dates. */
export interface BarSeries {
  key: string;
  label: string;
  /** Any CSS/SVG colour: a theme token on screen, a fixed value in reports (ADR 0023). */
  color: string;
  values: number[];
}

export interface StackedBarChartSpec {
  /** One date label per bar, oldest first (e.g. "2026-11-24"). */
  dates: string[];
  /** Stacked bottom to top in this order. */
  series: BarSeries[];
  width: number;
  height: number;
  /** Keys of series the reader hid; they are not drawn and don't set the axis. */
  hidden?: string[];
}

export interface BarSegment {
  key: string;
  color: string;
  count: number;
  y: number;
  height: number;
}

export interface StackedBar {
  index: number;
  date: string;
  /** The bar's left edge and width; `center` is where hover and ticks line up. */
  x: number;
  width: number;
  center: number;
  total: number;
  /** Visible series with a count above 0, bottom first. */
  segments: BarSegment[];
}

export interface StackedBarGeometry {
  width: number;
  height: number;
  plot: { left: number; top: number; right: number; bottom: number };
  yMax: number;
  yTicks: { value: number; y: number }[];
  xTicks: DateTick[];
  bars: StackedBar[];
}

const PADDING = { left: 36, right: 12, top: 12, bottom: 24 };
const fmt = (n: number) => Math.round(n * 100) / 100;

/** Lays out daily stacked bars (PRD §6.12.4): one bar per day, a day of 0 drawn empty. */
export function stackedBarChart(spec: StackedBarChartSpec): StackedBarGeometry {
  const plot = {
    left: PADDING.left,
    top: PADDING.top,
    right: Math.max(PADDING.left + 1, spec.width - PADDING.right),
    bottom: Math.max(PADDING.top + 1, spec.height - PADDING.bottom),
  };
  const hidden = new Set(spec.hidden ?? []);
  const visible = spec.series.filter((s) => !hidden.has(s.key));
  const totals = spec.dates.map((_, i) => visible.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const ticks = niceTicks(Math.max(0, ...totals), 'count');
  const yMax = ticks[ticks.length - 1];
  const y = linearScale([0, yMax], [plot.bottom, plot.top]);

  const count = spec.dates.length;
  const slot = (plot.right - plot.left) / Math.max(count, 1);
  const barWidth = Math.max(1, slot * 0.7);

  const bars = spec.dates.map((date, index) => {
    const x = plot.left + index * slot + (slot - barWidth) / 2;
    let base = 0;
    const segments: BarSegment[] = [];
    for (const s of visible) {
      const value = s.values[index] ?? 0;
      if (value <= 0) continue;
      const top = y(base + value);
      segments.push({ key: s.key, color: s.color, count: value, y: fmt(top), height: fmt(y(base) - top) });
      base += value;
    }
    return { index, date, x: fmt(x), width: fmt(barWidth), center: fmt(x + barWidth / 2), total: totals[index], segments };
  });

  return {
    width: spec.width,
    height: spec.height,
    plot,
    yMax,
    yTicks: ticks.map((value) => ({ value, y: fmt(y(value)) })),
    xTicks: dateTicks(spec.dates, bars.map((b) => b.center), plot),
    bars,
  };
}

/** The bar index nearest an x position, for hover. */
export function nearestBar(geometry: StackedBarGeometry, x: number): number {
  let best = 0;
  geometry.bars.forEach((bar, i) => {
    if (Math.abs(bar.center - x) < Math.abs(geometry.bars[best].center - x)) best = i;
  });
  return best;
}
