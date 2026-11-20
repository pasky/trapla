// Project publication boundary. Legacy single-road semantics remain exact; unimplemented interactions
// expose proposed geometry with null project total, never a sum of independently completed road bills.
import { ourWords, type OurLine } from './terms';
import { CATEGORIES, type CategoryId } from './data/categories';
import { ENDPOINT_JUNCTIONS, NOISE, ROAD_CLASSES } from './data/urban';
import { KIND } from './structures';
import type { EvalContext, EvalOptions, Result } from './evaluate';
import type { XYZ, SharedWork, ProjectBuildingOutcome, ProjectEnvironment, ProjectIssue, ProjectReceiver, ProjectResult, ProjectSnapshot, RouteDesign, RouteResult, TransportSurface } from './project';
import { INDEPENDENCE_SCREEN, routeContacts, screenIndependence, type InteractionReason, type RouteContact, type RouteInteraction } from './project-ledger';
import { evaluateProjectRoad, type SourceWays } from './project-road';
import type { KeepClear } from './keep-clear';
import type { Replacement, ReplacementWork } from './project-replacement';
import { takenUpOutcome } from './taken-up';
import { designedTieIn } from './tie-in';
import type { RoadNet } from './roadnet';
import { crossingChange } from './road-realignment';
import { carriagewayOf, gore, isSlipRoad, mergeBands, SLIP_ROAD, SLIP_SECTIONS, slipHost, slipRoadAtMotorway } from './slip-roads';
import { combineNoise, finiteSegmentDecider, type NoiseDecider } from './project-noise';
import { assertProjectDesign } from './project-validation';
import { evaluateProjectRailway, railInterval, type RailPaths, type RailwayEvaluation } from './project-railway';
import { corridorOfRoute, corridorOperations, evaluateProjectCorridor, type CorridorEvaluation } from './project-motorway';
import type { ProjectDesign, RoadOperations } from './project';
import * as dm from './detmath';
import { designedSlots, draws, editedNetwork, lineStation, outranks, planEnds, planLine, rebuiltSlots, registerNet, takenUpTrims, type MovedWays, type OldLineOf, type ResolvedEnds } from './project-roadnet';
import type { CrossingResult } from './crossings';
import { CROSSING_RULES } from './data/urban';
import { STRUCTURE_RULES } from './data/prices';
import { STEP } from './evaluate';
import { thisRoadWords } from './terms';
import { wallStretches } from './noise';
import { legacyDesignForRoute } from './project-legacy';
import { stationIndex } from './range';
import { motorwayCategory, routeCategory, routeWord } from './route-section';
import { structureSurcharge, surchargeRate } from './cost';

export interface ProjectEvalContext { legacy: EvalContext; environment: ProjectEnvironment; sourceWays?: SourceWays;
  /** Mapped railway lines (what a rebuilt railway stretch takes up); absent until the transport graph loads. */
  railPaths?: RailPaths;
  /** Combined noise of several roads (C1 c): answers each road's per-storey energy at a house from its
   * physical source, and project walls. Absent: each road's own finite-segment source (project-noise.ts
   * finiteSegmentDecider). */
  combinedNoise?: (routes: readonly { route: RouteDesign; result: Result }[]) => NoiseDecider | null }

const issue = (routeId: string, code: string): ProjectIssue => ({ code, scope: { routeIds: routeId ? [routeId] : [] }, locations: [], blocking: 'incomplete', check: 'not-checked',
  violation: { kind: 'crossing', basis: 'engine', title: 'Road checks are not finished',
    fix: 'Keep the existing road until its replacement is checked',
    rule: 'Engine limit: this foundation does not yet check shared construction, connections and combined noise for this design.' } });
const crownOf = (route: RouteDesign): number => ROUTE_KINDS[route.kind].crown(route);
function roadSurface(route: RouteDesign, result: Result): TransportSurface {
  const width = crownOf(route);
  return { routeId: route.id, revision: route.revision, points: Array.from({ length: result.n }, (_, i) => ({ s: result.s[i], x: result.x[i], y: result.y[i], z: result.grade[i],
    halfWidth: width / 2, structure: result.kind[i] === 1 ? 'bridge' as const : result.kind[i] === 2 ? 'tunnel' as const : 'ground' as const })) };
}
/** Reference proposal only: exact imported plan, sampled on real ground or explicit known/frozen Z.
 * No PI fitting, mode defaults or acceptance is implied. Auto/manual reference profiles await engineering. */
export function referenceRoadSurface(ctx: EvalContext, route: RouteDesign): TransportSurface | null {
  const a = route.alignment;
  if (route.kind !== 'road' || a.kind !== 'reference' || !['reference', 'frozen'].includes(a.vertical.kind)) return null;
  const halfWidth = (route.specification.crossSection === 'existing' ? route.specification.existingWidth! : CATEGORIES[route.specification.crossSection].crownWidth) / 2;
  if (!(halfWidth > 0)) return null;
  const points: TransportSurface['points'] = [];
  const frozen = a.vertical.kind === 'frozen' ? a.vertical.points : null;
  let zi = 0;
  for (let i = 1; i < a.path.length; i++) {
    const p = a.path[i - 1], q = a.path[i], count = Math.max(1, Math.ceil((q.s - p.s) / 5));
    if (points.length + count > 100000) return null;
    for (let k = i === 1 ? 0 : 1; k <= count; k++) {
      const t = k / count, s = p.s + (q.s - p.s) * t, x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t;
      let z: number;
      if (frozen) {
        if (s < frozen[0].s || s > frozen[frozen.length - 1].s) return null;
        while (zi + 2 < frozen.length && frozen[zi + 1].s < s) zi++;
        z = frozen[zi].z + (frozen[zi + 1].z - frozen[zi].z) * (s - frozen[zi].s) / (frozen[zi + 1].s - frozen[zi].s);
      } else if (p.elevation.kind === 'ground' && q.elevation.kind === 'ground') z = ctx.terrain.heightAt(x, y);
      else if (p.elevation.kind === 'known' && q.elevation.kind === 'known') z = p.elevation.z + (q.elevation.z - p.elevation.z) * t;
      else return null;
      if (!Number.isFinite(z) || ctx.terrain.isOob(x, y)) return null;
      points.push({ s, x, y, z, halfWidth, structure: 'ground' });
    }
  }
  return { routeId: route.id, revision: route.revision, points };
}
/** One evaluation per paired corridor, shared by both directions (never two priced kernels). */
type CorridorCache = Map<string, CorridorEvaluation>;
/** The road itself is engineered and shown with its own price; the project cannot price it yet. */
const UNPRICED: Record<'source-needs-network' | 'motorway-needs-interchange' | 'track-removal-unpriced', Pick<ProjectIssue, 'check'> & { violation: ProjectIssue['violation'] }> = {
  'track-removal-unpriced': { check: 'not-checked', violation: { kind: 'crossing', basis: 'engine', title: 'Taking up the old track is not priced yet',
    fix: 'The new line is checked and priced; removing the old track it replaces is not priced yet',
    rule: 'Engine limit: the price of a rebuilt railway stretch lacks taking up the old track.' } },
  'motorway-needs-interchange': { check: 'not-checked', violation: { kind: 'crossing', basis: 'engine', title: 'No interchange at its ends',
    fix: 'Its ends meet no road: this motorway is shown, not priced (slip roads can join it along its length)',
    rule: 'Engine limit: a new motorway\'s ends are not joined to the road network; only a mission motorway (continuing off the map at its ends) is priced.' } },
  'source-needs-network': { check: 'not-checked', violation: { kind: 'crossing', basis: 'engine', title: 'Replacing the old road is not priced yet',
    fix: 'Its new line is checked; removing the old road and reconnecting its side roads is not priced yet',
    rule: 'Engine limit: the price of a rebuilt stretch still lacks removing the old road and reconnecting the roads that joined it.' } },
};
/** What evaluating one route needs, whatever its kind (routeProposal assembles it). */
interface KindInput {
  ctx: ProjectEvalContext; snapshot: ProjectSnapshot; route: RouteDesign;
  /** the paired motorway the route is a direction of */
  corridor: ReturnType<typeof corridorOfRoute>;
  preview: boolean; prices: PreviewPrices;
  /** a corridor is evaluated once for both its directions */
  corridors: CorridorCache;
  ends?: { a?: XYZ; b?: XYZ }; holds?: EvalOptions['holds']; endsOf?: (route: RouteDesign) => ResolvedEnds;
  /** ways a road built with this one moves aside (a slip road: its motorway's, movedByMotorway) */
  moved?: MovedWays;
  /** the single-road context with the road network as the player edited it, seen by these routes */
  edited(owners: RouteDesign[]): EvalContext;
}
type KindEvaluation = CorridorEvaluation | RailwayEvaluation | ReturnType<typeof evaluateProjectRoad>;
/** A rebuilt stretch's old line, for its plan line in other roads' networks (project-roadnet.ts planLine): an old
 * road's own curve it no longer lies on yields to Auto's (PI.mapped), and where it stays on the old line it is that
 * line, kept as it is and drawn there, as its kernel does. */
const oldLineOf = (ctx: ProjectEvalContext): OldLineOf => r => {
  if (!r.source || r.alignment.kind !== 'pi') return undefined;
  if (r.kind === 'railway') {
    const lines = ctx.railPaths ? r.source.intervals.map(i => railInterval(ctx.railPaths!, i.sourceId, i.s0, i.s1)) : [];
    return lines.length && lines.every(l => l) ? lines as { x: number; y: number }[][] : undefined;
  }
  const way = r.source.intervals.length === 1 ? ctx.sourceWays?.get(r.source.intervals[0].sourceId) : undefined, roads = ctx.legacy.roads;
  if (way === undefined || !roads) return undefined;
  const a = r.endpoints.a.position, b = r.endpoints.b.position, da = roads.wayStation(way, a.x, a.y), db = roads.wayStation(way, b.x, b.y);
  return [roads.wayPath(way, Math.min(da, db), Math.max(da, db))];
};
const evaluateAsRoad = ({ ctx, snapshot, route, preview, prices, ends, holds, endsOf, moved }: KindInput): KindEvaluation =>
  evaluateProjectRoad(ctx.legacy, snapshot.design, route.id, ctx.environment.objectData, { preview, ...prices, sourceWays: ctx.sourceWays, oldOf: oldLineOf(ctx),
    ...(ends ? { ends } : {}), ...(holds?.length ? { holds } : {}), ...(endsOf ? { endsOf } : {}), ...(moved ? { moved } : {}) });
/** A row's function of a route of its own kind (a row is only asked about routes of its kind). */
function own<K extends RouteDesign['kind'], T>(_kind: K, f: (route: Extract<RouteDesign, { kind: K }>) => T): (route: RouteDesign) => T {
  return route => f(route as Extract<RouteDesign, { kind: K }>);
}
/**
 * How each kind of line is handled inside a project: its evaluator, the noise method its receivers are
 * computed by, and the clearance another line needs over it. One row per RouteKind, and the compiler insists
 * on it: a new kind (or a kind's new rule) is a row or a field here, not another `kind === …` below.
 * (The evaluation half of the kernel seam sketched in project.ts, RouteKernel.)
 */
const ROUTE_KINDS: Record<RouteDesign['kind'], {
  evaluate(k: KindInput): KindEvaluation;
  noise: 'legacy-road' | 'cnossos-rail';
  /** m: how far a line passing over this one stays above its grade */
  clearanceOver: number;
  /** m: the width of its crown (0: a road kept as it is) */
  crown(route: RouteDesign): number;
  /** its end on another of the player's lines is built where that line is built (followEnds) */
  endsFollow: boolean;
  /** an end on open ground is said as "ends nowhere" (a motorway's ends wait for interchanges: that issue says so) */
  endsNowhere: boolean;
  /** the traffic it is screened with against other lines when it is not a direction of a corridor */
  operations(route: RouteDesign): Pick<RoadOperations, 'aadt' | 'speed' | 'heavyShare'>;
}> = {
  road: { evaluate: evaluateAsRoad, noise: 'legacy-road', clearanceOver: CROSSING_RULES.overHeight,
    crown: own('road', r => r.specification.crossSection !== 'existing' ? CATEGORIES[r.specification.crossSection].crownWidth : 0),
    endsFollow: true, endsNowhere: true, operations: own('road', r => r.specification.operations) },
  motorway: {
    crown: r => CATEGORIES[routeCategory(r) as CategoryId].crownWidth,
    endsFollow: false, endsNowhere: false, operations: () => ({ aadt: Infinity, speed: Infinity, heavyShare: 1 }),
    // both directions of a corridor in one evaluation; a motorway route outside a corridor has no evaluator
    // of its own (the road kernel reports it as not supported)
    evaluate(k) {
      const { ctx, snapshot, route, corridor, preview, prices, corridors, holds, edited } = k;
      if (!corridor) return evaluateAsRoad(k);
      let cached = corridors.get(corridor.id);
      // A drag preview of one separate direction evaluates only that direction.
      if (!cached) corridors.set(corridor.id, cached = evaluateProjectCorridor(edited(snapshot.design.routes.filter(r => r.id === corridor.children.forward || r.id === corridor.children.reverse)),
        snapshot.design, corridor.id, ctx.environment.objectData, { preview, ...prices, ...(preview ? { only: route.id } : {}), ...(holds?.length ? { holds } : {}) }));
      return cached;
    },
    noise: 'legacy-road', clearanceOver: STRUCTURE_RULES.railClearance,
  },
  railway: {
    evaluate: ({ ctx, snapshot, route, preview, prices, holds, edited }) => evaluateProjectRailway(edited([route]), snapshot.design, route.id, ctx.environment.objectData, { preview, ...prices,
      ...(ctx.railPaths ? { railPaths: ctx.railPaths } : {}), ...(holds?.length ? { holds } : {}) }),
    noise: 'cnossos-rail', clearanceOver: STRUCTURE_RULES.railClearance,
    crown: own('railway', r => CATEGORIES[r.specification.tracks === 1 ? 'R1' : 'R2'].crownWidth),
    endsFollow: false, endsNowhere: true, operations: () => ({ aadt: Infinity, speed: Infinity, heavyShare: 1 }),
  },
};
/** The last full evaluation's fill values, which a drag preview prices at (EvalOptions). */
export type PreviewPrices = Pick<EvalOptions, 'materialValue' | 'structureValue'> & Pick<EvalOptions, 'keepClear'>;
function routeProposal(ctx: ProjectEvalContext, snapshot: ProjectSnapshot, route: RouteDesign,
  preview = false, prices: PreviewPrices = {}, corridors: CorridorCache = new Map(), ends?: { a?: XYZ; b?: XYZ },
  holds?: EvalOptions['holds'], endsOf?: (route: RouteDesign) => ResolvedEnds, keepClear?: KeepClear, moved?: MovedWays): { route: RouteResult; issues: ProjectIssue[];
    junctionEnds: ('a' | 'b')[]; replacement?: Replacement; ringWorks?: ReplacementWork[]; keptWork?: ReplacementWork } {
  const corridor = route.kind === 'motorway' ? corridorOfRoute(snapshot.design, route.id) : undefined;
  // (Auto's reroutes planned again clear of another road the player built: evaluateProject)
  if (keepClear?.length) prices = { ...prices, keepClear };
  // motorways and railways are checked against the network as the player edited it too
  const edited = (owners: RouteDesign[]) => {
    const net = ctx.legacy.roads ? editedNetwork(ctx.legacy.roads, snapshot.design, owners, ctx.sourceWays, endsOf, oldLineOf(ctx)) : null;
    return net ? { ...ctx.legacy, roads: net.roads } : ctx.legacy;
  };
  const evaluated = ROUTE_KINDS[route.kind].evaluate({ ctx, snapshot, route, corridor, preview, prices, corridors, ends, holds, endsOf, edited, ...(moved ? { moved } : {}) });
  const road = route.kind === 'road' && !corridor && evaluated.status === 'evaluated' ? evaluated as Extract<ReturnType<typeof evaluateProjectRoad>, { status: 'evaluated' }> : null;
  const legacy = evaluated.status === 'evaluated' ? evaluated.result : evaluated.status === 'split' ? evaluated.results[route.id] : undefined;
  // the kernel names the mission's ends A and B and calls the designed road "our road"; every other road's
  // card and map say its start and end, and "this road" ("our road" there is the mission road)
  if (legacy && route.role !== 'mission') {
    const own = (text: string) => thisRoadWords(endWords(route, text), routeLine(route));
    for (const v of new Set([...legacy.violations, ...legacy.inherited ?? [], ...legacy.crossings.flatMap(c => c.issues ?? [])])) {
      v.title = own(v.title); v.fix = own(v.fix); if (v.detail) v.detail = own(v.detail);
    }
  }
  // separate stretches: the forward direction carries the drawn parts; both carry the shared line
  const separated = evaluated.status === 'split' && evaluated.drawn ? { ...(corridor?.children.forward === route.id || preview ? { drawn: evaluated.drawn } : {}),
    ...(evaluated.spine ? { shared: evaluated.spine } : {}), ...(evaluated.apart ? { apart: evaluated.apart } : {}) } : {};
  return { route: { routeId: route.id, revision: route.revision, ...separated,
    engineeringRevision: `${snapshot.epoch}:${snapshot.revision}:${route.revision}:${preview ? 'preview' : 'full'}`,
    surface: legacy ? roadSurface(route, legacy) : referenceRoadSurface(ctx.legacy, route), geometry: null,
    ...(legacy ? { legacy } : {}), complete: false, valid: false, accepted: false, attributedCost: null, dependencies: [], influence: [] },
    junctionEnds: road?.junctionEnds ?? [],
    ...(road?.replacement ? { replacement: road.replacement } : {}),
    ...(road?.ringWorks ? { ringWorks: road.ringWorks } : {}),
    ...(road?.keptWork ? { keptWork: road.keptWork } : evaluated.status === 'evaluated' && 'keptWork' in evaluated && evaluated.keptWork ? { keptWork: evaluated.keptWork } : {}),
    issues: evaluated.status === 'incomplete' ? [issue(route.id, evaluated.reason)]
      : (road?.unpriced ?? ('unpriced' in evaluated && corridor?.children.reverse !== route.id ? evaluated.unpriced ?? [] : [])).map(code => ({ code, scope: { routeIds: [route.id] }, locations: [], blocking: 'incomplete' as const, ...UNPRICED[code] })) };
}
/** `last`: the last full result of this project. A dragged road keeps following the roads it joins and the
 * crossings a higher-ranking road built with it (under its bridge, on its own deck over it), as they
 * were last evaluated. (A preview builds no reroutes: its crossings carry the last full result's prices, whose
 * reroutes were already planned clear of the player's roads; evaluateProject's keepClear is not needed here.) */
export function previewProjectRoute(ctx: ProjectEvalContext, snapshot: ProjectSnapshot, routeId: string, prices: PreviewPrices = {},
  last?: ProjectResult | null): RouteResult {
  assertProjectDesign(snapshot.design);
  const design = snapshot.design;
  if (ctx.legacy.roads) registerNet(design.objectData, ctx.legacy.roads.wayCount, ctx.legacy.roads.structureIds);
  const route = design.routes.find(r => r.id === routeId); if (!route) throw new Error('Unknown preview route');
  // (a railway's ends do not follow other roads, but it follows the crossings they built with it; a motorway's
  // corridor kernel takes no holds)
  if (!last || last.epoch !== snapshot.epoch || route.kind === 'motorway') return routeProposal(ctx, snapshot, route, true, prices).route;
  const legacyOf = (id: string) => design.routes.some(r => r.id === id) ? last.routes[id]?.legacy : undefined;
  const ends = ROUTE_KINDS[route.kind].endsFollow ? followEnds(design, route, legacyOf) : undefined, line = planLine(route, ends, undefined, design, oldLineOf(ctx)(route));
  const holds: Hold[] = [];
  for (const owner of design.routes) {
    const own = owner === route ? undefined : legacyOf(owner.id);
    for (const c of own?.crossings ?? []) {
      if (c.crossedRoute?.id !== route.id || c.shared) continue;
      const at = crossingNow(own!, c, line), hold = at && holdAt(owner, own!, c, line, ctx.legacy.terrain.heightAt(at.x, at.y), at);
      if (hold) holds.push(hold);
    }
  }
  return routeProposal(ctx, snapshot, route, true, prices, undefined, ends, [...holds.flatMap(h => heldBands(placedHold(h, line))), ...slipBands(design, route, ends, legacyOf)],
    r => lineEnds(design, r, legacyOf), undefined, movedByMotorway(design, route, legacyOf, ctx.legacy.roads, ctx.sourceWays)).route;
}
/** The existing ways a slip road's motorway changes: all its footprint relocations and its crossings' changes of the
 * roads' plans (a reconnection's or diversion's severed stretch and its links, a way moved aside or squared), in its own
 * order, so that every slip road of one motorway numbers them alike. The slip road is built against the ground as the
 * motorway leaves it (those stretches gone, the pieces moved or led elsewhere there instead), so the two never change one
 * old road as two designs; its changes of what is left of those ways near them are one design with the motorway's
 * (`zones`, ScreenRoute.sharedWays). A slip road's end on a stretch the motorway takes out: `endsGone`. `roads`: the
 * pack's network (a relocation of a piece of a rebuilt road is not cut from it). */
function movedByMotorway(design: ProjectDesign, route: RouteDesign, legacyOf: (id: string) => Result | undefined, roads: RoadNet | undefined,
  sourceWays?: ReadonlyMap<string, number>): (MovedWays & {
  /** the motorway's directions, and each change's reach (the slip road's changes of what is left of those ways
   * near them are designed with them: ScreenRoute.sharedWays) */
  hosts: string[]; zones: { way: number; x: number; y: number; r: number }[]; endsGone: ('a' | 'b')[] }) | undefined {
  if (!isSlipRoad(route)) return undefined;
  const anchor = [route.endpoints.a.anchor, route.endpoints.b.anchor].find(a => a.kind === 'route' && carriagewayOf(design, a.routeId));
  const corridor = anchor?.kind === 'route' ? design.corridors.find(c => c.children.forward === anchor.routeId || c.children.reverse === anchor.routeId) : undefined;
  const host = corridor && legacyOf(corridor.children.forward);
  if (!corridor || !host) return undefined;
  const wayCount = roads?.wayCount ?? 0, reachOf = (r: number) => r + ENDPOINT_JUNCTIONS['tie-in'].zone + INDEPENDENCE_SCREEN.clearance;
  const out = { cuts: [] as MovedWays['cuts'], ways: [] as MovedWays['ways'], hosts: [corridor.children.forward, corridor.children.reverse],
    zones: [] as { way: number; x: number; y: number; r: number }[], endsGone: [] as ('a' | 'b')[] };
  for (const f of host.footprintConflicts) {
    if (f.action !== 'relocation' || f.feature !== 'road' || !f.sourceIntervals?.length || f.cls === undefined) continue;
    const intervals = f.sourceIntervals.filter(i => i.way < wayCount);
    if (!intervals.length) continue;
    // (a stretch closed rather than moved: taken out with nothing in its place)
    const paths = (f.geometry?.links ?? [f.geometry?.road ?? []]).filter(p => p.length > 1);
    for (const i of intervals) out.cuts.push({ way: i.way, d0: Math.min(i.a, i.b), d1: Math.max(i.a, i.b) });
    for (const p of paths) out.ways.push({ cls: f.cls, xy: p.flatMap(q => [q.x, q.y]) });
    // (its reach: the moved piece, and the junction mouths where it meets what is left)
    const r = reachOf(Math.max(f.length, ...paths.flat().map(q => Math.hypot(q.x - f.x, q.y - f.y))));
    for (const way of new Set(intervals.map(i => i.way))) out.zones.push({ way, x: f.x, y: f.y, r });
  }
  if (roads) {
    const changes = crossingChanges(host, roads, design, sourceWays);
    for (const c of changes) {
      out.cuts.push(...c.cuts); out.ways.push(...c.ways);
      for (const way of new Set(c.cuts.map(i => i.way))) out.zones.push({ way, x: c.x, y: c.y, r: reachOf(c.reach) });
    }
    // (an end on a stretch it takes out: joined to a road that is not there)
    for (const e of ['a', 'b'] as const) {
      const a = route.endpoints[e].anchor, p = route.endpoints[e].position, way = a.kind === 'source' ? sourceWays?.get(a.location.sourceId) : undefined;
      if (way === undefined) continue;
      const d = roads.wayStation(way, p.x, p.y) - (takenUpHeads(roads, design, sourceWays).get(way) ?? 0);
      if (out.cuts.some(i => i.way === way && d > i.d0 + 1 && d < i.d1 - 1)) out.endsGone.push(e);
    }
  }
  return out.cuts.length || out.zones.length ? out : undefined;
}
/** A motorway's crossings' changes of the crossed roads' plans (road-realignment.ts crossingChange) as cuts of the pack's
 * ways (measured as on the motorway's own network: from a dead end's new start where the player cut it back) and new
 * ground ways, in its order; one answer per evaluated motorway. */
const crossingChangesOf = new WeakMap<Result, { roads: RoadNet; key: string; changes: ReturnType<typeof crossingChangeList> }>();
function crossingChanges(host: Result, roads: RoadNet, design: ProjectDesign, sourceWays?: ReadonlyMap<string, number>) {
  const heads = takenUpHeads(roads, design, sourceWays), key = JSON.stringify([...heads]);
  const hit = crossingChangesOf.get(host);
  if (hit && hit.roads === roads && hit.key === key) return hit.changes;
  const changes = crossingChangeList(host, roads, heads);
  crossingChangesOf.set(host, { roads, key, changes });
  return changes;
}
function crossingChangeList(host: Result, roads: RoadNet, heads: ReadonlyMap<number, number>) {
  const out: { x: number; y: number; reach: number; cuts: MovedWays['cuts']; ways: MovedWays['ways'] }[] = [];
  for (const c of host.crossings) {
    if (c.shared || c.roadId === undefined) continue;
    // (a crossing of what is left of a way our road's own network cut, a later way there: the pack's way at that place)
    const way = c.roadId < roads.wayCount ? c.roadId : roads.nearestWay(c.x, c.y, 1);
    if (way === undefined || (c.roadId >= roads.wayCount && roads.connections({ x: c.x, y: c.y }, 1).find(q => q.way === way)?.cls !== c.cls)) continue;
    const change = crossingChange(way === c.roadId ? c : { ...c, roadId: way }, roads), removed = change?.removed.filter(i => i.way < roads.wayCount) ?? [];
    if (!change || !removed.length) continue;
    const cuts = removed.map(i => { const by = heads.get(i.way) ?? 0; return { way: i.way, d0: Math.max(0, i.a - by), d1: Math.max(0, i.b - by) }; }).filter(i => i.d1 > i.d0);
    if (!cuts.length) continue;
    out.push({ x: c.x, y: c.y, reach: change.reach, cuts, ways: change.pieces.map(p => ({ cls: c.cls, xy: p.flatMap(q => [q.x, q.y]) })) });
  }
  return out;
}
/** How much of each pack way's start the player took up (taken-up.ts): a way's stations on an edited network start there. */
function takenUpHeads(roads: RoadNet, design: ProjectDesign, sourceWays?: ReadonlyMap<string, number>): Map<number, number> {
  return new Map(takenUpTrims(roads, design, sourceWays).filter(t => t.d0 === 0).map(t => [t.way, t.d1]));
}
/** A paired road in the player's words for a slip road that meets none: the project's own kind where it has one kind. */
function pairedWord(design: ProjectDesign) {
  const words = new Set(design.routes.flatMap(r => r.kind === 'motorway' ? [SLIP_SECTIONS[motorwayCategory(r)].word] : []));
  return words.size === 1 ? [...words][0] : 'motorway';
}
/** A slip road at its motorway's level near its gore (core/slip-roads.ts mergeBands): grade bands as a crossing holds. */
function slipBands(design: ProjectDesign, route: RouteDesign, ends: { a?: XYZ; b?: XYZ } | undefined, legacyOf: (id: string) => Result | undefined) {
  if (!isSlipRoad(route)) return [];
  const out: { s: number; min: number; max: number }[] = [];
  for (const end of ['a', 'b'] as const) {
    const anchor = route.endpoints[end].anchor, host = anchor.kind === 'route' && carriagewayOf(design, anchor.routeId)?.paired ? legacyOf(anchor.routeId) : undefined;
    const paired = anchor.kind === 'route' ? slipHost(design, anchor.routeId) : null;
    if (!host || !paired) continue;
    out.push(...mergeBands(planLine(route, ends, MERGE_STEP), end, host, paired.category));
  }
  return out;
}
/** spacing of a slip road's held heights near its gore, m */
const MERGE_STEP = 10;
/** Ends on another designed road: its nearest point and height now (a slip road's end on a motorway: its gore on
 * the carriageway it joins, core/slip-roads.ts). */
function followEnds(design: ProjectDesign, r: RouteDesign, legacyOf: (id: string) => Result | undefined): { a?: XYZ; b?: XYZ } | undefined {
  const out: { a?: XYZ; b?: XYZ } = {};
  const slip = isSlipRoad(r);
  for (const end of ['a', 'b'] as const) {
    const anchor = r.endpoints[end].anchor, host = anchor.kind === 'route' ? legacyOf(anchor.routeId) : undefined;
    if (!host) continue;
    const p = r.endpoints[end].position, k = nearestStation(host, p.x, p.y);
    const carriageway = slip && anchor.kind === 'route' ? carriagewayOf(design, anchor.routeId) : null;
    const paired = carriageway?.paired && anchor.kind === 'route' ? slipHost(design, anchor.routeId) : null;
    if (paired) { const g = gore(host, host.s[k], carriageway!.direction, paired.category); out[end] = { x: g.x, y: g.y, z: g.z }; continue; }
    out[end] = { x: host.x[k], y: host.y[k], z: host.grade[k] };
  }
  return out.a || out.b ? out : undefined;
}
/** Where a road's ends are built, for its plan line in other roads' networks: on the roads it joins as
 * evaluated, else (not evaluated yet) on their plan. */
function lineEnds(design: ProjectDesign, r: RouteDesign, legacyOf: (id: string) => Result | undefined): ResolvedEnds {
  if (!ROUTE_KINDS[r.kind].endsFollow || ![r.endpoints.a, r.endpoints.b].some(e => e.anchor.kind === 'route')) return undefined;
  const now = followEnds(design, r, legacyOf);
  const pending = (['a', 'b'] as const).some(end => r.endpoints[end].anchor.kind === 'route' && !now?.[end]);
  const plan = pending ? planEnds(design, r, STEP) : undefined;
  const xy = (p?: { x: number; y: number }) => p ? { x: p.x, y: p.y } : undefined;
  const a = xy(now?.a ?? plan?.a), b = xy(now?.b ?? plan?.b);
  return a || b ? { ...(a ? { a } : {}), ...(b ? { b } : {}) } : undefined;
}
/** Where a crossing an owner built with a road lies on that road's line now (a drag moved the line): the
 * line's intersection with the owner's centreline nearest to the crossing, while the owner still does the
 * same there (earthworks, bridge or tunnel). */
function crossingNow(own: Result, c: CrossingResult, line: readonly number[]): { x: number; y: number; i: number } | null {
  let best: { x: number; y: number; i: number } | null = null, gap = Infinity;
  const i0 = Math.max(0, c.i - Math.ceil(PREVIEW_REACH / own.ds)), i1 = Math.min(own.n - 1, c.i + Math.ceil(PREVIEW_REACH / own.ds));
  for (let i = i0; i < i1; i++) {
    const px = own.x[i], py = own.y[i], rx = own.x[i + 1] - px, ry = own.y[i + 1] - py;
    for (let j = 0; j + 3 < line.length; j += 2) {
      const qx = line[j + 2] - line[j], qy = line[j + 3] - line[j + 1], den = rx * qy - ry * qx;
      if (Math.abs(den) < 1e-9) continue;
      const ex = line[j] - px, ey = line[j + 1] - py, t = (ex * qy - ey * qx) / den, u = (ex * ry - ey * rx) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const x = px + t * rx, y = py + t * ry, d = Math.hypot(x - c.x, y - c.y);
      if (d < gap) { gap = d; best = { x, y, i: t < 0.5 ? i : i + 1 }; }
    }
  }
  return best && own.kind[best.i] === own.kind[c.i] ? best : null;
}
/** Along the owner, how far a dragged road's crossing is looked for around where it was, m (a preview;
 * the full evaluation after the drag decides the crossing anew). */
const PREVIEW_REACH = 300;

const defineRoute = <T>(record: Record<string, T>, id: string, value: T) =>
  // Define arbitrary stable IDs safely, including object-prototype names.
  Object.defineProperty(record, id, { value, enumerable: true, configurable: true, writable: true });
/** The kernel names the mission's ends A and B; any other road's ends are its start and end. */
const endWords = (route: RouteDesign, text: string) => ourWords(route.role === 'mission' ? text
  : text.replace(/\b(to|from|near|at) A\b/g, '$1 its start').replace(/\b(to|from|near|at) B\b/g, '$1 its end'), routeLine(route));
const routeLine = (route: RouteDesign): OurLine => routeWord(route);
const issueKey = (i: ProjectIssue) => JSON.stringify([i.code, i.violation?.title, i.violation?.fix, i.locations.map(l => [l.s0, l.s1])]);
/** Problems already in the words of the road they belong to, which also name another road (heldChecks). */
const WORDED = new WeakSet<object>();
const routeIssues = (route: RouteDesign, r: Result): ProjectIssue[] => r.violations.map(v => { const words = (t: string) => WORDED.has(v) ? t : endWords(route, t);
  return { code: v.kind, blocking: 'invalid', check: 'violation', scope: { routeIds: [route.id] },
  locations: [{ routeId: route.id, s0: v.s0, s1: v.s1, ...(v.pi === undefined ? {} : { pi: v.pi }), ...(v.vpi === undefined ? {} : { vpi: v.vpi }) }],
  violation: { kind: v.kind, title: words(v.title), fix: words(v.fix), basis: v.basis, rule: v.rule, ...(v.detail ? { detail: words(v.detail) } : {}) } }; });

function routeOutcome(_ctx: ProjectEvalContext, _design: ProjectDesign, route: RouteDesign, r: Result): { buildings: ProjectBuildingOutcome[]; receivers: ProjectReceiver[] } {
  const buildings = ownBuildings(route, r);
  // Energies per storey come from the route's own finite-segment sum (day and night separately).
  const limits = r.noise.source?.limits ?? { dayDb: NOISE.limitDayDb, nightDb: NOISE.limitNightDb };
  const policy = ROUTE_KINDS[route.kind].noise;
  const receivers = r.noise.receivers.map(receiver => {
    const e = receiver.energy, k = receiver.floor;
    const height = NOISE.receiverHeight + k * NOISE.storeyHeight;
    const db = (v: number) => (v > 0 ? 10 * dm.log10(v) : -Infinity);
    return { buildingIndex: receiver.j, height, contributions: [{ sourceId: route.acousticSourceId, routeId: route.id,
      buildingIndex: receiver.j, height, dayEnergy: e.rawDay[k], nightEnergy: e.rawNight[k], policy,
      position: { x: receiver.x, y: receiver.y, z: receiver.ground },
      storeys: Array.from(e.day, (_, q) => ({ height: NOISE.receiverHeight + q * NOISE.storeyHeight, rawDay: e.rawDay[q], rawNight: e.rawNight[q], day: e.day[q], night: e.night[q] })) }],
      dayDb: db(e.day[k]), nightDb: db(e.night[k]), dayLimit: limits.dayDb, nightLimit: limits.nightDb,
      action: receiver.status === 'bought' ? 'buy' as const : 'retain' as const };
  });
  return { buildings, receivers };
}
/** What one road does to buildings on its own: under its works (demolished), bought out for its noise or
 * by the player's choice, kept by the player's choice. */
const ownBuildings = (route: RouteDesign, r: Result): ProjectBuildingOutcome[] => [
  ...r.demolished.map(b => ({ buildingIndex: b.j, action: 'demolish' as const, cost: b.cost, routeId: route.id })),
  ...r.boughtOut.map(b => ({ buildingIndex: b.j, action: 'buy' as const, cost: b.cost, routeId: route.id })),
  ...r.kept.map(b => ({ buildingIndex: b.j, action: 'retain' as const, cost: 0, routeId: route.id }))];
/** Why two roads have no common total yet: what they share, where, and what would separate them. */
const INTERACTION: Record<InteractionReason, (i: RouteInteraction, houses: number) => { title: string; fix: string }> = {
  'shared-land': i => ({ title: `Two roads' earthworks are closer than ${INDEPENDENCE_SCREEN.clearance} m`,
    fix: i.need !== undefined ? `Move one of them about ${Math.max(1, Math.ceil(i.need))} m away here` : 'Move one of them away here' }),
  'shared-noise': (_i, n) => ({ title: n > 1 ? `${n} houses hear both roads` : 'A house hears both roads',
    fix: 'Their noise together is not checked yet, so the project has no total' }),
  'shared-building': () => ({ title: 'Two roads take the same house', fix: 'Move one of them off it' }),
  'shared-road': () => ({ title: 'Two roads change the same old road', fix: 'Keep the two changes of that road apart, or change it with one road only' }),
  'too-many-roads': () => ({ title: `More than ${INDEPENDENCE_SCREEN.maxRoutes} roads`, fix: 'Remove a road change to get a total' }),
};
const interactionIssue = (i: RouteInteraction, at: { x: number; y: number } | undefined, locations: ProjectIssue['locations'], houses = 1): ProjectIssue => ({
  code: i.reason, blocking: 'incomplete', check: 'not-checked',
  scope: { routeIds: i.routeIds, ...(i.buildingIndex === undefined ? {} : { buildingIndex: i.buildingIndex }) }, locations, ...(at ? { at } : {}),
  violation: { kind: 'crossing', basis: 'engine', ...INTERACTION[i.reason](i, houses),
    rule: 'Engine limit: roads get one total only when they share no land, houses, noise or existing road; designing those together is not finished.' } });

const junctionsPending = (routeIds: string[], rail: boolean): ProjectIssue => ({ code: 'connection-pending', blocking: 'incomplete', check: 'not-checked',
  scope: { routeIds }, locations: [],
  violation: { kind: 'crossing', basis: 'engine', title: 'Junctions are not priced yet',
    fix: rail ? 'Where this railway joins another railway, the junction (its switches) is not built or priced yet'
      : 'Where this road joins another road, the junction is not built or priced yet',
    rule: 'Engine limit: junctions where a new or rebuilt road meets another road are not designed or priced yet.' } });
/** A free end of a new road or railway: priced as built (it simply ends there: nothing more is built or billed
 * at it), but not valid until it joins a road (a railway: a railway) or a scenario end. */
const endsNowhere = (routeId: string, rail: boolean, s: number, at: { x: number; y: number }): ProjectIssue => ({ code: 'road-ends-nowhere', blocking: 'invalid', check: 'violation',
  scope: { routeIds: [routeId] }, locations: [{ routeId, s0: s, s1: s }], at,
  violation: { kind: 'crossing', basis: 'game', title: rail ? 'Railway ends nowhere' : 'Road ends nowhere',
    fix: rail ? 'Connect this end to a railway' : 'Connect this end to a road',
    rule: 'Game rule: a new road must join a road or a scenario end at both ends; until then it is priced but not valid.' } });

/** Two roads that meet in plan one above the other as built: the upper on its bridge (or the lower in its
 * tunnel) the whole way, with the clearance a bridge needs over the lower road (CROSSING_RULES.overHeight;
 * over a railway or motorway STRUCTURE_RULES.railClearance). Each builds and bills its own structure there. */
function storeyed(c: RouteContact, surfaces: readonly TransportSurface[], design: ProjectDesign): boolean {
  const parts = c.routeIds.map((id, k) => {
    const surface = surfaces.find(q => q.routeId === id), { s0, s1 } = c.stations[k];
    // (a crossing point: the stations either side of it; an overlap: its whole run)
    const near = surface?.points.filter((p, i, all) => (p.s >= s0 && p.s <= s1)
      || (i + 1 < all.length && all[i + 1].s >= s0 && p.s <= s0) || (i > 0 && all[i - 1].s <= s1 && p.s >= s1)) ?? [];
    return { route: design.routes.find(r => r.id === id), near };
  });
  if (parts.some(p => !p.route || !p.near.length)) return false;
  const need = (lower: RouteDesign) => ROUTE_KINDS[lower.kind].clearanceOver;
  for (const [up, low] of [[parts[0], parts[1]], [parts[1], parts[0]]]) {
    // (each point of the lower one against the upper one's nearest point in plan)
    const gap = Math.min(...low.near.map(q => { const o = up.near.reduce((a, b) => Math.hypot(b.x - q.x, b.y - q.y) < Math.hypot(a.x - q.x, a.y - q.y) ? b : a); return o.z - q.z; }));
    if (gap >= need(low.route!) && (up.near.every(p => p.structure === 'bridge') || low.near.every(p => p.structure === 'tunnel'))) return true;
  }
  return false;
}
const contactIssue = (c: RouteContact): ProjectIssue => ({ code: c.kind === 'crossing' ? 'roads-cross' : 'roads-overlap',
  blocking: 'incomplete', check: 'not-checked', scope: { routeIds: [...c.routeIds] }, at: { ...c.at },
  locations: c.routeIds.map((routeId, k) => ({ routeId, ...c.stations[k] })),
  violation: { kind: 'crossing', basis: 'engine', title: c.kind === 'crossing' ? 'Roads cross here' : 'Roads overlap here',
    fix: c.kind === 'crossing' ? 'Move one road so they do not cross' : 'Move the roads apart',
    rule: 'Engine limit: crossings between new roads cannot be checked yet.' } });

/** One house, one action: bought/demolished by any route of a unit is bought once. */
function mergeBuildings(list: ProjectBuildingOutcome[]): ProjectBuildingOutcome[] {
  const out = new Map<number, ProjectBuildingOutcome>(), rank = { retain: 0, buy: 1, demolish: 2 } as const;
  for (const b of list) { const seen = out.get(b.buildingIndex); if (!seen || rank[b.action] > rank[seen.action]) out.set(b.buildingIndex, b); }
  return [...out.values()];
}
/** Distinct physical sources add as energy, never as dB or excess. The two directions of a split
 * motorway are each checked with the corridor's whole traffic (a bound), so within one unit the
 * louder of them is kept rather than adding two bounds. */
function mergeReceivers(list: ProjectReceiver[], sameUnit: boolean): ProjectReceiver[] {
  const out = new Map<number, ProjectReceiver>();
  const add = (a: number, b: number) => 10 * dm.log10(dm.pow(10, a / 10) + dm.pow(10, b / 10));
  for (const r of list) {
    const seen = out.get(r.buildingIndex);
    if (!seen) { out.set(r.buildingIndex, r); continue; }
    const action = seen.action === 'buy' || r.action === 'buy' ? 'buy' as const : 'retain' as const;
    out.set(r.buildingIndex, sameUnit ? { ...(r.nightDb - r.nightLimit > seen.nightDb - seen.nightLimit ? r : seen), action,
      contributions: [...seen.contributions, ...r.contributions] }
      : { ...seen, contributions: [...seen.contributions, ...r.contributions], dayDb: add(seen.dayDb, r.dayDb), nightDb: add(seen.nightDb, r.nightDb), action });
  }
  return [...out.values()];
}

export function evaluateProject(ctx: ProjectEvalContext, snapshot: ProjectSnapshot): ProjectResult {
  // The player's road takes over: where one of Auto's reroutes of another road came too close to it, that
  // road plans its reroutes again clear of the player's road (once; what is still too close stays reported).
  const yields = new Map<string, KeepClear>();
  const first = evaluateProjectOnce(ctx, snapshot, new Map(), yields);
  if (!yields.size) return first;
  // (kept where it leaves fewer things unsettled between the roads)
  const unsettled = (r: ProjectResult) => r.issues.filter(i => i.check === 'not-checked').length;
  let best = first;
  // A road keeping its earthworks clear of another's behind walls (KeepClear `wall`) may come too close a little
  // further on once walled: again with those works too, at most WALL_PASSES times.
  for (let pass = 0; pass < WALL_PASSES; pass++) {
    const more = new Map<string, KeepClear>();
    const again = evaluateProjectOnce(ctx, snapshot, yields, more);
    if (again.cost.total !== null || unsettled(again) < unsettled(best)) best = again;
    if (again.cost.total !== null) break;
    let grown = false;
    for (const [id, list] of more) {
      const walls = list.filter(c => c.wall);
      if (walls.length) { yields.set(id, [...yields.get(id) ?? [], ...walls]); grown = true; }
    }
    if (!grown) break;
  }
  return best;
}
/** re-runs of a project whose roads keep clear of each other's works behind walls (evaluateProject) */
const WALL_PASSES = 3;
/** Stage 1 of evaluateProjectOnce: the empty result, the order the roads are evaluated in (a road after the
 * roads its ends join and the roads drawn through it; what is left of a cycle last) and the maps the stages
 * fill (each road's Result, the heights it holds for others, replacements, works, junctions). */
function projectStart(ctx: ProjectEvalContext, snapshot: ProjectSnapshot, keepClear: ReadonlyMap<string, KeepClear>) {
  assertProjectDesign(snapshot.design);
  const design = snapshot.design;
  const result: ProjectResult = { epoch: snapshot.epoch, revision: snapshot.revision, routes: {}, works: { items: [] },
    cost: { total: null, routes: {}, shared: 0, materialBalance: 'per-route', alone: {}, unpriced: [] }, issues: [],
    acceptedReplacements: [], acceptedRenderReplacements: [], buildings: [], receivers: [], complete: false, valid: false,
    acousticScreen: { bounds: [], omittedDayEnergyUpperBound: Infinity, omittedNightEnergyUpperBound: Infinity, complete: false } };
  const priced: { route: RouteDesign; legacy: Result }[] = [], engineered: typeof priced = [];
  const corridorCache: CorridorCache = new Map();
  const unitOf = (r: RouteDesign) => corridorOfRoute(design, r.id)?.id ?? r.id;
  /** route ends whose junction with an existing road is built and billed by that route (C1 a) */
  const builtJunctions = new Set<string>();
  /** a rebuilt stretch's own works: old road removed, side roads reconnected (C1 b) */
  const replacements = new Map<string, Replacement>();
  const ringsOf = new Map<string, ReplacementWork[]>();
  // A side road ending on another designed road follows that road's current line: the joined road is
  // evaluated first (dependency order, stable otherwise). A cycle of such ends is not built yet.
  // A road crossed by a higher-ranking road follows that road's crossing (project-roadnet.ts): the owner first.
  const endHosts = (r: RouteDesign) => [r.endpoints.a.anchor, r.endpoints.b.anchor].flatMap(x => x.kind === 'route' ? [x.routeId] : []);
  const ordered = (hostOf: (r: RouteDesign) => string[]) => {
    const order: RouteDesign[] = [], placed = new Set<string>();
    for (let pass = 0; pass <= design.routes.length && order.length < design.routes.length; pass++)
      for (const r of design.routes) if (!placed.has(r.id) && hostOf(r).every(h => placed.has(h) || !design.routes.some(q => q.id === h))) { order.push(r); placed.add(r.id); }
    return { order, placed };
  };
  // crossing owners first where that is possible; ends that follow another road always come first
  // (and, where possible, the roads that those it crosses end on: their line is then known exactly)
  // (a paired motorway is drawn once, as its forward direction: both directions follow that one's owners)
  const forwardOf = (r: RouteDesign) => { const c = corridorOfRoute(design, r.id); return c && c.mode === 'paired' ? design.routes.find(q => q.id === c.children.forward) ?? r : r; };
  const owners = (r: RouteDesign) => [...design.routes.filter(o => draws(design, o, forwardOf(r))).map(o => o.id), ...forwardOf(r) !== r ? [forwardOf(r).id] : []];
  let { order, placed } = ordered(r => [...endHosts(r), ...owners(r), ...design.routes.filter(q => draws(design, r, q)).flatMap(endHosts).filter(id => id !== r.id)]);
  if (order.length < design.routes.length) ({ order, placed } = ordered(r => [...endHosts(r), ...owners(r)]));
  if (order.length < design.routes.length) ({ order, placed } = ordered(endHosts));
  if (ctx.legacy.roads) registerNet(design.objectData, ctx.legacy.roads.wayCount, ctx.legacy.roads.structureIds);
  /** where a higher-ranking road's crossing holds a designed road (filled as owners are evaluated) */
  const holdsOf = new Map<string, Hold[]>(), seenOwners = new Set<Result>();
  const cyclic = design.routes.filter(r => !placed.has(r.id));
  const legacyOf = new Map<string, Result>();
  const ownWorks = new Map<string, ReplacementWork[]>();
  /** where two designed roads meet in one work (a junction, a crossing): its land is that work's */
  const designedJunctions = new Map<string, { routeId: string; x: number; y: number; r: number }[]>();
  /** existing ways two designed roads change as one design (a slip road's junction on the road its motorway crosses) */
  const sharedWays = new Map<string, { routeId: string; way: number; x: number; y: number; r: number }[]>();
  const evaluated = (id: string) => legacyOf.get(id);
  /** what a road's reroutes keep clear of (a motorway's two directions: both directions') */
  const routeClear = (route: RouteDesign) => {
    const kids = corridorOfRoute(design, route.id)?.children;
    return kids ? [...keepClear.get(kids.forward) ?? [], ...keepClear.get(kids.reverse) ?? []] : keepClear.get(route.id);
  };
  const endsOf = (r: RouteDesign) => lineEnds(design, r, evaluated);
  return { design, result, priced, engineered, corridorCache, unitOf, builtJunctions, replacements, ringsOf, order,
    holdsOf, seenOwners, cyclic, legacyOf, ownWorks, designedJunctions, sharedWays, evaluated, routeClear, endsOf };
}

/** Stage 2: every road evaluated in that order (its ends follow the roads it joins; the heights its crossings
 * hold are placed on the line it is built on), and the mapped roads its rebuilt stretches replace. */
function projectRoutes(ctx: ProjectEvalContext, snapshot: ProjectSnapshot, start: ReturnType<typeof projectStart>) {
  const { order, cyclic, evaluated, holdsOf, design, corridorCache, endsOf, routeClear, legacyOf, ownWorks,
    seenOwners, designedJunctions, result, engineered, builtJunctions, replacements, ringsOf, priced } = start;
  for (const route of [...order, ...cyclic]) {
    // its ends follow the roads it joins; the heights its crossings hold are placed on the line it is built on
    const ends = ROUTE_KINDS[route.kind].endsFollow ? followEnds(design, route, evaluated) : undefined;
    const line = holdsOf.has(route.id) ? planLine(route, ends, undefined, design, oldLineOf(ctx)(route)) : [];
    let holds = (holdsOf.get(route.id) ?? []).map(h => ({ ...h, ...placedHold(h, line) }));
    const merge = slipBands(design, route, ends, evaluated);
    const moved = movedByMotorway(design, route, evaluated, ctx.legacy.roads, ctx.sourceWays);
    if (moved) {
      let shared = start.sharedWays.get(route.id); if (!shared) start.sharedWays.set(route.id, shared = []);
      for (const z of moved.zones) for (const id of moved.hosts) shared.push({ routeId: id, ...z });
    }
    let proposal = routeProposal(ctx, snapshot, route, false, {}, corridorCache, ends, [...holds.flatMap(heldBands), ...merge], endsOf, routeClear(route), moved);
    // (high above the owner's bridge on its own bridge: held above it instead, where that misses fewer holds)
    const turned = proposal.route.legacy && overBridge(proposal.route.legacy, holds);
    if (turned) {
      // (a motorway's two directions are evaluated once per corridor: that evaluation is redone)
      const corridorId = corridorOfRoute(design, route.id)?.id, kept = corridorId ? corridorCache.get(corridorId) : undefined;
      if (corridorId) corridorCache.delete(corridorId);
      const again = routeProposal(ctx, snapshot, route, false, {}, corridorCache, ends, [...turned.flatMap(heldBands), ...merge], endsOf, routeClear(route), moved);
      if (again.route.legacy && heldChecks(again.route.legacy, turned, routeLine(route)).violations.length < heldChecks(proposal.route.legacy!, holds, routeLine(route)).violations.length) {
        proposal = again; holds = turned;
        for (const h of turned) if (h.over) h.crossing.above = true;
      } else if (corridorId && kept) corridorCache.set(corridorId, kept);
    }
    if (proposal.route.legacy) legacyOf.set(route.id, proposal.route.legacy);
    const own = proposal.route.legacy;
    // (a slip road's end on a stretch its motorway takes out: joined to a road that is not there)
    if (own && moved?.endsGone.length) {
      const h = moved.hosts.map(id => slipHost(design, id)).find(Boolean), word = h ? SLIP_SECTIONS[h.category].word : 'motorway';
      for (const e of moved.endsGone) {
        const at = e === 'a' ? { s0: 0, s1: Math.min(own.length, SLIP_ROAD.endZone / 2) } : { s0: Math.max(0, own.length - SLIP_ROAD.endZone / 2), s1: own.length };
        own.violations.push({ kind: 'crossing', ...at, basis: 'game', title: `It joins a stretch of road the ${word} takes out`,
          fix: 'Move this end along the road to where it stays', rule: `Game rule: a slip road joins a road where it stays; the ${word} takes this stretch of it out.` });
        own.valid = false;
      }
    }
    if (own && holds.length) {
      const { violations, credits } = heldChecks(own, holds, routeLine(route));
      if (violations.length) { own.violations.push(...violations); own.valid = false; }
      if (credits.length) ownWorks.set(route.id, [...ownWorks.get(route.id) ?? [], ...credits]);
    }
    // the designed roads this road crosses: each follows its crossing's height
    if (own && ctx.legacy.roads && !seenOwners.has(own)) {
      seenOwners.add(own);
      const corridorKids = corridorOfRoute(design, route.id), owners = corridorKids
        ? design.routes.filter(r => r.id === corridorKids.children.forward || r.id === corridorKids.children.reverse) : [route];
      const net = editedNetwork(ctx.legacy.roads, design, owners, ctx.sourceWays, endsOf, oldLineOf(ctx));
      for (const c of own.crossings) {
        const crossedId = c.roadId !== undefined ? net?.designed.get(c.roadId) : undefined, crossed = design.routes.find(r => r.id === crossedId);
        if (!crossed) continue;
        c.crossedRoute = { id: crossed.id, name: crossed.name };
        delete c.above; // (decided anew when the crossed road is evaluated)
        const drawn = net!.lines.get(crossed.id) ?? [];
        const hold = holdAt(route, own, c, drawn, ctx.legacy.terrain.heightAt(c.x, c.y));
        let list = holdsOf.get(crossed.id); if (!list) holdsOf.set(crossed.id, list = []);
        // a split motorway's two directions share one crossing structure
        // the other direction of a split motorway reuses this structure (it holds nothing new)
        if (!hold || c.shared) continue;
        list.push(hold);
        // the crossing's land is the owner's work: the two roads do not share land there
        // (its earthworks around the crossing, measured along an oblique crossed road, and any ramps)
        let wide = 0;
        for (let q = 0; q < own.n; q++) if (Math.abs(own.s[q] - c.s) <= ZONE_ALONG) wide = Math.max(wide, own.cell.width[q] / 2);
        // (along an oblique crossed road its own width and the clearance are as much longer as our works)
        const reach = (wide + (ROAD_CLASSES[c.cls]?.width ?? 7.5) + INDEPENDENCE_SCREEN.clearance) / Math.max(0.3, crossingSine(own, c, drawn, lineStation(drawn, c.x, c.y)))
          + ((c.approachLength ?? 0) + (c.span ?? 0)) / 2;
        let zones = designedJunctions.get(crossed.id); if (!zones) designedJunctions.set(crossed.id, zones = []);
        for (const o of owners) zones.push({ routeId: o.id, x: c.x, y: c.y, r: reach });
        // our bridge over it: the crossed road runs under the whole bridge and past its abutments (their
        // earthworks' end slopes): all of that is the crossing too
        const run = own.runs.find(u => u.kind === KIND.bridge && c.s >= u.s0 - own.ds && c.s <= u.s1 + own.ds);
        if (run) for (let q = 0; q < own.n; q++) if (own.s[q] >= run.s0 && own.s[q] <= run.s1 || Math.abs(own.s[q] - run.s0) < own.ds / 2 || Math.abs(own.s[q] - run.s1) < own.ds / 2)
          for (const o of owners) zones.push({ routeId: o.id, x: own.x[q], y: own.y[q], r: own.cell.width[q] / 2 + (ROAD_CLASSES[c.cls]?.width ?? 7.5) + INDEPENDENCE_SCREEN.clearance });
      }
    }
    defineRoute(result.routes, route.id, proposal.route);
    if (proposal.route.legacy) engineered.push({ route, legacy: proposal.route.legacy });
    for (const end of proposal.junctionEnds) builtJunctions.add(`${route.id}:${end}`);
    if (proposal.replacement) replacements.set(route.id, proposal.replacement);
    if (proposal.ringWorks) ringsOf.set(route.id, proposal.ringWorks);
    if (proposal.keptWork) ownWorks.set(route.id, [...ownWorks.get(route.id) ?? [], proposal.keptWork]);
    for (const i of proposal.issues) { result.issues.push(i); result.cost.unpriced.push({ routeId: route.id, reason: i.code }); }
    if (!proposal.issues.length && proposal.route.legacy) priced.push({ route, legacy: proposal.route.legacy });
  }
  // A rebuilt stretch's old road is gone from the map as soon as its new line is engineered against the
  // network without it, priced or not: every road is checked against the network as the player edited it.
  for (const route of design.routes) if (route.source && replacements.has(route.id)) result.acceptedReplacements.push(...route.source.intervals.map(i => ({ ...i })));
  // A side road met at its old access gives up its piece beyond the new road, towards the old one (crossings.ts
  // oldJunction): gone from the map with it.
  const roads = ctx.legacy.roads;
  if (roads && ctx.sourceWays) for (const route of design.routes) if (route.source && replacements.has(route.id)) for (const c of legacyOf.get(route.id)?.crossings ?? []) {
    const removed = c.geometry?.removed, path = c.geometry?.road;
    if (c.type !== 'junction' || !c.oldJunction || !removed || !path?.length || c.roadId === undefined) continue;
    const sourceId = [...ctx.sourceWays].find(([, way]) => way === c.roadId)?.[0];
    if (!sourceId) continue;
    // (from where its kept part ends at our road to where it joined the old road)
    const end = removed[0] >= 0 ? path[path.length - 1] : path[0];
    const a = roads.wayStation(c.roadId, end.x, end.y), b = roads.wayStation(c.roadId, c.oldJunction.x, c.oldJunction.y);
    if (Math.abs(b - a) > 0.5) result.acceptedReplacements.push({ transportData: design.transportData!, sourceId, s0: Math.min(a, b), s1: Math.max(a, b) });
  }
}

/** Stage 2b: dead ends the player cut back (core/taken-up.ts): gone from the map, billed with the project's own road
 * (the mission's; a paired corridor's forward direction), and the houses they were the only road to. */
function projectTakenUp(ctx: ProjectEvalContext, start: ReturnType<typeof projectStart>): ProjectIssue[] {
  const { design, result, engineered, ownWorks, legacyOf } = start;
  const roads = ctx.legacy.roads;
  if (!design.takenUp?.length) return [];
  const mission = design.routes.find(r => r.role === 'mission') ?? design.routes[0];
  const corridor = mission && corridorOfRoute(design, mission.id), payer = corridor?.mode === 'paired' ? corridor.children.forward : mission?.id;
  const legacy = payer ? legacyOf.get(payer) : undefined;
  if (!payer || !legacy) return [];
  const at = (x: number, y: number) => legacy.s[nearestStation(legacy, x, y)];
  const issue = (code: string, blocking: ProjectIssue['blocking'], t: (typeof design.takenUp)[number], violation: ProjectIssue['violation']): ProjectIssue => ({
    code, blocking, check: blocking === 'invalid' ? 'violation' : 'not-checked', scope: { routeIds: [payer] },
    locations: [{ routeId: payer, s0: at(t.at.x, t.at.y), s1: at(t.at.x, t.at.y) }], at: { x: t.at.x, y: t.at.y }, violation });
  // a piece is taken up where the road links know its way; never one a road of the project rebuilds or ends on
  const resolved: typeof design.takenUp = [], issues: ProjectIssue[] = [];
  for (const t of design.takenUp) {
    const { sourceId, s0, s1 } = t.interval;
    if (!roads || ctx.sourceWays?.get(sourceId) === undefined || t.interval.transportData !== design.transportData) {
      const i = issue('taken-up-unresolved', 'incomplete', t, { kind: 'crossing', basis: 'engine', title: 'A road taken up is not on this map',
        fix: 'Undo it, or drag its end out again', rule: 'Engine limit: a road taken up needs the map\'s road links to be priced.' });
      result.issues.push(i); result.cost.unpriced.push({ routeId: payer, reason: i.code }); continue;
    }
    const used = design.routes.some(r => r.source?.intervals.some(i => i.sourceId === sourceId && i.s0 < s1 && i.s1 > s0)
      || [r.endpoints.a.anchor, r.endpoints.b.anchor].some(e => e.kind === 'source' && e.location.sourceId === sourceId && e.location.s > s0 && e.location.s < s1));
    if (used) issues.push(issue('taken-up-used', 'invalid', t, { kind: 'crossing', basis: 'game', title: 'A road you built uses a road taken up',
      fix: 'Leave more of the old road', rule: 'Game rule: a road taken up is gone, so no road of the project can rebuild or join it.' }));
    resolved.push(t);
  }
  for (const t of resolved) result.acceptedReplacements.push({ ...t.interval });
  const edited = editedNetwork(roads!, design, [], ctx.sourceWays)?.roads ?? roads!;
  const gone = new Set<number>([...design.buildingOverrides.filter(b => b.action === 'buy').map(b => b.j),
    ...engineered.flatMap(({ route, legacy }) => ownBuildings(route, legacy).filter(b => b.action !== 'retain').map(b => b.buildingIndex))]);
  // (a road of the project gives access where it is built: not our road itself, a motorway, a slip road or a railway)
  const ours = new Set([mission!.id, ...corridor ? [corridor.children.forward, corridor.children.reverse] : []]);
  const lines = engineered.filter(({ route }) => route.kind === 'road' && !ours.has(route.id) && route.specification.legalClass !== 'ramp').map(({ legacy }) => legacy);
  const out = takenUpOutcome({ ...design, takenUp: resolved }, roads!, edited, ctx.sourceWays, ctx.legacy.buildings, gone, payer, at, lines);
  if (out.works.length) ownWorks.set(payer, [...ownWorks.get(payer) ?? [], ...out.works]);
  return [...issues, ...out.issues];
}

/** Stage 3: the junctions where a side road meets another designed road (built and billed by the side road),
 * and every road's own works listed. */
function projectWorks(ctx: ProjectEvalContext, start: ReturnType<typeof projectStart>) {
  const { engineered, cyclic, design, legacyOf, ownWorks, designedJunctions, builtJunctions, replacements, ringsOf,
    result } = start;
  // Junctions where a side road meets another designed road: built and billed by the side road (C1 c),
  // checked against the joined road's current design. Each road's other junctions (and ends) count.
  const junctionsOn = new Map<string, number[]>();
  const gores: SlipGore[] = [];
  for (const { route, legacy } of engineered) for (const end of ['a', 'b'] as const) {
    const anchor = route.endpoints[end].anchor;
    if (anchor.kind !== 'route' || cyclic.includes(route)) continue;
    const hostRoute = design.routes.find(q => q.id === anchor.routeId), host = legacyOf.get(anchor.routeId);
    // a slip road meeting a carriageway of a motorway: its speed-change lane there, priced and drawn (core/slip-roads.ts)
    if (hostRoute?.kind === 'motorway' && host && isSlipRoad(route)) {
      // (both ends on a motorway: a problem below, and no lane or credit for either: they would credit its metres twice)
      const other = route.endpoints[end === 'a' ? 'b' : 'a'].anchor;
      if (other.kind === 'route' && design.routes.find(q => q.id === other.routeId)?.kind === 'motorway') { builtJunctions.add(`${route.id}:${end}`); continue; }
      const g = slipRoadEnd(ctx, start, route, legacy, end, hostRoute, host); if (g) gores.push(g); continue;
    }
    // a slip road has no junction along it (data/categories.ts V7.25 gradeSeparated)
    if (hostRoute && isSlipRoad(hostRoute) && host) {
      const i = end === 'a' ? 0 : legacy.n - 1;
      legacy.violations.push({ kind: 'crossing', s0: legacy.s[i], s1: legacy.s[i], basis: 'norm', title: `A slip road cannot be joined: ${hostRoute.name}`,
        fix: 'End this road on another road', rule: 'ČSN 73 6101: interchange slip roads have no junction or access along them' }); // research/08
      legacy.valid = false; builtJunctions.add(`${route.id}:${end}`); continue;
    }
    if (!hostRoute || !host || hostRoute.kind !== 'road' || hostRoute.specification.crossSection === 'existing') continue;
    const spec = hostRoute.specification, crown = CATEGORIES[spec.crossSection as Exclude<typeof spec.crossSection, 'existing'>].crownWidth;
    let stations = junctionsOn.get(hostRoute.id);
    if (!stations) junctionsOn.set(hostRoute.id, stations = [0, host.length, ...host.crossings.filter(c => c.type === 'junction').map(c => c.s)]);
    const t = designedTieIn(legacy, end, { name: hostRoute.role === 'mission' ? 'our road' : hostRoute.name, legalClass: spec.legalClass,
      crownWidth: crown, result: host, junctions: stations }, ctx.legacy.terrain, ctx.legacy.buildings,
      route.alignment.kind === 'pi' ? route.alignment.controls.junctionForms?.[end] : undefined);
    stations.push(t.s);
    if (t.violations.length) { legacy.violations.push(...t.violations); legacy.valid = false; }
    const i = end === 'a' ? 0 : legacy.n - 1, k = stationIndex(host, t.s);
    let list = ownWorks.get(route.id); if (!list) ownWorks.set(route.id, list = []);
    list.push({ kind: 'junction', s: legacy.s[i], x: legacy.x[i], y: legacy.y[i], length: 0, cost: t.cost, label: t.label });
    if (t.ring) list.push({ kind: 'junction', s: legacy.s[i], x: legacy.x[i], y: legacy.y[i], length: 0, cost: t.ring.cost, ...(t.ring.removed.length ? { removes: [...t.ring.removed] } : {}),
      label: `Roundabout's ring: ${Math.round(t.ring.area)} m² of land${t.ring.removed.length ? `, ${t.ring.removed.length} building${t.ring.removed.length > 1 ? 's' : ''} bought out` : ''}` });
    // The side road's first metres lie inside the joined road's own earthworks: built (and bought) once.
    const inside = host.cell.width[k] / 2;
    let credit = 0;
    for (let q = 0; q < legacy.n; q++) {
      const fromEnd = end === 'a' ? legacy.s[q] : legacy.length - legacy.s[q];
      if (fromEnd >= inside) continue;
      for (const key of SHARED_PARTS) credit += legacy.parts[key][q];
    }
    if (credit > 0) list.push({ kind: 'junction', s: legacy.s[i], x: legacy.x[i], y: legacy.y[i], length: inside, cost: -credit,
      label: `Its first ${Math.round(inside)} m are inside ${hostRoute.role === 'mission' ? 'our road' : hostRoute.name}’s earthworks: not built twice` });
    let j = designedJunctions.get(route.id); if (!j) designedJunctions.set(route.id, j = []);
    j.push({ routeId: hostRoute.id, x: legacy.x[i], y: legacy.y[i], r: host.cell.width[k] / 2 + ENDPOINT_JUNCTIONS['tie-in'].zone + INDEPENDENCE_SCREEN.clearance });
    builtJunctions.add(`${route.id}:${end}`);
  }
  // a slip road leaves or joins a motorway at one end, its other end on a road
  for (const { route, legacy } of engineered) if (isSlipRoad(route)) {
    const on = (['a', 'b'] as const).filter(e => { const x = route.endpoints[e].anchor; return x.kind === 'route' && design.routes.find(q => q.id === x.routeId)?.kind === 'motorway'; });
    if (on.length === 1) continue;
    const x = route.endpoints[on[0] ?? 'a'].anchor, h = x.kind === 'route' ? slipHost(design, x.routeId) : null, word = h ? SLIP_SECTIONS[h.category].word : pairedWord(design);
    legacy.violations.push({ kind: 'crossing', s0: 0, s1: legacy.length, basis: 'game',
      title: on.length ? `It leaves and joins the ${word}` : `It neither leaves nor joins a ${word}`,
      fix: on.length ? 'Put one of its ends on a road' : `Put its start beside a ${word} to leave it, or its end to join it`,
      rule: `Game rule: a slip road leaves or joins a ${word} at one end; its other end joins a road.` });
    legacy.valid = false;
  }
  interchangeAllowance(start, gores);
  interchangeTerminals(start, gores, ctx.legacy.roads);
  sharedJunctions(start);
  for (const [id, rep] of replacements) ownWorks.set(id, [...ownWorks.get(id) ?? [], ...rep.works]);
  for (const [id, rings] of ringsOf) ownWorks.set(id, [...ownWorks.get(id) ?? [], ...rings]);
  // Every road's own works are listed (its card shows them); they count in a price only once accepted below.
  for (const { route } of engineered) for (const [k, w] of (ownWorks.get(route.id) ?? []).entries()) result.works.items.push(replacementWork(route, k, w));
}

/** A slip road's end on a motorway of the project (stage 3): its speed-change lane on the carriageway (a work of
 * the slip road), its first metres inside the motorway's formation (a credit), the zone where the two bodies are one
 * interchange, and its checks. Only where the motorway's two directions run as one body (a paired line). */
function slipRoadEnd(ctx: ProjectEvalContext, start: ReturnType<typeof projectStart>, route: RouteDesign, legacy: Result, end: 'a' | 'b',
  hostRoute: RouteDesign, host: Result): SlipGore | null {
  const { design, ownWorks, designedJunctions, builtJunctions } = start;
  const carriageway = carriagewayOf(design, hostRoute.id), i = end === 'a' ? 0 : legacy.n - 1;
  let list = ownWorks.get(route.id); if (!list) ownWorks.set(route.id, list = []);
  // (a slip road meets a paired road: its speed-change lane, gore and credit are that cross-section's, core/slip-roads.ts)
  const paired = slipHost(design, hostRoute.id, host)!, sec = SLIP_SECTIONS[paired.category], the = `the ${sec.word}`;
  if (!carriageway?.paired) {
    legacy.violations.push({ kind: 'crossing', s0: legacy.s[i], s1: legacy.s[i], basis: 'engine', title: `Joins a ${sec.word} whose directions run apart`,
      fix: `Join the two directions again (every stretch where they run apart), or build it on a ${sec.word} that runs as one`,
      rule: `Engine limit: a slip road joins a ${sec.word} only while its two directions run as one line along its whole length.` });
    legacy.valid = false; builtJunctions.add(`${route.id}:${end}`); return null;
  }
  const speed = route.specification.kind === 'road' ? route.specification.designSpeed : 50;
  const at = slipRoadAtMotorway(legacy, end, host, carriageway.direction, speed, ctx.environment.terrainClass,
    q => { let c = 0; for (const key of SHARED_PARTS) c += legacy.parts[key][q]; return c; }, INDEPENDENCE_SCREEN.clearance,
    (x, y) => ctx.legacy.terrain.heightAt(x, y), paired);
  if (at.violations.length) { legacy.violations.push(...at.violations); legacy.valid = false; }
  const word = at.kind === 'exit' ? 'Exit' : 'Entry';
  list.push({ kind: 'lane', s: legacy.s[i], x: at.gore.x, y: at.gore.y, length: at.lane.length, cost: at.lane.cost, lines: at.lane.lines,
    label: `${word} lane on ${the}, ${Math.round(at.lane.length)} m (its hard shoulder, paved ${sec.widening} m wider)` });
  if (at.credit > 0) list.push({ kind: 'junction', s: legacy.s[i], x: legacy.x[i], y: legacy.y[i], length: at.insideM, cost: -at.credit,
    label: `Its first ${Math.round(at.insideM)} m are on ${the}'s formation: not built twice` });
  if (at.overlap > 0) list.push({ kind: 'junction', s: legacy.s[i], x: legacy.x[i], y: legacy.y[i], length: 0, cost: -at.overlap,
    label: `Where its slopes and ${the}'s overlap: that earth and land once` });
  if (at.dugCost > 0) list.push({ kind: 'junction', s: legacy.s[i], x: legacy.x[i], y: legacy.y[i], length: 0, cost: at.dugCost,
    label: `The ridge between its cutting and ${the}'s dug out: one cutting, ${Math.round(at.dug).toLocaleString('en')} m³` });
  let zones = designedJunctions.get(route.id); if (!zones) designedJunctions.set(route.id, zones = []);
  for (const z of at.zones) zones.push({ routeId: hostRoute.id, ...z });
  // (both directions are one body: the other direction's route shares it)
  const other = design.corridors.find(c => c.id === carriageway.corridorId)!;
  for (const z of at.zones) zones.push({ routeId: other.children.forward === hostRoute.id ? other.children.reverse : other.children.forward, ...z });
  builtJunctions.add(`${route.id}:${end}`);
  // what it builds on earth (its earthworks and road, not its bridges or tunnels), less what the motorway's body gives
  let earth = -at.credit - at.overlap;
  for (let q = 0; q < legacy.n; q++) if (legacy.kind[q] === KIND.earth) for (const key of SHARED_PARTS) earth += legacy.parts[key][q];
  return { corridorId: carriageway.corridorId, length: host.length, s: at.sGore, routeId: route.id, earth: Math.max(0, earth), x: at.gore.x, y: at.gore.y,
    goreZones: at.goreZones, zones: at.zones, direction: carriageway.direction, lane: [at.lane.s0, at.lane.s1], kind: at.kind, end, legacy, word: sec.word };
}
/** A slip road's other end joining a road its motorway crosses near the interchange (the road to the motorway's
 * bridge, or under it): its junction there and the motorway's crossing of that road are one interchange, laid out
 * together. Their changes of that road, and the land between the junction and the crossing's works, are not shared
 * by two separate designs. (A junction ON the crossing's rebuilt stretch is its own problem, slip-roads.ts.) */
function interchangeTerminals(start: ReturnType<typeof projectStart>, gores: SlipGore[], roads?: RoadNet) {
  const { design, legacyOf, designedJunctions, sharedWays } = start;
  for (const routeId of new Set(gores.map(g => g.routeId))) {
    const route = design.routes.find(r => r.id === routeId), legacy = legacyOf.get(routeId), g = gores.find(q => q.routeId === routeId)!;
    const corridor = design.corridors.find(c => c.id === g.corridorId), line = corridor && legacyOf.get(corridor.children.forward);
    if (!route || !legacy || !corridor || !line) continue;
    for (const end of ['a', 'b'] as const) {
      // (the way its junction there joins, as the kernel built it: road links need not be loaded)
      const i = end === 'a' ? 0 : legacy.n - 1, anchor = route.endpoints[end].anchor;
      const way = anchor.kind === 'source' ? legacy.footprintConflicts.find(f => f.action === 'junction' && f.i === i)?.roadId : undefined;
      if (way === undefined) continue;
      // (the road it joins: that way and the ways continuing it, a road mapped as several ways where its name or class changes)
      const road = roads ? roadWays(roads, way, legacy.x[i], legacy.y[i], SLIP_ROAD.interchangeReach / 2) : new Set([way]);
      for (const c of line.crossings) {
        if (c.roadId === undefined || !road.has(c.roadId) || c.shared) continue;
        const reach = Math.max((c.span ?? 0) / 2 + (c.approachLength ?? 0) + (c.realignLength ?? 0),
          ...(c.geometry?.road ?? []).map(q => Math.hypot(q.x - c.x, q.y - c.y)));
        const d = Math.hypot(legacy.x[i] - c.x, legacy.y[i] - c.y);
        // (near the interchange: within a slip road's length of the crossing)
        if (d > SLIP_ROAD.interchangeReach / 2) continue;
        // a junction is built where the road is on its ground: not on the crossing's ramp up to its bridge (or down under it)
        const raised = (c.geometry?.road ?? []).filter(q => q.surface !== 'terrain' || Math.abs(q.z - q.ground) > 0.5);
        const near = raised.reduce((m, q) => Math.min(m, Math.hypot(q.x - legacy.x[i], q.y - legacy.y[i])), Infinity);
        if (near < ENDPOINT_JUNCTIONS['tie-in'].zone) {
          const off = raised.reduce((m, q) => Math.max(m, Math.hypot(q.x - c.x, q.y - c.y)), 0) + ENDPOINT_JUNCTIONS['tie-in'].zone;
          const zone = SLIP_ROAD.endZone / 2, at = end === 'a' ? { s0: 0, s1: Math.min(legacy.length, zone) } : { s0: Math.max(0, legacy.length - zone), s1: legacy.length };
          legacy.violations.push({ kind: 'crossing', ...at, basis: 'game', title: 'It joins the road on the ramp to its bridge',
            fix: `Move this end along the road to at least ${Math.ceil(off / 10) * 10} m from the ${g.word}, where the road is back on its ground`,
            rule: `Game rule: a junction is built where the road it joins runs on its ground, not on the ramp of a bridge over the ${g.word} or under it` });
          legacy.valid = false;
        }
        let shared = sharedWays.get(routeId); if (!shared) sharedWays.set(routeId, shared = []);
        let zones = designedJunctions.get(routeId); if (!zones) designedJunctions.set(routeId, zones = []);
        const zone = { x: (legacy.x[i] + c.x) / 2, y: (legacy.y[i] + c.y) / 2, r: d / 2 + reach + ENDPOINT_JUNCTIONS['tie-in'].zone + INDEPENDENCE_SCREEN.clearance };
        for (const id of [corridor.children.forward, corridor.children.reverse]) {
          for (const w of new Set([way, c.roadId])) shared.push({ routeId: id, way: w, ...zone });
          zones.push({ routeId: id, ...zone });
        }
      }
    }
  }
}
/** A mapped road as the ways it is made of along it: from the point x, y on `way` out to `reach` m either way, on over
 * its straightest continuation where a way ends (RoadNet.connectedCrossingPath: the same class preferred). */
function roadWays(roads: RoadNet, way: number, x: number, y: number, reach: number): Set<number> {
  const out = new Set([way]), path = roads.connectedCrossingPath(way, x, y, reach);
  // (each piece's way: at its middle, off the nodes where ways meet)
  for (let k = 1; k < path.length; k++) {
    const w = roads.nearestWay((path[k - 1].x + path[k].x) / 2, (path[k - 1].y + path[k].y) / 2, 1);
    if (w !== undefined) out.add(w);
  }
  return out;
}
/** Two slip roads' ends joining a road at one point (Build → Slip road puts the second onto the first's junction,
 * SLIP_ROAD.shareJunction): one junction, a crossroads where the two come from either side, built and billed by the
 * first; the second is an arm of it (its junction lump credited), and the two change that road there as one design. */
function sharedJunctions(start: ReturnType<typeof projectStart>) {
  const { design, legacyOf, ownWorks, designedJunctions, sharedWays, ringsOf } = start;
  const formOf = (route: RouteDesign, end: 'a' | 'b') => route.alignment.kind === 'pi' ? route.alignment.controls.junctionForms?.[end] : undefined;
  const ends = design.routes.filter(isSlipRoad).flatMap(route => (['a', 'b'] as const).flatMap(end => {
    const anchor = route.endpoints[end].anchor, legacy = legacyOf.get(route.id);
    if (anchor.kind !== 'source' || !legacy) return [];
    const i = end === 'a' ? 0 : legacy.n - 1, f = legacy.footprintConflicts.find(q => q.action === 'junction' && q.i === i && !q.continuation);
    return f ? [{ route, end, legacy, i, f, sourceId: anchor.location.sourceId, s: anchor.location.s }] : [];
  }));
  const taken = new Set<typeof ends[number]>();
  for (const e of ends) {
    if (taken.has(e)) continue;
    // the ends at that point: the first (in the project's order) builds the junction, the others are its arms
    const group = ends.filter(o => !taken.has(o) && o.sourceId === e.sourceId && Math.abs(o.s - e.s) <= SLIP_ROAD.junctionTolerance
      && (o === e || o.route !== e.route));
    if (group.length < 2) continue;
    for (const o of group) taken.add(o);
    for (const o of group.slice(1)) {
      const list = ownWorks.get(o.route.id) ?? []; ownWorks.set(o.route.id, list);
      // (one junction has one form: a T and a roundabout at one point are two junctions the game does not build)
      if (formOf(o.route, o.end) !== formOf(e.route, e.end)) {
        o.legacy.violations.push({ kind: 'crossing', s0: o.legacy.s[o.i], s1: o.legacy.s[o.i], basis: 'game', title: `Shares its junction with ${e.route.name}, but not its form`,
          fix: `Set both junctions to Auto, or both to Roundabout`, rule: 'Game rule: roads sharing a junction share its form.' });
        o.legacy.valid = false;
      }
      const cost = o.f.lumpCost ?? o.f.cost;
      if (cost > 0) list.push({ kind: 'junction', s: o.legacy.s[o.i], x: o.legacy.x[o.i], y: o.legacy.y[o.i], length: 0, cost: -cost,
        label: `Shares its junction with ${e.route.name}: one crossroads, built and billed once` });
      // (a roundabout's ring is the first's: its land and houses once)
      ringsOf.delete(o.route.id);
    }
    // (the junction's works, and its changes of the road it joins, are one design of them all)
    for (const o of group) for (const q of group) if (o !== q) {
      const r = Math.max(o.f.length, q.f.length, ENDPOINT_JUNCTIONS['tie-in'].zone) + o.legacy.cell.width[o.i] / 2 + q.legacy.cell.width[q.i] / 2 + INDEPENDENCE_SCREEN.clearance;
      const zone = { x: o.legacy.x[o.i], y: o.legacy.y[o.i], r };
      const zones = designedJunctions.get(o.route.id) ?? []; designedJunctions.set(o.route.id, zones);
      zones.push({ routeId: q.route.id, ...zone });
      const shared = sharedWays.get(o.route.id) ?? []; sharedWays.set(o.route.id, shared);
      for (const way of new Set([o.f.roadId, q.f.roadId].filter((w): w is number => w !== undefined))) shared.push({ routeId: q.route.id, way, ...zone });
    }
  }
}
/** A slip road's gore on a motorway of the project, for the interchange allowance. */
interface SlipGore { corridorId: string; length: number; s: number; routeId: string; earth: number; x: number; y: number;
  /** its first metres inside the motorway's formation: there the other carriageway's slip roads' works meet it in the motorway's body */
  goreZones: { x: number; y: number; r: number }[];
  /** wherever its works come near the motorway's: there the other carriageway's slip roads' works, across the motorway, meet it in its body */
  zones: { x: number; y: number; r: number }[];
  /** its carriageway, its lane's stations along the motorway's line, exit or entry, which of its ends, its result */
  direction: 1 | -1; lane: [number, number]; kind: 'exit' | 'entry'; end: 'a' | 'b'; legacy: Result;
  /** the paired road in the player's words */
  word: string }
/** The motorway's own price already includes earth-built ramps of one interchange every 7 km (SPK, core/slip-roads.ts
 * SLIP_ROAD.allowance): the interchanges built by hand (gores within SLIP_ROAD.interchangeReach along one motorway),
 * up to that many, are credited one interchange's allowance each, at most what their slip roads build on earth,
 * shared among its slip roads by what each builds there. */
function interchangeAllowance(start: ReturnType<typeof projectStart>, gores: SlipGore[]) {
  const { ownWorks, designedJunctions, design } = start;
  // two slip roads' lanes on one carriageway overlapping: one would be built over the other (the later one's problem)
  for (let a = 0; a < gores.length; a++) for (let b = a + 1; b < gores.length; b++) {
    const p = gores[a], q = gores[b];
    if (p.corridorId !== q.corridorId || p.direction !== q.direction || !(p.lane[0] < q.lane[1] && q.lane[0] < p.lane[1])) continue;
    const later = design.routes.findIndex(r => r.id === p.routeId) > design.routes.findIndex(r => r.id === q.routeId) ? p : q, other = later === p ? q : p;
    const need = Math.ceil((Math.min(p.lane[1], q.lane[1]) - Math.max(p.lane[0], q.lane[0])) / 10) * 10, i = later.end === 'a' ? 0 : later.legacy.n - 1;
    later.legacy.violations.push({ kind: 'crossing', s0: later.legacy.s[i], s1: later.legacy.s[i], basis: 'game',
      title: `Its ${later.kind === 'exit' ? 'exit' : 'entry'} lane overlaps another slip road's ${other.kind === 'exit' ? 'exit' : 'entry'} lane`,
      fix: `Move this end at least ${need} m further along the ${later.word}, away from the other`,
      rule: 'Game rule: one speed-change lane at a time on a carriageway (a lane joining two slip roads is not built by the game)' });
    later.legacy.valid = false;
  }
  // slip roads meeting the same motorway: inside its body their works are the motorway's, not land they share
  // (on its two sides: wherever each comes near the motorway, the motorway's body lies between them)
  for (const g of gores) for (const o of gores) if (o.routeId !== g.routeId && o.corridorId === g.corridorId)
    for (const z of o.direction !== g.direction ? g.zones : g.goreZones) designedJunctions.get(g.routeId)!.push({ routeId: o.routeId, ...z });
  for (const corridorId of new Set(gores.map(g => g.corridorId))) {
    const mine = gores.filter(g => g.corridorId === corridorId).sort((p, q) => p.s - q.s);
    const groups: SlipGore[][] = [];
    for (const g of mine) { const last = groups.at(-1); if (last && g.s - last[last.length - 1].s <= SLIP_ROAD.interchangeReach) last.push(g); else groups.push([g]); }
    let left = mine[0].length / 1000 * SLIP_ROAD.allowance.perKm;
    for (const group of groups) {
      if (!(left > 0)) break;
      const share = Math.min(1, left); left -= share;
      // (each slip road counted once, though both its ends might meet the motorway); shared by what each builds on earth
      const each = new Map(group.map(g => [g.routeId, g]));
      const earth = [...each.values()].reduce((a, g) => a + g.earth, 0);
      const credit = Math.min(earth, share * SLIP_ROAD.allowance.perInterchange);
      if (!(credit > 0)) continue;
      for (const g of each.values()) if (g.earth > 0) ownWorks.get(g.routeId)!.push({ kind: 'junction', s: 0, x: g.x, y: g.y, length: 0, cost: -credit * g.earth / earth,
        label: `Already in the ${g.word}'s price: earth-built slip roads of one interchange every 7 km` });
    }
  }
}

type Unit = { route: RouteDesign; legacy: Result; members: string[]; parts: { route: RouteDesign; legacy: Result }[];
  total: number; valid: boolean; issues: ProjectIssue[] };
/** Stage 4: the priced units (a road, or a motorway corridor as one), and each road's own bill and problems
 * shown even while the project cannot be priced. */
function projectUnits(start: ReturnType<typeof projectStart>) {
  const { priced, unitOf, design, corridorCache, engineered, result, ownWorks } = start;
  // A priced unit is one road, or one motorway corridor: paired (one body published under both
  // directions) or split (two directions plus the corridor ledger that counts shared works once).
  const units: Unit[] = [];
  for (const { route, legacy } of priced) {
    const unit = units.find(p => unitOf(p.route) === unitOf(route));
    if (unit) {
      unit.members.push(route.id);
      if (unit.legacy !== legacy) {
        unit.parts.push({ route, legacy }); unit.total += legacy.cost.total; unit.valid &&= legacy.valid;
        // two directions of a motorway with separate stretches both show the shared body's problems: once
        const seen = new Set(unit.issues.map(issueKey));
        unit.issues.push(...routeIssues(route, legacy).filter(i => !seen.has(issueKey(i))));
      }
    } else units.push({ route, legacy, members: [route.id], parts: [{ route, legacy }], total: legacy.cost.total, valid: legacy.valid, issues: routeIssues(route, legacy) });
  }
  // Split corridors: shared formation, land and houses once; slopes of the two directions must not clash.
  for (const unit of units) {
    const corridor = corridorOfRoute(design, unit.route.id), evaluation = corridor && corridorCache.get(corridor.id);
    if (evaluation?.status !== 'split' || !evaluation.ledger || unit.parts.length !== 2) continue;
    const ledger = evaluation.ledger;
    unit.total -= ledger.credit; unit.valid &&= ledger.violations.length === 0;
    unit.issues.push(...routeIssues(unit.parts[0].route, { violations: ledger.violations } as Result));
  }
  // Keep each road's own bill and problems visible even while the project cannot be priced (a paired
  // corridor's one body once).
  const shown = new Set<Result>();
  // (with its own works: what a rebuilt stretch keeps, removes and reconnects, a side road's junctions)
  for (const { route, legacy } of engineered) if (!shown.has(legacy)) { shown.add(legacy);
    defineRoute(result.cost.alone, route.id, legacy.cost.total + (ownWorks.get(route.id) ?? []).reduce((t, w) => t + w.cost, 0)); }
  // a split motorway is one road: both directions show its whole bill (shared works once)
  for (const unit of units) if (unit.parts.length > 1 && corridorCache.get(corridorOfRoute(design, unit.route.id)?.id ?? '')?.status === 'split')
    for (const id of unit.members) defineRoute(result.cost.alone, id, unit.total + unit.members.flatMap(m => ownWorks.get(m) ?? []).reduce((t, w) => t + w.cost, 0));
  return { units };
}

/** Stage 5: what keeps the network from being priced: roads that touch outside a junction, the mission's
 * connections, two roads claiming the same mapped road, ends that end nowhere (`unprice` is handed on). */
function projectNetwork(ctx: ProjectEvalContext, start: ReturnType<typeof projectStart>) {
  const { result, design, designedJunctions, legacyOf, unitOf, replacements, builtJunctions } = start;
  const unprice = (routeIds: string[], reason: string) => {
    for (const routeId of routeIds) if (!result.cost.unpriced.some(u => u.routeId === routeId)) result.cost.unpriced.push({ routeId, reason });
  };
  // Every crossing/overlap between designed roads is reported on its own, whatever else is wrong.
  const corridorOf = new Map(design.corridors.flatMap(c => [[c.children.forward, c.id], [c.children.reverse, c.id]] as const));
  const surfaces = design.routes.flatMap(r => result.routes[r.id].surface ?? []);
  // where a side road joins another designed road, their meeting IS the junction (built and billed above)
  const atJunction = (c: RouteContact) => c.routeIds.some((id, k) => (designedJunctions.get(id) ?? [])
    .some(j => j.routeId === c.routeIds[1 - k] && Math.hypot(j.x - c.at.x, j.y - c.at.y) < j.r));
  for (const c of routeContacts(surfaces, (a, b) => corridorOf.has(a) && corridorOf.get(a) === corridorOf.get(b))) {
    if (atJunction(c) || storeyed(c, surfaces, design)) continue;
    // a crossing the higher-ranking road builds (bridge, its bridge over us, underpass, junction)
    if (c.kind === 'crossing' && c.routeIds.some((id, k) => (legacyOf.get(id)?.crossings ?? [])
      .some(x => x.crossedRoute && (corridorOf.get(x.crossedRoute.id) ?? x.crossedRoute.id) === (corridorOf.get(c.routeIds[1 - k]) ?? c.routeIds[1 - k])
        && Math.hypot(x.x - c.at.x, x.y - c.at.y) < 30))) continue;
    result.issues.push(contactIssue(c)); unprice(c.routeIds, contactIssue(c).code);
  }
  const missionRoutes = design.routes.filter(r => r.role === 'mission' && unitOf(r) === r.id || design.corridors.some(c => c.children.forward === r.id && r.role === 'mission'));
  if (design.mission.connections.length && missionRoutes.length !== 1) {
    result.issues.push(issue(missionRoutes[0]?.id ?? '', 'mission-needs-network'));
    unprice(missionRoutes.map(r => r.id), 'mission-needs-network');
  }
  // Joined roads share a junction nobody has checked yet.
  const joined = new Set<string>();
  // Only the mission road's own mission ports and free ends are evaluated as the legacy kernel does,
  // and a side road's end on an existing ground road whose junction it builds and bills (C1 a). A tie-in
  // to another designed road, a mission port or a rebuilt stretch's connections are not built yet.
  // A rebuilt railway stretch continues its old track at its ends: checked by its kernel (no corner sharper
  // than a turnout, heights tied to the old track's). A railway branching off it keeps its switch where the
  // new line stays on the old track there (kept as it is); a branch the new line has left needs new switches.
  const railJoin = (c: ProjectDesign['connections'][number]) => {
    if (c.kind !== 'continuation' || !ctx.railPaths) return false;
    const port = c.ports.find(p => p.kind === 'route'), route = port && design.routes.find(r => r.id === port.routeId);
    const own = route && legacyOf.get(route.id);
    if (!port || !route || route.kind !== 'railway' || !route.source || !own || c.ports.some(p => p.kind === 'route' && p.routeId !== route.id)) return false;
    const ends = [route.endpoints.a.position, route.endpoints.b.position];
    if (ends.some(e => Math.hypot(e.x - c.position.x, e.y - c.position.y) < 1e-6)) return true;
    const kept = own.keptCells; if (!kept) return false;
    const k = nearestStation(own, c.position.x, c.position.y);
    return Math.hypot(own.x[k] - c.position.x, own.y[k] - c.position.y) <= own.ds && [k - 1, k, k + 1].every(q => kept[Math.max(0, Math.min(own.n - 1, q))]);
  };
  for (const c of design.connections) {
    const routes = c.ports.flatMap(p => p.kind === 'route' ? [p.routeId] : []);
    // a rebuilt stretch's own continuations and side roads are its replacement works
    if (routes.length && routes.every(id => id === routes[0] && replacements.has(id))) continue;
    if (railJoin(c)) continue;
    for (const id of routes.length ? routes : design.routes.map(r => r.id)) joined.add(id);
  }
  // Two changes claiming the same stretch of one old road cannot both replace it.
  const claims = design.routes.flatMap(r => (r.source?.intervals ?? []).map(i => ({ id: r.id, i })));
  for (let x = 0; x < claims.length; x++) for (let y = x + 1; y < claims.length; y++) {
    const p = claims[x], q = claims[y];
    if (p.id !== q.id && p.i.sourceId === q.i.sourceId && p.i.s0 < q.i.s1 && q.i.s0 < p.i.s1) {
      result.issues.push(issue(p.id, 'conflicting-source-claim')); unprice([p.id, q.id], 'conflicting-source-claim');
    }
  }
  for (const r of design.routes) for (const [end, e] of [['a', r.endpoints.a], ['b', r.endpoints.b]] as const) {
    if (e.anchor.kind === 'free' || (e.anchor.kind === 'mission' && r.role === 'mission')) continue;
    if (e.anchor.kind === 'source' && (builtJunctions.has(`${r.id}:${end}`) || replacements.has(r.id))) continue;
    // (a rebuilt railway's end on its old track: checked as its continuation above)
    if (e.anchor.kind === 'source' && r.kind === 'railway' && r.source && legacyOf.has(r.id) && ctx.railPaths) continue;
    if (e.anchor.kind === 'route' && builtJunctions.has(`${r.id}:${end}`)) continue;
    joined.add(r.id); if (e.anchor.kind === 'route') joined.add(e.anchor.routeId);
  }
  if (joined.size) {
    const rail = [...joined].every(id => design.routes.find(r => r.id === id)?.kind === 'railway');
    result.issues.push(junctionsPending([...joined], rail)); unprice([...joined], 'connection-pending');
  }
  // A new road that ends nowhere is not valid: every end must reach a road or a scenario end. It is priced as
  // built (it is the player's problem, not something the engine cannot price; nothing is built at the free end).
  // (A motorway's ends wait for interchanges: that issue already says so, unpriced: an engine limit.)
  const nowhere: ProjectIssue[] = [];
  for (const r of design.routes) if (r.role !== 'mission' && ROUTE_KINDS[r.kind].endsNowhere) for (const end of ['a', 'b'] as const) {
    const e = r.endpoints[end]; if (e.anchor.kind !== 'free') continue;
    nowhere.push(endsNowhere(r.id, r.kind === 'railway', end === 'a' ? 0 : legacyOf.get(r.id)?.length ?? 0, { x: e.position.x, y: e.position.y }));
  }
  if (!design.routes.length) result.issues.push(issue('', 'network-accounting-pending'));
  return { unprice, nowhere };
}

/** Stage 6, several roads: the screen of whether anything one builds, buys, closes or makes loud reaches another. */
function projectScreen(ctx: ProjectEvalContext, start: ReturnType<typeof projectStart>, grouped: ReturnType<typeof projectUnits>) {
  const { design, designedJunctions, replacements } = start;
  const { units } = grouped;
  // Several roads: add their bills ONLY when nothing one builds, buys, closes or makes loud reaches another.
  // A rebuilt stretch continues its old road where another road changes the rest of it (cuts, reroutes,
  // relocates it): the two roads' works meet at that end, as at a junction between them.
  const ownWayOf = (r: RouteDesign) => r.source ? ctx.sourceWays?.get(r.source.intervals[0]?.sourceId ?? '') : undefined;
  // what is left of its old road beyond a rebuilt stretch: a way of its own in every edited network
  // (project-roadnet.ts rebuiltSlots), which other roads cross and change under that number
  const remnantOf = (r: RouteDesign) => { const q = rebuiltSlots(design).indexOf(r);
    return q >= 0 && ctx.legacy.roads && ownWayOf(r) !== undefined ? ctx.legacy.roads.wayCount + designedSlots(design).length + q : undefined; };
  const changes = (res: Result, way: number) => res.crossings.some(c => c.roadId === way || c.targetRoadId === way)
    || res.footprintConflicts.some(f => f.roadId === way || f.sourceIntervals?.some(i => i.way === way));
  // So does any road's end on an old road another road changes: the end ties into what is left of it.
  const endWays = (route: RouteDesign, legacy: Result, i: number) => {
    const s = legacy.s[i], end = i ? route.endpoints.b : route.endpoints.a, own = ownWayOf(route);
    const anchored = end.anchor.kind === 'source' ? ctx.sourceWays?.get(end.anchor.location.sourceId) : undefined;
    // (and the ways its old road meets just beyond the end, where it stopped short of another road's works)
    const roads = ctx.legacy.roads, beyond: number[] = [];
    let past: { x: number; y: number }[] = [];
    if (roads && anchored !== undefined) {
      const d = roads.wayStation(anchored, legacy.x[i], legacy.y[i]), other = i ? route.endpoints.a.position : route.endpoints.b.position;
      const up = roads.wayStation(anchored, other.x, other.y) < d, zone = ENDPOINT_JUNCTIONS.continuation.zone;
      past = roads.wayPath(anchored, up ? d : d - zone, up ? d + zone : d);
      for (const p of past) beyond.push(...roads.connections(p, 0.5).map(c => c.way));
    }
    const remnant = remnantOf(route);
    return { ways: [...own !== undefined ? [own] : [], ...remnant !== undefined ? [remnant] : [], ...anchored !== undefined ? [anchored] : [], ...beyond,
      ...ctx.legacy.roads?.connections({ x: legacy.x[i], y: legacy.y[i] }, 0.5).map(c => c.way) ?? [],
      ...legacy.crossings.filter(c => c.type === 'junction' && c.roadId !== undefined && Math.abs(c.s - s) <= ENDPOINT_JUNCTIONS.continuation.zone).map(c => c.roadId!)],
      past };
  };
  /** Does the other road's earthworks (with the clearance between two roads' works) reach the old road
   * just beyond this end? The stretch stopped short of them there: what is left of it is under their works. */
  const reaches = (other: Result, points: readonly { x: number; y: number }[]) => points.some(p => {
    const k = nearestStation(other, p.x, p.y);
    return Math.hypot(other.x[k] - p.x, other.y[k] - p.y) <= Math.max(other.cell.width[k] / 2, Math.abs(other.dayL[k]), Math.abs(other.dayR[k])) + INDEPENDENCE_SCREEN.clearance;
  });
  for (const { route, legacy } of units) {
    for (const other of units) if (other.route !== route) for (const i of [0, legacy.n - 1]) {
      const end = endWays(route, legacy, i);
      if (!end.ways.some(way => changes(other.legacy, way)) && !(route.source && reaches(other.legacy, end.past.slice(1)))) continue;
      let j = designedJunctions.get(route.id); if (!j) designedJunctions.set(route.id, j = []);
      // (the stretch stops a working strip short of the other road's earthworks; its own earthworks and the
      // ties of its end to what is left of the old road and the ways meeting it there)
      j.push({ routeId: other.route.id, x: legacy.x[i], y: legacy.y[i], r: legacy.cell.width[i] / 2 + 2 * INDEPENDENCE_SCREEN.clearance + ENDPOINT_JUNCTIONS.continuation.zone });
    }
  }
  const screen = screenIndependence(units.map(({ route, legacy }) => {
    const spec = route.specification, corridor = corridorOfRoute(design, route.id);
    const op = corridor ? corridorOperations(design, corridor) : ROUTE_KINDS[route.kind].operations(route);
    // (a railway its formation's; a road kept at its mapped width: unknown, fails closed)
    const halfWidth = corridor || (spec.kind === 'road' && spec.crossSection !== 'existing') || route.kind === 'railway' ? crownOf(route) / 2 : Infinity;
    // (a rebuilt stretch's old road is cut out of every other road's network: what is left of it is
    // another road, which a road crossing it changes on its own)
    const ownWay = ownWayOf(route);
    return { routeId: route.id, result: legacy, aadt: op.aadt, speed: op.speed, heavyShare: op.heavyShare, halfWidth, ...(route.kind === 'railway' ? { railway: true } : {}), ...(ownWay !== undefined ? { ownWays: [ownWay, ...remnantOf(route) !== undefined ? [remnantOf(route)!] : []] } : {}),
      ...(corridor && CATEGORIES[motorwayCategory(route as Extract<RouteDesign, { kind: 'motorway' }>)].motorwayByLaw ? { profile: 'motorway' as const } : {}),
      ...(designedJunctions.has(route.id) ? { junctions: designedJunctions.get(route.id) } : {}),
      ...(start.sharedWays.has(route.id) ? { sharedWays: start.sharedWays.get(route.id) } : {}),
      // its other works on the ground: the links that reconnect side roads. (The old road where it is
      // removed is land given back: another road's works over it share nothing with this road; where the
      // old road crossed another road's line, that road was already built over or under it.)
      ...(replacements.has(route.id) ? { extraLines: [
        ...replacements.get(route.id)!.works.filter(w => w.kind === 'reconnection' && w.length > 1).map(w => {
          const n = nearestStation(legacy, w.x, w.y); return { ax: w.x, ay: w.y, bx: legacy.x[n], by: legacy.y[n], r: (ROAD_CLASSES[w.cls ?? '']?.width ?? 6.5) / 2 };
        })] } : {}) };
  }), ctx.legacy.buildings);
  return { screen };
}

/** Stage 7: what the roads decide together (houses heard by several roads, houses under two roads' works: one
 * payer) and what is left `blocking` a price. */
function projectDecisions(ctx: ProjectEvalContext, yields: Map<string, KeepClear> | undefined, screened: ReturnType<typeof projectScreen>, grouped: ReturnType<typeof projectUnits>, start: ReturnType<typeof projectStart>) {
  const { screen } = screened;
  const { units } = grouped;
  const { design, result, ownWorks } = start;
  // Houses heard by two or more roads are decided together from both roads' own sources; every other
  // interaction (shared land, roads, buildings) still keeps the project unpriced.
  const heard = screen.interactions.filter(i => i.reason === 'shared-noise' && i.buildingIndex !== undefined);
  const heardRoutes = units.flatMap(u => u.parts).map(({ route, legacy }) => ({ route, result: legacy }));
  const builtIn = heard.length && ctx.legacy.buildings && !ctx.combinedNoise
    ? finiteSegmentDecider(heardRoutes.map(({ route, result }) => ({ routeId: route.id, result, wallOverrides: wallChoices(design, route) })),
      ctx.legacy.buildings, (x, y) => ctx.legacy.terrain.heightAt(x, y)) : null;
  const decider = heard.length && ctx.legacy.buildings ? builtIn ?? ctx.combinedNoise?.(heardRoutes) ?? null : null;
  // A house two roads take (under one, bought out by another, …) is taken once: by a road that demolishes
  // it (the higher-ranking one if several do; else the higher-ranking buyer) and billed there; the others'
  // bills for it are credited. A house a road keeps in its way stays the player's to settle.
  const takenBy = (id: string, j: number) => { const r = result.routes[id]?.legacy; if (!r) return null;
    const d = r.demolished.find(b => b.j === j); if (d) return { cost: d.cost, demolish: true };
    const b = r.boughtOut.find(q => q.j === j); return b ? { cost: b.cost, demolish: false } : null; };
  const routeOf = (id: string) => design.routes.find(r => r.id === id)!;
  const takenTogether = screen.interactions.filter(i => i.reason === 'shared-building' && i.buildingIndex !== undefined
    && i.routeIds.every(id => takenBy(id, i.buildingIndex!) && !result.routes[id]!.legacy!.kept.some(k => k.j === i.buildingIndex && k.hit)));
  const housePayer = new Map<number, string>();
  for (const i of takenTogether) {
    const j = i.buildingIndex!, demolishers = i.routeIds.filter(id => takenBy(id, j)!.demolish);
    const payer = (demolishers.length ? demolishers : i.routeIds).reduce((a, b) => outranks(design, routeOf(b), routeOf(a)) ? b : a);
    housePayer.set(j, payer);
    const b = ctx.legacy.buildings?.items[j];
    for (const id of i.routeIds) if (id !== payer) {
      const r = result.routes[id]!.legacy!, k = b ? nearestStation(r, b[0], b[1]) : 0, route = routeOf(id);
      const work: ReplacementWork = { kind: 'buyout', s: r.s[k], x: b?.[0] ?? r.x[k], y: b?.[1] ?? r.y[k], length: 0, cost: -takenBy(id, j)!.cost,
        label: `House ${ownerName(routeOf(payer))} takes as well: billed there once` };
      let list = ownWorks.get(id); if (!list) ownWorks.set(id, list = []);
      list.push(work);
      result.works.items.push({ ...replacementWork(route, list.length - 1, work), id: `${id}:house:${j}` });
    }
  }
  const blocking = screen.interactions.filter(i => !(decider && heard.includes(i)) && !takenTogether.includes(i));
  if (yields) for (const i of blocking) for (const y of i.yields ?? []) yields.set(y.routeId, [...yields.get(y.routeId) ?? [], ...y.keepClear]);
  return { heard, builtIn, decider, housePayer, blocking };
}

/** Stage 8: the houses decided together (walls, buy-outs), each unit's share of the bill, the receivers;
 * returns the total and whether the project is valid. */
function projectTotals(ctx: ProjectEvalContext, between: ReturnType<typeof projectDecisions>, start: ReturnType<typeof projectStart>, grouped: ReturnType<typeof projectUnits>) {
  const { decider, heard, builtIn, housePayer } = between;
  const { priced, ringsOf, ownWorks, design, result } = start;
  const { units } = grouped;
  let valid = true;
  // houses already gone: under a road, bought by it, or on a roundabout's ring; the player's Keep is never bought
  const together = decider ? combineNoise(heard.map(i => i.buildingIndex!), decider, ctx.legacy.buildings!,
    new Set([...priced.flatMap(({ legacy }) => [...legacy.demolished, ...legacy.boughtOut].map(b => b.j)),
      ...[...ringsOf.values(), ...ownWorks.values()].flatMap(ws => ws.flatMap(w => w.removes ?? []))]),
    new Set(design.buildingOverrides.filter(o => o.action === 'keep').map(o => o.j))) : [];
  for (const h of together) {
    if (h.over !== undefined && h.over > 0) {
      // a house the player keeps that no single wall brings within the limit: a violation of the road that prevails
      const b = ctx.legacy.buildings!.items[h.buildingIndex], r = result.routes[h.prevailing]?.legacy, at = { x: b[0], y: b[1] };
      const s = r ? r.s[nearestStation(r, b[0], b[1])] : 0;
      result.issues.push({ code: 'noise', blocking: 'invalid', check: 'violation', scope: { routeIds: h.sources.map(q => q.routeId), buildingIndex: h.buildingIndex },
        locations: r ? [{ routeId: h.prevailing, s0: s, s1: s }] : [], at,
        violation: { kind: 'noise', basis: 'norm', title: 'Too loud with both roads together',
          fix: 'Buy the house out, or build a higher or longer noise wall in front of it',
          detail: `${(h.over).toFixed(1)} dB over the limit at its loudest floor, with the noise of both roads added together. You chose to keep it.`,
          rule: 'NV 272/2011 annex 3: the noise of all roads at a protected house adds up; the limit of the road that prevails there applies' } }); // research/31
      valid = false;
      continue;
    }
    const owner = h.wall?.routeId ?? h.buyout?.routeId; if (!owner) continue;
    const p = priced.find(q => q.route.id === owner)!, r = p.legacy, b = ctx.legacy.buildings!.items[h.buildingIndex];
    const k = nearestStation(r, b[0], b[1]);
    let list = ownWorks.get(owner); if (!list) ownWorks.set(owner, list = []);
    const work: ReplacementWork = h.wall
      ? { kind: 'noise-wall', s: r.s[k], x: b[0], y: b[1], length: h.wall.length, cost: h.wall.cost,
        label: `Noise wall ${h.wall.height} m, ${Math.round(h.wall.length)} m long, for noise from both roads` }
      : { kind: 'buyout', s: r.s[k], x: b[0], y: b[1], length: 0, cost: h.buyout!.cost, label: 'House bought out: too loud with both roads together' };
    list.push(work);
    result.works.items.push({ ...replacementWork(p.route, list.length - 1, work), id: `${owner}:noise:${h.buildingIndex}` });
  }
  // the project's walls and buyouts are drawn and shown with each road's own (a copy of its result: the
  // kernel's stays as computed); its walls are redrawn from the final heights
  for (const [routeId, w] of builtIn?.walls() ?? []) {
    const rr = result.routes[routeId], r = rr?.legacy; if (!r) continue;
    rr.legacy = { ...r, noise: { ...r.noise, L: w.L, R: w.R }, walls: [...wallStretches(r.ds, r.length, w.L, 'L'), ...wallStretches(r.ds, r.length, w.R, 'R')] };
  }
  for (const h of together) if (h.decision === 'buy') {
    const rr = result.routes[h.buyout!.routeId], r = rr?.legacy, b = ctx.legacy.buildings!.items[h.buildingIndex]; if (!r) continue;
    rr.legacy = { ...r, boughtOut: [...r.boughtOut, { j: h.buildingIndex, i: nearestStation(r, b[0], b[1]), cost: h.buyout!.cost }] };
  }
  let total = 0;
  const receivers: ProjectReceiver[] = [];
  for (const unit of units) {
    // its own bill plus its own works (junctions, a rebuilt stretch's removal and reconnections, …)
    const works = unit.members.flatMap(id => ownWorks.get(id) ?? []), own = unit.total + works.reduce((t, w) => t + w.cost, 0);
    for (const id of unit.members) {
      const rr = result.routes[id];
      rr.complete = true; rr.valid = unit.valid; rr.accepted = unit.valid; rr.attributedCost = unit.members.length > 1 ? null : own;
    }
    if (unit.members.length > 1) result.cost.shared += own; else defineRoute(result.cost.routes, unit.route.id, own);
    total += own; valid &&= unit.valid;
    for (const item of result.works.items) if (unit.members.includes(item.owner.id)) item.accepted = true;
    result.issues.push(...unit.issues);
    const outcomes = unit.parts.map(p => routeOutcome(ctx, design, p.route, p.legacy));
    result.buildings.push(...mergeBuildings(outcomes.flatMap(o => o.buildings)));
    receivers.push(...mergeReceivers(outcomes.flatMap(o => o.receivers), true));
  }
  result.receivers = mergeReceivers(receivers, false);
  // a house decided together: its combined level per the project's decision (energy sum, prevailing limit)
  for (const h of together) {
    const k = result.receivers.findIndex(r => r.buildingIndex === h.buildingIndex), seen = result.receivers[k];
    const decided: ProjectReceiver = { buildingIndex: h.buildingIndex, height: seen?.height ?? NOISE.receiverHeight,
      contributions: h.sources.map(s => { const at = s.storeys[h.storey];
        return { sourceId: s.sourceId, routeId: s.routeId, buildingIndex: h.buildingIndex, height: at?.height ?? NOISE.receiverHeight,
          dayEnergy: at?.rawDay ?? 0, nightEnergy: at?.rawNight ?? 0, policy: 'combined', storeys: s.storeys.map(q => ({ ...q })) }; }),
      dayDb: h.dayDb, nightDb: h.nightDb, dayLimit: h.dayLimit, nightLimit: h.nightLimit, action: h.decision === 'buy' ? 'buy' : 'retain',
      together: { prevailing: h.prevailing, decision: h.decision, storey: h.storey,
        ...(h.wall ? { wall: { routeId: h.wall.routeId, height: h.wall.height, length: h.wall.length, cost: h.wall.cost } } : {}),
        ...(h.buyout ? { buyout: { ...h.buyout } } : {}), ...(h.over !== undefined ? { over: h.over } : {}) } };
    if (k >= 0) result.receivers[k] = decided; else result.receivers.push(decided);
    if (h.decision === 'buy') result.buildings.push({ buildingIndex: h.buildingIndex, action: 'buy', cost: h.buyout!.cost, routeId: h.buyout!.routeId });
  }
  result.buildings = mergeBuildings(result.buildings).map(b => housePayer.has(b.buildingIndex) ? { ...b, routeId: housePayer.get(b.buildingIndex)! } : b);
  return { valid, total };
}

function evaluateProjectOnce(ctx: ProjectEvalContext, snapshot: ProjectSnapshot, keepClear: ReadonlyMap<string, KeepClear>,
  yields?: Map<string, KeepClear>): ProjectResult {
  const start = projectStart(ctx, snapshot, keepClear);
  const { design, result, engineered, ownWorks } = start;
  projectRoutes(ctx, snapshot, start);
  const taken = projectTakenUp(ctx, start);
  projectWorks(ctx, start);
  const grouped = projectUnits(start);
  const { units } = grouped;
  const network = projectNetwork(ctx, start);
  const { unprice } = network;
  // a house a dead end cut back was the only road to: the billing road's unit is not valid
  for (const i of taken) {
    const unit = units.find(u => u.members.includes(i.scope.routeIds[0]));
    if (unit) { unit.issues.push(i); unit.valid = false; } else result.issues.push(i);
  }
  // a road that ends nowhere: its unit is priced and not valid (a road not priced for another reason: listed)
  for (const i of network.nowhere) {
    const unit = units.find(u => u.members.includes(i.scope.routeIds[0]));
    if (unit) { unit.issues.push(i); unit.valid = false; } else result.issues.push(i);
  }
  const finish = () => {
    // priced units' issues (incl. a split corridor's ledger), and every other engineered road's own problems
    const listed = new Set<Result>();
    for (const unit of units) { result.issues.push(...unit.issues); for (const p of unit.parts) listed.add(p.legacy); }
    for (const { route, legacy } of engineered) if (!listed.has(legacy)) { listed.add(legacy); result.issues.push(...routeIssues(route, legacy)); }
    // Not priced withholds the total, the verdict and decisions between roads: never what each road
    // physically does. Houses under a road's works are gone, its own buy-outs stand (a paired corridor's
    // one body once).
    const own = new Set<Result>();
    result.buildings = mergeBuildings(engineered.flatMap(({ route, legacy }) => own.has(legacy) ? [] : (own.add(legacy), ownBuildings(route, legacy))));
    return result;
  };
  if (result.cost.unpriced.length || result.issues.length) return finish();
  if (units.length === 1 && !ownWorks.size) {
    // Compatibility facade. One kernel bill and one physical source; never several bills added up.
    const { route, members, total, valid } = units[0];
    for (const id of members) {
      const rr = result.routes[id];
      rr.complete = true; rr.valid = valid; rr.accepted = valid; rr.attributedCost = members.length > 1 ? null : total;
    }
    result.complete = true; result.valid = valid; result.cost.total = total;
    // A corridor's common formation is shared work of both directions, not two attributed bills.
    if (members.length > 1) result.cost.shared = total; else defineRoute(result.cost.routes, route.id, total);
    result.issues = units[0].issues;
    const outcomes = units[0].parts.map(p => routeOutcome(ctx, design, p.route, p.legacy));
    result.buildings = mergeBuildings(outcomes.flatMap(o => o.buildings));
    result.receivers = mergeReceivers(outcomes.flatMap(o => o.receivers), true);
    // Legacy's all-height screen excludes only sub-limit receivers. One physical source means
    // that bound is sufficient; it is NOT a valid aggregate screen for two or more sources.
    result.acousticScreen = { bounds: [], omittedDayEnergyUpperBound: dm.pow(10, NOISE.limitDayDb / 10),
      omittedNightEnergyUpperBound: dm.pow(10, NOISE.limitNightDb / 10), complete: true };
    return result;
  }
  const screened = projectScreen(ctx, start, grouped);
  const { screen } = screened;
  const between = projectDecisions(ctx, yields, screened, grouped, start);
  const { blocking } = between;
  if (blocking.length) {
    // one line per thing the roads share, with its place; the houses that hear the same roads are one line
    const heardBy = new Map<string, number>();
    for (const i of blocking) if (i.reason === 'shared-noise') { const key = i.routeIds.join('|'); heardBy.set(key, (heardBy.get(key) ?? 0) + 1); }
    const listed = new Set<string>();
    for (const i of blocking) {
      unprice(i.routeIds, i.reason);
      const key = i.routeIds.join('|');
      if (i.reason === 'shared-noise') { if (listed.has(key)) continue; listed.add(key); }
      const b = i.buildingIndex !== undefined ? ctx.legacy.buildings?.items[i.buildingIndex] : undefined, at = i.at ?? (b ? { x: b[0], y: b[1] } : undefined);
      const locations = at ? i.routeIds.flatMap(routeId => {
        const legacy = result.routes[routeId]?.legacy; if (!legacy) return [];
        const s = legacy.s[nearestStation(legacy, at.x, at.y)]; return [{ routeId, s0: s, s1: s }];
      }) : [];
      result.issues.push(interactionIssue(i, at, locations, heardBy.get(key)));
    }
    return finish();
  }
  const totals = projectTotals(ctx, between, start, grouped);
  const { valid, total } = totals;
  result.cost.total = total; result.complete = true; result.valid = valid;
  result.acousticScreen = { bounds: [], omittedDayEnergyUpperBound: screen.omittedDayEnergy,
    omittedNightEnergyUpperBound: screen.omittedNightEnergy, complete: true };
  return result;
}

/** The player's wall choices on a road (its Design's), which the project's walls never change. */
function wallChoices(design: ProjectDesign, route: RouteDesign) {
  try { return legacyDesignForRoute(design, route.id).wallOverrides; } catch { return undefined; }
}
const nearestStation = (r: Result, x: number, y: number) => {
  let best = Infinity, i = 0;
  for (let k = 0; k < r.n; k++) { const d = Math.hypot(r.x[k] - x, r.y[k] - y); if (d < best) { best = d; i = k; } }
  return i;
};
/** Cost parts of a side road that the joined road's body already provides where they overlap. Structures,
 * buildings, noise and crossings stay the side road's own. */
const SHARED_PARTS = ['roadBase', 'excavation', 'fillPlacing', 'haul', 'surplusHaul', 'unsuitable', 'borrow', 'topsoil', 'geotechnical',
  'surcharge', 'land', 'forest'] as const;
/** One replacement work in the shared ledger, owned and paid by its rebuilt road. */
function replacementWork(route: RouteDesign, k: number, w: Replacement['works'][number]): SharedWork {
  return { id: `${route.id}:${w.kind}:${k}`, owner: { kind: 'route', id: route.id }, participants: [route.id],
    kind: w.kind === 'removal' || w.kind === 'kept' ? 'formation' : w.kind === 'land' ? 'land' : w.kind === 'noise-wall' ? 'noise' : w.kind === 'buyout' ? 'property' : 'connection', surfaces: [], claims: w.kind === 'removal' || w.kind === 'land' || w.kind === 'kept' ? (route.source?.intervals ?? []).map(i => ({ ...i })) : [],
    geometry: { meshes: [], terrainMasks: [], measurements: [{ id: `${route.id}:${w.kind}:${k}:length`, meshIds: [], quantity: w.length, unit: 'm' }] },
    cost: w.cost, dependencies: [], accepted: false, label: w.label, at: { x: w.x, y: w.y, s: w.s }, ...(w.removes ? { removes: [...w.removes] } : {}),
    ...(w.lines ? { surfaces: w.lines.map(l => ({ routeId: route.id, revision: route.revision, points: l.map(p => ({ ...p, s: 0, halfWidth: p.halfWidth ?? SLIP_ROAD.marking.width / 2, structure: 'ground' as const })) })) } : {}) };
}

/** Where a higher-ranking road's crossing holds a designed road: a grade band at that point of its line. */
interface Hold { x: number; y: number; min: number; max: number; owner: RouteDesign; crossing: CrossingResult;
  /** above the owner's bridge, on its own bridge (CrossingResult.above), not under it */
  over?: true;
  /** the owner's grade where they cross, m */
  z: number;
  /** on its bridge over the owner: half the deck's length along the held road */
  deck?: number;
  /** on its bridge over the owner: the deck's two ends, held at the deck's own height there */
  deckEnds?: { x: number; y: number; z: number }[];
  /** what the owner bills for building the held road here (its deck and ramps, with their surcharge), CZK:
   * taken off the held road's own bill, which draws and prices that stretch itself */
  billed?: number }
type HeldBand = { s: number; min: number; max: number };
/** A hold on the line the held road is built on: its station there (its deck's span and ends). */
const placedHold = (h: Hold, line: readonly number[]): HeldBand & { bridge?: [number, number]; ends?: HeldBand[] } => {
  const s = lineStation(line, h.x, h.y);
  return { s, min: h.min, max: h.max, ...(h.deck !== undefined ? { bridge: [Math.max(0, s - h.deck), s + h.deck] as [number, number] } : {}),
    ...(h.deckEnds ? { ends: h.deckEnds.map(e => ({ s: lineStation(line, e.x, e.y), min: e.z - HOLD_TOLERANCE, max: e.z + HOLD_TOLERANCE })) } : {}) };
};
/** EvalOptions.holds of one placed hold: the crossing itself (with its deck's span), then its deck's ends. */
const heldBands = ({ s, min, max, bridge, ends }: ReturnType<typeof placedHold>): NonNullable<EvalOptions['holds']>[number][] =>
  [{ s, min, max, ...(bridge ? { bridge } : {}) }, ...ends ?? []];
/** Along the owner, how far around a crossing its earthworks belong to that crossing, m (MODELLING ASSUMPTION:
 * the 150 m crossing billing margin, CROSSING_RULES.endMargin). */
const ZONE_ALONG = 150;
/** |sin| of the angle between the owner and the crossed road's plan line at the crossing. */
function crossingSine(own: Result, c: CrossingResult, line: readonly number[], s: number): number {
  const k = Math.max(0, Math.min(own.n - 2, c.i)), ox = own.x[k + 1] - own.x[k], oy = own.y[k + 1] - own.y[k];
  // (the line's segment through the crossing: its samples are about 5 m apart, nearer where it is drawn on its old road)
  let j = Math.max(0, Math.min(line.length / 2 - 2, Math.round(s / 5))) * 2, gap = Infinity;
  for (let q = Math.max(0, j - 8); q + 3 < line.length && q <= j + 8; q += 2) {
    const dx = line[q + 2] - line[q], dy = line[q + 3] - line[q + 1], l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((c.x - line[q]) * dx + (c.y - line[q + 1]) * dy) / l2)), d = Math.hypot(c.x - line[q] - t * dx, c.y - line[q + 1] - t * dy);
    if (d < gap) { gap = d; j = q; }
  }
  const lx = line[j + 2] - line[j], ly = line[j + 3] - line[j + 1];
  return Math.abs(ox * ly - oy * lx) / (Math.hypot(ox, oy) * Math.hypot(lx, ly) || 1);
}
const HOLD_TOLERANCE = 0.5; // m, as a grade pin (GRADE_PIN_TOLERANCE)
/** PROVISIONAL game tolerance, m: how far a crossed road's rounded profile may still miss the band its
 * crossing holds (the crossing's own ramps carry it the rest of the way). */
const HOLD_SLACK = 0.5;
/** `at`: where the crossing lies now when the held road's line moved since the owner built it (a preview). */
function holdAt(owner: RouteDesign, own: Result, c: CrossingResult, line: readonly number[], ground: number,
  at: { x: number; y: number; i: number } = c): Hold | null {
  if (line.length < 4) return null;
  const z = own.grade[at.i];
  const band = (min: number, max: number): Hold => ({ x: at.x, y: at.y, min, max, owner, crossing: c, z });
  switch (c.type) {
    // under our bridge: low enough for the clearance the bridge was built with; or high above it on its own
    // bridge (where both cross a valley on bridges: overBridge)
    case 'bridge': return c.above ? { ...band(z + clearOver(owner), Infinity), over: true }
      : band(-Infinity, z - (ROAD_CLASSES[c.cls]?.noAtGrade ? STRUCTURE_RULES.railClearance : CROSSING_RULES.overHeight));
    // (through a box lowered under our road its ramps are the crossing's, billed by the owner, while the held
    // road stays at the ground: PLAN.md "Known issues", a lowered box under a designed road)
    case 'underpass': return band(ground - HOLD_TOLERANCE, ground + HOLD_TOLERANCE);
    case 'overbridge': {
      // on its bridge over us: the deck's height where it crosses our centreline
      const road = c.geometry?.road; if (!road?.length) return null;
      // (at least clear of the owner by its clearance: over a railway or motorway more than the crossing engine's
      // deck over a road leaves; the held line climbs the rest on its own line)
      const lift0 = z - own.grade[c.i], deck0 = road.reduce((p, q) => Math.abs(q.d ?? Infinity) < Math.abs(p.d ?? Infinity) ? q : p).z + lift0;
      const lift = lift0 + Math.max(0, z + clearOver(owner) - deck0), deck = deck0 + lift - lift0;
      // the deck is the owner's: the held road is on it from end to end (where the crossing moved since the
      // owner built it, a preview, its deck moves with it)
      const span = c.geometry?.deck, dx = at.x - c.x, dy = at.y - c.y;
      const ends = span && road[span.start] && road[span.end]
        ? [road[span.start], road[span.end]].map(p => ({ x: p.x + dx, y: p.y + dy, z: p.z + lift })) : undefined;
      // its own deck over our road: the span is measured along the crossed road already
      // (high above that deck on the full evaluation: over us on that bridge built higher, overBridge)
      if (c.above) return { ...band(z + clearOver(owner), Infinity), over: true, deck: (c.span ?? 0) / 2, billed: heldBodyBilled(owner, own, c) };
      return { ...band(deck - HOLD_TOLERANCE, deck + HOLD_TOLERANCE), deck: (c.span ?? 0) / 2, ...(ends ? { deckEnds: ends } : {}),
        billed: heldBodyBilled(owner, own, c) };
    }
    case 'junction': case 'atGrade': return band(z - HOLD_TOLERANCE, z + HOLD_TOLERANCE);
    default: return null; // over our tunnel: free
  }
}
/** What the owner bills for a crossing's copy of the held road on its bridge over us, which the held road
 * draws and prices itself: the deck and ramps with their surcharge (not the side roads it regrades, its walls
 * or the houses it takes, which the owner draws), CZK. */
function heldBodyBilled(owner: RouteDesign, own: Result, c: CrossingResult): number {
  const cat = routeCategory(owner), u = own.cell.urban[c.i] ?? 0;
  const rate = cat === 'existing' ? surchargeRate(u) : structureSurcharge(CATEGORIES[cat], u);
  return Math.max(0, c.cost - (c.worksCost ?? 0) - (c.houseCost ?? 0)) * (1 + rate);
}
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const ownerName = (r: RouteDesign) => r.role === 'mission' ? `our ${routeWord(r)}` : r.name;
/** How far a road passing over the owner's bridge on its own bridge stays above the owner's grade, m: the
 * clearance over a road (CROSSING_RULES.overHeight), over a railway or motorway STRUCTURE_RULES.railClearance. */
const clearOver = (owner: RouteDesign) => ROUTE_KINDS[owner.kind].clearanceOver;
/** The held road's grade at station s, m. */
function gradeAt(r: Result, s: number): number {
  const k = Math.max(0, Math.min(r.n - 2, Math.floor(s / r.ds))), t = (s - r.s[k]) / r.ds;
  return r.grade[k] + (r.grade[k + 1] - r.grade[k]) * t;
}
/** A held road that stays high above the owner's bridge where it crosses (both cross a valley on bridges)
 * passes over that bridge on its own bridge: held above it instead of under it. One that stays high above
 * the deck the owner's crossing set for it over the owner (a railway that cannot dip to it, a road on its own
 * embankment) passes over the owner on that bridge built higher: held at least clear of the owner, its deck
 * still a bridge (none: nothing to turn over). */
function overBridge(r: Result, holds: readonly (Hold & ReturnType<typeof placedHold>)[]) {
  const high = holds.filter(h => !h.over && h.s >= 0 && h.s <= r.length && gradeAt(r, h.s) > h.max + HOLD_SLACK
    && (h.crossing.type === 'bridge' && r.kind[Math.round(h.s / r.ds)] === KIND.bridge || h.crossing.type === 'overbridge'));
  return high.length ? holds.map(h => high.includes(h) ? { ...h, min: h.z + clearOver(h.owner), max: Infinity, over: true as const, ends: undefined } : h) : null;
}
/** A held road that misses its crossing's height (By hand), and the part of its bill the owner's bridge over
 * the owner already pays (its deck and ramps are billed with that crossing). */
function heldChecks(r: Result, holds: readonly (Hold & ReturnType<typeof placedHold>)[], line: OurLine = 'road'): { violations: Result['violations']; credits: ReplacementWork[] } {
  const violations: Result['violations'] = [], credits: ReplacementWork[] = [];
  /** credited so far: never more than the held road's own bill */
  let spent = 0;
  /** how far the road misses a band (0: within it), m */
  const miss = (b: HeldBand) => {
    if (!(b.s >= 0 && b.s <= r.length)) return 0;
    const k = Math.min(r.n - 2, Math.floor(b.s / r.ds)), t = (b.s - r.s[k]) / r.ds, z = r.grade[k] + (r.grade[k + 1] - r.grade[k]) * t;
    // Auto aims at the band; its vertical curves may round a crest/sag by up to HOLD_SLACK more
    return z > b.max + HOLD_SLACK ? z - b.max : z < b.min - HOLD_SLACK ? z - b.min : 0;
  };
  for (const h of holds) {
    if (!(h.s >= 0 && h.s <= r.length)) continue;
    const name = ownerName(h.owner), type = h.crossing.type;
    // on the owner's deck: the worst of its middle and its two ends
    const off = [h, ...h.ends ?? []].map(miss).reduce((a, b) => Math.abs(b) > Math.abs(a) ? b : a, 0);
    if (off) { const v = { kind: 'crossing', s0: h.s, s1: h.s, basis: 'game',
      title: type === 'bridge' ? (h.over ? `Too low over ${name}’s bridge` : `Too high under ${name}’s bridge`)
        : type === 'overbridge' ? (h.over ? `Too low over ${name}` : `Not on its bridge over ${name}`) : `Not level with ${name} where they cross`,
      fix: `${off > 0 ? 'Lower' : 'Raise'} this ${line} here by ${Math.abs(off).toFixed(1)} m`,
      rule: 'Game rule: where roads cross, the crossing is built once, by the more important road; the other road keeps the height it was built for.' } as Result['violations'][number];
      WORDED.add(v); violations.push(v); }
    if (!h.billed) continue;
    // The held road draws and prices its whole body, the owner's deck and ramps included, and the owner bills
    // them as its crossing: what the owner bills comes off the held road's bill. Billed once; the rest of
    // what the held road builds there (its own bridge over a dip beside the ramps) stays on its own bill.
    const half = ((h.crossing.approachLength ?? 0) + (h.crossing.span ?? 0)) / 2;
    const credit = Math.min(h.billed ?? 0, Math.max(0, r.cost.total - spent));
    spent += credit;
    if (credit > 0) credits.push({ kind: 'junction', s: h.s, x: h.crossing.x, y: h.crossing.y, length: 2 * half, cost: -credit,
      label: `${cap(name)} pays for its bridge over ${name}${h.crossing.approachLength ? ' and the ramps up to it' : ''}` });
  }
  return { violations, credits };
}
