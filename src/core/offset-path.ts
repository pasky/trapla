import type { Element, PointOnAlignment } from './horizontal';

/** Exact built plan geometry, not a second PI control polygon. Units: metres and radians. */
export interface CurvePath { elements: readonly Element[]; length: number }
export interface StationSpan { spineStart: number; spineEnd: number; childStart: number; childEnd: number }
export interface OffsetPath {
  path: CurvePath;
  /** Positive offset is left of the spine, irrespective of the child's travel direction. */
  offset: number;
  direction: 1 | -1;
  correspondence: readonly StationSpan[];
}

// Numerical tolerances, not engineering clearances. Local game coordinates are metre-scale.
const POSITION_EPS = 1e-6;
const TANGENT_EPS = 1e-8;

function elementPoint(e: Element, u: number): PointOnAlignment {
  if (e.kind === 'line') return { x: e.x0 + e.dx * u, y: e.y0 + e.dy * u, tx: e.dx, ty: e.dy, curvature: 0 };
  const a = e.a0 + e.dir * u / e.r;
  return { x: e.cx + e.r * Math.cos(a), y: e.cy + e.r * Math.sin(a), tx: -e.dir * Math.sin(a), ty: e.dir * Math.cos(a), curvature: e.dir / e.r };
}

/** Reject malformed paths and corners: a discontinuous normal has no continuous exact offset. */
export function assertCurvePath(path: CurvePath): void {
  if (!Number.isFinite(path.length) || path.length <= 0 || !path.elements.length) throw new Error('Empty or invalid curve path');
  let s = 0, previous: PointOnAlignment | undefined;
  for (const e of path.elements) {
    if (!Object.values(e).every(v => typeof v !== 'number' || Number.isFinite(v)) || !(e.len > 0) || Math.abs(e.s0 - s) > POSITION_EPS) throw new Error('Invalid curve element or station');
    if (e.kind === 'line' ? Math.abs(Math.hypot(e.dx, e.dy) - 1) > TANGENT_EPS : !(e.r > 0) || (e.dir !== 1 && e.dir !== -1) || e.len / e.r >= 2 * Math.PI) throw new Error('Invalid curve tangent, radius or sweep');
    const start = elementPoint(e, 0);
    if (previous && (Math.hypot(start.x - previous.x, start.y - previous.y) > POSITION_EPS || Math.hypot(start.tx - previous.tx, start.ty - previous.ty) > TANGENT_EPS)) throw new Error('Curve path is not position-and-tangent continuous');
    previous = elementPoint(e, e.len);
    s += e.len;
  }
  if (Math.abs(s - path.length) > POSITION_EPS) throw new Error('Curve path length disagrees with elements');
}

/** Binary-search exact arclength evaluation; no PI approximation and no fabricated Alignment metadata. */
export function curvePointAt(path: CurvePath, station: number): PointOnAlignment {
  if (!Number.isFinite(station) || !path.elements.length) throw new Error('Invalid station or empty path');
  const s = Math.max(0, Math.min(path.length, station));
  let lo = 0, hi = path.elements.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >>> 1; if (path.elements[mid].s0 <= s) lo = mid; else hi = mid - 1; }
  const e = path.elements[lo];
  return elementPoint(e, Math.min(e.len, Math.max(0, s - e.s0)));
}

/** Reverse travel direction without changing the physical curve. */
export function reverseCurvePath(path: CurvePath): CurvePath {
  let s = 0;
  const elements = [...path.elements].reverse().map((e): Element => {
    const end = elementPoint(e, e.len);
    const out: Element = e.kind === 'line'
      ? { ...e, s0: s, x0: end.x, y0: end.y, dx: -e.dx, dy: -e.dy }
      : { ...e, s0: s, a0: e.a0 + e.dir * e.len / e.r, dir: e.dir === 1 ? -1 : 1 };
    s += e.len;
    return out;
  });
  return { elements, length: s };
}

/**
 * P_d(s) = P(s) + d N(s), ds_d/ds = 1 − d κ(s). Circular offsets share their
 * centres and sweeps; their radius is R − dir*d. A zero/negative Jacobian is rejected,
 * never turned into a cusp, flipped circle, or a clamped radius. Global collisions are a
 * separate check (curveIntersections); this function alone is not a validity certificate.
 */
export function offsetCurvePath(spine: CurvePath, offset: number, direction: 1 | -1 = 1): OffsetPath {
  assertCurvePath(spine);
  if (!Number.isFinite(offset) || (direction !== 1 && direction !== -1)) throw new Error('Invalid offset or direction');
  let s = 0;
  const correspondence: StationSpan[] = [];
  const elements = spine.elements.map((e): Element => {
    let child: Element;
    if (e.kind === 'line') child = { ...e, s0: s, x0: e.x0 - offset * e.dy, y0: e.y0 + offset * e.dx };
    else {
      const r = e.r - e.dir * offset;
      if (!(r > POSITION_EPS)) throw new Error('Offset collapses the inside curve');
      child = { ...e, s0: s, r, len: e.len * r / e.r };
    }
    correspondence.push({ spineStart: e.s0, spineEnd: e.s0 + e.len, childStart: s, childEnd: s + child.len });
    s += child.len;
    return child;
  });
  const forward = { elements, length: s };
  return {
    path: direction === 1 ? forward : reverseCurvePath(forward), offset, direction,
    correspondence: direction === 1 ? correspondence : correspondence.map(c => ({ ...c, childStart: s - c.childStart, childEnd: s - c.childEnd })),
  };
}

/** Absolute chainage correspondence, including the reversed direction's descending stations. */
export function childStationAt(child: OffsetPath, spineStation: number): number {
  const spans = child.correspondence;
  if (!Number.isFinite(spineStation) || !spans.length) throw new Error('Invalid station correspondence');
  const s = Math.max(0, Math.min(spans[spans.length - 1].spineEnd, spineStation));
  let lo = 0, hi = spans.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >>> 1; if (spans[mid].spineStart <= s) lo = mid; else hi = mid - 1; }
  const c = spans[lo], t = (s - c.spineStart) / (c.spineEnd - c.spineStart);
  return c.childStart + t * (c.childEnd - c.childStart);
}

export function spineStationAt(child: OffsetPath, childStation: number): number {
  if (!Number.isFinite(childStation) || !child.correspondence.length) throw new Error('Invalid station correspondence');
  const s = Math.max(0, Math.min(child.path.length, childStation));
  const sign = child.direction;
  let lo = 0, hi = child.correspondence.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >>> 1; if (sign * child.correspondence[mid].childStart <= sign * s) lo = mid; else hi = mid - 1; }
  const c = child.correspondence[lo], t = (s - c.childStart) / (c.childEnd - c.childStart);
  return c.spineStart + t * (c.spineEnd - c.spineStart);
}
