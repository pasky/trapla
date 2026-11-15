import type { Element, Vec2 } from './horizontal';
import type { CurvePath } from './offset-path';
import * as dm from './detmath';

const EPS = 1e-6; // numerical position tolerance (m), not an engineering clearance
const TAU = 2 * Math.PI;
const mod = (x: number) => ((x % TAU) + TAU) % TAU;
const cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x;
const sub = (a: Vec2, b: Vec2) => ({ x: a.x - b.x, y: a.y - b.y });
function end(e: Element, last: boolean): Vec2 {
  if (e.kind === 'line') return { x: e.x0 + (last ? e.len * e.dx : 0), y: e.y0 + (last ? e.len * e.dy : 0) };
  const a = e.a0 + (last ? e.dir * e.len / e.r : 0);
  return { x: e.cx + e.r * dm.cos(a), y: e.cy + e.r * dm.sin(a) };
}
function onArc(e: Extract<Element, { kind: 'arc' }>, p: Vec2): boolean {
  const a = dm.atan2(p.y - e.cy, p.x - e.cx), sweep = mod(e.dir * (a - e.a0));
  return sweep <= e.len / e.r + EPS / e.r || TAU - sweep <= EPS / e.r;
}
function onLine(e: Extract<Element, { kind: 'line' }>, p: Vec2): boolean {
  const dx = p.x - e.x0, dy = p.y - e.y0, s = dx * e.dx + dy * e.dy;
  return Math.abs(dx * e.dy - dy * e.dx) <= EPS && s >= -EPS && s <= e.len + EPS;
}

/** Analytic intersections. Coincident overlaps return overlap endpoints (not just crossings). */
function intersect(a: Element, b: Element): Vec2[] {
  if (a.kind === 'line' && b.kind === 'line') {
    const p = end(a, false), q = end(b, false), d = sub(q, p);
    const ta = { x: a.dx, y: a.dy }, tb = { x: b.dx, y: b.dy }, den = cross(ta, tb);
    if (Math.abs(den) < 1e-12) return [p, end(a, true), q, end(b, true)].filter(v => onLine(a, v) && onLine(b, v));
    const s = cross(d, tb) / den, t = cross(d, ta) / den;
    return s >= -EPS && s <= a.len + EPS && t >= -EPS && t <= b.len + EPS ? [{ x: p.x + s * a.dx, y: p.y + s * a.dy }] : [];
  }
  if (a.kind === 'arc' && b.kind === 'line') return intersect(b, a);
  if (a.kind === 'line' && b.kind === 'arc') {
    const x = a.x0 - b.cx, y = a.y0 - b.cy, along = x * a.dx + y * a.dy;
    const perp = x * a.dy - y * a.dx, h2 = b.r * b.r - perp * perp;
    if (h2 < -EPS * b.r) return [];
    const h = Math.sqrt(Math.max(0, h2));
    return [-along - h, -along + h].filter(s => s >= -EPS && s <= a.len + EPS)
      .map(s => ({ x: a.x0 + s * a.dx, y: a.y0 + s * a.dy })).filter(p => onArc(b, p));
  }
  if (a.kind !== 'arc' || b.kind !== 'arc') return [];
  const dx = b.cx - a.cx, dy = b.cy - a.cy, d = Math.hypot(dx, dy);
  if (d < EPS && Math.abs(a.r - b.r) < EPS) return [end(a, false), end(a, true), end(b, false), end(b, true)].filter(p => onArc(a, p) && onArc(b, p));
  if (d < EPS || d > a.r + b.r + EPS || d < Math.abs(a.r - b.r) - EPS) return [];
  const along = (a.r * a.r - b.r * b.r + d * d) / (2 * d), h2 = a.r * a.r - along * along;
  if (h2 < -EPS * a.r) return [];
  const h = Math.sqrt(Math.max(0, h2)), x = a.cx + along * dx / d, y = a.cy + along * dy / d;
  return [-1, 1].map(sign => ({ x: x - sign * h * dy / d, y: y + sign * h * dx / d })).filter(p => onArc(a, p) && onArc(b, p));
}

function bounds(e: Element) {
  const pts = [end(e, false), end(e, true)];
  if (e.kind === 'arc') for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, p = { x: e.cx + e.r * dm.cos(a), y: e.cy + e.r * dm.sin(a) };
    if (onArc(e, p)) pts.push(p);
  }
  return { minX: Math.min(...pts.map(p => p.x)), maxX: Math.max(...pts.map(p => p.x)), minY: Math.min(...pts.map(p => p.y)), maxY: Math.max(...pts.map(p => p.y)) };
}

export interface CurveCollision { first: number; second: number; point: Vec2 }
export interface CurveCollisionCheck { complete: boolean; collisions: CurveCollision[] }
/**
 * Sweep broad phase + analytic narrow phase. With no second path, checks self-intersections,
 * excluding only the shared endpoint of consecutive elements. Runtime/output budgets fail
 * closed as incomplete; never allocate a Cartesian-product array or report unchecked geometry safe.
 */
export function curveIntersections(first: CurvePath, second?: CurvePath, budget = 100_000): CurveCollisionCheck {
  if (!Number.isInteger(budget) || budget < 1) throw new Error('Invalid intersection budget');
  const entries = first.elements.map((e, i) => ({ e, i, group: 0, ...bounds(e) }));
  if (second) entries.push(...second.elements.map((e, i) => ({ e, i, group: 1, ...bounds(e) })));
  entries.sort((a, b) => a.minX - b.minX || a.group - b.group || a.i - b.i);
  let active: typeof entries = [], checks = 0;
  const collisions: CurveCollision[] = [];
  for (const entry of entries) {
    active = active.filter(a => a.maxX >= entry.minX - EPS);
    for (const a of active) {
      if (++checks > budget) return { complete: false, collisions };
      if ((second && a.group === entry.group) || a.maxY < entry.minY - EPS || entry.maxY < a.minY - EPS) continue;
      const p = second ? (a.group === 0 ? a : entry) : (a.i < entry.i ? a : entry), q = p === a ? entry : a;
      const pEnd = end(p.e, true), qStart = end(q.e, false);
      const joint = !second && q.i === p.i + 1 && Math.hypot(pEnd.x - qStart.x, pEnd.y - qStart.y) <= EPS ? pEnd : undefined;
      for (const point of intersect(p.e, q.e)) {
        if (joint && Math.hypot(point.x - joint.x, point.y - joint.y) <= EPS) continue;
        if (collisions.some(c => c.first === p.i && c.second === q.i && Math.hypot(c.point.x - point.x, c.point.y - point.y) <= EPS)) continue;
        collisions.push({ first: p.i, second: q.i, point });
        if (collisions.length >= 256) return { complete: false, collisions };
      }
    }
    active.push(entry);
  }
  return { complete: true, collisions };
}
