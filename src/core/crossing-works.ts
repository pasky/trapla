// A raised or lowered crossed-road stretch (junction approach, ramps to a bridge over our road) has
// earth slopes of its own. They must not bury other mapped roads. As a designer would: a side road
// joining the regraded stretch is regraded too, from the new level back down to its own ground no
// steeper than its class allows (its "tie"); a road merely beside the slope is kept clear by a
// retaining wall. Where neither fits, the treatment is infeasible and Auto must choose another.
import type { CrossingPoint } from './crossings';
import { ROAD_CLASSES } from './data/urban';
import { retainingAssembly, RETAINING_RULES, SIDE_ROAD_FLAT as FLAT, SIDE_ROAD_SLOPE as SLOPE } from './data/remedies';
import type { RoadNet, RoadSegment } from './roadnet';

type XY = { x: number; y: number };
/** Engine diagnostics (internal; diagnosticText in crossing-geometry.ts gives the player words). */
export const WORKS_COVER_ROAD = 'Approach earthworks would cover another road';
export const WORKS_TIE_TOO_LONG = 'A side road joining the approach cannot be regraded to meet it';
export const WORKS_TIE_SHARED = 'Two crossings would regrade the same side road';
/** Earth this thin over another road's edge is the engine's draped-road tolerance (crossing-geometry.ts
 * returns rebuilt road ends within 0.3 m of the ground to the ground), not a buried road, m. */
const DRAPED = 0.3;
/** The crossed road's own (continuing) segments lie exactly on its traced line, m. */
const ON_PATH = 0.5;
/** A side road's end node is a junction with the crossed road within this distance: pack ways are
 * simplified by 1 m and rounded to metres (roadnet.ts JUNCTION_UNCERTAINTY). */
const JOIN = 2;
const STEP = 10;

export interface CrossingTie { cls: string; way: number; path: CrossingPoint[] }
export interface CrossingWorks {
  ties: CrossingTie[];
  /** Per crossed-road sample: retaining-wall offsets from its centreline, [right, left] of the
   * sample normal (-n, +n), where a wall cuts the slope short. */
  walls: Map<number, [number | undefined, number | undefined]>;
  tieLength: number; wallLength: number; wallArea: number;
  /** Pre-surcharge CZK: tie pavement (SPK road per km of its class) plus wall assemblies. */
  cost: number;
  problems: string[];
}
export interface WorksContext {
  roads: RoadNet;
  heightAt: (x: number, y: number) => number;
  /** Within `pad` of our own road's earthworks: the main footprint check owns those roads. */
  ours: (q: XY, pad: number) => boolean;
  /** Steepest regrade from z (old ground g0 at the start) to ground g at distance run. */
  rampLimit: (cls: string, z: number, g0: number, g: number, run: number) => number;
  maxTie: number;
  /** Urban (1) or rural (0) SPK price row. */
  urban: 0 | 1;
  /** Side-road regrades already accepted for other crossings in this build (shared and extended). */
  claimed?: XY[][];
}

const segDist = (q: XY, a: XY, b: XY) => {
  const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy);
};
/** The crossed road's own line, bucketed on a grid: is a point within `ON_PATH` of it. Cached per
 * (immutable, shared) source path: Auto rebuilds the same crossing several times. */
const CELL = 20;
const sourceIndex = new WeakMap<readonly XY[], Map<number, number[]>>();
const cellKey = (cx: number, cy: number) => cx * 1_000_003 + cy;
function onSource(q: XY, source: readonly XY[]): boolean {
  let grid = sourceIndex.get(source);
  if (!grid) {
    grid = new Map();
    for (let i = 1; i < source.length; i++) {
      const a = source[i - 1], b = source[i];
      for (let cx = Math.floor((Math.min(a.x, b.x) - ON_PATH) / CELL); cx <= Math.floor((Math.max(a.x, b.x) + ON_PATH) / CELL); cx++)
        for (let cy = Math.floor((Math.min(a.y, b.y) - ON_PATH) / CELL); cy <= Math.floor((Math.max(a.y, b.y) + ON_PATH) / CELL); cy++) {
          const key = cellKey(cx, cy), list = grid.get(key);
          if (list) list.push(i); else grid.set(key, [i]);
        }
    }
    sourceIndex.set(source, grid);
  }
  for (const i of grid.get(cellKey(Math.floor(q.x / CELL), Math.floor(q.y / CELL))) ?? []) if (segDist(q, source[i - 1], source[i]) < ON_PATH) return true;
  return false;
}
/** Section normal exactly as the renderer builds it (neighbouring samples). */
function normal(road: readonly CrossingPoint[], i: number) {
  const a = road[Math.max(0, i - 1)], b = road[Math.min(road.length - 1, i + 1)];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { nx: -(b.y - a.y) / len, ny: (b.x - a.x) / len };
}
/** Daylight distance from the centreline on one side, the renderer's 1:1.5 search. */
function toe(p: CrossingPoint, nx: number, ny: number, side: number, half: number, heightAt: WorksContext['heightAt']) {
  const ex = p.x + nx * side * half, ey = p.y + ny * side * half, delta = p.z - heightAt(ex, ey);
  if (Math.abs(delta) < FLAT) return half;
  let off = .5;
  for (; off < 300; off += 1) {
    const g = heightAt(p.x + nx * side * (half + off), p.y + ny * side * (half + off));
    if (delta > 0 ? p.z - off / SLOPE <= g : p.z + off / SLOPE >= g) break;
  }
  return half + off;
}

/** Works needed so that `road` (the crossed way's rebuilt stretch, engineered points carrying
 * z ≠ ground) leaves every other mapped road usable. `source` is the crossed way's own line (its
 * segments, and those of ways continuing it, are the crossed road itself). Bounded: one segment-grid
 * query per engineered section, ties ≤ maxTie. */
export function crossingWorks(road: readonly CrossingPoint[], width: number,
  source: readonly XY[], ctx: WorksContext): CrossingWorks {
  const works: CrossingWorks = { ties: [], walls: new Map(), tieLength: 0, wallLength: 0, wallArea: 0, cost: 0, problems: [] };
  const n = road.length, half = width / 2, { roads, heightAt } = ctx;
  if (n < 2) return works;
  const engineered = (i: number) => road[i].surface === 'ramp' && Math.abs(road[i].z - road[i].ground) >= FLAT;
  const onPath = (q: XY, path: readonly XY[], tolerance = ON_PATH) => {
    for (let i = 1; i < path.length; i++) if (segDist(q, path[i - 1], path[i]) < tolerance) return true;
    return false;
  };
  // Cheap screen first: most crossings have no other road anywhere near their raised stretch.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, any = false;
  for (let i = 0; i < n; i++) if (engineered(i)) {
    const r = half + Math.abs(road[i].z - road[i].ground) * SLOPE * 4 + 30;
    x0 = Math.min(x0, road[i].x - r); y0 = Math.min(y0, road[i].y - r); x1 = Math.max(x1, road[i].x + r); y1 = Math.max(y1, road[i].y + r);
  }
  if (x0 < x1) roads.nearSegments([x0, y0, x1, y1], s => { if (!any && !(onSource({ x: s.ax, y: s.ay }, source) && onSource({ x: s.bx, y: s.by }, source))) any = true; });
  if (!any) return works;
  const normals = road.map((_, i) => normal(road, i));
  const toes: [number, number][] = road.map((p, i) => engineered(i)
    ? [toe(p, normals[i].nx, normals[i].ny, -1, half, heightAt), toe(p, normals[i].nx, normals[i].ny, 1, half, heightAt)] : [half, half]);
  /** Depth of earth (fill or cut) the rebuilt stretch puts on the other road's near edge. */
  const buried = (h: { j: number; u: number; side: 0 | 1; lateral: number }, other: number) => {
    const a = road[h.j], b = road[h.j + 1], x = a.x + (b.x - a.x) * h.u, y = a.y + (b.y - a.y) * h.u, z = a.z + (b.z - a.z) * h.u;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, sign = h.side ? 1 : -1, nx = -(b.y - a.y) / len * sign, ny = (b.x - a.x) / len * sign;
    const at = Math.max(0, h.lateral - other), edge = heightAt(x + nx * half, y + ny * half), fill = z >= edge;
    const surface = at <= half ? z : fill ? z - (at - half) / SLOPE : z + (at - half) / SLOPE, g = heightAt(x + nx * at, y + ny * at);
    return fill ? surface - g : g - surface;
  };
  // Every other road segment within the slopes' reach of an engineered section.
  type Hit = { q: XY; j: number; u: number; side: 0 | 1; lateral: number; segment: RoadSegment; t: number };
  const hits = new Map<number, Hit[]>(), segments = new Map<number, RoadSegment[]>(), seen = new Set<string>();
  for (let j = 0; j + 1 < n; j++) {
    if (!engineered(j) && !engineered(j + 1)) continue;
    const a = road[j], b = road[j + 1], reach = Math.max(...toes[j], ...toes[j + 1]) + 15;
    roads.nearSegments([Math.min(a.x, b.x) - reach, Math.min(a.y, b.y) - reach, Math.max(a.x, b.x) + reach, Math.max(a.y, b.y) + reach], s => {
      const key = `${s.ax},${s.ay},${s.bx},${s.by}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (s.length <= 0 || (onSource({ x: s.ax, y: s.ay }, source) && onSource({ x: s.bx, y: s.by }, source))) return;
      (segments.get(s.way) ?? segments.set(s.way, []).get(s.way)!).push(s);
    });
  }
  // Engineered sections with their slopes' reach, matched to each segment by bounding box.
  const sections: { j: number; x0: number; y0: number; x1: number; y1: number }[] = [];
  for (let j = 0; j + 1 < n; j++) if (engineered(j) || engineered(j + 1)) {
    const a = road[j], b = road[j + 1], r = Math.max(...toes[j], ...toes[j + 1]) + 15;
    sections.push({ j, x0: Math.min(a.x, b.x) - r, y0: Math.min(a.y, b.y) - r, x1: Math.max(a.x, b.x) + r, y1: Math.max(a.y, b.y) + r });
  }
  for (const [way, list] of segments) for (const s of list) {
    const other = ROAD_CLASSES[s.cls].width / 2, count = Math.min(400, Math.max(1, Math.ceil(s.length)));
    const near = sections.filter(o => o.x0 <= Math.max(s.ax, s.bx) && o.x1 >= Math.min(s.ax, s.bx) && o.y0 <= Math.max(s.ay, s.by) && o.y1 >= Math.min(s.ay, s.by)).map(o => o.j);
    if (!near.length) continue;
    for (let k = 0; k <= count; k++) {
      const t = k / count, q = { x: s.ax + (s.bx - s.ax) * t, y: s.ay + (s.by - s.ay) * t };
      let best: Hit | undefined, gap = Infinity;
      for (const j of near) {
        const a = road[j], b = road[j + 1], dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
        if (!len2) continue;
        const u = ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2;
        if (u < 0 || u > 1) continue;
        const len = Math.sqrt(len2), lateral = ((q.y - a.y) * dx - (q.x - a.x) * dy) / len, side = lateral >= 0 ? 1 : 0;
        const reach = toes[j][side] + (toes[j + 1][side] - toes[j][side]) * u + other;
        if (Math.abs(lateral) >= reach || Math.abs(lateral) - reach >= gap) continue;
        gap = Math.abs(lateral) - reach; best = { q, j, u, side, lateral: Math.abs(lateral), segment: s, t };
      }
      if (best && !ctx.ours(q, other) && buried(best, other) > DRAPED) (hits.get(way) ?? hits.set(way, []).get(way)!).push(best);
    }
  }
  if (!hits.size) return works;
  /** z of the rebuilt stretch at a point on it */
  const zAt = (q: XY) => {
    let z = road[0].z, gap = Infinity;
    for (let j = 0; j + 1 < n; j++) {
      const a = road[j], b = road[j + 1], dx = b.x - a.x, dy = b.y - a.y;
      const u = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      const d = Math.hypot(q.x - a.x - u * dx, q.y - a.y - u * dy);
      if (d < gap) { gap = d; z = a.z + (b.z - a.z) * u; }
    }
    return z;
  };
  const wallAt = (j: number, side: 0 | 1, offset: number) => {
    for (const i of [j, j + 1]) {
      const w = works.walls.get(i) ?? [undefined, undefined];
      w[side] = Math.min(w[side] ?? Infinity, offset); works.walls.set(i, w);
    }
  };
  // Regraded arms and junction mouths: the stretch of each arm's own line they take, from the node.
  const resolved: XY[][] = [], arms = new Set<string>(), joined = new Set<number>();
  const stretch = (p: XY, arm: readonly (XY & { d: number })[], reach: number): XY[] => {
    const out: XY[] = [p];
    for (let k = 0; k < arm.length; k++) {
      if (Math.abs(arm[k].d) <= reach) { out.push(arm[k]); continue; }
      const a = k ? arm[k - 1] : { ...p, d: 0 }, t = (reach - Math.abs(a.d)) / (Math.abs(arm[k].d) - Math.abs(a.d) || 1);
      out.push({ x: a.x + (arm[k].x - a.x) * t, y: a.y + (arm[k].y - a.y) * t }); break;
    }
    return out;
  };
  for (const [way, list] of hits) {
    const cls = list[0].segment.cls;
    // Where it joins the rebuilt stretch: a node of this way on the crossed road's line.
    const joins: XY[] = [];
    for (const s of segments.get(way) ?? []) for (const p of [{ x: s.ax, y: s.ay }, { x: s.bx, y: s.by }])
      if (onPath(p, road, JOIN) && !joins.some(o => Math.hypot(o.x - p.x, o.y - p.y) < 1)) joins.push(p);
    if (joins.length) joined.add(way);
    for (const p of joins) {
      const z = zAt(p), g0 = heightAt(p.x, p.y);
      // Mouth: the junction itself lies within the rebuilt road's width plus its slope.
      let mouth = half;
      for (let i = 0; i < n; i++) if (Math.hypot(road[i].x - p.x, road[i].y - p.y) < 30) mouth = Math.max(mouth, ...toes[i]);
      const path = roads.connectedCrossingPath(way, p.x, p.y, ctx.maxTie + STEP);
      for (const direction of [-1, 1]) {
        const vertices = path.filter(q => direction * q.d > 1e-6).sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
        if (!vertices.length || Math.abs(vertices[vertices.length - 1].d) < 1) continue;
        // One arm of a node is one regrade, whichever way's traversal reaches it first.
        const key = `${Math.round(p.x)},${Math.round(p.y)}>${Math.round(vertices[0].x)},${Math.round(vertices[0].y)}`;
        if (arms.has(key)) continue;
        arms.add(key);
        // Dense samples along the arm (its own vertices kept): the foot is searched every 5 m.
        const arm: typeof vertices = [];
        for (let k = 0; k < vertices.length; k++) {
          const a = k ? vertices[k - 1] : { x: p.x, y: p.y, d: 0 }, b = vertices[k], count = Math.max(1, Math.ceil(Math.abs(b.d - a.d) / 5));
          for (let m = 1; m <= count; m++) arm.push({ x: a.x + (b.x - a.x) * m / count, y: a.y + (b.y - a.y) * m / count, d: a.d + (b.d - a.d) * m / count });
        }
        // only an arm that leaves the crossed road (not one running along it)
        if (onPath(arm[Math.min(arm.length - 1, 1)], road, JOIN) && onPath(arm[0], road, JOIN)) continue;
        // the way this arm actually runs on (a traversal may continue onto another way at the node)
        const own = roads.sourceInterval(p, arm[0]), armCls = own?.cls ?? cls, armRow = ROAD_CLASSES[armCls], armHalf = armRow.width / 2;
        if (Math.abs(z - g0) < FLAT) { resolved.push(stretch(p, arm, mouth + armHalf)); continue; }
        // a motorway or expressway is never met at the same level
        if (armRow.noAtGrade) { if (!works.problems.includes(WORKS_COVER_ROAD)) works.problems.push(WORKS_COVER_ROAD); continue; }
        let foot: (typeof arm)[number] | undefined;
        const short = (q: XY & { d: number }) => {
          const ground = heightAt(q.x, q.y), run = Math.abs(q.d);
          return Math.abs(ground - z) - run * ctx.rampLimit(armCls, z, g0, ground, run) <= 1e-8;
        };
        for (let k = 0; k < arm.length; k++) {
          if (Math.abs(arm[k].d) > ctx.maxTie) break;
          if (!short(arm[k])) continue;
          // the exact foot between this sample and the previous one
          let lo = k ? arm[k - 1] : { x: p.x, y: p.y, d: 0 }, hi = arm[k];
          for (let it = 0; it < 20; it++) {
            const mid = { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2, d: (lo.d + hi.d) / 2 };
            if (short(mid) && Math.abs(mid.d) > 1e-6) hi = mid; else lo = mid;
          }
          foot = hi; break;
        }
        // An arm running into our own earthworks is rebuilt by our road's footprint works (moved
        // beside them, reconnected to this crossing); it is not regraded twice.
        const reach = Math.max(foot ? Math.abs(foot.d) : ctx.maxTie, mouth);
        if (arm.some(q => Math.abs(q.d) <= reach && ctx.ours(q, armHalf))) { resolved.push(stretch(p, arm, reach + armHalf)); continue; }
        if (!foot) { if (!works.problems.includes(WORKS_TIE_TOO_LONG)) works.problems.push(WORKS_TIE_TOO_LONG); continue; }
        const run = Math.abs(foot.d), points: CrossingPoint[] = [];
        const corners = [{ x: p.x, y: p.y, d: 0 }, ...vertices.filter(q => Math.abs(q.d) < run), foot];
        for (let k = 1; k < corners.length; k++) {
          const a = corners[k - 1], b = corners[k], count = Math.max(1, Math.ceil(Math.abs(b.d - a.d) / STEP));
          for (let m = k === 1 ? 0 : 1; m <= count; m++) {
            const u = m / count, x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u, d = Math.abs(a.d + (b.d - a.d) * u);
            const ground = heightAt(x, y), zz = z + (heightAt(foot.x, foot.y) - z) * d / run;
            const point: CrossingPoint = { x, y, z: zz, ground, d, surface: 'ramp', support: zz >= ground ? 'embankment' : 'retaining' };
            if (Math.abs(zz - ground) < 1e-7 || (k === corners.length - 1 && m === count)) { point.z = ground; point.surface = 'terrain'; delete point.support; }
            points.push(point);
          }
        }
        // Another crossing already regrades this road here (to its own level): not modelled.
        if (ctx.claimed?.some(path => points.some(q => onPath(q, path, 1)))) {
          if (!works.problems.includes(WORKS_TIE_SHARED)) works.problems.push(WORKS_TIE_SHARED); continue;
        }
        works.ties.push({ cls: armCls, way: own?.way ?? way, path: points });
        works.tieLength += run;
        works.cost += run * armRow.roadPerKm[ctx.urban] / 1000;
        resolved.push(stretch(p, arm, Math.max(run, mouth) + armHalf));
      }
    }
  }
  // The rest lies beside the slope: a retaining wall holds the slope back from it.
  for (const list of hits.values()) {
    const other = ROAD_CLASSES[list[0].segment.cls].width / 2;
    for (const h of list) {
      if (resolved.some(r => onPath(h.q, r))) continue;
      // a road joining it that runs on under its pavement (mapped a metre or two beside it) is part of it
      if (h.lateral <= half && joined.has(h.segment.way)) continue;
      const edge = h.lateral - other;
      let offset = edge - RETAINING_RULES.clearance;
      // a constrained face may stand right at the paved edge (as beside our own road)
      if (offset < half + RETAINING_RULES.minimumOffset) offset = edge - RETAINING_RULES.constrainedClearance;
      if (offset < half) { if (!works.problems.includes(WORKS_COVER_ROAD)) works.problems.push(WORKS_COVER_ROAD); continue; }
      wallAt(h.j, h.side, offset);
    }
  }
  // Measure the walls actually standing: the slope's height where the wall cuts it.
  const height = (i: number, side: 0 | 1, offset: number) => {
    const p = road[i], { nx, ny } = normals[i], sign = side ? 1 : -1;
    if (toes[i][side] <= offset) return 0;
    const g = heightAt(p.x + nx * sign * offset, p.y + ny * sign * offset), e = heightAt(p.x + nx * sign * half, p.y + ny * sign * half);
    const fill = p.z >= e, slope = (offset - half) / SLOPE;
    return Math.max(0, fill ? p.z - slope - g : g - (p.z + slope));
  };
  // A wall line spans whole sections (both ends of every section a road beside it needs); where the
  // slope stops short of it the face tapers to nothing, as drawn (render/crossing-surface.ts).
  for (let i = 0; i + 1 < n; i++) for (const side of [0, 1] as const) {
    const a = works.walls.get(i)?.[side], b = works.walls.get(i + 1)?.[side];
    if (a === undefined || b === undefined) continue;
    const ha = height(i, side, a), hb = height(i + 1, side, b), h = (ha + hb) / 2;
    if (Math.max(ha, hb) > RETAINING_RULES.maxHeight && !works.problems.includes(WORKS_COVER_ROAD)) works.problems.push(WORKS_COVER_ROAD);
    if (h <= 0) continue;
    const length = Math.hypot(road[i + 1].x - road[i].x, road[i + 1].y - road[i].y);
    works.wallLength += length; works.wallArea += length * h;
    works.cost += length * retainingAssembly(h).perM;
  }
  if (!works.problems.length) ctx.claimed?.push(...works.ties.map(t => t.path));
  return works;
}
