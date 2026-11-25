import type { ReactNode } from 'react';
import type { TestCaseDashboard } from '../../lib/test-cases-api';
import type { TagColor } from '../../lib/tags-api';
import { failRateClass, SectionCard, unrankedFailingText } from '../dashboard/section-card';
import { TagBadge } from '../tags/tag-badge';
import { testCaseHref } from './dashboard-format';
import { cn } from '@/lib/utils';

interface RankedRow {
  key: string;
  name: ReactNode;
  /** Test case rows open in a new tab; tag rows aren't links. */
  href?: string;
  value: ReactNode;
}

/** A ranked list (PRD §6.12.4): rank, name (truncated), right-aligned value. */
function RankedList({ title, rows, emptyText, note }: { title: string; rows: RankedRow[]; emptyText: string; note?: string }) {
  return (
    <SectionCard title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{note ?? emptyText}</p>
      ) : (
        <ol aria-label={title} className="flex flex-col divide-y">
          {rows.map((row, index) => {
            const content = (
              <>
                <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate">{row.name}</span>
                <span className="shrink-0 text-right text-sm tabular-nums">{row.value}</span>
              </>
            );
            return (
              <li key={row.key}>
                {row.href ? (
                  <a href={row.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 py-1.5 hover:bg-muted/50">
                    {content}
                  </a>
                ) : (
                  <span className="flex items-center gap-2 py-1.5">{content}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {rows.length > 0 && note && <p className="text-xs text-muted-foreground">{note}</p>}
    </SectionCard>
  );
}

/** The four rankings in a 2 × 2 grid (PRD §6.2.4), top 10 each. */
export function Rankings({ rankings }: { rankings: TestCaseDashboard['rankings'] }) {
  return (
    <div data-testid="tc-dashboard-rankings" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <RankedList
        title="Most Run Test Cases"
        emptyText="No completed runs yet."
        rows={rankings.mostRun.map((r) => ({ key: r.id, name: r.name, href: testCaseHref(r.id), value: r.completed }))}
      />
      <RankedList
        title="Top Failing Test Cases"
        emptyText="No failing test cases — nice!"
        note={rankings.failingBelowMinimum > 0 ? unrankedFailingText(rankings.failingBelowMinimum, rankings.topFailing.length > 0) : undefined}
        rows={rankings.topFailing.map((r) => ({
          key: r.id,
          name: r.name,
          href: testCaseHref(r.id),
          value: (
            <>
              <span className={cn('font-semibold', failRateClass(r.failRatePct))}>{r.failRatePct}%</span>{' '}
              <span className="text-xs text-muted-foreground">
                ({r.failed}/{r.completed})
              </span>
            </>
          ),
        }))}
      />
      <RankedList
        title="Top Flaky Test Cases"
        emptyText="No flaky runs."
        rows={rankings.topFlaky.map((r) => ({
          key: r.id,
          name: r.name,
          href: testCaseHref(r.id),
          value: (
            <>
              <span className="font-semibold text-review">{r.flakyPct}%</span>{' '}
              <span className="text-xs text-muted-foreground">
                ({r.flaky}/{r.completed})
              </span>
            </>
          ),
        }))}
      />
      <RankedList
        title="Top Tags"
        emptyText="No tags on test cases yet."
        rows={rankings.topTags.map((t) => ({
          key: t.tagId,
          name: <TagBadge name={t.name} color={t.color as TagColor} />,
          value: t.count,
        }))}
      />
    </div>
  );
}
