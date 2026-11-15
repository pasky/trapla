// Conservative non-interaction screen. Several roads, each evaluated ALONE against the unchanged
// existing network, may be priced together only when nothing one road builds, buys, closes or makes
// loud can change another road's own outcome. Any doubt leaves the project unpriced; this screen never
// resolves an interaction. Joint engineering/acquisition/noise decisions are a later stage.
import type { BuildingIndex } from './buildings';
import type { CrossingGeometry, CrossingPoint } from './crossings';
import { NOISE } from './data/urban';
import type { Result } from './evaluate';
import type { RouteId } from './project';
import { hardGroundLoss, noiseSource } from './road-noise';

/** PROVISIONAL screening constants: game rules, not norms. Larger values only leave MORE projects
 * unpriced; none of them can make an interacting project priced. */
export const INDEPENDENCE_SCREEN = {
  /** Plan gap kept between two roads' land take and works (working strip, drainage), m. */
  clearance: 10,
  /** Outside its own noise list, a road this far below the limit at a house (controlling period) is
   * not counted as a second road there (the usual 10 dB rule of decibel addition; ≤ +0.41 dB for two
   * roads at a house exactly at the limit). PROVISIONAL screening choice, not a Czech norm. */
  noiseMargin: 10,
  /** Exceeds the legacy loss table's linear-interpolation shortfall against the exact hard-ground law, dB. */
  noiseTolerance: 0.05,
  /** Bounds the neglected aggregate energy (maxRoutes × 10^(−margin/10) of one limit). */
  maxRoutes: 10,
} as const;

export interface ScreenRoute { routeId: RouteId; result: Result; aadt: number; speed: number; heavyShare: number;
  /** Built half-width at least (crown), also where a bridge/tunnel takes no land. */ halfWidth: number }
export type InteractionReason = 'too-many-roads' | 'shared-land' | 'shared-building' | 'shared-noise' | 'shared-road';
export interface RouteInteraction { routeIds: RouteId[]; reason: InteractionReason; buildingIndex?: number }
export interface IndependenceScreen {
  independent: boolean; interactions: RouteInteraction[];
  /** Upper bound on neglected linear energy at a house from roads other than its own one (N × margin). */
  omittedDayEnergy: number; omittedNightEnergy: number;
}

interface Capsule { ax: number; ay: number; bx: number; by: number; r: number }
interface Chunk { minX: number; minY: number; maxX: number; maxY: number; items: Capsule[] }
const CHUNK = 32;
function chunks(capsules: Capsule[]): Chunk[] {
  const out: Chunk[] = [];
  for (let k = 0; k < capsules.length; k += CHUNK) {
    const items = capsules.slice(k, k + CHUNK);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of items) {
      // Non-finite geometry/width fails closed: an infinite box overlaps everything.
      const r = Number.isFinite(c.r) && [c.ax, c.ay, c.bx, c.by].every(Number.isFinite) ? c.r : Infinity;
      minX = Math.min(minX, c.ax - r, c.bx - r); maxX = Math.max(maxX, c.ax + r, c.bx + r);
      minY = Math.min(minY, c.ay - r, c.by - r); maxY = Math.max(maxY, c.ay + r, c.by + r);
    }
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) { minX = minY = -Infinity; maxX = maxY = Infinity; }
    out.push({ minX, minY, maxX, maxY, items });
  }
  return out;
}
function pointSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function segmentSegment(a: Capsule, b: Capsule): number {
  const cross = (ox: number, oy: number, px: number, py: number, qx: number, qy: number) => (px - ox) * (qy - oy) - (py - oy) * (qx - ox);
  const d1 = cross(a.ax, a.ay, a.bx, a.by, b.ax, b.ay), d2 = cross(a.ax, a.ay, a.bx, a.by, b.bx, b.by);
  const d3 = cross(b.ax, b.ay, b.bx, b.by, a.ax, a.ay), d4 = cross(b.ax, b.ay, b.bx, b.by, a.bx, a.by);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(pointSegment(a.ax, a.ay, b.ax, b.ay, b.bx, b.by), pointSegment(a.bx, a.by, b.ax, b.ay, b.bx, b.by),
    pointSegment(b.ax, b.ay, a.ax, a.ay, a.bx, a.by), pointSegment(b.bx, b.by, a.ax, a.ay, a.bx, a.by));
}
const boxGap = (a: Chunk, b: Chunk) => Math.max(0, a.minX - b.maxX, b.minX - a.maxX, a.minY - b.maxY, b.minY - a.maxY);
function touches(a: Chunk[], b: Chunk[]): boolean {
  for (const p of a) for (const q of b) if (boxGap(p, q) <= 0) for (const s of p.items) for (const t of q.items) {
    const r = s.r + t.r;
    if (!(segmentSegment(s, t) >= r)) return true; // NaN/Infinity fail closed
  }
  return false;
}

/** Land take, works and removed old roads of one evaluated road, each padded by half the clearance. */
function envelope(result: Result, halfWidth: number): Capsule[] {
  const pad = INDEPENDENCE_SCREEN.clearance / 2, out: Capsule[] = [];
  const reach = (i: number) => {
    let r = Math.max(result.cell.width[i], halfWidth);
    for (const v of [result.dayL[i], result.dayR[i]]) if (Number.isFinite(v)) r = Math.max(r, Math.abs(v));
    return r;
  };
  for (let i = 1; i < result.n; i++) out.push({ ax: result.x[i - 1], ay: result.y[i - 1], bx: result.x[i], by: result.y[i],
    r: Math.max(reach(i - 1), reach(i)) + pad });
  if (result.n === 1) out.push({ ax: result.x[0], ay: result.y[0], bx: result.x[0], by: result.y[0], r: reach(0) + pad });
  const line = (points: readonly CrossingPoint[] | undefined, width: number, extra = 0) => {
    if (!points?.length) return;
    // Earthwork toe bound: half width plus a 1:2 side slope over the largest height difference.
    let dz = 0; for (const p of points) dz = Math.max(dz, Math.abs(p.z - p.ground));
    const r = width / 2 + 2 * dz + extra + pad;
    if (points.length === 1) out.push({ ax: points[0].x, ay: points[0].y, bx: points[0].x, by: points[0].y, r });
    for (let k = 1; k < points.length; k++) out.push({ ax: points[k - 1].x, ay: points[k - 1].y, bx: points[k].x, by: points[k].y, r });
  };
  const geometry = (g: CrossingGeometry | undefined) => {
    if (!g) return;
    line(g.road, g.width); line(g.links?.[0], g.width); line(g.links?.[1], g.width);
    line(g.turnarounds, g.width, g.turnaroundRadius ?? 0);
  };
  for (const c of result.crossings) geometry(c.geometry);
  for (const f of result.footprintConflicts) {
    geometry(f.geometry);
    for (const old of [f.original, ...(f.originals ?? [])]) line(old, f.geometry?.width ?? 0);
  }
  return out;
}

/** Roads a route crosses, relocates or closes. A closure relies on a detour over unspecified roads. */
function touchedRoads(result: Result): { roads: Set<number>; closes: boolean } {
  const roads = new Set<number>();
  for (const c of result.crossings) for (const id of [c.roadId, c.targetRoadId]) if (id !== undefined) roads.add(id);
  let closes = false;
  for (const f of result.footprintConflicts) {
    if (f.roadId !== undefined) roads.add(f.roadId);
    if (f.closed) closes = true;
  }
  return { roads, closes };
}

interface NoiseRoute { chunks: Chunk[]; excess: number; reach: number; minX: number; minY: number; maxX: number; maxY: number;
  receivers: Map<number, { removed: boolean; level: number }> }
const noiseLine = (result: Result) => chunks(Array.from({ length: Math.max(0, result.n - 1) }, (_, k) =>
  ({ ax: result.x[k], ay: result.y[k], bx: result.x[k + 1], by: result.y[k + 1], r: 0 })));
function lineDistance(route: NoiseRoute, x: number, y: number, cap: number): number {
  let best = cap;
  for (const c of route.chunks) {
    if (Math.max(0, c.minX - x, x - c.maxX, c.minY - y, y - c.maxY) >= best) continue;
    for (const s of c.items) best = Math.min(best, pointSegment(x, y, s.ax, s.ay, s.bx, s.by));
  }
  return best;
}
/** Hard ground is the least loss at every height in the legacy model; walls/cuts only reduce it. */
function excessBound(route: NoiseRoute, distance: number): number {
  return route.excess - hardGroundLoss(Math.max(0, distance - NOISE.facadeOffset - NOISE.sourceOffset)) + INDEPENDENCE_SCREEN.noiseTolerance;
}
function noiseRoute(route: ScreenRoute): NoiseRoute {
  const excess = noiseSource(route.aadt, route.speed, { heavyShare: route.heavyShare }).excessDb;
  const target = -INDEPENDENCE_SCREEN.noiseMargin;
  const r: NoiseRoute = { chunks: route.result.n > 1 ? noiseLine(route.result) : [], excess, reach: 0, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,
    receivers: new Map() };
  if (Number.isFinite(excess) && excessBound(r, 0) > target) {
    let low = 0, high = 1000;
    while (excessBound(r, high) > target) { high *= 2; if (high > 1e7) { high = Infinity; break; } }
    if (Number.isFinite(high)) for (let k = 0; k < 50; k++) { const mid = (low + high) / 2; if (excessBound(r, mid) > target) low = mid; else high = mid; }
    r.reach = high;
  } else if (!Number.isFinite(excess) && excess > 0) r.reach = Infinity;
  for (let i = 0; i < route.result.n; i++) {
    r.minX = Math.min(r.minX, route.result.x[i]); r.maxX = Math.max(r.maxX, route.result.x[i]);
    r.minY = Math.min(r.minY, route.result.y[i]); r.maxY = Math.max(r.maxY, route.result.y[i]);
  }
  for (const v of route.result.noise.receivers) r.receivers.set(v.j, { removed: v.status === 'bought', level: v.mitigated });
  for (const d of route.result.demolished) r.receivers.set(d.j, { removed: true, level: -Infinity });
  return r;
}

export function screenIndependence(routes: readonly ScreenRoute[], buildings: BuildingIndex | undefined): IndependenceScreen {
  const interactions: RouteInteraction[] = [];
  const S = INDEPENDENCE_SCREEN;
  const omitted = (db: number) => routes.length * 10 ** ((db - S.noiseMargin) / 10);
  const out = () => ({ independent: interactions.length === 0, interactions,
    omittedDayEnergy: omitted(NOISE.limitDayDb), omittedNightEnergy: omitted(NOISE.limitNightDb) });
  if (routes.length > S.maxRoutes) { interactions.push({ routeIds: routes.map(r => r.routeId), reason: 'too-many-roads' }); return out(); }
  // Land, works and removed old roads.
  const envelopes = routes.map(r => chunks(envelope(r.result, r.halfWidth)));
  for (let a = 0; a < routes.length; a++) for (let b = a + 1; b < routes.length; b++)
    if (touches(envelopes[a], envelopes[b])) interactions.push({ routeIds: [routes[a].routeId, routes[b].routeId], reason: 'shared-land' });
  // Existing roads: two roads changing one way, or a closure relying on a detour while another road changes any road.
  const touched = routes.map(r => touchedRoads(r.result));
  for (let a = 0; a < routes.length; a++) for (let b = a + 1; b < routes.length; b++) {
    const ta = touched[a], tb = touched[b];
    if ([...ta.roads].some(id => tb.roads.has(id)) || (ta.closes && tb.roads.size) || (tb.closes && ta.roads.size))
      interactions.push({ routeIds: [routes[a].routeId, routes[b].routeId], reason: 'shared-road' });
  }
  // Buildings demolished, bought or kept-in-the-way by more than one road.
  const users = new Map<number, Set<number>>();
  routes.forEach((r, k) => {
    for (const j of [...r.result.demolished.map(d => d.j), ...r.result.boughtOut.map(d => d.j), ...r.result.kept.filter(d => d.hit).map(d => d.j)]) {
      let set = users.get(j); if (!set) users.set(j, set = new Set()); set.add(k);
    }
  });
  for (const [j, set] of users) if (set.size > 1) {
    const ids = [...set].map(k => routes[k].routeId);
    interactions.push({ routeIds: ids, reason: 'shared-building', buildingIndex: j });
  }
  if (!buildings || routes.length < 2) return out();
  // Noise: a house may belong to at most one road (in its own noise list, or above limit − margin).
  const noise = routes.map(noiseRoute);
  for (let j = 0; j < buildings.n; j++) {
    if (!buildings.dwelling[j]) continue;
    const [x, y] = buildings.items[j], radius = buildings.extent(j);
    const contributors: number[] = [];
    let removed = false;
    for (let k = 0; k < noise.length; k++) {
      const n = noise[k], known = n.receivers.get(j), reach = n.reach + radius;
      if (known?.removed) { removed = true; contributors.push(k); continue; }
      let level = -S.noiseMargin; // bound beyond the screening reach
      if (x >= n.minX - reach && x <= n.maxX + reach && y >= n.minY - reach && y <= n.maxY + reach) {
        const d = n.chunks.length ? lineDistance(n, x, y, reach) : Math.hypot(x - n.minX, y - n.minY);
        if (d < reach) level = excessBound(n, Math.max(0, d - radius));
      }
      // The road's own evaluated level at this house (all floors/stations, its walls) when it has one.
      if (known) level = known.level;
      if (Number.isNaN(level)) level = Infinity; // fail closed
      // Any house in a road's own noise list (it could reach the limit there) is that road's house,
      // even when its walls made it quiet: two such roads share it.
      if (known || level > -S.noiseMargin) contributors.push(k);
    }
    if (contributors.length > 1) {
      interactions.push({ routeIds: contributors.map(k => routes[k].routeId), reason: removed ? 'shared-building' : 'shared-noise', buildingIndex: j });
      continue;
    }
    // One road per house. Others, each ≥ margin below the limit there, are neglected (10 dB rule): at a
    // house exactly at the limit they add at most 10·log10(1 + (N−1)/10) dB, reported as omittedEnergy.
  }
  return out();
}
