import { labelWidthEm, shortDayLabel } from './text';

/** Scales and ticks shared by every chart kind (ADR 0023). Pure arithmetic, no DOM. */

/** A linear map from a value domain to pixel range. */
export function linearScale([d0, d1]: [number, number], [r0, r1]: [number, number]): (value: number) => number {
  const span = d1 - d0 || 1;
  return (value) => r0 + ((value - d0) / span) * (r1 - r0);
}

/**
 * Y-axis ticks from 0: fixed quarters for percentages; otherwise a "nice" step of
 * 1, 2 or 5 × 10^k giving about four intervals, never below 1 (counts are whole).
 * The last tick is the axis maximum.
 */
export function niceTicks(max: number, kind: 'percent' | 'count'): number[] {
  if (kind === 'percent') return [0, 25, 50, 75, 100];
  const top = Math.max(max, 1);
  const rough = top / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = Math.max(1, (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude);
  const ticks: number[] = [];
  for (let value = 0; value < top + step; value += step) {
    ticks.push(value);
    if (value >= top) break;
  }
  return ticks;
}

/** Up to `max` evenly spaced indexes into a series of `count` days, always the first and last. */
export function tickIndexes(count: number, max = 6): number[] {
  if (count <= 0) return [];
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const indexes = new Set<number>();
  for (let i = 0; i < max; i += 1) {
    indexes.add(Math.round((i * (count - 1)) / (max - 1)));
  }
  return [...indexes].sort((a, b) => a - b);
}

export type TickAnchor = 'start' | 'middle' | 'end';

export interface DateTick {
  index: number;
  x: number;
  /** The ISO day; outputs format it (the screen in the viewer's locale, print as "24 Nov"). */
  label: string;
  /** Where the label's text is anchored at `x`, so it stays inside the chart (chart-writer-fixes). */
  anchor: TickAnchor;
}

/** Font size of axis labels, on screen and in print. */
export const AXIS_LABEL_SIZE = 10;

/**
 * Date ticks for `dates` at `positions`: the last of several ends at the plot's right
 * edge, the first starts at its left edge when a centred label would cross it, the rest
 * are centred (chart-writer-fixes design.md decision 2).
 */
export function dateTicks(dates: readonly string[], positions: readonly number[], plot: { left: number; right: number }): DateTick[] {
  const indexes = tickIndexes(dates.length);
  return indexes.map((index, i) => {
    const several = indexes.length > 1;
    if (several && i === indexes.length - 1) return { index, x: plot.right, label: dates[index], anchor: 'end' as const };
    if (several && i === 0) {
      const half = (labelWidthEm(shortDayLabel(dates[index])) * AXIS_LABEL_SIZE) / 2;
      if (positions[index] - half < 0) return { index, x: plot.left, label: dates[index], anchor: 'start' as const };
    }
    return { index, x: positions[index], label: dates[index], anchor: 'middle' as const };
  });
}
