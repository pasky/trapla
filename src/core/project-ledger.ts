// Conservative non-interaction screen. Several roads, each evaluated ALONE against the unchanged
// existing network, may be priced together only when nothing one road builds, buys, closes or makes
// loud can change another road's own outcome. Any doubt leaves the project unpriced; this screen never
// resolves an interaction. Joint engineering/acquisition/noise decisions are a later stage.
import type { BuildingIndex } from './buildings';
import type { CrossingGeometry, CrossingPoint } from './crossings';
import { NOISE } from './data/urban';
import type { Result } from './evaluate';
import type { RouteId, TransportSurface } from './project';
import { hardGroundLoss, noiseSource } from './road-noise';
import * as dm from './detmath';
import { KIND } from './structures';

/** PROVISIONAL screening constants: game rules, not norms. Larger values only leave MORE projects
 * unpriced; none of them can make an interacting project priced. */
export const INDEPENDENCE_SCREEN = {
  /** Plan gap kept between two roads' land take and works (working strip, drainage), m. */
  clearance: 10,
  /** Outside its own noise list, a road this far below the limit at a house (controlling period) is
   * not counted as a road of that house. The screen uses noiseMargin + 10·log10(N − 1) dB for N roads,
   * so all neglected roads together add ≤ 1 % of one limit (≤ +0.043 dB) at a house exactly at the
   * limit: below reported precision, never a quiet fake VALID. Nearer roads stay unpriced until joint
   * noise/wall decisions exist. PROVISIONAL screening choice, not a Czech norm; the bound is published. */
  noiseMargin: 20,
  /** Exceeds the legacy loss table's linear-interpolation shortfall against the exact hard-ground law, dB. */
  noiseTolerance: 0.05,
  /** Bounds screening work; more roads stay unpriced. */
  maxRoutes: 10,
} as const;

export interface ScreenRoute { routeId: RouteId; result: Result; aadt: number; speed: number; heavyShare: number;
  /** Source profile (motorway lane tables); default class I road. */ profile?: 'class-I' | 'motorway';
  /** Built half-width at least (crown), also where a bridge/tunnel takes no land. */ halfWidth: number;
  /** Works beyond its own result (side-road links), each a centreline with half-width. */
  extraLines?: { ax: number; ay: number; bx: number; by: number; r: number }[];
  /** Junctions with another designed road: within r of (x, y) the two roads' works ARE the junction
   * (owned by this road), not shared land. */
  junctions?: { routeId: RouteId; x: number; y: number; r: number }[] }
export type InteractionReason = 'too-many-roads' | 'shared-land' | 'shared-building' | 'shared-noise' | 'shared-road';
export interface RouteInteraction { routeIds: RouteId[]; reason: InteractionReason; buildingIndex?: number;
  /** shared land: where the two roads' land and works come closest, and how many metres further apart
   * they would have to be there (overlap plus the clearance) */
  at?: { x: number; y: number }; need?: number }
export interface IndependenceScreen {
  independent: boolean; interactions: RouteInteraction[];
  /** Upper bound on neglected linear energy at a house from roads other than its own one. */
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
/** Do two roads' envelopes touch? Where they are deepest into each other (on the narrower piece, i.e. the
 * smaller road), and by how much; null: they keep the clearance everywhere. */
function touches(a: Chunk[], b: Chunk[]): { at?: { x: number; y: number }; need?: number } | null {
  let found = false, worst = -Infinity, at: { x: number; y: number } | undefined;
  for (const p of a) for (const q of b) if (boxGap(p, q) <= 0) for (const s of p.items) for (const t of q.items) {
    const r = s.r + t.r, d = segmentSegment(s, t);
    if (d >= r) continue; // NaN/Infinity fail closed
    found = true;
    const need = r - d, narrow = s.r <= t.r ? s : t;
    if (Number.isFinite(need) && need > worst) { worst = need; at = { x: (narrow.ax + narrow.bx) / 2, y: (narrow.ay + narrow.by) / 2 }; }
  }
  return found ? (at ? { at, need: worst } : {}) : null;
}

/** Land take, works and removed old roads of one evaluated road, each padded by half the clearance. */
function envelope(result: Result, halfWidth: number): Capsule[] {
  const pad = INDEPENDENCE_SCREEN.clearance / 2, out: Capsule[] = [];
  // How far the road's land reaches from its centreline. On earthworks: to the further slope edge (the
  // land take there is exactly dayL + dayR wide, which is cell.width). On a bridge or in a tunnel the slope
  // edges are those of earthworks that are not built: the deck's whole width is taken as the reach instead
  // (too much rather than too little; 0 in a tunnel). Never less than half the crown; unknown fails closed.
  const reach = (i: number) => {
    const l = Math.abs(result.dayL[i]), r = Math.abs(result.dayR[i]);
    if (result.kind[i] !== KIND.earth) return Math.max(halfWidth, result.cell.width[i]);
    return Number.isFinite(l) && Number.isFinite(r) ? Math.max(halfWidth, l, r) : Infinity;
  };
  // (where a rebuilt stretch keeps its old road nothing is built: no land, no works; project-kept.ts)
  const kept = result.keptCells;
  for (let i = 1; i < result.n; i++) if (!(kept?.[i - 1] && kept[i])) out.push({ ax: result.x[i - 1], ay: result.y[i - 1], bx: result.x[i], by: result.y[i],
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
  // a designed road under/over our crossing is its own road (its own envelope), not ours
  for (const c of result.crossings) if (!c.designed) geometry(c.geometry);
  for (const f of result.footprintConflicts) {
    geometry(f.geometry);
    for (const old of [f.original, ...(f.originals ?? [])]) line(old, f.geometry?.width ?? 0);
  }
  return out;
}

/** Roads a route crosses, relocates or closes. A closure relies on a detour over unspecified roads. */
function touchedRoads(result: Result): { roads: Map<number, { x: number; y: number }[]>; closes: boolean } {
  const roads = new Map<number, { x: number; y: number }[]>();
  const add = (id: number | undefined, x: number, y: number) => { if (id === undefined) return; const list = roads.get(id); if (list) list.push({ x, y }); else roads.set(id, [{ x, y }]); };
  for (const c of result.crossings) { add(c.roadId, c.x, c.y); if (c.targetRoadId !== undefined) add(c.targetRoadId, c.x, c.y); }
  let closes = false;
  for (const f of result.footprintConflicts) {
    // (a rebuilt stretch going on into its own old road changes nothing there)
    if (!f.continuation) add(f.roadId, f.x, f.y);
    for (const interval of f.sourceIntervals ?? []) add(interval.way, f.x, f.y); // every removed old way
    if (f.closed) closes = true;
  }
  return { roads, closes };
}

interface NoiseRoute { chunks: Chunk[]; excess: number; reach: number; minX: number; minY: number; maxX: number; maxY: number;
  receivers: Map<number, { removed: boolean; level: number }> }
// (a part kept as the old road is the existing road with its existing traffic, not a new source)
const noiseLine = (result: Result) => chunks(Array.from({ length: Math.max(0, result.n - 1) }, (_, k) => k)
  .filter(k => !(result.keptCells?.[k] && result.keptCells[k + 1]))
  .map(k => ({ ax: result.x[k], ay: result.y[k], bx: result.x[k + 1], by: result.y[k + 1], r: 0 })));
/** Is any part of the road line closer than `reach`? Early exit: the decision, not the distance. */
function withinReach(route: NoiseRoute, x: number, y: number, reach: number): boolean {
  if (!(reach > 0)) return false;
  for (const c of route.chunks) {
    if (Math.max(0, c.minX - x, x - c.maxX, c.minY - y, y - c.maxY) >= reach) continue;
    for (const s of c.items) if (pointSegment(x, y, s.ax, s.ay, s.bx, s.by) < reach) return true;
  }
  return false;
}
/** Largest non-decreasing lower envelope of the hard-ground law, which jumps DOWN by 0.137 dB at 8 m
 * (near-distance expression → Uo fit): a bound at a shorter slant then holds at every longer one. */
const monotoneLoss = (slant: number) => slant < 8 ? Math.min(hardGroundLoss(slant), hardGroundLoss(8)) : hardGroundLoss(slant);
/** Hard ground is the least loss at every height in the legacy model; walls/cuts only reduce it. */
function excessBound(route: NoiseRoute, distance: number): number {
  return route.excess - monotoneLoss(Math.max(0, distance - NOISE.facadeOffset - NOISE.sourceOffset)) + INDEPENDENCE_SCREEN.noiseTolerance;
}
function noiseRoute(route: ScreenRoute, margin: number): NoiseRoute {
  const excess = noiseSource(route.aadt, route.speed, { heavyShare: route.heavyShare, ...(route.profile ? { profile: route.profile } : {}) }).excessDb;
  const target = -margin;
  const r: NoiseRoute = { chunks: route.result.n > 1 ? noiseLine(route.result) : [], excess, reach: 0, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,
    receivers: new Map() };
  if (Number.isFinite(excess) && excessBound(r, 0) > target) {
    let low = 0, high = 1000;
    while (excessBound(r, high) > target) { high *= 2; if (high > 1e7) { high = Infinity; break; } }
    if (Number.isFinite(high)) for (let k = 0; k < 50; k++) { const mid = (low + high) / 2; if (excessBound(r, mid) > target) low = mid; else high = mid; }
    r.reach = high;
  } else if (!Number.isFinite(excess) && excess > 0) r.reach = Infinity;
  if (Number.isNaN(excess)) r.reach = NaN; // unknown source: counts at every house
  const kept = route.result.keptCells;
  for (let i = 0; i < route.result.n; i++) {
    // (a cell with kept cells on both sides is no source: an all-kept stretch reaches no house)
    if (kept?.[i] && kept[Math.max(0, i - 1)] && kept[Math.min(route.result.n - 1, i + 1)]) continue;
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
  const margin = S.noiseMargin + 10 * dm.log10(Math.max(1, routes.length - 1));
  // Neglected roads at a house each stay ≥ margin below its limits: ≤ 1 % beside its own road, and
  // ≤ N/(N − 1) % at a house no road owns (where nothing is near the limit anyway).
  const omitted = (db: number) => routes.length * dm.pow(10, (db - margin) / 10);
  const out = () => ({ independent: interactions.length === 0, interactions,
    omittedDayEnergy: omitted(NOISE.limitDayDb), omittedNightEnergy: omitted(NOISE.limitNightDb) });
  if (routes.length > S.maxRoutes) { interactions.push({ routeIds: routes.map(r => r.routeId), reason: 'too-many-roads' }); return out(); }
  // Land, works and removed old roads.
  const raw = routes.map(r => [...envelope(r.result, r.halfWidth),
    ...(r.extraLines ?? []).map(l => ({ ...l, r: l.r + INDEPENDENCE_SCREEN.clearance / 2 }))]);
  const envelopes = raw.map(chunks);
  for (let a = 0; a < routes.length; a++) for (let b = a + 1; b < routes.length; b++) {
    // a junction between the two: both roads' works around it are that one junction
    const at = [...(routes[a].junctions ?? []).filter(j => j.routeId === routes[b].routeId), ...(routes[b].junctions ?? []).filter(j => j.routeId === routes[a].routeId)];
    const away = (list: Capsule[]) => chunks(list.filter(c => !at.some(j => pointSegment(j.x, j.y, c.ax, c.ay, c.bx, c.by) < j.r)));
    const [ea, eb] = at.length ? [away(raw[a]), away(raw[b])] : [envelopes[a], envelopes[b]];
    const touch = touches(ea, eb);
    if (touch) interactions.push({ routeIds: [routes[a].routeId, routes[b].routeId], reason: 'shared-land', ...touch });
  }
  // Existing roads: two roads changing one way, or a closure relying on a detour while another road changes any road.
  const touched = routes.map(r => touchedRoads(r.result));
  for (let a = 0; a < routes.length; a++) for (let b = a + 1; b < routes.length; b++) {
    const ta = touched[a], tb = touched[b];
    // where: the first road's change of the shared road nearest to the second's
    let at: { x: number; y: number } | undefined, best = Infinity;
    for (const [id, here] of ta.roads) for (const p of here) for (const q of tb.roads.get(id) ?? []) {
      const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < best) { best = d; at = p; }
    }
    if (at || (ta.closes && tb.roads.size) || (tb.closes && ta.roads.size))
      interactions.push({ routeIds: [routes[a].routeId, routes[b].routeId], reason: 'shared-road', ...(at ? { at } : {}) });
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
  const noise = routes.map(r => noiseRoute(r, margin));
  for (let j = 0; j < buildings.n; j++) {
    if (!buildings.dwelling[j]) continue;
    const [x, y] = buildings.items[j], radius = buildings.extent(j);
    // a house a road takes (demolished, bought out) is gone: no other road's noise reaches anyone there
    // (two roads taking it are reported above)
    if (noise.some(n => n.receivers.get(j)?.removed)) continue;
    const contributors: number[] = [];
    for (let k = 0; k < noise.length; k++) {
      const n = noise[k], known = n.receivers.get(j), reach = n.reach + radius;
      // A house in a road's own noise list (it could reach the limit there) is that road's house, even
      // when its walls made it quiet. Otherwise the road counts where its all-height bound exceeds
      // limit − margin, i.e. within its reach (bound is monotone in distance). NaN reach fails closed.
      const inReach = Number.isNaN(n.reach) || (x >= n.minX - reach && x <= n.maxX + reach && y >= n.minY - reach && y <= n.maxY + reach
        && (n.chunks.length ? withinReach(n, x, y, reach) : Math.hypot(x - n.minX, y - n.minY) < reach));
      if (known || inReach) contributors.push(k);
    }
    if (contributors.length > 1) {
      interactions.push({ routeIds: contributors.map(k => routes[k].routeId), reason: 'shared-noise', buildingIndex: j });
      continue;
    }
    // One road per house. The others, each ≥ margin below the limit there, add ≤ 1 % of one limit
    // (≤ +0.043 dB at a house exactly at the limit), published as omittedEnergy.
  }
  return out();
}

/** Where two designed roads' centrelines cross, or their carriageways overlap without crossing. Plan
 * geometry only: whether the crossing could be built (bridge, junction, clearance) is NOT checked here. */
export interface RouteContact {
  kind: 'crossing' | 'overlap'; routeIds: [RouteId, RouteId];
  /** Station on each road: a point for a crossing, the overlapping range for an overlap. */
  stations: [{ s0: number; s1: number }, { s0: number; s1: number }];
  at: { x: number; y: number };
}
interface Piece extends Capsule { i: number; s0: number; s1: number }
function pieces(surface: TransportSurface): { chunks: (Chunk & { items: Piece[] })[] } {
  const out: Piece[] = [], p = surface.points;
  for (let i = 1; i < p.length; i++) out.push({ ax: p[i - 1].x, ay: p[i - 1].y, bx: p[i].x, by: p[i].y,
    r: Math.max(p[i - 1].halfWidth, p[i].halfWidth), i, s0: p[i - 1].s, s1: p[i].s });
  return { chunks: chunks(out) as (Chunk & { items: Piece[] })[] };
}
export function routeContacts(surfaces: readonly TransportSurface[], sameGroup: (a: RouteId, b: RouteId) => boolean = () => false): RouteContact[] {
  const all = surfaces.map(pieces), contacts: RouteContact[] = [];
  for (let a = 0; a < surfaces.length; a++) for (let b = a + 1; b < surfaces.length; b++) {
    const A = surfaces[a].routeId, B = surfaces[b].routeId;
    if (sameGroup(A, B)) continue;
    const crossings: RouteContact[] = [], crossingSegments = new Set<number>(), near: [Piece, Piece][] = [];
    for (const p of all[a].chunks) for (const q of all[b].chunks) if (boxGap(p, q) <= 0) for (const u of p.items) for (const v of q.items) {
      const dx = u.bx - u.ax, dy = u.by - u.ay, ex = v.bx - v.ax, ey = v.by - v.ay, den = dx * ey - dy * ex;
      if (Math.abs(den) > 1e-12) {
        const wx = v.ax - u.ax, wy = v.ay - u.ay, t = (wx * ey - wy * ex) / den, w = (wx * dy - wy * dx) / den;
        if (t >= 0 && t <= 1 && w >= 0 && w <= 1) {
          const at = { x: u.ax + t * dx, y: u.ay + t * dy };
          crossingSegments.add(u.i);
          // A crossing exactly at a shared vertex is found by both neighbouring segments: keep one.
          if (!crossings.some(c => Math.hypot(c.at.x - at.x, c.at.y - at.y) < 1e-6)) crossings.push({ kind: 'crossing', routeIds: [A, B], at,
            stations: [{ s0: u.s0 + t * (u.s1 - u.s0), s1: u.s0 + t * (u.s1 - u.s0) }, { s0: v.s0 + w * (v.s1 - v.s0), s1: v.s0 + w * (v.s1 - v.s0) }] });
          continue;
        }
      }
      if (!(segmentSegment(u, v) >= u.r + v.r)) near.push([u, v]); // NaN fails closed
    }
    contacts.push(...crossings);
    // Overlap runs along road A; a run around a reported crossing is that crossing, not a second finding.
    near.sort((x, y) => x[0].i - y[0].i);
    for (let k = 0; k < near.length;) {
      let end = k;
      while (end + 1 < near.length && near[end + 1][0].i - near[end][0].i <= 1) end++;
      const run = near.slice(k, end + 1); k = end + 1;
      if (run.some(([u]) => crossingSegments.has(u.i))) continue;
      const first = run[0][0];
      contacts.push({ kind: 'overlap', routeIds: [A, B], at: { x: (first.ax + first.bx) / 2, y: (first.ay + first.by) / 2 },
        stations: [{ s0: Math.min(...run.map(([u]) => u.s0)), s1: Math.max(...run.map(([u]) => u.s1)) },
          { s0: Math.min(...run.map(([, v]) => v.s0)), s1: Math.max(...run.map(([, v]) => v.s1)) }] });
    }
  }
  return contacts;
}
