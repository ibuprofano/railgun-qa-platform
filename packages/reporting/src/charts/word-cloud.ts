/**
 * Word cloud geometry (PRD §6.12.4; specs/dashboard-charts; bugs-dashboard design.md
 * decision 4): square-root sizing, large and small words interleaved, a stable fallback
 * colour, and centred rows. No DOM, so widths are estimated; the screen and the PDF draw
 * the same cloud from this.
 */
import { LATIN_WIDTH_EM, labelWidthEm } from './text';

export { charWidthEm, labelWidthEm } from './text';

export interface WordSpec {
  key: string;
  label: string;
  count: number;
  /** The item's own colour; without one, a palette colour chosen from the key. */
  color?: string;
}

export interface WordCloudSpec {
  words: readonly WordSpec[];
  width: number;
  minSize?: number;
  maxSize?: number;
  /** Fallback colours for words without one. */
  palette: readonly string[];
}

export interface PlacedWord {
  key: string;
  label: string;
  count: number;
  /** Font size. */
  size: number;
  color: string;
  /** Text anchor: the word's centre and its baseline. */
  x: number;
  y: number;
  /** The estimated width the layout reserved. */
  width: number;
}

export interface WordCloudGeometry {
  width: number;
  height: number;
  words: PlacedWord[];
}

/** Average glyph width in em for the sans-serif used on screen and in print. */
export const WORD_WIDTH_EM = LATIN_WIDTH_EM;
const GAP_EM = 0.5;
const LINE_HEIGHT = 1.3;

/** FNV-1a, so the same key always picks the same fallback colour. */
export function stableHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export function fallbackColor(key: string, palette: readonly string[]): string {
  return palette[stableHash(key) % palette.length];
}

/** Between minSize and maxSize by √count; every word the middle size when all counts are equal. */
export function wordSizes(counts: readonly number[], minSize = 12, maxSize = 32): number[] {
  if (counts.length === 0) return [];
  const roots = counts.map((c) => Math.sqrt(Math.max(0, c)));
  const lo = Math.min(...roots);
  const hi = Math.max(...roots);
  if (hi === lo) return counts.map(() => (minSize + maxSize) / 2);
  return roots.map((r) => minSize + ((r - lo) / (hi - lo)) * (maxSize - minSize));
}

/** Largest, smallest, second largest, second smallest…; ties by label. */
export function interleave<T extends { label: string; count: number }>(words: readonly T[]): T[] {
  const sorted = [...words].sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  const order: T[] = [];
  let front = 0;
  let back = sorted.length - 1;
  while (front <= back) {
    order.push(sorted[front++]);
    if (front <= back) order.push(sorted[back--]);
  }
  return order;
}

export const estimateWordWidth = (label: string, size: number) => labelWidthEm(label) * size;

export function wordCloud({ words, width, minSize = 12, maxSize = 32, palette }: WordCloudSpec): WordCloudGeometry {
  const sizes = wordSizes(
    words.map((w) => w.count),
    minSize,
    maxSize,
  );
  // A word wider than the cloud on its own is shrunk to fit, so no row ever overflows.
  const fit = (label: string, size: number) => Math.min(size, Math.floor((width / Math.max(0.1, labelWidthEm(label))) * 10) / 10);
  const sized = words.map((w, i) => ({ ...w, size: fit(w.label, Math.round(sizes[i] * 10) / 10) }));
  const ordered = interleave(sized);

  // Flow into rows, then centre each row and set its baseline.
  const rows: { items: typeof ordered; width: number }[] = [];
  for (const word of ordered) {
    const w = estimateWordWidth(word.label, word.size);
    const row = rows.at(-1);
    const gap = row && row.items.length > 0 ? word.size * GAP_EM : 0;
    if (row && row.items.length > 0 && row.width + gap + w <= width) {
      row.items.push(word);
      row.width += gap + w;
    } else {
      rows.push({ items: [word], width: w });
    }
  }

  const placed: PlacedWord[] = [];
  let top = 0;
  for (const row of rows) {
    const tallest = Math.max(...row.items.map((w) => w.size));
    const baseline = top + tallest;
    let x = (width - row.width) / 2;
    row.items.forEach((word, i) => {
      if (i > 0) x += word.size * GAP_EM;
      const w = estimateWordWidth(word.label, word.size);
      placed.push({
        key: word.key,
        label: word.label,
        count: word.count,
        size: word.size,
        color: word.color ?? fallbackColor(word.key, palette),
        x: Math.round((x + w / 2) * 10) / 10,
        y: Math.round(baseline * 10) / 10,
        width: Math.round(w * 10) / 10,
      });
      x += w;
    });
    top += tallest * LINE_HEIGHT;
  }

  return { width, height: Math.ceil(top), words: placed };
}

/** Hex colours of ADR 0016's tag palette, for print. */
export const TAG_PRINT_COLORS = {
  gray: '#64748b',
  red: '#dc2626',
  orange: '#ea580c',
  amber: '#d97706',
  green: '#16a34a',
  teal: '#0d9488',
  blue: '#2563eb',
  violet: '#7c3aed',
} as const;
