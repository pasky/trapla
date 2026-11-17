// What is left of a way our earthworks cut, piece by piece, as a designer judges it (owner's review 2026-11-17,
// research/45): a piece that still reaches the road network over other ways needs nothing (it just ends); only a
// piece cut off from it needs access (a reroute to a crossing that carries traffic over or under us). Where both
// pieces still reach the network, the way is closed here and its traffic goes round: how far round is measured
// over the mapped network.
//
// What it reads of our road: only where our earthworks stand (a way under them is cut, whatever is built for it:
// the conservative reading, so that a crossing's pieces never depend on another crossing's treatment), within
// PIECE_SEARCH of the crossing; the local retry rebuilds every crossing within LOCAL_CORE (≥ that) of a change.
import type { RoadNet } from './roadnet';

type XY = { x: number; y: number };
/** Way ends this close are one junction (pack ways are simplified by 1 m and rounded to metres, roadnet.ts). */
const SNAP = 2;
/** How far over the network a piece is followed, m (engine bound; within the local retry's core, crossings-kept.ts):
 * a piece that meets no public road within it counts as cut off. */
export const PIECE_SEARCH = 1500;
/** Ways that are no public road: a piece of one reaches the network only where it meets a public road. */
const MINOR = new Set(['track', 'service']);

interface Graph { x: number[]; y: number[]; adj: number[][]; /** per edge: a, b, way, length */ edges: number[]; cls: Map<number, string> }
/** Region graphs per network, by REGION cell: each covers its cell and PIECE_SEARCH (+ a margin) around it; the
 * REGIONS last used kept (memory: the cells of a route's crossings). */
const REGION = 1000, REGIONS = 48;
const regions = new WeakMap<RoadNet, Map<number, Graph>>();
function regionGraph(net: RoadNet, at: XY): Graph {
  let cache = regions.get(net);
  if (!cache) regions.set(net, cache = new Map());
  const cx = Math.floor(at.x / REGION), cy = Math.floor(at.y / REGION), k = cx * 1_000_003 + cy;
  let g = cache.get(k);
  if (g) { cache.delete(k); cache.set(k, g); return g; }
  g = buildRegion(net, { x: (cx + 0.5) * REGION, y: (cy + 0.5) * REGION }, PIECE_SEARCH + REGION);
  cache.set(k, g);
  if (cache.size > REGIONS) cache.delete(cache.keys().next().value!);
  return g;
}
/** The mapped network within r of a point: ways' vertices, junctions where ends meet. */
function buildRegion(net: RoadNet, at: XY, r: number): Graph {
  const ids = new Map<number, number[]>(), g: Graph = { x: [], y: [], adj: [], edges: [], cls: new Map() };
  const key = (cx: number, cy: number) => cx * 1_000_003 + cy;
  const node = (x: number, y: number) => {
    const cx = Math.round(x / SNAP), cy = Math.round(y / SNAP);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      for (const id of ids.get(key(cx + dx, cy + dy)) ?? []) if (Math.hypot(g.x[id] - x, g.y[id] - y) <= SNAP) return id;
    const id = g.x.length; g.x.push(x); g.y.push(y); g.adj.push([]);
    const k = key(cx, cy), list = ids.get(k);
    if (list) list.push(id); else ids.set(k, [id]);
    return id;
  };
  const seen = new Set<string>();
  net.nearSegments([at.x - r, at.y - r, at.x + r, at.y + r], s => {
    const k = `${s.way}:${s.ax},${s.ay},${s.bx},${s.by}`;
    if (seen.has(k) || !(s.length > 0)) return;
    seen.add(k);
    const a = node(s.ax, s.ay), b = node(s.bx, s.by), e = g.edges.length / 4;
    g.edges.push(a, b, s.way, s.length); g.adj[a].push(e); g.adj[b].push(e); g.cls.set(s.way, s.cls);
  });
  // A way ending on another's line between its vertices (each way is simplified on its own, so a T-junction's
  // node may be gone from the through way): joined to that segment's ends (roadnet.ts JUNCTION_UNCERTAINTY).
  const count = g.edges.length / 4, CELL = 50, grid = new Map<number, number[]>();
  for (let e = 0; e < count; e++) {
    const a = g.edges[e * 4], b = g.edges[e * 4 + 1];
    for (let cx = Math.floor((Math.min(g.x[a], g.x[b]) - SNAP) / CELL); cx <= Math.floor((Math.max(g.x[a], g.x[b]) + SNAP) / CELL); cx++)
      for (let cy = Math.floor((Math.min(g.y[a], g.y[b]) - SNAP) / CELL); cy <= Math.floor((Math.max(g.y[a], g.y[b]) + SNAP) / CELL); cy++) {
        const k = key(cx, cy), list = grid.get(k); if (list) list.push(e); else grid.set(k, [e]);
      }
  }
  for (let n = 0, nodes = g.x.length; n < nodes; n++) if (g.adj[n].length === 1) {
    const x = g.x[n], y = g.y[n];
    for (const e of grid.get(key(Math.floor(x / CELL), Math.floor(y / CELL))) ?? []) {
      const a = g.edges[e * 4], b = g.edges[e * 4 + 1];
      if (a === n || b === n) continue;
      const ax = g.x[a], ay = g.y[a], dx = g.x[b] - ax, dy = g.y[b] - ay;
      if (Math.min(ax, ax + dx) - SNAP > x || Math.max(ax, ax + dx) + SNAP < x || Math.min(ay, ay + dy) - SNAP > y || Math.max(ay, ay + dy) + SNAP < y) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(x - ax - t * dx, y - ay - t * dy) > SNAP) continue;
      const len = g.edges[e * 4 + 3], way = g.edges[e * 4 + 2];
      for (const [m, w] of [[a, t * len], [b, (1 - t) * len]] as const) {
        const f = g.edges.length / 4; g.edges.push(n, m, way, w); g.adj[n].push(f); g.adj[m].push(f);
      }
    }
  }
  return g;
}

export interface PieceContext {
  net: RoadNet;
  /** Is the stretch a–b of a way under our earthworks (cut there)? */
  severed: (a: XY, b: XY) => boolean;
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

/** The two pieces of `way` beyond its cut ends `ends` (on the way or a way continuing it, just outside the cut). */
export function pieceAccess(ctx: PieceContext, way: number, ends: [XY, XY]): PieceAccess {
  const g = regionGraph(ctx.net, { x: (ends[0].x + ends[1].x) / 2, y: (ends[0].y + ends[1].y) / 2 });
  const blocked = new Map<number, boolean>();
  const open = (e: number) => {
    let v = blocked.get(e);
    if (v === undefined) {
      const a = g.edges[e * 4], b = g.edges[e * 4 + 1];
      v = ctx.severed({ x: g.x[a], y: g.y[a] }, { x: g.x[b], y: g.y[b] });
      blocked.set(e, v);
    }
    return !v;
  };
  /** The open graph edge nearest to cut end p (its own way's, else any way's within a few metres) and which of its
   * nodes lie beyond the cut, with their distances along it. */
  const startOf = (p: XY) => {
    let best = -1, gap = 3;
    for (let e = 0; e < g.edges.length / 4; e++) {
      const a = g.edges[e * 4], b = g.edges[e * 4 + 1], ax = g.x[a], ay = g.y[a], dx = g.x[b] - ax, dy = g.y[b] - ay;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / (dx * dx + dy * dy || 1)));
      const d = Math.hypot(p.x - ax - t * dx, p.y - ay - t * dy) - (g.edges[e * 4 + 2] === way ? 1 : 0);
      if (d < gap) { gap = d; best = e; }
    }
    return best;
  };
  /** From cut end p on edge `start` over open stretches (only the part of `start` beyond the cut is the piece):
   * does it meet a public road other than its own way, and, given the other cut end's edge `goal`, how far round. */
  const search = (start: number, p: XY, goal?: number, limit = PIECE_SEARCH) => {
    const dist = new Map<number, number>(), heap = new MinHeap();
    // (the start edge's nodes the piece reaches from p without crossing our earthworks)
    for (const n of [g.edges[start * 4], g.edges[start * 4 + 1]]) {
      const q = { x: g.x[n], y: g.y[n] };
      if (ctx.severed(p, q)) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y); dist.set(n, d); heap.push(d, n);
    }
    let reached = false, round = Infinity;
    while (heap.size) {
      const [d, u] = heap.pop();
      if (d > (dist.get(u) ?? Infinity)) continue;
      if (d >= round || d > limit) break;
      for (const e of g.adj[u]) {
        if (e === goal && !ctx.severed({ x: g.x[u], y: g.y[u] }, ends[1])) round = Math.min(round, d + Math.hypot(g.x[u] - ends[1].x, g.y[u] - ends[1].y));
        if (e === start || !open(e)) continue;
        const w = g.edges[e * 4 + 2];
        // a piece reaches the network where it meets a public road other than its own way
        if (w !== way && !MINOR.has(g.cls.get(w) ?? '')) reached = true;
        const v = g.edges[e * 4] === u ? g.edges[e * 4 + 1] : g.edges[e * 4], nd = d + g.edges[e * 4 + 3];
        if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); heap.push(nd, v); }
      }
      if (reached && goal === undefined) break;
    }
    return { reached, round };
  };
  const s0 = startOf(ends[0]), s1 = startOf(ends[1]);
  const connected: [boolean, boolean] = [s0 >= 0 && search(s0, ends[0]).reached, s1 >= 0 && search(s1, ends[1]).reached];
  const round = ctx.round !== undefined && connected[0] && connected[1] && s0 >= 0 && s1 >= 0 && s0 !== s1 ? search(s0, ends[0], s1, ctx.round).round : Infinity;
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
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i, mk = lk;
        if (l < k.length && k[l] < mk) { m = l; mk = k[l]; }
        if (r < k.length && k[r] < mk) m = r;
        if (m === i) break;
        k[i] = k[m]; v[i] = v[m]; i = m;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}
