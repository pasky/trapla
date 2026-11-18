// Cross-sections: a flat crown of the category width at the grade elevation, with side slopes down/up to
// the terrain (daylight point) shaped by height and ground (earthengineering.ts, data/prices.ts SIDE_SLOPES),
// integrated against the ground sampled across the alignment.

import { NORM_CAP_I, NORM_CAP_II, UNKNOWN_GROUND, type GroundProfile } from './ground';

type Bands = Pick<GroundProfile, 'classIto' | 'classIIto' | 'normMix' | 'key'>;
import type { Terrain } from './terrain';
import { SIDE_SLOPES, SUBGRADE } from './data/prices';
import { rockSlope, treatedSubgrade } from './earthengineering';

export interface SectionTemplate {
  crownWidth: number;
}

export interface SideResult {
  cut: number; // m²
  /** part of `cut` no deeper than the class-I depth below the ground, m² */
  cutI: number;
  /** part of `cut` between the class-I and class-II depths, m² (the rest of `cut` is class III) */
  cutII: number;
  fill: number; // m²
  /** offset of the daylight point from the centreline, m */
  day: number;
  /** ground elevation at the daylight point */
  zDay: number;
  /** true if the slope did not reach the ground within the search limit */
  open: boolean;
  /** rock face of the cut slope (sound rock, netted), measured down the slope, m */
  rockFace: number;
  /** soft ground treated under this side of a fill, m across (crown half and slope to the toe) */
  subgrade: number;
  /** the slope's own surface at `day` (= zDay where it reached the ground; where a wall cut it short, the
   * height the wall retains is |zSlope − ground|) */
  zSlope: number;
  /** A face that a straight line from the crown edge to the daylight point (a fill's bent once where its toe band
   * begins, render/earthwork-surface.ts slopeKnee) would not draw truly (a fill on ground falling away beside it
   * follows the ground down in its bands; a cut steps back at its benches and steepens in rock): its height at
   * FACE_AT of the way out, else undefined. */
  face?: number[];
}

/** Where a fill's face is sampled for drawing (fractions of the way from the crown edge to the daylight point). */
export const FACE_AT = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9];
/** A cut at least this deep at its daylight point has its face traced for drawing (a shallower one has no bench), m. */
const CUT_FACE_FROM = 2;
/** A face departing from the simple drawn slope by more than this is drawn from its samples, m. */
const FACE_TOLERANCE = 0.25;
/** The fill face's height at FACE_AT from a traced face (offset, height pairs), when the simple drawn slope (a
 * straight line, bent where the toe band begins) is off by more than FACE_TOLERANCE somewhere. */
export function faceSamples(trace: readonly number[], w: number, z: number, day: number, zDay: number): number[] | undefined {
  const run = day - w, height = zDay - z, cut = height > 0;
  if (!(run > 0.5) || (cut ? height < CUT_FACE_FROM : height >= -SIDE_SLOPES.fillToeHeight - 0.1)) return undefined;
  const at = (o: number) => {
    for (let k = 2; k < trace.length; k += 2) if (trace[k] >= o) {
      const o0 = trace[k - 2], z0 = trace[k - 1], o1 = trace[k], z1 = trace[k + 1];
      return o1 > o0 ? z0 + (z1 - z0) * (o - o0) / (o1 - o0) : z1;
    }
    return trace[trace.length - 1];
  };
  // the simple slope (as slopeKnee draws a fill; a cut: straight, its rock face's bend aside — a stepped face's
  // benches and a rock face are always drawn from the samples)
  const ok = cut ? -1 : day - SIDE_SLOPES.fillToeHeight * SIDE_SLOPES.fillToe, uk = (ok - w) / run, zk = zDay + SIDE_SLOPES.fillToeHeight;
  const simple = (u: number) => !(uk > 0.02 && uk < 0.98) ? z + u * height : u <= uk ? z + (zk - z) * u / uk : zk + (zDay - zk) * (u - uk) / (1 - uk);
  const face = FACE_AT.map(u => at(w + u * run));
  return face.some((v, k) => Math.abs(v - simple(FACE_AT[k])) > FACE_TOLERANCE) ? face : undefined;
}

const STEP = 2.5;
/** at most this much height per slope step: steep rock faces sample the ground and its layers often enough */
const RISE = 2;
const MAX_OFF = 150;

/** ∫ clamp(c, 0, cap) over a strip of width L where the cut depth c runs linearly from c0 to c1 */
export function bandArea(c0: number, c1: number, L: number, cap: number): number {
  if (c0 > c1) { const t = c0; c0 = c1; c1 = t; }
  if (c1 <= 0) return 0;
  if (c0 >= cap) return cap * L;
  const dc = c1 - c0;
  if (dc < 1e-12) return Math.min(cap, c0) * L;
  const a = c0 > 0 ? c0 : 0, b = c1 < cap ? c1 : cap;
  return (((b - a) * (a + b)) / 2 + (c1 > cap ? (c1 - b) * cap : 0)) * (L / dc);
}

const flatGround = () => 0;
/** Flat ground: a whole section (both sides) h m above (fill, h > 0) or below (cut) the ground under a crown
 * `crown` m wide: area, footprint width, cut areas by class [I, II, III], rock face (both sides, m). The same
 * side sections as on real ground, so the grade search's estimate and the bill share one shape. */
export function flatSection(h: number, crown: number, bands: Bands = UNKNOWN_GROUND) {
  const s = sideSection(h, crown / 2, { crownWidth: crown }, flatGround, bands);
  const area = 2 * (h >= 0 ? s.fill : s.cut), cutI = 2 * s.cutI, cutII = 2 * s.cutII;
  return { area, width: 2 * s.day, rockFace: 2 * s.rockFace, subgrade: 2 * s.subgrade,
    cuts: (h >= 0 ? [0, 0, 0] : [cutI, cutII, Math.max(0, area - cutI - cutII)]) as [number, number, number] };
}

/** Accumulate depth caps (cutII is the cumulative second cap until the section is finished). */
function addBands(out: SideResult, bands: Bands | ((o: number) => Bands), o0: number, da: number, o1: number, db: number) {
  const g = typeof bands === 'function' ? bands((o0 + o1) / 2) : bands;
  if (g.normMix) {
    const area = bandArea(-da, -db, o1 - o0, Infinity);
    out.cutI += area * NORM_CAP_I; out.cutII += area * NORM_CAP_II;
  } else {
    out.cutI += bandArea(-da, -db, o1 - o0, g.classIto);
    out.cutII += bandArea(-da, -db, o1 - o0, g.classIIto);
  }
}

/**
 * One side of a section. `ground(o)` gives terrain elevation at offset o (m) on this side. `trace`, if
 * given, receives the slope's vertices (offset, elevation) from the crown edge to where it ends.
 */
export function sideSection(z: number, w: number, _tpl: SectionTemplate, ground: (o: number) => number,
  bands: Bands | ((o: number) => Bands) = UNKNOWN_GROUND, maxOffset = Infinity, trace?: number[], steps?: number[]): SideResult {
  let cut = 0, fill = 0;
  const out: SideResult = { cut: 0, cutI: 0, cutII: 0, fill: 0, day: 0, zDay: 0, open: false, rockFace: 0, subgrade: 0, zSlope: z };
  // Under the crown: integrate (z - G) with sign split. No per-section helper closures:
  // balance search and final billing call this thousands of times on every edit.
  const nCrown = Math.max(2, Math.ceil(w / STEP));
  let oPrev = 0, dPrev = z - ground(0);
  for (let j = 1; j <= nCrown; j++) {
    const o = (w * j) / nCrown;
    const d = z - ground(o), L = o - oPrev;
    if (dPrev < 0 || d < 0) addBands(out, bands, oPrev, dPrev, o, d);
    if (dPrev >= 0 && d >= 0) fill += 0.5 * (dPrev + d) * L;
    else if (dPrev <= 0 && d <= 0) cut -= 0.5 * (dPrev + d) * L;
    else {
      const t = dPrev / (dPrev - d);
      const a0 = 0.5 * dPrev * t * L, a1 = 0.5 * d * (1 - t) * L;
      if (dPrev > 0) { fill += a0; cut -= a1; } else { cut -= a0; fill += a1; }
    }
    oPrev = o; dPrev = d;
  }
  // Beyond the crown edge: the slope direction is set by the ground at the edge; each step takes the face's
  // slope where it starts (fill: by its height above the ground below, cut: by the layer it stands in) and
  // ends at the next band or layer boundary on level ground, so a level-ground section is exact.
  const isFill = dPrev >= 0;
  const sign = isFill ? -1 : 1, height = Math.abs(dPrev);
  const S = SIDE_SLOPES;
  let o0 = w, d0 = dPrev, zs = z, since = 0;
  if (trace) trace.push(w, z);
  if (steps) steps.push(sign);
  const limit = Math.min(w + MAX_OFF, Math.max(w, maxOffset));
  // (the faces of earthengineering.ts fillFace / cutFace, inline: this loop runs for every section of every edit)
  const upper = S.fillUpper + (S.fillHighUpper - S.fillUpper) * Math.max(0, Math.min(1, (height - S.fillStandardTo) / S.fillHighBlend));
  const soil = height <= S.cutShallowDepth ? S.cutShallow : S.cutSoil;
  let g: Bands = typeof bands === 'function' ? UNKNOWN_GROUND : bands;
  while (o0 < limit - 1e-8) {
    let n: number, hold: number, rock = false, bench = false;
    if (isFill) {
      if (d0 > S.fillUpperFrom + 1e-6) { n = upper; hold = d0 - S.fillUpperFrom; }
      else if (d0 > S.fillToeHeight + 1e-6) { n = height > S.fillUpperFrom ? S.fillMiddle : S.fillUpper; hold = d0 - S.fillToeHeight; }
      else { n = S.fillToe; hold = Infinity; }
    } else {
      if (typeof bands === 'function') g = bands(o0 + 0.01); // the ground the face's foot stands in
      const rockN = rockSlope(g), rockFrom = g.normMix || rockN === 'soil' ? Infinity : g.classIIto;
      if (-d0 > rockFrom + 1e-6) { n = rockN as number; hold = -d0 - rockFrom; rock = true; } else { n = soil; hold = Infinity; }
      const every = rock ? S.rockBenchEvery : S.soilBenchEvery;
      if (since >= every - 1e-9) bench = true; else if (every - since < hold) hold = every - since;
    }
    // (at least 5 cm of height a step: on sloping ground the next band begins a little further on each time)
    const dx = bench ? S.benchWidth : Math.min(STEP, n * Math.max(0.05, Math.min(hold, RISE)));
    const o = Math.min(o0 + dx, limit), rise = bench ? 0 : (o - o0) / n;
    const zFace = zs + sign * rise; // fill: the face falls, cut: it rises
    const d = zFace - ground(o);
    const crossed = isFill ? d <= 0 : d >= 0;
    if (steps) steps.push(o0, zs, d0, dx, bench ? 0 : n, zFace, crossed ? zs + (zFace - zs) * (d0 === d ? 0 : d0 / (d0 - d)) : NaN);
    if (crossed) {
      const t = d0 === d ? 0 : d0 / (d0 - d); // d0 = d = 0: slope lies on the ground
      const od = o0 + t * (o - o0);
      // triangle from o0 to daylight
      if (isFill) fill += 0.5 * d0 * (od - o0); else { cut -= 0.5 * d0 * (od - o0); addBands(out, g, o0, d0, od, 0); }
      if (rock && !bench && n < S.rockFaceSteepest) out.rockFace += t * Math.hypot(o - o0, rise);
      out.cut = cut; out.fill = fill; out.cutII -= out.cutI;
      out.day = od; out.zDay = out.zSlope = zs + (zFace - zs) * t;
      if (isFill && height > SUBGRADE.fromHeight && treatedSubgrade(height, typeof bands === 'function' ? bands(od / 2) : bands)) out.subgrade = od;
      if (trace) trace.push(od, out.zDay);
      return out;
    }
    if (isFill) fill += 0.5 * (d0 + d) * (o - o0); else { cut -= 0.5 * (d0 + d) * (o - o0); addBands(out, g, o0, d0, o, d); }
    if (rock && !bench && n < S.rockFaceSteepest) out.rockFace += Math.hypot(o - o0, rise);
    since = bench ? 0 : since + rise;
    o0 = o; d0 = d; zs = zFace;
    if (trace) trace.push(o, zs);
  }
  out.cut = cut; out.fill = fill; out.cutII -= out.cutI;
  out.day = o0; out.zDay = ground(o0); out.zSlope = zs; out.open = limit >= w + MAX_OFF - 1e-8;
  return out;
}

/** The slope's surface `at` m from the centreline on one side (as built without a wall), for walls standing
 * there: the height they retain is |surface − ground|. */
export function slopeSurfaceAt(z: number, w: number, ground: (o: number) => number,
  bands: Bands | ((o: number) => Bands), at: number): number {
  return at <= w ? z : sideSection(z, w, { crownWidth: 2 * w }, ground, bands, at).zSlope;
}

/** slopeSurfaceAt at any `at` ≤ `maxOffset`, the same numbers from one walk down the slope (a wall's search
 * for where it fits asks at every metre) */
export function slopeSurfaceFn(z: number, w: number, ground: (o: number) => number,
  bands: Bands | ((o: number) => Bands), maxOffset: number): (at: number) => number {
  // per step of sideSection's walk: o0, zs, d0, dx, n (0: a bench), the face's end, its daylight (NaN: none)
  const steps: number[] = [];
  sideSection(z, w, { crownWidth: 2 * w }, ground, bands, maxOffset, undefined, steps);
  const sign = steps[0], m = (steps.length - 1) / 7, isFill = sign < 0;
  return (at) => {
    if (at <= w) return z;
    if (!(at <= maxOffset)) return slopeSurfaceAt(z, w, ground, bands, at);
    const limit = Math.min(w + MAX_OFF, Math.max(w, at));
    // the walk to `at` takes the same steps up to the last one starting before it, which it may cut short
    let lo = 0, hi = m; // first step with o0 ≥ limit − 1e-8
    while (lo < hi) { const mid = (lo + hi) >> 1; if (steps[1 + 7 * mid] < limit - 1e-8) lo = mid + 1; else hi = mid; }
    const k = lo - 1;
    if (k < 0) return z;
    const b = 1 + 7 * k, o0 = steps[b], zs = steps[b + 1], d0 = steps[b + 2], dx = steps[b + 3], n = steps[b + 4];
    if (o0 + dx <= limit) return Number.isNaN(steps[b + 6]) ? steps[b + 5] : steps[b + 6];
    const o = limit, zFace = zs + sign * (n === 0 ? 0 : (o - o0) / n), d = zFace - ground(o);
    if (isFill ? d <= 0 : d >= 0) return zs + (zFace - zs) * (d0 === d ? 0 : d0 / (d0 - d));
    return zFace;
  };
}

export interface Sections {
  cut: Float64Array;
  /** cut area by mapped geology + estimated weathering profile (cut = cutI + cutII + cutIII) */
  cutI: Float64Array;
  cutII: Float64Array;
  cutIII: Float64Array;
  fill: Float64Array;
  dayL: Float64Array;
  dayR: Float64Array;
  zDayL: Float64Array;
  zDayR: Float64Array;
  open: Uint8Array;
  /** netted rock face of both cut slopes, m measured down the slope */
  rockFace: Float64Array;
  /** soft ground treated under the fill, m across */
  subgrade: Float64Array;
  /** Optional final-engineering cache; omitted from DP/balance sampling and from Result. */
  sideL?: SideResult[]; sideR?: SideResult[];
  /** The final engineering's fill faces that the simple drawn slope would not draw truly (SideResult.face). */
  faceL?: (number[] | undefined)[]; faceR?: (number[] | undefined)[];
}

/** Evaluation-local raw sections for profile-only retries. Discard when terrain, horizontal
 * geometry or template changes; never keep across evaluate calls (terrain arrays are mutable).
 * Entries are separate from the mutable Sections arrays subsequently truncated by retaining walls. */
export type SectionCache = { z: number; left: SideResult; right: SideResult }[];

/** compute sections at all stations; normal = left of travel direction */
export function computeSections(terrain: Terrain, n: number, x: ArrayLike<number>, y: ArrayLike<number>,
  tx: ArrayLike<number>, ty: ArrayLike<number>, z: ArrayLike<number>, tpl: SectionTemplate, keepSides = false, cache?: SectionCache,
  widen?: ArrayLike<number>): Sections {
  const out: Sections = {
    cut: new Float64Array(n), cutI: new Float64Array(n), cutII: new Float64Array(n), cutIII: new Float64Array(n),
    fill: new Float64Array(n), dayL: new Float64Array(n), dayR: new Float64Array(n),
    zDayL: new Float64Array(n), zDayR: new Float64Array(n), open: new Uint8Array(n), rockFace: new Float64Array(n), subgrade: new Float64Array(n),
    ...(keepSides ? { sideL: new Array<SideResult>(n), sideR: new Array<SideResult>(n) } : {}),
  };
  const w0 = tpl.crownWidth / 2;
  for (let i = 0; i < n; i++) {
    const nx = -ty[i], ny = tx[i];
    const cx = x[i], cy = y[i], w = w0 + (widen?.[i] ?? 0); // a hairpin's widened lanes
    const previous = cache?.[i], reuse = previous?.z === z[i] && !widen?.[i];
    // (the final engineering keeps each fill face's shape for drawing: traced once, kept with the cached side)
    const side = (sign: number, kept?: SideResult) => {
      const ground = (o: number) => terrain.heightAt(cx + nx * o * sign, cy + ny * o * sign), bands = (o: number) => terrain.groundAt(cx + nx * o * sign, cy + ny * o * sign);
      if (kept && (!keepSides || kept.face !== undefined || 'face' in kept || (kept.zDay >= z[i] - SIDE_SLOPES.fillToeHeight - 0.1 && kept.zDay < z[i] + CUT_FACE_FROM))) return kept;
      if (!keepSides) return sideSection(z[i], w, tpl, ground, bands);
      const trace: number[] = [], out = sideSection(z[i], w, tpl, ground, bands, Infinity, trace);
      out.face = faceSamples(trace, w, z[i], out.day, out.zDay);
      return out;
    };
    const L = side(1, reuse ? previous.left : undefined);
    const R = side(-1, reuse ? previous.right : undefined);
    if (cache && !reuse) cache[i] = { z: z[i], left: L, right: R };
    if (out.sideL && out.sideR) { out.sideL[i] = L; out.sideR[i] = R; }
    if (keepSides && (L.face || R.face)) { (out.faceL ??= [])[i] = L.face; (out.faceR ??= [])[i] = R.face; }
    out.cut[i] = L.cut + R.cut;
    out.cutI[i] = L.cutI + R.cutI;
    out.cutII[i] = L.cutII + R.cutII;
    out.cutIII[i] = Math.max(0, out.cut[i] - out.cutI[i] - out.cutII[i]);
    out.fill[i] = L.fill + R.fill;
    out.dayL[i] = L.day; out.dayR[i] = R.day;
    out.zDayL[i] = L.zDay; out.zDayR[i] = R.zDay;
    out.open[i] = L.open || R.open ? 1 : 0;
    out.rockFace[i] = L.rockFace + R.rockFace;
    out.subgrade[i] = L.subgrade + R.subgrade;
  }
  return out;
}
