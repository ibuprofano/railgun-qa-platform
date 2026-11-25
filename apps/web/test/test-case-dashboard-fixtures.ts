import type { TestCaseDashboard } from '../lib/test-cases-api';

/** 90 dated days ending 2026-11-25, all zero unless `overrides` names a date. */
export function makeDays(overrides: Record<string, Partial<TestCaseDashboard['days'][number]>> = {}): TestCaseDashboard['days'] {
  const end = Date.UTC(2026, 10, 25);
  return Array.from({ length: 90 }, (_, i) => {
    const date = new Date(end - (89 - i) * 86_400_000).toISOString().slice(0, 10);
    return { date, created: 0, added: 0, completed: 0, passed: 0, ...overrides[date] };
  });
}

/** A Test Cases dashboard response: 10 test cases, 6 Ready, 7 covered, no issues or rankings. */
export function makeDashboard(overrides: Partial<TestCaseDashboard> = {}): TestCaseDashboard {
  return {
    tiles: { total: 10, ready: 6, covered: 7, avgConfidencePct: null },
    days: makeDays(),
    hasCompletedRuns: true,
    lastOutcome: { pass: 4, fail: 1, needsReview: 0, neverRun: 5 },
    sourceType: { gherkin: 8, manual: 2 },
    needsAttention: [],
    rankings: { mostRun: [], topFailing: [], topFlaky: [], topTags: [], failingBelowMinimum: 0 },
    folderHealth: [],
    ...overrides,
  };
}

/** A Needs Attention row created `createdDay` days into November 2026. */
export function makeAttentionRow(
  name: string,
  createdDay: number,
  overrides: Partial<TestCaseDashboard['needsAttention'][number]> = {},
): TestCaseDashboard['needsAttention'][number] {
  const day = (d: number) => new Date(Date.UTC(2026, 10, d, 12)).toISOString();
  return {
    id: `tc-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    tagIds: [],
    status: 'Ready',
    createdAt: day(createdDay),
    updatedAt: day(createdDay),
    issues: ['Orphan'],
    ...overrides,
  };
}
