'use client';

import { Button } from '@/components/ui/button';

/** The trend ranges of PRD §6.12.2, in days. */
export const RANGES = [7, 15, 30, 90] as const;
export type Range = (typeof RANGES)[number];
export const DEFAULT_RANGE: Range = 30;

/** A row of range buttons, the same pattern as the Activity filter pills (design.md decision 6). */
export function RangeSelect({ value, onChange, label }: { value: Range; onChange: (range: Range) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {RANGES.map((range) => (
        <Button
          key={range}
          type="button"
          role="radio"
          aria-checked={range === value}
          size="sm"
          variant={range === value ? 'secondary' : 'ghost'}
          className="h-6 px-2 text-xs"
          onClick={() => onChange(range)}
        >
          {range}d
        </Button>
      ))}
    </div>
  );
}
