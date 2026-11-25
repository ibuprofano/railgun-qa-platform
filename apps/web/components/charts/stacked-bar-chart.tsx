'use client';

import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { nearestBar, stackedBarChart, type BarSeries } from '@railgun-qa/reporting';
import { Info } from 'lucide-react';
import { DEFAULT_RANGE, type Range, RangeSelect } from './range-select';
import { shortDate } from './chart-format';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** One day's segment of one series, as selected. */
export interface BarSelection {
  date: string;
  key: string;
}

export interface StackedBarChartProps {
  title: string;
  /** Shown as an info tooltip next to the title (PRD §6.12.4). */
  description?: string;
  /** Every available day, oldest first; the chart shows the last `range` of them. */
  dates: string[];
  /** Stacked bottom to top in this order. */
  series: BarSeries[];
  /** Shown instead of the bars when no visible series has a count in the range. */
  emptyText?: string;
  height?: number;
  className?: string;
  range?: Range;
  onRangeChange?: (range: Range) => void;
  /** Makes segments selectable (specs/dashboard-charts, "Chart parts can be selected"). */
  selected?: BarSelection | null;
  onSelect?: (selection: BarSelection) => void;
}

const FALLBACK_WIDTH = 640;

/**
 * Daily stacked bars (specs/dashboard-charts): its own range, legend toggles, the nearest
 * day's counts on hover or with ←/→/Home/End, and, with `onSelect`, selectable segments,
 * by pointer or through the focused day's readout. Geometry from @railgun-qa/reporting.
 */
export function StackedBarChart({
  title,
  description,
  dates,
  series,
  emptyText,
  height = 200,
  className,
  range: controlledRange,
  onRangeChange,
  selected = null,
  onSelect,
}: StackedBarChartProps) {
  const [ownRange, setOwnRange] = useState<Range>(DEFAULT_RANGE);
  const range = controlledRange ?? ownRange;
  const setRange = (next: Range) => {
    setOwnRange(next);
    onRangeChange?.(next);
  };
  const [hidden, setHidden] = useState<string[]>([]);
  // Hover follows the pointer; `focused` is the keyboard's day and survives moving focus into the readout.
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
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
  const shownSeries = useMemo(() => series.map((s) => ({ ...s, values: s.values.slice(-range) })), [series, range]);
  const geometry = useMemo(
    () => stackedBarChart({ dates: shownDates, series: shownSeries, width, height, hidden }),
    [shownDates, shownSeries, width, height, hidden],
  );
  const visible = shownSeries.filter((s) => !hidden.includes(s.key));
  const totals = visible.map((s) => ({ label: s.label, total: s.values.reduce((sum, v) => sum + v, 0) }));
  const empty = emptyText !== undefined && totals.every((t) => t.total === 0);
  const summary =
    visible.length === 0
      ? `${title} over the last ${range} days; every series is hidden.`
      : `${title} over the last ${range} days: ${totals.map((t) => `${t.label} ${t.total}`).join(', ')}`;
  const active = hover ?? focused;

  const toggle = (key: string) => setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]));
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / (box.width || width)) * width;
    setHover(nearestBar(geometry, x));
  };
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const last = shownDates.length - 1;
    const current = focused ?? last;
    const next =
      event.key === 'ArrowLeft' ? Math.max(0, current - 1)
      : event.key === 'ArrowRight' ? Math.min(last, current + 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    if (next !== null) {
      event.preventDefault();
      setFocused(next);
    }
  };
  // Leaving the whole figure ends the keyboard reading; moving into the readout doesn't.
  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(null);
  };
  const isSelected = (date: string, key: string) => selected !== null && selected.date === date && selected.key === key;

  return (
    <figure aria-label={title} onBlur={onBlur} className={cn('flex flex-col gap-2 rounded-xl border bg-card p-4', className)}>
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
                <span aria-hidden className="size-2 rounded-sm" style={{ background: off ? 'transparent' : s.color, border: `1px solid ${s.color}` }} />
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
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKeyDown}
          >
            {geometry.yTicks.map((tick) => (
              <g key={tick.value}>
                <line x1={geometry.plot.left} x2={geometry.plot.right} y1={tick.y} y2={tick.y} className="stroke-border" />
                <text x={geometry.plot.left - 6} y={tick.y + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
                  {tick.value}
                </text>
              </g>
            ))}
            {geometry.xTicks.map((tick) => (
              <text key={tick.index} x={tick.x} y={geometry.plot.bottom + 16} textAnchor={tick.anchor} className="fill-muted-foreground text-[10px]">
                {shortDate(tick.label)}
              </text>
            ))}
            {active !== null && (
              <rect
                x={geometry.bars[active].x - 2}
                width={geometry.bars[active].width + 4}
                y={geometry.plot.top}
                height={geometry.plot.bottom - geometry.plot.top}
                className="fill-muted/60"
              />
            )}
            {geometry.bars.map((bar) => (
              <g key={bar.date} data-date={bar.date}>
                {bar.segments.map((segment) => {
                  const on = isSelected(bar.date, segment.key);
                  return (
                    <rect
                      key={segment.key}
                      data-segment={`${bar.date}:${segment.key}`}
                      x={bar.x}
                      y={segment.y}
                      width={bar.width}
                      height={segment.height}
                      fill={segment.color}
                      opacity={selected !== null && !on ? 0.35 : 1}
                      stroke={on ? 'var(--foreground)' : undefined}
                      strokeWidth={on ? 1.5 : undefined}
                      vectorEffect="non-scaling-stroke"
                      className={onSelect ? 'cursor-pointer' : undefined}
                      onClick={onSelect ? () => onSelect({ date: bar.date, key: segment.key }) : undefined}
                    />
                  );
                })}
              </g>
            ))}
          </svg>
        )}
      </div>
      {!empty && active !== null && (
        <div role="group" aria-label={`${shortDate(shownDates[active])} counts`} aria-live="polite" className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-medium">{shortDate(shownDates[active])}</span>
          {visible.map((s) => {
            const count = s.values[active];
            const content = (
              <>
                <span aria-hidden className="size-2 rounded-sm" style={{ background: s.color }} />
                {s.label} {count}
              </>
            );
            return onSelect ? (
              <button
                key={s.key}
                type="button"
                aria-pressed={isSelected(shownDates[active], s.key)}
                disabled={count === 0}
                onClick={() => onSelect({ date: shownDates[active], key: s.key })}
                className="flex items-center gap-1.5 rounded px-1 hover:bg-muted disabled:opacity-50 aria-pressed:bg-muted aria-pressed:font-medium"
              >
                {content}
              </button>
            ) : (
              <span key={s.key} className="flex items-center gap-1.5">
                {content}
              </span>
            );
          })}
        </div>
      )}
    </figure>
  );
}
