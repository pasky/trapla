// The editor's drag of a bend and the radii set by hand around it (decision 2026-11-17, research/65 §1): where the
// drag leaves a set radius too large for the room between its bends, that radius is lowered just enough, live,
// and the bend card says so. Auto radii adapt by themselves; a set radius the drag leaves room for stays as set.
import { bendRules, horizontalRules } from './data/norms';
import type { CategoryId } from './data/categories';
import { buildAlignment, type JointInfo, type PI, type Vec2 } from './horizontal';

export interface LoweredRadius { i: number; from: number; to: number }

const short = (j: JointInfo) => j.kind !== 'compound' && j.tFrom + j.needFrom + j.tTo + j.needTo - j.length > 1e-6;

/**
 * `pis` with bend `dragged` already moved; `wanted[k]`: bend k's radius as set before the drag (null: Auto). The
 * bends whose turn the drag changes (the dragged one and its two neighbours) get their wanted radius back where
 * it fits, else the largest that fits (rounded down to the editing step: 5 m from 400 m, else 1 m) — the dragged
 * bend first, then the nearer neighbour, then both. A set radius that does not fit even at the smallest the rules
 * allow is left as wanted (the problem and its fix stay on the bend).
 */
export function fitSetRadii(a: Vec2, b: Vec2, pis: readonly PI[], dragged: number, wanted: readonly (number | null)[],
  speed: number, category?: CategoryId): { pis: PI[]; lowered: LoweredRadius[] } {
  const out = pis.map((p, k) => (p.r !== null && wanted[k] != null ? { ...p, r: wanted[k] } : { ...p }));
  const settable = (k: number) => k >= 0 && k < out.length && Math.abs(k - dragged) <= 1 && out[k].r !== null && !out[k].hairpin && wanted[k] != null;
  const build = () => buildAlignment(a, b, out, horizontalRules(speed, category), bendRules(out, speed, category));
  const minOf = (k: number) => (bendRules(out, speed, category)?.(k) ?? horizontalRules(speed, category)).minRadius;
  /** no leg next to bend k is too short for the curves on it */
  const fitsAt = (k: number) => !build().joints.some(j => (j.from === k || j.to === k) && short(j));
  const set = (k: number, r: number) => { out[k] = { ...out[k], r }; };
  /** bend k's largest radius in [min, now] that fits (now does not), or null */
  const lower = (k: number): number | null => {
    const r0 = out[k].r!, min = minOf(k);
    if (fitsAt(k)) return r0;
    set(k, min);
    if (!fitsAt(k)) { set(k, r0); return null; }
    let lo = min, hi = r0;
    for (let it = 0; it < 24 && hi - lo > 0.5; it++) { const mid = (lo + hi) / 2; set(k, mid); if (fitsAt(k)) lo = mid; else hi = mid; }
    const step = lo >= 400 ? 5 : 1;
    for (const r of [Math.floor(lo / step) * step, Math.floor(lo)]) if (r >= min) { set(k, r); if (fitsAt(k)) return r; }
    set(k, lo); return lo;
  };
  for (let round = 0; round < 4; round++) {
    const j = build().joints.find(x => short(x) && (settable(x.from) || settable(x.to)));
    if (!j) break;
    const order = [j.from, j.to].filter(settable).sort((p, q) => Math.abs(p - dragged) - Math.abs(q - dragged));
    let done = order.some(k => lower(k) !== null);
    if (!done && order.length === 2) {
      // both lowered in proportion, as little as needed (each no lower than the rules allow)
      const r0 = order.map(k => out[k].r!), mins = order.map(minOf);
      const scale = (f: number) => order.forEach((k, n) => set(k, Math.max(mins[n], r0[n] * f)));
      const fitsBoth = () => order.every(fitsAt);
      scale(0);
      if (fitsBoth()) {
        let lo = 0, hi = 1;
        for (let it = 0; it < 24 && hi - lo > 1e-3; it++) { const mid = (lo + hi) / 2; scale(mid); if (fitsBoth()) lo = mid; else hi = mid; }
        scale(lo);
        order.forEach(k => { const r = out[k].r!, step = r >= 400 ? 5 : 1, down = Math.floor(r / step) * step; if (down >= minOf(k)) { set(k, down); if (!fitsBoth()) set(k, r); } });
        done = true;
      } else order.forEach((k, n) => set(k, r0[n]));
    }
    if (!done) break;
  }
  const lowered: LoweredRadius[] = [];
  out.forEach((p, k) => { if (p.r !== null && wanted[k] != null && p.r < wanted[k]! - 1e-9) lowered.push({ i: k, from: wanted[k]!, to: p.r }); });
  return { pis: out, lowered };
}
