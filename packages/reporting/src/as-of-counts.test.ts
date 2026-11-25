import { describe, expect, it } from 'vitest';
import { type AsOfCountsRow, figuresFromCounts } from './as-of-counts';

const row = (overrides: Partial<AsOfCountsRow>): AsOfCountsRow => ({
  ord: 1,
  as_of: new Date('2026-11-25T00:00:00Z'),
  total: 0,
  ready: 0,
  covered: 0,
  fresh: 0,
  completed_ever: 0,
  recent: 0,
  recent_pass: 0,
  open_total: 0,
  open_critical: 0,
  open_high: 0,
  open_medium: 0,
  ...overrides,
});

describe('figuresFromCounts', () => {
  it('reproduces the spec’s healthy example: 90 / 80 / 97 / 75 → 88, Healthy', () => {
    const figures = figuresFromCounts(
      row({ total: 5, ready: 4, covered: 4, fresh: 3, completed_ever: 10, recent: 10, recent_pass: 9, open_total: 1, open_medium: 1 }),
    );
    expect(figures).toEqual({
      testCases: { total: 5, readyPct: 80, coveragePct: 80 },
      passRate: 90,
      openBugs: 1,
      criticalBugs: 0,
      health: { score: 88, band: 'Healthy', components: { passRate: 90, coverage: 80, bugPressure: 97, freshness: 75 } },
    });
  });

  it('gives no score without any completed run', () => {
    expect(figuresFromCounts(row({ total: 3, open_total: 1, open_high: 1 })).health).toMatchObject({ score: null, band: null });
  });

  it('scores a pass-rate component of 0, with no pass rate, when no run is recent', () => {
    const figures = figuresFromCounts(row({ total: 1, ready: 1, covered: 1, completed_ever: 2 }));
    expect(figures.passRate).toBeNull();
    expect(figures.health.components.passRate).toBe(0);
    expect(figures.health.score).toBe(45); // 0.2·100 + 0.25·100
  });
});
