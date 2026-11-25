'use client';

import type { ComponentType, ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface StatTileProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  /** Null while loading. */
  value: ReactNode | null;
  subLabel: ReactNode;
  tooltip?: string;
  /** Value, icon and outline colour, for a tile that changes colour by status. */
  tone?: { text: string; ring: string };
}

/**
 * A stat tile (PRD §6.12.4): an icon, a short uppercase label, an info tooltip, a large
 * value and a one-line sub-label. Shared by every dashboard. Needs a TooltipProvider above.
 */
export function StatTile({ icon: Icon, label, value, subLabel, tooltip, tone }: StatTileProps) {
  return (
    <section
      aria-label={label}
      className={cn('flex flex-col gap-1.5 rounded-xl border bg-card p-3', tone && `ring-2 ${tone.ring}`)}
    >
      <div className="flex items-center gap-2">
        <span className={cn('flex size-6 items-center justify-center rounded-md bg-muted', tone?.text ?? 'text-muted-foreground')}>
          <Icon className="size-3.5" />
        </span>
        <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</span>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={tooltip} className="ml-auto text-muted-foreground hover:text-foreground">
                <Info className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>
      {value === null ? (
        <Skeleton className="h-6 w-12" aria-label="Loading" />
      ) : (
        <span className={cn('text-2xl font-semibold tabular-nums', tone?.text)}>{value}</span>
      )}
      <span className="text-xs text-muted-foreground">{subLabel}</span>
    </section>
  );
}
