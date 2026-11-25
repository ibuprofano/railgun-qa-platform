/**
 * Text helpers shared by the chart geometry (chart-writer-fixes design.md decisions 1 and
 * 3): width estimates without a DOM, and the short day label used in print.
 */

/** The Latin average glyph width in em, for the sans-serif used on screen and in print. */
export const LATIN_WIDTH_EM = 0.6;

/** East Asian wide and full-width ranges (chart-writer-fixes design.md decision 1). */
const WIDE_RANGES: [number, number][] = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x2e80, 0xa4cf], // CJK radicals … Yi, kana and CJK ideographs included
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xfe30, 0xfe4f], // CJK compatibility forms
  [0xff00, 0xff60], // full-width forms
  [0xffe0, 0xffe6], // full-width signs
];

/** Estimated advance of one character in em: 1 for East Asian wide characters, else LATIN_WIDTH_EM. */
export function charWidthEm(codePoint: number): number {
  if (codePoint >= 0x20000) return 1;
  return WIDE_RANGES.some(([lo, hi]) => codePoint >= lo && codePoint <= hi) ? 1 : LATIN_WIDTH_EM;
}

/** A label's estimated width in em, by code point (a surrogate pair counts once). */
export function labelWidthEm(label: string): number {
  let em = 0;
  for (const ch of label) em += charWidthEm(ch.codePointAt(0)!);
  return em;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "24 Nov" for a "YYYY-MM-DD" day, read as a calendar date with no time zone. */
export function shortDayLabel(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
