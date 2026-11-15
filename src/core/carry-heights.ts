// By-hand height points belong to places on the ground, not to chainages: when the plan changes, the
// points on unchanged stretches stay where they were (before the change at the same chainage, after it
// shifted by the length the change added or removed) and those on the changed stretch are stretched
// along it. Otherwise one moved bend would slide every later height point along the road.
import { pointAt, type Alignment } from './horizontal';
import type { VPI } from './vertical';

const SAME = 0.05, STEP = 2;

/** Chainage map old → new: the stretch [s0, s1Old] of `before` became [s0, s1New] of `after`. */
export function changedStretch(before: Alignment, after: Alignment): { s0: number; s1Old: number; s1New: number } | null {
  const Lo = before.length, Ln = after.length, p = { x: 0, y: 0, tx: 1, ty: 0, curvature: 0 }, q = { ...p };
  const differ = (so: number, sn: number) => {
    pointAt(before, so, p); pointAt(after, sn, q);
    return Math.hypot(p.x - q.x, p.y - q.y) > SAME;
  };
  const shorter = Math.min(Lo, Ln);
  let s0 = 0;
  while (s0 <= shorter && !differ(s0, s0)) s0 += STEP;
  if (s0 > shorter && Math.abs(Lo - Ln) < SAME) return null; // the same plan
  s0 = Math.max(0, s0 - STEP);
  let d = 0;
  while (d <= shorter - s0 && !differ(Lo - d, Ln - d)) d += STEP;
  d = Math.max(0, d - STEP);
  return { s0, s1Old: Math.max(s0, Lo - d), s1New: Math.max(s0, Ln - d) };
}

export function carryVpis(before: Alignment, after: Alignment, vpis: readonly VPI[]): VPI[] {
  const c = changedStretch(before, after);
  if (!c) return vpis.map(v => ({ ...v }));
  const shift = after.length - before.length;
  const map = (s: number) => s <= c.s0 ? s : s >= c.s1Old ? s + shift
    : c.s0 + (s - c.s0) * (c.s1New - c.s0) / Math.max(1e-9, c.s1Old - c.s0);
  return vpis.map((v, k) => ({ ...v, s: k === 0 ? 0 : k === vpis.length - 1 ? after.length : map(v.s) }));
}
