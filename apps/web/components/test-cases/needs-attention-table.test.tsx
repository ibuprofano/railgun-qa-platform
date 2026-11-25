import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_NEEDS_ATTENTION } from '@railgun-qa/reporting';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NEEDS_ATTENTION_TOOLTIP, NeedsAttentionTable } from './needs-attention-table';
import { makeAttentionRow } from '../../test/test-case-dashboard-fixtures';
import { TooltipProvider } from '@/components/ui/tooltip';

type Rows = Parameters<typeof NeedsAttentionTable>[0]['rows'];

/** The table is controlled by the dashboard; this wrapper keeps its state as the dashboard does. */
function Stateful({ rows }: { rows: Rows }) {
  const [state, setState] = useState(DEFAULT_NEEDS_ATTENTION);
  return (
    <NeedsAttentionTable
      rows={rows}
      tags={[{ id: 'tag-smoke', name: 'smoke', color: 'green', testCaseCount: 1, bugCount: 0 }]}
      state={state}
      onStateChange={setState}
    />
  );
}

const renderTable = (rows: Rows) =>
  render(
    <TooltipProvider>
      <Stateful rows={rows} />
    </TooltipProvider>,
  );
const names = () =>
  within(screen.getByRole('table', { name: 'Needs Attention' }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].querySelector('a')!.textContent);

/** 14 rows, created on 14, 13, …, 1 November, so the oldest is last in input order. */
const fourteen = Array.from({ length: 14 }, (_, i) =>
  makeAttentionRow(`Case ${String(14 - i).padStart(2, '0')}`, 14 - i, { updatedAt: new Date(Date.UTC(2026, 10, 20 + (i % 3), 12)).toISOString() }),
);

describe('NeedsAttentionTable (specs/test-cases-screen)', () => {
  it('shows its count and a tooltip defining every issue', () => {
    renderTable(fourteen);
    expect(screen.getByLabelText('14 test cases')).toBeTruthy();
    expect(NEEDS_ATTENTION_TOOLTIP).toContain('Dormant: its last completed run was more than 14 days ago.');
    expect(screen.getByRole('button', { name: NEEDS_ATTENTION_TOOLTIP })).toBeTruthy();
  });

  it('defaults to Created, oldest first, with 10 rows and "Show 4 more"', () => {
    renderTable(fourteen);
    expect(names()).toEqual(['Case 01', 'Case 02', 'Case 03', 'Case 04', 'Case 05', 'Case 06', 'Case 07', 'Case 08', 'Case 09', 'Case 10']);

    fireEvent.click(screen.getByRole('button', { name: 'Show 4 more' }));
    expect(names()).toHaveLength(14);
  });

  it('filters by name as the user types, ignoring case', () => {
    renderTable([makeAttentionRow('Pay with card', 1), makeAttentionRow('Login', 2), makeAttentionRow('Repay order', 3)]);
    fireEvent.change(screen.getByLabelText('Filter needs attention by name'), { target: { value: 'PAY' } });
    expect(names()).toEqual(['Pay with card', 'Repay order']);
  });

  it('sorts by Last Updated, and reverses on a second click', () => {
    const rows = [
      makeAttentionRow('Old edit', 1, { updatedAt: '2026-11-10T00:00:00.000Z' }),
      makeAttentionRow('New edit', 2, { updatedAt: '2026-11-20T00:00:00.000Z' }),
      makeAttentionRow('Mid edit', 3, { updatedAt: '2026-11-15T00:00:00.000Z' }),
    ];
    renderTable(rows);
    const header = screen.getByRole('button', { name: 'Last Updated' });

    fireEvent.click(header);
    expect(names()).toEqual(['Old edit', 'Mid edit', 'New edit']);
    expect(header.closest('th')!.getAttribute('aria-sort')).toBe('ascending');

    fireEvent.click(header);
    expect(names()).toEqual(['New edit', 'Mid edit', 'Old edit']);
    expect(header.closest('th')!.getAttribute('aria-sort')).toBe('descending');
  });

  it('colours Degrading red and the other issues amber, and shows tags', () => {
    renderTable([makeAttentionRow('Slipping', 1, { issues: ['NoScript', 'Degrading'], tagIds: ['tag-smoke'] })]);
    const row = screen.getAllByRole('row')[1];
    expect(within(row).getByText('Degrading').className).toContain('text-fail');
    expect(within(row).getByText('No Script').className).toContain('bg-review');
    expect(within(row).getByText('smoke')).toBeTruthy();
  });

  it('opens a row in a new tab', () => {
    renderTable([makeAttentionRow('Pay', 1)]);
    const link = screen.getByRole('link', { name: 'Pay' });
    expect(link.getAttribute('href')).toBe('/test-cases?testCase=tc-pay');
    expect(link.getAttribute('target')).toBe('_blank');
  });
});
