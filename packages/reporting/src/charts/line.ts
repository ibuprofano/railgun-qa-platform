import { dateTicks, linearScale, niceTicks, type DateTick } from './scale';

/** One line of a trend chart, its values aligned with the chart's dates; null breaks the line. */
export interface LineSeries {
  key: string;
  label: string;
  /** Any CSS/SVG colour: a theme token on screen, a fixed value in reports (ADR 0023). */
  color: string;
  values: (number | null)[];
}

export interface LineChartSpec {
  /** One date label per point, oldest first (e.g. "2026-11-24"). */
  dates: string[];
  series: LineSeries[];
  width: number;
  height: number;
  /** Percentages use a fixed 0–100 axis; counts scale to the visible series. */
  kind: 'percent' | 'count';
  /** Keys of series the reader hid; they are not drawn and don't set the axis. */
  hidden?: string[];
}

export interface LinePoint {
  index: number;
  x: number;
  y: number;
  value: number;
}

export interface LineGeometry {
  width: number;
  height: number;
  plot: { left: number; top: number; right: number; bottom: number };
  /** The x of each date index. */
  xs: number[];
  yMax: number;
  yTicks: { value: number; y: number }[];
  xTicks: DateTick[];
  series: { key: string; label: string; color: string; path: string; points: LinePoint[] }[];
}

const PADDING = { left: 36, right: 12, top: 12, bottom: 24 };

const fmt = (n: number) => Math.round(n * 100) / 100;

/** Lays out a trend chart (PRD §6.12.2): one point per day; a null gap splits the line. */
export function lineChart(spec: LineChartSpec): LineGeometry {
  const plot = {
    left: PADDING.left,
    top: PADDING.top,
    right: Math.max(PADDING.left + 1, spec.width - PADDING.right),
    bottom: Math.max(PADDING.top + 1, spec.height - PADDING.bottom),
  };
  const hidden = new Set(spec.hidden ?? []);
  const visible = spec.series.filter((s) => !hidden.has(s.key));
  const dataMax = Math.max(0, ...visible.flatMap((s) => s.values.filter((v): v is number => v !== null)));
  const ticks = niceTicks(dataMax, spec.kind);
  const yMax = ticks[ticks.length - 1];

  const count = spec.dates.length;
  const x = linearScale([0, Math.max(count - 1, 1)], [plot.left, plot.right]);
  const y = linearScale([0, yMax], [plot.bottom, plot.top]);
  const xs = spec.dates.map((_, i) => fmt(count === 1 ? (plot.left + plot.right) / 2 : x(i)));

  return {
    width: spec.width,
    height: spec.height,
    plot,
    xs,
    yMax,
    yTicks: ticks.map((value) => ({ value, y: fmt(y(value)) })),
    xTicks: dateTicks(spec.dates, xs, plot),
    series: visible.map((s) => {
      const points: LinePoint[] = [];
      let path = '';
      let penDown = false;
      s.values.forEach((value, index) => {
        if (value === null) {
          penDown = false;
          return;
        }
        const px = xs[index];
        const py = fmt(y(value));
        points.push({ index, x: px, y: py, value });
        path += `${penDown ? 'L' : 'M'}${px} ${py} `;
        penDown = true;
      });
      return { key: s.key, label: s.label, color: s.color, path: path.trim(), points };
    }),
  };
}

/** The date index nearest an x position, for hover. */
export function nearestIndex(geometry: LineGeometry, x: number): number {
  let best = 0;
  geometry.xs.forEach((px, i) => {
    if (Math.abs(px - x) < Math.abs(geometry.xs[best] - x)) best = i;
  });
  return best;
}
