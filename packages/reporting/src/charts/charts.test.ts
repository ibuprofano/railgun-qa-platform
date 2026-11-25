import { describe, expect, it } from 'vitest';
import { linearScale, niceTicks, tickIndexes } from './scale';
import { lineChart, nearestIndex } from './line';
import { donutChart } from './donut';
import { donutChartSvg, lineChartSvg } from './svg';

const dates = (n: number) => Array.from({ length: n }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`);

describe('scales and ticks', () => {
  it('maps linearly', () => {
    expect(linearScale([0, 10], [0, 100])(2.5)).toBe(25);
  });

  it('uses quarters for percentages and nice steps for counts', () => {
    expect(niceTicks(63, 'percent')).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(7, 'count')).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(3, 'count')).toEqual([0, 1, 2, 3]);
    expect(niceTicks(0, 'count')).toEqual([0, 1]);
    expect(niceTicks(37, 'count')).toEqual([0, 10, 20, 30, 40]);
  });

  it('spaces date ticks, keeping the first and last', () => {
    expect(tickIndexes(30, 6)).toEqual([0, 6, 12, 17, 23, 29]);
    expect(tickIndexes(4, 6)).toEqual([0, 1, 2, 3]);
  });
});

describe('lineChart', () => {
  const spec = { dates: dates(5), width: 300, height: 150, kind: 'count' as const };

  it('places one point per day, days without data as 0', () => {
    const g = lineChart({ ...spec, series: [{ key: 'r', label: 'Reported', color: 'red', values: [1, 0, 3, 0, 2] }] });
    expect(g.xs).toHaveLength(5);
    expect(g.series[0].points).toHaveLength(5);
    expect(g.series[0].points[1].y).toBe(g.plot.bottom);
    expect(g.series[0].path.startsWith('M')).toBe(true);
    expect(g.series[0].path.match(/M/g)).toHaveLength(1);
  });

  it('breaks the line at a null', () => {
    const g = lineChart({ ...spec, kind: 'percent', series: [{ key: 'h', label: 'Health', color: 'blue', values: [null, 60, 70, null, 80] }] });
    expect(g.series[0].points.map((p) => p.index)).toEqual([1, 2, 4]);
    expect(g.series[0].path.match(/M/g)).toHaveLength(2);
  });

  it('rescales the axis to the series still shown', () => {
    const series = [
      { key: 'a', label: 'A', color: 'red', values: [30, 2, 1, 0, 0] },
      { key: 'b', label: 'B', color: 'green', values: [1, 2, 3, 2, 1] },
    ];
    expect(lineChart({ ...spec, series }).yMax).toBe(30);
    const hidden = lineChart({ ...spec, series, hidden: ['a'] });
    expect(hidden.yMax).toBe(3);
    expect(hidden.series.map((s) => s.key)).toEqual(['b']);
  });

  it('fixes percentages to 0–100 and finds the nearest day', () => {
    const g = lineChart({ ...spec, kind: 'percent', series: [{ key: 'p', label: 'Pass', color: 'green', values: [10, 20, 30, 40, 50] }] });
    expect(g.yMax).toBe(100);
    expect(nearestIndex(g, g.xs[3] + 2)).toBe(3);
  });
});

describe('donutChart', () => {
  it('sums its arcs to a full circle, rounds percentages and drops zero parts', () => {
    const g = donutChart({
      size: 120,
      parts: [
        { key: 'pass', label: 'Pass', color: 'green', count: 30 },
        { key: 'fail', label: 'Fail', color: 'red', count: 6 },
        { key: 'review', label: 'Needs Review', color: 'amber', count: 4 },
        { key: 'none', label: 'None', color: 'grey', count: 0 },
      ],
    });
    expect(g.total).toBe(40);
    expect(g.arcs.map((a) => [a.key, a.pct])).toEqual([
      ['pass', 75],
      ['fail', 15],
      ['review', 10],
    ]);
    const span = g.arcs.reduce((sum, a) => sum + (a.endAngle - a.startAngle), 0);
    expect(span).toBeCloseTo(2 * Math.PI, 10);
    expect(donutChart({ size: 120, parts: [{ key: 'a', label: 'A', color: 'x', count: 1 }, { key: 'b', label: 'B', color: 'y', count: 2 }] }).arcs.map((a) => a.pct)).toEqual([33, 67]);
  });

  it('draws a single part as a closed ring and an empty donut as nothing', () => {
    expect(donutChart({ size: 100, parts: [{ key: 'a', label: 'A', color: 'x', count: 5 }] }).arcs[0].path.match(/Z/g)).toHaveLength(2);
    expect(donutChart({ size: 100, parts: [{ key: 'a', label: 'A', color: 'x', count: 0 }] })).toMatchObject({ total: 0, arcs: [] });
  });
});

describe('static SVG', () => {
  const line = lineChart({ dates: dates(3), width: 200, height: 100, kind: 'count', series: [{ key: 'r', label: 'R', color: '#f00', values: [1, 2, 3] }] });
  const donut = donutChart({ size: 80, parts: [{ key: 'a', label: 'A', color: '#0f0', count: 2 }, { key: 'b', label: 'B', color: '#00f', count: 1 }] });

  it.each([
    ['line', lineChartSvg(line, undefined, 'Reported <bugs>')],
    ['donut', donutChartSvg(donut)],
  ])('%s uses only the allowed elements', (_kind, svg) => {
    const tags = new Set([...svg.matchAll(/<([a-zA-Z]+)/g)].map((m) => m[1]));
    for (const tag of tags) {
      expect(['svg', 'g', 'line', 'path', 'text', 'circle']).toContain(tag);
    }
    expect(svg).not.toMatch(/gradient|filter|mask|pattern|foreignObject/i);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
  });

  it('escapes text', () => {
    expect(lineChartSvg(line, undefined, 'Reported <bugs>')).toContain('aria-label="Reported &lt;bugs&gt;"');
  });
});
