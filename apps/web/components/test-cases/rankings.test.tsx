import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Rankings } from './rankings';
import { FolderHealthTable } from './folder-health-table';

const empty = { mostRun: [], topFailing: [], topFlaky: [], topTags: [], failingBelowMinimum: 0 };

describe('Rankings (specs/test-cases-screen)', () => {
  it('numbers rows and shows the fail rate in red with "(3/4)"', () => {
    render(
      <Rankings
        rankings={{
          ...empty,
          topFailing: [
            { id: 'pay', name: 'Pay', failed: 3, completed: 4, failRatePct: 75 },
            { id: 'cart', name: 'Cart', failed: 1, completed: 5, failRatePct: 20 },
          ],
        }}
      />,
    );
    const list = screen.getByRole('list', { name: 'Top Failing Test Cases' });
    const [first, second] = within(list).getAllByRole('listitem');
    expect(first.textContent).toBe('1Pay75% (3/4)');
    expect(second.textContent?.startsWith('2Cart')).toBe(true);
    expect(within(first).getByText('75%').className).toContain('text-fail');
    expect(within(first).getByRole('link').getAttribute('target')).toBe('_blank');
  });

  it('shows the flaky share in amber, and tag rows without links', () => {
    render(
      <Rankings
        rankings={{
          ...empty,
          topFlaky: [{ id: 'f', name: 'Flaky', flaky: 1, completed: 2, flakyPct: 50 }],
          topTags: [{ tagId: 't', name: 'smoke', color: 'green', count: 5 }],
        }}
      />,
    );
    const flaky = within(screen.getByRole('list', { name: 'Top Flaky Test Cases' })).getByRole('listitem');
    expect(within(flaky).getByText('50%').className).toContain('text-review');
    expect(flaky.textContent).toContain('(1/2)');
    const tag = within(screen.getByRole('list', { name: 'Top Tags' })).getByRole('listitem');
    expect(tag.textContent).toBe('1smoke5');
    expect(within(tag).queryByRole('link')).toBeNull();
  });

  it('gives each empty ranking its own line', () => {
    render(<Rankings rankings={empty} />);
    expect(screen.getByText('No completed runs yet.')).toBeTruthy();
    expect(screen.getByText('No failing test cases — nice!')).toBeTruthy();
    expect(screen.getByText('No flaky runs.')).toBeTruthy();
    expect(screen.getByText('No tags on test cases yet.')).toBeTruthy();
  });
});

describe('Top Failing and failing test cases too new to rank (design.md decision 7)', () => {
  const list = () => screen.getByRole('region', { name: 'Top Failing Test Cases' });

  it('replaces the empty line with the count when nothing is ranked', () => {
    render(<Rankings rankings={{ ...empty, failingBelowMinimum: 2 }} />);
    expect(within(list()).getByText("2 failing test cases have fewer than 3 completed runs, so they aren't ranked yet.")).toBeTruthy();
    expect(screen.queryByText('No failing test cases — nice!')).toBeNull();
  });

  it('adds a singular footnote below ranked rows', () => {
    const row = (id: string) => ({ id, name: id, failed: 1, completed: 3, failRatePct: 33 });
    render(<Rankings rankings={{ ...empty, topFailing: [row('a'), row('b'), row('c')], failingBelowMinimum: 1 }} />);
    expect(within(list()).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list()).getByText("1 more failing test case has fewer than 3 completed runs and isn't ranked yet.")).toBeTruthy();
  });

  it('keeps "nice!" only when nothing has failed', () => {
    render(<Rankings rankings={empty} />);
    expect(within(list()).getByText('No failing test cases — nice!')).toBeTruthy();
  });
});

describe('FolderHealthTable (specs/test-cases-screen)', () => {
  it('shows the path, cases, red "2 (50%)" and "Dormant ×2"; a clean folder gets a green "—"', () => {
    render(
      <FolderHealthTable
        rows={[
          { folderId: 'p', path: ['Checkout', 'Payments'], cases: 4, withIssues: 2, issuePct: 50, breakdown: { Dormant: 2 } },
          { folderId: 'c', path: ['Cart'], cases: 3, withIssues: 1, issuePct: 33, breakdown: { Orphan: 1 } },
          { folderId: 'l', path: ['Login'], cases: 2, withIssues: 0, issuePct: 0, breakdown: {} },
        ]}
      />,
    );
    const [, payments, cart, login] = screen.getAllByRole('row');
    const cells = within(payments).getAllByRole('cell').map((c) => c.textContent);
    expect(cells).toEqual(['Checkout / Payments', '4', '2 (50%)', 'Dormant ×2']);
    expect(within(payments).getByText('2 (50%)').className).toContain('text-fail');
    expect(within(cart).getByText('1 (33%)').className).toContain('text-review');
    expect(within(login).getByText('—').className).toContain('text-pass');
    expect(within(login).getAllByRole('cell')[3].textContent).toBe('');
  });
});
