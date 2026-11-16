// Noise decisions: which dwellings the road makes too loud, the walls Auto builds (cheapest height first,
// placed in the cross-section), and the buyouts where no wall can help. Levels are finite-segment energy
// sums (noise-field.ts: Manuál 2018 §1.10–1.11, §1.19) at every storey of each dwelling, day and night.
// Planning calculation, not a legal assessment. research/11-noise-calculation.md §6.
import { noiseBuyoutCost, type BuildingIndex } from './buildings';
import { NOISE } from './data/urban';
import * as dm from './detmath';
import { KIND } from './structures';
import {
  cellOptions, segmentFlags, MAX_STOREYS, openBound, lineEnvelope, openTransfer, type CellOptions, emptyScreen, lineTransfer, noiseField, transferDelta, pointTransfer, transferBuffers, NOISE_REACH,
  type AcousticSource, type NoiseField, type Propagation, type SideScreen, type Sum, FAR_ERROR,
} from './noise-field';

/** Tests: every house cell by cell (the reference the two-stage decisions must equal). */
export const NOISE_EXACT = { all: false };
import { noiseLevels, type NoiseModel } from './road-noise';
import type { Result } from './evaluate';
export { noiseDistance } from './road-noise';

// ---- the cross-section: where walls stand, what screens ------------------------------------------

/** Per-station wall line and screening edges from the actual cross-section (TP 104/2024 §3.4):
 *  - embankment / at grade: wall at crown/2 + NOISE.wallEdgeOffset on road level; the crown edge screens
 *    a lower house (Manual §1.11 "konfigurace terénu");
 *  - bridge: the same on the deck's edge beam; the deck edge screens;
 *  - cut: the wall stands on the cut's top edge (never inside the slope), the edge itself screens;
 *  - tunnel: nothing gets out (portals are not modelled).
 * `groundAt(i, offset)` = terrain elevation at that offset on side `left`. */
export function crossSectionScreens(n: number, kind: ArrayLike<number>, grade: ArrayLike<number>, crownWidth: number,
  dayL: ArrayLike<number>, dayR: ArrayLike<number>, zDayL: ArrayLike<number>, zDayR: ArrayLike<number>,
  groundAt: (i: number, left: boolean, offset: number) => number, gaps?: { L: ArrayLike<number>; R: ArrayLike<number> }): { L: SideScreen; R: SideScreen } {
  const L = emptyScreen(n), R = emptyScreen(n), half = crownWidth / 2, edge = half + NOISE.wallEdgeOffset;
  for (const [s, left, day, zDay] of [[L, true, dayL, zDayL], [R, false, dayR, zDayR]] as const) {
    for (let i = 0; i < n; i++) {
      s.gap[i] = (left ? gaps?.L : gaps?.R)?.[i] ? 1 : 0;
      if (kind[i] === KIND.tunnel) { s.shield[i] = 1; s.gap[i] = 1; continue; }
      s.wallOff[i] = edge;
      if (kind[i] === KIND.earth && zDay[i] > grade[i]) {
        // a cut: its top edge screens; the wall goes on it (or, where the cut is shallower than the
        // crown allowance, on the ground just beyond the crown)
        s.edgeOff[i] = day[i]; s.edgeTop[i] = zDay[i] - grade[i];
        if (day[i] >= edge) { s.wallOff[i] = day[i]; s.wallFoot[i] = zDay[i] - grade[i]; }
        else s.wallFoot[i] = Math.max(0, groundAt(i, left, edge) - grade[i]);
      } else {
        s.edgeOff[i] = half; s.edgeTop[i] = 0; s.edgeLane[i] = 1;
      }
    }
  }
  return { L, R };
}

/** Length of each station's piece of a wall line at `off[i]` beside the axis (as drawn), m. */
export function wallLineLengths(n: number, x: ArrayLike<number>, y: ArrayLike<number>, tx: ArrayLike<number>,
  ty: ArrayLike<number>, off: ArrayLike<number>, left: boolean): Float64Array {
  const sgn = left ? 1 : -1, out = new Float64Array(n);
  const px = (i: number) => x[i] - ty[i] * off[i] * sgn, py = (i: number) => y[i] + tx[i] * off[i] * sgn;
  for (let i = 0; i + 1 < n; i++) {
    const half = Math.hypot(px(i + 1) - px(i), py(i + 1) - py(i)) / 2;
    out[i] += half; out[i + 1] += half;
  }
  return out;
}

// ---- policy --------------------------------------------------------------------------------------

/** Explicit purchases are handled by the caller's demolished mask, before exposure. */
export interface NoisePolicy {
  keptBuildingIds?: ReadonlySet<number>;
  /** Station-indexed actual wall decisions: NaN/absent = auto, 0 = removed, 2…6 = built. */
  wallL?: ArrayLike<number>;
  wallR?: ArrayLike<number>;
}
function manualWall(policy: NoisePolicy | undefined, left: boolean, i: number): number | undefined {
  const h = (left ? policy?.wallL : policy?.wallR)?.[i];
  return h !== undefined && Number.isFinite(h) && (h === 0 || (h >= NOISE.playerWallHeights[0] && h <= NOISE.playerWallHeights[NOISE.playerWallHeights.length - 1])) ? h : undefined;
}

// ---- receivers -----------------------------------------------------------------------------------

/** Retained dwelling's remaining failure after all actual walls and cut edges. */
export interface NoiseUnresolved {
  j: number; i: number; side: 'L' | 'R';
  /** Remaining excess above the controlling limit at the loudest storey, dB. */
  excess: number;
  /** Actual built height facing it, m. */
  wall: number;
  /** A sufficient wall (one stretch, 2–6 m) on top of what is built, or none: `gap` = the noise comes
   * through a junction opening no wall can close. */
  fix?: { height: number; s0: number; s1: number } ;
  gap?: boolean;
}

/** Day / night energies (10^(L/10)) per storey from one physical source: what a project sums. */
export interface NoiseEnergy {
  sourceId: string;
  /** open ground (no walls, no cuts) and as built, per storey from the ground floor up */
  rawDay: Float64Array; rawNight: Float64Array;
  day: Float64Array; night: Float64Array;
}

/** Noise outcome of one dwelling near the road (the noise view's colours, the house card). */
export interface NoiseReceiver {
  /** building index */
  j: number;
  /** wall = walls bring it within the limit; cut = cuts / road edges alone do; ok = within the limit on open
   * ground; bought = nothing suffices, acquired and demolished. Check `unresolved` FIRST. */
  status: 'wall' | 'cut' | 'ok' | 'bought';
  /** where it is assessed: 2 m in front of the façade nearest the road (plan), the station nearest to it,
   * the side, horizontal distance from the axis there, m */
  x: number; y: number; i: number; side: 'L' | 'R'; d: number;
  /** ground elevation at the house, storeys (receivers 1.5 m above each floor) */
  ground: number; storeys: number;
  /** the loudest storey as built (0 = ground floor) and its height above our road at i, m */
  floor: number; h: number;
  /** controlling-period level minus its limit at the loudest storey, dB: open ground, and as built
   * (bought: as it would be with the best automatic walls, i.e. the shortfall) */
  raw: number; mitigated: number;
  /** level with the cuts and road edges only, dB over the limit */
  earth: number;
  /** its own automatic wall request (0 = none, Infinity = beyond 5 m), the built height facing it, the
   * station the request is centred on (−1 = none) */
  need: number; wall: number; at: number;
  unresolved?: NoiseUnresolved;
  energy: NoiseEnergy;
  /** stations summed cell by cell for it (its decision window): the card repeats the same sum */
  window: [number, number];
  /** how finely the road beyond its window was summed (Sum; absent = grouped): finer where a decision was near
   * its threshold */
  sum?: Sum;
  /** stations of its own automatic wall request, when it made one (the card offers that stretch) */
  span?: [number, number];
}

export interface WallStretch {
  side: 'L' | 'R';
  i0: number;
  i1: number;
  /** station range, m */
  s0: number;
  s1: number;
  /** uniform height of the stretch (billed above its foot), m */
  height: number;
}

export interface NoiseOutcome {
  /** final wall heights per station (manual decisions included), m */
  L: Float64Array; R: Float64Array;
  walls: WallStretch[];
  /** walls Auto adds for houses beside the player's wall choices (part of `walls`) */
  aroundChoices: WallStretch[];
  receivers: NoiseReceiver[];
  boughtOut: { j: number; i: number; cost: number }[];
  unresolved: NoiseUnresolved[];
  field: NoiseField;
}

interface Candidate {
  j: number; i: number; left: boolean; d: number; x: number; y: number; ground: number; z: Float64Array;
  fixedExcess: number; rawExcess: number; earthExcess: number;
  need: number; lo: number; hi: number;
  /** how finely its far part is summed (staged decisions) */
  sum: Sum;
  /** processing order: its window's own level, loudest first */
  order: number;
}

/** A cleared visited-set over a building index's dwellings (one stamp array per index, reused). */
const stamps = new WeakMap<BuildingIndex, { mark: Int32Array; gen: number }>();
function visited(b: BuildingIndex) {
  let st = stamps.get(b);
  if (!st || st.mark.length !== b.n) stamps.set(b, st = { mark: new Int32Array(b.n), gen: 0 });
  const s = st, gen = ++s.gen;
  if (gen === 0x7fffffff) { s.mark.fill(0); s.gen = 1; }
  const g = s.gen;
  return { has: (j: number) => s.mark[j] === g, add: (j: number) => { s.mark[j] = g; } };
}
const dB = (q: number) => (q > 0 ? 10 * dm.log10(q) : -Infinity);
const maxOf = (a: ArrayLike<number>) => { let m = -Infinity; for (let k = 0; k < a.length; k++) if (a[k] > m) m = a[k]; return m; };

/** Storey receiver elevations of building j: 1.5 m above each floor. */
function storeys(buildings: BuildingIndex, j: number, ground: number): Float64Array {
  const m = Math.max(1, Math.round(buildings.levels[j]));
  return Float64Array.from({ length: m }, (_, k) => ground + NOISE.receiverHeight + k * NOISE.storeyHeight);
}

/** Houses within this distance (an open straight road there is ≥ 1 dB under the limit) are always assessed.
 * Slant metres from the near-lane source. */
const MARGIN_DB = 1, DESCENT = [-8, -1, 1, 8];
function searchRadius(model: NoiseModel): number {
  if (!(model.radius > 0)) return 0;
  let lo = model.radius, hi = model.radius * 2;
  while (noiseLevels(hi, NOISE.receiverHeight, model).excessDb + MARGIN_DB > 0 && hi < NOISE_REACH) hi *= 1.5;
  for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (noiseLevels(mid, NOISE.receiverHeight, model).excessDb + MARGIN_DB > 0) lo = mid; else hi = mid; }
  return Math.min(NOISE_REACH, hi);
}
/** max over d and receiver height of d · 10^(−U/10), per ground class (noise-field's lineEnvelope) */
function maxDLin(ground: Propagation): number {
  return lineEnvelope(ground).M;
}
/**
 * Beyond this distance from every cell no house can reach the limit (research/36 §2): a cell r away adds at
 * most l·M/(π (r − l/2)²) of the reference energy (M = max_d d·10^(−U(d)/10)); along a road that recedes
 * from the house on both sides of its nearest point and sweeps at most 360° around it, Σ l/r² ≤ (2 + 2π)/R
 * (ds ≤ |dr| + r|dθ|), so the whole road adds ≤ (2 + 2π)·M/(π R).
 */
function boundRadius(excessDb: number, ground: Propagation): number {
  return (2 + 2 * Math.PI) / Math.PI * maxDLin(ground) * dm.pow(10, excessDb / 10);
}
/** dB: the far grouping's error against the cell-by-cell sum stays below this (research/36 §2) */
const OUTER_CHECK_DB = 0.5;

/**
 * Exposure, automatic walls and buyouts, then every dwelling's final levels.
 * - candidates: dwellings within the search radius of any open station (spatial hash, de-duplicated);
 * - houses over the limit with cuts / edges / manual walls are handled loudest first (by their window's own level): buyout if no
 *   automatic wall (5 m, the window widened as far as it could matter) suffices and nothing manual
 *   protects it; else, unless walls already built for others suffice, the height (2…5 m) whose one
 *   contiguous wall — grown from the most useful cell towards the more useful end until every storey is
 *   within the limit, at least NOISE.minWallLengthFactor × its distance from the wall long — adds the
 *   least wall area (the cheapest, at one price per m²);
 * - manual decisions override; no wall in tunnels or junction openings.
 */
export function noiseOutcome(src: AcousticSource, model: NoiseModel, buildings: BuildingIndex,
  demolished: ArrayLike<number>, groundAt: (x: number, y: number) => number, s: ArrayLike<number>,
  policy?: NoisePolicy): NoiseOutcome {
  const n = src.n, field = noiseField(src);
  const radius = searchRadius(model);
  const T = dm.pow(10, -model.excessDb / 10); // energy fraction of Y at which the controlling period meets its limit
  const excessOf = (q: number) => dB(q) + model.excessDb;
  // manual walls as fixed heights (0 where removed; NaN auto)
  const manL = new Float64Array(n).fill(NaN), manR = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const l = manualWall(policy, true, i), r = manualWall(policy, false, i);
    if (l !== undefined && !src.L.shield[i] && !src.L.gap[i]) manL[i] = l;
    if (r !== undefined && !src.R.shield[i] && !src.R.gap[i]) manR[i] = r;
  }
  const fixedL = Float64Array.from(manL, v => (v > 0 ? v : 0)), fixedR = Float64Array.from(manR, v => (v > 0 ? v : 0));
  let anyFixed = false;
  for (let i = 0; i < n && !anyFixed; i++) if (fixedL[i] > 0 || fixedR[i] > 0) anyFixed = true;
  const passL = anyFixed ? fixedL : null, passR = anyFixed ? fixedR : null;

  // 1. candidates and their receiver points
  const items = buildings.items, seen = visited(buildings), list: number[] = [], best = new Map<number, number>(), bestI = new Map<number, number>();
  // every hash cell along the route once; then each dwelling's nearest station by descent from the station
  // nearest its cell
  // the emission weight a cell may carry above the source's reference (1 without weights)
  let wMax = 1;
  if (src.weight) for (let i = 0; i < n; i++) wMax = Math.max(wMax, src.weight[i]);
  const env = lineEnvelope(field.ground);
  const outer = Number.isFinite(model.excessDb) ? Math.max(radius, boundRadius(model.excessDb, field.ground) * wMax) : 0;
  const ds = n > 1 ? (s[n - 1] - s[0]) / (n - 1) : 1;
  if (outer > 0) buildings.alongCells(src.x, src.y, n, outer + NOISE.facadeOffset + NOISE.sourceOffset, (cell, i) => {
    for (const j of cell) if (!seen.has(j)) { seen.add(j); candidate(j, i); }
  });
  function candidate(j: number, i: number) {
    if (!buildings.dwelling[j] || demolished[j]) return;
    // its nearest station: descent from its centre's projection on the tangent of the station nearest its
    // hash cell
    const [hx, hy] = items[j];
    let bi = Math.max(0, Math.min(n - 1, i + Math.round(((hx - src.x[i]) * src.tx[i] + (hy - src.y[i]) * src.ty[i]) / ds)));
    let b2 = buildings.facadeDistanceSq(j, src.x[bi], src.y[bi]);
    for (let moved = true; moved;) {
      moved = false;
      for (let q = 0; q < 4; q++) {
        const k = bi + DESCENT[q];
        if (k < 0 || k >= n) continue;
        const f2 = buildings.facadeDistanceSq(j, src.x[k], src.y[k]);
        if (f2 < b2) { b2 = f2; bi = k; moved = true; }
      }
    }
    let bd = buildings.facadeDistance(j, src.x[bi], src.y[bi]);
    if (bd - NOISE.facadeOffset - NOISE.sourceOffset >= outer) return;
    if (src.L.shield[bi] && src.R.shield[bi]) {
      // nearest to a tunnel: assessed from the nearest open station (the portal), never dropped
      let k0 = bi, k1 = bi;
      while (k0 >= 0 && src.L.shield[k0] && src.R.shield[k0]) k0--;
      while (k1 < n && src.L.shield[k1] && src.R.shield[k1]) k1++;
      const d0 = k0 >= 0 ? buildings.facadeDistance(j, src.x[k0], src.y[k0]) : Infinity;
      const d1 = k1 < n ? buildings.facadeDistance(j, src.x[k1], src.y[k1]) : Infinity;
      if (!Number.isFinite(Math.min(d0, d1))) return; // all tunnel
      if (d0 <= d1) { bi = k0; bd = d0; } else { bi = k1; bd = d1; }
      if (bd - NOISE.facadeOffset - NOISE.sourceOffset >= outer) return;
    }
    list.push(j); best.set(j, bd); bestI.set(j, bi);
  }
  list.sort((a, b) => a - b);
  const reachCells = Math.max(1, Math.round(NOISE.wallWindow / Math.max(1e-6, (s[n - 1] - s[0]) / Math.max(1, n - 1))));
  // decisions and levels share one exact (cell-by-cell) window per house
  const windowOf = (c: { i: number }, scale = 1): [number, number] => [Math.max(0, c.i - reachCells * scale), Math.min(n - 1, c.i + reachCells * scale)];
  const cands: Candidate[] = [];
  for (const j of list) {
    const i = bestI.get(j)!;
    const [fx, fy] = buildings.facadePoint(j, src.x[i], src.y[i]);
    const vx = src.x[i] - fx, vy = src.y[i] - fy, vl = Math.hypot(vx, vy);
    const step = Math.min(NOISE.facadeOffset, Math.max(0, vl - 1));
    const x = vl > 1e-9 ? fx + vx / vl * step : fx, y = vl > 1e-9 ? fy + vy / vl * step : fy;
    // beyond the always-assessed radius: first the rigorous open-road bound at its receiver point
    if (best.get(j)! - NOISE.facadeOffset - NOISE.sourceOffset >= radius && excessOf(openBound(field, x, y, env, wMax)) <= -OUTER_CHECK_DB) continue;
    const c = -(x - src.x[i]) * src.ty[i] + (y - src.y[i]) * src.tx[i];
    const ground = groundAt(items[j][0], items[j][1]);
    cands.push({ j, i, left: c >= 0, d: Math.max(1, Math.abs(c)), x, y, ground, z: storeys(buildings, j, ground),
      fixedExcess: 0, rawExcess: 0, earthExcess: 0, need: 0, lo: -1, hi: -2, sum: NOISE_EXACT.all ? 2 : 0, order: 0 });
  }

  // houses beyond the always-assessed radius: only if the open road could bring them near the limit
  const quick = new Float64Array(MAX_STOREYS);
  for (let k = cands.length - 1; k >= 0; k--) {
    const c = cands[k];
    if (best.get(c.j)! - NOISE.facadeOffset - NOISE.sourceOffset < radius) continue;
    const open = quick.subarray(0, c.z.length);
    openTransfer(field, c.x, c.y, c.z, open);
    if (excessOf(maxOf(open)) <= -OUTER_CHECK_DB) cands.splice(k, 1);
  }

  // 2. levels with cuts, edges and manual walls only: the part beyond each house's decision window summed
  // once (pointTransfer), the window cell by cell (cellOptions) — decisions and final levels reuse both
  const buf = transferBuffers(MAX_STOREYS);
  const view = (t: typeof buf, m: number) => ({ raw: t.raw.subarray(0, m), earth: t.earth.subarray(0, m), screened: t.screened.subarray(0, m) });
  const heights = [...NOISE.wallHeights, 6];
  const autoMax = NOISE.wallHeights.length; // option index of the highest automatic height
  const optionOf = (h: number) => {
    if (!(h > 0)) return 0;
    let o = 0;
    for (let k = 0; k < heights.length; k++) if (h >= heights[k] - 1e-9) o = k + 1;
    return o;
  };
  interface Decision { w0: number; w1: number; cells: CellOptions; F: Float64Array; Fraw: Float64Array; Fearth: Float64Array;
    /** F plus every window cell with nothing but its edge or the player's wall (option 0); W0 the window's part */
    F0: Float64Array; W0: Float64Array;
    /** the whole road's open-ground / edges-only sums */
    raw: Float64Array; earth: Float64Array;
    /** outside the window with the highest automatic wall wherever one may stand (lazy): F − this bounds
     * what any wall beyond the window could take away */
    Fmax?: Float64Array;
    /** how finely its far sums are summed; its window's scale */
    sum: Sum; scale: number }
  const data = new Map<number, Decision>();
  /** level per storey with walls L / R: outside part + each window cell at its wall's option */
  const levelWith = (d: Decision, wl: ArrayLike<number>, wr: ArrayLike<number>, H: number, out: Float64Array, from = d.F0) => {
    out.set(from);
    const cells = d.cells, wallable = cells.wallable, side = cells.side;
    for (let i = d.w0; i <= d.w1; i++) {
      const c = i - d.w0;
      if (!wallable[c]) continue;
      const h = (side[c] ? wl : wr)[i];
      if (!(h > 0)) continue;
      const o = optionOf(h);
      if (o === 0) continue;
      const e = cells.opt(o), e0 = cells.opt(0), b = c * H;
      for (let k = 0; k < H; k++) out[k] += e[b + k] - e0[b + k];
    }
    return out;
  };
  /** a house's decision data over its window (`scale` × the starting one); `from`: the one before it, whose
   * cell-by-cell sum outside loses just the cells the wider window now holds (always so cell by cell: the same
   * numbers however the house got there). Kept: a house refined after a decision recomputes only what it needs. */
  const decisions = new Map<string, Decision>();
  const decision = (c: Candidate, scale: number, from?: Decision): Decision => {
    const key = `${c.j}:${scale}:${c.sum}`, kept = decisions.get(key);
    if (kept) return kept;
    if (c.sum === 2 && scale > 1 && !from) from = decision(c, scale / 2);
    const H = c.z.length, t = view(buf, H), [w0, w1] = windowOf(c, scale);
    const cells = cellOptions(field, c.x, c.y, c.z, w0, w1, heights, manL, manR);
    const e0 = cells.opt(0);
    if (c.sum === 2 && from?.sum === 2) {
      t.screened.set(from.F); t.raw.set(from.Fraw); t.earth.set(from.Fearth);
      for (let i = w0; i <= w1; i++) {
        if (i >= from.w0 && i <= from.w1) continue;
        const q = (i - w0) * H;
        for (let k = 0; k < H; k++) { t.screened[k] -= e0[q + k]; t.raw[k] -= cells.raw[q + k]; t.earth[k] -= cells.edge[q + k]; }
      }
    } else pointTransfer(field, c.x, c.y, c.z, passL, passR, t, w0, w1, true, undefined, c.sum);
    // one slab: F, its raw / earth parts, F0, and the window's raw / earth sums
    const W0 = new Float64Array(H), slab = new Float64Array(6 * H), F = slab.subarray(0, H), Fraw = slab.subarray(H, 2 * H), Fearth = slab.subarray(2 * H, 3 * H);
    const F0 = slab.subarray(3 * H, 4 * H), raw = slab.subarray(4 * H, 5 * H), earth = slab.subarray(5 * H);
    F.set(t.screened); Fraw.set(t.raw); Fearth.set(t.earth); F0.set(t.screened); raw.set(t.raw); earth.set(t.earth);
    for (let q = 0, m = w1 - w0 + 1; q < m; q++) for (let k = 0; k < H; k++) {
      F0[k] += e0[q * H + k]; W0[k] += e0[q * H + k]; raw[k] += cells.raw[q * H + k]; earth[k] += cells.edge[q * H + k];
    }
    const d: Decision = { w0, w1, cells, F, Fraw, Fearth, F0, W0, raw, earth, sum: c.sum, scale };
    decisions.set(key, d);
    return d;
  };
  // Stages (research/36 §2): every house first with the grouped far sums, which are within FAR_ERROR[sum] × their
  // own value of the cell-by-cell sums. Every comparison that decides an outcome (a level against the limit,
  // the loudest storey, a wall's start, growth and stop, the window bound, the final level) checks that margin;
  // where it could flip, the house is summed more finely (then cell by cell) and that step of it redone. A
  // comparison clear of its margin comes out as it would cell by cell, so walls, buyouts and violations are
  // those of the cell-by-cell sums everywhere (a step redone after a refinement keeps nothing of its first try).
  const lim = T * (1 + 1e-9);
  let refined = false;
  const finer = (c: Candidate, to?: Sum) => { if (c.sum < 2) { c.sum = to ?? (c.sum + 1) as Sum; refined = true; } };
  /** maxOf(lev) > the limit, with storey k's far sums `far[k]` (grouped for this house: flags it where the
   * answer could differ cell by cell) */
  const over = (c: Candidate, lev: ArrayLike<number>, far: ArrayLike<number>, limit = lim) => {
    const res = maxOf(lev) > limit;
    const E = FAR_ERROR[c.sum];
    if (E > 0) {
      let sure = !res;
      for (let k = 0; k < lev.length; k++) {
        if (res && lev[k] - E * far[k] > limit) { sure = true; break; }
        if (!res && lev[k] + E * far[k] > limit) { sure = false; break; }
      }
      if (!sure) finer(c);
    }
    return res;
  };
  for (const c of cands) {
    const H = c.z.length;
    let d: Decision, fixed: Float64Array;
    do {
      refined = false;
      d = decision(c, 1);
      fixed = levelWith(d, fixedL, fixedR, H, new Float64Array(H));
      // exposed or not (open ground / edges only: a label, from these sums either way)
      over(c, fixed, d.F);
    } while (refined);
    data.set(c.j, d);
    c.rawExcess = excessOf(maxOf(d.raw)); c.earthExcess = excessOf(maxOf(d.earth)); c.fixedExcess = excessOf(maxOf(fixed));
    // (handled loudest first by its window's own level, summed cell by cell: the same however its far part is)
    c.order = maxOf(levelWith(d, fixedL, fixedR, H, new Float64Array(H), d.W0));
  }

  // 3. decisions, loudest first
  const autoL = new Float64Array(n), autoR = new Float64Array(n);
  const failed = new Map<number, Candidate>();
  const retained = new Set(policy?.keptBuildingIds);
  const exposed = cands.filter(c => c.fixedExcess > 0).sort((a, b) => b.order - a.order || a.j - b.j);
  // every wall Auto could add at its highest, the player's own decisions kept (for the window bound)
  const maxWall = (man: Float64Array, side: SideScreen) => {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = side.gap[i] || side.shield[i] ? 0 : man[i] === man[i] ? man[i] : heights[autoMax - 1];
    return out;
  };
  let maxL: Float64Array | null = null, maxR: Float64Array | null = null;
  // walls as they stand during the decisions: the player's, then Auto's (Auto never grows over a player cell)
  const curL = Float64Array.from(fixedL), curR = Float64Array.from(fixedR);
  // walls Auto adds for houses beside a wall choice of the player's (reported with that choice)
  const aroundL = new Float64Array(n), aroundR = new Float64Array(n);
  /** Grow one wall of option `o` on the house's side from the most useful cell; the interval and whether
   * it suffices. `cur` = that side's walls (changed only by `commit`). */
  const grow = (c: Candidate, d: Decision, cur: Float64Array, other: Float64Array, o: number, bestEffort: boolean) => {
    const H = c.z.length, cells = d.cells, mine = c.left ? 1 : 0;
    const lev = levelWith(d, c.left ? cur : other, c.left ? other : cur, H, new Float64Array(H));
    const can = (i: number) => { const k = i - d.w0; return !!cells.wallable[k] && cells.side[k] === mine; };
    // a cell's gain at the loudest storey (`worst`); `alike` = the other storeys that could be the loudest
    // with the cell-by-cell far sums (grouped houses): every choice below must come out the same at those
    let worst = 0;
    const alike: number[] = [];
    const storeys = () => {
      worst = 0;
      for (let k = 1; k < H; k++) if (lev[k] > lev[worst]) worst = k;
      alike.length = 0;
      if (c.sum < 2) for (let k = 0; k < H; k++) if (k !== worst && lev[worst] - lev[k] <= FAR_ERROR[c.sum] * (d.F[worst] + d.F[k])) alike.push(k);
    };
    const gain = (i: number, k = worst) => {
      if (!can(i)) return -1;
      const k0 = i - d.w0, now = optionOf(cur[i]);
      if (now >= o) return 0;
      return cells.opt(now)[k0 * H + k] - cells.opt(o)[k0 * H + k];
    };
    const apply = (i: number) => {
      const k0 = i - d.w0, now = optionOf(cur[i]);
      if (!can(i) || now >= o) return;
      const a = cells.opt(o), b = cells.opt(now);
      for (let k = 0; k < H; k++) lev[k] += a[k0 * H + k] - b[k0 * H + k];
    };
    /** the most useful cell at storey k (−1: none) */
    const best = (k: number) => {
      let at = -1, g0 = 0;
      for (let i = d.w0; i <= d.w1; i++) { const g = gain(i, k); if (g > g0) { g0 = g; at = i; } }
      return at;
    };
    storeys();
    const start = best(worst);
    for (const k of alike) if (best(k) !== start) finer(c);
    if (start < 0) return { lo: -1, hi: -2, ok: !over(c, lev, d.F), lev };
    let lo = start, hi = start;
    apply(start);
    const next = (i: number, dir: number) => { for (let k = i + dir; k >= d.w0 && k <= d.w1; k += dir) if (can(k)) return k; return -1; };
    while (over(c, lev, d.F)) {
      const a = next(lo, -1), b = next(hi, 1);
      if (a < 0 && b < 0) break;
      storeys();
      const ga = a < 0 ? -1 : gain(a), gb = b < 0 ? -1 : gain(b), left = ga >= gb;
      for (const k of alike) if (((a < 0 ? -1 : gain(a, k)) >= (b < 0 ? -1 : gain(b, k))) !== left) finer(c);
      if (bestEffort) {
        const top = maxOf(lev), stop = Math.max(ga, gb) < top * 0.002;
        if (Math.abs(Math.max(ga, gb) - top * 0.002) <= 0.002 * FAR_ERROR[c.sum] * maxOf(d.F)) finer(c);
        for (const k of alike) if ((Math.max(gain(a, k), gain(b, k)) < top * 0.002) !== stop) finer(c);
        if (stop) break;
      }
      if (left) { lo = a; apply(a); } else { hi = b; apply(b); }
    }
    return { lo, hi, ok: !over(c, lev, d.F), lev };
  };
  // the wall lines' own lengths per station (as billed and drawn)
  const lineL = wallLineLengths(n, src.x, src.y, src.tx, src.ty, src.L.wallOff, true);
  const lineR = wallLineLengths(n, src.x, src.y, src.tx, src.ty, src.R.wallOff, false);
  /** §1.11 h: the wall actually standing (its line, openings excluded) at least twice the house's distance */
  const extendToMinimum = (c: Candidate, d: Decision, lo: number, hi: number) => {
    const side = c.left ? src.L : src.R, line = c.left ? lineL : lineR, mine = c.left ? 1 : 0;
    const need = NOISE.minWallLengthFactor * Math.max(0, c.d - side.wallOff[c.i]);
    const stands = (i: number) => d.cells.wallable[i - d.w0] && d.cells.side[i - d.w0] === mine ? line[i] : 0;
    let length = 0;
    for (let i = lo; i <= hi; i++) length += stands(i);
    while (length < need) {
      const canLo = lo > d.w0, canHi = hi < d.w1;
      if (!canLo && !canHi) break;
      // keep the receiver's foot central
      if (canLo && (!canHi || c.i - lo <= hi - c.i)) length += stands(--lo); else length += stands(++hi);
    }
    return [lo, hi];
  };
  const commit = (c: Candidate, d: Decision, cur: Float64Array, auto: Float64Array, lo: number, hi: number, height: number) => {
    const mine = c.left ? 1 : 0;
    for (let i = lo; i <= hi; i++) {
      const k = i - d.w0;
      if (d.cells.wallable[k] && d.cells.side[k] === mine) { cur[i] = Math.max(cur[i], height); auto[i] = Math.max(auto[i], height); }
    }
  };

  /** one house's decision (redone from its start when a comparison refines its sums) */
  const handle = (c: Candidate) => {
    let d = decision(c, 1);
    data.set(c.j, d);
    const H = c.z.length;
    const cur = c.left ? curL : curR, other = c.left ? curR : curL, auto = c.left ? autoL : autoR;
    const man = c.left ? manL : manR;
    let manualHere = false;
    for (let i = d.w0; i <= d.w1 && !manualHere; i++) if (man[i] === man[i]) manualHere = true;
    const keep = retained.has(c.j) || manualHere;
    if (!over(c, levelWith(d, curL, curR, H, new Float64Array(H)), d.F)) return; // walls built for others suffice
    // the cheapest height: each one's wall, grown from its most useful cell until it suffices (at least twice
    // the house's distance long), priced by the area it adds. The window widens (×2) while a wider one could
    // change that choice: a wall reaching the window's edge, or a height that failed although walling every
    // metre beyond the window (at most all of its energy, F) could still make it suffice. So no reach limit
    // ever decides a house's wall or buyout.
    let done = false, bestArea = Infinity, pick = { o: 0, lo: 0, hi: 0 };
    for (let scale = 1; ; scale *= 2) {
      done = false; bestArea = Infinity;
      let widen = false;
      const full = d.w0 === 0 && d.w1 === n - 1;
      const edge = (lo: number, hi: number) => (lo <= d.w0 && d.w0 > 0) || (hi >= d.w1 && d.w1 < n - 1);
      for (let o = 1; o <= autoMax; o++) {
        const g = grow(c, d, cur, other, o, false);
        if (!g.ok) {
          // walling beyond the window takes away at most F (all of it), at most F − Fmax with walls ≤ 5 m
          let could = true;
          for (let k = 0; k < H; k++) if (g.lev[k] - d.F[k] > T * (1 + 1e-9)) could = false;
          if (could && !d.Fmax) {
            const t = view(buf, H);
            if (!maxL) { maxL = maxWall(manL, src.L); maxR = maxWall(manR, src.R); }
            pointTransfer(field, c.x, c.y, c.z, maxL, maxR, t, d.w0, d.w1, true, undefined, d.sum);
            d.Fmax = Float64Array.from(t.screened);
          }
          if (could) {
            // (g.lev − F is the window's, cell by cell; Fmax is grouped)
            const v = new Float64Array(H);
            for (let k = 0; k < H; k++) v[k] = g.lev[k] - (d.F[k] - d.Fmax![k]);
            if (over(c, v, d.Fmax!)) could = false;
          }
          if (could) widen = true;
          continue;
        }
        const [lo, hi] = extendToMinimum(c, d, g.lo, g.hi);
        if (edge(lo, hi)) widen = true;
        let area = 0;
        const line = c.left ? lineL : lineR;
        for (let i = lo; i <= hi; i++) if (d.cells.wallable[i - d.w0] && d.cells.side[i - d.w0] === (c.left ? 1 : 0)) area += Math.max(0, heights[o - 1] - cur[i]) * line[i];
        if (area < bestArea - 1e-6) { bestArea = area; pick = { o, lo, hi }; done = true; }
      }
      if (!widen || full) break;
      d = decision(c, scale * 2, d);
      data.set(c.j, d);
    }
    if (refined) return;
    if (done) {
      if (manualHere) {
        // walled because of the player's choice beside it: what this adds is reported with that choice
        const h = heights[pick.o - 1], mine = c.left ? 1 : 0, around = c.left ? aroundL : aroundR;
        for (let i = pick.lo; i <= pick.hi; i++) if (d.cells.wallable[i - d.w0] && d.cells.side[i - d.w0] === mine && cur[i] < h) around[i] = Math.max(around[i], h);
      }
      commit(c, d, cur, auto, pick.lo, pick.hi, heights[pick.o - 1]);
      c.need = heights[pick.o - 1]; c.lo = pick.lo; c.hi = pick.hi;
      return;
    }
    c.need = Infinity;
    if (!keep) { failed.set(c.j, c); return; }
    // kept by the player: best effort with the highest automatic wall, while it still helps. A house left too
    // loud by the player's own wall choice beside it stays as that choice leaves it (a violation): no wall
    // elsewhere half makes up for it.
    if (!retained.has(c.j)) return;
    const g = grow(c, d, cur, other, autoMax, true);
    if (refined) return;
    if (g.lo >= 0) { commit(c, d, cur, auto, g.lo, g.hi, heights[autoMax - 1]); c.lo = g.lo; c.hi = g.hi; }
  };
  for (const c of exposed) do { refined = false; handle(c); } while (refined);

  // 4. final walls: the automatic heights (a wall steps between heights along its length rather than
  // raising a whole run to its tallest piece), manual decisions over them, never in openings or tunnels
  const finalize = (auto: Float64Array, man: Float64Array, side: SideScreen) => {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = side.gap[i] || side.shield[i] ? 0 : man[i] === man[i] ? man[i] : auto[i];
    return out;
  };
  const L = finalize(autoL, manL, src.L), R = finalize(autoR, manR, src.R);
  const added = new Uint8Array(n);
  for (let i = 0; i < n; i++) added[i] = L[i] !== fixedL[i] || R[i] !== fixedR[i] ? 1 : 0;
  const addedFlags = segmentFlags(field, added);

  /** The lowest 2–6 m single stretch that would resolve a retained dwelling on top of the built walls. */
  const sufficientWall = (c: Candidate, own: Decision, wl: Float64Array, wr: Float64Array) => {
    // the fix replaces the player's own choice there: every cell on its side may carry it
    const cells = cellOptions(field, c.x, c.y, c.z, own.w0, own.w1, heights,
      c.left ? undefined : manL, c.left ? manR : undefined);
    // F0 belongs to the cells it was summed from: rebuilt over these (without the player's walls there)
    const H = c.z.length, F0 = Float64Array.from(own.F), e0 = cells.opt(0);
    for (let q = 0, m = own.w1 - own.w0 + 1; q < m; q++) for (let k = 0; k < H; k++) F0[k] += e0[q * H + k];
    const d: Decision = { ...own, cells, F0 };
    for (let o = 1; o <= heights.length; o++) {
      const g = grow(c, d, Float64Array.from(c.left ? wl : wr), c.left ? wr : wl, o, false);
      if (!g.ok || g.lo < 0) continue;
      const [lo, hi] = extendToMinimum(c, d, g.lo, g.hi);
      return { height: heights[o - 1], s0: Math.max(0, s[lo] - src.len[lo] / 2), s1: s[hi] + src.len[hi] / 2 };
    }
    return undefined;
  };

  // 5. every dwelling as built: its decision's own sums, plus walls added outside its window as a change
  const receivers: NoiseReceiver[] = [], unresolved: NoiseUnresolved[] = [];
  const boughtOut = [...failed.values()].map(c => ({ j: c.j, i: c.i, cost: noiseBuyoutCost(buildings.cost[c.j], buildings.area[c.j]) })).sort((a, b) => a.i - b.i || a.j - b.j);
  const day = dm.pow(10, src.dayDb / 10), night = dm.pow(10, src.nightDb / 10);
  for (const c of cands) {
    const H = c.z.length, t = view(buf, H), bought = failed.has(c.j), side = c.left ? 'L' as const : 'R' as const, walls = c.left ? L : R;
    let rec: NoiseReceiver, u: NoiseUnresolved | undefined;
    do {
      refined = false;
      // its decision's window, summed as finely as it is now
      const was = data.get(c.j)!, d = was.sum === c.sum ? was : decision(c, was.scale), own = decision(c, 1);
      t.raw.set(own.raw); t.earth.set(own.earth);
      if (bought) {
        // the shortfall with the best automatic walls in reach
        const wl = Float64Array.from(L), wr = Float64Array.from(R), mine = c.left ? 1 : 0;
        for (let i = d.w0; i <= d.w1; i++) {
          const k = i - d.w0;
          if (d.cells.wallable[k] && d.cells.side[k] === mine) (c.left ? wl : wr)[i] = Math.max((c.left ? wl : wr)[i], heights[autoMax - 1]);
        }
        levelWith(d, wl, wr, H, t.screened);
      } else levelWith(d, L, R, H, t.screened);
      const before = Float64Array.from(t.screened);
      transferDelta(field, c.x, c.y, c.z, fixedL, fixedR, L, R, added, addedFlags, t, d.w0, d.w1, true, d.sum);
      // its grouped part as built: F plus that change (transferDelta is the difference of two such sums)
      const far = Float64Array.from(d.F, (v, k) => v + t.screened[k] - before[k]);
      let floor = 0;
      for (let k = 1; k < H; k++) if (t.screened[k] > t.screened[floor]) floor = k;
      let wall = walls[c.i];
      if (!(wall > 0)) for (let i = Math.max(0, c.lo); i <= Math.min(n - 1, c.hi); i++) wall = Math.max(wall, walls[i]);
      const mitigated = excessOf(t.screened[floor]), rawExcess = excessOf(maxOf(own.raw)), earthExcess = excessOf(maxOf(own.earth));
      rec = {
        j: c.j, status: bought ? 'bought' : rawExcess <= 0 ? 'ok' : earthExcess <= 0 ? 'cut' : 'wall',
        x: c.x, y: c.y, i: c.i, side, d: c.d, ground: c.ground, storeys: H, floor, h: c.z[floor] - src.grade[c.i],
        raw: rawExcess, mitigated, earth: earthExcess,
        need: c.need, wall: bought ? 0 : wall, at: c.need > 0 || bought ? c.i : -1, window: [d.w0, d.w1], ...(c.sum ? { sum: c.sum } : {}),
        ...(c.hi >= c.lo && c.lo >= 0 ? { span: [c.lo, c.hi] as [number, number] } : {}),
        energy: { sourceId: src.id, rawDay: t.raw.map(v => v * day), rawNight: t.raw.map(v => v * night),
          day: t.screened.map(v => v * day), night: t.screened.map(v => v * night) },
      };
      u = undefined;
      if (bought) break;
      over(c, t.screened, far, T * dm.pow(10, 1e-8));
      if (refined || !(mitigated > 1e-7)) continue;
      // a violation states its levels cell by cell
      finer(c, 2);
      if (refined) continue;
      u = { j: c.j, i: c.i, side, excess: mitigated, wall };
      const fix = sufficientWall(c, d, L, R);
      if (fix) u.fix = fix; else u.gap = gapDecides(field, c, walls);
    } while (refined);
    if (u) { rec.unresolved = u; unresolved.push(u); }
    receivers.push(rec);
  }
  return { L, R, receivers, boughtOut, unresolved, field,
    walls: [...wallStretches(n > 1 ? ds : 0, s[n - 1] ?? 0, L, 'L'), ...wallStretches(n > 1 ? ds : 0, s[n - 1] ?? 0, R, 'R')],
    aroundChoices: [...wallStretches(n > 1 ? ds : 0, s[n - 1] ?? 0, aroundL, 'L'), ...wallStretches(n > 1 ? ds : 0, s[n - 1] ?? 0, aroundR, 'R')] };
}

/** Does most of the remaining noise come through junction openings on the house's side? */
function gapDecides(field: NoiseField, c: Candidate, walls: Float64Array): boolean {
  const src = field.src, side = c.left ? src.L : src.R, top = c.z.length - 1;
  let gap = 0, all = 0;
  pointTransfer(field, c.x, c.y, c.z.subarray(top), c.left ? walls : null, c.left ? null : walls, transferBuffers(1), -1, -2, false,
    (k, left, _d, _rh, _raw, screened) => { all += screened[0]; if (left === c.left && side.gap[k] && !side.shield[k]) gap += screened[0]; }, 2);
  return gap > 0.5 * all;
}

// ---- breakdown for the house card ------------------------------------------------------------------

/** Every storey of a dwelling with walls `wallL/R` (as built, or a previewed choice): dB over the limit on
 * open ground and as walled, the same sum as the decision (its exact window). */
export function dwellingLevels(field: NoiseField, rec: Pick<NoiseReceiver, 'x' | 'y' | 'i' | 'ground' | 'storeys' | 'window' | 'sum'>,
  wallL: ArrayLike<number>, wallR: ArrayLike<number>): { height: number; raw: number; level: number; earth: number }[] {
  const src = field.src, n = src.n, ex = sourceExcess(src);
  const z = Float64Array.from({ length: rec.storeys }, (_, k) => rec.ground + NOISE.receiverHeight + k * NOISE.storeyHeight);
  const t = transferBuffers(z.length);
  pointTransfer(field, rec.x, rec.y, z, wallL, wallR, t, rec.window[0], Math.min(n - 1, rec.window[1]), false, undefined, rec.sum);
  return Array.from(z, (zk, k) => ({ height: zk - src.grade[rec.i], raw: dB(t.raw[k]) + ex, level: dB(t.screened[k]) + ex, earth: dB(t.earth[k]) + ex }));
}

/** One cell's share of a dwelling's noise (near cells only; far segments are folded into the total). */
export interface NoiseRay {
  i: number; side: 'L' | 'R';
  /** a junction opening (no wall can stand) */
  gap: boolean;
  /** this cell's level minus the limit, dB, on open ground and as built */
  raw: number; level: number;
  /** built wall there, m; screened by an edge (cut / road edge) or wall */
  wall: number; screened: boolean;
}

/** Per-cell contributions at one storey (receiver elevation z) with walls `wallL/R`, and the totals. */
export function noiseBreakdown(field: NoiseField, x: number, y: number, z: number,
  wallL: ArrayLike<number>, wallR: ArrayLike<number>): { rays: NoiseRay[]; raw: number; level: number; earth: number } {
  const t = transferBuffers(1), rays: NoiseRay[] = [], src = field.src, ex = sourceExcess(src);
  pointTransfer(field, x, y, [z], wallL, wallR, t, -1, -2, false, (k, left, _d, _rh, raw, screened) => {
    if (!(raw[0] > 0)) return;
    const s = left ? src.L : src.R;
    rays.push({ i: k, side: left ? 'L' : 'R', gap: !!s.gap[k], raw: dB(raw[0]) + ex, level: dB(screened[0]) + ex,
      wall: (left ? wallL : wallR)[k] ?? 0, screened: screened[0] < raw[0] * 0.999 });
  });
  return { rays, raw: dB(t.raw[0]) + ex, level: dB(t.screened[0]) + ex, earth: dB(t.earth[0]) + ex };
}

// ---- noise map along the route ----------------------------------------------------------------------

/** Noise map along the route: excess (dB over the limit) at the height that decides walls and buyouts —
 * the top floor of the tallest dwelling beside that station and side (`receiver[k*2 + side]` m above the
 * real ground; NOISE.receiverHeight where there is none) — on the normal of every `stride`-th station,
 * both sides, at `start` + offsets. Same finite-segment sum as the houses. */
export interface NoiseFootprint {
  stride: number;
  /** sampled station indices */
  stations: Int32Array;
  /** distance from the inner edge of the band, m (shared by all stations) */
  offsets: Float32Array;
  /** inner edge (axis distance) per sampled station: [k*2] left, [k*2+1] right; NaN = no band (tunnel) */
  start: Float32Array;
  /** excess, dB: [(k*2 + side) * offsets.length + o] */
  excess: Float32Array;
  /** receiver height above the ground per sampled station and side, m: [k*2] left, [k*2+1] right */
  receiver: Float32Array;
  /** which period controls, its limit, dB */
  controlling: 'day' | 'night';
  limit: number;
}

/** The limits a source's levels are judged against: its own (railway: new-line 60 / 55 dB) or the road's. */
export function sourceLimits(src: Pick<AcousticSource, 'limits'>): { dayDb: number; nightDb: number } {
  return src.limits ?? { dayDb: NOISE.limitDayDb, nightDb: NOISE.limitNightDb };
}

/** The source's controlling excess at its reference distance: max(Yday − limit, Ynight − limit), dB. */
export function sourceExcess(src: Pick<AcousticSource, 'dayDb' | 'nightDb' | 'limits'>): number {
  const lim = sourceLimits(src);
  return Math.max(src.dayDb - lim.dayDb, src.nightDb - lim.nightDb);
}

/** Axis distance where an open straight road at the low receiver falls `below` dB under the limit. */
function fadeDistance(excess: number, below: number, ground: Propagation): number {
  const at = (d: number) => excess + 10 * dm.log10(lineTransfer(d, NOISE.receiverHeight, ground));
  let lo = NOISE.sourceOffset, hi = 2000;
  if (at(lo) <= -below) return lo;
  for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (at(mid) > -below) lo = mid; else hi = mid; }
  return hi;
}

/** The noise band of a route result (same finite-segment sum as its houses, its built walls): computed on
 * demand for the noise view, never part of `evaluate`. `crownWidth` of the road; null without a source. */
export function noiseBand(r: Pick<Result, 'n' | 'kind' | 'dayL' | 'dayR' | 'noise'>, groundAt: (x: number, y: number) => number,
  crownWidth: number, stride = 3, samples = 12, fadeDb = 6): NoiseFootprint | null {
  const src = r.noise.source;
  if (!src) return null;
  const n = r.n, w = crownWidth / 2;
  // the band shows the height that decides: the top floor of the tallest dwelling beside each station
  // (within ±40 m along the road, on that side; bought-out ones are gone)
  const topL = new Float32Array(n).fill(NOISE.receiverHeight), topR = new Float32Array(n).fill(NOISE.receiverHeight);
  const ds = n > 1 ? src.len[1] : 10, reach = Math.round(40 / Math.max(1e-6, ds));
  for (const p of r.noise.receivers) {
    if (p.status === 'bought') continue;
    const up = NOISE.receiverHeight + (p.storeys - 1) * NOISE.storeyHeight, top = p.side === 'L' ? topL : topR;
    for (let k = Math.max(0, p.i - reach); k <= Math.min(n - 1, p.i + reach); k++) if (up > top[k]) top[k] = up;
  }
  return noiseFootprint(noiseField(src), r.noise.L, r.noise.R, groundAt,
    (i, left) => (r.kind[i] === KIND.earth ? (left ? r.dayL[i] : r.dayR[i]) : w), stride, samples, fadeDb,
    (i, left) => (left ? topL : topR)[i], crownWidth);
}

/** `inner(i, left)`: where the band starts (daylight / deck edge). */
export function noiseFootprint(field: NoiseField, wallL: ArrayLike<number>, wallR: ArrayLike<number>,
  groundAt: (x: number, y: number) => number, inner: (i: number, left: boolean) => number,
  stride = 3, samples = 12, fadeDb = 6, receiverAt?: (i: number, left: boolean) => number, crownWidth = 9.5): NoiseFootprint {
  const src = field.src, n = src.n, excess0 = sourceExcess(src);
  const m = n ? Math.floor((n - 1) / stride) + 1 + ((n - 1) % stride ? 1 : 0) : 0;
  const stations = new Int32Array(m);
  for (let k = 0; k < m; k++) stations[k] = Math.min(n - 1, k * stride);
  const edge = crownWidth / 2 + NOISE.wallEdgeOffset;
  const span = Math.max(20, fadeDistance(excess0, fadeDb, field.ground) - edge);
  const offsets = new Float32Array(samples);
  for (let o = 0; o < samples; o++) offsets[o] = span * dm.pow(o / (samples - 1), 1.7);
  const start = new Float32Array(2 * m), excess = new Float32Array(2 * m * samples), receiver = new Float32Array(2 * m);
  const t = transferBuffers(1), z = new Float64Array(1);
  for (let k = 0; k < m; k++) {
    const i = stations[k], nx = -src.ty[i], ny = src.tx[i];
    for (let s = 0; s < 2; s++) {
      const left = s === 0, side = left ? src.L : src.R;
      if (side.shield[i]) { start[2 * k + s] = NaN; continue; }
      const a = Math.max(edge + 0.5, inner(i, left), side.wallOff[i] + 0.5), sgn = left ? 1 : -1;
      start[2 * k + s] = a;
      const base = (2 * k + s) * samples;
      const up = receiverAt?.(i, left) ?? NOISE.receiverHeight;
      receiver[2 * k + s] = up;
      for (let o = 0; o < samples; o++) {
        const d = a + offsets[o], px = src.x[i] + nx * d * sgn, py = src.y[i] + ny * d * sgn;
        z[0] = groundAt(px, py) + up;
        pointTransfer(field, px, py, z, wallL, wallR, t);
        excess[base + o] = dB(t.screened[0]) + excess0;
      }
    }
  }
  const lim = sourceLimits(src), dayEx = src.dayDb - lim.dayDb, nightEx = src.nightDb - lim.nightDb;
  return { stride, stations, offsets, start, excess, receiver, controlling: dayEx >= nightEx ? 'day' : 'night',
    limit: dayEx >= nightEx ? lim.dayDb : lim.nightDb };
}

export function wallStretches(ds: number, length: number, flags: ArrayLike<number>, side: 'L' | 'R'): WallStretch[] {
  const out: WallStretch[] = [];
  const n = flags.length;
  for (let i = 0; i < n; i++) {
    if (!flags[i]) continue;
    let j = i;
    while (j + 1 < n && flags[j + 1] === flags[i]) j++;
    out.push({ side, i0: i, i1: j, s0: Math.max(0, (i - 0.5) * ds), s1: Math.min(length, (j + 0.5) * ds), height: flags[i] });
    i = j;
  }
  return out;
}

export type { AcousticSource, NoiseField, SideScreen } from './noise-field';
export { noiseField } from './noise-field';
