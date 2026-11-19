// The road network each project road is checked against: the map's roads AS THE PLAYER EDITED THEM.
// Every rebuilt stretch is gone from it (whether or not the project can be priced yet), and every new or
// rebuilt road appears in it as a road of its class, so the crossing engine that resolves mapped roads
// also resolves designed ones (bridge, its bridge over us, underpass, junction).
//
// Ownership of a crossing between two designed roads: the higher-ranking road builds and bills it
// (motorway/railway, then the mission road, then side roads by legal class I > II > III, then the
// earlier road in the project). The crossed road is drawn in the owner's network; it sees nothing of the
// owner there and follows the owner's decision with a height pin at the crossing (project-evaluate.ts).
import { buildAlignment, station, type PI } from './horizontal';
import { horizontalRules } from './data/norms';
import type { ProjectDesign, RouteDesign } from './project';
import type { CategoryId } from './data/categories';
import type { CrossingOverride, LinkEnd } from './crossings';
import type { RoadNet } from './roadnet';
import { lineAsDrawn, plannedKept, type OldPaths } from './project-kept';

export type SourceWays = ReadonlyMap<string, number>;
/** Map class of a designed road of each legal class (ROAD_CLASSES key). */
const MAP_CLASS: Record<string, string> = { I: 'primary', II: 'secondary', III: 'tertiary', local: 'unclassified', service: 'service', track: 'track', ramp: 'ramp' };
/** Plan line sample spacing of a designed road in the network, m (crossings are found on its chords). */
const LINE_STEP = 5;

/** Designed roads that can be crossed, in project order (their slots): side roads with design rules, new or
 * rebuilt railways, and new motorways (a paired motorway once, as its forward direction: its common line). */
export function designedSlots(design: ProjectDesign): RouteDesign[] {
  return design.routes.filter(r => r.role !== 'mission' && mapClass(design, r) !== undefined);
}
/** The map class a designed road is drawn as in other roads' networks (data/urban.ts ROAD_CLASSES). */
function mapClass(design: ProjectDesign, r: RouteDesign): string | undefined {
  if (r.kind === 'railway') return r.alignment.kind === 'pi' && r.specification?.kind === 'railway' ? (r.specification.tracks === 2 ? 'railway2' : 'railway') : undefined;
  if (r.kind === 'motorway') {
    const corridor = design.corridors.find(c => c.children.forward === r.id);
    // (one with separate stretches is not one line: not drawn yet, its crossings stay 'roads cross here')
    return corridor?.mode === 'paired' && corridor.spine.kind === 'pi' && !corridor.stretches?.length ? 'motorway' : undefined;
  }
  return r.kind === 'road' && r.alignment.kind === 'pi' && r.specification.kind === 'road' && r.specification.crossSection !== 'existing'
    ? MAP_CLASS[r.specification.legalClass] : undefined;
}
function rank(r: RouteDesign): number {
  if (r.role === 'mission') return 0;
  if (r.kind !== 'road') return 1;
  return r.specification.kind === 'road' ? 2 + Math.max(0, ['I', 'II', 'III'].indexOf(r.specification.legalClass)) + (r.specification.legalClass === 'local' ? 3 : 0) : 6;
}
/** Does `owner` build the crossings with `other` (see the header)? */
export function outranks(design: ProjectDesign, owner: RouteDesign, other: RouteDesign): boolean {
  const a = rank(owner), b = rank(other);
  return a !== b ? a < b : design.routes.indexOf(owner) < design.routes.indexOf(other);
}
/** Roads joined end to end (a side road ending on the other) meet at their junction, not a crossing. */
export function joinedRoads(design: ProjectDesign, p: RouteDesign, q: RouteDesign): boolean {
  const unit = (r: RouteDesign) => { const c = design.corridors.find(c => c.children.forward === r.id || c.children.reverse === r.id);
    return c ? [c.children.forward, c.children.reverse] : [r.id]; };
  const ends = (r: RouteDesign) => [r.endpoints.a.anchor, r.endpoints.b.anchor].flatMap(x => x.kind === 'route' ? [x.routeId] : []);
  return ends(p).some(id => unit(q).includes(id)) || ends(q).some(id => unit(p).includes(id));
}
/** `owner`'s network has `other` drawn in it: owner builds their crossings. */
export function draws(design: ProjectDesign, owner: RouteDesign, other: RouteDesign): boolean {
  return owner !== other && designedSlots(design).includes(other) && outranks(design, owner, other) && !joinedRoads(design, owner, other);
}
/** Distance along a plan line [x0, y0, …] to its nearest point to (x, y). */
export function lineStation(xy: readonly number[], x: number, y: number): number {
  let d = 0, best = Infinity, at = 0;
  for (let j = 0; j + 3 < xy.length; j += 2) {
    const dx = xy[j + 2] - xy[j], dy = xy[j + 3] - xy[j + 1], len = Math.hypot(dx, dy);
    const t = len ? Math.max(0, Math.min(1, ((x - xy[j]) * dx + (y - xy[j + 1]) * dy) / (len * len))) : 0;
    const e = Math.hypot(x - xy[j] - t * dx, y - xy[j + 1] - t * dy);
    if (e < best) { best = e; at = d + t * len; }
    d += len;
  }
  return at;
}
/** A road's ends as built: an end on another designed road follows that road's current line. */
export type ResolvedEnds = { a?: { x: number; y: number }; b?: { x: number; y: number } } | undefined;
/** A designed road's plan line from its bends (no evaluation needed): local metres, [x0, y0, x1, y1, …]. A
 * railway's from its bends with railway curves; a paired motorway's (with `design`) its common line. */
/** A rebuilt stretch's old line (where its old road's own curves are kept: PI.mapped), for its plan line. */
export type OldLineOf = (route: RouteDesign) => OldPaths | undefined;
/** `old`: a rebuilt stretch's old line; an old road's own curve it no longer lies on is then Auto's, as its
 * kernel builds it (project-kept.ts plannedKept). `asDrawn` (with `old`): where the line stays on its old line it
 * is that line, as it is drawn and kept (project-kept.ts lineAsDrawn): what other roads cross. */
export function planLine(route: RouteDesign, ends?: ResolvedEnds, step = LINE_STEP, design?: ProjectDesign, old?: OldPaths, asDrawn = false): number[] {
  const corridor = route.kind === 'motorway' ? design?.corridors.find(c => c.children.forward === route.id || c.children.reverse === route.id) : undefined;
  let al: ReturnType<typeof buildAlignment>, kept: ReturnType<typeof plannedKept> | undefined;
  /** its line as its kernel builds it (its bends as the kernel's, and with `asDrawn` the kernel's own alignment, per-bend
   * rules included, and where it stays on its old line) */
  const plan = (a: { x: number; y: number }, b: { x: number; y: number }, pis: PI[], speed: number, category: CategoryId) => {
    if (!old || !(asDrawn || pis.some(p => p.mapped))) return buildAlignment(a, b, pis, horizontalRules(speed, category));
    const planned = plannedKept(a, b, { pis, speed, category }, old);
    if (asDrawn && planned.kept.some(Boolean)) { kept = planned; return planned.al; }
    return buildAlignment(a, b, planned.pis, horizontalRules(speed, category));
  };
  if (corridor) {
    if (corridor.mode !== 'paired' || corridor.spine.kind !== 'pi' || route.specification.kind !== 'motorway') return [];
    al = buildAlignment(corridor.endpoints.a.position, corridor.endpoints.b.position, corridor.spine.pis, horizontalRules(route.specification.designSpeed, 'D27.5'));
  } else if (route.kind === 'railway' && route.alignment.kind === 'pi' && route.specification.kind === 'railway') {
    const category = route.specification.tracks === 2 ? 'R2' : 'R1';
    al = plan(route.endpoints.a.position, route.endpoints.b.position, route.alignment.pis, route.specification.designSpeed, category);
  } else if (route.alignment.kind !== 'pi' || route.specification.kind !== 'road' || route.specification.crossSection === 'existing') return [];
  else al = plan(ends?.a ?? route.endpoints.a.position, ends?.b ?? route.endpoints.b.position, route.alignment.pis, route.specification.designSpeed, route.specification.crossSection);
  const st = station(al, step), xy: number[] = [];
  const drawn = kept && old ? lineAsDrawn(st, kept.kept, kept.st.ds, old) : null;
  for (let i = 0; i < st.n; i++) xy.push(drawn ? drawn.x[i] : st.x[i], drawn ? drawn.y[i] : st.y[i]);
  return xy;
}
/** Ends on another designed road, from the plan alone: that road's station sample nearest to the stored end,
 * as the evaluator resolves it on that road's result (`step`: the evaluator's station spacing). For roads
 * whose joined road is not evaluated yet. */
export function planEnds(design: ProjectDesign, route: RouteDesign, step: number, seen: readonly RouteDesign[] = []): ResolvedEnds {
  const out: NonNullable<ResolvedEnds> = {};
  for (const end of ['a', 'b'] as const) {
    const anchor = route.endpoints[end].anchor, host = anchor.kind === 'route' ? design.routes.find(r => r.id === anchor.routeId) : undefined;
    if (!host || seen.includes(host)) continue;
    const line = planLine(host, planEnds(design, host, step, [...seen, route]), step), p = route.endpoints[end].position;
    let best = Infinity;
    for (let j = 0; j + 1 < line.length; j += 2) {
      const d = Math.hypot(line[j] - p.x, line[j + 1] - p.y);
      if (d < best) { best = d; out[end] = { x: line[j], y: line[j + 1] }; }
    }
  }
  return out.a || out.b ? out : undefined;
}

/** Pack net sizes by object data, so a crossing choice on a designed road (way `size + slot`) can be stored
 * as a choice on that ROAD, whatever its slot later (see crossingOverridesOf / crossingTargetsOf). */
const netSizes = new Map<string, number>();
/** The mapped bridges and tunnels of each pack net (RoadNet.structureIds): ways `from …` after the net's own. A choice on
 * one is stored with its OSM id (a raw way index ≥ `from` without one is an older save's remnant, numbered from `from`). */
const netStructures = new Map<string, { from: number; osm: readonly string[] }>();
export function registerNet(objectData: string, ways: number, structures?: { from: number; osm: readonly string[] }): void {
  netSizes.set(objectData, ways);
  if (structures?.osm.length) netStructures.set(objectData, structures); else netStructures.delete(objectData);
}
/** Rebuilt stretches in project order: what is left of an old road after stretch q is way
 * `size + designedSlots + q` in every edited network (RoadNet.edited), so a choice on it is stored as a
 * choice on "the old road after that stretch", whatever else is added or removed. */
export function rebuiltSlots(design: ProjectDesign): RouteDesign[] { return design.routes.filter(r => !!r.source?.intervals.length); }

type StoredCrossing = NonNullable<Extract<RouteDesign['alignment'], { kind: 'pi' }>['controls']['crossings']>[number];
/** Project crossing choices → the legacy kernel's per-way overrides (designed roads at their slot). */
export function crossingOverridesOf(project: ProjectDesign, crossings: readonly StoredCrossing[]): CrossingOverride[] {
  const size = netSizes.get(project.objectData), slots = designedSlots(project).map(r => r.id), rebuilt = rebuiltSlots(project).map(r => r.id);
  const mapped = netStructures.get(project.objectData), pack = mapped?.from ?? size;
  /** the way of a designed road / of what follows a rebuilt stretch; undefined when that road is gone */
  const wayOf = (ref: { kind: 'route' | 'after'; routeId: string }) => {
    const k = ref.kind === 'route' ? slots.indexOf(ref.routeId) : rebuilt.indexOf(ref.routeId);
    return size === undefined || k < 0 ? undefined : size + (ref.kind === 'route' ? k : slots.length + k);
  };
  return crossings.flatMap((c): CrossingOverride[] => {
    const t = c.target;
    let roadId: number | undefined;
    if (t.kind === 'route') roadId = wayOf({ kind: 'route', routeId: t.routeId });
    else if (t.kind !== 'legacy-way' || t.objectData !== project.objectData) throw new Error('Crossing binding needs repair');
    else if (t.after !== undefined) roadId = wayOf({ kind: 'after', routeId: t.after });
    // a mapped bridge or tunnel, by its OSM id (gone from the pack: dropped)
    else if (t.structure !== undefined) { const k = mapped?.osm.indexOf(t.structure) ?? -1; roadId = k >= 0 ? mapped!.from + k : undefined; }
    // saved before remnants had stable slots: way `pack + q` was what followed the q-th rebuilt stretch
    else if (size !== undefined && pack !== undefined && t.roadId >= pack) roadId = t.roadId - pack < rebuilt.length ? size + slots.length + t.roadId - pack : undefined;
    else roadId = t.roadId;
    // a choice on a road that is gone (or a net not yet known) is dropped, never applied to another way
    if (roadId === undefined) return [];
    // (an underpass or a bridge over us straightened, or kept on its line, by the player)
    const square = c.square !== undefined ? { square: c.square } : {};
    // (where the player led its new pieces: ways of the pack, still there)
    const ends = t.kind !== 'route' && c.ends?.some(e => e && (size === undefined || e.way < size)) ? { ends: c.ends.map(e => e && (size === undefined || e.way < size) ? e : null) as [LinkEnd | null, LinkEnd | null] } : {};
    if (t.kind === 'route' || !c.via) return [{ roadId, type: c.choice, ...square, ...ends }];
    // a shaped reroute keeps the crossing it leads to only while that road is still there
    const to = c.to === undefined ? undefined : c.toRef ? wayOf(c.toRef) : c.to;
    return [{ roadId, type: c.choice, via: c.via, ...(to !== undefined ? { to } : {}), ...ends }];
  });
}
/** The legacy kernel's per-way overrides → project crossing choices (a designed road's way → that road). */
export function crossingTargetsOf(project: ProjectDesign, overrides: readonly CrossingOverride[]): StoredCrossing[] {
  const size = netSizes.get(project.objectData), slots = designedSlots(project), rebuilt = rebuiltSlots(project), mapped = netStructures.get(project.objectData);
  const refOf = (way: number): { kind: 'route' | 'after'; routeId: string } | undefined => {
    if (size === undefined || way < size) return undefined;
    const slot = slots[way - size], after = rebuilt[way - size - slots.length];
    return slot ? { kind: 'route', routeId: slot.id } : after ? { kind: 'after', routeId: after.id } : undefined;
  };
  return overrides.map(c => {
    const ref = refOf(c.roadId);
    const square = c.square !== undefined ? { square: c.square } : {};
    if (ref?.kind === 'route') return { choice: c.type, target: { kind: 'route' as const, routeId: ref.routeId, s0: 0, s1: 0 }, ...square };
    const toRef = c.to !== undefined && c.to >= 0 ? refOf(c.to) : undefined;
    const structure = mapped && c.roadId >= mapped.from && c.roadId < mapped.from + mapped.osm.length ? mapped.osm[c.roadId - mapped.from] : undefined;
    return { choice: c.type, target: { kind: 'legacy-way' as const, objectData: project.objectData, roadId: c.roadId, ...(ref ? { after: ref.routeId } : {}), ...(structure ? { structure } : {}) },
      ...(c.via ? { via: c.via, ...(c.to !== undefined ? { to: c.to, ...(toRef ? { toRef } : {}) } : {}) } : {}), ...square, ...(c.ends ? { ends: c.ends } : {}) };
  });
}

export interface EditedNetwork {
  roads: RoadNet;
  /** way index → the designed road drawn there */
  designed: Map<number, string>;
  /** the plan line each designed road is drawn with (by route id) */
  lines: Map<string, number[]>;
}
/** An old line in a cache key: its points' count and sums (it follows from the stretch's source and ends, both in the key). */
const oldKey = (old: OldPaths | undefined) => old ? old.map(p => { let x = 0, y = 0; for (const q of p) { x += q.x; y += q.y; } return [p.length, x, y]; }) : null;
/** Recently built networks (a full evaluation asks for one per road; building one costs only its edits). */
const cache: { key: string; base: RoadNet; net: EditedNetwork }[] = [], CACHE = 12;
/** The network `owner` is checked against: every rebuilt stretch cut out, every designed road it builds
 * the crossings with added at its slot. Null when a rebuilt stretch of `owner` itself cannot be cut (no
 * road links). The pack network itself when nothing is edited (bills of a single road stay bit-exact).
 * `endsOf`: where each road's ends are built now (ends on another designed road follow it). */
export function editedNetwork(roads: RoadNet, design: ProjectDesign, owners: readonly RouteDesign[], sourceWays: SourceWays | undefined,
  endsOf: (route: RouteDesign) => ResolvedEnds = () => undefined, oldOf?: OldLineOf): EditedNetwork | null {
  const cuts: { way: number; d0: number; d1: number; slot: number }[] = [];
  rebuiltSlots(design).forEach((r, slot) => {
    const intervals = r.source!.intervals;
    const way = intervals.length === 1 ? sourceWays?.get(intervals[0].sourceId) : undefined;
    if (way === undefined) return;
    // Interval ends are the route's end anchors (promotion invariant); measured on the legacy way itself.
    const da = roads.wayStation(way, r.endpoints.a.position.x, r.endpoints.a.position.y);
    const db = roads.wayStation(way, r.endpoints.b.position.x, r.endpoints.b.position.y);
    cuts.push({ way, d0: Math.min(da, db), d1: Math.max(da, db), slot });
  });
  // a rebuilt road must leave its old road out of its own network (a rebuilt railway's old track is taken up
  // by the railway kernel itself: EvalOptions.railRetired)
  if (owners.some(r => r.kind === 'road' && r.source?.intervals.length && !cuts.some(c => c.slot === rebuiltSlots(design).indexOf(r)))) return null;
  const slots = designedSlots(design);
  const drawn = slots.map(r => owners.length > 0 && owners.every(o => o !== r && draws(design, o, r)));
  if (!cuts.length && !drawn.some(Boolean)) return { roads, designed: new Map(), lines: new Map() };
  const ends = slots.map((r, k) => drawn[k] ? endsOf(r) : undefined);
  const key = JSON.stringify([cuts.map(c => [c.way, c.d0.toFixed(2), c.d1.toFixed(2), c.slot]),
    slots.map((r, k) => drawn[k] ? [r.id, r.endpoints, ends[k], r.alignment.kind === 'pi' ? r.alignment.pis : null, r.specification,
      // (its old line, where it keeps an old road's own curves: planLine)
      r.source?.intervals ?? null, oldKey(oldOf?.(r)),
      r.kind === 'motorway' ? design.corridors.find(c => c.children.forward === r.id && c.mode === 'paired') ?? null : null] : r.id)]);
  const at = cache.findIndex(c => c.key === key && c.base === roads);
  if (at >= 0) { const [hit] = cache.splice(at, 1); cache.unshift(hit); return hit.net; }
  const lines = slots.map((r, k) => drawn[k] ? planLine(r, ends[k], LINE_STEP, design, oldOf?.(r), true) : []);
  const net: EditedNetwork = { roads: roads.edited(cuts, slots.map((r, k) => ({ cls: mapClass(design, r)!, xy: lines[k] }))),
    designed: new Map(slots.flatMap((r, k) => drawn[k] ? [[roads.wayCount + k, r.id] as const] : [])),
    lines: new Map(slots.flatMap((r, k) => drawn[k] ? [[r.id, lines[k]] as const] : [])) };
  cache.unshift({ key, base: roads, net }); cache.length = Math.min(cache.length, CACHE);
  return net;
}
