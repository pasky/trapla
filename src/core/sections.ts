// Cross-sections: a flat crown of the category width at the grade elevation, with fill slopes
// 1:nFill and cut slopes 1:nCut down/up to the terrain (daylight point), integrated against the
// ground sampled across the alignment.

import { NORM_CAP_I, NORM_CAP_II, UNKNOWN_GROUND, type GroundProfile } from './ground';

type Bands = Pick<GroundProfile, 'classIto' | 'classIIto' | 'normMix'>;
import type { Terrain } from './terrain';
import { flatBermCutBands, flatEarthGeometry, nextSlopeKink, slopeHeight } from './earthengineering';

export interface SectionTemplate {
  crownWidth: number;
  /** horizontal : vertical, e.g. 2 for 1:2 */
  fillSlope: number;
  cutSlope: number;
}

/** PROVISIONAL default side slopes — placeholders pending geology */
export const DEFAULT_SLOPES = { fillSlope: 2, cutSlope: 1.75 };

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
}

const STEP = 2.5;
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

/** flat ground: areas [class I, II, III] of a cut of depth c under a crown of width b with slopes 1:n */
export function flatCutBands(c: number, b: number, n: number, bands: Bands = UNKNOWN_GROUND): [number, number, number] {
  if (bands.normMix) {
    const total = flatEarthGeometry(c, b, n, false).area;
    return [total * NORM_CAP_I, total * (NORM_CAP_II - NORM_CAP_I), total * (1 - NORM_CAP_II)];
  }
  // No per-call closure: the DP builds several thousand entries per local ground category.
  const m1 = Math.min(c, bands.classIto), m2 = Math.min(c, bands.classIIto);
  const a1 = b * m1 + 2 * n * m1 * (c - m1 / 2);
  const a2 = b * m2 + 2 * n * m2 * (c - m2 / 2);
  const extra = flatBermCutBands(c, bands.classIto, bands.classIIto);
  return [a1 + extra[0], a2 - a1 + extra[1], b * c + n * c * c - a2 + extra[2]];
}

/**
 * One side of a section. `ground(o)` gives terrain elevation at offset o (m) on this side.
 */
export function sideSection(z: number, w: number, tpl: SectionTemplate, ground: (o: number) => number,
  bands: Bands | ((o: number) => Bands) = UNKNOWN_GROUND): SideResult {
  let cut = 0, fill = 0, capI = 0, capII = 0;
  /** Midpoint geology on each ≤2.5 m strip, including the daylight triangle. */
  const band = (o0: number, da: number, o1: number, db: number) => {
    const g = typeof bands === 'function' ? bands((o0 + o1) / 2) : bands;
    if (g.normMix) {
      const area = bandArea(-da, -db, o1 - o0, Infinity);
      capI += area * NORM_CAP_I; capII += area * NORM_CAP_II;
    } else {
      capI += bandArea(-da, -db, o1 - o0, g.classIto);
      capII += bandArea(-da, -db, o1 - o0, g.classIIto);
    }
  };
  // under the crown: integrate (z - G) from 0 to w with sign split
  const nCrown = Math.max(2, Math.ceil(w / STEP));
  let oPrev = 0, dPrev = z - ground(0);
  const acc = (o0: number, d0: number, o1: number, d1: number) => {
    const L = o1 - o0;
    if (d0 < 0 || d1 < 0) band(o0, d0, o1, d1);
    if (d0 >= 0 && d1 >= 0) fill += 0.5 * (d0 + d1) * L;
    else if (d0 <= 0 && d1 <= 0) cut -= 0.5 * (d0 + d1) * L;
    else {
      const t = d0 / (d0 - d1);
      const a0 = 0.5 * d0 * t * L, a1 = 0.5 * d1 * (1 - t) * L;
      if (d0 > 0) { fill += a0; cut -= a1; } else { cut -= a0; fill += a1; }
    }
  };
  for (let j = 1; j <= nCrown; j++) {
    const o = (w * j) / nCrown;
    const d = z - ground(o);
    acc(oPrev, dPrev, o, d);
    oPrev = o; dPrev = d;
  }
  // beyond the crown edge: slope direction set by ground at the edge
  const isFill = dPrev >= 0;
  const n = isFill ? tpl.fillSlope : tpl.cutSlope;
  const tmpl = (o: number) => z + (isFill ? -1 : 1) * slopeHeight(o - w, n, isFill);
  let o0 = w, d0 = dPrev;
  while (o0 < w + MAX_OFF - 1e-8) {
    const o = Math.min(o0 + STEP, w + nextSlopeKink(o0 - w, n, isFill), w + MAX_OFF);
    const g = ground(o);
    const d = tmpl(o) - g;
    const crossed = isFill ? d <= 0 : d >= 0;
    if (crossed) {
      const t = d0 === d ? 0 : d0 / (d0 - d); // d0 = d = 0: slope lies on the ground
      const od = o0 + t * (o - o0);
      // triangle from o0 to daylight
      if (isFill) fill += 0.5 * d0 * (od - o0); else { cut -= 0.5 * d0 * (od - o0); band(o0, d0, od, 0); }
      return { cut, cutI: capI, cutII: capII - capI, fill, day: od, zDay: tmpl(od), open: false };
    }
    if (isFill) fill += 0.5 * (d0 + d) * (o - o0); else { cut -= 0.5 * (d0 + d) * (o - o0); band(o0, d0, o, d); }
    o0 = o; d0 = d;
  }
  return { cut, cutI: capI, cutII: capII - capI, fill, day: o0, zDay: ground(o0), open: true };
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
}

/** compute sections at all stations; normal = left of travel direction */
export function computeSections(terrain: Terrain, n: number, x: ArrayLike<number>, y: ArrayLike<number>,
  tx: ArrayLike<number>, ty: ArrayLike<number>, z: ArrayLike<number>, tpl: SectionTemplate): Sections {
  const out: Sections = {
    cut: new Float64Array(n), cutI: new Float64Array(n), cutII: new Float64Array(n), cutIII: new Float64Array(n),
    fill: new Float64Array(n), dayL: new Float64Array(n), dayR: new Float64Array(n),
    zDayL: new Float64Array(n), zDayR: new Float64Array(n), open: new Uint8Array(n),
  };
  const w = tpl.crownWidth / 2;
  for (let i = 0; i < n; i++) {
    const nx = -ty[i], ny = tx[i];
    const cx = x[i], cy = y[i];
    const L = sideSection(z[i], w, tpl, (o) => terrain.heightAt(cx + nx * o, cy + ny * o),
      (o) => terrain.groundAt(cx + nx * o, cy + ny * o));
    const R = sideSection(z[i], w, tpl, (o) => terrain.heightAt(cx - nx * o, cy - ny * o),
      (o) => terrain.groundAt(cx - nx * o, cy - ny * o));
    out.cut[i] = L.cut + R.cut;
    out.cutI[i] = L.cutI + R.cutI;
    out.cutII[i] = L.cutII + R.cutII;
    out.cutIII[i] = Math.max(0, out.cut[i] - out.cutI[i] - out.cutII[i]);
    out.fill[i] = L.fill + R.fill;
    out.dayL[i] = L.day; out.dayR[i] = R.day;
    out.zDayL[i] = L.zDay; out.zDayR[i] = R.zDay;
    out.open[i] = L.open || R.open ? 1 : 0;
  }
  return out;
}
