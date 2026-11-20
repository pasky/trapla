// Dead ends of mapped roads next to our road that serve nothing at their end (owner, I/35 Turnov km 3.0: the last
// metres of a local road's dead end under our embankment held Auto's grade up). A designer ends such a road at our
// works: its last piece is taken up (road-realignment.ts cuts it back to a turning area beyond our slope), so it is no
// feature our slopes must keep off with a wall, nor one our road must bridge where it lies under our crown
// (retaining.ts). Only the piece from the dead end back to where the road still serves something: the first
// junction with another way (short of it, so no other way loses its road), the first house it comes within
// STUB_HOUSE of (people go there: the road left must still reach it), at most STUB_LENGTH (a longer piece is a road
// that leads somewhere, moved aside rather than taken up).
import type { BuildingIndex } from './buildings';
import { BUILDING_KIND, ROAD_CLASSES } from './data/urban';
import { STUB_HOUSE, STUB_LENGTH } from './crossing-geometry';
import type { RoadNet } from './roadnet';

type XY = { x: number; y: number };
/** A junction this close to the dead end is its own (pack ways are simplified by 1 m and rounded to metres), m. */
const JUNCTION_TOLERANCE = 2;
/** The piece taken up stops this short of the junction it reaches, so that junction is left whole, m (as the
 * player's End handle, ui/mapped-road.ts). */
const JUNCTION_KEEP = 5;
/** Sampling step along a dead end, m. */
const STEP = 5;

/** A mapped dead end beside our road: its way, which end is the dead one (`forward`: its start), the way's length,
 * how far from the dead end a piece of it may be taken up at most (`limit`: STUB_LENGTH, short of its first junction)
 * and the houses along that much of it (each at the first distance from the dead end it comes within STUB_HOUSE of). */
export interface DeadEnd { way: number; forward: boolean; total: number; limit: number; houses: { j: number; d: number }[] }

/** The dead ends of mapped roads (no motorways, bridges, tunnels or roads of the project) within `reach` of our line
 * (its stations `x`, `y`). `skip`: ways that are no such road (ones our road ends on). */
export function deadEndsNear(roads: RoadNet, buildings: BuildingIndex | undefined, line: { n: number; x: ArrayLike<number>; y: ArrayLike<number> },
  reach: number, skip: (way: number) => boolean = () => false): DeadEnd[] {
  const out: DeadEnd[] = [];
  if (line.n < 2) return out;
  const near = (p: XY) => {
    for (let i = 1; i < line.n; i++) {
      const ax = line.x[i - 1], ay = line.y[i - 1], dx = line.x[i] - ax, dy = line.y[i] - ay;
      if (Math.min(ax, ax + dx) - reach > p.x || Math.max(ax, ax + dx) + reach < p.x || Math.min(ay, ay + dy) - reach > p.y || Math.max(ay, ay + dy) + reach < p.y) continue;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(p.x - ax - t * dx, p.y - ay - t * dy) <= reach) return true;
    }
    return false;
  };
  // (the ways near our line, by chunks of its stations)
  const ways = new Set<number>(), CHUNK = 20;
  for (let i0 = 0; i0 < line.n - 1; i0 += CHUNK) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = i0; i <= Math.min(line.n - 1, i0 + CHUNK); i++) { x0 = Math.min(x0, line.x[i]); x1 = Math.max(x1, line.x[i]); y0 = Math.min(y0, line.y[i]); y1 = Math.max(y1, line.y[i]); }
    roads.nearSegments([x0 - reach, y0 - reach, x1 + reach, y1 + reach], s => { ways.add(s.way); });
  }
  for (const way of [...ways].sort((a, b) => a - b)) {
    const row = ROAD_CLASSES[roads.wayClass(way)];
    if (!row || row.noAtGrade || roads.structure(way) || roads.isDesigned(way) || skip(way)) continue;
    const path = roads.wayPath(way, 0, Infinity);
    if (path.length < 2) continue;
    const total = path[path.length - 1].d;
    for (const forward of [true, false]) {
      const tip = forward ? path[0] : path[path.length - 1];
      if (!near(tip) || !roads.isDeadEnd(tip)) continue;
      let limit = Math.min(STUB_LENGTH, total);
      const at = (d: number) => roads.wayPath(way, forward ? d : total - d, forward ? d : total - d)[0];
      const houses = new Map<number, number>();
      for (let d = 0; d < limit; d += STEP) {
        const a = at(d), b = at(Math.min(limit, d + STEP));
        if (!a || !b) break;
        for (const j of roads.junctions(a, b)) {
          // (another way meeting it: the way's own vertices near a sample are none)
          if (Math.hypot(j.x - tip.x, j.y - tip.y) <= JUNCTION_TOLERANCE || !j.connections.some(c => c.way !== way)) continue;
          const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((j.x - a.x) * dx + (j.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
          limit = Math.min(limit, d + t * Math.hypot(dx, dy) - JUNCTION_KEEP);
        }
        if (buildings) served(buildings, a, j => { if (!houses.has(j)) houses.set(j, d); });
      }
      if (limit > 0) out.push({ way, forward, total, limit, houses: [...houses].filter(([, d]) => d < limit).map(([j, d]) => ({ j, d })) });
    }
  }
  return out;
}

/** Per way, the chainage intervals of the dead ends' pieces that may be taken up: from the dead end to the first house
 * still standing (`gone`: those our works take) it comes within STUB_HOUSE of. */
export function deadEndPieces(ends: readonly DeadEnd[], gone: (j: number) => boolean): Map<number, [number, number][]> {
  const out = new Map<number, [number, number][]>();
  for (const e of ends) {
    let keep = e.limit;
    for (const h of e.houses) if (h.d < keep && !gone(h.j)) keep = h.d;
    if (!(keep > 0)) continue;
    const list = out.get(e.way) ?? [];
    list.push(e.forward ? [0, keep] : [e.total - keep, e.total]);
    out.set(e.way, list);
  }
  return out;
}

/** The buildings people go to (no shed or garage) within STUB_HOUSE of p. */
function served(bld: BuildingIndex, p: XY, found: (j: number) => void) {
  bld.near(p.x, p.y, STUB_HOUSE + 5, j => {
    if (bld.kind[j] !== BUILDING_KIND.minor && bld.facadeDistanceSq(j, p.x, p.y) < STUB_HOUSE * STUB_HOUSE) found(j);
  });
}
