import { describe, expect, it } from 'vitest';
import {
  avgResolutionTime,
  backlogAgeSplit,
  bugDailySeries,
  bugDashboardFromRows,
  bugSeveritySplit,
  bugStatusSplit,
  bugTagCounts,
  bugTiles,
  needsAttention,
  openSeveritySplit,
  type DashboardBug,
} from './bug-dashboard';

const NOW = '2026-03-10T12:00:00.000Z';
const daysAgo = (days: number) => new Date(Date.parse(NOW) - days * 86_400_000).toISOString();

function bug(overrides: Partial<DashboardBug> = {}): DashboardBug {
  return {
    id: 'b1',
    title: 'A bug',
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

const data = (bugs: DashboardBug[]) => ({ today: '2026-03-10', now: NOW, bugs, tags: [] });

describe('bugDashboardFromRows', () => {
  it('maps rows to camelCase ISO strings', () => {
    const result = bugDashboardFromRows(
      { today: '2026-03-10', now: new Date(NOW) },
      [
        {
          id: 'b1',
          title: 'T',
          severity: 'High',
          status: 'Resolved',
          tag_ids: ['t1'],
          created_at: new Date('2026-03-01T00:00:00Z'),
          updated_at: new Date('2026-03-02T00:00:00Z'),
          resolved_at: new Date('2026-03-02T00:00:00Z'),
          reported_on: '2026-03-01',
          resolved_on: '2026-03-02',
        },
      ],
      [{ id: 't1', name: 'checkout', color: 'red' }],
    );
    expect(result.now).toBe(NOW);
    expect(result.bugs[0]).toMatchObject({ tagIds: ['t1'], resolvedAt: '2026-03-02T00:00:00.000Z', resolvedOn: '2026-03-02' });
    expect(result.tags).toEqual([{ id: 't1', name: 'checkout', color: 'red' }]);
  });
});

describe('bugTiles', () => {
  it('counts a mixed backlog', () => {
    const bugs = [
      bug({ id: '1', status: 'Open', severity: 'Critical' }),
      bug({ id: '2', status: 'Open' }),
      bug({ id: '3', status: 'InProgress' }),
      bug({ id: '4', status: 'Resolved' }),
      bug({ id: '5', status: 'Resolved' }),
      bug({ id: '6', status: 'Closed', severity: 'Critical' }),
      bug({ id: '7', status: 'WontFix' }),
    ];
    expect(bugTiles(data(bugs))).toEqual({ total: 7, inProgress: 1, open: 2, resolved: 2, critical: 2 });
  });
});

describe('bugDailySeries', () => {
  it('counts one day, with the Critical chart on its own', () => {
    const bugs = [
      bug({ id: '1', reportedOn: '2026-03-04', severity: 'Critical' }),
      bug({ id: '2', reportedOn: '2026-03-04' }),
      bug({ id: '3', reportedOn: '2026-03-01', status: 'Resolved', resolvedAt: daysAgo(6), resolvedOn: '2026-03-04' }),
    ];
    const series = bugDailySeries(data(bugs));
    const i = series.dates.indexOf('2026-03-04');
    expect([series.reported[i], series.resolved[i], series.criticalReported[i], series.criticalResolved[i]]).toEqual([2, 1, 1, 0]);
  });

  it('drops a reopened bug from its old resolution day', () => {
    const series = bugDailySeries(data([bug({ reportedOn: '2026-03-01', status: 'Open', resolvedOn: null })]));
    expect(series.resolved.every((n) => n === 0)).toBe(true);
  });

  it('builds 90 days ending today across a month boundary, 0 on empty days', () => {
    const series = bugDailySeries({ today: '2026-03-01', bugs: [bug({ reportedOn: '2026-02-28' })] });
    expect(series.dates).toHaveLength(90);
    expect(series.dates.at(-1)).toBe('2026-03-01');
    expect(series.dates.at(-2)).toBe('2026-02-28');
    expect(series.reported.at(-2)).toBe(1);
    expect(series.reported.at(-1)).toBe(0);
  });
});

describe('splits', () => {
  const bugs = [
    bug({ id: '1', severity: 'Critical', status: 'Open' }),
    bug({ id: '2', severity: 'High', status: 'InProgress' }),
    bug({ id: '3', severity: 'High', status: 'Closed' }),
  ];

  it('splits every bug by severity and status, and open bugs by severity', () => {
    expect(bugSeveritySplit(data(bugs))).toEqual({ Critical: 1, High: 2, Medium: 0, Low: 0 });
    expect(bugStatusSplit(data(bugs))).toEqual({ Open: 1, InProgress: 1, Resolved: 0, Closed: 1, WontFix: 0 });
    expect(openSeveritySplit(data(bugs))).toEqual({ Critical: 1, High: 1, Medium: 0, Low: 0 });
  });

  it('buckets open bugs by backlog age', () => {
    const aged = [
      bug({ id: '1', createdAt: daysAgo(2) }),
      bug({ id: '2', createdAt: daysAgo(7) }),
      bug({ id: '3', createdAt: daysAgo(31) }),
      bug({ id: '4', createdAt: daysAgo(40), status: 'Resolved', resolvedAt: daysAgo(1) }),
    ];
    expect(backlogAgeSplit(data(aged))).toEqual({ Fresh: 1, Aging: 1, Old: 1 });
  });

  it('counts exactly 30 days as Aging', () => {
    expect(backlogAgeSplit(data([bug({ createdAt: daysAgo(30) })]))).toEqual({ Fresh: 0, Aging: 1, Old: 0 });
  });
});

describe('avgResolutionTime', () => {
  it('averages per severity with resolved bugs, then rounds once', () => {
    const bugs = [
      bug({ id: '1', severity: 'High', status: 'Resolved', createdAt: daysAgo(10), resolvedAt: daysAgo(8) }),
      bug({ id: '2', severity: 'High', status: 'Closed', createdAt: daysAgo(10), resolvedAt: daysAgo(5) }),
      bug({ id: '3', severity: 'Critical', status: 'Open' }),
    ];
    expect(avgResolutionTime(data(bugs))).toEqual([{ severity: 'High', days: 4, count: 2 }]);
  });

  it('lists severities Critical first', () => {
    const bugs = [
      bug({ id: '1', severity: 'Low', status: 'WontFix', createdAt: daysAgo(3), resolvedAt: daysAgo(2) }),
      bug({ id: '2', severity: 'Critical', status: 'Resolved', createdAt: daysAgo(3), resolvedAt: daysAgo(2) }),
    ];
    expect(avgResolutionTime(data(bugs)).map((r) => r.severity)).toEqual(['Critical', 'Low']);
  });
});

describe('bugTagCounts', () => {
  it('counts each tag by the live bugs carrying it', () => {
    const result = bugTagCounts({
      bugs: [bug({ id: '1', tagIds: ['t1'] }), bug({ id: '2', tagIds: ['t1', 't2'] })],
      tags: [
        { id: 't1', name: 'checkout', color: 'red' },
        { id: 't2', name: 'ui', color: 'blue' },
        { id: 't3', name: 'unused', color: 'gray' },
      ],
    });
    expect(result).toEqual([
      { tagId: 't1', name: 'checkout', color: 'red', count: 2 },
      { tagId: 't2', name: 'ui', color: 'blue', count: 1 },
    ]);
  });
});

describe('needsAttention', () => {
  it('lists an idle bug with the Idle badge only', () => {
    const rows = needsAttention(data([bug({ status: 'InProgress', severity: 'Medium', updatedAt: daysAgo(30) })]));
    expect(rows.map((r) => [r.idle, r.unattended])).toEqual([[true, false]]);
  });

  it('lists an unattended bug with the Unattended badge only', () => {
    const rows = needsAttention(data([bug({ status: 'Open', severity: 'High', updatedAt: daysAgo(1) })]));
    expect(rows.map((r) => [r.idle, r.unattended])).toEqual([[false, true]]);
  });

  it('leaves out an In Progress Critical bug updated recently, and a resolved idle bug', () => {
    const rows = needsAttention(
      data([
        bug({ id: '1', status: 'InProgress', severity: 'Critical', updatedAt: daysAgo(1) }),
        bug({ id: '2', status: 'Resolved', severity: 'Low', updatedAt: daysAgo(60), resolvedAt: daysAgo(60) }),
      ]),
    );
    expect(rows).toEqual([]);
  });

  it('sorts Unattended first, then severity, then the longest idle', () => {
    const rows = needsAttention(
      data([
        bug({ id: 'm40', status: 'InProgress', severity: 'Medium', updatedAt: daysAgo(40) }),
        bug({ id: 'crit', status: 'InProgress', severity: 'Critical', updatedAt: daysAgo(35) }),
        bug({ id: 'high', status: 'Open', severity: 'High', updatedAt: daysAgo(1) }),
        bug({ id: 'm50', status: 'InProgress', severity: 'Medium', updatedAt: daysAgo(50) }),
      ]),
    );
    expect(rows.map((r) => r.bug.id)).toEqual(['high', 'crit', 'm50', 'm40']);
  });
});
