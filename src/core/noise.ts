// Czech source/propagation calculator + PROVISIONAL geometric mitigation; not a legal assessment.
// Walls/earth edges remove the controlling day/night LAeq excess at the highest occupied façade;
// otherwise acquire and demolish the entire dwelling. See research/11-noise-calculation.md.
import { noiseBuyoutCost, type BuildingIndex } from './buildings';
import { NOISE } from './data/urban';
import { CATEGORIES } from './data/categories';

import { noiseExcess, noiseLevels, type NoiseModel } from './road-noise';
export { noiseDistance } from './road-noise';

/** Equivalent 2D source → wall → receiver section. The axis-to-façade distance is its horizontal
 * receiver coordinate; oblique rays / source aggregation are not resolved. Precompute fixed legs
 * once per road category/evaluation. Walls sit beside the crown, not at the embankment toe. */
export function noiseBarrier(crownWidth: number) {
  const wallOffset = crownWidth / 2 + NOISE.wallEdgeOffset;
  const sourceToWall = wallOffset - NOISE.sourceOffset;
  return { wallOffset, sourceToWall,
    sourceLeg: NOISE.wallHeights.map(h => Math.hypot(sourceToWall, h - NOISE.sourceHeight)) };
}
const DEFAULT_BARRIER = noiseBarrier(CATEGORIES['S9.5'].crownWidth);

/** Path difference in the shadow zone, −1 otherwise. A+B−direct is never geometrically negative:
 * test the sightline explicitly, rather than mistaking an illuminated receiver for a shadowed one. */
function pathDifference(distance: number, height: number, offset: number, top: number, sourceLeg: number, direct: number): number {
  if (offset <= NOISE.sourceOffset || distance <= offset) return -1; // edge must lie between source and receiver
  const sightline = NOISE.sourceHeight + (height - NOISE.sourceHeight)
    * (offset - NOISE.sourceOffset) / (distance - NOISE.sourceOffset);
  if (top <= sightline) return -1;
  return Math.max(0, sourceLeg + Math.hypot(distance - offset, height - top) - direct);
}

export interface EarthEdge { offset: number; height: number }
export interface EarthEdges { L: (EarthEdge | undefined)[]; R: (EarthEdge | undefined)[] }

function earthDelta(distance: number, height: number, edge: EarthEdge | undefined, direct: number): number {
  return edge ? pathDifference(distance, height, edge.offset, edge.height,
    Math.hypot(edge.offset - NOISE.sourceOffset, edge.height - NOISE.sourceHeight), direct) : -1;
}

/** Attenuation by a cut edge (earth barrier) for a receiver `distance` from the axis, `height` above grade. */
export function edgeAttenuation(distance: number, height: number, edge: EarthEdge | undefined): number {
  const direct = Math.hypot(distance - NOISE.sourceOffset, height - NOISE.sourceHeight);
  return attenuation(earthDelta(distance, height, edge, direct));
}

function attenuation(delta: number): number {
  return delta < 0 ? 0 : Math.max(0, Math.min(NOISE.maxAttenuationDb,
    10 * Math.log10(3 + 40 * delta / NOISE.wavelength) - NOISE.trafficCorrectionDb));
}

/** Corrected Maekawa-style IL = 10 log10(3 + 20 N), N = 2δ/λ; practical traffic cap.
 * `distance` is protected-receiver distance from the axis; `height` is relative to road grade. */
export function barrierAttenuation(distance: number, height: number, k: number, barrier = DEFAULT_BARRIER): number {
  const direct = Math.hypot(distance - NOISE.sourceOffset, height - NOISE.sourceHeight);
  return attenuation(pathDifference(distance, height, barrier.wallOffset, NOISE.wallHeights[k], barrier.sourceLeg[k], direct));
}

/** Attenuation of the actual player-built height (not an index into the automatic 3/4/5 m menu). */
export function wallAttenuation(distance: number, height: number, wallHeight: number, barrier = DEFAULT_BARRIER): number {
  if (!(wallHeight > 0)) return 0;
  const direct = Math.hypot(distance - NOISE.sourceOffset, height - NOISE.sourceHeight);
  return attenuation(pathDifference(distance, height, barrier.wallOffset, wallHeight,
    Math.hypot(barrier.sourceToWall, wallHeight - NOISE.sourceHeight), direct));
}

/** Minimum feasible wall height, 0 if unexposed or earth-screened, Infinity if neither edge nor wall suffices.
 * Invert the IL expression once per pair instead of computing logarithms for all three heights. */
export function requiredWall(distance: number, excess: number, height: number, barrier = DEFAULT_BARRIER, edge?: EarthEdge): number {
  if (excess <= 0) return 0;
  const direct = Math.hypot(distance - NOISE.sourceOffset, height - NOISE.sourceHeight);
  if (excess > NOISE.maxAttenuationDb) return Infinity;
  const neededDelta = NOISE.wavelength / 40 * (10 ** ((excess + NOISE.trafficCorrectionDb) / 10) - 3);
  // Earth edge and wall are alternative single barriers: take the better, never sum attenuation.
  const earth = earthDelta(distance, height, edge, direct);
  if (earth >= 0 && earth >= neededDelta) return 0;
  for (let k = 0; k < NOISE.wallHeights.length; k++) {
    const delta = pathDifference(distance, height, barrier.wallOffset, NOISE.wallHeights[k], barrier.sourceLeg[k], direct);
    if (delta >= 0 && delta >= neededDelta) return NOISE.wallHeights[k];
  }
  return Infinity;
}

/** Explicit purchases are handled by the caller's demolished mask, before exposure. */
export interface NoisePolicy {
  keptBuildingIds?: ReadonlySet<number>;
  /** Station-indexed actual wall decisions: NaN/absent = auto, 0 = removed, 2…6 = built. */
  wallL?: ArrayLike<number>;
  wallR?: ArrayLike<number>;
  /** Physical junction openings: cannot carry a wall, but unlike manual No-wall they permit Auto buyout. */
  gapL?: ArrayLike<number>;
  gapR?: ArrayLike<number>;
}
function wallGap(policy: NoisePolicy | undefined, left: boolean, i: number): boolean {
  return !!(left ? policy?.gapL : policy?.gapR)?.[i];
}

function manualWall(policy: NoisePolicy | undefined, left: boolean, i: number): number | undefined {
  const h = (left ? policy?.wallL : policy?.wallR)?.[i];
  return h !== undefined && Number.isFinite(h) && (h === 0 || (h >= 2 && h <= 6)) ? h : undefined;
}

/** Query only nearby rectangles, de-duplicate hash hits per station. Two phases ensure a building
 * bought at ANY exposed station never leaves redundant walls elsewhere. Memory O(n + buildings +
 * actual exposed pairs), not a station × building matrix. Shield flags are for tunnels only; earth
 * edges use diffraction, NEVER terrain below a bridge. Buyouts go to their worst unscreened station. */
export function dwellingExposure(n: number, x: ArrayLike<number>, y: ArrayLike<number>, tx: ArrayLike<number>,
  ty: ArrayLike<number>, buildings: BuildingIndex, model: NoiseModel, demolished: ArrayLike<number>,
  grade: ArrayLike<number>, groundAt: (x: number, y: number) => number,
  shieldL: ArrayLike<number>, shieldR: ArrayLike<number>, barrier = DEFAULT_BARRIER, edges?: EarthEdges, policy?: NoisePolicy): {
    L: Uint8Array; R: Uint8Array; boughtOut: { j: number; i: number; cost: number }[]; scratch: ExposureScratch;
  } {
  const L = new Uint8Array(n), R = new Uint8Array(n);
  const dist = model.radius; // Hard-ground bound: low-receiver contour would miss upper floors.
  const items = buildings.items;
  const seen = new Int32Array(buildings.n), receiver = new Float64Array(buildings.n);
  receiver.fill(NaN);
  const failed = new Map<number, { i: number; deficit: number }>();
  const retained = new Set(policy?.keptBuildingIds);
  const stations: number[] = [], indices: number[] = [], heights: number[] = [], sides: boolean[] = [];
  // Per-dwelling diagnostics for the noise view (worst unmitigated pair, every exposed pair).
  const visited: number[] = [], raw = new Float64Array(buildings.n), rawI = new Int32Array(buildings.n);
  const quiet = new Float64Array(buildings.n), rawD = new Float64Array(buildings.n), rawH = new Float64Array(buildings.n), rawLeft = new Uint8Array(buildings.n);
  // where the quiet maximum is (geometry for the noise view's cross-section only)
  const quietI = new Int32Array(buildings.n).fill(-1), quietD = new Float64Array(buildings.n), quietH = new Float64Array(buildings.n), quietLeft = new Uint8Array(buildings.n);
  const pairs: ExposedPair[] = [];
  for (let i = 0; i < n; i++) {
    if (shieldL[i] && shieldR[i]) continue;
    const px = x[i], py = y[i];
    buildings.near(px, py, dist + NOISE.facadeOffset + NOISE.sourceOffset, (j) => {
      if (seen[j] === i + 1) return;
      seen[j] = i + 1;
      if (!buildings.dwelling[j] || demolished[j]) return;
      const left = -(items[j][0] - px) * ty[i] + (items[j][1] - py) * tx[i] >= 0;
      if (left ? shieldL[i] : shieldR[i]) return;
      const d = Math.max(1, buildings.facadeDistance(j, px, py) - NOISE.facadeOffset);
      if (d - NOISE.sourceOffset >= dist) return;
      if (Number.isNaN(receiver[j])) {
        receiver[j] = groundAt(items[j][0], items[j][1]) + NOISE.receiverHeight + (buildings.levels[j] - 1) * NOISE.storeyHeight;
        visited.push(j); raw[j] = quiet[j] = -Infinity;
      }
      const height = receiver[j] - grade[i], edge = left ? edges?.L[i] : edges?.R[i];
      const direct = Math.hypot(d - NOISE.sourceOffset, height - NOISE.sourceHeight);
      const excess = noiseExcess(direct, height, model);
      if (excess > raw[j]) { raw[j] = excess; rawI[j] = i; rawD[j] = d; rawH[j] = height; rawLeft[j] = left ? 1 : 0; }
      let h = requiredWall(d, excess, height, barrier, edge);
      const gap = wallGap(policy, left, i);
      if (gap && h > 0) h = Infinity;
      if (excess > 0) {
        pairs.push({ i, j, left, d, height, excess, need: h, gap });
        // A manual decision at ANY exposing station retains the whole dwelling, even when the
        // automatic failure is at another station visited earlier or later.
        if (manualWall(policy, left, i) !== undefined) retained.add(j);
      } else if (excess > quiet[j]) { quiet[j] = excess; quietI[j] = i; quietD[j] = d; quietH[j] = height; quietLeft[j] = left ? 1 : 0; }
      if (h === Infinity) {
        const k = NOISE.wallHeights.length - 1;
        const loss = Math.max(gap ? 0 : barrierAttenuation(d, height, k, barrier), attenuation(earthDelta(d, height, edge, direct)));
        const deficit = excess - loss;
        const old = failed.get(j);
        if (!old || deficit > old.deficit) failed.set(j, { i, deficit });
      } else if (h > 0) {
        stations.push(i); indices.push(j); heights.push(h); sides.push(left);
      }
    });
  }
  // Retained dwellings still request best-effort walls at their solvable stations. A failure at
  // another station remains unresolved; it must not discard useful local protection here.
  for (const j of retained) failed.delete(j);
  for (let k = 0; k < stations.length; k++) {
    if (failed.has(indices[k])) continue;
    const side = sides[k] ? L : R, i = stations[k];
    side[i] = Math.max(side[i], heights[k]);
  }
  const boughtOut = [...failed].map(([j, { i }]) => ({ j, i, cost: noiseBuyoutCost(buildings.cost[j], buildings.area[j]) })).sort((a, b) => a.i - b.i);
  return { L, R, boughtOut, scratch: { visited, raw, quiet, quietI, quietD, quietH, quietLeft, rawI, rawD, rawH, rawLeft, pairs, failed, ...(policy ? { policy } : {}) } };
}

/** `gap`: a junction opening, where no wall can stand */
interface ExposedPair { i: number; j: number; left: boolean; d: number; height: number; excess: number; need: number; gap: boolean }
/** What dwellingExposure saw, for noiseReceivers (not part of the Result). */
export interface ExposureScratch {
  visited: number[]; raw: Float64Array;
  /** highest excess at stations where the dwelling is not exposed (≤ 0), −Infinity if none */
  quiet: Float64Array; rawI: Int32Array; rawD: Float64Array; rawH: Float64Array; rawLeft: Uint8Array;
  /** station (−1: none), façade distance, height and side of the quiet maximum (cross-section only) */
  quietI?: Int32Array; quietD?: Float64Array; quietH?: Float64Array; quietLeft?: Uint8Array;
  pairs: ExposedPair[]; failed: Map<number, { i: number; deficit: number }>;
  /** Same decisions used to suppress buyouts must also paint the final walls. */
  policy?: NoisePolicy;
}

/** Retained dwelling's worst remaining failure after all actual walls and cut edges. */
export interface NoiseUnresolved {
  j: number; i: number; side: 'L' | 'R';
  /** Remaining excess above the controlling limit, dB, at the worst actual exposed pair. */
  excess: number;
  /** Actual built height at that pair, m. */
  wall: number;
}

/** Noise outcome of one dwelling within the search radius (the noise view's colours and hover). */
export interface NoiseReceiver {
  /** building index */
  j: number;
  /** wall = protected by a wall; cut = screened by a cut edge (no wall needed); ok = within the limit
   * unmitigated; bought = no wall / edge suffices, acquired and demolished.
   * Check unresolved FIRST: a retained dwelling may still require a wall / have excess. */
  status: 'wall' | 'cut' | 'ok' | 'bought';
  /** station of the worst unmitigated exposure, its side, façade distance from the axis (m) and
   * top-floor receiver height above grade (m) */
  i: number; side: 'L' | 'R'; d: number; h: number;
  /** controlling-period level minus its limit at the top-floor receiver, dB: unmitigated, and with the
   * built walls / cut edges (bought: with the best available, i.e. the shortfall) — max over stations */
  raw: number; mitigated: number;
  /** Highest automatic wall requirement (0 = none, Infinity = beyond the 3/4/5 m menu), and
   * height actually built there, m. A manual 6 m wall can succeed even when need is Infinity. */
  need: number; wall: number;
  /** station of the binding wall requirement / buyout (−1 = none) */
  at: number;
  /** Manual decisions prevent fallback acquisition: expose the remaining failure to checks/UI. */
  unresolved?: NoiseUnresolved;
  /** the deciding exposure (highest level left after walls / cut edges): station, side, façade distance
   * from the axis, top-floor height above grade, built wall and cut edge there — for the cross-section */
  key?: { i: number; side: 'L' | 'R'; d: number; h: number; wall: number; edge?: EarthEdge; gap?: boolean };
  /** every station where the top floor is over the limit unmitigated, packed (RAY_STRIDE per station;
   * read with `noiseRays`): where the noise comes from, and what stops it — for the house card's plan */
  rays?: Float32Array;
}

/** One station's exposure of a house (see NoiseReceiver.rays). */
export interface NoiseRay {
  i: number; side: 'L' | 'R';
  /** a junction opening: no wall can stand here */
  gap: boolean;
  /** façade distance from the axis, top-floor height above grade, m; excess over the limit without
   * mitigation, cut-edge attenuation, dB; built wall, m; level left over the limit, dB */
  d: number; h: number; excess: number; earth: number; wall: number; residual: number;
  edge?: EarthEdge;
}
export const RAY_STRIDE = 11;

export function noiseRays(rec: Pick<NoiseReceiver, 'rays'>): NoiseRay[] {
  const a = rec.rays, out: NoiseRay[] = [];
  if (!a) return out;
  for (let k = 0; k + RAY_STRIDE <= a.length; k += RAY_STRIDE) {
    out.push({ i: a[k], side: a[k + 1] & 1 ? 'L' : 'R', gap: !!(a[k + 1] & 2), d: a[k + 2], h: a[k + 3], excess: a[k + 4],
      earth: a[k + 5], wall: a[k + 6], residual: a[k + 7], ...(a[k + 10] ? { edge: { offset: a[k + 8], height: a[k + 9] } } : {}) });
  }
  return out;
}

/** The rays with a wall of `height` m on `side` where `at(station)` (none in a junction opening), as
 * noiseReceivers computes them: what a wall choice would change, for the card's preview. */
export function raysWithWall(rays: readonly NoiseRay[], side: 'L' | 'R', at: (i: number) => boolean, height: number, barrier = DEFAULT_BARRIER): NoiseRay[] {
  return rays.map((r) => {
    if (r.side !== side || !at(r.i)) return r;
    const wall = r.gap ? 0 : height;
    return { ...r, wall, residual: r.excess - Math.max(r.earth, wallAttenuation(r.d, r.h, wall, barrier)) };
  });
}

/** Per-dwelling status after the walls are chosen: residual = excess − max(built wall, cut edge) at
 * every exposed station (the same alternatives as requiredWall), raw elsewhere. */
export function noiseReceivers(ex: ExposureScratch, wallL: ArrayLike<number>, wallR: ArrayLike<number>,
  barrier = DEFAULT_BARRIER, edges?: EarthEdges): NoiseReceiver[] {
  const res = new Map<number, { mitigated: number; need: number; wall: number; at: number; cut: boolean; worst?: NoiseUnresolved; key?: NoiseReceiver['key']; keyLevel: number; rays: number[] }>();
  for (const j of ex.visited) res.set(j, { mitigated: ex.raw[j] > 0 ? ex.quiet[j] : ex.raw[j], need: 0, wall: 0, at: -1, cut: false, keyLevel: -Infinity, rays: [] });
  for (const p of ex.pairs) {
    const r = res.get(p.j)!;
    const built = (p.left ? wallL : wallR)[p.i];
    const direct = Math.hypot(p.d - NOISE.sourceOffset, p.height - NOISE.sourceHeight);
    const edge = p.left ? edges?.L[p.i] : edges?.R[p.i];
    const earth = attenuation(earthDelta(p.d, p.height, edge, direct));
    const loss = Math.max(earth, wallAttenuation(p.d, p.height, built, barrier));
    const residual = p.excess - loss;
    r.rays.push(p.i, (p.left ? 1 : 0) | (p.gap ? 2 : 0), p.d, p.height, p.excess, earth, built, residual, edge?.offset ?? 0, edge?.height ?? 0, edge ? 1 : 0);
    if (residual > r.keyLevel) { r.keyLevel = residual; r.key = { i: p.i, side: p.left ? 'L' : 'R', d: p.d, h: p.height, wall: built, ...(edge ? { edge } : {}), ...(p.gap ? { gap: true } : {}) }; }
    if (residual > r.mitigated) r.worst = { j: p.j, i: p.i, side: p.left ? 'L' : 'R', excess: residual, wall: built };
    r.mitigated = Math.max(r.mitigated, residual);
    if (p.need === 0) r.cut = true;
    else if (p.need > r.need || (p.need === r.need && built > r.wall)) { r.need = p.need; r.wall = built; r.at = p.i; }
  }
  const out: NoiseReceiver[] = [];
  for (const j of ex.visited) {
    const r = res.get(j)!, f = ex.failed.get(j);
    const status = f ? 'bought' : r.need > 0 ? 'wall' : r.cut ? 'cut' : 'ok';
    out.push({
      j, status, i: ex.rawI[j], side: ex.rawLeft[j] ? 'L' : 'R', d: ex.rawD[j], h: ex.rawH[j], raw: ex.raw[j],
      mitigated: f ? f.deficit : r.mitigated, need: f ? Infinity : r.need, wall: f ? 0 : r.wall, at: f ? f.i : r.at,
      ...(!f && r.mitigated > 1e-7 && r.worst ? { unresolved: r.worst } : {}),
      ...(r.rays.length ? { rays: Float32Array.from(r.rays) } : {}),
      key: (r.key && r.keyLevel >= r.mitigated - 1e-9) || !ex.quietI || ex.quietI[j] < 0 ? r.key ?? { i: ex.rawI[j], side: ex.rawLeft[j] ? 'L' : 'R', d: ex.rawD[j], h: ex.rawH[j], wall: (ex.rawLeft[j] ? wallL : wallR)[ex.rawI[j]] ?? 0 }
        // a quiet station decides (walls brought the exposed ones lower): the model counts no wall there
        : { i: ex.quietI[j], side: ex.quietLeft![j] ? 'L' : 'R', d: ex.quietD![j], h: ex.quietH![j], wall: 0 },
    });
  }
  return out;
}

/** Finish exposure with automatic margins/runs on undecided cells, then exact manual heights/removals.
 * Manual cells neither seed padding nor connect automatic height-promotion runs. Tunnels get no walls.
 * Pass these L/R arrays to pricing, wall rendering AND noiseFootprint; append unresolved to checks.
 * Barrier/edges must be the same as in dwellingExposure. Explicit buys belong in its demolished mask. */
export function resolveNoiseWalls(ex: ReturnType<typeof dwellingExposure>, ds: number, length: number,
  shieldL: ArrayLike<number>, shieldR: ArrayLike<number>, barrier = DEFAULT_BARRIER, edges?: EarthEdges): {
    L: Float64Array; R: Float64Array; walls: WallStretch[]; receivers: NoiseReceiver[];
    boughtOut: ReturnType<typeof dwellingExposure>['boughtOut']; unresolved: NoiseUnresolved[];
  } {
  const automatic = (demand: Uint8Array, shield: ArrayLike<number>, left: boolean) => {
    const masked = demand.slice(), blocked = Uint8Array.from(shield);
    for (let i = 0; i < masked.length; i++) {
      if (!wallGap(ex.scratch.policy, left, i) && manualWall(ex.scratch.policy, left, i) === undefined) continue;
      masked[i] = 0;
      blocked[i] = 1;
    }
    return Float64Array.from(wallFlags(ds, masked, blocked));
  };
  const L = automatic(ex.L, shieldL, true), R = automatic(ex.R, shieldR, false);
  for (let i = 0; i < L.length; i++) {
    L[i] = shieldL[i] || wallGap(ex.scratch.policy, true, i) ? 0 : (manualWall(ex.scratch.policy, true, i) ?? L[i]);
    R[i] = shieldR[i] || wallGap(ex.scratch.policy, false, i) ? 0 : (manualWall(ex.scratch.policy, false, i) ?? R[i]);
  }
  const receivers = noiseReceivers(ex.scratch, L, R, barrier, edges);
  return { L, R, boughtOut: ex.boughtOut, receivers,
    walls: [...wallStretches(ds, length, L, 'L'), ...wallStretches(ds, length, R, 'R')],
    unresolved: receivers.flatMap(r => r.unresolved ? [r.unresolved] : []),
  };
}

/** Noise map along the route: excess (dB over the limit) at the height that decides walls and buyouts —
 * the top floor of the tallest dwelling beside that station and side (`receiver[k*2 + side]` m above the
 * real ground; NOISE.receiverHeight where there is none) — on the normal of every `stride`-th station,
 * both sides, at `start` + offsets. */
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

/** Distance where the flat-ground low receiver falls `below` dB under the limit, axis metres. */
function fadeDistance(model: NoiseModel, below: number): number {
  let lo = NOISE.sourceOffset, hi = 2000;
  if (noiseLevels(lo, NOISE.receiverHeight, model).excessDb <= -below) return lo;
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    if (noiseLevels(mid, NOISE.receiverHeight, model).excessDb > -below) lo = mid; else hi = mid;
  }
  return hi;
}

/** Same calculator as dwellingExposure, built walls (`wallL/R`, m) and positive cut edges included;
 * O(n / stride × 2 × samples). `inner(i, left)`: where the band starts (daylight / deck edge). */
export function noiseFootprint(n: number, x: ArrayLike<number>, y: ArrayLike<number>, tx: ArrayLike<number>,
  ty: ArrayLike<number>, grade: ArrayLike<number>, groundAt: (x: number, y: number) => number, model: NoiseModel,
  shieldL: ArrayLike<number>, shieldR: ArrayLike<number>, wallL: ArrayLike<number>, wallR: ArrayLike<number>,
  inner: (i: number, left: boolean) => number, barrier = DEFAULT_BARRIER, edges?: EarthEdges,
  stride = 3, samples = 12, fadeDb = 6, receiverAt?: (i: number, left: boolean) => number): NoiseFootprint {
  const m = n ? Math.floor((n - 1) / stride) + 1 + ((n - 1) % stride ? 1 : 0) : 0;
  const stations = new Int32Array(m);
  for (let k = 0; k < m; k++) stations[k] = Math.min(n - 1, k * stride);
  const span = Math.max(20, fadeDistance(model, fadeDb) - barrier.wallOffset);
  const offsets = new Float32Array(samples);
  for (let o = 0; o < samples; o++) offsets[o] = span * (o / (samples - 1)) ** 1.7;
  const start = new Float32Array(2 * m), excess = new Float32Array(2 * m * samples), receiver = new Float32Array(2 * m);
  for (let k = 0; k < m; k++) {
    const i = stations[k], nx = -ty[i], ny = tx[i];
    for (let s = 0; s < 2; s++) {
      const left = s === 0;
      if (left ? shieldL[i] : shieldR[i]) { start[2 * k + s] = NaN; continue; }
      const a = Math.max(barrier.wallOffset + 0.5, inner(i, left)), sgn = left ? 1 : -1;
      start[2 * k + s] = a;
      const built = (left ? wallL : wallR)[i];
      const sourceLeg = Math.hypot(barrier.sourceToWall, built - NOISE.sourceHeight);
      const edge = left ? edges?.L[i] : edges?.R[i];
      const base = (2 * k + s) * samples;
      const up = receiverAt?.(i, left) ?? NOISE.receiverHeight;
      receiver[2 * k + s] = up;
      for (let o = 0; o < samples; o++) {
        const d = a + offsets[o];
        const height = groundAt(x[i] + nx * d * sgn, y[i] + ny * d * sgn) + up - grade[i];
        const direct = Math.hypot(d - NOISE.sourceOffset, height - NOISE.sourceHeight);
        const earth = attenuation(earthDelta(d, height, edge, direct));
        const wall = built > 0 ? attenuation(pathDifference(d, height, barrier.wallOffset, built, sourceLeg, direct)) : 0;
        excess[base + o] = noiseExcess(direct, height, model) - Math.max(earth, wall);
      }
    }
  }
  return { stride, stations, offsets, start, excess, receiver, controlling: model.controlling,
    limit: model.controlling === 'night' ? NOISE.limitNightDb : NOISE.limitDayDb };
}

export interface WallStretch {
  side: 'L' | 'R';
  i0: number;
  i1: number;
  /** station range, m */
  s0: number;
  s1: number;
  /** Uniform height of the stretch: the worst protected receiver's requirement, m. */
  height: number;
}

/** Extend demands by the margin, drop shielded cells, then give each connected wall the highest
 * required height. Accepts boolean flags too (height 1), for topology-only callers. */
export function wallFlags(ds: number, exposed: ArrayLike<number>, shield: ArrayLike<number>, margin = NOISE.margin): Uint8Array {
  const n = exposed.length, out = new Uint8Array(n), pad = Math.round(margin / ds);
  for (let i = 0; i < n; i++) {
    if (!exposed[i]) continue;
    for (let j = Math.max(0, i - pad); j <= Math.min(n - 1, i + pad); j++) out[j] = Math.max(out[j], exposed[i]);
  }
  for (let i = 0; i < n; i++) if (shield[i]) out[i] = 0;
  for (let i = 0; i < n; i++) {
    if (!out[i]) continue;
    let j = i, height = out[i];
    while (j + 1 < n && out[j + 1]) height = Math.max(height, out[++j]);
    out.fill(height, i, j + 1);
    i = j;
  }
  return out;
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
