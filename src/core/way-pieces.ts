// What is left of a way our earthworks cut, piece by piece, as a designer judges it (owner's review 2026-11-17,
// research/45): a piece that still reaches the road network over other ways needs nothing (it just ends); only a
// piece cut off from it needs access (a reroute to a crossing that carries traffic over or under us). Where both
// pieces still reach the network, the way is closed here and its traffic goes round: how far round is measured
// over the mapped network, crossing our road only where a crossing carries traffic.
import type { RoadNet } from './roadnet';

type XY = { x: number; y: number };
/** Graph pieces are at most this long, so that our earthworks cut a way where they do, m. */
const PIECE = 25;
/** Way ends this close are one junction (pack ways are simplified by 1 m and rounded to metres, roadnet.ts). */
const SNAP = 2;
/** How far over the network a piece is followed before it counts as part of it, m (engine bound). */
export const PIECE_SEARCH = 3000;
/** Ways that are no public road: a piece of one reaches the network only where it meets a public road. */
const MINOR = new Set(['track', 'service']);

interface Graph { x: Float64Array; y: Float64Array; adj: number[][]; /** per edge: [a, b, way, length] */ edges: Float64Array; ways: Int32Array; cls: (way: number) => string; byWay: Map<number, number[]> }
const graphs = new WeakMap<RoadNet, Graph>();
function graphOf(net: RoadNet): Graph {
  const hit = graphs.get(net);
  if (hit) return hit;
  const ids = new Map<number, number[]>(), xs: number[] = [], ys: number[] = [], adj: number[][] = [], edges: number[] = [], ways: number[] = [];
  const key = (cx: number, cy: number) => cx * 1_000_003 + cy;
  const node = (x: number, y: number) => {
    const cx = Math.round(x / SNAP), cy = Math.round(y / SNAP);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      for (const id of ids.get(key(cx + dx, cy + dy)) ?? []) if (Math.hypot(xs[id] - x, ys[id] - y) <= SNAP) return id;
    const id = xs.length; xs.push(x); ys.push(y); adj.push([]);
    const k = key(cx, cy), list = ids.get(k);
    if (list) list.push(id); else ids.set(k, [id]);
    return id;
  };
  const clsOf: string[] = [];
  net.eachWay((way, cls, xy) => {
    clsOf[way] = cls;
    for (let j = 0; j + 3 < xy.length; j += 2) {
      const ax = xy[j], ay = xy[j + 1], bx = xy[j + 2], by = xy[j + 3], len = Math.hypot(bx - ax, by - ay);
      const count = Math.max(1, Math.ceil(len / PIECE));
      let prev = node(ax, ay);
      for (let m = 1; m <= count; m++) {
        // (inner pieces' ends are never snapped onto other ways: only real vertices are junctions)
        let next: number;
        if (m === count) next = node(bx, by);
        else { next = xs.length; xs.push(ax + (bx - ax) * m / count); ys.push(ay + (by - ay) * m / count); adj.push([]); }
        const e = ways.length;
        edges.push(prev, next, way, len / count); ways.push(way);
        adj[prev].push(e); adj[next].push(e);
        prev = next;
      }
    }
  });
  const byWay = new Map<number, number[]>();
  ways.forEach((w, e) => { const list = byWay.get(w); if (list) list.push(e); else byWay.set(w, [e]); });
  const graph: Graph = { x: Float64Array.from(xs), y: Float64Array.from(ys), adj, edges: Float64Array.from(edges), ways: Int32Array.from(ways), cls: w => clsOf[w] ?? '', byWay };
  graphs.set(net, graph);
  return graph;
}

export interface PieceContext {
  net: RoadNet;
  /** Is a piece of `way` at q under our earthworks with nothing carrying it across (cut)? */
  severed: (way: number, q: XY) => boolean;
  /** Measure how far round up to this far (a public road: whether it may be closed), m; a track or service
   * road just ends, however far round. */
  round?: number;
}
export interface PieceAccess {
  /** Per piece (the cut ends given): does it still reach the road network over other ways? */
  connected: [boolean, boolean];
  /** Over the network from one cut end round to the other, m (Infinity: not within the search). */
  round: number;
}

/** The two pieces of `way` beyond its cut ends `ends` (on the way, just outside the cut). */
export function pieceAccess(ctx: PieceContext, way: number, ends: [XY, XY]): PieceAccess {
  const g = graphOf(ctx.net);
  const blocked = new Map<number, boolean>();
  const open = (e: number) => {
    let v = blocked.get(e);
    if (v === undefined) {
      const a = g.edges[e * 4], b = g.edges[e * 4 + 1];
      v = ctx.severed(g.ways[e], { x: (g.x[a] + g.x[b]) / 2, y: (g.y[a] + g.y[b]) / 2 });
      blocked.set(e, v);
    }
    return !v;
  };
  /** The open graph edge of `way` nearest to p. */
  const startOf = (p: XY) => {
    let best = -1, gap = Infinity;
    for (const e of g.byWay.get(way) ?? []) {
      const a = g.edges[e * 4], b = g.edges[e * 4 + 1], d = Math.hypot((g.x[a] + g.x[b]) / 2 - p.x, (g.y[a] + g.y[b]) / 2 - p.y);
      if (d < gap && open(e)) { gap = d; best = e; }
    }
    return best;
  };
  /** From piece `start` (cut end p) over open edges: does it reach the network (another public road, or the search
   * bound), and, given the other piece's edge `goal`, how far round to the other cut end. */
  const search = (start: number, p: XY, goal?: number, limit = PIECE_SEARCH) => {
    const dist = new Map<number, number>(), heap = new MinHeap();
    for (const n of [g.edges[start * 4], g.edges[start * 4 + 1]]) { const d = Math.hypot(g.x[n] - p.x, g.y[n] - p.y); dist.set(n, d); heap.push(d, n); }
    let reached = false, round = Infinity;
    while (heap.size) {
      const [d, u] = heap.pop();
      if (d > (dist.get(u) ?? Infinity)) continue;
      if (d >= round) break;
      if (d > limit) { reached = goal === undefined; break; }
      for (const e of g.adj[u]) {
        if (e === start || !open(e)) continue;
        const w = g.ways[e];
        if (e === goal) round = Math.min(round, d + Math.hypot(g.x[u] - ends[1].x, g.y[u] - ends[1].y));
        // a piece reaches the network where it meets a public road other than its own way
        if (w !== way && !MINOR.has(g.cls(w))) reached = true;
        const v = g.edges[e * 4] === u ? g.edges[e * 4 + 1] : g.edges[e * 4], nd = d + g.edges[e * 4 + 3];
        if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); heap.push(nd, v); }
      }
      if (reached && goal === undefined) break;
    }
    return { reached, round };
  };
  const s0 = startOf(ends[0]), s1 = startOf(ends[1]);
  const connected: [boolean, boolean] = [s0 >= 0 && search(s0, ends[0]).reached, s1 >= 0 && search(s1, ends[1]).reached];
  const round = ctx.round !== undefined && connected[0] && connected[1] && s0 !== s1 ? search(s0, ends[0], s1, ctx.round).round : Infinity;
  return { connected, round };
}

class MinHeap {
  private k: number[] = []; private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, value: number) {
    const { k, v } = this; let i = k.length; k.push(key); v.push(value);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = value;
  }
  pop(): [number, number] {
    const { k, v } = this, top: [number, number] = [k[0], v[0]], lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i, mk = lk;
        if (l < k.length && k[l] < mk) { m = l; mk = k[l]; }
        if (r < k.length && k[r] < mk) { m = r; }
        if (m === i) break; k[i] = k[m]; v[i] = v[m]; i = m; }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}
