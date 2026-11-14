// Volumes by average-end-area and a single-balance-line mass-haul estimate.

import { PRICES } from './data/prices';

export interface Volumes {
  cut: number;
  fill: number;
  /** mass ordinate at each station: cumulative (cut - fill), m³ */
  mass: Float64Array;
}

/**
 * Average-end-area volumes; areas of stations where `skip[i]` is set (structures) count as zero.
 * The mass ordinate counts only the usable share of cut (`usable`, e.g. 0.85).
 */
export function volumes(ds: number, cutA: ArrayLike<number>, fillA: ArrayLike<number>, skip?: ArrayLike<number>, usable = 1): Volumes {
  const n = cutA.length;
  const mass = new Float64Array(n);
  let cut = 0, fill = 0;
  const ca = (i: number) => (skip && skip[i] ? 0 : cutA[i]);
  const fa = (i: number) => (skip && skip[i] ? 0 : fillA[i]);
  for (let i = 1; i < n; i++) {
    const vc = 0.5 * (ca(i - 1) + ca(i)) * ds;
    const vf = 0.5 * (fa(i - 1) + fa(i)) * ds;
    cut += vc; fill += vf;
    mass[i] = mass[i - 1] + usable * vc - vf;
  }
  return { cut, fill, mass };
}

export interface MassHaul {
  /** balance line height chosen, m³ */
  balance: number;
  /** m³·m of material moved along the route (incl. moving surplus to / deficit from the ends) */
  moment: number;
  /** cut reused as fill, m³ */
  reused: number;
  surplus: number;
  deficit: number;
  /** average haul distance of all material moved along the route (incl. to/from the ends), m */
  avgHaul: number;
}

/**
 * Mass-haul with one balance line c: material crossing station s is M(s) - c, so the haul moment is
 * ∫|M - c| ds; c also decides how much leaves / enters at the ends (surplus to a tip, borrow).
 * c minimises the bill's pooled free-haul-adjusted haul + surplus + net borrow cost
 * (convex in c, ternary search). Fill placing is a constant minus the credit on bought fill.
 * `cut` is the usable cut (the mass ordinate must have been built with the same share).
 */
export function massHaul(ds: number, mass: Float64Array, cut: number, fill: number): MassHaul {
  const n = mass.length;
  const mEnd = mass[n - 1];
  const haulC = PRICES.haulPerM3Km / 1000;
  const surplusC = PRICES.surplusHaulKm * PRICES.haulPerM3Km;
  // a bought m³ (17180, placing included) replaces a m³ of own cut that would have been placed (17110)
  const borrowC = PRICES.borrowFill - PRICES.fillPlacing;
  const evalC = (c: number) => {
    let mom = 0;
    for (let i = 1; i < n; i++) {
      // trapezoid of |M - c| over the interval (approximate across sign changes)
      mom += 0.5 * (Math.abs(mass[i - 1] - c) + Math.abs(mass[i] - c)) * ds;
    }
    const exported = Math.max(c, 0) + Math.max(mEnd - c, 0);
    const imported = Math.max(-c, 0) + Math.max(c - mEnd, 0);
    const reused = Math.max(0, cut - exported);
    const paidMoment = Math.max(0, mom - reused * PRICES.freeHaul);
    return { mom, exported, imported, cost: paidMoment * haulC + exported * surplusC + imported * borrowC };
  };
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { if (mass[i] < lo) lo = mass[i]; if (mass[i] > hi) hi = mass[i]; }
  if (!(hi > lo)) { lo -= 1; hi += 1; }
  for (let it = 0; it < 60 && hi - lo > 1; it++) {
    const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
    if (evalC(a).cost <= evalC(b).cost) hi = b; else lo = a;
  }
  let c = 0.5 * (lo + hi);
  // Include the exact no-extra-disposal kinks; avoid a fractional m³ of unnecessary tip + borrow.
  for (const candidate of [0, mEnd]) if (evalC(candidate).cost < evalC(c).cost) c = candidate;
  const r = evalC(c);
  const surplus = Math.min(cut, r.exported);
  const deficit = Math.min(fill, r.imported);
  const reused = Math.max(0, cut - surplus);
  const moved = reused + surplus + deficit;
  return { balance: c, moment: r.mom, reused, surplus, deficit, avgHaul: moved > 0 ? r.mom / moved : 0 };
}
