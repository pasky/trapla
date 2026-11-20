// Kind-generic hooks of the two "any line" flows, so motorways and railways plug into the same UX:
//
//  1. Mapped line → rebuild: a click selects any mapped road/railway (MappedRoadCard), a drag on its
//     highlighted stretch rebuilds it. `MappedLineKind` says whether a mapped source can be rebuilt by
//     this kind, what it becomes (one plain sentence) and makes the atomic promote command. The stretch
//     itself (junction to junction, never into another project road's claim) is kind-neutral.
//  2. Build → <kind>: click start and end. `BuildKind` says where an end may go (on a mapped source, on
//     a project route, or on open ground) and creates the straight route between the two placed ends.
//
// Register a kind once at startup (`registerMappedLineKind`, `registerBuildKind`); the Build menu lists
// exactly the registered build kinds, in registration order. The road kinds below are registered by
// default. A kind returns `null` from `rebuildable` for sources that are not its own (another kind may
// take them), and a plain `why` for its own sources it cannot rebuild yet. Player text goes through the
// conventions of core/terms.ts and tests/player-text.test.ts: plain words, no IDs.
import type { ProjectDesign, RouteDesign, RouteKind, RouteResult, SourceInterval } from '../core/project';
import type { ProjectTransportIndex } from '../core/project-network';
import type { ProjectCommand } from '../project-store-contract';
import { ROAD_CLASSES } from '../core/data/urban';
import { KIND } from '../core/structures';
import { CATEGORIES } from '../core/data/categories';
import { moveStretchEnds, newRoad, newSlipRoad, rebuildable, rebuildCommand, type PlacedEnd } from './road-edit';
import { carriagewayOf, gore, isSlipRoad, sideAt, SLIP_ROAD, SLIP_SECTIONS } from '../core/slip-roads';
import { motorwayCategory } from '../core/route-section';
import { mappedRoadName } from '../core/terms';
import { stationIndex } from '../core/range';

export interface RouteIds { routeId: string; acousticSourceId: string }
export type Verdict<T> = ({ ok: true } & T) | { ok: false; why: string };

export interface MappedLineKind {
  kind: RouteKind;
  /** null: not this kind's source. Otherwise what it would be rebuilt as ("class III road (S 7.5)"). */
  rebuildable(base: ProjectTransportIndex, sourceId: string): Verdict<{ becomes: string }> | null;
  /** The atomic, undoable promote command for this stretch (its line converted explicitly once). */
  rebuild(base: ProjectTransportIndex, interval: SourceInterval, ids: RouteIds): Extract<ProjectCommand, { type: 'promote' }>;
  /** The project with this rebuilt route's ends moved along its old line to [s0, s1] (one edit). */
  moveEnds(base: ProjectTransportIndex, project: ProjectDesign, routeId: string, s0: number, s1: number): ProjectDesign;
}
/** where an end on a mapped road goes: the project, and the line whose end it is (when one is dragged) */
export interface SourceContext { design: ProjectDesign; exclude?: string }
export interface EndContext { at: { x: number; y: number }; design: ProjectDesign; towards: { forward: string; reverse: string };
  /** the mapped lines, once loaded */
  base?: ProjectTransportIndex }
export interface BuildKind {
  kind: RouteKind;
  /** Build menu label. */
  label: string;
  /** An end on a mapped source at canonical station s, or a plain refusal. */
  onSource(base: ProjectTransportIndex, sourceId: string, s: number, where?: SourceContext): Verdict<{ end: PlacedEnd; label: string }>;
  /** An end on a project route at station s, given its engineered result (`at`: the point clicked, beside the
   * route's line; `design`: the project; `towards`: where each direction of a motorway goes, in place names). */
  onRoute(route: RouteDesign, result: RouteResult, s: number, where?: EndContext): Verdict<{ end: PlacedEnd; label: string }>;
  /** Why these two ends make no line of this kind (null: they do). */
  refuse?(a: PlacedEnd, b: PlacedEnd): string | null;
  /** What Build's card says about where its ends go (default: a click on a road joins it). */
  hint?: string;
  /** Lines this kind built, where two kinds build the same kind of line (a slip road is a road): its own. */
  owns?(route: RouteDesign): boolean;
  /** The new straight route between two placed ends (one route; dispatched as `create-route`). */
  create?(project: ProjectDesign, a: PlacedEnd, b: PlacedEnd, ids: RouteIds): RouteDesign;
  /** Or the whole project with what this kind builds (e.g. a motorway: a corridor and its two direction
   * routes), applied as ONE undoable edit; `activeRouteId` becomes the road being edited. Ids come from
   * `newId` (fresh, never reused). Exactly one of `create` / `createInProject` is needed. */
  createInProject?(project: ProjectDesign, a: PlacedEnd, b: PlacedEnd, newId: (prefix: 'route' | 'corridor' | 'acoustic' | 'connection') => string):
    { project: ProjectDesign; activeRouteId: string };
}
/** What Build → <kind> produces, as one project edit (whichever form the kind implements). */
export function buildInProject(kind: BuildKind, project: ProjectDesign, a: PlacedEnd, b: PlacedEnd,
  newId: (prefix: 'route' | 'corridor' | 'acoustic' | 'connection') => string): { project: ProjectDesign; activeRouteId: string } {
  if (kind.createInProject) return kind.createInProject(project, a, b, newId);
  if (!kind.create) throw new Error(`Build kind ${kind.kind} creates nothing`);
  const route = kind.create(project, a, b, { routeId: newId('route'), acousticSourceId: newId('acoustic') });
  return { project: { ...structuredClone(project), routes: [...structuredClone(project.routes), route] }, activeRouteId: route.id };
}

const mappedKinds: MappedLineKind[] = [], buildKinds: BuildKind[] = [];
export function registerMappedLineKind(kind: MappedLineKind) { mappedKinds.push(kind); }
export function registerBuildKind(kind: BuildKind) { buildKinds.push(kind); }
export const registeredBuildKinds = (): readonly BuildKind[] => buildKinds;
/** The build kind whose rules a built line's ends follow (a dragged end goes where this kind's ends may go). */
export const buildKindOf = (route: RouteDesign): BuildKind | undefined =>
  buildKinds.find(k => k.owns?.(route)) ?? buildKinds.find(k => k.kind === route.kind && !k.owns);
/** The kind that rebuilds this mapped source, with its verdict; a plain refusal when none does. */
export function mappedLineKindFor(base: ProjectTransportIndex, sourceId: string): { kind: MappedLineKind; verdict: Verdict<{ becomes: string }> } | { kind: null; verdict: { ok: false; why: string } } {
  let refusal: { kind: MappedLineKind; verdict: Verdict<{ becomes: string }> } | null = null;
  for (const kind of mappedKinds) {
    const verdict = kind.rebuildable(base, sourceId);
    if (verdict?.ok) return { kind, verdict };
    if (verdict && !refusal) refusal = { kind, verdict };
  }
  const source = base.source(sourceId);
  return refusal ?? { kind: null, verdict: { ok: false, why: source?.kind === 'railway' ? 'Railways cannot be changed yet.' : 'This line cannot be changed yet.' } };
}
/** The mapped-line kind that owns a rebuilt route (for moving its ends). */
export const mappedLineKindOf = (route: RouteDesign) => mappedKinds.find(k => k.kind === route.kind) ?? null;

const roadName = (base: ProjectTransportIndex, sourceId: string) => mappedRoadName(base.source(sourceId)?.tags);

export const ROAD_LINE: MappedLineKind = {
  kind: 'road',
  rebuildable(base, sourceId) {
    if (base.source(sourceId)?.kind !== 'road') return null;
    const what = rebuildable(base, sourceId);
    if (!what.ok) return what;
    const { crossSection, legalClass } = what.spec, label = CATEGORIES[crossSection].label, [code, kind] = [label.split(' (')[0], label.split(' (')[1]?.slice(0, -1)];
    return { ok: true, becomes: CATEGORIES[crossSection].minor ? `${kind} (${code})` : `class ${legalClass} road (${code})` };
  },
  rebuild: (base, interval, ids) => rebuildCommand(base, interval, ids),
  moveEnds: (base, project, routeId, s0, s1) => moveStretchEnds(base, project, routeId, s0, s1),
};
export const ROAD_BUILD: BuildKind = {
  kind: 'road', label: 'Road',
  onSource(base, sourceId, s) {
    const source = base.source(sourceId);
    if (!source || source.kind !== 'road') return { ok: false, why: 'A road cannot end on a railway.' };
    if (ROAD_CLASSES[source.tags.highway ?? '']?.noAtGrade) return { ok: false, why: 'A motorway is joined by slip roads, and the game builds them only onto a motorway of its own.' };
    const p = source.elevation === 'terrain' && !source.bridge && !source.tunnel ? base.position(source.id, s) : null;
    if (!p) return { ok: false, why: 'A road cannot join on a bridge or in a tunnel.' };
    return { ok: true, label: `joins ${roadName(base, sourceId)}`,
      end: { position: p, anchor: { kind: 'source', location: { transportData: base.transportData, sourceId, s } } } };
  },
  onRoute(route, result, s) {
    const r = result.legacy;
    if (route.kind === 'motorway') return { ok: false, why: `A road joins a ${SLIP_SECTIONS[motorwayCategory(route)].word} by slip roads: Build → Slip road.` };
    if (route.kind !== 'road') return { ok: false, why: 'A road cannot end on a railway.' };
    if (!r) return { ok: false, why: 'This road is not checked yet, so nothing can join it.' };
    const i = stationIndex(r, s);
    if (r.kind[i] !== KIND.earth) return { ok: false, why: 'A road cannot join on a bridge or in a tunnel.' };
    return { ok: true, label: route.role === 'mission' ? 'joins our road' : `joins ${route.name}`, end: { position: { x: r.x[i], y: r.y[i], z: r.grade[i] }, anchor: { kind: 'route', routeId: route.id, s: r.s[i] } } };
  },
  create: (project, a, b, ids) => newRoad(project, a, b, ids),
};
/** Build → Slip road: a one-way slip road of an interchange. Its start on a motorway of the project leaves it (an
 * exit), its end on one joins it (an entry), on the carriageway of the side it is put on; its other end joins a road
 * (a junction, as Build → Road's) (core/slip-roads.ts). */
export const SLIP_BUILD: BuildKind = {
  kind: 'road', label: 'Slip road',
  hint: 'Traffic runs from its start to its end: start it beside a motorway or four-lane road to leave it, end it there to join it. Its other end joins a road.',
  onSource(base, sourceId, s, where) {
    const source = base.source(sourceId);
    if (source && ROAD_CLASSES[source.tags.highway ?? '']?.noAtGrade) return { ok: false, why: 'A slip road joins a motorway or four-lane road built in this game only.' };
    // (near another slip road's end on that road: onto its junction, one crossroads)
    const other = where?.design.routes.filter(r => r.id !== where.exclude && isSlipRoad(r)).flatMap(r => [r.endpoints.a, r.endpoints.b])
      .flatMap(e => e.anchor.kind === 'source' && e.anchor.location.sourceId === sourceId && Math.abs(e.anchor.location.s - s) <= SLIP_ROAD.shareJunction ? [e.anchor.location.s] : [])
      .sort((p, q) => Math.abs(p - s) - Math.abs(q - s))[0];
    const at = other ?? s, placed = ROAD_BUILD.onSource(base, sourceId, at);
    if (!placed.ok) return placed;
    // (one-sided near the road's end)
    const p0 = base.position(sourceId, at - 5) ?? base.position(sourceId, at), p1 = base.position(sourceId, at + 5) ?? base.position(sourceId, at);
    return { ...placed, ...(other !== undefined ? { label: `${placed.label}, at another slip road's junction` } : {}),
      end: { ...placed.end, ...(p0 && p1 && Math.hypot(p1.x - p0.x, p1.y - p0.y) > 0.5 ? { along: { x: p1.x - p0.x, y: p1.y - p0.y } } : {}) } };
  },
  onRoute(route, result, s, where) {
    // (at another slip road's end on a road: onto its junction there)
    if (isSlipRoad(route) && where?.base) for (const e of [route.endpoints.a, route.endpoints.b]) {
      if (e.anchor.kind !== 'source' || Math.hypot(e.position.x - where.at.x, e.position.y - where.at.y) > SLIP_ROAD.shareJunction) continue;
      return SLIP_BUILD.onSource(where.base, e.anchor.location.sourceId, e.anchor.location.s, { design: where.design });
    }
    if (route.kind !== 'motorway') return ROAD_BUILD.onRoute(route, result, s, where);
    const category = motorwayCategory(route), word = SLIP_SECTIONS[category].word;
    const r = result.legacy, carriageway = where && carriagewayOf(where.design, route.id);
    if (!r || !where || !carriageway) return { ok: false, why: `This ${word} is not checked yet, so nothing can join it.` };
    if (!carriageway.paired) return { ok: false, why: `A slip road joins a ${word} where both its directions run side by side.` };
    const i = stationIndex(r, s);
    if (r.kind[i] !== KIND.earth) return { ok: false, why: `A slip road cannot leave or join the ${word} on a bridge or in a tunnel.` };
    const corridor = where.design.corridors.find(c => c.id === carriageway.corridorId)!;
    const side = sideAt(r, s, where.at), id = side === 1 ? corridor.children.forward : corridor.children.reverse;
    const g = gore(r, s, side, category);
    return { ok: true, label: `the ${word}, towards ${side === 1 ? where.towards.forward : where.towards.reverse}`,
      end: { position: { x: g.x, y: g.y, z: g.z }, anchor: { kind: 'route', routeId: id, s: g.s }, travel: g.travel } };
  },
  refuse(a, b) {
    const onMotorway = (e: PlacedEnd) => !!e.travel;
    if (onMotorway(a) && onMotorway(b)) return 'A slip road leaves or joins at one end only: put its other end on a road.';
    if (!onMotorway(a) && !onMotorway(b)) return 'A slip road leaves or joins a motorway or four-lane road: put one of its ends beside it.';
    return null;
  },
  create: (project, a, b, ids) => newSlipRoad(project, a, b, ids),
  owns: route => isSlipRoad(route),
};
registerMappedLineKind(ROAD_LINE);
registerBuildKind(ROAD_BUILD);
registerBuildKind(SLIP_BUILD);
