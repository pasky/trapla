// Terrain class of the ground a road crosses (ČSN 73 6101:2000 §8.2.2 p. 19, kept in 2018 per Šilhan 2021
// p. 40, research/54 §1): "přirozené sklony terénu" — flat where they are at most 5 %, hilly up to 15 %,
// mountainous with ridges and slopes steeper than 15 %. Designers class whole sections, not points (research/54
// §2: D11 1106–1109, D49, I/13). Game reading (PROVISIONAL, research/54 §4): the predominant (median) natural
// ground slope within RADIUS of a point, sampled every STEP m (cached per CELL m square of the terrain), and a
// stretch's class from the running median of that along the route over WINDOW m (the whole route if shorter):
// the shortest window that classes every documented section in our packs as it was (all hilly); 5 km would still
// call 4 km of D11 1109 mountainous, which ŘSD did not. No pack covers a road documented as mountainous, so that
// side is not calibrated. Not modelled: the flat class (S 9.5 at 4.5 %, motorway 3 %).
import type { TerrainClass } from './data/categories';
import type { Terrain } from './terrain';

export const TERRAIN_CLASS = { mountainousFrom: 0.15, radius: 500, step: 50, cell: 100, window: 10_000, sample: 100 };

const caches = new WeakMap<Terrain, Map<number, number>>();

/** predominant (median) ground slope (rise / run) within TERRAIN_CLASS.radius of the cell centre nearest to (x, y) */
export function groundSlopeAt(terrain: Terrain, x: number, y: number): number {
  const { radius, step, cell } = TERRAIN_CLASS;
  const cx = (Math.floor(x / cell) + 0.5) * cell, cy = (Math.floor(y / cell) + 0.5) * cell;
  const key = Math.floor(x / cell) * 1_000_003 + Math.floor(y / cell);
  let cache = caches.get(terrain);
  if (!cache) caches.set(terrain, cache = new Map());
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const slopes: number[] = [];
  for (let dx = -radius; dx <= radius; dx += step) for (let dy = -radius; dy <= radius; dy += step) {
    if (dx * dx + dy * dy > radius * radius) continue;
    const px = cx + dx, py = cy + dy;
    const gx = (terrain.heightAt(px + step / 2, py) - terrain.heightAt(px - step / 2, py)) / step;
    const gy = (terrain.heightAt(px, py + step / 2) - terrain.heightAt(px, py - step / 2)) / step;
    const g = Math.hypot(gx, gy);
    if (Number.isFinite(g)) slopes.push(g);
  }
  slopes.sort((p, q) => p - q);
  const slope = slopes.length ? slopes[slopes.length >> 1] : 0;
  cache.set(key, slope);
  return slope;
}

/** the game's two classes: hilly (the norm's flat and hilly rows share the SPK price rows) or mountainous */
export function terrainClassAt(terrain: Terrain, x: number, y: number): TerrainClass {
  return groundSlopeAt(terrain, x, y) > TERRAIN_CLASS.mountainousFrom ? 'mountainous' : 'hilly';
}

/** Mountainous stretches along a route: per station, 1 where the running median of the ground slope over
 * TERRAIN_CLASS.window of chainage (centred, clipped at the ends) exceeds mountainousFrom. */
export function routeMountainous(terrain: Terrain, st: { s: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number>; n: number }): Uint8Array {
  const { sample, window, mountainousFrom } = TERRAIN_CLASS, n = st.n, L = st.s[n - 1];
  const m = Math.max(1, Math.round(L / sample)) + 1, at: number[] = [], slope: number[] = [];
  for (let k = 0, i = 0; k < m; k++) {
    const s = (k / (m - 1 || 1)) * L;
    while (i + 1 < n && st.s[i + 1] <= s) i++;
    at.push(s); slope.push(groundSlopeAt(terrain, st.x[i], st.y[i]));
  }
  const half = Math.min(window, L) / 2, cls = new Uint8Array(m);
  for (let k = 0; k < m; k++) {
    const c = Math.max(half, Math.min(L - half, at[k]));
    const w: number[] = [];
    for (let j = 0; j < m; j++) if (Math.abs(at[j] - c) <= half + 1e-6) w.push(slope[j]);
    w.sort((p, q) => p - q);
    cls[k] = w[w.length >> 1] > mountainousFrom ? 1 : 0;
  }
  const out = new Uint8Array(n);
  for (let i = 0, k = 0; i < n; i++) {
    while (k + 1 < m && Math.abs(at[k + 1] - st.s[i]) <= Math.abs(at[k] - st.s[i])) k++;
    out[i] = cls[k];
  }
  return out;
}
