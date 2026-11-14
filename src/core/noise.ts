// PROVISIONAL noise feasibility surrogate; not an acoustic study or a legal compliance claim.
// The controlling day/night limit is represented by D. Walls must remove E = 15 log10(D/d)
// at the highest occupied façade receiver; otherwise acquire and demolish the entire dwelling.
import type { BuildingIndex } from './buildings';
import { NOISE } from './data/urban';

/** Unmitigated limit contour for traffic (veh/day) and design speed (km/h), m. */
export function noiseDistance(traffic: number, speed: number, p = NOISE): number {
  return p.refDistance * Math.pow(traffic / p.refTraffic, p.trafficExponent) * Math.pow(speed / p.refSpeed, p.speedExponent);
}

/** Minimum feasible wall height, 0 if unexposed, Infinity if no available wall protects the receiver.
 * `height` is receiver elevation above road grade, not above local building ground. */
export function requiredWall(distance: number, contour: number, height: number): number {
  if (distance >= contour || contour <= 0) return 0;
  const excess = NOISE.distanceDb * Math.log10(contour / Math.max(1, distance));
  for (let k = 0; k < NOISE.wallHeights.length; k++) {
    const h = NOISE.wallHeights[k];
    const attenuation = Math.max(0, NOISE.lowAttenuationDb[k] - NOISE.upperPenaltyDbPerM * Math.max(0, height - h));
    if (attenuation >= excess) return h;
  }
  return Infinity;
}

/** Query only nearby rectangles, de-duplicate hash hits per station. Two phases ensure a building
 * bought at ANY exposed station never leaves redundant walls elsewhere. Memory O(n + buildings +
 * actual exposed pairs), not a station × building matrix. Shield flags include tunnels / earth cuts,
 * NEVER terrain below a bridge. Buyouts are attributed to their worst unscreened station. */
export function dwellingExposure(n: number, x: ArrayLike<number>, y: ArrayLike<number>, tx: ArrayLike<number>,
  ty: ArrayLike<number>, buildings: BuildingIndex, dist: number, demolished: ArrayLike<number>,
  grade: ArrayLike<number>, groundAt: (x: number, y: number) => number,
  shieldL: ArrayLike<number>, shieldR: ArrayLike<number>): {
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
    buildings.near(px, py, dist + NOISE.facadeOffset, (j) => {
      if (seen[j] === i + 1) return;
      seen[j] = i + 1;
      if (!buildings.dwelling[j] || demolished[j]) return;
      const left = -(items[j][0] - px) * ty[i] + (items[j][1] - py) * tx[i] >= 0;
      if (left ? shieldL[i] : shieldR[i]) return;
      const d = Math.max(1, buildings.facadeDistance(j, px, py) - NOISE.facadeOffset);
      if (d >= dist) return;
      if (Number.isNaN(receiver[j])) receiver[j] = groundAt(items[j][0], items[j][1])
        + NOISE.receiverHeight + (buildings.levels[j] - 1) * NOISE.storeyHeight;
      const h = requiredWall(d, dist, receiver[j] - grade[i]);
      if (h === Infinity) {
        const k = NOISE.wallHeights.length - 1;
        const attenuation = Math.max(0, NOISE.lowAttenuationDb[k]
          - NOISE.upperPenaltyDbPerM * Math.max(0, receiver[j] - grade[i] - NOISE.wallHeights[k]));
        const deficit = NOISE.distanceDb * Math.log10(dist / d) - attenuation;
        const old = failed.get(j);
        if (!old || deficit > old.deficit) failed.set(j, { i, deficit });
      } else {
        stations.push(i); indices.push(j); heights.push(h); sides.push(left);
      }
    });
  }
  for (let k = 0; k < stations.length; k++) {
    if (failed.has(indices[k])) continue;
    const side = sides[k] ? L : R, i = stations[k];
    side[i] = Math.max(side[i], heights[k]);
  }
  const boughtOut = [...failed].map(([j, { i }]) => ({ j, i, cost: buildings.cost[j] })).sort((a, b) => a.i - b.i);
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
