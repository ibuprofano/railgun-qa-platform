import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEEDS_ATTENTION,
  filterNeedsAttention,
  sortNeedsAttention,
  type TestCaseNeedsAttentionRow,
  unrankedFailingText,
} from './test-case-dashboard';

const row = (id: string, name: string, over: Partial<TestCaseNeedsAttentionRow> = {}): TestCaseNeedsAttentionRow => ({
  id,
  name,
  tagIds: [],
  status: 'Draft',
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
  issues: ['NoScript'],
  ...over,
});

const rows = [
  row('c', 'Checkout', { createdAt: '2026-03-03T10:00:00.000Z', updatedAt: '2026-03-04T10:00:00.000Z', issues: ['Degrading'] }),
  row('a', 'Pay by card', { createdAt: '2026-03-01T10:00:00.000Z', updatedAt: '2026-03-09T10:00:00.000Z', issues: ['NoScript', 'Orphan'] }),
  row('b', 'Refund payment', { createdAt: '2026-03-02T10:00:00.000Z', updatedAt: '2026-03-05T10:00:00.000Z', issues: ['Dormant'] }),
];
const ids = (list: TestCaseNeedsAttentionRow[]) => list.map((r) => r.id);

describe('Needs Attention filter and sort (test-cases-dashboard-report design.md decision 1)', () => {
  it('defaults to created time, oldest first', () => {
    expect(ids(sortNeedsAttention(rows, DEFAULT_NEEDS_ATTENTION.sort))).toEqual(['a', 'b', 'c']);
  });

  it('sorts issues in the rules’ order, more issues first within a flag', () => {
    const twoNoScript = row('d', 'Login', { createdAt: '2026-03-04T10:00:00.000Z', issues: ['NoScript'] });
    expect(ids(sortNeedsAttention([...rows, twoNoScript], { key: 'issue', direction: 'asc' }))).toEqual(['a', 'd', 'b', 'c']);
  });

  it('reverses the whole order for desc', () => {
    expect(ids(sortNeedsAttention(rows, { key: 'updatedAt', direction: 'desc' }))).toEqual(['a', 'b', 'c']);
    expect(ids(sortNeedsAttention(rows, { key: 'updatedAt', direction: 'asc' }))).toEqual(['c', 'b', 'a']);
  });

  it('breaks ties on created time, then id', () => {
    const same = [row('y', 'Same'), row('x', 'Same')];
    expect(ids(sortNeedsAttention(same, { key: 'name', direction: 'asc' }))).toEqual(['x', 'y']);
  });

  it('filters by name ignoring case and surrounding spaces', () => {
    expect(ids(filterNeedsAttention(rows, '  PAY '))).toEqual(['a', 'b']);
    expect(filterNeedsAttention(rows, '')).toHaveLength(3);
  });
});

describe('unrankedFailingText', () => {
  it('stands in for the empty line, or reads as a footnote', () => {
    expect(unrankedFailingText(2, false)).toBe("2 failing test cases have fewer than 3 completed runs, so they aren't ranked yet.");
    expect(unrankedFailingText(1, true)).toBe("1 more failing test case has fewer than 3 completed runs and isn't ranked yet.");
  });
});
