import { describe, expect, it } from 'vitest';
import { nearestBar, stackedBarChart } from './stacked-bar';
import { donutChart } from './donut';
import { stackedBarChartSvg } from './svg';

const dates = ['2026-03-02', '2026-03-03', '2026-03-04'];
const series = [
  { key: 'pass', label: 'Passed', color: 'green', values: [0, 1, 3] },
  { key: 'fail', label: 'Failed', color: 'red', values: [0, 0, 1] },
  { key: 'review', label: 'Needs Review', color: 'amber', values: [0, 0, 2] },
];
const spec = { dates, series, width: 300, height: 150 };

describe('stackedBarChart', () => {
  it('stacks each day in series order, bottom first, with heights proportional to counts', () => {
    const geometry = stackedBarChart(spec);
    const day = geometry.bars[2];
    expect(day.total).toBe(6);
    expect(day.segments.map((s) => [s.key, s.count])).toEqual([
      ['pass', 3],
      ['fail', 1],
      ['review', 2],
    ]);
    // Bottom segment sits on the axis; each next one sits on the one below.
    expect(day.segments[0].y + day.segments[0].height).toBeCloseTo(geometry.plot.bottom, 1);
    expect(day.segments[1].y + day.segments[1].height).toBeCloseTo(day.segments[0].y, 1);
    expect(day.segments[0].height / day.segments[1].height).toBeCloseTo(3, 1);
  });

  it('draws a day of 0 empty', () => {
    expect(stackedBarChart(spec).bars[0].segments).toEqual([]);
  });

  it('leaves hidden series out and rescales the axis to the rest', () => {
    const all = stackedBarChart(spec);
    const fewer = stackedBarChart({ ...spec, hidden: ['pass'] });
    expect(fewer.bars[2].segments.map((s) => s.key)).toEqual(['fail', 'review']);
    expect(fewer.bars[2].total).toBe(3);
    expect(fewer.yMax).toBeLessThan(all.yMax);
  });

  it('finds the nearest bar', () => {
    const geometry = stackedBarChart(spec);
    expect(nearestBar(geometry, geometry.bars[1].center + 1)).toBe(1);
    expect(nearestBar(geometry, 10_000)).toBe(2);
  });

  it('writes SVG with only rect, line and text inside the document', () => {
    const svg = stackedBarChartSvg(stackedBarChart(spec), undefined, 'Runs Over Time');
    expect(svg).toContain('aria-label="Runs Over Time"');
    expect(svg.match(/<rect /g)).toHaveLength(4);
    const tags = new Set([...svg.matchAll(/<([a-z]+)[ >]/g)].map((m) => m[1]));
    expect([...tags].sort()).toEqual(['g', 'line', 'rect', 'svg', 'text']);
  });
});

describe('donutChart sort', () => {
  it('orders parts by count, keeping the given order for ties', () => {
    const parts = [
      { key: 'Draft', label: 'Draft', color: 'grey', count: 1 },
      { key: 'Done', label: 'Done', color: 'grey', count: 4 },
      { key: 'Ready', label: 'Ready', color: 'green', count: 2 },
      { key: 'InProgress', label: 'In Progress', color: 'blue', count: 2 },
    ];
    expect(donutChart({ parts, size: 100, sort: 'count' }).arcs.map((a) => a.key)).toEqual(['Done', 'Ready', 'InProgress', 'Draft']);
    expect(donutChart({ parts, size: 100 }).arcs.map((a) => a.key)).toEqual(['Draft', 'Done', 'Ready', 'InProgress']);
  });
});
