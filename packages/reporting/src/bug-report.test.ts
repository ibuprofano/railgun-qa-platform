import { describe, expect, it } from 'vitest';
import { bugReportData } from './bug-report';
import { bugTiles, needsAttention, type DashboardBug } from './bug-dashboard';

const NOW = '2026-03-10T12:00:00.000Z';
const daysAgo = (days: number) => new Date(Date.parse(NOW) - days * 86_400_000).toISOString();
let seq = 0;
function bug(overrides: Partial<DashboardBug> = {}): DashboardBug {
  seq += 1;
  return {
    id: `b${seq}`,
    title: `Bug ${seq}`,
    severity: 'Medium',
    status: 'Open',
    tagIds: [],
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    resolvedAt: null,
    reportedOn: '2026-03-09',
    resolvedOn: null,
    ...overrides,
  };
}

const data = {
  today: '2026-03-10',
  now: NOW,
  bugs: [
    bug({ severity: 'Critical', status: 'Open', tagIds: ['t1', 't2'], title: '合計金額が正しくない' }),
    bug({ severity: 'High', status: 'Open', tagIds: ['t1'] }),
    bug({ status: 'InProgress', updatedAt: daysAgo(40), createdAt: daysAgo(45), reportedOn: '2026-01-24', tagIds: ['t3'] }),
    bug({ status: 'Resolved', severity: 'High', createdAt: daysAgo(6), resolvedAt: daysAgo(2), resolvedOn: '2026-03-08' }),
  ],
  tags: [
    { id: 't1', name: 'checkout', color: 'red' as const },
    { id: 't2', name: '決済', color: 'violet' as const },
    { id: 't3', name: 'auth', color: 'blue' as const },
  ],
};

describe('bugReportData (specs/bugs-dashboard-report)', () => {
  const report = bugReportData(data, { range: 7, projectName: 'ShopFlow' });

  it('carries the title, date and range, and the dashboard tiles', () => {
    expect(report).toMatchObject({ projectName: 'ShopFlow', generatedOn: '2026-03-10', range: 7 });
    expect(report.tiles).toEqual(bugTiles(data));
  });

  it('draws both charts over exactly the range, with short day labels', () => {
    expect(report.charts.map((c) => c.title)).toEqual(['Reported vs Resolved', 'Reported vs Resolved — Critical']);
    for (const c of report.charts) {
      expect(c.svg).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(c.svg).toContain('>10 Mar</text>');
      expect(c.svg).toContain('>4 Mar</text>');
      expect(c.svg).not.toContain('>3 Mar</text>');
    }
  });

  it('builds the four donut legends from the splits, leaving out zero parts', () => {
    expect(report.donuts.map((d) => d.title)).toEqual(['All Bugs by Severity', 'All Bugs by Status', 'Open by Severity', 'Backlog Age']);
    expect(report.donuts[1].legend.map((l) => [l.label, l.count, l.pct])).toEqual([
      ['Open', 2, 50],
      ['In Progress', 1, 25],
      ['Resolved', 1, 25],
    ]);
    expect(report.donuts[3].legend.map((l) => [l.label, l.count])).toEqual([
      ['Fresh (< 7 days)', 2],
      ['Old (> 30 days)', 1],
    ]);
  });

  it('sorts tags by count, then name, with print colours, keeping Japanese names', () => {
    expect(report.tags).toEqual([
      { name: 'checkout', count: 2, color: '#dc2626' },
      { name: 'auth', count: 1, color: '#2563eb' },
      { name: '決済', count: 1, color: '#7c3aed' },
    ]);
  });

  it('lists Needs Attention as the dashboard does, with its badges and titles unchanged', () => {
    expect(report.needsAttention.map((r) => r.title)).toEqual(needsAttention(data).map((r) => r.bug.title));
    expect(report.needsAttention[0]).toEqual({ title: '合計金額が正しくない', severity: 'Critical', status: 'Open', idle: false, unattended: true });
    expect(report.needsAttention.at(-1)).toMatchObject({ status: 'In Progress', idle: true, unattended: false });
    expect(JSON.stringify(report)).not.toMatch(/"b\d+"/);
  });
});
