// The road network each project road is checked against: the map's roads AS THE PLAYER EDITED THEM.
// Every rebuilt stretch is gone from it (whether or not the project can be priced yet), and every new or
// rebuilt road appears in it as a road of its class, so the crossing engine that resolves mapped roads
// also resolves designed ones (bridge, its bridge over us, underpass, junction).
//
// Ownership of a crossing between two designed roads: the higher-ranking road builds and bills it
// (motorway/railway, then the mission road, then side roads by legal class I > II > III, then the
// earlier road in the project). The crossed road is drawn in the owner's network; it sees nothing of the
// owner there and follows the owner's decision with a height pin at the crossing (project-evaluate.ts).
import { buildAlignment, station } from './horizontal';
import { horizontalRules } from './data/norms';
import type { CrossingTarget, ProjectDesign, RouteDesign } from './project';
import type { CrossingOverride } from './crossings';
import type { RoadNet } from './roadnet';

export type SourceWays = ReadonlyMap<string, number>;
/** Map class of a designed road of each legal class (ROAD_CLASSES key). */
const MAP_CLASS: Record<string, string> = { I: 'primary', II: 'secondary', III: 'tertiary', local: 'unclassified' };
/** Plan line sample spacing of a designed road in the network, m (crossings are found on its chords). */
const LINE_STEP = 5;

/** Designed roads that can be crossed: side roads with design rules, in project order (their slots). */
export function designedSlots(design: ProjectDesign): RouteDesign[] {
  return design.routes.filter(r => r.kind === 'road' && r.role !== 'mission' && r.alignment.kind === 'pi'
    && r.specification.kind === 'road' && r.specification.crossSection !== 'existing' && MAP_CLASS[r.specification.legalClass] !== undefined);
}
function rank(r: RouteDesign): number {
  if (r.kind !== 'road') return 0;
  if (r.role === 'mission') return 1;
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
/** A designed road's plan line from its bends (no evaluation needed): local metres, [x0, y0, x1, y1, …]. */
export function planLine(route: RouteDesign): number[] {
  if (route.alignment.kind !== 'pi' || route.specification.kind !== 'road' || route.specification.crossSection === 'existing') return [];
  const al = buildAlignment(route.endpoints.a.position, route.endpoints.b.position, route.alignment.pis,
    horizontalRules(route.specification.designSpeed, route.specification.crossSection));
  const st = station(al, LINE_STEP), xy: number[] = [];
  for (let i = 0; i < st.n; i++) xy.push(st.x[i], st.y[i]);
  return xy;
}

/** Pack net sizes by object data, so a crossing choice on a designed road (way `size + slot`) can be stored
 * as a choice on that ROAD, whatever its slot later (see crossingOverridesOf / crossingTargetsOf). */
const netSizes = new Map<string, number>();
export function registerNet(objectData: string, ways: number): void { netSizes.set(objectData, ways); }

/** Project crossing choices → the legacy kernel's per-way overrides (designed roads at their slot). */
export function crossingOverridesOf(project: ProjectDesign, crossings: NonNullable<Extract<RouteDesign['alignment'], { kind: 'pi' }>['controls']['crossings']>): CrossingOverride[] {
  const size = netSizes.get(project.objectData), slots = designedSlots(project).map(r => r.id);
  return crossings.flatMap(c => {
    const t = c.target;
    if (t.kind === 'route') {
      const k = slots.indexOf(t.routeId);
      // a choice on a road that is gone (or a net not yet known) is dropped, never applied to another way
      return size === undefined || k < 0 ? [] : [{ roadId: size + k, type: c.choice }];
    }
    if (t.kind !== 'legacy-way' || t.objectData !== project.objectData) throw new Error('Crossing binding needs repair');
    return [{ roadId: t.roadId, type: c.choice, ...(c.via ? { via: c.via } : {}), ...(c.to !== undefined ? { to: c.to } : {}) }];
  });
}
/** The legacy kernel's per-way overrides → project crossing choices (a designed road's way → that road). */
export function crossingTargetsOf(project: ProjectDesign, overrides: readonly CrossingOverride[]): { target: CrossingTarget; choice: CrossingOverride['type']; via?: CrossingOverride['via']; to?: number }[] {
  const size = netSizes.get(project.objectData), slots = designedSlots(project);
  return overrides.map(c => {
    const slot = size !== undefined && c.roadId >= size ? slots[c.roadId - size] : undefined;
    if (slot) return { choice: c.type, target: { kind: 'route' as const, routeId: slot.id, s0: 0, s1: 0 } };
    return { choice: c.type, target: { kind: 'legacy-way' as const, objectData: project.objectData, roadId: c.roadId },
      ...(c.via ? { via: c.via, ...(c.to !== undefined ? { to: c.to } : {}) } : {}) };
  });
}

export interface EditedNetwork {
  roads: RoadNet;
  /** way index → the designed road drawn there */
  designed: Map<number, string>;
}
const cache: { key: string; base: RoadNet; net: EditedNetwork }[] = [];
/** The network `owner` is checked against: every rebuilt stretch cut out, every designed road it builds
 * the crossings with added at its slot. Null when a rebuilt stretch of `owner` itself cannot be cut (no
 * road links). The pack network itself when nothing is edited (bills of a single road stay bit-exact). */
export function editedNetwork(roads: RoadNet, design: ProjectDesign, owners: readonly RouteDesign[], sourceWays: SourceWays | undefined): EditedNetwork | null {
  const cuts: { way: number; d0: number; d1: number }[] = [];
  for (const r of design.routes) {
    const intervals = r.source?.intervals ?? [];
    const way = intervals.length === 1 ? sourceWays?.get(intervals[0].sourceId) : undefined;
    if (way === undefined) { if (owners.includes(r) && intervals.length) return null; continue; }
    // Interval ends are the route's end anchors (promotion invariant); measured on the legacy way itself.
    const da = roads.wayStation(way, r.endpoints.a.position.x, r.endpoints.a.position.y);
    const db = roads.wayStation(way, r.endpoints.b.position.x, r.endpoints.b.position.y);
    cuts.push({ way, d0: Math.min(da, db), d1: Math.max(da, db) });
  }
  const slots = designedSlots(design);
  const drawn = slots.map(r => owners.length > 0 && owners.every(o => o !== r && draws(design, o, r)));
  if (!cuts.length && !drawn.some(Boolean)) return { roads, designed: new Map() };
  const key = JSON.stringify([cuts.map(c => [c.way, c.d0.toFixed(2), c.d1.toFixed(2)]),
    slots.map((r, k) => drawn[k] ? [r.endpoints, r.alignment.kind === 'pi' ? r.alignment.pis : null, r.specification] : 0)]);
  const hit = cache.find(c => c.key === key && c.base === roads);
  if (hit) return hit.net;
  const extra = slots.map((r, k) => ({ cls: MAP_CLASS[(r.specification as { legalClass: string }).legalClass], xy: drawn[k] ? planLine(r) : [] }));
  const net: EditedNetwork = { roads: roads.edited(cuts, extra), designed: new Map(slots.flatMap((r, k) => drawn[k] ? [[roads.wayCount + k, r.id] as const] : [])) };
  cache.unshift({ key, base: roads, net }); cache.length = Math.min(cache.length, 6);
  return net;
}
