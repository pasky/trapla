// Turning any mapped road into an editable project road, and building a new one. Pure helpers: the
// caller dispatches the returned commands as one undoable step.
import { buildAlignment, station, type PI, type Vec2 } from '../core/horizontal';
import { horizontalViolations } from '../core/checks';
import { horizontalRules } from '../core/data/norms';
import type { CategoryId } from '../core/data/categories';
import { KEPT_TOLERANCE } from '../core/project-kept';
import type { Anchor, EndpointConstraint, ProjectDesign, RoadSpec, RouteDesign, SourceInterval, XYZ } from '../core/project';
import type { ProjectCommand } from '../project-store-contract';
import type { ProjectTransportIndex } from '../core/project-network';
import { groundRoadSourceInfo, promoteGroundRoad } from '../core/project-promotion';
import { ROAD_CLASSES } from '../core/data/urban';
import { classTraffic, type TrafficDefault } from '../core/traffic-census';
import { freeSpan } from './source-editor';

/** A grab this close to a junction does not stop there (no 20 m stubs): it extends to the next one, m. */
export const STRETCH_PAST_JUNCTION = 150;
/** A rebuilt stretch stops this far short of a level crossing or a joining bridge/tunnel, m. */
const KEEP_CLEAR = 5;
/** Shorter rebuilt stretches are refused: too short to carry a bend, m. */
export const MIN_STRETCH = 60;
/** The old line is drawn as bends where it strays more than this from a straight chord, m. A display/edit
 * choice, not a design rule: the card states how far the new line is from the old road. */
export const FIT_TOLERANCE = 8;
/** Bends closer than this along the old road are merged: room for two curves at 70 km/h, m. */
export const MIN_BEND_GAP = 80;
/** First design speed of a rebuilt or new road, km/h: the lowest ČSN 73 6101:2018 allows for S 7.5 / S 9.5
 * (nominal 90, lowered by up to 20 where justified; research/00 §4.1). An existing corridor is that
 * justification; the player can raise it. The map's `maxspeed` is the signed limit, not a design speed. */
export const DEFAULT_SPEED = 70;
/** PROVISIONAL game tolerance, m: how far the automatic conversion may move the line off the old road so
 * that its bends meet the norm: as far as still counts as "on the old road" (core/project-kept.ts), so the
 * conversion itself never builds anything anew. Beyond it the bend stays as the old road has it. */
export const REPAIR_TOLERANCE = KEPT_TOLERANCE;

export type Rebuildable = { ok: true; info: ReturnType<typeof groundRoadSourceInfo>; spec: Pick<RoadSpec, 'legalClass' | 'crossSection'> }
  | { ok: false; why: string };
/** Which mapped roads the game can rebuild today, and as what. */
export function rebuildable(base: ProjectTransportIndex, sourceId: string): Rebuildable {
  const source = base.source(sourceId);
  if (!source || source.kind !== 'road') return { ok: false, why: 'Railways cannot be changed yet.' };
  const row = ROAD_CLASSES[source.tags.highway ?? ''];
  if (row?.noAtGrade) return { ok: false, why: 'Motorways and expressways cannot be changed yet.' };
  if (source.bridge || source.tunnel || source.elevation !== 'terrain') return { ok: false, why: 'Bridges and tunnels of existing roads cannot be changed yet.' };
  let info: ReturnType<typeof groundRoadSourceInfo>;
  try { info = groundRoadSourceInfo(base, sourceId); } catch { return { ok: false, why: 'This road’s map data is incomplete.' }; }
  if (info.legalClass === 'I') return { ok: true, info, spec: { legalClass: 'I', crossSection: 'S9.5' } };
  if (info.legalClass === 'II' || info.legalClass === 'III') return { ok: true, info, spec: { legalClass: info.legalClass, crossSection: 'S7.5' } };
  return { ok: false, why: 'Local roads, service roads and tracks cannot be rebuilt yet: the game has no design rules for them.' };
}

/** The stretch a drag at station s rebuilds: to the nearest junction on either side (passing those
 * closer than STRETCH_PAST_JUNCTION), never into a stretch another project road already rebuilds. */
export function derivedStretch(base: ProjectTransportIndex, sourceId: string, s: number, claimed: readonly SourceInterval[]): SourceInterval | null {
  const source = base.source(sourceId); if (!source) return null;
  const length = source.stations[source.stations.length - 1];
  const span = freeSpan(claimed, base.transportData, sourceId, s, length); if (!span) return null;
  const branches = base.branches({ transportData: base.transportData, sourceId, s0: 0, s1: length });
  const junctions = branches.map(b => b.s);
  let lo = Math.max(span.lo, ...junctions.filter(j => j <= s - STRETCH_PAST_JUNCTION));
  let hi = Math.min(span.hi, ...junctions.filter(j => j >= s + STRETCH_PAST_JUNCTION));
  // A level crossing, or a bridge/tunnel joining, cannot be rebuilt yet: the stretch stops short of it.
  // (a level crossing: another kind of line; a branch of the same kind is an ordinary junction or switch)
  for (const b of branches) if (b.other.some(o => { const q = base.source(o.sourceId); return !q || q.kind !== source.kind || q.elevation !== 'terrain'; })) {
    if (Math.abs(b.s - s) <= KEEP_CLEAR) return null;
    if (b.s < s) lo = Math.max(lo, b.s + KEEP_CLEAR); else hi = Math.min(hi, b.s - KEEP_CLEAR);
  }
  // Only where the map has ground under it (a road leaving the map is cut at its last known point).
  if (!base.position(sourceId, s)) return null;
  for (const node of source.stations) if (!base.position(sourceId, node)) {
    if (node < s) lo = Math.max(lo, Math.min(s, ...source.stations.filter(t => t > node && t <= s)));
    else hi = Math.min(hi, Math.max(s, ...source.stations.filter(t => t < node && t >= s)));
  }
  return hi - lo >= MIN_STRETCH ? { transportData: base.transportData, sourceId, s0: lo, s1: hi } : null;
}

/** Douglas–Peucker bends of a polyline (interior points only), then bends too close together merged. */
export function fitBends(path: readonly { x: number; y: number; s: number }[], tolerance = FIT_TOLERANCE, gap = MIN_BEND_GAP): PI[] {
  const keep = new Uint8Array(path.length); keep[0] = keep[path.length - 1] = 1;
  const stack: [number, number][] = [[0, path.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const a = path[i], b = path[j], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    let worst = -1, far = 0;
    for (let k = i + 1; k < j; k++) {
      const d = Math.abs((path[k].x - a.x) * dy - (path[k].y - a.y) * dx) / len;
      if (d > far) { far = d; worst = k; }
    }
    if (worst > 0 && far > tolerance) { keep[worst] = 1; stack.push([i, worst], [worst, j]); }
  }
  const kept = path.filter((_, k) => keep[k]);
  // Merge clusters: a group of close bends becomes the intersection of its outer legs (one PI).
  const out: PI[] = [];
  let k = 1;
  while (k < kept.length - 1) {
    let m = k;
    while (m + 1 < kept.length - 1 && kept[m + 1].s - kept[m].s < gap) m++;
    if (m === k) out.push({ x: kept[k].x, y: kept[k].y, r: null });
    else {
      const p = kept[k - 1], q = kept[k], u = kept[m], v = kept[m + 1];
      const hit = intersect(p, q, u, v);
      const far = hit && [p, v].every(e => Math.hypot(hit.x - e.x, hit.y - e.y) < 4 * (v.s - p.s));
      out.push(far ? { ...hit!, r: null } : { x: kept[Math.round((k + m) / 2)].x, y: kept[Math.round((k + m) / 2)].y, r: null });
    }
    k = m + 1;
  }
  return out;
}
/** The old line as bends, ready to be edited: `fitBends`, then
 * 1. a bend whose norm-sized curve would leave the old road by more than REPAIR_TOLERANCE (a sharp old
 *    corner) keeps the old road's own, tighter curve: the largest radius that stays within FIT_TOLERANCE;
 * 2. a bounded validity-first repair: each round removes one bend involved in a problem, or slides it along
 *    one of its legs, taking the change that leaves the fewest problems and then strays least, never
 *    further than REPAIR_TOLERANCE from the old road.
 * What still misses the norm lies on the old road and is kept as it is (core/project-kept.ts): the
 * conversion itself builds nothing anew. */
export function fitRoad(a: Vec2, b: Vec2, path: readonly { x: number; y: number; s: number }[], speed: number, category: CategoryId): PI[] {
  const rules = horizontalRules(speed, category), far = distanceTo(path);
  const measure = (pis: PI[]) => {
    const al = buildAlignment(a, b, pis, rules), st = station(al, 5);
    const off = new Float64Array(st.n); let stray = 0;
    for (let k = 0; k < st.n; k++) stray = Math.max(stray, off[k] = far(st.x[k], st.y[k]));
    /** how far bend i's curve leaves the old road */
    const bend = (i: number) => {
      const c = al.curves[i]; let worst = 0;
      if (c) for (let k = Math.max(0, Math.floor((c.sStart - 5) / 5)); k < st.n && st.s[k] <= c.sEnd + 5; k++) worst = Math.max(worst, off[k]);
      return worst;
    };
    // (without the design: no fix suggestions are worked out, only what is wrong and at which bends)
    return { problems: horizontalViolations(al, speed), stray, bend, radius: (i: number) => al.curves[i]?.r ?? 0 };
  };
  let pis = fitBends(path), now = measure(pis);
  for (let i = 0; i < pis.length; i++) {
    if (now.bend(i) <= REPAIR_TOLERANCE) continue;
    let low = 10, high = now.radius(i);
    if (!(high > low)) continue;
    const at = (r: number) => pis.map((p, k) => k === i ? { ...p, r } : p);
    for (let k = 0; k < 6; k++) { const mid = (low + high) / 2; if (measure(at(mid)).bend(i) <= FIT_TOLERANCE) low = mid; else high = mid; }
    pis = at(Math.round(low)); now = measure(pis);
  }
  // bounded: the bends of the first problem only, eight rounds
  for (let round = 0; round < 8 && now.problems.length; round++) {
    let best: { pis: PI[]; m: ReturnType<typeof measure> } | null = null;
    const limit = Math.max(REPAIR_TOLERANCE, now.stray), first = now.problems.find(v => v.pis?.length || v.pi !== undefined);
    for (const i of first?.pis ?? (first?.pi !== undefined ? [first.pi] : [])) {
      if (!pis[i]) continue;
      const candidates: PI[][] = [pis.filter((_, k) => k !== i)];
      for (const toward of [pis[i - 1] ?? a, pis[i + 1] ?? b]) {
        const d = Math.hypot(toward.x - pis[i].x, toward.y - pis[i].y);
        for (const step of [20, 40, 70, 110]) if (step < 0.6 * d)
          candidates.push(pis.map((p, k) => k === i ? { ...p, x: p.x + (toward.x - p.x) * step / d, y: p.y + (toward.y - p.y) * step / d } : p));
      }
      for (const c of candidates) {
        const m = measure(c);
        if (m.stray > limit || m.problems.length >= now.problems.length) continue;
        if (!best || m.problems.length < best.m.problems.length || (m.problems.length === best.m.problems.length && m.stray < best.m.stray)) best = { pis: c, m };
      }
    }
    if (!best) break;
    pis = best.pis; now = best.m;
  }
  return pis;
}
/** Distance from a point to a polyline, through a 100 m grid of its segments (a whole-line scan only for
 * points further than 100 m from it). */
function distanceTo(path: readonly { x: number; y: number }[]): (x: number, y: number) => number {
  const CELL = 100, grid = new Map<string, number[]>();
  for (let k = 1; k < path.length; k++) {
    const p = path[k - 1], q = path[k];
    for (let cx = Math.floor(Math.min(p.x, q.x) / CELL) - 1; cx <= Math.floor(Math.max(p.x, q.x) / CELL) + 1; cx++)
      for (let cy = Math.floor(Math.min(p.y, q.y) / CELL) - 1; cy <= Math.floor(Math.max(p.y, q.y) / CELL) + 1; cy++) {
        const key = `${cx}:${cy}`, list = grid.get(key); if (list) list.push(k); else grid.set(key, [k]);
      }
  }
  const segment = (k: number, x: number, y: number) => {
    const p = path[k - 1], q = path[k], dx = q.x - p.x, dy = q.y - p.y;
    const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (y - p.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - p.x - t * dx, y - p.y - t * dy);
  };
  return (x, y) => {
    let best = Infinity;
    for (const k of grid.get(`${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`) ?? []) best = Math.min(best, segment(k, x, y));
    if (best === Infinity) for (let k = 1; k < path.length; k++) best = Math.min(best, segment(k, x, y));
    return best;
  };
}
function intersect(p: { x: number; y: number }, q: { x: number; y: number }, u: { x: number; y: number }, v: { x: number; y: number }) {
  const d1x = q.x - p.x, d1y = q.y - p.y, d2x = v.x - u.x, d2y = v.y - u.y, den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((u.x - p.x) * d2y - (u.y - p.y) * d2x) / den;
  return { x: p.x + t * d1x, y: p.y + t * d1y };
}

/** Greatest distance of a polyline's points from another polyline, m (how far a new line strays). */
export function strayDistance(line: readonly { x: number; y: number }[], from: readonly { x: number; y: number }[]): number {
  let worst = 0;
  for (const p of line) {
    let best = Infinity;
    for (let i = 1; i < from.length; i++) {
      const a = from[i - 1], b = from[i], dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
    }
    worst = Math.max(worst, best);
  }
  return worst;
}

/** A road's traffic where the player has not said otherwise: the census count of its stretch or the
 * average of its class (core/traffic-census.ts). Editable in the road's card. */
const startTraffic = (t: TrafficDefault, speed: number): RoadSpec['operations'] => ({ aadt: t.aadt, heavyShare: t.heavyShare, speed, speedPolicy: 'design' });
/** Is this still the traffic the game filled in (so the card can say where the number comes from)? */
export const isTraffic = (op: RoadSpec['operations'], t: TrafficDefault) => op.aadt === t.aadt && Math.abs(op.heavyShare - t.heavyShare) < 1e-9;

/** The rebuilt stretch as an editable road: exact source claim and branch connections (core promotion),
 * its line converted ONCE, explicitly, into bends that follow the old road (the caller tells the player). */
export function rebuildCommand(base: ProjectTransportIndex, interval: SourceInterval, ids: { routeId: string; acousticSourceId: string }): Extract<ProjectCommand, { type: 'promote' }> {
  const what = rebuildable(base, interval.sourceId);
  if (!what.ok) throw new Error(what.why);
  const command = promoteGroundRoad(base, { ...ids, interval, name: what.info.name.charAt(0).toUpperCase() + what.info.name.slice(1),
    specification: { kind: 'road', policy: 'existing-ground', legalClass: what.info.legalClass, crossSection: 'existing',
      existingWidth: what.info.width, designSpeed: DEFAULT_SPEED, operations: startTraffic(base.traffic(interval, what.info.legalClass), DEFAULT_SPEED) } });
  const route = command.routes[0];
  if (route.kind !== 'road' || route.alignment.kind !== 'reference') throw new Error('Unexpected promotion');
  // Noise and travel time use the signed speed where the map has one; the line is designed for DEFAULT_SPEED.
  const operations = startTraffic(base.traffic(interval, what.info.legalClass), DEFAULT_SPEED);
  if (what.info.taggedSpeed !== null && what.info.taggedSpeed !== DEFAULT_SPEED) { operations.speed = what.info.taggedSpeed; operations.speedPolicy = 'independent'; }
  route.specification = { kind: 'road', policy: 'legacy-road', ...what.spec, designSpeed: DEFAULT_SPEED, operations };
  route.alignment = { kind: 'pi', pis: fitRoad(route.endpoints.a.position, route.endpoints.b.position, route.alignment.path, DEFAULT_SPEED, what.spec.crossSection as CategoryId),
    vertical: { kind: 'auto', pins: [] }, controls: { structureOverrides: [] } };
  return command;
}

export interface PlacedEnd { position: XYZ; anchor: Anchor }
/** The class a road built with Build → Road starts as. */
export const NEW_ROAD_CLASS = 'II';
/** A new straight class II road between two placed ends; bent afterwards like any road. Its traffic
 * starts as the average class II road: an estimate the card labels and the player changes. */
export function newRoad(project: ProjectDesign, a: PlacedEnd, b: PlacedEnd, ids: { routeId: string; acousticSourceId: string }): RouteDesign {
  const used = new Set(project.routes.map(r => r.name));
  let name = 'New road';
  for (let n = 2; used.has(name); n++) name = `New road ${n}`;
  const end = (e: PlacedEnd): EndpointConstraint => ({ position: { ...e.position }, anchor: structuredClone(e.anchor), binding: 'resolved' });
  const spec: RoadSpec = { kind: 'road', policy: 'legacy-road', legalClass: NEW_ROAD_CLASS, crossSection: 'S7.5', designSpeed: DEFAULT_SPEED, operations: startTraffic(classTraffic(NEW_ROAD_CLASS), DEFAULT_SPEED) };
  return { id: ids.routeId, acousticSourceId: ids.acousticSourceId, name, revision: 0, role: 'auxiliary', kind: 'road',
    endpoints: { a: end(a), b: end(b) }, specification: spec,
    alignment: { kind: 'pi', pis: [], vertical: { kind: 'auto', pins: [] }, controls: { structureOverrides: [] } } };
}

const nearestStation = (path: readonly { x: number; y: number; s: number }[], p: { x: number; y: number }) => {
  let best = Infinity, at = path[0]?.s ?? 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    if (d < best) { best = d; at = a.s + t * (b.s - a.s); }
  }
  return at;
};

/** The rebuilt road with its ends moved along the old road to [s0, s1] (one undoable edit):
 * a fresh exact claim, end anchors and branch connections (core promotion), its bends kept where
 * they still lie inside, bends of a newly included old stretch added, and its station-based choices
 * (height pins, structures, walls, hand heights) shifted with the start. */
export function moveStretchEnds(base: ProjectTransportIndex, project: ProjectDesign, routeId: string, s0: number, s1: number,
  /** the exact claim, end anchors and branch connections for the new interval (another kind's own promotion,
   * e.g. a railway's); default: the ground-road promotion. Only its endpoints and connections are used. */
  promote?: (interval: SourceInterval, route: RouteDesign) => Extract<ProjectCommand, { type: 'promote' }>): ProjectDesign {
  const route = project.routes.find(r => r.id === routeId);
  const old = route?.source?.intervals[0];
  if (!route || !old || route.alignment.kind !== 'pi' || route.source!.intervals.length !== 1) throw new Error('Not a rebuilt stretch');
  if (!(s1 - s0 >= MIN_STRETCH)) throw new Error('Stretch too short');
  const interval = { ...old, s0, s1 };
  // Promotion re-derives the exact claim, end anchors and branch connections; the rebuilt road keeps its own specification.
  const command = promote ? promote(interval, route) : (() => {
    if (route.kind !== 'road') throw new Error('A non-road stretch needs its own promotion');
    const info = groundRoadSourceInfo(base, old.sourceId);
    return promoteGroundRoad(base, { routeId: route.id, acousticSourceId: route.acousticSourceId, interval, name: route.name,
      specification: { kind: 'road', policy: 'existing-ground', legalClass: info.legalClass, crossSection: 'existing', existingWidth: info.width,
        designSpeed: route.specification.designSpeed, operations: route.specification.operations } });
  })();
  const fresh = command.routes[0];
  if (fresh.id !== route.id) throw new Error('Promotion must keep the route');
  const wide = base.path({ ...old, s0: Math.min(s0, old.s0), s1: Math.max(s1, old.s1) });
  const kept = route.alignment.pis.filter(p => { const s = nearestStation(wide, p); return s > s0 + 1 && s < s1 - 1; });
  const added = (from: number, to: number) => to - from > 1 ? fitBends(base.path({ ...old, s0: from, s1: to })) : [];
  // bends of the newly included old road at either end, then the kept ones, in order along the road
  const head = s0 < old.s0 ? added(s0, old.s0) : [], tail = s1 > old.s1 ? added(old.s1, s1) : [];
  const joinHead = s0 < old.s0 ? [{ ...base.position(old.sourceId, old.s0)!, r: null }] : [];
  const joinTail = s1 > old.s1 ? [{ ...base.position(old.sourceId, old.s1)!, r: null }] : [];
  // A join point (the old end, now inside) is a bend only where the line actually turns there.
  const a = fresh.endpoints.a.position, z = fresh.endpoints.b.position;
  const turns = (prev: { x: number; y: number }, p: { x: number; y: number }, next: { x: number; y: number }) =>
    Math.abs(Math.atan2((p.x - prev.x) * (next.y - p.y) - (p.y - prev.y) * (next.x - p.x), (p.x - prev.x) * (next.x - p.x) + (p.y - prev.y) * (next.y - p.y))) > Math.PI / 180;
  const inner = [...kept];
  const pis0 = [...head, ...joinHead.filter(j => turns(head.at(-1) ?? a, j, inner[0] ?? joinTail[0] ?? tail[0] ?? z)), ...inner];
  const pis = [...pis0, ...joinTail.filter(j => turns(pis0.at(-1) ?? a, j, tail[0] ?? z)), ...tail].map(p => ({ x: p.x, y: p.y, r: p.r }));
  const shift = old.s0 - s0, length = s1 - s0;
  const moveRange = <T extends { s0: number; s1: number }>(list: readonly T[] | undefined) => list?.flatMap(r => {
    const a = Math.max(0, r.s0 + shift), b = Math.min(length, r.s1 + shift); return b > a ? [{ ...r, s0: a, s1: b }] : [];
  });
  const controls = structuredClone(route.alignment.controls);
  if (controls.structureOverrides) controls.structureOverrides = moveRange(controls.structureOverrides)!;
  if (controls.wallOverrides) controls.wallOverrides = moveRange(controls.wallOverrides)!;
  const v = structuredClone(route.alignment.vertical);
  const movePins = (pins: { s: number; z: number }[] | undefined) => pins?.flatMap(p => p.s + shift > 0 && p.s + shift < length ? [{ ...p, s: p.s + shift }] : []);
  if (v.kind === 'auto') { v.pins = movePins(v.pins)!; delete v.manualVpis; }
  // Hand heights cannot follow a moved end exactly: the profile returns to Auto with the pins kept.
  const vertical = v.kind === 'manual' ? { kind: 'auto' as const, pins: movePins(v.autoPins) ?? [] } : v;
  const next = structuredClone(project);
  next.routes = next.routes.map(r => r.id !== routeId ? r : { ...r, endpoints: fresh.endpoints, source: { ...route.source!, intervals: [interval] },
    alignment: { kind: 'pi', pis, vertical, controls } } as RouteDesign);
  // Traffic the game filled in follows the stretch (its middle may now lie in another census section);
  // the player's own number stays.
  const moved = next.routes.find(r => r.id === routeId)!;
  if (moved.kind === 'road' && isTraffic(moved.specification.operations, base.traffic(old, moved.specification.legalClass))) {
    const t = base.traffic(interval, moved.specification.legalClass);
    moved.specification.operations = { ...moved.specification.operations, aadt: t.aadt, heavyShare: t.heavyShare };
  }
  next.connections = [...next.connections.filter(c => !c.ports.some(p => p.kind === 'route' && p.routeId === routeId)), ...command.connections];
  return next;
}
