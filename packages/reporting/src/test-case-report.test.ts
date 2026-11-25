import { describe, expect, it } from 'vitest';
import { DEFAULT_NEEDS_ATTENTION, type TestCaseDashboard, type TestCaseNeedsAttentionRow } from './test-case-dashboard';
import { formatDayInZone, testCaseReportData, type TestCaseReportOptions } from './test-case-report';

const days = Array.from({ length: 90 }, (_, i) => {
  const date = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
  return { date, created: i % 3, added: i % 5, completed: i % 4, passed: i % 2 };
});

const flagged = (n: number, over: Partial<TestCaseNeedsAttentionRow> = {}): TestCaseNeedsAttentionRow => ({
  id: `tc${String(n).padStart(2, '0')}`,
  name: `Case ${n}`,
  tagIds: [],
  status: 'Draft',
  createdAt: new Date(Date.UTC(2026, 2, n, 12)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 2, 20 - n, 12)).toISOString(),
  issues: ['NoScript'],
  ...over,
});

const needsAttention = [
  ...Array.from({ length: 11 }, (_, i) => flagged(i + 1)),
  flagged(12, { name: 'Pay by card', tagIds: ['t1'] }),
  flagged(13, { name: 'Refund PAYment', updatedAt: '2026-03-30T12:00:00.000Z' }),
  flagged(14, { name: 'Payout report', status: 'Ready', issues: ['NeverRun', 'Dormant'] }),
];

const dashboard = (over: Partial<TestCaseDashboard> = {}): TestCaseDashboard => ({
  tiles: { total: 10, ready: 6, covered: 7, avgConfidencePct: null },
  days,
  hasCompletedRuns: true,
  lastOutcome: { pass: 4, fail: 1, needsReview: 2, neverRun: 3 },
  sourceType: { gherkin: 8, manual: 2 },
  needsAttention,
  rankings: {
    mostRun: [{ id: 'a', name: 'Pay', completed: 4 }],
    topFailing: [{ id: 'a', name: 'Pay', failed: 3, completed: 4, failRatePct: 75 }],
    topFlaky: [],
    topTags: [{ tagId: 't1', name: 'checkout', color: 'blue', count: 5 }],
    failingBelowMinimum: 0,
  },
  folderHealth: [
    { folderId: 'f1', path: ['Payments', 'Cards'], cases: 4, withIssues: 2, issuePct: 50, breakdown: { NoScript: 2, Dormant: 1 } },
    { folderId: 'f2', path: ['Search'], cases: 3, withIssues: 0, issuePct: 0, breakdown: {} },
  ],
  ...over,
});

const options = (over: Partial<TestCaseReportOptions> = {}): TestCaseReportOptions => ({
  tz: 'UTC',
  ranges: { overTime: 30, passRate: 7 },
  needsAttention: DEFAULT_NEEDS_ATTENTION,
  ...over,
});
const context = { projectName: 'ShopFlow', tagName: (id: string) => (id === 't1' ? 'checkout' : 'Deleted tag') };

describe('testCaseReportData (specs/test-cases-dashboard-report)', () => {
  it('prints the tiles as the screen does, with "—" for Avg Confidence', () => {
    const report = testCaseReportData(dashboard(), options(), context);
    expect(report.tiles).toEqual([
      { label: 'Total Tests', value: '10', subLabel: '6 ready' },
      { label: 'Ready', value: '60%', subLabel: '6 of 10 cases' },
      { label: 'Coverage', value: '70%', subLabel: '3 never run' },
      { label: 'Avg Confidence', value: '—', subLabel: 'from last run results' },
    ]);
    expect(report.generatedOn).toBe(days[89].date);
  });

  it('gives each chart its own range', () => {
    const report = testCaseReportData(dashboard(), options(), context);
    expect(report.charts.map((c) => c.title)).toEqual(['Test Cases Over Time (last 30 days)', 'Pass Rate Trend (last 7 days)']);
    const wide = testCaseReportData(dashboard(), options({ ranges: { overTime: 90, passRate: 7 } }), context);
    expect(wide.charts[0].svg).not.toBe(report.charts[0].svg);
    expect(wide.charts[1].svg).toBe(report.charts[1].svg);
  });

  it('leaves out Pass Rate Trend while no run has completed', () => {
    const report = testCaseReportData(dashboard({ hasCompletedRuns: false }), options(), context);
    expect(report.charts.map((c) => c.title)).toEqual(['Test Cases Over Time (last 30 days)']);
  });

  it('builds both donuts', () => {
    const [outcome, source] = testCaseReportData(dashboard(), options(), context).donuts;
    expect(outcome.legend.map((l) => [l.label, l.count])).toEqual([['Pass', 4], ['Fail', 1], ['Needs Review', 2], ['Never Run', 3]]);
    expect(source.legend.map((l) => [l.label, l.count])).toEqual([['Gherkin', 8], ['Manual', 2]]);
  });

  it('lists every flagged test case with no filter, created earliest first', () => {
    const report = testCaseReportData(dashboard(), options(), context);
    expect(report.needsAttention.total).toBe(14);
    expect(report.needsAttention.filter).toBeNull();
    expect(report.needsAttention.rows).toHaveLength(14);
    expect(report.needsAttention.rows[0]).toEqual({
      name: 'Case 1', tags: [], issues: ['No Script'], status: 'Draft', created: '1 Mar 2026', updated: '19 Mar 2026',
    });
  });

  it('follows the name filter and sort, and names the filter', () => {
    const report = testCaseReportData(dashboard(), options({ needsAttention: { name: ' pay ', sort: { key: 'updatedAt', direction: 'desc' } } }), context);
    expect(report.needsAttention.filter).toBe('Name: pay');
    expect(report.needsAttention.rows.map((r) => r.name)).toEqual(['Refund PAYment', 'Pay by card', 'Payout report']);
    expect(report.needsAttention.rows[1].tags).toEqual(['checkout']);
    expect(report.needsAttention.rows[2].issues).toEqual(['Never Run', 'Dormant']);
  });

  it('prints the rankings with their values and empty lines', () => {
    const [mostRun, failing, flaky, tags] = testCaseReportData(dashboard(), options(), context).rankings;
    expect(mostRun.rows).toEqual([{ rank: 1, name: 'Pay', value: '4' }]);
    expect(failing.rows).toEqual([{ rank: 1, name: 'Pay', value: '75% (3/4)' }]);
    expect(failing.note).toBeNull();
    expect(flaky.rows).toEqual([]);
    expect(flaky.emptyText).toBe('No flaky runs.');
    expect(tags.rows).toEqual([{ rank: 1, name: 'checkout', value: '5' }]);
  });

  it('says how many failing test cases are too new to rank', () => {
    const base = dashboard().rankings;
    const alone = testCaseReportData(dashboard({ rankings: { ...base, topFailing: [], failingBelowMinimum: 2 } }), options(), context);
    expect(alone.rankings[1].note).toBe("2 failing test cases have fewer than 3 completed runs, so they aren't ranked yet.");
    const below = testCaseReportData(dashboard({ rankings: { ...base, failingBelowMinimum: 1 } }), options(), context);
    expect(below.rankings[1].note).toBe("1 more failing test case has fewer than 3 completed runs and isn't ranked yet.");
  });

  it('prints Folder Health rows', () => {
    expect(testCaseReportData(dashboard(), options(), context).folderHealth).toEqual([
      { path: 'Payments / Cards', cases: 4, issues: '2 (50%)', breakdown: 'No Script ×2 · Dormant ×1' },
      { path: 'Search', cases: 3, issues: '—', breakdown: '' },
    ]);
  });
});

describe('formatDayInZone', () => {
  it('prints the day in the zone', () => {
    expect(formatDayInZone('2026-11-24T23:30:00.000Z', 'UTC')).toBe('24 Nov 2026');
    expect(formatDayInZone('2026-11-24T23:30:00.000Z', 'Asia/Tokyo')).toBe('25 Nov 2026');
    expect(formatDayInZone('2026-09-02T12:00:00.000Z', 'Europe/Madrid')).toBe('2 Sep 2026');
  });
});
