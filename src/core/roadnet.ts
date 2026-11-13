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
  readonly segments: number;

  constructor(data: RoadNetData) {
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

  /**
   * Every intersection of the route polyline (stations s, x, y) with the network, in station order.
   * Both parameters are half-open, so a crossing exactly at a shared vertex is reported once.
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
          if (t < 0 || t >= 1 || u < 0 || u >= 1) continue;
          out.push({ s: s[i] + t * (s[i + 1] - s[i]), x: px + t * rx, y: py + t * ry, cls: this.wayCls[this.way[k]], way: this.way[k] });
        }
      }
      if (out.length - first > 1) {
        const part = out.splice(first).sort((p, q) => p.s - q.s);
        for (const p of part) out.push(p);
      }
    }
    return out;
  }
}

/**
 * Collapse raw intersections (in station order) into crossings: hits within `mergeDistance` of each
 * other, or of the same way within `sameWayMergeDistance`, are one crossing, of the most important
 * class among them and located at that member; hits near the route ends belong to the tie-in.
 */
export function mergeCrossings(raw: RoadCrossing[], length: number, rules = CROSSING_RULES): RoadCrossing[] {
  const out: (RoadCrossing & { last: number; ways: number[] })[] = [];
  for (const c of raw) {
    if (c.s < rules.endMargin || c.s > length - rules.endMargin) continue;
    let hit = -1;
    for (let k = out.length - 1; k >= Math.max(0, out.length - 16); k--) {
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
