// Mapped road bridges and tunnels (a pack's structures.json, pipeline/build_structures.py) at their own level.
//
// OSM maps a bridge or tunnel as its own way but gives no height. Its deck (a tunnel's road) runs between the ground at
// its two ends, where it meets the road on either side: the level here is that line, interpolated along the way. The
// terrain model under a bridge is the valley floor (or the cutting it spans: DMR 5G after the road below was built), so
// a crossed road is read at this level wherever it is on one of them, not on the ground below.

import type { RoadNet } from './roadnet';
import { CROSSING_RULES, ROAD_CLASSES } from './data/urban';
import { OVERBRIDGE_CLEARANCE } from './data/remedies';

type HeightAt = (x: number, y: number) => number;

/** One mapped structure laid out for lookups: its polyline, chainages, bounding box and the level at its ends. */
interface Laid { way: number; kind: 'bridge' | 'tunnel'; xy: readonly number[]; d: number[]; z0: number; z1: number; half: number;
  box: [number, number, number, number] }

/** How far from a mapped bridge's or tunnel's centreline a point is on it: half its road's width, m. */
const halfWidth = (cls: string) => (ROAD_CLASSES[cls]?.width ?? 6) / 2;

function lay(roads: RoadNet, way: number, ground: HeightAt): Laid | undefined {
  const s = roads.structure(way);
  if (!s || s.kind === 'covered' || s.xy.length < 4) return undefined;
  const xy = s.xy, d = [0];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let j = 0; j < xy.length; j += 2) {
    if (j) d.push(d[d.length - 1] + Math.hypot(xy[j] - xy[j - 2], xy[j + 1] - xy[j - 1]));
    x0 = Math.min(x0, xy[j]); y0 = Math.min(y0, xy[j + 1]); x1 = Math.max(x1, xy[j]); y1 = Math.max(y1, xy[j + 1]);
  }
  const half = halfWidth(roads.wayClass(way));
  return { way, kind: s.kind, xy, d, z0: ground(xy[0], xy[1]), z1: ground(xy[xy.length - 2], xy[xy.length - 1]), half,
    box: [x0 - half, y0 - half, x1 + half, y1 + half] };
}

/** The level of a laid structure at (x, y), or NaN where the point is not on it. */
function levelOn(s: Laid, x: number, y: number): number {
  if (x < s.box[0] || x > s.box[2] || y < s.box[1] || y > s.box[3]) return NaN;
  const { xy, d } = s, total = d[d.length - 1];
  let best = s.half * s.half + 1e-9, at = NaN;
  for (let j = 0, k = 0; j + 3 < xy.length; j += 2, k++) {
    const dx = xy[j + 2] - xy[j], dy = xy[j + 3] - xy[j + 1], len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((x - xy[j]) * dx + (y - xy[j + 1]) * dy) / len2)) : 0;
    const e = (x - xy[j] - t * dx) ** 2 + (y - xy[j + 1] - t * dy) ** 2;
    if (e < best) { best = e; at = d[k] + t * (d[k + 1] - d[k]); }
  }
  return Number.isNaN(at) ? NaN : total > 0 ? s.z0 + (s.z1 - s.z0) * at / total : s.z0;
}

type Index = { cells: Map<number, Laid[]>; laid: Laid[] };
const CELL = 50;
/** every mapped bridge and tunnel of a network (its `structures`, shared by its edited networks) on a 50 m grid, per terrain */
const indexes = new WeakMap<object, WeakMap<object, Index>>();
function indexOf(roads: RoadNet, ground: { heightAt: HeightAt }): Index {
  let byGround = indexes.get(roads.structures);
  if (!byGround) indexes.set(roads.structures, byGround = new WeakMap());
  let index = byGround.get(ground);
  if (!index) {
    index = { cells: new Map(), laid: [] };
    const at = (x: number, y: number) => ground.heightAt(x, y);
    for (const way of roads.structures.keys()) {
      const s = lay(roads, way, at);
      if (!s) continue;
      index.laid.push(s);
      for (let cx = Math.floor(s.box[0] / CELL); cx <= Math.floor(s.box[2] / CELL); cx++)
        for (let cy = Math.floor(s.box[1] / CELL); cy <= Math.floor(s.box[3] / CELL); cy++) {
          const key = cx * 100003 + cy, list = index.cells.get(key);
          if (list) list.push(s); else index.cells.set(key, [s]);
        }
    }
    byGround.set(ground, index);
  }
  return index;
}

/** The level of the mapped road surface at (x, y): on a mapped bridge or tunnel its own level (the first of them there),
 * elsewhere undefined (the ground: a road on it). `ground`: the terrain (its heightAt gives the level at their ends). */
export function wayLevelAt(roads: RoadNet | undefined, ground: { heightAt: HeightAt }, x: number, y: number, way?: number): number | undefined {
  if (!roads?.structures.size) return undefined;
  const list = indexOf(roads, ground).cells.get(Math.floor(x / CELL) * 100003 + Math.floor(y / CELL));
  if (!list) return undefined;
  for (const s of list) if (way === undefined || s.way === way) { const z = levelOn(s, x, y); if (!Number.isNaN(z)) return z; }
  return undefined;
}

/** The crossed roads' level (a crossing's geometry, crossings.ts CrossingRoute.wayLevel): a mapped bridge's deck or a
 * mapped tunnel's road where one is, else the ground. Undefined when the network has none (the ground everywhere). */
export function wayLevels(roads: RoadNet | undefined, ground: { heightAt: HeightAt }): HeightAt | undefined {
  if (!roads?.structures.size) return undefined;
  return (x, y) => wayLevelAt(roads, ground, x, y) ?? ground.heightAt(x, y);
}

/** A mapped bridge's or tunnel's level on its own way at (x, y) (the crossing point), or undefined for other ways. */
export function structureLevel(roads: RoadNet | undefined, way: number | undefined, x: number, y: number, ground: { heightAt: HeightAt }): number | undefined {
  if (way === undefined || !roads?.structure(way)) return undefined;
  return wayLevelAt(roads, ground, x, y, way);
}
/** The level a crossed way is met at here: a mapped bridge's or tunnel's own, else the ground. */
export const crossedLevel = (roads: RoadNet | undefined, way: number | undefined, x: number, y: number, ground: { heightAt: HeightAt }) =>
  structureLevel(roads, way, x, y, ground) ?? ground.heightAt(x, y);

/** Does a mapped bridge pass over (a tunnel under) a surface at height z here with the room the game asks (`over`: under a
 * bridge's deck, `under`: over a tunnel's road)? Undefined for an ordinary way (or off the structure). */
export function clearsAt(roads: RoadNet | undefined, way: number, x: number, y: number, z: number, ground: { heightAt: HeightAt },
  over: number, under: number): boolean | undefined {
  const s = roads?.structure(way);
  if (!s || s.kind === 'covered') return undefined;
  const level = structureLevel(roads, way, x, y, ground);
  if (level === undefined) return undefined;
  return s.kind === 'bridge' ? level - z >= over : z - level >= under;
}

/** Where a mapped bridge lies along a crossed road's path near our road (way chainages, d = 0 at the crossing): its two
 * ends (the abutments), and its deck level between them. Undefined for other ways or when an end is off the path. */
export function bridgeOnPath(roads: RoadNet | undefined, way: number | undefined, path: readonly { x: number; y: number; d: number }[],
  ground: HeightAt): { d0: number; d1: number; at: (d: number) => number } | undefined {
  const s = way === undefined ? undefined : roads?.structure(way);
  if (!s || s.kind !== 'bridge' || path.length < 2) return undefined;
  const xy = s.xy, ends = [[xy[0], xy[1]], [xy[xy.length - 2], xy[xy.length - 1]]];
  const z = ends.map(([x, y]) => ground(x, y));
  const on = ends.map(([x, y]) => {
    let best = Infinity, d = NaN;
    for (let k = 0; k + 1 < path.length; k++) {
      const a = path[k], b = path[k + 1], dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
      const e = Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
      if (e < best) { best = e; d = a.d + t * (b.d - a.d); }
    }
    return best <= 0.5 ? d : NaN;
  });
  if (on.some(Number.isNaN)) return undefined;
  const [e0, e1] = on[0] <= on[1] ? [0, 1] : [1, 0], d0 = on[e0], d1 = on[e1], z0 = z[e0], z1 = z[e1];
  return { d0, d1, at: (d: number) => d1 > d0 ? z0 + (z1 - z0) * Math.max(0, Math.min(1, (d - d0) / (d1 - d0))) : z0 };
}

/** 'bridge' / 'tunnel' for a mapped bridge or tunnel way (a covered way is crossed as any other). */
export function mappedKind(roads: RoadNet | undefined, way: number | undefined): 'bridge' | 'tunnel' | undefined {
  const k = roads?.structure(way)?.kind;
  return k === 'bridge' || k === 'tunnel' ? k : undefined;
}

/** A mapped bridge's or tunnel's stretch [a, b] (way chainages of `segment`) clears a surface at height z with the room a road
 * passing under a bridge needs (OVERBRIDGE_CLEARANCE, its deck's own depth unknown) or that a road over a tunnel keeps
 * (CROSSING_RULES.overHeight, as our bridge over a road): sampled at both ends and the middle. */
export function clearedHit(roads: RoadNet, segment: { way: number; ax: number; ay: number; bx: number; by: number; d: number; length: number },
  hit: readonly [number, number], z: number, ground: { heightAt: HeightAt }): boolean {
  return [hit[0], (hit[0] + hit[1]) / 2, hit[1]].every(d => {
    const t = Math.max(0, Math.min(1, (d - segment.d) / (segment.length || 1)));
    return clearsAt(roads, segment.way, segment.ax + t * (segment.bx - segment.ax), segment.ay + t * (segment.by - segment.ay), z, ground,
      OVERBRIDGE_CLEARANCE, CROSSING_RULES.overHeight) === true;
  });
}

/** Is a mapped bridge or tunnel within these bounds ([x0, y0, x1, y1]; a quick screen on the 50 m grid)? */
export function structuresNear(roads: RoadNet, ground: { heightAt: HeightAt }, bounds: readonly number[]): boolean {
  if (!roads.structures.size) return false;
  const { cells } = indexOf(roads, ground);
  for (let cx = Math.floor(bounds[0] / CELL); cx <= Math.floor(bounds[2] / CELL); cx++)
    for (let cy = Math.floor(bounds[1] / CELL); cy <= Math.floor(bounds[3] / CELL); cy++) if (cells.has(cx * 100003 + cy)) return true;
  return false;
}
