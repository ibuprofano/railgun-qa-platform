'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Info } from 'lucide-react';
import type { TestCaseDashboard } from '../../lib/test-cases-api';
import type { Tag } from '../../lib/tags-api';
import {
  filterNeedsAttention,
  ISSUE_FLAGS,
  type NeedsAttentionSortKey as SortKey,
  type NeedsAttentionState,
  sortNeedsAttention,
} from '@railgun-qa/reporting';
import { SectionCard } from '../dashboard/section-card';
import { TagBadge } from '../tags/tag-badge';
import { ISSUE_DEFINITIONS, ISSUE_LABELS, issueBadgeClass, shortDay, testCaseHref } from './dashboard-format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type Row = TestCaseDashboard['needsAttention'][number];

/** How many rows show before "Show N more" (PRD §6.2.4). */
export const NEEDS_ATTENTION_PAGE = 10;

export const NEEDS_ATTENTION_TOOLTIP = ISSUE_FLAGS.map((flag) => `${ISSUE_LABELS[flag]}: ${ISSUE_DEFINITIONS[flag]}.`).join(' ');

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Test Case' },
  { key: 'issue', label: 'Issue' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Created' },
  { key: 'updatedAt', label: 'Last Updated' },
];

/**
 * Needs Attention (PRD §6.2.4, specs/test-cases-screen): every test case with an issue,
 * filtered by name as the user types, sortable on every column (Created, oldest first,
 * by default), 10 rows then "Show N more". Rows open the test case in a new tab.
 *
 * The filter and sort are kept by the dashboard (`state`), so Download report can ask for
 * the same rows in the same order (test-cases-dashboard-report design.md decision 6).
 */
export function NeedsAttentionTable({
  rows,
  tags,
  state,
  onStateChange,
}: {
  rows: Row[];
  tags: Tag[];
  state: NeedsAttentionState;
  onStateChange: (state: NeedsAttentionState) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const filter = state.name;
  const sort = state.sort;

  const shown = useMemo(() => sortNeedsAttention(filterNeedsAttention(rows, filter), sort), [rows, filter, sort]);
  const visible = expanded ? shown : shown.slice(0, NEEDS_ATTENTION_PAGE);
  const hidden = shown.length - visible.length;

  const toggle = (key: SortKey) =>
    onStateChange({
      ...state,
      sort: sort.key === key ? { key, direction: sort.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' },
    });

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          Needs Attention
          <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums" aria-label={`${rows.length} test cases`}>
            {rows.length}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={NEEDS_ATTENTION_TOOLTIP} className="text-muted-foreground hover:text-foreground">
                <Info className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">{NEEDS_ATTENTION_TOOLTIP}</TooltipContent>
          </Tooltip>
        </span>
      }
      action={
        <Input
          aria-label="Filter needs attention by name"
          placeholder="Filter by name"
          value={filter}
          onChange={(e) => onStateChange({ ...state, name: e.target.value })}
          className="h-8 w-48"
        />
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No test cases need attention.</p>
      ) : (
        <div className="overflow-x-auto">
          <table aria-label="Needs Attention" className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                {COLUMNS.map((column) => {
                  const active = sort.key === column.key;
                  return (
                    <th
                      key={column.key}
                      className="py-1.5 pr-3 font-medium"
                      aria-sort={active ? (sort.direction === 'desc' ? 'descending' : 'ascending') : 'none'}
                    >
                      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggle(column.key)}>
                        {column.label}
                        {active && (sort.direction === 'desc' ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-2 pr-3">
                    <a href={testCaseHref(row.id)} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                      {row.name}
                    </a>
                    {row.tagIds.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {row.tagIds.map((id) => {
                          const tag = tagById.get(id);
                          return tag ? <TagBadge key={id} name={tag.name} color={tag.color} /> : null;
                        })}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <span className="flex flex-wrap gap-1">
                      {row.issues.map((issue) => (
                        <span
                          key={issue}
                          data-issue={issue}
                          className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', issueBadgeClass(issue))}
                        >
                          {ISSUE_LABELS[issue]}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{row.status}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{shortDay(row.createdAt)}</td>
                  <td className="py-2 whitespace-nowrap text-muted-foreground">{shortDay(row.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="py-2 text-sm text-muted-foreground">No test case matches “{filter}”.</p>}
          {hidden > 0 && (
            <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setExpanded(true)}>
              Show {hidden} more
            </Button>
          )}
        </div>
      )}
    </SectionCard>
  );
}
