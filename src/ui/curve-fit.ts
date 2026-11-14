// "Largest radius that fits" for one bend (pure; used by the on-map curve editor).

import { horizontalViolations } from '../core/checks';
import { horizontalRules } from '../core/data/norms';
import { buildAlignment, type PI, type Vec2 } from '../core/horizontal';

export const R_MIN = 20, R_MAX = 30000;

/** radii are edited in whole metres, in 5 m steps from 400 m */
export const snapRadius = (r: number) => Math.min(R_MAX, Math.max(R_MIN, r >= 400 ? Math.round(r / 5) * 5 : Math.round(r)));

/**
 * Largest radius for bend i that adds no horizontal violation (none involving the bend, and no more in
 * total than with its automatic radius); null if even the automatic radius does not fit.
 * Feasibility is not monotonic in the radius — e.g. room for transitions runs out, then from the
 * transition-free radius on the curve fits again — so the whole range is scanned and the upper edge of
 * the last feasible stretch refined.
 */
export function maxRadiusThatFits(a: Vec2, b: Vec2, pis: PI[], i: number, speed: number): number | null {
  const rules = horizontalRules(speed);
  const viol = (r: number | null) => {
    const al = buildAlignment(a, b, pis.map((p, k) => (k === i ? { ...p, r } : p)), rules);
    return { al, v: horizontalViolations(al, speed) };
  };
  const base = viol(null);
  const c0 = base.al.curves[i];
  if (!c0 || c0.unit < 0 || base.v.some((x) => x.pis?.includes(i))) return null;
  const fits = (r: number) => { const { v } = viol(r); return v.length <= base.v.length && !v.some((x) => x.pis?.includes(i)); };
  const start = Math.max(c0.rEff, rules.minRadius);
  const samples: number[] = [];
  for (let r = start; r < R_MAX; r *= 1.12) samples.push(r);
  const plain = Math.ceil(rules.plainRadius);
  if (plain > start && plain < R_MAX) samples.push(plain, plain + 5);
  samples.push(R_MAX);
  samples.sort((p, q) => p - q);
  let best = -1;
  samples.forEach((r, k) => { if (fits(r)) best = k; });
  if (best < 0) return null;
  if (best === samples.length - 1) return R_MAX;
  let lo = samples[best], hi = samples[best + 1];
  for (let it = 0; it < 24 && hi - lo > 0.5; it++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
  // a round number at the editing step if one fits just below the edge
  const step = lo >= 400 ? 5 : 1;
  for (const r of [Math.floor(hi / step) * step, Math.floor(lo / step) * step, Math.floor(lo)]) if (r > 0 && fits(r)) return r;
  return lo;
}
