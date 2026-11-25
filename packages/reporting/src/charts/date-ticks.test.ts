import { describe, expect, it } from 'vitest';
import { dateTicks } from './scale';
import { lineChart } from './line';
import { stackedBarChart } from './stacked-bar';
import { dayRange } from '../execution-dashboard';
import { shortDayLabel } from './text';
import { lineChartSvg, PRINT_PALETTE, stackedBarChartSvg } from './svg';

const dates = dayRange('2026-11-24', 30);

describe('date tick anchors (chart-writer-fixes)', () => {
  it('ends the last tick at the plot edge and centres the rest, on a line chart', () => {
    const g = lineChart({ dates, width: 500, height: 200, kind: 'count', series: [{ key: 'a', label: 'A', color: 'red', values: dates.map(() => 1) }] });
    const last = g.xTicks.at(-1)!;
    expect(last).toMatchObject({ label: '2026-11-24', anchor: 'end', x: g.plot.right });
    expect(g.xTicks.slice(0, -1).every((t) => t.anchor === 'middle')).toBe(true);
  });

  it('ends the last label at the plot edge, not the last bar centre, on stacked bars', () => {
    const g = stackedBarChart({ dates, width: 500, height: 200, series: [{ key: 'a', label: 'A', color: 'red', values: dates.map(() => 1) }] });
    const last = g.xTicks.at(-1)!;
    expect(last.anchor).toBe('end');
    expect(last.x).toBe(g.plot.right);
    expect(last.x).not.toBe(g.bars.at(-1)!.center);
    expect(g.xTicks[0]).toMatchObject({ anchor: 'middle', x: g.bars[0].center });
  });

  it('centres a lone tick', () => {
    const g = lineChart({ dates: ['2026-11-24'], width: 500, height: 200, kind: 'count', series: [{ key: 'a', label: 'A', color: 'red', values: [1] }] });
    expect(g.xTicks).toEqual([expect.objectContaining({ anchor: 'middle' })]);
  });

  it('starts the first tick at the left edge when a centred label would cross it', () => {
    const ticks = dateTicks(['2026-11-23', '2026-11-24'], [4, 100], { left: 4, right: 100 });
    expect(ticks[0]).toMatchObject({ anchor: 'start', x: 4 });
    expect(ticks[1]).toMatchObject({ anchor: 'end', x: 100 });
    expect(dateTicks(['2026-11-23', '2026-11-24'], [36, 100], { left: 36, right: 100 })[0].anchor).toBe('middle');
  });
});

describe('print date labels (chart-writer-fixes)', () => {
  it('reads a day as "24 Nov" with no time-zone shift', () => {
    expect(shortDayLabel('2026-11-24')).toBe('24 Nov');
    expect(shortDayLabel('2026-01-01')).toBe('1 Jan');
    expect(shortDayLabel('2026-12-31')).toBe('31 Dec');
  });

  it('writes short labels and the tick anchors, never an ISO date', () => {
    const line = lineChartSvg(lineChart({ dates, width: 500, height: 200, kind: 'count', series: [{ key: 'a', label: 'A', color: 'red', values: dates.map(() => 1) }] }));
    const bars = stackedBarChartSvg(stackedBarChart({ dates, width: 500, height: 200, series: [{ key: 'a', label: 'A', color: 'red', values: dates.map(() => 1) }] }));
    for (const svg of [line, bars]) {
      expect(svg).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(svg).toContain('text-anchor="end" font-size="10" fill="#334155">24 Nov</text>');
    }
  });

  it('uses a custom formatter', () => {
    const svg = lineChartSvg(lineChart({ dates, width: 500, height: 200, kind: 'count', series: [{ key: 'a', label: 'A', color: 'red', values: dates.map(() => 1) }] }), PRINT_PALETTE, '', (d: string) => `D:${d.slice(8)}`);
    expect(svg).toContain('>D:24</text>');
  });
});
