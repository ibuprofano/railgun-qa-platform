import { pct } from '../health';

export interface DonutPart {
  key: string;
  label: string;
  color: string;
  count: number;
}

export interface DonutArc {
  key: string;
  label: string;
  color: string;
  count: number;
  /** Whole percentage of the total (PRD §6.12.4). */
  pct: number;
  startAngle: number;
  endAngle: number;
  path: string;
}

export interface DonutGeometry {
  size: number;
  cx: number;
  cy: number;
  outer: number;
  inner: number;
  total: number;
  /** Parts with a count of 0 are left out. */
  arcs: DonutArc[];
}

const fmt = (n: number) => Math.round(n * 100) / 100;
const point = (cx: number, cy: number, r: number, angle: number) =>
  `${fmt(cx + r * Math.sin(angle))} ${fmt(cy - r * Math.cos(angle))}`;

/** An annular sector from `a0` to `a1` (radians, clockwise from 12 o'clock). */
function ring(cx: number, cy: number, outer: number, inner: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return [
    `M${point(cx, cy, outer, a0)}`,
    `A${outer} ${outer} 0 ${large} 1 ${point(cx, cy, outer, a1)}`,
    `L${point(cx, cy, inner, a1)}`,
    `A${inner} ${inner} 0 ${large} 0 ${point(cx, cy, inner, a0)}`,
    'Z',
  ].join(' ');
}

/** Lays out a donut of parts of a whole (PRD §6.12.4). */
/** With `sort: 'count'`, parts are laid out largest first; equal counts keep their given order. */
export function donutChart(spec: { parts: DonutPart[]; size: number; thickness?: number; sort?: 'count' }): DonutGeometry {
  const size = spec.size;
  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2 - 1;
  const inner = Math.max(0, outer - (spec.thickness ?? size / 6));
  const given = spec.parts.filter((part) => part.count > 0);
  // Array.prototype.sort is stable, so ties keep their given order.
  const parts = spec.sort === 'count' ? [...given].sort((a, b) => b.count - a.count) : given;
  const total = parts.reduce((sum, part) => sum + part.count, 0);

  let angle = 0;
  const arcs = parts.map((part) => {
    const span = (part.count / total) * 2 * Math.PI;
    const startAngle = angle;
    const endAngle = angle + span;
    angle = endAngle;
    // A single full part is drawn as two halves: one SVG arc can't close a full circle.
    const path =
      parts.length === 1
        ? `${ring(cx, cy, outer, inner, 0, Math.PI)} ${ring(cx, cy, outer, inner, Math.PI, 2 * Math.PI)}`
        : ring(cx, cy, outer, inner, startAngle, endAngle);
    return { ...part, pct: pct(part.count, total), startAngle, endAngle, path };
  });
  return { size, cx, cy, outer, inner, total, arcs };
}
