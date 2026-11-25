'use client';

import type { NeedsAttentionRow } from '@railgun-qa/reporting';
import { Info } from 'lucide-react';
import { BugStatusBadge, SeverityDot } from './bug-badges';
import { SectionCard } from '../dashboard/section-card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export const NEEDS_ATTENTION_HELP =
  'Idle: an open bug with no update for 30 days or more. Unattended: a Critical or High bug still in Open status.';

/**
 * The Bugs dashboard's Needs Attention table (PRD §6.4.4; specs/bugs-screen): open bugs
 * that are Idle or Unattended, in the order the package sorts them. A row opens its bug.
 * Not rendered without rows. Needs a TooltipProvider above.
 */
export function BugNeedsAttention({ rows, onOpenBug }: { rows: NeedsAttentionRow[]; onOpenBug: (id: string) => void }) {
  if (rows.length === 0) return null;
  return (
    <SectionCard
      title={
        <span className="flex items-center gap-1.5">
          Needs Attention
          <span className="rounded-full bg-muted px-1.5 text-foreground" data-testid="needs-attention-count">
            {rows.length}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={NEEDS_ATTENTION_HELP} className="text-muted-foreground hover:text-foreground">
                <Info className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs normal-case">{NEEDS_ATTENTION_HELP}</TooltipContent>
          </Tooltip>
        </span>
      }
    >
      <table className="w-full table-fixed text-sm" aria-label="Needs Attention">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="w-1/2 py-1 font-medium">Bug</th>
            <th className="py-1 font-medium">Issue</th>
            <th className="py-1 font-medium">Severity</th>
            <th className="py-1 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ bug, idle, unattended }) => (
            <tr key={bug.id} className="border-t hover:bg-muted/50" data-testid="needs-attention-row">
              <td className="py-1.5 pr-2">
                <button
                  type="button"
                  onClick={() => onOpenBug(bug.id)}
                  title={bug.title}
                  className="block w-full truncate text-left font-medium hover:underline"
                >
                  {bug.title}
                </button>
              </td>
              <td className="py-1.5">
                <span className="flex flex-wrap gap-1">
                  {unattended && <Badge className="border-fail/30 bg-fail/15 text-fail">Unattended</Badge>}
                  {idle && <Badge className="border-review/30 bg-review/15 text-review">Idle</Badge>}
                </span>
              </td>
              <td className="py-1.5">
                <SeverityDot severity={bug.severity} />
              </td>
              <td className="py-1.5">
                <BugStatusBadge status={bug.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  );
}
