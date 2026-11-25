import { describe, expect, it } from 'vitest';
import { ISSUE_FLAGS, type TestCaseFactsRow, testCaseHealth } from './test-case-health';

const NOW = new Date('2026-11-25T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

/** A healthy test case: a script, 3 runs completed yesterday, never edited. */
function facts(overrides: Partial<TestCaseFactsRow> = {}): TestCaseFactsRow {
  return {
    id: 'tc',
    has_script: true,
    script_updated_at: null,
    run_count: 3,
    completed_count: 3,
    last_completed_at: daysAgo(1),
    completed_before_edit: false,
    completed_since_edit: 3,
    trend_outcomes: ['Pass', 'Pass', 'Pass'],
    as_of: NOW,
    ...overrides,
  };
}

/** Newest first: `recent` passes in the latest 5, `previous` passes in the 5 before. */
const outcomes = (recent: number, previous: number) => [
  ...Array.from({ length: 5 }, (_, i) => (i < recent ? 'Pass' : 'Fail')),
  ...Array.from({ length: 5 }, (_, i) => (i < previous ? 'Pass' : 'NeedsReview')),
];
const tenRuns = (recent: number, previous: number): Partial<TestCaseFactsRow> => ({
  run_count: 10,
  completed_count: 10,
  completed_since_edit: 10,
  trend_outcomes: outcomes(recent, previous),
});

describe('testCaseHealth (specs/test-case-health)', () => {
  it('flags nothing on a healthy test case', () => {
    expect(testCaseHealth(facts())).toEqual({
      flags: [],
      trend: null,
      lastCompletedAt: daysAgo(1).toISOString(),
      asOf: NOW.toISOString(),
    });
  });

  it('flags No Script without a script', () => {
    expect(testCaseHealth(facts({ has_script: false })).flags).toEqual(['NoScript']);
  });

  it('flags Orphan with no run, and Never Run with runs but none completed, never both', () => {
    const none = { completed_count: 0, last_completed_at: null, completed_since_edit: 0, trend_outcomes: [] };
    expect(testCaseHealth(facts({ ...none, run_count: 0 })).flags).toEqual(['Orphan']);
    expect(testCaseHealth(facts({ ...none, run_count: 1 })).flags).toEqual(['NeverRun']);
  });

  it('flags Dormant at 15 days since the last completed run, not at 10', () => {
    expect(testCaseHealth(facts({ last_completed_at: daysAgo(15) })).flags).toEqual(['Dormant']);
    expect(testCaseHealth(facts({ last_completed_at: daysAgo(10) })).flags).toEqual([]);
  });

  it('flags Degrading at 40% against 80%, reporting both rates', () => {
    const health = testCaseHealth(facts(tenRuns(2, 4)));
    expect(health.flags).toEqual(['Degrading']);
    expect(health.trend).toEqual({ recentPassPct: 40, previousPassPct: 80 });
  });

  it('flags Improving at 100% against 60%', () => {
    expect(testCaseHealth(facts(tenRuns(5, 3))).flags).toEqual(['Improving']);
  });

  it('flags neither with 9 runs or with equal windows', () => {
    const nine = { ...tenRuns(0, 5), completed_since_edit: 9, trend_outcomes: outcomes(0, 5).slice(0, 9) };
    expect(testCaseHealth(facts(nine))).toMatchObject({ flags: [], trend: null });
    expect(testCaseHealth(facts(tenRuns(3, 3)))).toMatchObject({ flags: [], trend: { recentPassPct: 60, previousPassPct: 60 } });
  });

  it('flags Trend Reset with 3 runs since the edit, suppressing Degrading', () => {
    const health = testCaseHealth(
      facts({
        run_count: 15,
        completed_count: 15,
        script_updated_at: daysAgo(3),
        completed_before_edit: true,
        completed_since_edit: 3,
        trend_outcomes: ['Fail', 'Fail', 'Fail'],
      }),
    );
    expect(health).toMatchObject({ flags: ['TrendReset'], trend: null });
  });

  it('ends Trend Reset at 10 runs since the edit, judging only those', () => {
    const health = testCaseHealth(
      facts({ ...tenRuns(2, 4), run_count: 22, completed_count: 22, script_updated_at: daysAgo(8), completed_before_edit: true }),
    );
    expect(health.flags).toEqual(['Degrading']);
  });

  it('gives no Trend Reset when the script was edited before any run', () => {
    expect(testCaseHealth(facts({ script_updated_at: daysAgo(5), completed_before_edit: false })).flags).toEqual([]);
  });

  it('counts the dashboard issues without Improving or Trend Reset', () => {
    expect([...ISSUE_FLAGS]).toEqual(['NoScript', 'Orphan', 'NeverRun', 'Dormant', 'Degrading']);
  });
});
