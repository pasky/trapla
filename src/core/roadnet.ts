// Existing road network (OSM) as a segment grid, and the crossings of a route with it.

import { CROSSING_RULES, ROAD_CLASSES } from './data/urban';
import type { Segment2 } from './footprint-geometry';

export interface RoadSegment extends Segment2 { way: number; cls: string }
export interface RoadConnection { way: number; cls: string; d: number; dx: number; dy: number }
export interface RoadJunction { x: number; y: number; connections: RoadConnection[] }

/** pack format (`overlays.net`): class names and polylines [classIndex, x0, y0, x1, y1, …] in local metres */
export interface RoadNetData { cls: string[]; ways: number[][] }

export interface RoadCrossing {
  /** station along the route, m */
  s: number;
  x: number;
  y: number;
  /** key into ROAD_CLASSES */
  cls: string;
  /** index of the OSM way in the pack */
  way: number;
}
/** A merged crossing (mergeCrossings) and the first hit of each other way merged into it. */
export interface MergedCrossing extends RoadCrossing { members?: RoadCrossing[] }

/** tolerance on segment parameters (round-off at end points) */
const EPS = 1e-9;
/** Conservative uncertainty only: pack ways are simplified by 1 m then rounded to metres.
 * Never use this to invent connected traversal segments or a usable crossing anchor. */
const JUNCTION_UNCERTAINTY = 2;
const pointKey = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;

const RANK: Record<string, number> = Object.fromEntries(Object.keys(ROAD_CLASSES).map((k, i) => [k, i]));

export class RoadNet {
  private readonly cell = 100;
  private readonly map: Map<number, number[]>;
  /** An edited network shares its pack network's grid: only the cells its changed ways touch are its own. */
  private readonly override?: Map<number, number[]>;
  private readonly x0: Float64Array;
  private readonly y0: Float64Array;
  private readonly x1: Float64Array;
  private readonly y1: Float64Array;
  private readonly way: Int32Array;
  private readonly stamp: Int32Array;
  private queryStamp = 0;
  private readonly querySeen: Int32Array;
  private readonly distance: Float64Array;
  private readonly wayCls: string[];
  // Segment endpoints are immutable; lazily retain their cycle-detection keys across traversals.
  private readonly endpointKeys: string[] = [];
  private readonly ways: readonly number[][];
  private readonly clsNames: readonly string[];
  readonly segments: number;

  /** `overlay`: the same network as `base` except its `changed` ways (an edit of a few roads costs
   * their segments, not a rebuild of the whole grid). */
  constructor(data: RoadNetData, overlay?: { base: RoadNet; changed: readonly number[] }) {
    this.ways = data.ways; this.clsNames = data.cls;
    const count = (w: readonly number[]) => Math.max(0, (w.length - 1) / 2 - 1);
    const base = overlay?.base, kept = base ? base.segments : 0;
    let m = kept;
    if (overlay) for (const wi of overlay.changed) m += count(data.ways[wi]);
    else for (const w of data.ways) m += count(w);
    this.x0 = new Float64Array(m); this.y0 = new Float64Array(m); this.x1 = new Float64Array(m); this.y1 = new Float64Array(m);
    this.way = new Int32Array(m); this.stamp = new Int32Array(m);
    this.querySeen = new Int32Array(m); this.distance = new Float64Array(m);
    this.wayCls = data.ways.map((w) => data.cls[w[0]]);
    if (base) {
      this.x0.set(base.x0.subarray(0, kept)); this.y0.set(base.y0.subarray(0, kept)); this.x1.set(base.x1.subarray(0, kept));
      this.y1.set(base.y1.subarray(0, kept)); this.way.set(base.way.subarray(0, kept)); this.distance.set(base.distance.subarray(0, kept));
      this.map = base.map; this.override = new Map();
    } else this.map = new Map();
    const cellsOf = (q: number, visit: (key: number) => void) => {
      const ax = this.x0[q], ay = this.y0[q], bx = this.x1[q], by = this.y1[q];
      const c0 = Math.floor(Math.min(ax, bx) / this.cell), c1 = Math.floor(Math.max(ax, bx) / this.cell);
      const r0 = Math.floor(Math.min(ay, by) / this.cell), r1 = Math.floor(Math.max(ay, by) / this.cell);
      for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) visit(cx * 100003 + cy);
    };
    /** this network's own list of a cell (an overlay copies the shared one on first change) */
    const own = (key: number) => {
      const lists = this.override ?? this.map;
      let a = lists.get(key);
      if (!a) lists.set(key, (a = this.override ? (this.map.get(key) ?? []).slice() : []));
      return a;
    };
    let k = kept;
    const add = (wi: number) => {
      const w = data.ways[wi];
      if (!(this.wayCls[wi] in ROAD_CLASSES)) return;
      let distance = 0;
      for (let j = 1; j + 3 < w.length; j += 2) {
        const ax = w[j], ay = w[j + 1], bx = w[j + 2], by = w[j + 3];
        this.x0[k] = ax; this.y0[k] = ay; this.x1[k] = bx; this.y1[k] = by; this.way[k] = wi;
        this.distance[k] = distance; distance += Math.hypot(bx - ax, by - ay);
        const q = k;
        cellsOf(q, key => own(key).push(q));
        k++;
      }
    };
    if (overlay) {
      const changed = new Set(overlay.changed);
      for (let q = 0; q < kept; q++) if (changed.has(this.way[q])) cellsOf(q, key => { const a = own(key), at = a.indexOf(q); if (at >= 0) a.splice(at, 1); });
      for (const wi of overlay.changed) add(wi);
    } else for (let wi = 0; wi < data.ways.length; wi++) add(wi);
    this.segments = k;
  }
  /** Segments indexed in a grid cell. */
  private at(key: number): number[] | undefined { return this.override?.get(key) ?? this.map.get(key); }

  /** Existing segment grid reused by footprint checks; no full-network scan per evaluation. */
  nearSegments(bounds: readonly number[], visit: (segment: RoadSegment) => void): void {
    if (++this.queryStamp >= 2147483647) { this.querySeen.fill(0); this.queryStamp = 1; }
    const [x0, y0, x1, y1] = bounds;
    for (let x = Math.floor(x0 / this.cell); x <= Math.floor(x1 / this.cell); x++)
      for (let y = Math.floor(y0 / this.cell); y <= Math.floor(y1 / this.cell); y++)
        for (const k of this.at(x * 100003 + y) ?? []) {
          if (this.querySeen[k] === this.queryStamp) continue;
          this.querySeen[k] = this.queryStamp;
          if (Math.max(this.x0[k], this.x1[k]) < x0 || Math.min(this.x0[k], this.x1[k]) > x1
            || Math.max(this.y0[k], this.y1[k]) < y0 || Math.min(this.y0[k], this.y1[k]) > y1) continue;
          visit({ ax: this.x0[k], ay: this.y0[k], bx: this.x1[k], by: this.y1[k], d: this.distance[k],
            length: Math.hypot(this.x1[k] - this.x0[k], this.y1[k] - this.y0[k]), way: this.way[k], cls: this.wayCls[this.way[k]] });
        }
  }

  wayClass(way: number): string { return this.wayCls[way]; }
  /** The same network without the given stretches (way chainages d0 < d1): a rebuilt stretch of an
   * existing road is not a road its own replacement crosses. See `edited` for the numbering. */
  without(cuts: readonly { way: number; d0: number; d1: number }[]): RoadNet {
    return this.edited(cuts, []);
  }
  /** Ways in the pack's network (designed roads of an edited network are numbered from here). */
  get wayCount(): number { return this.ways.length; }
  /** The network as the player edited it: rebuilt stretches cut out and designed roads added as ways of
   * their class. Numbering is stable whatever else is edited: every pack way keeps its index (a cut way:
   * its part before the first cut); `extra[k]` is way `wayCount + k`; what follows cut `i` on its way (up
   * to the next cut) is way `wayCount + extra.length + (cuts[i].slot ?? i)`. */
  edited(cuts: readonly { way: number; d0: number; d1: number; slot?: number }[], extra: readonly { cls: string; xy: readonly number[] }[]): RoadNet {
    const cls = this.clsNames.slice();
    const clsIndex = (name: string) => { let i = cls.indexOf(name); if (i < 0) { i = cls.length; cls.push(name); } return i; };
    const remnants = this.ways.length + extra.length;
    const slots = cuts.reduce((n, c, i) => Math.max(n, (c.slot ?? i) + 1), 0);
    const ways = [...this.ways, ...extra.map(e => [clsIndex(e.cls), ...e.xy]), ...Array.from({ length: slots }, () => [0])];
    const changed = extra.map((_, k) => this.ways.length + k);
    // Several cuts of one way: what is left between them; the part before the first cut keeps the way's index.
    const byWay = new Map<number, [number, number, number][]>();
    cuts.forEach((cut, i) => {
      if (!this.ways[cut.way] || !(cut.d1 > cut.d0)) return;
      let list = byWay.get(cut.way); if (!list) byWay.set(cut.way, list = []);
      list.push([cut.d0, cut.d1, cut.slot ?? i]);
    });
    for (const [way, list] of byWay) {
      const w = this.ways[way], total = this.wayPath(way, 0, Infinity).at(-1)?.d ?? 0;
      const piece = (start: number, end: number) => [w[0], ...this.wayPath(way, start, end).flatMap(p => [p.x, p.y])];
      list.sort((p, q) => p[0] - q[0]);
      // a cut from the way's start leaves its own index empty
      const first = list[0][0] > 0.01 ? piece(0, list[0][0]) : [w[0]];
      ways[way] = first.length >= 5 ? first : [w[0]]; changed.push(way);
      // what follows a cut belongs to it (overlapping cuts: to the one reaching furthest)
      let at = -Infinity, owner = -1;
      list.forEach(([, d1, slot], q) => {
        if (d1 > at) { at = d1; owner = slot; }
        const end = q + 1 < list.length ? list[q + 1][0] : total;
        if (end <= at + 0.01) return;
        const rest = piece(at, end);
        if (rest.length >= 5) { ways[remnants + owner] = rest; changed.push(remnants + owner); }
      });
    }
    // an edit of an edited network (not used by the game) is rebuilt in full
    const net = this.override ? new RoadNet({ cls, ways }) : new RoadNet({ cls, ways }, { base: this, changed });
    if (extra.length) {
      net.designedWays = { from: this.ways.length, to: this.ways.length + extra.length };
      net.makeGround = () => this.edited(cuts, extra.map(e => ({ cls: e.cls, xy: [] })));
    }
    return net;
  }
  /** Ways `from` ≤ way < `to` are designed roads of the project (see project-roadnet.ts). */
  designedWays?: { from: number; to: number };
  isDesigned(way: number): boolean { return !!this.designedWays && way >= this.designedWays.from && way < this.designedWays.to; }
  private groundNet?: RoadNet;
  private makeGround?: () => RoadNet;
  /** The same network without designed roads: what earthworks, walls and relocations deal with (designed
   * roads meet each other at crossings and junctions, never as relocated existing roads). */
  get ground(): RoadNet {
    if (!this.designedWays || !this.makeGround) return this;
    if (!this.groundNet) { this.groundNet = this.makeGround(); this.groundNet.groundNet = this.groundNet; }
    return this.groundNet;
  }
  /** Absolute distance along a way at its nearest point, for interval subtraction and real tie-ins. */
  wayStation(way: number, x: number, y: number): number {
    const w = this.ways[way];
    if (!w) return 0;
    let d = 0, centre = 0, best = Infinity;
    for (let j = 1; j + 3 < w.length; j += 2) {
      const dx = w[j + 2] - w[j], dy = w[j + 3] - w[j + 1], len = Math.hypot(dx, dy);
      const t = len ? Math.max(0, Math.min(1, ((x - w[j]) * dx + (y - w[j + 1]) * dy) / (len * len))) : 0;
      const distance = (x - w[j] - t * dx) ** 2 + (y - w[j + 1] - t * dy) ** 2;
      if (distance < best) { best = distance; centre = d + t * len; }
      d += len;
    }
    return centre;
  }
  wayPath(way: number, start: number, end: number): { x: number; y: number; d: number }[] {
    const w = this.ways[way];
    if (!w) return [];
    const out: { x: number; y: number; d: number }[] = [];
    let distance = 0;
    for (let j = 1; j + 3 < w.length && distance <= end; j += 2) {
      const dx = w[j + 2] - w[j], dy = w[j + 3] - w[j + 1], len = Math.hypot(dx, dy);
      const lo = Math.max(start, distance), hi = Math.min(end, distance + len);
      if (hi >= lo && len > 0) {
        const point = (d: number) => { const t = (d - distance) / len; return { x: w[j] + t * dx, y: w[j + 1] + t * dy, d }; };
        if (!out.length) out.push(point(lo));
        out.push(point(hi));
      }
      distance += len;
    }
    return out;
  }

  /** Clip a real pack way around the closest point to a crossing, preserving bends.
   * Distances are along the existing way; no invented extension beyond its endpoints. */
  crossingPath(roadId: number, x: number, y: number, reach: number): { x: number; y: number; d: number }[] {
    const w = this.ways[roadId];
    if (!w || w.length < 5 || !(reach > 0)) return [];
    const stations = [0];
    let centre = 0, best = Infinity;
    for (let j = 1, k = 0; j + 3 < w.length; j += 2, k++) {
      const dx = w[j + 2] - w[j], dy = w[j + 3] - w[j + 1], len = Math.hypot(dx, dy);
      const t = len ? Math.max(0, Math.min(1, ((x - w[j]) * dx + (y - w[j + 1]) * dy) / (len * len))) : 0;
      const dist = Math.hypot(x - w[j] - t * dx, y - w[j + 1] - t * dy);
      if (dist < best) { best = dist; centre = stations[k] + t * len; }
      stations.push(stations[k] + len);
    }
    const a = Math.max(0, centre - reach), b = Math.min(stations[stations.length - 1], centre + reach);
    const out: { x: number; y: number; d: number }[] = [];
    const samples = [...new Set([a, ...stations.filter(s => s > a && s < b), centre, b])].sort((p, q) => p - q);
    let k = 0;
    for (const s of samples) {
      while (k + 2 < stations.length && stations[k + 1] < s) k++;
      const t = (s - stations[k]) / (stations[k + 1] - stations[k] || 1), j = 1 + 2 * k;
      out.push({ x: w[j] + t * (w[j + 2] - w[j]), y: w[j + 1] + t * (w[j + 3] - w[j + 1]), d: s - centre });
    }
    return out;
  }

  /** Continue over real connected OSM segments when a way is split at a tag boundary or junction.
   * Choose the straightest continuation, preferring the same class. Never extrapolate an endpoint.
   * Both traversal and output are bounded, including malformed cyclic networks. */
  connectedCrossingPath(roadId: number, x: number, y: number, reach: number,
    maxPoints = 1500): { x: number; y: number; d: number }[] {
    let path = this.crossingPath(roadId, x, y, reach);
    if (path.length < 2) return path;
    if (path.length > maxPoints) {
      const centre = path.findIndex(p => p.d >= 0);
      const start = Math.max(0, Math.min(path.length - maxPoints, centre - Math.floor(maxPoints / 2)));
      path = path.slice(start, start + maxPoints);
    }
    const visited = new Set(path.map(p => pointKey(p.x, p.y)));
    const cls = this.wayCls[roadId];
    for (const side of [-1, 1]) {
      let p = side < 0 ? path[0] : path[path.length - 1];
      let prev = side < 0 ? path[1] : path[path.length - 2];
      const extension: typeof path = [];
      while (Math.abs(p.d) < reach - 1e-6 && path.length + extension.length < maxPoints) {
        const candidates = this.at(Math.floor(p.x / this.cell) * 100003 + Math.floor(p.y / this.cell)) ?? [];
        let best: { x: number; y: number; d: number } | undefined, score = -Infinity;
        const dx = p.x - prev.x, dy = p.y - prev.y, len = Math.hypot(dx, dy) || 1;
        for (const k of candidates) for (let reverse = 0; reverse < 2; reverse++) {
          const ax = reverse ? this.x1[k] : this.x0[k], ay = reverse ? this.y1[k] : this.y0[k];
          // Most segments in a 100 m cell do not touch this endpoint. Reject those without a
          // hypot, retaining the original radial test (and candidate order) at the boundary.
          if (Math.abs(ax - p.x) > 0.02 || Math.abs(ay - p.y) > 0.02 || Math.hypot(ax - p.x, ay - p.y) > 0.02) continue;
          const bx = reverse ? this.x0[k] : this.x1[k], by = reverse ? this.y0[k] : this.y1[k];
          const step = Math.hypot(bx - p.x, by - p.y);
          if (step < 1e-6 || visited.has(this.endpointKeys[2 * k + reverse] ??= pointKey(bx, by))) continue;
          const dot = ((bx - p.x) * dx + (by - p.y) * dy) / (step * len);
          if (dot < -0.5) continue; // never prefer a same-class U-turn over the through alignment
          const nextCls = this.wayCls[this.way[k]];
          if (!ROAD_CLASSES[cls].noAtGrade && ROAD_CLASSES[nextCls].noAtGrade) continue;
          const value = dot + (nextCls === cls ? 0.25 : 0);
          if (value <= score) continue;
          score = value;
          const fraction = Math.min(1, (reach - Math.abs(p.d)) / step);
          best = { x: p.x + (bx - p.x) * fraction, y: p.y + (by - p.y) * fraction, d: p.d + side * step * fraction };
        }
        if (!best) break;
        visited.add(pointKey(best.x, best.y)); extension.push(best); prev = p; p = best;
      }
      if (side < 0) path.unshift(...extension.reverse()); else path.push(...extension);
    }
    return path;
  }

  /** Identify a real source chord, including its own way chainages (not the chainage of a
   * neighbouring way used to start a connected traversal). Both ends must lie on one segment. */
  sourceInterval(a: { x: number; y: number }, b: { x: number; y: number }, preferredWay?: number): { way: number; a: number; b: number; cls: string } | undefined {
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
    let found: { way: number; a: number; b: number; cls: string } | undefined, bestError = Infinity;
    this.nearSegments([x - 0.02, y - 0.02, x + 0.02, y + 0.02], s => {
      if (s.length < 1e-6) return;
      const project = (p: { x: number; y: number }) => {
        const t = Math.max(0, Math.min(1, ((p.x - s.ax) * (s.bx - s.ax) + (p.y - s.ay) * (s.by - s.ay)) / (s.length * s.length)));
        const error = Math.hypot(p.x - s.ax - t * (s.bx - s.ax), p.y - s.ay - t * (s.by - s.ay));
        return { d: s.d + t * s.length, error };
      };
      const da = project(a), db = project(b), error = Math.max(da.error, db.error);
      if (error > 0.02 || error > bestError + 1e-10 || (Math.abs(error - bestError) <= 1e-10 && (found?.way === preferredWay || s.way !== preferredWay))) return;
      bestError = error; found = { way: s.way, a: da.d, b: db.d, cls: s.cls };
    });
    return found;
  }

  /** A traversal stopping is NOT evidence of a dead end: it may hit a class restriction,
   * sharp junction, point budget or cycle. Only a single incident graph ray is a true end.
   * Interior points of another segment count as two rays (an unsplit T-junction). */
  isDeadEnd(p: { x: number; y: number }): boolean {
    return new Set(this.connections(p, JUNCTION_UNCERTAINTY).map(c => `${c.dx.toFixed(5)},${c.dy.toFixed(5)}`)).size === 1;
  }

  /** Incident graph rays. d is 1 cm into each ray on its own way, so an interval ending at
   * the junction cannot accidentally claim the untouched continuation beyond that boundary. */
  connections(p: { x: number; y: number }, tolerance = 0.02): RoadConnection[] {
    const out: RoadConnection[] = [];
    this.nearSegments([p.x - tolerance, p.y - tolerance, p.x + tolerance, p.y + tolerance], s => {
      const dx = s.bx - s.ax, dy = s.by - s.ay;
      const t = Math.max(0, Math.min(1, ((p.x - s.ax) * dx + (p.y - s.ay) * dy) / (s.length * s.length || 1)));
      if (Math.hypot(p.x - s.ax - t * dx, p.y - s.ay - t * dy) > tolerance) return;
      for (const [x, y, direction] of [[s.ax, s.ay, -1], [s.bx, s.by, 1]]) {
        const len = Math.hypot(x - p.x, y - p.y);
        if (len > 0.02) out.push({ way: s.way, cls: s.cls, d: s.d + t * s.length + direction * Math.min(0.01, len / 2), dx: (x - p.x) / len, dy: (y - p.y) / len });
      }
    });
    return out;
  }

  /** Branch junctions on a real source chord, including other ways' endpoints in its
   * interior. Query the segment grid only; no per-plan scan of the road network. */
  junctions(a: { x: number; y: number }, b: { x: number; y: number }): RoadJunction[] {
    const candidates = new Map<string, { x: number; y: number }>(), dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
    const add = (p: { x: number; y: number }) => {
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (length2 || 1)));
      if (Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) < JUNCTION_UNCERTAINTY) candidates.set(pointKey(p.x, p.y), p);
    };
    add(a); add(b);
    this.nearSegments([Math.min(a.x, b.x) - JUNCTION_UNCERTAINTY, Math.min(a.y, b.y) - JUNCTION_UNCERTAINTY, Math.max(a.x, b.x) + JUNCTION_UNCERTAINTY, Math.max(a.y, b.y) + JUNCTION_UNCERTAINTY], s => {
      add({ x: s.ax, y: s.ay }); add({ x: s.bx, y: s.by });
    });
    const out: RoadJunction[] = [];
    for (const p of candidates.values()) {
      const connections = this.connections(p, JUNCTION_UNCERTAINTY);
      if (new Set(connections.map(c => `${c.dx.toFixed(5)},${c.dy.toFixed(5)}`)).size > 2) out.push({ ...p, connections });
    }
    return out;
  }

  /** Shortest network distance between two road points over real segments (endpoints and
   * interior T-attachments), skipping `avoid`ed segments. Bounded by `maxDistance` and a node
   * budget; undefined when no such path is found within them. */
  networkDistance(from: { x: number; y: number }, to: { x: number; y: number }, maxDistance: number,
    avoid: (segment: RoadSegment) => boolean, maxNodes = 400): number | undefined {
    const key = (p: { x: number; y: number }) => pointKey(p.x, p.y), goal = key(to);
    const best = new Map<string, number>([[key(from), 0]]);
    const queue: { p: { x: number; y: number }; d: number }[] = [{ p: from, d: 0 }];
    for (let visited = 0; queue.length && visited < maxNodes; visited++) {
      let k = 0;
      for (let i = 1; i < queue.length; i++) if (queue[i].d < queue[k].d) k = i;
      const { p, d } = queue.splice(k, 1)[0];
      if (d > (best.get(key(p)) ?? Infinity) + 1e-9) continue;
      if (key(p) === goal || Math.hypot(p.x - to.x, p.y - to.y) <= 0.02) return d;
      const segments: RoadSegment[] = [];
      this.nearSegments([p.x - 0.02, p.y - 0.02, p.x + 0.02, p.y + 0.02], s => segments.push(s));
      for (const s of segments) {
        const dx = s.bx - s.ax, dy = s.by - s.ay, len2 = s.length * s.length || 1;
        const t = Math.max(0, Math.min(1, ((p.x - s.ax) * dx + (p.y - s.ay) * dy) / len2));
        if (Math.hypot(p.x - s.ax - t * dx, p.y - s.ay - t * dy) > 0.02 || avoid(s)) continue;
        // Next nodes in both directions: the segment ends, the goal, and every other way attached
        // inside this segment (an unsplit T-junction), so traversal is the same either way round.
        const stops: { x: number; y: number; u: number }[] = [{ x: s.ax, y: s.ay, u: 0 }, { x: s.bx, y: s.by, u: 1 }];
        const attach = (x: number, y: number) => {
          const u = ((x - s.ax) * dx + (y - s.ay) * dy) / len2;
          if (u > 0 && u < 1 && Math.hypot(x - s.ax - u * dx, y - s.ay - u * dy) <= 0.02) stops.push({ x, y, u });
        };
        attach(to.x, to.y);
        this.nearSegments([Math.min(s.ax, s.bx) - 0.02, Math.min(s.ay, s.by) - 0.02, Math.max(s.ax, s.bx) + 0.02, Math.max(s.ay, s.by) + 0.02], o => {
          if (o.ax === s.ax && o.ay === s.ay && o.bx === s.bx && o.by === s.by) return;
          attach(o.ax, o.ay); attach(o.bx, o.by);
        });
        for (const direction of [-1, 1]) {
          // The nearest stop beyond p in this direction along the segment.
          let next: { x: number; y: number; u: number } | undefined;
          for (const q of stops) if (direction * (q.u - t) > 1e-9 && (!next || direction * (q.u - next.u) < 0)) next = q;
          if (!next) continue;
          const step = Math.hypot(next.x - p.x, next.y - p.y);
          if (step < 1e-6 || d + step > maxDistance) continue;
          const nextKey = key(next);
          if (d + step < (best.get(nextKey) ?? Infinity) - 1e-9) { best.set(nextKey, d + step); queue.push({ p: { x: next.x, y: next.y }, d: d + step }); }
        }
      }
    }
    return undefined;
  }

  /** Closest real way at a route tie-in, using the existing segment grid. */
  nearestWay(x: number, y: number, radius = 30): number | undefined {
    let best = radius, way: number | undefined;
    for (let cx = Math.floor((x - radius) / this.cell); cx <= Math.floor((x + radius) / this.cell); cx++)
      for (let cy = Math.floor((y - radius) / this.cell); cy <= Math.floor((y + radius) / this.cell); cy++)
        for (const k of this.at(cx * 100003 + cy) ?? []) {
          const dx = this.x1[k] - this.x0[k], dy = this.y1[k] - this.y0[k];
          const t = Math.max(0, Math.min(1, ((x - this.x0[k]) * dx + (y - this.y0[k]) * dy) / (dx * dx + dy * dy || 1)));
          const distance = Math.hypot(x - this.x0[k] - t * dx, y - this.y0[k] - t * dy);
          if (distance < best && !ROAD_CLASSES[this.wayCls[this.way[k]]].noAtGrade) { best = distance; way = this.way[k]; }
        }
    return way;
  }

  /**
   * Every intersection of the route polyline (stations s, x, y) with the network, in station order.
   * A hit exactly at a station belongs to the interval starting there (the last interval also
   * includes B); the road parameter is closed,
   * so the result does not depend on the direction in which a way was drawn. Both tests carry a
   * tolerance for round-off at end points; a hit that this (or a vertex shared by two segments of one
   * way) reports twice is dropped.
   */
  intersections(n: number, s: ArrayLike<number>, x: ArrayLike<number>, y: ArrayLike<number>): RoadCrossing[] {
    const out: RoadCrossing[] = [];
    const stamp = this.stamp;
    stamp.fill(0);
    for (let i = 0; i + 1 < n; i++) {
      const px = x[i], py = y[i], rx = x[i + 1] - px, ry = y[i + 1] - py;
      const c0 = Math.floor(Math.min(px, px + rx) / this.cell), c1 = Math.floor(Math.max(px, px + rx) / this.cell);
      const r0 = Math.floor(Math.min(py, py + ry) / this.cell), r1 = Math.floor(Math.max(py, py + ry) / this.cell);
      const first = out.length;
      for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
        const a = this.at(cx * 100003 + cy);
        if (!a) continue;
        for (const k of a) {
          if (stamp[k] === i + 1) continue;
          stamp[k] = i + 1;
          const qx = this.x1[k] - this.x0[k], qy = this.y1[k] - this.y0[k];
          const den = rx * qy - ry * qx;
          if (Math.abs(den) < 1e-9) continue; // parallel
          const ex = this.x0[k] - px, ey = this.y0[k] - py;
          const t = (ex * qy - ey * qx) / den, u = (ex * ry - ey * rx) / den;
          if (t < -EPS || (i + 2 === n ? t > 1 + EPS : t >= 1 - EPS) || u < -EPS || u > 1 + EPS) continue;
          out.push({ s: s[i] + t * (s[i + 1] - s[i]), x: px + t * rx, y: py + t * ry, cls: this.wayCls[this.way[k]], way: this.way[k] });
        }
      }
      if (out.length - first > 1) {
        const part = out.splice(first).sort((p, q) => p.s - q.s || p.way - q.way);
        for (const p of part) out.push(p);
      }
      // the same way hit again at (practically) the same station: a shared vertex or round-off
      for (let k = first; k < out.length; k++) {
        let dup = false;
        for (let j = k - 1; j >= 0 && out[k].s - out[j].s < 1e-3; j--) if (out[j].way === out[k].way) { dup = true; break; }
        if (dup) out.splice(k--, 1);
      }
    }
    return out;
  }
}

/**
 * Collapse raw intersections (in station order) into crossings: hits within `mergeDistance` of each
 * other, or of the same way within `sameWayMergeDistance`, are one crossing, of the most important
 * class among them and located at that member. Ordinary-road hits near the ends belong to the tie-in
 * BILL; motorway/trunk structures remain payable except at the actual endpoint intersection.
 * Cost representation only: hard clearance constraints must use raw intersections, not this list.
 */
export function mergeCrossings(raw: RoadCrossing[], length: number,
  rules: Pick<typeof CROSSING_RULES, 'endMargin' | 'mergeDistance' | 'sameWayMergeDistance'> = CROSSING_RULES,
  selectedRoadIds: ReadonlySet<number> = new Set()): MergedCrossing[] {
  const out: (RoadCrossing & { last: number; ways: number[]; hits: RoadCrossing[] })[] = [];
  for (const c of raw) {
    if (!selectedRoadIds.has(c.way) && (c.s < rules.endMargin || c.s > length - rules.endMargin)) {
      if (!ROAD_CLASSES[c.cls].noAtGrade || c.s <= CROSSING_RULES.endpointTolerance
        || length - c.s <= CROSSING_RULES.endpointTolerance) continue;
    }
    let hit = -1;
    for (let k = out.length - 1; k >= Math.max(0, out.length - 16); k--) {
      // Keep EVERY hit of a selected road: a second intersection can have a different clearance.
      // Raw intersections already deduplicate shared vertices. Auto keeps historical billing groups.
      if (selectedRoadIds.has(c.way) || out[k].ways.some(w => selectedRoadIds.has(w))) continue;
      const gap = c.s - out[k].last;
      if (gap <= rules.mergeDistance || (gap <= rules.sameWayMergeDistance && out[k].ways.includes(c.way))) { hit = k; break; }
    }
    if (hit < 0) { out.push({ ...c, last: c.s, ways: [c.way], hits: [c] }); continue; }
    const o = out[hit];
    o.last = c.s;
    if (!o.ways.includes(c.way)) { o.ways.push(c.way); o.hits.push(c); }
    if (RANK[c.cls] < RANK[o.cls]) { o.s = c.s; o.x = c.x; o.y = c.y; o.cls = c.cls; o.way = c.way; }
  }
  return out.map(({ s, x, y, cls, way, hits }) => {
    const members = hits.filter(h => h.way !== way);
    return { s, x, y, cls, way, ...(members.length ? { members } : {}) };
  });
}
