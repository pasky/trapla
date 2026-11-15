// Turning any mapped road into an editable project road, and building a new one. Pure helpers: the
// caller dispatches the returned commands as one undoable step.
import type { PI } from '../core/horizontal';
import type { Anchor, EndpointConstraint, ProjectDesign, RoadSpec, RouteDesign, SourceInterval, XYZ } from '../core/project';
import type { ProjectCommand } from '../project-store-contract';
import type { ProjectTransportIndex } from '../core/project-network';
import { groundRoadSourceInfo, promoteGroundRoad } from '../core/project-promotion';
import { ROAD_CLASSES } from '../core/data/urban';
import { freeSpan } from './source-editor';

/** A grab this close to a junction does not stop there (no 20 m stubs): it extends to the next one, m. */
export const STRETCH_PAST_JUNCTION = 150;
/** Shorter rebuilt stretches are refused: too short to carry a bend, m. */
export const MIN_STRETCH = 60;
/** The old line is drawn as bends where it strays more than this from a straight chord, m. A display/edit
 * choice, not a design rule: the card states how far the new line is from the old road. */
export const FIT_TOLERANCE = 8;
/** Bends closer than this along the old road are merged: room for two curves at 70 km/h, m. */
export const MIN_BEND_GAP = 80;
/** First design speed of a rebuilt or new road: the lowest the game has rules for (70/80/90). */
export const DEFAULT_SPEED = 70;

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
  const junctions = base.branches({ transportData: base.transportData, sourceId, s0: 0, s1: length }).map(b => b.s);
  let lo = Math.max(span.lo, ...junctions.filter(j => j <= s - STRETCH_PAST_JUNCTION));
  let hi = Math.min(span.hi, ...junctions.filter(j => j >= s + STRETCH_PAST_JUNCTION));
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

const unknownTraffic = (speed: number): RoadSpec['operations'] => ({ aadt: 0, heavyShare: 0, speed, speedPolicy: 'design', trafficUnknown: true });

/** The rebuilt stretch as an editable road: exact source claim and branch connections (core promotion),
 * its line converted ONCE, explicitly, into bends that follow the old road (the caller tells the player). */
export function rebuildCommand(base: ProjectTransportIndex, interval: SourceInterval, ids: { routeId: string; acousticSourceId: string }): Extract<ProjectCommand, { type: 'promote' }> {
  const what = rebuildable(base, interval.sourceId);
  if (!what.ok) throw new Error(what.why);
  const command = promoteGroundRoad(base, { ...ids, interval, name: what.info.name.charAt(0).toUpperCase() + what.info.name.slice(1),
    specification: { kind: 'road', policy: 'existing-ground', legalClass: what.info.legalClass, crossSection: 'existing',
      existingWidth: what.info.width, designSpeed: DEFAULT_SPEED, operations: unknownTraffic(DEFAULT_SPEED) } });
  const route = command.routes[0];
  if (route.kind !== 'road' || route.alignment.kind !== 'reference') throw new Error('Unexpected promotion');
  route.specification = { kind: 'road', policy: 'legacy-road', ...what.spec, designSpeed: DEFAULT_SPEED, operations: unknownTraffic(DEFAULT_SPEED) };
  route.alignment = { kind: 'pi', pis: fitBends(route.alignment.path), vertical: { kind: 'auto', pins: [] }, controls: { structureOverrides: [] } };
  return command;
}

export interface PlacedEnd { position: XYZ; anchor: Anchor }
/** A new straight class II road between two placed ends; bent afterwards like any road. */
export function newRoad(project: ProjectDesign, a: PlacedEnd, b: PlacedEnd, ids: { routeId: string; acousticSourceId: string }): RouteDesign {
  const used = new Set(project.routes.map(r => r.name));
  let name = 'New road';
  for (let n = 2; used.has(name); n++) name = `New road ${n}`;
  const end = (e: PlacedEnd): EndpointConstraint => ({ position: { ...e.position }, anchor: structuredClone(e.anchor), binding: 'resolved' });
  const spec: RoadSpec = { kind: 'road', policy: 'legacy-road', legalClass: 'II', crossSection: 'S7.5', designSpeed: DEFAULT_SPEED, operations: unknownTraffic(DEFAULT_SPEED) };
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
export function moveStretchEnds(base: ProjectTransportIndex, project: ProjectDesign, routeId: string, s0: number, s1: number): ProjectDesign {
  const route = project.routes.find(r => r.id === routeId);
  const old = route?.source?.intervals[0];
  if (!route || !old || route.kind !== 'road' || route.alignment.kind !== 'pi' || route.source!.intervals.length !== 1) throw new Error('Not a rebuilt stretch');
  if (!(s1 - s0 >= MIN_STRETCH)) throw new Error('Stretch too short');
  const interval = { ...old, s0, s1 };
  // Promotion re-derives the exact claim, end anchors and branch connections; the rebuilt road keeps its own specification.
  const info = groundRoadSourceInfo(base, old.sourceId);
  const command = promoteGroundRoad(base, { routeId: route.id, acousticSourceId: route.acousticSourceId, interval, name: route.name,
    specification: { kind: 'road', policy: 'existing-ground', legalClass: info.legalClass, crossSection: 'existing', existingWidth: info.width,
      designSpeed: route.specification.designSpeed, operations: route.specification.operations } });
  const fresh = command.routes[0];
  if (fresh.alignment.kind !== 'reference') throw new Error('Unexpected promotion');
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
  next.connections = [...next.connections.filter(c => !c.ports.some(p => p.kind === 'route' && p.routeId === routeId)), ...command.connections];
  return next;
}
