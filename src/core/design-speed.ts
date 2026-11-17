// Design speed by stretch (docs/design-realism-plan.md M4, research/47 §2): a bend may carry its own design
// speed; a stretch is a run of consecutive bends of one speed, and where two stretches meet the speed changes
// in the middle of the straight between their curves (PROVISIONAL: no public rule says where).
import { CATEGORIES, type CategoryId } from './data/categories';
import { designSpeeds, HAIRPIN, hairpinLaneWidening, speedNorms, type SpeedNorms } from './data/norms';
import type { RadiusLimit } from './vertical';
import type { Alignment, PI } from './horizontal';
import { groundSlopeAt, routeMountainous, TERRAIN_CLASS } from './terrain-class';
import type { Terrain } from './terrain';
import type { Violation } from './checks';
import { stationIndex } from './range';

export interface SpeedStretch { s0: number; s1: number; speed: number }

/** a bend's design speed: its own where the category has that speed and it is not above the road's, else the
 * road's. A stretch is designed slower than its road, never faster: ČSN 73 6101:2018 lowers the design speed of a
 * stretch in justified cases (research/47 §2), and a railway's line speed is its mission's (research/38, /66 §3):
 * its trains run no faster on one curve built for more. */
export function bendSpeed(p: PI | undefined, roadSpeed: number, category?: CategoryId): number {
  return p?.speed !== undefined && p.speed <= roadSpeed && (!category || designSpeeds(category).includes(p.speed)) ? p.speed : roadSpeed;
}

/** the design speeds a bend's stretch may be given: the category's, no faster than the road's */
export function bendSpeedChoices(roadSpeed: number, category: CategoryId): number[] {
  return designSpeeds(category).filter(v => v <= roadSpeed);
}

/** The stretch a bend's design speed covers (from the middle of the straight before its curve to the middle of
 * the one after, or the road's end; with one bend the whole road), whatever speed it has now. */
export function bendStretch(al: StretchPlan, pis: readonly PI[], k: number, roadSpeed: number): SpeedStretch | undefined {
  const c = al.curves.find(x => x.index === k);
  if (!c) return undefined;
  // (the bend alone at a speed no other bend has)
  const probe = pis.map((p, j) => j === k ? { ...p, speed: -1 } : { ...p, speed: 0 });
  const all = speedStretches(al, probe, roadSpeed, undefined, false);
  return all.find(x => x.speed === -1);
}

/** A stretch slowed below the road's design speed only relaxes its rules (smaller radii, curves and crests), so
 * Auto's road there should cost no more than at the faster speed. The grade search prices an estimate (flat-ground
 * sections, no ordinary-road crossings: research/66), so the looser rules can lead it to a line the bill finds
 * dearer. A designer keeps the faster stretch's curves and heights then: Auto weighs the geometry of each faster
 * speed up to the road's (every slowed bend raised the same number of the category's speed steps, hairpins
 * keeping theirs) against the slowed one's at the bill (evaluate.ts). The speeds the geometry is built for, per
 * bend (null: the bend's own); null when no bend is slowed or `k` steps reach none. */
export function raisedBendSpeeds(pis: readonly PI[], roadSpeed: number, category: CategoryId, k: number): (number | null)[] | null {
  const speeds = designSpeeds(category).filter(v => v <= roadSpeed).sort((a, b) => a - b);
  let any = false;
  const out = pis.map(p => {
    const v = bendSpeed(p, roadSpeed, category);
    if (p.hairpin || v >= roadSpeed) return null;
    const at = speeds.indexOf(v);
    if (at < 0) return null;
    any = true;
    return speeds[Math.min(speeds.length - 1, at + k)];
  });
  return any ? out : null;
}

/** how many speed steps the slowest slowed bend lies below the road's design speed (0: none slowed) */
export function slowedSteps(pis: readonly PI[], roadSpeed: number, category: CategoryId): number {
  const speeds = designSpeeds(category).filter(v => v <= roadSpeed).sort((a, b) => a - b);
  let k = 0;
  for (const p of pis) {
    const v = bendSpeed(p, roadSpeed, category);
    if (!p.hairpin && v < roadSpeed && speeds.includes(v)) k = Math.max(k, speeds.length - 1 - speeds.indexOf(v));
  }
  return k;
}

/** the bends as the geometry is built for them (`speeds`: raisedBendSpeeds; absent: as they are) */
export function geometryPis(pis: readonly PI[], speeds?: readonly (number | null)[] | null): PI[] {
  if (!speeds) return pis as PI[];
  return pis.map((p, k) => speeds[k] == null ? p : { ...p, speed: speeds[k]! });
}

/** The road from 0 to its length in stretches of one design speed (one stretch where no bend has its own). */
/** what of a plan the stretches read: its curves (by bend) and length */
export type StretchPlan = { curves: readonly { index: number; sStart: number; sEnd: number; rEff: number }[]; length: number };
export function speedStretches(al: StretchPlan, pis: readonly PI[], roadSpeed: number, category?: CategoryId, hairpins = true): SpeedStretch[] {
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
  if (hairpins) for (const c of al.curves) {
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

/** The speed a hairpin of radius r is driven at: ČSN 73 6101:2000 table 12 (HAIRPIN.speeds), between its rows
 * linearly, beyond them its ends, km/h (30 m → 30 km/h) */
export function hairpinSpeed(r: number): number {
  const t = HAIRPIN.speeds;
  if (r <= t[0][0]) return t[0][1];
  for (let k = 1; k < t.length; k++) if (r <= t[k][0]) return t[k - 1][1] + (t[k][1] - t[k - 1][1]) * (r - t[k - 1][0]) / (t[k][0] - t[k - 1][0]);
  return t[t.length - 1][1];
}

/** Where a hairpin may stand. GAME RULE (research/54 §5): where the ground around it is steep — the predominant
 * slope within 500 m over 15 % (terrain-class.ts groundSlopeAt), even where the 10 km section is classed hilly
 * (the norm's class, which keeps setting the gradient limits) — on a stretch at the category's lowest design
 * speed. ČSN 73 6101:2000 §8.5.7 allowed hairpins only in mountain terrain and the 2018 edition has none, so
 * there it is a departure from the standard needing the road authority's approval (as at I/44 Červenohorské
 * sedlo), which the bend card says; elsewhere it is a violation the player may still keep. */
export function hairpinViolations(al: Pick<Alignment, 'curves'>, pis: readonly PI[], roadSpeed: number, category: CategoryId,
  terrain: Terrain): Violation[] {
  const out: Violation[] = [];
  const lowest = Math.min(...designSpeeds(category));
  const rule = 'ČSN 73 6101:2018 has no hairpins; a road authority approves one only as a departure from it on a mountain road (I/44 Červenohorské sedlo)'; // research/47 §3
  for (const c of al.curves) {
    if (!pis[c.index]?.hairpin || CATEGORIES[category].minor) continue;
    const where = { s0: c.sStart, s1: Math.max(c.sEnd, c.sStart), pi: c.index, pis: [c.index] };
    const speed = bendSpeed(pis[c.index], roadSpeed, category);
    if (c.delta < HAIRPIN.minTurn)
      out.push({ kind: 'radius', ...where, basis: 'norm', rule: `MZe Technická doporučení 2020 §7.7: in a hairpin the road turns almost back on itself (game: at least ${Math.round(HAIRPIN.minTurn * 180 / Math.PI)}°)`,
        title: `Bend ${c.index + 1} turns too little for a hairpin`,
        fix: `Make bend ${c.index + 1} an ordinary curve${speed > lowest ? `; for a tighter one set its stretch to ${lowest} km/h` : ''}`,
        detail: `It turns ${Math.round(c.delta * 180 / Math.PI)}°. A hairpin turns the road almost back on itself to climb a steep slope.` });
    else if (!(groundSlopeAt(terrain, c.x, c.y) > TERRAIN_CLASS.mountainousFrom))
      out.push({ kind: 'radius', ...where, basis: 'norm', rule, title: `Hairpin at bend ${c.index + 1} on gentle ground`,
        fix: `Make bend ${c.index + 1} an ordinary curve`,
        detail: 'Hairpins are allowed only where the ground around them is steep: mostly steeper than 15 % within 500 m.' });
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

/** What limits the grade line along a road (M4-2): the steepest grade by the terrain class of the ground at each
 * station (category × terrain, ČSN 73 6101:2018 via research/47 §1.1; core/terrain-class.ts) and less in a
 * hairpin (HAIRPIN.maxGrade), and each stretch's own crest / sag radii. Numbers where nothing varies. */
export interface VerticalLimits {
  /** the steepest grade anywhere; `gradeAt` where it varies */
  maxGradient: number;
  gradeAt?: (s0: number, s1: number) => number;
  crest: RadiusLimit; sag: RadiusLimit;
  /** the smallest crest / sag radius anywhere */
  crestMin: number; sagMin: number;
  /** a stretch's norms at a chainage, where stretches differ */
  stretch?: (s: number) => SpeedNorms;
  /** whether the road runs through mountains at a chainage (core/terrain-class.ts) */
  mountainousAt: (s: number) => boolean;
}
type Stations = { s: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number>; n: number; ds: number };
/** `full`: the whole route's stations where `st` is a window of it starting at chainage `offset` */
export function verticalLimits(st: Stations, al: Pick<Alignment, 'curves' | 'length'>, pis: readonly PI[], roadSpeed: number, category: CategoryId,
  terrain: Terrain, fixed?: number, offset = 0, full: Stations = st): VerticalLimits {
  const cat = CATEGORIES[category], n = st.n;
  const mountain = mountainousAlong(terrain, full);
  // grades: fixed (a rebuilt railway's own), else the category's by terrain class per station
  let at: Float64Array | null = null;
  const byClass = cat.maxGradient;
  if (fixed === undefined && byClass) {
    at = new Float64Array(n);
    for (let i = 0; i < n; i++) at[i] = byClass[mountain(st.s[i] + offset) ? 'mountainous' : 'hilly'];
  }
  // hairpins (their own arcs; window chainage = route chainage − offset)
  for (const c of al.curves) {
    if (!pis[c.index]?.hairpin || c.sEnd <= c.sStart) continue;
    if (!at) at = new Float64Array(n).fill(fixed ?? byClass?.hilly ?? Infinity);
    for (let i = 0; i < n; i++) { const s = st.s[i] + offset; if (s >= c.sStart && s <= c.sEnd) at[i] = Math.min(at[i], HAIRPIN.maxGrade); }
  }
  let lo = Infinity, hi = -Infinity;
  if (at) for (const g of at) { lo = Math.min(lo, g); hi = Math.max(hi, g); }
  const varies = !!at && hi - lo > 1e-12;
  const maxGradient = varies ? hi : at ? hi : fixed ?? NaN;
  const gradeAt = varies ? (s0: number, s1: number) => {
    const a = Math.max(0, Math.min(n - 1, Math.floor((s0 - offset) / st.ds))), b = Math.max(a, Math.min(n - 1, Math.ceil((s1 - offset) / st.ds)));
    let g = Infinity;
    for (let i = a; i <= b; i++) if (at![i] < g) g = at![i];
    return g;
  } : undefined;
  return { maxGradient, gradeAt, mountainousAt: mountain, ...stretchRadii(al, pis, roadSpeed, category, offset) };
}

/** whether the road runs through mountains at a route chainage (core/terrain-class.ts routeMountainous) */
export function mountainousAlong(terrain: Terrain, full: Stations): (s: number) => boolean {
  const cls = routeMountainous(terrain, full);
  return (s) => cls[stationIndex(full, s)] === 1;
}

/** Each stretch's own crest / sag radii (the design speeds, not a hairpin's driving speed); numbers where the
 * whole road has one speed. `offset`: route chainage of chainage 0 (a window). */
export function stretchRadii(al: Pick<Alignment, 'curves' | 'length'>, pis: readonly PI[], roadSpeed: number, category: CategoryId, offset = 0):
  Pick<VerticalLimits, 'crest' | 'sag' | 'crestMin' | 'sagMin' | 'stretch'> {
  const stretches = speedStretches(al, pis, roadSpeed, category, false);
  const own = speedNorms(roadSpeed, category);
  if (stretches.length === 1 && stretches[0].speed === roadSpeed)
    return { crest: own.minCrestRadius, sag: own.minSagRadius, crestMin: own.minCrestRadius, sagMin: own.minSagRadius };
  const normsAt = (s: number) => {
    let k = 0;
    while (k + 1 < stretches.length && s + offset >= stretches[k].s1) k++;
    return speedNorms(stretches[k].speed, category);
  };
  const all = stretches.map(x => speedNorms(x.speed, category));
  return { crest: (s) => normsAt(s).minCrestRadius, sag: (s) => normsAt(s).minSagRadius,
    crestMin: Math.min(...all.map(x => x.minCrestRadius)), sagMin: Math.min(...all.map(x => x.minSagRadius)), stretch: normsAt };
}
