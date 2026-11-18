// A bend dragged along the road past its neighbour (QA sweep 3 re-check, D35: a drag along the motorway put the
// new bend 320 m beyond the next one; the line ran on past that bend and turned back to it, 178°). Bends are
// corners of a line in order from A to B: where the dragged one has passed a neighbour, the two swap places
// in that order, so the line goes through the neighbour first. Live and reversible: dragged back, they swap
// back. A neighbour turning back on purpose (a hairpin) is left alone.
import { bendRules, horizontalRules } from './data/norms';
import type { CategoryId } from './data/categories';
import { buildAlignment, type PI, type Vec2 } from './horizontal';

/** the cosine of the turn at q between p→q and q→r (1: straight on, −1: straight back; no transcendental
 * function, core/detmath.ts) */
const turn = (p: Vec2, q: Vec2, r: Vec2) => {
  const ax = q.x - p.x, ay = q.y - p.y, bx = r.x - q.x, by = r.y - q.y;
  return (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
};

/**
 * `pis` with bend `i` just moved: while it lies ahead of a neighbour along that neighbour's other leg (the line
 * would pass the neighbour and turn back to it, more than a right angle) and swapping the two turns the line
 * less at both, they swap. Returns the bends (the input itself when nothing changed) and where bend `i` is now.
 */
export function passBends(a: Vec2, b: Vec2, pis: readonly PI[], i: number): { pis: readonly PI[]; i: number } {
  let out = pis, k = i;
  const at = (j: number) => (j < 0 ? a : j >= out.length ? b : out[j]);
  // (at most once past each other bend: a swap never undoes the one before it)
  for (let guard = out.length; guard > 0; guard--) {
    let moved = false;
    for (const dir of [1, -1]) {
      const n = k + dir;
      if (n < 0 || n >= out.length || out[n].hairpin) continue;
      const p = at(k - dir), q = out[k], m = out[n], nn = at(n + dir);
      // (the sharper turn of two: the smaller cosine)
      const before = turn(q, m, nn);
      if (before >= 0) continue;
      const now = Math.min(turn(p, q, m), before), swapped = Math.min(turn(p, m, q), turn(m, q, nn));
      if (!(swapped > now)) continue;
      const next = out.slice();
      next[k] = m; next[n] = q;
      out = next; k = n; moved = true;
      break;
    }
    if (!moved) break;
  }
  return { pis: out, i: k };
}

/** cos of the least turn that is a bend: one turning less than half a degree is no bend (its card would read "turns
 * 0°"). Game rule: the editor's whole-degree display, no norm. */
const STRAIGHT_COS = 0.9999619230641713; // cos 0.5°

/**
 * `pis` without the bends among `near` (indices) that no longer bend: a drag along the road leaves the dragged bend
 * on the line, or one dragged past a neighbour leaves that neighbour on the line between it and the next (QA P2
 * re-check: "Bend 3 · turns 0° · no curve (straight)", its number over bend 2's). A hairpin, an old road's own
 * corner and a bend that sets its stretch's design speed stay. `dropped`: the indices taken out (of the input), ascending.
 *
 * `fit` (the road's speed and category): also a bend among `near` other than `fit.dragged` that the curve fit leaves
 * out (it turns against its neighbour where no S-curve fits, a few metres off the line between its neighbours:
 * horizontal.ts `ignored`; QA second-round re-check, D35 km 4.2: a 2.2° corner, "turns 0° · no curve") goes, if its
 * radius is Auto's: the road already skips it, so the line stays the same.
 */
export function dropStraightBends(a: Vec2, b: Vec2, pis: readonly PI[], near: readonly number[],
  fit?: { speed: number; category: CategoryId; dragged: number }): { pis: readonly PI[]; dropped: number[] } {
  const keep = pis.map((p, k) => ({ p, k }));
  const watched = new Set(near.filter(k => k >= 0 && k < pis.length));
  const kept = (p: PI) => p.hairpin || p.mapped || p.speed !== undefined;
  for (let again = true; again;) {
    again = false;
    for (let q = 0; q < keep.length; q++) {
      const { p, k } = keep[q];
      if (!watched.has(k) || kept(p)) continue;
      const prev = q > 0 ? keep[q - 1].p : a, next = q + 1 < keep.length ? keep[q + 1].p : b;
      if (turn(prev, p, next) < STRAIGHT_COS) continue;
      keep.splice(q, 1); again = true;
      break;
    }
    if (again || !fit || !keep.some(({ p, k }) => watched.has(k) && k !== fit.dragged && p.r === null && !kept(p))) continue;
    const ps = keep.map(x => x.p);
    const curves = buildAlignment(a, b, ps, horizontalRules(fit.speed, fit.category), bendRules(ps, fit.speed, fit.category)).curves;
    const q = keep.findIndex(({ p, k }, q) => watched.has(k) && k !== fit.dragged && p.r === null && !kept(p) && curves[q]?.ignored);
    if (q >= 0) { keep.splice(q, 1); again = true; }
  }
  if (keep.length === pis.length) return { pis, dropped: [] };
  const left = new Set(keep.map(x => x.k));
  return { pis: keep.map(x => x.p), dropped: pis.flatMap((_, k) => left.has(k) ? [] : [k]) };
}
