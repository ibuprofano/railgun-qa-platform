'use client';

import { donutChart, type DonutPart } from '@railgun-qa/reporting';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface DonutChartProps {
  title: string;
  /** Shown as an info tooltip next to the title (PRD §6.12.4); needs a TooltipProvider above. */
  description?: string;
  parts: DonutPart[];
  emptyText: string;
  size?: number;
  className?: string;
  /** Lays out parts largest first, in the ring and the legend. */
  sortByCount?: boolean;
  /** Makes parts selectable (specs/dashboard-charts): legend entries become toggle buttons. */
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
}

/**
 * A donut of parts of a whole (specs/dashboard-charts): the total in the centre, each
 * part's count and percentage in the legend, zero parts hidden, an empty line at 0.
 * With `onSelect`, a part is selected by clicking its arc or its legend button.
 */
export function DonutChart({ title, description, parts, emptyText, size = 132, className, sortByCount, selectedKey = null, onSelect }: DonutChartProps) {
  const geometry = donutChart({ parts, size, sort: sortByCount ? 'count' : undefined });
  const summary =
    geometry.total === 0
      ? `${title}: ${emptyText}`
      : `${title}: ${geometry.total} in total; ${geometry.arcs.map((a) => `${a.label} ${a.count} (${a.pct}%)`).join(', ')}`;
  const dimmed = (key: string) => selectedKey !== null && selectedKey !== key;

  return (
    <figure aria-label={title} className={cn('flex flex-col gap-3 rounded-xl border bg-card p-4', className)}>
      <div className="flex items-center gap-1.5">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
        {description && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={description} className="text-muted-foreground hover:text-foreground">
                <Info className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{description}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
      {geometry.total === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
            {geometry.arcs.map((arc) => (
              <path
                key={arc.key}
                data-part={arc.key}
                d={arc.path}
                fill={arc.color}
                opacity={dimmed(arc.key) ? 0.35 : 1}
                stroke={selectedKey === arc.key ? 'var(--foreground)' : undefined}
                strokeWidth={selectedKey === arc.key ? 1.5 : undefined}
                className={onSelect ? 'cursor-pointer' : undefined}
                onClick={onSelect ? () => onSelect(arc.key) : undefined}
              />
            ))}
            <text x={geometry.cx} y={geometry.cy + 7} textAnchor="middle" className="fill-foreground text-xl font-semibold" data-testid="donut-total">
              {geometry.total}
            </text>
          </svg>
          <ul className="flex flex-col gap-1 text-sm" aria-label={`${title} legend`}>
            {geometry.arcs.map((arc) => {
              const content = (
                <>
                  <span aria-hidden className="size-2.5 rounded-full" style={{ background: arc.color }} />
                  <span>{arc.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {arc.count} ({arc.pct}%)
                  </span>
                </>
              );
              return (
                <li key={arc.key} className="flex items-center gap-2">
                  {onSelect ? (
                    <button
                      type="button"
                      aria-pressed={selectedKey === arc.key}
                      onClick={() => onSelect(arc.key)}
                      className={cn(
                        'flex items-center gap-2 rounded px-1 text-left hover:bg-muted aria-pressed:bg-muted aria-pressed:font-medium',
                        dimmed(arc.key) && 'opacity-60',
                      )}
                    >
                      {content}
                    </button>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </figure>
  );
}
