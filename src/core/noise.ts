// Noise walls: a PROVISIONAL screening rule standing in for a real noise calculation (data/urban.ts).
// A dwelling within the screening distance of the road exposes the stretch of road that lies within
// that distance of it; exposed stretches get a wall on the dwelling's side, extended by a margin,
// except in tunnels and where a cut already screens that side.

import type { BuildingIndex } from './buildings';
import { NOISE } from './data/urban';

/** screening distance for the given traffic (veh/day) and design speed (km/h), m */
export function noiseDistance(traffic: number, speed: number, p = NOISE): number {
  return p.refDistance * Math.pow(traffic / p.refTraffic, p.trafficExponent) * Math.pow(speed / p.refSpeed, p.speedExponent);
}

/** stations with a dwelling (not demolished) within `dist` of the centreline, by side (left of travel = L) */
export function dwellingExposure(n: number, x: ArrayLike<number>, y: ArrayLike<number>, tx: ArrayLike<number>,
  ty: ArrayLike<number>, buildings: BuildingIndex, dist: number, demolished: ArrayLike<number>): { L: Uint8Array; R: Uint8Array } {
  const L = new Uint8Array(n), R = new Uint8Array(n);
  const items = buildings.items, dwelling = buildings.dwelling;
  const d2 = dist * dist;
  for (let i = 0; i < n; i++) {
    const px = x[i], py = y[i], nx = -ty[i], ny = tx[i];
    buildings.near(px, py, dist, (j) => {
      if (!dwelling[j] || demolished[j]) return;
      const dx = items[j][0] - px, dy = items[j][1] - py;
      if (dx * dx + dy * dy > d2) return;
      if (dx * nx + dy * ny >= 0) L[i] = 1; else R[i] = 1;
    });
  }
  return { L, R };
}

export interface WallStretch {
  side: 'L' | 'R';
  i0: number;
  i1: number;
  /** station range, m */
  s0: number;
  s1: number;
}

/**
 * Walls from exposure flags: each exposed station is widened by `margin` metres both ways, then
 * stations where `shield` is set (tunnel, or a deep cut on that side) are dropped.
 */
export function wallFlags(ds: number, exposed: ArrayLike<number>, shield: ArrayLike<number>, margin = NOISE.margin): Uint8Array {
  const n = exposed.length;
  const out = new Uint8Array(n);
  const pad = Math.round(margin / ds);
  let until = -1;
  // forward pass marks i … i+pad, backward pass i−pad … i
  for (let i = 0; i < n; i++) { if (exposed[i]) until = i + pad; if (i <= until) out[i] = 1; }
  until = n;
  for (let i = n - 1; i >= 0; i--) { if (exposed[i]) until = i - pad; if (i >= until) out[i] = 1; }
  for (let i = 0; i < n; i++) if (shield[i]) out[i] = 0;
  return out;
}

export function wallStretches(ds: number, length: number, flags: ArrayLike<number>, side: 'L' | 'R'): WallStretch[] {
  const out: WallStretch[] = [];
  const n = flags.length;
  for (let i = 0; i < n; i++) {
    if (!flags[i]) continue;
    let j = i;
    while (j + 1 < n && flags[j + 1]) j++;
    out.push({ side, i0: i, i1: j, s0: Math.max(0, (i - 0.5) * ds), s1: Math.min(length, (j + 0.5) * ds) });
    i = j;
  }
  return out;
}
