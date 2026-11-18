// Mapped road bridges and tunnels (a pack's structures.json, pipeline/build_structures.py) at their own level.
//
// OSM maps a bridge or tunnel as its own way but gives no height. Its deck (a tunnel's road) runs between the ground at
// its two ends, where it meets the road on either side: the level here is that line, interpolated along the way. The
// terrain model under a bridge is the valley floor (or the cutting it spans: DMR 5G after the road below was built), so
// a crossed road is read at this level wherever it is on one of them, not on the ground below.

import type { RoadNet } from './roadnet';
import { ROAD_CLASSES } from './data/urban';

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

/** The crossed-road level of the ground function: on the given mapped bridges and tunnels (way indices) their own level,
 * elsewhere `ground`. The same function when none of them is a structure (bit for bit what it was). */
export function structureLevels(roads: RoadNet | undefined, ways: Iterable<number | undefined>, ground: HeightAt): HeightAt {
  if (!roads?.structures.size) return ground;
  const laid: Laid[] = [];
  const seen = new Set<number>();
  for (const way of ways) if (way !== undefined && !seen.has(way)) {
    seen.add(way);
    const s = lay(roads, way, ground);
    if (s) laid.push(s);
  }
  if (!laid.length) return ground;
  return (x, y) => {
    for (const s of laid) { const z = levelOn(s, x, y); if (!Number.isNaN(z)) return z; }
    return ground(x, y);
  };
}

/** A mapped bridge's or tunnel's level on its own way at (x, y) (the crossing point), or undefined for other ways. */
export function structureLevel(roads: RoadNet | undefined, way: number | undefined, x: number, y: number, ground: HeightAt): number | undefined {
  if (way === undefined || !roads?.structure(way)) return undefined;
  const s = lay(roads, way, ground);
  if (!s) return undefined;
  const z = levelOn(s, x, y);
  return Number.isNaN(z) ? undefined : z;
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
