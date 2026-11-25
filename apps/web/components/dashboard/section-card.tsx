import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** A section card (PRD §6.12.4): a titled panel holding one chart, list or table. */
export function SectionCard({
  title,
  children,
  action,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={typeof title === 'string' ? title : undefined}
      className={cn('flex flex-col gap-3 rounded-xl border bg-card p-4', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A card's loading placeholder: rows shaped like a list. */
export function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

/** Fail rate emphasis (PRD §6.12.3): red at 75% or more, amber at 40% or more. */
export function failRateClass(pct: number): string {
  if (pct >= 75) return 'text-fail';
  if (pct >= 40) return 'text-review';
  return 'text-muted-foreground';
}

/** Failing test cases below Top Failing's 3-run minimum: shared with the PDF (test-cases-dashboard-report). */
export { unrankedFailingText } from '@railgun-qa/reporting';

