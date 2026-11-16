// Design speed by stretch (docs/design-realism-plan.md M4, research/47 §2): a bend may carry its own design
// speed; a stretch is a run of consecutive bends of one speed, and where two stretches meet the speed changes
// in the middle of the straight between their curves (PROVISIONAL: no public rule says where).
import { CATEGORIES, type CategoryId } from './data/categories';
import { designSpeeds, HAIRPIN, hairpinLaneWidening } from './data/norms';
import type { Alignment, PI } from './horizontal';
import { terrainClassAt } from './terrain-class';
import type { Terrain } from './terrain';
import type { Violation } from './checks';

export interface SpeedStretch { s0: number; s1: number; speed: number }

/** a bend's design speed: its own where the category has that speed, else the road's */
export function bendSpeed(p: PI | undefined, roadSpeed: number, category?: CategoryId): number {
  return p?.speed !== undefined && (!category || designSpeeds(category).includes(p.speed)) ? p.speed : roadSpeed;
}

/** The road from 0 to its length in stretches of one design speed (one stretch where no bend has its own). */
export function speedStretches(al: Pick<Alignment, 'curves' | 'length'>, pis: readonly PI[], roadSpeed: number, category?: CategoryId): SpeedStretch[] {
  const out: SpeedStretch[] = [];
  let speed = roadSpeed, s0 = 0, lastEnd = 0, first = true;
  for (const c of al.curves) {
    const v = bendSpeed(pis[c.index], roadSpeed, category);
    // the road's start belongs to the first bend's stretch
    if (first) { speed = v; first = false; }
    else if (v !== speed) {
      const at = (lastEnd + c.sStart) / 2;
      out.push({ s0, s1: at, speed }); s0 = at; speed = v;
    }
    lastEnd = Math.max(lastEnd, c.sEnd);
  }
  out.push({ s0, s1: al.length, speed });
  // a hairpin is driven at the speed its radius allows (ČSN 73 6101:2018 "mezní rychlost", research/47 §5)
  for (const c of al.curves) {
    if (!pis[c.index]?.hairpin || c.sEnd <= c.sStart) continue;
    const v = hairpinSpeed(c.rEff);
    for (let k = 0; k < out.length; k++) {
      const x = out[k];
      if (x.s1 <= c.sStart || x.s0 >= c.sEnd || x.speed <= v) continue;
      const parts = [{ s0: x.s0, s1: Math.max(x.s0, c.sStart), speed: x.speed }, { s0: Math.max(x.s0, c.sStart), s1: Math.min(x.s1, c.sEnd), speed: v },
        { s0: Math.min(x.s1, c.sEnd), s1: x.s1, speed: x.speed }].filter(p => p.s1 > p.s0 + 1e-9);
      out.splice(k, 1, ...parts); k += parts.length - 1;
    }
  }
  return out;
}

/** The speed a curve of radius r allows: vm = √(127 r (f + p)) with f = 0.25 (ČSN 73 6101:2018 slide 5; MZe TD
 * 2020 p. 29) and the hairpin's 7.5 % banking, km/h (R 17.5 m → ≈ 27 km/h) */
export function hairpinSpeed(r: number): number {
  return Math.sqrt(127 * r * (0.25 + HAIRPIN.banking));
}

/** Where a hairpin may stand: on a road through mountains (the terrain class), on a stretch at the category's
 * lowest design speed. There it needs the road authority's approval (a departure from ČSN 73 6101, as at I/44
 * Červenohorské sedlo), which the bend card says; elsewhere it is a violation the player may still keep. */
export function hairpinViolations(al: Pick<Alignment, 'curves'>, pis: readonly PI[], roadSpeed: number, category: CategoryId, terrain: Terrain): Violation[] {
  const out: Violation[] = [];
  const lowest = Math.min(...designSpeeds(category));
  const rule = 'ČSN 73 6101:2018 has no hairpins; a road authority approves one only as a departure from it on a mountain road (I/44 Červenohorské sedlo, research/47 §3)';
  for (const c of al.curves) {
    if (!pis[c.index]?.hairpin || CATEGORIES[category].minor) continue;
    const where = { s0: c.sStart, s1: Math.max(c.sEnd, c.sStart), pi: c.index, pis: [c.index] };
    const speed = bendSpeed(pis[c.index], roadSpeed, category);
    if (terrainClassAt(terrain, c.x, c.y) !== 'mountainous')
      out.push({ kind: 'radius', ...where, basis: 'norm', rule, title: `Hairpin at bend ${c.index + 1} outside the mountains`,
        fix: `Make bend ${c.index + 1} an ordinary curve`,
        detail: 'Hairpins are allowed only where the ground is too steep for ordinary curves: slopes steeper than 15 % around them.' });
    else if (speed > lowest)
      out.push({ kind: 'radius', ...where, basis: 'norm', rule, title: `Hairpin at bend ${c.index + 1} on a ${speed} km/h stretch`,
        fix: `Set bend ${c.index + 1}'s stretch to ${lowest} km/h`,
        detail: `A hairpin belongs on a stretch designed for the lowest speed, ${lowest} km/h.` });
  }
  return out;
}

/** Travel time over the stretches at their design speeds, minutes. */
export function travelMinutes(stretches: readonly SpeedStretch[]): number {
  return stretches.reduce((t, x) => t + (x.s1 - x.s0) / (x.speed / 3.6) / 60, 0);
}

/** A hairpin's widened lanes along the route: extra crown width on each side per station, m, tapering in and
 * out over 10 × the widening (1 : 10, the forest-road guide's run-in, research/47 §3); undefined without hairpins.
 * Each lane is widened on its own side of the axis (PROVISIONAL: I/44 widened mostly into the cut). */
export function hairpinWidening(al: Pick<Alignment, 'curves'>, pis: readonly PI[], category: CategoryId, s: ArrayLike<number>): Float32Array | undefined {
  if (!pis.some(p => p.hairpin)) return undefined;
  const out = new Float32Array(s.length);
  for (const c of al.curves) {
    if (!pis[c.index]?.hairpin || c.sEnd <= c.sStart) continue;
    const w = hairpinLaneWidening(c.rEff, category), taper = 10 * w;
    if (!(w > 0)) continue;
    for (let i = 0; i < s.length; i++) {
      const d = s[i] < c.sStart ? c.sStart - s[i] : s[i] > c.sEnd ? s[i] - c.sEnd : 0;
      if (d < taper) out[i] = Math.max(out[i], w * (1 - d / taper));
    }
  }
  return out;
}

/** pavement price of a hairpin's widening, CZK/m² (data/norms.ts HAIRPIN) */
export function hairpinPavementPerM2(category: CategoryId): number {
  return CATEGORIES[category].roadClass === 'I' ? HAIRPIN.pavementClassI : HAIRPIN.pavementOther;
}
