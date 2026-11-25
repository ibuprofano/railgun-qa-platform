'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { lineChart, nearestIndex, type LineSeries } from '@railgun-qa/reporting';
import { Info } from 'lucide-react';
import { DEFAULT_RANGE, type Range, RangeSelect } from './range-select';
import { formatValue, shortDate } from './chart-format';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface LineChartProps {
  title: string;
  /** Shown as an info tooltip next to the title (PRD §6.12.4). */
  description?: string;
  /** Every available day, oldest first; the chart shows the last `range` of them. */
  dates: string[];
  series: LineSeries[];
  kind: 'percent' | 'count';
  /** Shown instead of the chart when every visible value in the range is null. */
  emptyText?: string;
  height?: number;
  className?: string;
  /** The range, when the parent keeps it (e.g. for an export); otherwise the chart keeps its own. */
  range?: Range;
  onRangeChange?: (range: Range) => void;
}

/** Fallback width before (or without) measuring, as in jsdom (design.md decision 6). */
const FALLBACK_WIDTH = 640;

/**
 * A trend chart (specs/dashboard-charts): its own 7/15/30/90-day range, one point per
 * day, the nearest day's values on hover or with ←/→, and legend toggles when it has
 * several series. Geometry comes from @railgun-qa/reporting (ADR 0023).
 */
export function LineChart({
  title,
  description,
  dates,
  series,
  kind,
  emptyText,
  height = 200,
  className,
  range: controlledRange,
  onRangeChange,
}: LineChartProps) {
  const [ownRange, setOwnRange] = useState<Range>(DEFAULT_RANGE);
  const range = controlledRange ?? ownRange;
  const setRange = (next: Range) => {
    setOwnRange(next);
    onRangeChange?.(next);
  };
  const [hidden, setHidden] = useState<string[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);

  useEffect(() => {
    const element = container.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const shownDates = useMemo(() => dates.slice(-range), [dates, range]);
  const shownSeries = useMemo(
    () => series.map((s) => ({ ...s, values: s.values.slice(-range) })),
    [series, range],
  );
  const geometry = useMemo(
    () => lineChart({ dates: shownDates, series: shownSeries, width, height, kind, hidden }),
    [shownDates, shownSeries, width, height, kind, hidden],
  );
  const visible = shownSeries.filter((s) => !hidden.includes(s.key));
  const empty = emptyText !== undefined && visible.every((s) => s.values.every((v) => v === null));
  const summary = summarize(title, kind, range, visible);

  const toggle = (key: string) => setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]));
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / (box.width || width)) * width;
    setActive(nearestIndex(geometry, x));
  };
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const last = shownDates.length - 1;
    const current = active ?? last;
    const next =
      event.key === 'ArrowLeft' ? Math.max(0, current - 1)
      : event.key === 'ArrowRight' ? Math.min(last, current + 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    if (next !== null) {
      event.preventDefault();
      setActive(next);
    }
  };

  return (
    <figure aria-label={title} className={cn('flex flex-col gap-2 rounded-xl border bg-card p-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        <RangeSelect value={range} onChange={setRange} label={`${title} range`} />
      </div>
      <figcaption className="sr-only">{summary}</figcaption>
      {series.length > 1 && (
        <div className="flex flex-wrap gap-2" aria-label={`${title} legend`}>
          {series.map((s) => {
            const off = hidden.includes(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={!off}
                onClick={() => toggle(s.key)}
                className={cn('flex items-center gap-1.5 text-xs', off && 'text-muted-foreground line-through')}
              >
                <span aria-hidden className="size-2 rounded-full" style={{ background: off ? 'transparent' : s.color, border: `1px solid ${s.color}` }} />
                {s.label}
              </button>
            );
          })}
        </div>
      )}
      <div ref={container} className="relative">
        {empty ? (
          <p className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
            {emptyText}
          </p>
        ) : (
          <svg
            width="100%"
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            tabIndex={0}
            aria-label={`${title}: use the arrow keys to read each day`}
            className="overflow-visible outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onPointerMove={onPointerMove}
            onPointerLeave={() => setActive(null)}
            onKeyDown={onKeyDown}
            onBlur={() => setActive(null)}
          >
            {geometry.yTicks.map((tick) => (
              <g key={tick.value}>
                <line x1={geometry.plot.left} x2={geometry.plot.right} y1={tick.y} y2={tick.y} className="stroke-border" />
                <text x={geometry.plot.left - 6} y={tick.y + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
                  {formatValue(kind, tick.value)}
                </text>
              </g>
            ))}
            {geometry.xTicks.map((tick) => (
              <text key={tick.index} x={tick.x} y={geometry.plot.bottom + 16} textAnchor={tick.anchor} className="fill-muted-foreground text-[10px]">
                {shortDate(tick.label)}
              </text>
            ))}
            {active !== null && (
              <line x1={geometry.xs[active]} x2={geometry.xs[active]} y1={geometry.plot.top} y2={geometry.plot.bottom} className="stroke-muted-foreground/50" />
            )}
            {geometry.series.map((s) => (
              <g key={s.key} data-series={s.key}>
                <path d={s.path} fill="none" stroke={s.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
                {s.points
                  .filter((p) => p.index === active || s.points.length === 1)
                  .map((p) => (
                    <circle key={p.index} cx={p.x} cy={p.y} r={3} fill={s.color} />
                  ))}
              </g>
            ))}
          </svg>
        )}
        {!empty && active !== null && (
          <div role="status" aria-live="polite" className="pointer-events-none absolute top-0 right-0 rounded-md border bg-popover px-2 py-1 text-xs shadow-sm">
            <div className="font-medium">{shortDate(shownDates[active])}</div>
            {visible.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5">
                <span aria-hidden className="size-2 rounded-full" style={{ background: s.color }} />
                {s.label} {formatValue(kind, s.values[active])}
              </div>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}

/** One sentence of what the chart shows (specs/dashboard-charts): the latest value, or totals. */
function summarize(title: string, kind: 'percent' | 'count', range: number, series: LineSeries[]): string {
  const span = `over the last ${range} days`;
  if (series.length === 0) return `${title} ${span}; every series is hidden.`;
  if (kind === 'percent') {
    const parts = series.map((s) => {
      const latest = [...s.values].reverse().find((v) => v !== null) ?? null;
      return series.length === 1 ? `${formatValue(kind, latest)} today` : `${s.label} ${formatValue(kind, latest)} today`;
    });
    return `${title} ${span}; ${parts.join(', ')}`;
  }
  const totals = series.map((s) => `${s.label} ${s.values.reduce<number>((sum, v) => sum + (v ?? 0), 0)}`);
  return `${title} ${span}: ${totals.join(' and ')}`;
}
