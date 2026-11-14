// Existing road network (OSM) as a segment grid, and the crossings of a route with it.

import { CROSSING_RULES, ROAD_CLASSES } from './data/urban';

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

/** tolerance on segment parameters (round-off at end points) */
const EPS = 1e-9;

const RANK: Record<string, number> = Object.fromEntries(Object.keys(ROAD_CLASSES).map((k, i) => [k, i]));

export class RoadNet {
  private readonly cell = 100;
  private readonly map = new Map<number, number[]>();
  private readonly x0: Float64Array;
  private readonly y0: Float64Array;
  private readonly x1: Float64Array;
  private readonly y1: Float64Array;
  private readonly way: Int32Array;
  private readonly stamp: Int32Array;
  private readonly wayCls: string[];
  private readonly ways: readonly number[][];
  readonly segments: number;

  constructor(data: RoadNetData) {
    this.ways = data.ways;
    let m = 0;
    for (const w of data.ways) m += Math.max(0, (w.length - 1) / 2 - 1);
    this.x0 = new Float64Array(m); this.y0 = new Float64Array(m); this.x1 = new Float64Array(m); this.y1 = new Float64Array(m);
    this.way = new Int32Array(m); this.stamp = new Int32Array(m);
    this.wayCls = data.ways.map((w) => data.cls[w[0]]);
    let k = 0;
    data.ways.forEach((w, wi) => {
      if (!(this.wayCls[wi] in ROAD_CLASSES)) return;
      for (let j = 1; j + 3 < w.length; j += 2) {
        const ax = w[j], ay = w[j + 1], bx = w[j + 2], by = w[j + 3];
        this.x0[k] = ax; this.y0[k] = ay; this.x1[k] = bx; this.y1[k] = by; this.way[k] = wi;
        const c0 = Math.floor(Math.min(ax, bx) / this.cell), c1 = Math.floor(Math.max(ax, bx) / this.cell);
        const r0 = Math.floor(Math.min(ay, by) / this.cell), r1 = Math.floor(Math.max(ay, by) / this.cell);
        for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
          const key = cx * 100003 + cy;
          let a = this.map.get(key);
          if (!a) this.map.set(key, (a = []));
          a.push(k);
        }
        k++;
      }
    });
    this.segments = k;
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
    const path = this.crossingPath(roadId, x, y, reach);
    if (path.length < 2 || path.length > maxPoints) return path.slice(0, maxPoints);
    const key = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;
    const visited = new Set(path.map(p => key(p.x, p.y)));
    for (const side of [-1, 1]) {
      let p = side < 0 ? path[0] : path[path.length - 1];
      let prev = side < 0 ? path[1] : path[path.length - 2];
      const extension: typeof path = [];
      while (Math.abs(p.d) < reach - 1e-6 && path.length + extension.length < maxPoints) {
        const candidates = this.map.get(Math.floor(p.x / this.cell) * 100003 + Math.floor(p.y / this.cell)) ?? [];
        let best: { x: number; y: number; d: number } | undefined, score = -Infinity;
        const dx = p.x - prev.x, dy = p.y - prev.y, len = Math.hypot(dx, dy) || 1;
        for (const k of candidates) for (const reverse of [false, true]) {
          const ax = reverse ? this.x1[k] : this.x0[k], ay = reverse ? this.y1[k] : this.y0[k];
          if (Math.hypot(ax - p.x, ay - p.y) > 0.02) continue;
          const bx = reverse ? this.x0[k] : this.x1[k], by = reverse ? this.y0[k] : this.y1[k];
          const step = Math.hypot(bx - p.x, by - p.y);
          if (step < 1e-6 || visited.has(key(bx, by))) continue;
          const dot = ((bx - p.x) * dx + (by - p.y) * dy) / (step * len);
          if (dot < -0.5) continue;
          const value = dot + (this.wayCls[this.way[k]] === this.wayCls[roadId] ? 2 : 0);
          if (value <= score) continue;
          score = value;
          const fraction = Math.min(1, (reach - Math.abs(p.d)) / step);
          best = { x: p.x + (bx - p.x) * fraction, y: p.y + (by - p.y) * fraction, d: p.d + side * step * fraction };
        }
        if (!best) break;
        visited.add(key(best.x, best.y)); extension.push(best); prev = p; p = best;
      }
      if (side < 0) path.unshift(...extension.reverse()); else path.push(...extension);
    }
    return path;
  }

  /** Closest real way at a route tie-in, using the existing segment grid. */
  nearestWay(x: number, y: number, radius = 30): number | undefined {
    let best = radius, way: number | undefined;
    for (let cx = Math.floor((x - radius) / this.cell); cx <= Math.floor((x + radius) / this.cell); cx++)
      for (let cy = Math.floor((y - radius) / this.cell); cy <= Math.floor((y + radius) / this.cell); cy++)
        for (const k of this.map.get(cx * 100003 + cy) ?? []) {
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
        const a = this.map.get(cx * 100003 + cy);
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
  selectedRoadIds: ReadonlySet<number> = new Set()): RoadCrossing[] {
  const out: (RoadCrossing & { last: number; ways: number[] })[] = [];
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
    if (hit < 0) { out.push({ ...c, last: c.s, ways: [c.way] }); continue; }
    const o = out[hit];
    o.last = c.s;
    if (!o.ways.includes(c.way)) o.ways.push(c.way);
    if (RANK[c.cls] < RANK[o.cls]) { o.s = c.s; o.x = c.x; o.y = c.y; o.cls = c.cls; o.way = c.way; }
  }
  return out.map(({ s, x, y, cls, way }) => ({ s, x, y, cls, way }));
}
