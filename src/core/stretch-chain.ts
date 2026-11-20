// A rebuilt stretch over several mapped ways (owner, D11: a crossed road's rebuilt stretch could not be pulled past a
// junction). OSM splits a road into ways at junctions and at bridges; a stretch is their intervals in route order a → b
// (RouteDesign.source.intervals), each meeting the next at a node at its end. One interval runs with its source (the
// promotion invariant); in a chain each part leaves by the end it shares with the next. A mapped bridge inside the
// chain is rebuilt with it (its old structure taken down, project-replacement.ts); a tunnel is not yet.
import type { ConnectionDesign, RouteDesign, SourceInterval, XYZ } from './project';
import type { ProjectTransportIndex } from './project-network';
import type { TransportSource } from './project-transport';
import type { RoadNet, StructureKind } from './roadnet';
import { ROAD_CLASSES } from './data/urban';

export interface ChainPart { interval: SourceInterval; /** traversed from s1 to s0 */ reversed: boolean }
/** A point of a stretch's old line: route chainage `s`, the part it is on and that source's own station `at`. */
export type ChainPoint = XYZ & { s: number; part: number; at: number };

/** A rebuilt stretch ends this far short of a level crossing, a joining bridge or tunnel or a side road's bridge, m
 * (a game clearance, as road-edit.ts derivedStretch has always kept). */
export const CHAIN_KEEP_CLEAR = 5;
/** A way of the same number or name goes on as the road through a turn up to this (cos 75°); any other way only
 * within 45° of straight on: the straightest (game tolerances, PROVISIONAL; project-replacement.ts uses 45° for the
 * road going on at a stretch's end). Headings over 20 m. */
const SAME_ROAD_COS = Math.cos(75 * Math.PI / 180), STRAIGHT_COS = Math.SQRT1_2, HEADING_LOOK = 20;

const nodeAt = (source: TransportSource, s: number): string | undefined => {
  const st = source.stations;
  let lo = 0, hi = st.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >>> 1; if (st[m] <= s) lo = m; else hi = m; }
  for (const i of [lo, hi]) if (Math.abs(st[i] - s) < 1e-6) return source.nodes[i];
  return undefined;
};
/** A source's plan point at station s (whatever its elevation). */
export function xyAt(source: Pick<TransportSource, 'xy' | 'stations'>, s: number): { x: number; y: number } {
  const st = source.stations, n = st.length;
  if (s <= st[0]) return { x: source.xy[0], y: source.xy[1] };
  if (s >= st[n - 1]) return { x: source.xy[2 * n - 2], y: source.xy[2 * n - 1] };
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >>> 1; if (st[m] <= s) lo = m; else hi = m; }
  const t = (s - st[lo]) / ((st[hi] - st[lo]) || 1);
  return { x: source.xy[2 * lo] + t * (source.xy[2 * hi] - source.xy[2 * lo]), y: source.xy[2 * lo + 1] + t * (source.xy[2 * hi + 1] - source.xy[2 * lo + 1]) };
}
/** What a mapped way is: on the ground, a bridge or a tunnel. */
export const structureOf = (source: TransportSource | undefined): 'ground' | 'bridge' | 'tunnel' =>
  source?.bridge ? 'bridge' : source?.tunnel ? 'tunnel' : 'ground';

/** Each interval with its direction in route order. */
export function chainParts(base: ProjectTransportIndex, intervals: readonly SourceInterval[]): ChainPart[] {
  if (intervals.length <= 1) return intervals.map(interval => ({ interval, reversed: false }));
  const ends = intervals.map(i => { const q = base.source(i.sourceId); return q ? [nodeAt(q, i.s0), nodeAt(q, i.s1)] : [undefined, undefined]; });
  const shares = (j: number, n: string | undefined) => n !== undefined && !!ends[j]?.includes(n);
  return intervals.map((interval, k) => {
    const [n0, n1] = ends[k];
    // (it leaves by the end it shares with the next part; the last enters by the end it shares with the one before)
    const reversed = k < intervals.length - 1 ? shares(k + 1, n0) && !shares(k + 1, n1) : shares(k - 1, n1) && !shares(k - 1, n0);
    return { interval, reversed };
  });
}
/** Is this a chain (each part meeting the next at a node at both their ends)? */
export function isChain(base: ProjectTransportIndex, intervals: readonly SourceInterval[]): boolean {
  const parts = chainParts(base, intervals);
  for (let k = 1; k < parts.length; k++) {
    const p = parts[k - 1], q = parts[k], a = base.source(p.interval.sourceId), b = base.source(q.interval.sourceId);
    if (!a || !b) return false;
    const out = nodeAt(a, p.reversed ? p.interval.s0 : p.interval.s1), into = nodeAt(b, q.reversed ? q.interval.s1 : q.interval.s0);
    if (out === undefined || out !== into) return false;
  }
  return true;
}

/** The stretch's old line in route order, route chainage from 0 at its a end (one interval: `base.path` from s0). A
 * bridge's own heights are not mapped: its deck is taken straight between its ends' heights. Throws where a part on the
 * ground has no ground under it (off the map). */
export function chainPath(base: ProjectTransportIndex, intervals: readonly SourceInterval[]): ChainPoint[] {
  if (intervals.length === 1) {
    const i = intervals[0];
    return base.path(i).map(p => ({ ...p, s: p.s - i.s0, part: 0, at: p.s }));
  }
  const out: ChainPoint[] = [];
  let offset = 0;
  chainParts(base, intervals).forEach(({ interval, reversed }, k) => {
    base.checkInterval(interval);
    const source = base.source(interval.sourceId)!;
    const inner = source.stations.filter(s => s > interval.s0 && s < interval.s1);
    const stations = [interval.s0, ...inner, interval.s1];
    if (reversed) stations.reverse();
    for (const [j, at] of stations.entries()) {
      if (k > 0 && j === 0) continue; // the joint, already the previous part's last point
      const q = xyAt(source, at), p = base.position(source.id, at);
      if (!p && source.elevation !== 'unknown') throw new Error('Source elevation is unresolved');
      out.push({ x: q.x, y: q.y, z: p ? p.z : NaN, s: offset + Math.abs(at - (reversed ? interval.s1 : interval.s0)), part: k, at });
    }
    offset += interval.s1 - interval.s0;
  });
  // (a deck between its ends' heights)
  for (let i = 0; i < out.length; i++) if (!Number.isFinite(out[i].z)) {
    let a = i - 1, b = i + 1;
    while (b < out.length && !Number.isFinite(out[b].z)) b++;
    if (a < 0 || b >= out.length) throw new Error('Source elevation is unresolved');
    for (let j = i; j < b; j++) out[j].z = out[a].z + (out[b].z - out[a].z) * (out[j].s - out[a].s) / ((out[b].s - out[a].s) || 1);
    i = b;
  }
  return out;
}
/** The chain's length, m. */
export const chainLength = (intervals: readonly SourceInterval[]) => intervals.reduce((m, i) => m + i.s1 - i.s0, 0);
/** Where the route's chainage s lies: the part and that source's station. */
export function chainStation(parts: readonly ChainPart[], s: number): { part: number; at: number } {
  let offset = 0;
  for (const [k, { interval, reversed }] of parts.entries()) {
    const length = interval.s1 - interval.s0;
    if (s <= offset + length + 1e-9 || k === parts.length - 1) {
      const t = Math.max(0, Math.min(length, s - offset));
      return { part: k, at: reversed ? interval.s1 - t : interval.s0 + t };
    }
    offset += length;
  }
  return { part: 0, at: 0 };
}
/** The route chainage of station `at` of part k. */
export function chainOffset(parts: readonly ChainPart[], k: number, at: number): number {
  let offset = 0;
  for (let j = 0; j < k; j++) offset += parts[j].interval.s1 - parts[j].interval.s0;
  const { interval, reversed } = parts[k];
  return offset + (reversed ? interval.s1 - at : at - interval.s0);
}

/** The id of the connection where part k of a chain meets part k + 1 (its position: where the old ways met). */
export const jointId = (routeId: string, k: number) => `connection:${routeId}:joint:${k}`;

// ---- the stretch's old road in the legacy network (the evaluation has no transport index: its ways and stations) ----

export type SourceWayMap = ReadonlyMap<string, number>;
const structureWays = new WeakMap<RoadNet, Map<string, number>>();
/** The legacy way of a mapped source: its pack way, or a mapped bridge's or tunnel's structure way (by its OSM id). */
export function legacyWayOf(roads: RoadNet, sourceWays: SourceWayMap | undefined, sourceId: string): number | undefined {
  const way = sourceWays?.get(sourceId);
  if (way !== undefined) return way;
  let map = structureWays.get(roads);
  if (!map) {
    map = new Map();
    for (const [w, s] of roads.structures) if (s.osm) map.set(`osm:way:${s.osm}`, w);
    structureWays.set(roads, map);
  }
  return map.get(sourceId);
}
/** A part of a rebuilt stretch's old road in the legacy network: its way, the way's chainage [d0, d1], traversed from
 * d1 to d0 (`reversed`), and what it is when a mapped structure. */
export interface OldPiece { way: number; d0: number; d1: number; reversed: boolean; structure?: StructureKind }
/** A rebuilt stretch's old road in the legacy network, in route order, measured between its ends and the joints its
 * promotion recorded (undefined: a way it cannot find there). One interval: its way between the route's ends. */
export function oldPieces(roads: RoadNet, route: Pick<RouteDesign, 'id' | 'source' | 'endpoints'>, connections: readonly ConnectionDesign[],
  sourceWays: SourceWayMap | undefined): OldPiece[] | undefined {
  const intervals = route.source?.intervals ?? [];
  if (!intervals.length) return undefined;
  const a = route.endpoints.a.position, b = route.endpoints.b.position;
  if (intervals.length === 1) {
    const way = sourceWays?.get(intervals[0].sourceId);
    if (way === undefined) return undefined;
    const da = roads.wayStation(way, a.x, a.y), db = roads.wayStation(way, b.x, b.y);
    return [{ way, d0: Math.min(da, db), d1: Math.max(da, db), reversed: false }];
  }
  const points: { x: number; y: number }[] = [a];
  for (let k = 0; k + 1 < intervals.length; k++) {
    const c = connections.find(q => q.id === jointId(route.id, k));
    if (!c) return undefined;
    points.push(c.position);
  }
  points.push(b);
  const out: OldPiece[] = [];
  for (const [k, i] of intervals.entries()) {
    const way = legacyWayOf(roads, sourceWays, i.sourceId);
    if (way === undefined) return undefined;
    const p = points[k], q = points[k + 1], dp = roads.wayStation(way, p.x, p.y), dq = roads.wayStation(way, q.x, q.y);
    const structure = roads.structure(way)?.kind;
    out.push({ way, d0: Math.min(dp, dq), d1: Math.max(dp, dq), reversed: dp > dq, ...(structure ? { structure } : {}) });
  }
  return out;
}
/** The old road of the pieces as one line in route order (one piece: the way's own order, as it always was). */
export function oldLine(roads: RoadNet, pieces: readonly OldPiece[]): { x: number; y: number; d: number }[] {
  if (pieces.length === 1) return roads.wayPath(pieces[0].way, pieces[0].d0, pieces[0].d1);
  const out: { x: number; y: number; d: number }[] = [];
  let d = 0;
  for (const p of pieces) {
    const path = roads.wayPath(p.way, p.d0, p.d1);
    if (p.reversed) path.reverse();
    for (const [j, q] of path.entries()) {
      const last = out[out.length - 1];
      if (last) { const step = Math.hypot(q.x - last.x, q.y - last.y); if (j === 0 && step < 0.5) continue; d += step; }
      out.push({ x: q.x, y: q.y, d });
    }
  }
  return out;
}
/** The old road as the old line(s) of a rebuilt stretch (project-kept.ts OldPaths): where its new line stays on it, it
 * is kept as it is, an old bridge in it too. */
export const oldPaths = (roads: RoadNet, pieces: readonly OldPiece[]): { x: number; y: number }[][] => [oldLine(roads, pieces)];

// ---- following the old road onward from a stretch's end (ui/stretch-ends.ts, a bridge's stretch) ----

/** Why the old road can be followed no further: it ends (or meets no way that goes on as it), another rebuilt stretch
 * or a piece taken up starts, another road's earthworks cover it, the map ends, a railway or a side road's bridge
 * meets it, a tunnel starts, a road of the project joins it. */
export type ChainStop = { reason: 'end' | 'claimed' | 'taken' | 'map' | 'railway' | 'bridge' | 'tunnel' | 'joined' | 'reach' } | { reason: 'covered'; by: string };
export interface ChainWalk {
  /** the old road onward, part by part in walking order (`reversed`: walked towards s0) */
  parts: ChainPart[];
  stop: ChainStop;
}
export interface WalkLimits {
  /** stretches other roads of the project rebuild, and pieces taken up (`taken`) */
  claimed: readonly (SourceInterval & { taken?: boolean })[];
  /** where other roads' earthworks cover a mapped road */
  covered: (sourceId: string) => readonly (SourceInterval & { by: string })[];
  /** where roads of the project end on mapped roads */
  joins: readonly { sourceId: string; s: number }[];
  /** sources already in the stretch: never walked onto again */
  seen: ReadonlySet<string>;
  /** how far to follow it, m */
  reach: number;
}
const LEGAL = (h: string | undefined) => h === 'primary' ? 'I' : h === 'secondary' ? 'II' : h === 'tertiary' ? 'III' : h === 'track' ? 'track' : h === 'service' ? 'service' : 'local';
/** Can a rebuilt stretch of this class go on along this way (a road of a class the game rebuilds, of the same legal
 * class, on the ground or a bridge)? */
export function chainable(source: TransportSource | undefined, highway: string | undefined): boolean {
  const h = source?.tags.highway ?? '', row = ROAD_CLASSES[h];
  return !!source && source.kind === 'road' && !!row && !row.noAtGrade && !h.endsWith('_link') && LEGAL(h) === LEGAL(highway)
    && (source.elevation === 'terrain' || source.bridge);
}
/** The unit heading of a source at station s, walking `dir` (+1: towards higher stations), over HEADING_LOOK. */
const heading = (source: TransportSource, s: number, dir: 1 | -1) => {
  const p = xyAt(source, s), q = xyAt(source, s + dir * HEADING_LOOK), l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  return { x: (q.x - p.x) / l, y: (q.y - p.y) / l };
};
/** The other ways at a node of a source (at its station `at`). */
const branchAt = (base: ProjectTransportIndex, source: TransportSource, at: number) =>
  base.branches({ transportData: base.transportData, sourceId: source.id, s0: 0, s1: source.stations[source.stations.length - 1] }).find(b => Math.abs(b.s - at) < 1e-6);
/** The way the road goes on as at the end node of `source` it reaches walking `dir`: a way starting or ending there,
 * chainable, not yet seen; the one with its number (else its name) through a turn up to 75°, else the straightest
 * within 45°. Null: none. */
export function continuation(base: ProjectTransportIndex, source: TransportSource, dir: 1 | -1, seen: ReadonlySet<string>):
  { source: TransportSource; dir: 1 | -1 } | null {
  const length = source.stations[source.stations.length - 1], at = dir > 0 ? length : 0;
  const into = heading(source, at, (-dir) as 1 | -1), ahead = { x: -into.x, y: -into.y };
  const branch = branchAt(base, source, at);
  let best: { source: TransportSource; dir: 1 | -1; rank: number; cos: number } | null = null;
  for (const o of branch?.other ?? []) {
    const q = base.source(o.sourceId);
    if (!q || q.id === source.id || seen.has(q.id) || !chainable(q, source.tags.highway)) continue;
    const end = q.stations[q.stations.length - 1];
    const d: 1 | -1 | 0 = Math.abs(o.s) < 1e-6 ? 1 : Math.abs(o.s - end) < 1e-6 ? -1 : 0;
    if (!d) continue;
    const h = heading(q, o.s, d), cos = h.x * ahead.x + h.y * ahead.y;
    const same = (k: 'ref' | 'name') => !!source.tags[k] && source.tags[k] === q.tags[k];
    const rank = same('ref') ? 2 : same('name') ? 1 : 0;
    if (cos < (rank ? SAME_ROAD_COS : STRAIGHT_COS)) continue;
    if (!best || rank > best.rank || (rank === best.rank && cos > best.cos)) best = { source: q, dir: d, rank, cos };
  }
  return best && { source: best.source, dir: best.dir };
}
/** The old road onward from station s of a source, walking `dir`, through junctions onto the way it goes on as, until
 * something stops it (WalkLimits) or `reach` metres. Its parts end where the stretch's end may stand: short of a level
 * crossing or tunnel by CHAIN_KEEP_CLEAR; a bridge is walked over whole. */
export function walkOn(base: ProjectTransportIndex, sourceId: string, s: number, dir: 1 | -1, limits: WalkLimits): ChainWalk {
  const parts: ChainPart[] = [], seen = new Set(limits.seen);
  let source = base.source(sourceId), at = s, walked = 0;
  const part = (from: number, to: number) => {
    if (Math.abs(to - from) < 1e-6) return;
    parts.push({ interval: { transportData: base.transportData, sourceId: source!.id, s0: Math.min(from, to), s1: Math.max(from, to) }, reversed: to < from });
    walked += Math.abs(to - from);
  };
  /** the walk ends on a bridge: back to its start (an end never stands on one) */
  const offBridge = () => {
    while (parts.length && base.source(parts[parts.length - 1].interval.sourceId)?.bridge) { const p = parts.pop()!; walked -= p.interval.s1 - p.interval.s0; }
  };
  for (let guard = 0; source && guard < 200; guard++) {
    seen.add(source.id);
    const length = source.stations[source.stations.length - 1], end = dir > 0 ? length : 0;
    const ahead = (t: number) => dir > 0 ? t > at + 1e-6 : t < at - 1e-6, nearer = (t: number, u: number) => dir > 0 ? t < u : t > u;
    let stop: { t: number; why: ChainStop } | null = null;
    const consider = (t: number, why: ChainStop) => { if (ahead(t) || Math.abs(t - at) <= 1e-6) { if (!stop || nearer(t, stop.t)) stop = { t, why }; } };
    for (const c of limits.claimed) if (c.sourceId === source.id && c.transportData === base.transportData)
      consider(dir > 0 ? c.s0 : c.s1, { reason: c.taken ? 'taken' : 'claimed' });
    for (const c of limits.covered(source.id)) consider(dir > 0 ? c.s0 : c.s1, { reason: 'covered', by: c.by });
    for (const j of limits.joins) if (j.sourceId === source.id) consider(j.s, { reason: 'joined' });
    // (a railway, or a side road's bridge or tunnel, meeting it: short of it)
    if (!source.bridge) for (const b of base.branches({ transportData: base.transportData, sourceId: source.id, s0: 0, s1: length })) {
      if (Math.abs(b.s - end) < 1e-6) continue; // its end node: the way it goes on as is looked at below
      const others = b.other.map(o => base.source(o.sourceId));
      if (others.some(q => q?.kind === 'railway')) consider(b.s - dir * CHAIN_KEEP_CLEAR, { reason: 'railway' });
      else if (others.some(q => !q || q.elevation !== 'terrain')) consider(b.s - dir * CHAIN_KEEP_CLEAR, { reason: 'bridge' });
    }
    // (the map's edge: the last node with ground under it)
    if (source.elevation === 'terrain') for (const node of dir > 0 ? source.stations : [...source.stations].reverse())
      if (ahead(node) && !base.position(source.id, node)) {
        const back = source.stations.filter(t => dir > 0 ? t < node && t >= at : t > node && t <= at);
        consider(back.length ? (dir > 0 ? Math.max(...back) : Math.min(...back)) : at, { reason: 'map' }); break;
      }
    if (walked + Math.abs(end - at) > limits.reach) consider(at + dir * Math.max(0, limits.reach - walked), { reason: 'reach' });
    if (stop) {
      const { t, why } = stop as { t: number; why: ChainStop };
      // (a stop inside a bridge: before it)
      if (source.bridge) { offBridge(); return { parts, stop: why }; }
      part(at, t); return { parts, stop: why };
    }
    part(at, end);
    // at its end node: the way it goes on as; a railway there, or another way's bridge, stops it short
    const branch = branchAt(base, source, end);
    const others = (branch?.other ?? []).map(o => base.source(o.sourceId));
    const next = continuation(base, source, dir, seen);
    const shortOf = (why: ChainStop): ChainWalk => {
      if (source!.bridge) { offBridge(); return { parts, stop: why }; }
      const last = parts[parts.length - 1];
      if (last && last.interval.sourceId === source!.id) {
        const cut = Math.min(CHAIN_KEEP_CLEAR, last.interval.s1 - last.interval.s0);
        if (last.reversed) last.interval = { ...last.interval, s0: last.interval.s0 + cut }; else last.interval = { ...last.interval, s1: last.interval.s1 - cut };
        if (!(last.interval.s1 - last.interval.s0 > 1e-6)) parts.pop();
      }
      return { parts, stop: why };
    };
    if (others.some(q => q?.kind === 'railway')) return shortOf({ reason: 'railway' });
    if (next?.source.tunnel || (!next && others.some(q => q?.tunnel))) return shortOf({ reason: 'tunnel' });
    if (others.some(q => q && q !== next?.source && q.kind === 'road' && q.elevation !== 'terrain')) return shortOf({ reason: 'bridge' });
    if (!next) { if (source.bridge) offBridge(); return { parts, stop: { reason: 'end' } }; }
    source = next.source; dir = next.dir; at = dir > 0 ? 0 : source.stations[source.stations.length - 1];
  }
  return { parts, stop: { reason: 'end' } };
}

// ---- a line over parts in route order, with a chainage of its own (moving a stretch's ends) ----

/** Adjacent parts on the same source joined into one (a walk that goes on along the way a stretch ends on). */
export function mergeParts(parts: readonly ChainPart[]): ChainPart[] {
  const out: ChainPart[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last && last.interval.sourceId === p.interval.sourceId && last.reversed === p.reversed
      && Math.abs((last.reversed ? last.interval.s0 : last.interval.s1) - (p.reversed ? p.interval.s1 : p.interval.s0)) < 1e-6)
      out[out.length - 1] = { reversed: last.reversed, interval: { ...last.interval, s0: Math.min(last.interval.s0, p.interval.s0), s1: Math.max(last.interval.s1, p.interval.s1) } };
    else if (p.interval.s1 - p.interval.s0 > 1e-9) out.push({ interval: { ...p.interval }, reversed: p.reversed });
  }
  return out;
}
/** Parts walked away from a stretch's a end (walking order) put in route order: reversed in order and direction. */
export const towardsA = (parts: readonly ChainPart[]): ChainPart[] => [...parts].reverse().map(p => ({ interval: { ...p.interval }, reversed: !p.reversed }));

/** A line over parts in route order. Its chainage t: one part, that source's own station (so a single way's stretch
 * is measured exactly as it always was); several, metres from the first part's entry. */
export class ChainLine {
  readonly parts: ChainPart[];
  private readonly starts: number[] = [];
  readonly length: number;
  constructor(private readonly base: ProjectTransportIndex, parts: readonly ChainPart[]) {
    this.parts = mergeParts(parts);
    let t = 0;
    for (const p of this.parts) { this.starts.push(t); t += p.interval.s1 - p.interval.s0; }
    this.length = t;
  }
  get single() { return this.parts.length === 1 && !this.parts[0].reversed; }
  /** the line's first and last chainage */
  get t0() { return this.single ? this.parts[0].interval.s0 : 0; }
  get t1() { return this.single ? this.parts[0].interval.s1 : this.length; }
  /** the chainage of station `at` of `sourceId` on this line (undefined: not on it) */
  t(sourceId: string, at: number): number | undefined {
    const k = this.parts.findIndex(p => p.interval.sourceId === sourceId && at >= p.interval.s0 - 1e-6 && at <= p.interval.s1 + 1e-6);
    if (k < 0) return undefined;
    const { interval, reversed } = this.parts[k];
    return this.single ? at : this.starts[k] + (reversed ? interval.s1 - at : at - interval.s0);
  }
  /** the stretch's intervals over [t0, t1], in route order */
  intervals(t0: number, t1: number): SourceInterval[] {
    if (this.single) return [{ ...this.parts[0].interval, s0: t0, s1: t1 }];
    const out: SourceInterval[] = [];
    for (const [k, { interval, reversed }] of this.parts.entries()) {
      const a = Math.max(t0, this.starts[k]), b = Math.min(t1, this.starts[k] + interval.s1 - interval.s0);
      if (!(b - a > 1e-6)) continue;
      const u = a - this.starts[k], v = b - this.starts[k];
      // (held within the part: round-off never runs off its way)
      const s0 = reversed ? interval.s1 - v : interval.s0 + u, s1 = reversed ? interval.s1 - u : interval.s0 + v;
      out.push({ ...interval, s0: Math.max(interval.s0, s0), s1: Math.min(interval.s1, s1) });
    }
    return out;
  }
  /** the old line over [t0, t1], its points' s in this line's chainage */
  path(t0: number, t1: number): (XYZ & { s: number })[] {
    if (this.single) return this.base.path(this.intervals(t0, t1)[0]);
    return chainPath(this.base, this.intervals(t0, t1)).map(p => ({ x: p.x, y: p.y, z: p.z, s: p.s + t0 }));
  }
  /** the point at chainage t */
  point(t: number): XYZ | null {
    if (this.single) return this.base.position(this.parts[0].interval.sourceId, t);
    const { part, at } = chainStation(this.parts, t - this.t0), source = this.base.source(this.parts[part].interval.sourceId);
    if (!source) return null;
    const p = this.base.position(source.id, at);
    if (p) return p;
    // (on a bridge: its deck between its ends' heights)
    const a = Math.max(this.t0, this.starts[part]), b = this.starts[part] + this.parts[part].interval.s1 - this.parts[part].interval.s0;
    try { const path = this.path(Math.max(0, a - 1), Math.min(this.length, b + 1)), q = xyAt(source, at), z = path.reduce((m, r) => Math.abs(r.s - t) < Math.abs(m.s - t) ? r : m).z; return { ...q, z }; }
    catch { return null; }
  }
  /** the part at chainage t */
  partAt(t: number): ChainPart { return this.parts[chainStation(this.parts, t - this.t0).part]; }
  /** where each part starts and ends on the line */
  spans(): { t0: number; t1: number; part: ChainPart }[] {
    return this.parts.map((part, k) => ({ t0: this.single ? part.interval.s0 : this.starts[k], t1: this.single ? part.interval.s1 : this.starts[k] + part.interval.s1 - part.interval.s0, part }));
  }
}
/** The old road's heights along a stretch over several ways: the ground, and over an old bridge in it (within
 * `reach` of its line, between its ends) its deck straight between its ends' heights (a mapped bridge's own heights are
 * not mapped). */
export function deckHeights(roads: RoadNet, pieces: readonly OldPiece[], ground: (x: number, y: number) => number, reach = 15): (x: number, y: number) => number {
  const decks = pieces.filter(p => p.structure === 'bridge').map(p => {
    const line = roads.wayPath(p.way, p.d0, p.d1), a = line[0], b = line[line.length - 1];
    return { line, za: ground(a.x, a.y), zb: ground(b.x, b.y), length: b.d - a.d };
  }).filter(d => d.line.length >= 2 && d.length > 0);
  if (!decks.length) return ground;
  return (x, y) => {
    for (const d of decks) {
      let best = Infinity, at = 0;
      for (let k = 1; k < d.line.length; k++) {
        const p = d.line[k - 1], q = d.line[k], dx = q.x - p.x, dy = q.y - p.y;
        const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (y - p.y) * dy) / (dx * dx + dy * dy || 1)));
        const e = Math.hypot(x - p.x - t * dx, y - p.y - t * dy);
        if (e < best) { best = e; at = p.d + t * (q.d - p.d) - d.line[0].d; }
      }
      if (best <= reach && at > 0 && at < d.length) return d.za + (d.zb - d.za) * at / d.length;
    }
    return ground(x, y);
  };
}
