// Display-only distance to the actual engineered footprint. Symmetric max-width corridors are
// unsuitable here: an asymmetric/tapered road must still join coarse ground on its narrow side.
import type { Result } from '../core/evaluate';
import { KIND } from '../core/structures';
import { daylightPoint } from './earthwork-surface';

export interface GroundFootprint {
  xy: readonly number[];
  x0: number; y0: number; x1: number; y1: number;
  key: string;
}
export function mainRoadFootprints(roads: readonly Result[]): GroundFootprint[] {
  const run = mainRoadFootprintsSliced(roads);
  for (let step = run.next(); ; step = run.next()) if (step.done) return step.value;
}
/** The same, yielding every few hundred stations (a long route's 3D rebuild runs in slices). */
export function* mainRoadFootprintsSliced(roads: readonly Result[]): Generator<void, GroundFootprint[]> {
  const polygons: GroundFootprint[] = [];
  for (const r of roads) for (let i = 0; i + 1 < r.n; i++) {
    if (i % 400 === 399) yield;
    if (r.kind[i] !== KIND.earth || r.kind[i + 1] !== KIND.earth) continue;
    const points = [daylightPoint(r, i, 1), daylightPoint(r, i, -1), daylightPoint(r, i + 1, -1), daylightPoint(r, i + 1, 1)];
    const xy = points.flatMap(p => [p.x, p.y]);
    polygons.push({ xy, x0: Math.min(...points.map(p => p.x)) - 12.5, y0: Math.min(...points.map(p => p.y)) - 12.5,
      x1: Math.max(...points.map(p => p.x)) + 12.5, y1: Math.max(...points.map(p => p.y)) + 12.5,
      key: xy.map(v => Math.round(v * 1000)).join(',') });
  }
  return polygons;
}

/** Indexed, bounded-memory union-distance query; never road × all collar vertices. */
export function footprintBlend(polygons: readonly GroundFootprint[]) {
  const cell = 25, grid = new Map<number, number[]>(), KEY = 1 << 20, OFF = 1 << 19;
  polygons.forEach((p, i) => {
    for (let x = Math.floor(p.x0 / cell); x <= Math.floor(p.x1 / cell); x++)
      for (let y = Math.floor(p.y0 / cell); y <= Math.floor(p.y1 / cell); y++) {
        const key = (x + OFF) * KEY + y + OFF, list = grid.get(key);
        if (list) list.push(i); else grid.set(key, [i]);
      }
  });
  return (x: number, y: number) => {
    const near = grid.get((Math.floor(x / cell) + OFF) * KEY + Math.floor(y / cell) + OFF);
    if (!near) return 1;
    let distance2 = 12.5 * 12.5;
    for (const index of near) {
      const p = polygons[index];
      if (x < p.x0 || x > p.x1 || y < p.y0 || y > p.y1) continue;
      let inside = false;
      for (let i = 0, j = 3; i < 4; j = i++) {
        const ax = p.xy[j * 2], ay = p.xy[j * 2 + 1], bx = p.xy[i * 2], by = p.xy[i * 2 + 1];
        const dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
        const px = x - ax - t * dx, py = y - ay - t * dy;
        distance2 = Math.min(distance2, px * px + py * py);
        if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
      }
      if (inside || distance2 <= 100) return 0;
    }
    return Math.max(0, Math.min(1, (Math.sqrt(distance2) - 10) / 2.5));
  };
}
