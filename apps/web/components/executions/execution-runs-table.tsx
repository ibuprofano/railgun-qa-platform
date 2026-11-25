'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  chartFilterLabel,
  filterRuns,
  sortRuns,
  type DashboardRun,
  type RunSortKey,
  type RunTableState,
} from '@railgun-qa/reporting';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { OutcomeBadge } from './status-badge';
import { shortDate } from '../charts/chart-format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Rows rendered at first, and added each time the end comes into view (PRD §6.3.6, Loading). */
export const RUNS_PAGE_SIZE = 50;

const COLUMNS: { key: RunSortKey; label: string; className?: string }[] = [
  { key: 'order', label: 'Order', className: 'w-16' },
  { key: 'testCase', label: 'Test Case' },
  { key: 'outcome', label: 'Outcome', className: 'w-32' },
  { key: 'attempts', label: 'Attempts', className: 'w-24' },
  { key: 'bugs', label: 'Bugs', className: 'w-20' },
  { key: 'createdAt', label: 'Created', className: 'w-32' },
  { key: 'updatedAt', label: 'Last Updated', className: 'w-32' },
];

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export interface ExecutionRunsTableProps {
  /** Every run of the executions in scope; the table applies its own filters. */
  runs: DashboardRun[];
  state: RunTableState;
  onStateChange: (state: RunTableState) => void;
}

/**
 * The Executions dashboard's runs table (PRD §6.3.6; design.md decision 7): Needs
 * Attention and All Runs tabs, the layered filters from @railgun-qa/reporting, sortable
 * columns, and rows rendered progressively with an "N of M" counter. A row opens its run
 * in its execution, in a new tab.
 */
export function ExecutionRunsTable({ runs, state, onStateChange }: ExecutionRunsTableProps) {
  const needsAttention = useMemo(() => runs.filter((r) => r.outcome === 'NeedsReview').length, [runs]);
  const rows = useMemo(() => sortRuns(filterRuns(runs, state), state.sort), [runs, state]);
  const label = chartFilterLabel(state, shortDate);
  const resetKey = `${state.tab}|${state.outcome}|${state.day?.date}:${state.day?.outcome}|${state.name}|${state.sort.key}:${state.sort.direction}`;

  return (
    <section aria-label="Runs" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Runs view" className="flex gap-1">
          <Tab selected={state.tab === 'needsAttention'} onSelect={() => onStateChange({ ...state, tab: 'needsAttention' })}>
            Needs Attention
            <span data-testid="needs-attention-count" className="ml-1.5 rounded-full bg-review/20 px-1.5 text-[10px] tabular-nums">
              {needsAttention}
            </span>
          </Tab>
          <Tab selected={state.tab === 'all'} onSelect={() => onStateChange({ ...state, tab: 'all' })}>
            All Runs
          </Tab>
        </div>
        <Input
          aria-label="Filter runs by name"
          placeholder="Test case or execution name"
          className="h-8 w-64"
          value={state.name}
          onChange={(event) => onStateChange({ ...state, name: event.target.value })}
        />
      </div>
      {label && (
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-md bg-muted px-2 py-0.5" data-testid="chart-filter-label">
            {label}
          </span>
          <Button type="button" size="sm" variant="ghost" onClick={() => onStateChange({ ...state, outcome: null, day: null })}>
            Clear filter
          </Button>
        </div>
      )}
      <RunRows key={resetKey} rows={rows} state={state} onStateChange={onStateChange} />
    </section>
  );
}

function Tab({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={cn('flex items-center rounded-md px-2 py-1 text-sm', selected ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground')}
    >
      {children}
    </button>
  );
}

/** Keyed by the filters and sort, so any change starts again from the top with one page. */
function RunRows({ rows, state, onStateChange }: { rows: DashboardRun[]; state: RunTableState; onStateChange: (s: RunTableState) => void }) {
  const [shown, setShown] = useState(RUNS_PAGE_SIZE);
  const sentinel = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const observable = typeof IntersectionObserver !== 'undefined';
  const visible = rows.slice(0, shown);
  const hasMore = shown < rows.length;

  useEffect(() => {
    top.current?.scrollTo?.({ top: 0 });
  }, []);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || !observable || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setShown((n) => n + RUNS_PAGE_SIZE);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [observable, hasMore, shown]);

  const sortBy = (key: RunSortKey) =>
    onStateChange({
      ...state,
      sort: { key, direction: state.sort.key === key && state.sort.direction === 'desc' ? 'asc' : 'desc' },
    });

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{state.tab === 'needsAttention' ? 'No runs need review.' : 'No runs match this filter.'}</p>;
  }

  return (
    <div ref={top} className="flex max-h-[32rem] flex-col overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
          <tr>
            {COLUMNS.map((column) => {
              const active = state.sort.key === column.key;
              return (
                <th
                  key={column.key}
                  scope="col"
                  className={cn('py-2 pr-2 font-medium', column.className)}
                  aria-sort={active ? (state.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button type="button" onClick={() => sortBy(column.key)} className="flex items-center gap-1 hover:text-foreground">
                    {column.label}
                    {active && (state.sort.direction === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {visible.map((run) => (
            <tr key={run.id} className="border-t hover:bg-muted/50">
              <td colSpan={COLUMNS.length} className="p-0">
                <a
                  href={`/executions?execution=${run.executionId}&run=${run.id}`}
                  target="_blank"
                  rel="noopener"
                  aria-label={`Open ${run.testCaseName ?? 'deleted test case'} in ${run.executionName}`}
                  className="grid items-center py-2"
                  style={{ gridTemplateColumns: '4rem 1fr 8rem 6rem 5rem 8rem 8rem' }}
                  data-testid="dashboard-run-row"
                >
                  <span className="tabular-nums text-muted-foreground">{run.position}</span>
                  <span className="flex min-w-0 flex-col pr-2">
                    <span className="truncate font-medium">{run.testCaseName ?? 'Deleted test case'}</span>
                    {run.failedStep && (
                      <span className="truncate text-xs text-fail" data-testid="failed-step">
                        {run.failedStep}
                      </span>
                    )}
                    <span className="truncate text-xs text-muted-foreground">{run.executionName}</span>
                  </span>
                  <span>
                    <OutcomeBadge outcome={run.outcome} />
                  </span>
                  <span className="tabular-nums">{run.attempts}</span>
                  <span className={cn('tabular-nums', run.bugCount > 0 && 'font-medium text-fail')} data-testid="bug-count">
                    {run.bugCount}
                  </span>
                  <span className="text-xs text-muted-foreground">{when(run.createdAt)}</span>
                  <span className="text-xs text-muted-foreground">{when(run.outcomeUpdatedAt)}</span>
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore && <div ref={sentinel} data-testid="runs-sentinel" className="h-1" />}
      <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
        <span data-testid="runs-counter">
          {visible.length} of {rows.length}
        </span>
        {hasMore && !observable && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setShown((n) => n + RUNS_PAGE_SIZE)}>
            Show more
          </Button>
        )}
      </div>
    </div>
  );
}
