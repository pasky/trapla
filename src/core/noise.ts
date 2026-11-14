// PROVISIONAL noise feasibility surrogate; not an acoustic study or a legal compliance claim.
// The controlling day/night limit is represented by D. Walls/earth edges remove E = 15 log10(D/d)
// with d the slant distance from the equivalent source to the receiver,
// at the highest occupied façade receiver; otherwise acquire and demolish the entire dwelling.
import { noiseBuyoutCost, type BuildingIndex } from './buildings';
import { NOISE } from './data/urban';
import { CATEGORIES } from './data/categories';

/** Unmitigated limit contour for traffic (veh/day) and design speed (km/h), m. */
export function noiseDistance(traffic: number, speed: number, p = NOISE): number {
  return p.refDistance * Math.pow(traffic / p.refTraffic, p.trafficExponent) * Math.pow(speed / p.refSpeed, p.speedExponent);
}

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

/** Minimum feasible wall height, 0 if unexposed or earth-screened, Infinity if neither edge nor wall suffices.
 * Invert the IL expression once per pair instead of computing logarithms for all three heights. */
export function requiredWall(distance: number, contour: number, height: number, barrier = DEFAULT_BARRIER, edge?: EarthEdge): number {
  const direct = Math.hypot(distance - NOISE.sourceOffset, height - NOISE.sourceHeight);
  if (direct >= contour || contour <= 0) return 0;
  const excess = NOISE.distanceDb * Math.log10(contour / Math.max(1, direct));
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

/** Query only nearby rectangles, de-duplicate hash hits per station. Two phases ensure a building
 * bought at ANY exposed station never leaves redundant walls elsewhere. Memory O(n + buildings +
 * actual exposed pairs), not a station × building matrix. Shield flags are for tunnels only; earth
 * edges use diffraction, NEVER terrain below a bridge. Buyouts go to their worst unscreened station. */
export function dwellingExposure(n: number, x: ArrayLike<number>, y: ArrayLike<number>, tx: ArrayLike<number>,
  ty: ArrayLike<number>, buildings: BuildingIndex, dist: number, demolished: ArrayLike<number>,
  grade: ArrayLike<number>, groundAt: (x: number, y: number) => number,
  shieldL: ArrayLike<number>, shieldR: ArrayLike<number>, barrier = DEFAULT_BARRIER, edges?: EarthEdges): {
    L: Uint8Array; R: Uint8Array; boughtOut: { j: number; i: number; cost: number }[];
  } {
  const L = new Uint8Array(n), R = new Uint8Array(n);
  const items = buildings.items;
  const seen = new Int32Array(buildings.n), receiver = new Float64Array(buildings.n);
  receiver.fill(NaN);
  const failed = new Map<number, { i: number; deficit: number }>();
  const stations: number[] = [], indices: number[] = [], heights: number[] = [], sides: boolean[] = [];
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
      if (Number.isNaN(receiver[j])) receiver[j] = groundAt(items[j][0], items[j][1])
        + NOISE.receiverHeight + (buildings.levels[j] - 1) * NOISE.storeyHeight;
      const height = receiver[j] - grade[i], edge = left ? edges?.L[i] : edges?.R[i];
      const h = requiredWall(d, dist, height, barrier, edge);
      if (h === Infinity) {
        const k = NOISE.wallHeights.length - 1;
        const direct = Math.hypot(d - NOISE.sourceOffset, height - NOISE.sourceHeight);
        const loss = Math.max(barrierAttenuation(d, height, k, barrier), attenuation(earthDelta(d, height, edge, direct)));
        const deficit = NOISE.distanceDb * Math.log10(dist / Math.max(1, direct)) - loss;
        const old = failed.get(j);
        if (!old || deficit > old.deficit) failed.set(j, { i, deficit });
      } else if (h > 0) {
        stations.push(i); indices.push(j); heights.push(h); sides.push(left);
      }
    });
  }
  for (let k = 0; k < stations.length; k++) {
    if (failed.has(indices[k])) continue;
    const side = sides[k] ? L : R, i = stations[k];
    side[i] = Math.max(side[i], heights[k]);
  }
  const boughtOut = [...failed].map(([j, { i }]) => ({ j, i, cost: noiseBuyoutCost(buildings.cost[j], buildings.area[j]) })).sort((a, b) => a.i - b.i);
  return { L, R, boughtOut };
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
