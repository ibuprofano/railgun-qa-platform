import { describe, expect, it } from 'vitest';
import { band, bugPressure, health, healthScore, pct, roundHalfUp } from './health';

describe('overview metrics (specs/project-metrics)', () => {
  it.each([
    [87.5, 88],
    [87.4, 87],
    [0.5, 1],
    [0, 0],
    [100, 100],
  ])('roundHalfUp(%p) = %p', (value, expected) => {
    expect(roundHalfUp(value)).toBe(expected);
  });

  it('pct is a whole percentage, 0 with nothing to divide by', () => {
    expect(pct(6, 10)).toBe(60);
    expect(pct(1, 3)).toBe(33);
    expect(pct(2, 3)).toBe(67);
    expect(pct(1, 8)).toBe(13); // 12.5 rounds up
    expect(pct(0, 0)).toBe(0);
    expect(pct(3, 0)).toBe(0);
  });

  it('bug pressure charges 25 / 10 / 3 per open Critical / High / Medium, floored at 0', () => {
    expect(bugPressure({ critical: 0, high: 0, medium: 1 })).toBe(97);
    expect(bugPressure({ critical: 1, high: 2, medium: 3 })).toBe(46);
    expect(bugPressure({ critical: 5, high: 0, medium: 0 })).toBe(0);
  });

  it('scores the spec’s healthy example 88 from components 90, 80, 97, 75', () => {
    expect(healthScore({ passRate: 90, coverage: 80, bugPressure: 97, freshness: 75 })).toBe(88);
  });

  it.each([
    [100, 'Healthy'],
    [80, 'Healthy'],
    [79, 'AtRisk'],
    [60, 'AtRisk'],
    [59, 'Critical'],
    [0, 'Critical'],
  ])('a score of %p is %s', (score, expected) => {
    expect(band(score)).toBe(expected);
  });

  it('reports the components, the score and the band', () => {
    expect(
      health({ hasCompletedRun: true, passRate: 90, coverage: 80, openBugs: { critical: 0, high: 0, medium: 1 }, freshness: 75 }),
    ).toEqual({ score: 88, band: 'Healthy', components: { passRate: 90, coverage: 80, bugPressure: 97, freshness: 75 } });
  });

  it('a pass rate of none counts as 0, and a score is still given', () => {
    const result = health({ hasCompletedRun: true, passRate: null, coverage: 100, openBugs: { critical: 0, high: 0, medium: 0 }, freshness: 0 });
    expect(result.components.passRate).toBe(0);
    expect(result.score).toBe(45); // 0.2·100 + 0.25·100
    expect(result.band).toBe('Critical');
  });

  it('no completed run at all gives no score and no band, but still the components', () => {
    expect(health({ hasCompletedRun: false, passRate: null, coverage: 0, openBugs: { critical: 1, high: 0, medium: 0 }, freshness: 0 })).toEqual({
      score: null,
      band: null,
      components: { passRate: 0, coverage: 0, bugPressure: 75, freshness: 0 },
    });
  });
});
