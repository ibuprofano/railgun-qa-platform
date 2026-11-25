'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { wordCloud, type WordSpec } from '@railgun-qa/reporting';
import { cn } from '@/lib/utils';

/** Fallback colours for words without one: the tag palette, following the theme. */
const FALLBACK_PALETTE = ['gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet'].map((c) => `var(--tag-${c})`);
/** Fallback width before (or without) measuring, as in jsdom. */
const FALLBACK_WIDTH = 320;

export interface WordCloudProps {
  title: string;
  words: WordSpec[];
  emptyText: string;
  className?: string;
}

/**
 * A word cloud (specs/dashboard-charts): words sized by √count, large and small
 * interleaved, each in its own colour; "name: count" on hover or focus. Geometry comes
 * from @railgun-qa/reporting (ADR 0023), so the PDF draws the same cloud.
 */
export function WordCloud({ title, words, emptyText, className }: WordCloudProps) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const element = container.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => wordCloud({ words, width, palette: FALLBACK_PALETTE }), [words, width]);
  const summary =
    words.length === 0
      ? `${title}: ${emptyText}`
      : `${title}: ${[...words]
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
          .map((w) => `${w.label} ${w.count}`)
          .join(', ')}`;
  const activeWord = geometry.words.find((w) => w.key === active) ?? null;

  return (
    <figure aria-label={title} className={cn('flex flex-col gap-2', className)}>
      <figcaption className="sr-only">{summary}</figcaption>
      {words.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div ref={container} className="flex flex-col gap-1">
          <p className="h-5 text-xs text-muted-foreground" aria-live="polite" data-testid="word-cloud-readout">
            {activeWord ? `${activeWord.label}: ${activeWord.count}` : ''}
          </p>
          <svg width="100%" height={geometry.height} viewBox={`0 0 ${geometry.width} ${geometry.height}`} aria-hidden={false} role="group">
            {geometry.words.map((word) => (
              <text
                key={word.key}
                x={word.x}
                y={word.y}
                textAnchor="middle"
                fontSize={word.size}
                fill={word.color}
                tabIndex={0}
                aria-label={`${word.label}: ${word.count}`}
                data-word={word.key}
                className={cn('cursor-default font-semibold outline-none focus-visible:underline', active && active !== word.key && 'opacity-50')}
                onPointerEnter={() => setActive(word.key)}
                onPointerLeave={() => setActive((current) => (current === word.key ? null : current))}
                onFocus={() => setActive(word.key)}
                onBlur={() => setActive((current) => (current === word.key ? null : current))}
              >
                {word.label}
              </text>
            ))}
          </svg>
        </div>
      )}
    </figure>
  );
}
