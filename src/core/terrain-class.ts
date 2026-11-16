// Terrain class of the ground a road crosses (ČSN 73 6101:2018, as Šilhan, ČVUT FD thesis 2021 p. 40 gives
// it, research/47 §1.1): flat where the terrain's slopes are at most 5 %, hilly up to 15 %, mountainous where
// ridges and slopes are steeper. Game reading (PROVISIONAL, no public method for a stretch): the mean slope of
// the ground within RADIUS of a point, sampled every STEP m, cached per CELL m square of the terrain.
import type { TerrainClass } from './data/categories';
import type { Terrain } from './terrain';

export const TERRAIN_CLASS = { mountainousFrom: 0.15, radius: 250, step: 25, cell: 100 };

const caches = new WeakMap<Terrain, Map<number, number>>();

/** mean ground slope (rise / run) within TERRAIN_CLASS.radius of the cell centre nearest to (x, y) */
export function meanSlopeAt(terrain: Terrain, x: number, y: number): number {
  const { radius, step, cell } = TERRAIN_CLASS;
  const cx = (Math.floor(x / cell) + 0.5) * cell, cy = (Math.floor(y / cell) + 0.5) * cell;
  const key = Math.floor(x / cell) * 1_000_003 + Math.floor(y / cell);
  let cache = caches.get(terrain);
  if (!cache) caches.set(terrain, cache = new Map());
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let sum = 0, count = 0;
  for (let dx = -radius; dx <= radius; dx += step) for (let dy = -radius; dy <= radius; dy += step) {
    if (dx * dx + dy * dy > radius * radius) continue;
    const px = cx + dx, py = cy + dy;
    const gx = (terrain.heightAt(px + step / 2, py) - terrain.heightAt(px - step / 2, py)) / step;
    const gy = (terrain.heightAt(px, py + step / 2) - terrain.heightAt(px, py - step / 2)) / step;
    const g = Math.hypot(gx, gy);
    if (Number.isFinite(g)) { sum += g; count++; }
  }
  const slope = count ? sum / count : 0;
  cache.set(key, slope);
  return slope;
}

/** the game's two classes: hilly (the norm's flat and hilly rows share the SPK price rows) or mountainous */
export function terrainClassAt(terrain: Terrain, x: number, y: number): TerrainClass {
  return meanSlopeAt(terrain, x, y) > TERRAIN_CLASS.mountainousFrom ? 'mountainous' : 'hilly';
}
