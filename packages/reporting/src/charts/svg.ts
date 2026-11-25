import type { DonutGeometry } from './donut';
import type { LineGeometry } from './line';
import type { StackedBarGeometry } from './stacked-bar';
import type { WordCloudGeometry } from './word-cloud';
import { shortDayLabel } from './text';

/** Turns a tick's ISO day into its printed label; reports may pass a locale-aware one. */
export type DateFormatter = (day: string) => string;

/**
 * Static SVG for reports (ADR 0006, ADR 0023 decision 2), within the tested subset:
 * svg, g, line, path, rect, text and circle; flat fills and opacity; no gradients, filters,
 * masks, patterns or foreignObject.
 */
export interface SvgPalette {
  text: string;
  grid: string;
  fontFamily: string;
}

export const PRINT_PALETTE: SvgPalette = { text: '#334155', grid: '#e2e8f0', fontFamily: 'Helvetica, Arial, sans-serif' };

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function lineChartSvg(
  geometry: LineGeometry,
  palette: SvgPalette = PRINT_PALETTE,
  title = '',
  formatDate: DateFormatter = shortDayLabel,
): string {
  const { plot } = geometry;
  const parts: string[] = [];
  for (const tick of geometry.yTicks) {
    parts.push(`<line x1="${plot.left}" y1="${tick.y}" x2="${plot.right}" y2="${tick.y}" stroke="${palette.grid}" stroke-width="1"/>`);
    parts.push(
      `<text x="${plot.left - 6}" y="${tick.y + 3}" text-anchor="end" font-size="10" fill="${palette.text}">${tick.value}</text>`,
    );
  }
  for (const tick of geometry.xTicks) {
    parts.push(
      `<text x="${tick.x}" y="${plot.bottom + 16}" text-anchor="${tick.anchor}" font-size="10" fill="${palette.text}">${escape(formatDate(tick.label))}</text>`,
    );
  }
  for (const series of geometry.series) {
    if (series.path) {
      parts.push(`<path d="${series.path}" fill="none" stroke="${escape(series.color)}" stroke-width="2"/>`);
    }
    if (series.points.length === 1) {
      const [p] = series.points;
      parts.push(`<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="${escape(series.color)}"/>`);
    }
  }
  return svgDocument(geometry.width, geometry.height, palette, title, parts);
}

export function donutChartSvg(geometry: DonutGeometry, palette: SvgPalette = PRINT_PALETTE, title = ''): string {
  const parts = geometry.arcs.map((arc) => `<path d="${arc.path}" fill="${escape(arc.color)}"/>`);
  parts.push(
    `<text x="${geometry.cx}" y="${geometry.cy + 6}" text-anchor="middle" font-size="18" fill="${palette.text}">${geometry.total}</text>`,
  );
  return svgDocument(geometry.size, geometry.size, palette, title, parts);
}

export function stackedBarChartSvg(
  geometry: StackedBarGeometry,
  palette: SvgPalette = PRINT_PALETTE,
  title = '',
  formatDate: DateFormatter = shortDayLabel,
): string {
  const { plot } = geometry;
  const parts: string[] = [];
  for (const tick of geometry.yTicks) {
    parts.push(`<line x1="${plot.left}" y1="${tick.y}" x2="${plot.right}" y2="${tick.y}" stroke="${palette.grid}" stroke-width="1"/>`);
    parts.push(
      `<text x="${plot.left - 6}" y="${tick.y + 3}" text-anchor="end" font-size="10" fill="${palette.text}">${tick.value}</text>`,
    );
  }
  for (const tick of geometry.xTicks) {
    parts.push(
      `<text x="${tick.x}" y="${plot.bottom + 16}" text-anchor="${tick.anchor}" font-size="10" fill="${palette.text}">${escape(formatDate(tick.label))}</text>`,
    );
  }
  for (const bar of geometry.bars) {
    for (const segment of bar.segments) {
      parts.push(
        `<rect x="${bar.x}" y="${segment.y}" width="${bar.width}" height="${segment.height}" fill="${escape(segment.color)}"/>`,
      );
    }
  }
  return svgDocument(geometry.width, geometry.height, palette, title, parts);
}

/** Word clouds are text only. */
export function wordCloudSvg(geometry: WordCloudGeometry, palette: SvgPalette = PRINT_PALETTE, title = ''): string {
  const parts = geometry.words.map(
    (word) =>
      `<text x="${word.x}" y="${word.y}" text-anchor="middle" font-size="${word.size}" fill="${escape(word.color)}">${escape(word.label)}</text>`,
  );
  return svgDocument(geometry.width, Math.max(1, geometry.height), palette, title, parts);
}

function svgDocument(width: number, height: number, palette: SvgPalette, title: string, parts: string[]): string {
  const label = title ? ` aria-label="${escape(title)}"` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"` +
    ` font-family="${escape(palette.fontFamily)}" role="img"${label}><g>${parts.join('')}</g></svg>`
  );
}
