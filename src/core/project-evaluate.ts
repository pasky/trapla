// Project publication boundary. Legacy single-road semantics remain exact; unimplemented interactions
// expose proposed geometry with null project total, never a sum of independently completed road bills.
import { CATEGORIES } from './data/categories';
import { ENDPOINT_JUNCTIONS, NOISE, ROAD_CLASSES } from './data/urban';
import type { EvalContext, Result } from './evaluate';
import type { XYZ, SharedWork, ProjectBuildingOutcome, ProjectEnvironment, ProjectIssue, ProjectReceiver, ProjectResult, ProjectSnapshot, RouteDesign, RouteResult, TransportSurface } from './project';
import { INDEPENDENCE_SCREEN, routeContacts, screenIndependence, type RouteContact } from './project-ledger';
import { evaluateProjectRoad, type SourceWays } from './project-road';
import type { Replacement, ReplacementWork } from './project-replacement';
import { designedTieIn } from './tie-in';
import { combineNoise, type NoiseDecider } from './project-noise';
import { assertProjectDesign } from './project-validation';
import { noiseSource } from './road-noise';
import { evaluateProjectRailway, railTraffic, type RailwayEvaluation } from './project-railway';
import { createRailNoiseModel } from './rail-noise';
import { CARRIAGEWAY_CATEGORY, corridorOfRoute, corridorOperations, evaluateProjectCorridor, MOTORWAY_CATEGORY, type CorridorEvaluation } from './project-motorway';
import type { ProjectDesign } from './project';
import * as dm from './detmath';
import { draws, editedNetwork, lineStation, planEnds, planLine, registerNet, type ResolvedEnds } from './project-roadnet';
import type { CrossingResult } from './crossings';
import { CROSSING_RULES } from './data/urban';
import { STEP, type EvalOptions } from './evaluate';

export interface ProjectEvalContext { legacy: EvalContext; environment: ProjectEnvironment; sourceWays?: SourceWays;
  /** Combined noise of several roads (C1 c): answers each road's per-storey energy at a house from its
   * physical source, and project walls. Absent: houses heard by two roads keep the project unpriced. */
  combinedNoise?: (routes: readonly { route: RouteDesign; result: Result }[]) => NoiseDecider | null }

const issue = (routeId: string, code: string): ProjectIssue => ({ code, scope: { routeIds: routeId ? [routeId] : [] }, locations: [], blocking: 'incomplete', check: 'not-checked',
  violation: { kind: 'crossing', basis: 'engine', title: 'Road checks are not finished',
    fix: 'Keep the existing road until its replacement is checked',
    rule: 'Engine limit: this foundation does not yet check shared construction, connections and combined noise for this design.' } });
function crownOf(route: RouteDesign): number {
  if (route.kind === 'motorway') return CATEGORIES[route.alignment.kind === 'corridor' ? MOTORWAY_CATEGORY : CARRIAGEWAY_CATEGORY].crownWidth;
  if (route.kind === 'railway') return CATEGORIES[route.specification.tracks === 1 ? 'R1' : 'R2'].crownWidth;
  return route.kind === 'road' && route.specification.crossSection !== 'existing' ? CATEGORIES[route.specification.crossSection].crownWidth : 0;
}
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
const UNPRICED: Record<'source-needs-network' | 'traffic-unknown', Pick<ProjectIssue, 'check'> & { violation: ProjectIssue['violation'] }> = {
  'source-needs-network': { check: 'not-checked', violation: { kind: 'crossing', basis: 'engine', title: 'Replacing the old road is not priced yet',
    fix: 'Its new line is checked; removing the old road and reconnecting its side roads is not priced yet',
    rule: 'Engine limit: the price of a rebuilt stretch still lacks removing the old road and reconnecting the roads that joined it.' } },
  'traffic-unknown': { check: 'violation', violation: { kind: 'crossing', basis: 'game', title: 'Traffic not set',
    fix: 'Enter how many vehicles a day use this road in its card',
    rule: 'Game rule: noise and capacity depend on traffic, so a road without traffic cannot be priced.' } },
};
function routeProposal(ctx: ProjectEvalContext, snapshot: ProjectSnapshot, route: RouteDesign,
  preview = false, materialValue?: number, corridors: CorridorCache = new Map(), ends?: { a?: XYZ; b?: XYZ },
  holds?: EvalOptions['holds'], endsOf?: (route: RouteDesign) => ResolvedEnds): { route: RouteResult; issues: ProjectIssue[];
    junctionEnds: ('a' | 'b')[]; replacement?: Replacement; ringWorks?: ReplacementWork[] } {
  const corridor = route.kind === 'motorway' ? corridorOfRoute(snapshot.design, route.id) : undefined;
  let evaluated: CorridorEvaluation | RailwayEvaluation | ReturnType<typeof evaluateProjectRoad>;
  // motorways and railways are checked against the network as the player edited it too
  const edited = (owners: RouteDesign[]) => {
    const net = ctx.legacy.roads ? editedNetwork(ctx.legacy.roads, snapshot.design, owners, ctx.sourceWays, endsOf) : null;
    return net ? { ...ctx.legacy, roads: net.roads } : ctx.legacy;
  };
  if (corridor) {
    let cached = corridors.get(corridor.id);
    // A drag preview of one separate direction evaluates only that direction.
    if (!cached) corridors.set(corridor.id, cached = evaluateProjectCorridor(edited(snapshot.design.routes.filter(r => r.id === corridor.children.forward || r.id === corridor.children.reverse)),
      snapshot.design, corridor.id, ctx.environment.objectData, { preview, materialValue, ...(preview ? { only: route.id } : {}) }));
    evaluated = cached;
  } else if (route.kind === 'railway') evaluated = evaluateProjectRailway(edited([route]), snapshot.design, route.id, ctx.environment.objectData, { preview, materialValue });
  else evaluated = evaluateProjectRoad(ctx.legacy, snapshot.design, route.id, ctx.environment.objectData, { preview, materialValue, sourceWays: ctx.sourceWays,
    ...(ends ? { ends } : {}), ...(holds?.length ? { holds } : {}), ...(endsOf ? { endsOf } : {}) });
  const road = route.kind === 'road' && !corridor && evaluated.status === 'evaluated' ? evaluated as Extract<ReturnType<typeof evaluateProjectRoad>, { status: 'evaluated' }> : null;
  const legacy = evaluated.status === 'evaluated' ? evaluated.result : evaluated.status === 'split' ? evaluated.results[route.id] : undefined;
  // the kernel names the mission's ends A and B; every other road's card and map say its start and end
  if (legacy && route.role !== 'mission') for (const v of legacy.violations) {
    v.title = endWords(route, v.title); v.fix = endWords(route, v.fix); if (v.detail) v.detail = endWords(route, v.detail);
  }
  return { route: { routeId: route.id, revision: route.revision,
    engineeringRevision: `${snapshot.epoch}:${snapshot.revision}:${route.revision}:${preview ? 'preview' : 'full'}`,
    surface: legacy ? roadSurface(route, legacy) : referenceRoadSurface(ctx.legacy, route), geometry: null,
    ...(legacy ? { legacy } : {}), complete: false, valid: false, accepted: false, attributedCost: null, dependencies: [], influence: [] },
    junctionEnds: road?.junctionEnds ?? [],
    ...(road?.replacement ? { replacement: road.replacement } : {}),
    ...(road?.ringWorks ? { ringWorks: road.ringWorks } : {}),
    issues: evaluated.status === 'incomplete' ? [issue(route.id, evaluated.reason)]
      : (road?.unpriced ?? []).map(code => ({ code, scope: { routeIds: [route.id] }, locations: [], blocking: 'incomplete' as const, ...UNPRICED[code] })) };
}
/** `last`: the last full result of this project. A dragged road keeps following the roads it joins and the
 * crossings a higher-ranking road built with it (under its bridge, on its own deck over it), as they
 * were last evaluated. */
export function previewProjectRoute(ctx: ProjectEvalContext, snapshot: ProjectSnapshot, routeId: string, materialValue?: number,
  last?: ProjectResult | null): RouteResult {
  assertProjectDesign(snapshot.design);
  const design = snapshot.design;
  if (ctx.legacy.roads) registerNet(design.objectData, ctx.legacy.roads.wayCount);
  const route = design.routes.find(r => r.id === routeId); if (!route) throw new Error('Unknown preview route');
  if (!last || last.epoch !== snapshot.epoch || route.kind !== 'road') return routeProposal(ctx, snapshot, route, true, materialValue).route;
  const legacyOf = (id: string) => design.routes.some(r => r.id === id) ? last.routes[id]?.legacy : undefined;
  const ends = followEnds(route, legacyOf), line = planLine(route, ends);
  const holds: Hold[] = [];
  for (const owner of design.routes) {
    const own = owner === route ? undefined : legacyOf(owner.id);
    for (const c of own?.crossings ?? []) {
      if (c.crossedRoute?.id !== route.id || c.shared) continue;
      const at = crossingNow(own!, c, line), hold = at && holdAt(owner, own!, c, line, ctx.legacy.terrain.heightAt(at.x, at.y), at);
      if (hold) holds.push(hold);
    }
  }
  return routeProposal(ctx, snapshot, route, true, materialValue, undefined, ends, holds.map(h => placedHold(h, line)),
    r => lineEnds(design, r, legacyOf)).route;
}
/** Ends on another designed road: its nearest point and height now. */
function followEnds(r: RouteDesign, legacyOf: (id: string) => Result | undefined): { a?: XYZ; b?: XYZ } | undefined {
  const out: { a?: XYZ; b?: XYZ } = {};
  for (const end of ['a', 'b'] as const) {
    const anchor = r.endpoints[end].anchor, host = anchor.kind === 'route' ? legacyOf(anchor.routeId) : undefined;
    if (!host) continue;
    const p = r.endpoints[end].position, k = nearestStation(host, p.x, p.y);
    out[end] = { x: host.x[k], y: host.y[k], z: host.grade[k] };
  }
  return out.a || out.b ? out : undefined;
}
/** Where a road's ends are built, for its plan line in other roads' networks: on the roads it joins as
 * evaluated, else (not evaluated yet) on their plan. */
function lineEnds(design: ProjectDesign, r: RouteDesign, legacyOf: (id: string) => Result | undefined): ResolvedEnds {
  if (r.kind !== 'road' || ![r.endpoints.a, r.endpoints.b].some(e => e.anchor.kind === 'route')) return undefined;
  const now = followEnds(r, legacyOf);
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
const endWords = (route: RouteDesign, text: string) => route.role === 'mission' ? text
  : text.replace(/\b(to|from|near|at) A\b/g, '$1 its start').replace(/\b(to|from|near|at) B\b/g, '$1 its end');
const routeIssues = (route: RouteDesign, r: Result): ProjectIssue[] => r.violations.map(v => ({ code: v.kind, blocking: 'invalid', check: 'violation', scope: { routeIds: [route.id] },
  locations: [{ routeId: route.id, s0: v.s0, s1: v.s1, ...(v.pi === undefined ? {} : { pi: v.pi }), ...(v.vpi === undefined ? {} : { vpi: v.vpi }) }],
  violation: { kind: v.kind, title: endWords(route, v.title), fix: endWords(route, v.fix), basis: v.basis, rule: v.rule, ...(v.detail ? { detail: endWords(route, v.detail) } : {}) } }));

function routeOutcome(ctx: ProjectEvalContext, design: ProjectDesign, route: RouteDesign, r: Result): { buildings: ProjectBuildingOutcome[]; receivers: ProjectReceiver[] } {
  const buildings = [...r.demolished.map(b => ({ buildingIndex: b.j, action: 'demolish' as const, cost: b.cost })),
    ...r.boughtOut.map(b => ({ buildingIndex: b.j, action: 'buy' as const, cost: b.cost })),
    ...r.kept.map(b => ({ buildingIndex: b.j, action: 'retain' as const, cost: 0 }))];
  // Road periods share propagation/attenuation; recover their absolute levels from the legacy
  // controlling excess and fixed source offset. No multi-source inference is made from excess.
  const corridor = route.kind === 'motorway' ? corridorOfRoute(design, route.id) : undefined;
  const op = corridor ? corridorOperations(design, corridor) : route.specification.kind === 'road' ? route.specification.operations : null;
  const rail = route.kind === 'railway' ? createRailNoiseModel(railTraffic(route)) : null;
  const source = rail ?? (op ? noiseSource(op.aadt, op.speed, { heavyShare: op.heavyShare, ...(corridor ? { profile: 'motorway' as const } : {}) }) : null);
  const limits = rail?.limits ?? { dayDb: NOISE.limitDayDb, nightDb: NOISE.limitNightDb };
  const levels = (excess: number) => source && Number.isFinite(source.excessDb) ? {
    day: source.dayDb - source.excessDb + excess, night: source.nightDb - source.excessDb + excess,
  } : { day: -Infinity, night: -Infinity };
  const receivers = r.noise.receivers.map(receiver => {
    const raw = levels(receiver.raw), built = levels(receiver.mitigated);
    const height = NOISE.receiverHeight + ((ctx.legacy.buildings?.levels[receiver.j] ?? 1) - 1) * NOISE.storeyHeight;
    return { buildingIndex: receiver.j, height, contributions: [{ sourceId: route.acousticSourceId, routeId: route.id,
      buildingIndex: receiver.j, height, dayEnergy: dm.pow(10, raw.day / 10), nightEnergy: dm.pow(10, raw.night / 10), policy: rail ? 'cnossos-rail' : 'legacy-road' }],
      dayDb: built.day, nightDb: built.night, dayLimit: limits.dayDb, nightLimit: limits.nightDb,
      action: receiver.status === 'bought' ? 'buy' as const : 'retain' as const };
  });
  return { buildings, receivers };
}
const interactionIssue = (routeIds: string[], code: string, buildingIndex?: number): ProjectIssue => ({ code, blocking: 'incomplete', check: 'not-checked',
  scope: { routeIds, ...(buildingIndex === undefined ? {} : { buildingIndex }) }, locations: [],
  violation: { kind: 'crossing', basis: 'engine', title: 'These roads affect each other',
    fix: 'Move them further apart to price them together',
    rule: 'Engine limit: roads are priced together only when they share no land, houses, noise or existing road; checking them jointly is not finished.' } });

const junctionsPending = (routeIds: string[]): ProjectIssue => ({ code: 'connection-pending', blocking: 'incomplete', check: 'not-checked',
  scope: { routeIds }, locations: [],
  violation: { kind: 'crossing', basis: 'engine', title: 'Junctions are not priced yet',
    fix: 'Where this road joins another road, the junction is not built or priced yet',
    rule: 'Engine limit: junctions where a new or rebuilt road meets another road are not designed or priced yet.' } });
const endsNowhere = (routeId: string): ProjectIssue => ({ code: 'road-ends-nowhere', blocking: 'incomplete', check: 'violation',
  scope: { routeIds: [routeId] }, locations: [],
  violation: { kind: 'crossing', basis: 'game', title: 'Road ends nowhere', fix: 'Connect both ends to a road',
    rule: 'Game rule: a new road is priced only when both ends join a road or a scenario end.' } });

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
  const owners = (r: RouteDesign) => design.routes.filter(o => draws(design, o, r)).map(o => o.id);
  let { order, placed } = ordered(r => [...endHosts(r), ...owners(r), ...design.routes.filter(q => draws(design, r, q)).flatMap(endHosts).filter(id => id !== r.id)]);
  if (order.length < design.routes.length) ({ order, placed } = ordered(r => [...endHosts(r), ...owners(r)]));
  if (order.length < design.routes.length) ({ order, placed } = ordered(endHosts));
  if (ctx.legacy.roads) registerNet(design.objectData, ctx.legacy.roads.wayCount);
  /** where a higher-ranking road's crossing holds a designed road (filled as owners are evaluated) */
  const holdsOf = new Map<string, Hold[]>(), seenOwners = new Set<Result>();
  const cyclic = design.routes.filter(r => !placed.has(r.id));
  const legacyOf = new Map<string, Result>();
  const ownWorks = new Map<string, ReplacementWork[]>();
  /** where two designed roads meet in one work (a junction, a crossing): its land is that work's */
  const designedJunctions = new Map<string, { routeId: string; x: number; y: number; r: number }[]>();
  const evaluated = (id: string) => legacyOf.get(id);
  const endsOf = (r: RouteDesign) => lineEnds(design, r, evaluated);
  for (const route of [...order, ...cyclic]) {
    // its ends follow the roads it joins; the heights its crossings hold are placed on the line it is built on
    const ends = route.kind === 'road' ? followEnds(route, evaluated) : undefined;
    const line = holdsOf.has(route.id) ? planLine(route, ends) : [];
    const holds = (holdsOf.get(route.id) ?? []).map(h => ({ ...h, ...placedHold(h, line) }));
    const proposal = routeProposal(ctx, snapshot, route, false, undefined, corridorCache, ends,
      holds.map(({ s, min, max, bridge }) => ({ s, min, max, ...(bridge ? { bridge } : {}) })), endsOf);
    if (proposal.route.legacy) legacyOf.set(route.id, proposal.route.legacy);
    const own = proposal.route.legacy;
    if (own && holds.length) {
      const { violations, credits } = heldChecks(own, holds);
      if (violations.length) { own.violations.push(...violations); own.valid = false; }
      if (credits.length) ownWorks.set(route.id, [...ownWorks.get(route.id) ?? [], ...credits]);
    }
    // the designed roads this road crosses: each follows its crossing's height
    if (own && ctx.legacy.roads && !seenOwners.has(own)) {
      seenOwners.add(own);
      const corridorKids = corridorOfRoute(design, route.id), owners = corridorKids
        ? design.routes.filter(r => r.id === corridorKids.children.forward || r.id === corridorKids.children.reverse) : [route];
      const net = editedNetwork(ctx.legacy.roads, design, owners, ctx.sourceWays, endsOf);
      for (const c of own.crossings) {
        const crossedId = c.roadId !== undefined ? net?.designed.get(c.roadId) : undefined, crossed = design.routes.find(r => r.id === crossedId);
        if (!crossed) continue;
        c.crossedRoute = { id: crossed.id, name: crossed.name };
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
        const reach = wide / Math.max(0.3, crossingSine(own, c, drawn, lineStation(drawn, c.x, c.y))) + ((c.approachLength ?? 0) + (c.span ?? 0)) / 2
          + (ROAD_CLASSES[c.cls]?.width ?? 7.5) + INDEPENDENCE_SCREEN.clearance;
        let zones = designedJunctions.get(crossed.id); if (!zones) designedJunctions.set(crossed.id, zones = []);
        for (const o of owners) zones.push({ routeId: o.id, x: c.x, y: c.y, r: reach });
      }
    }
    defineRoute(result.routes, route.id, proposal.route);
    if (proposal.route.legacy) engineered.push({ route, legacy: proposal.route.legacy });
    for (const end of proposal.junctionEnds) builtJunctions.add(`${route.id}:${end}`);
    if (proposal.replacement) replacements.set(route.id, proposal.replacement);
    if (proposal.ringWorks) ringsOf.set(route.id, proposal.ringWorks);
    for (const i of proposal.issues) { result.issues.push(i); result.cost.unpriced.push({ routeId: route.id, reason: i.code }); }
    if (!proposal.issues.length && proposal.route.legacy) priced.push({ route, legacy: proposal.route.legacy });
  }
  // A rebuilt stretch's old road is gone from the map as soon as its new line is engineered against the
  // network without it, priced or not: every road is checked against the network as the player edited it.
  for (const route of design.routes) if (route.source && replacements.has(route.id)) result.acceptedReplacements.push(...route.source.intervals.map(i => ({ ...i })));
  // Junctions where a side road meets another designed road: built and billed by the side road (C1 c),
  // checked against the joined road's current design. Each road's other junctions (and ends) count.
  const junctionsOn = new Map<string, number[]>();
  for (const { route, legacy } of engineered) for (const end of ['a', 'b'] as const) {
    const anchor = route.endpoints[end].anchor;
    if (anchor.kind !== 'route' || cyclic.includes(route)) continue;
    const hostRoute = design.routes.find(q => q.id === anchor.routeId), host = legacyOf.get(anchor.routeId);
    if (!hostRoute || !host || hostRoute.kind !== 'road' || hostRoute.specification.crossSection === 'existing') continue;
    const spec = hostRoute.specification, crown = CATEGORIES[spec.crossSection as Exclude<typeof spec.crossSection, 'existing'>].crownWidth;
    let stations = junctionsOn.get(hostRoute.id);
    if (!stations) junctionsOn.set(hostRoute.id, stations = [0, host.length, ...host.crossings.filter(c => c.type === 'junction').map(c => c.s)]);
    const t = designedTieIn(legacy, end, { name: hostRoute.role === 'mission' ? 'our road' : hostRoute.name, legalClass: spec.legalClass,
      crownWidth: crown, result: host, junctions: stations }, ctx.legacy.terrain, ctx.legacy.buildings,
      route.alignment.kind === 'pi' ? route.alignment.controls.junctionForms?.[end] : undefined);
    stations.push(t.s);
    if (t.violations.length) { legacy.violations.push(...t.violations); legacy.valid = false; }
    const i = end === 'a' ? 0 : legacy.n - 1, k = Math.max(0, Math.min(host.n - 1, Math.round(t.s / host.ds)));
    let list = ownWorks.get(route.id); if (!list) ownWorks.set(route.id, list = []);
    list.push({ kind: 'junction', s: legacy.s[i], x: legacy.x[i], y: legacy.y[i], length: 0, cost: t.cost, label: t.label });
    if (t.ring) list.push({ kind: 'junction', s: legacy.s[i], x: legacy.x[i], y: legacy.y[i], length: 0, cost: t.ring.cost,
      label: `Roundabout's ring: ${Math.round(t.ring.area)} m² of land${t.ring.removed.length ? `, ${t.ring.removed.length} building${t.ring.removed.length > 1 ? 's' : ''} removed` : ''}` });
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
  for (const [id, rep] of replacements) ownWorks.set(id, [...ownWorks.get(id) ?? [], ...rep.works]);
  for (const [id, rings] of ringsOf) ownWorks.set(id, [...ownWorks.get(id) ?? [], ...rings]);
  // Every road's own works are listed (its card shows them); they count in a price only once accepted below.
  for (const { route } of engineered) for (const [k, w] of (ownWorks.get(route.id) ?? []).entries()) result.works.items.push(replacementWork(route, k, w));
  // A priced unit is one road, or one motorway corridor: paired (one body published under both
  // directions) or split (two directions plus the corridor ledger that counts shared works once).
  type Unit = { route: RouteDesign; legacy: Result; members: string[]; parts: { route: RouteDesign; legacy: Result }[];
    total: number; valid: boolean; issues: ProjectIssue[] };
  const units: Unit[] = [];
  for (const { route, legacy } of priced) {
    const unit = units.find(p => unitOf(p.route) === unitOf(route));
    if (unit) {
      unit.members.push(route.id);
      if (unit.legacy !== legacy) { unit.parts.push({ route, legacy }); unit.total += legacy.cost.total; unit.valid &&= legacy.valid; unit.issues.push(...routeIssues(route, legacy)); }
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
  for (const { route, legacy } of engineered) if (!shown.has(legacy)) { shown.add(legacy); defineRoute(result.cost.alone, route.id, legacy.cost.total); }
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
    if (atJunction(c)) continue;
    // a crossing the higher-ranking road builds (bridge, its bridge over us, underpass, junction)
    if (c.kind === 'crossing' && c.routeIds.some((id, k) => (legacyOf.get(id)?.crossings ?? [])
      .some(x => x.crossedRoute?.id === c.routeIds[1 - k] && Math.hypot(x.x - c.at.x, x.y - c.at.y) < 30))) continue;
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
  for (const c of design.connections) {
    const routes = c.ports.flatMap(p => p.kind === 'route' ? [p.routeId] : []);
    // a rebuilt stretch's own continuations and side roads are its replacement works
    if (routes.length && routes.every(id => id === routes[0] && replacements.has(id))) continue;
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
    if (e.anchor.kind === 'route' && builtJunctions.has(`${r.id}:${end}`)) continue;
    joined.add(r.id); if (e.anchor.kind === 'route') joined.add(e.anchor.routeId);
  }
  if (joined.size) { result.issues.push(junctionsPending([...joined])); unprice([...joined], 'connection-pending'); }
  // A new road that ends nowhere is not a project: every end must reach a road or a scenario end.
  for (const r of design.routes) if (r.role !== 'mission' && [r.endpoints.a, r.endpoints.b].some(e => e.anchor.kind === 'free')) {
    result.issues.push(endsNowhere(r.id)); unprice([r.id], 'road-ends-nowhere');
  }
  if (!design.routes.length) result.issues.push(issue('', 'network-accounting-pending'));
  const finish = () => {
    // priced units' issues (incl. a split corridor's ledger), and every other engineered road's own problems
    const listed = new Set<Result>();
    for (const unit of units) { result.issues.push(...unit.issues); for (const p of unit.parts) listed.add(p.legacy); }
    for (const { route, legacy } of engineered) if (!listed.has(legacy)) { listed.add(legacy); result.issues.push(...routeIssues(route, legacy)); }
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
  // Several roads: add their bills ONLY when nothing one builds, buys, closes or makes loud reaches another.
  const screen = screenIndependence(units.map(({ route, legacy }) => {
    const spec = route.specification, corridor = corridorOfRoute(design, route.id);
    const op = corridor ? corridorOperations(design, corridor) : spec.kind === 'road' ? spec.operations : { aadt: Infinity, speed: Infinity, heavyShare: 1 };
    const halfWidth = corridor || (spec.kind === 'road' && spec.crossSection !== 'existing') ? crownOf(route) / 2 : Infinity;
    // a rebuilt stretch changes its old road too, wherever another road might touch it
    const way = route.source?.intervals[0] && ctx.sourceWays?.get(route.source.intervals[0].sourceId);
    return { routeId: route.id, result: legacy, aadt: op.aadt, speed: op.speed, heavyShare: op.heavyShare, halfWidth,
      ...(corridor ? { profile: 'motorway' as const } : {}),
      ...(way !== undefined ? { extraRoads: [way] } : {}),
      ...(designedJunctions.has(route.id) ? { junctions: designedJunctions.get(route.id) } : {}),
      ...(replacements.get(route.id)?.works.some(w => w.kind === 'reconnection' && w.length > 1)
        ? { extraLines: replacements.get(route.id)!.works.filter(w => w.kind === 'reconnection' && w.length > 1).map(w => {
          const n = nearestStation(legacy, w.x, w.y); return { ax: w.x, ay: w.y, bx: legacy.x[n], by: legacy.y[n], r: (ROAD_CLASSES[w.cls ?? '']?.width ?? 6.5) / 2 };
        }) } : {}) };
  }), ctx.legacy.buildings);
  // Houses heard by two or more roads are decided together when the combined-noise calculator is there;
  // every other interaction (shared land, roads, buildings) still keeps the project unpriced.
  const heard = screen.interactions.filter(i => i.reason === 'shared-noise' && i.buildingIndex !== undefined);
  const decider = heard.length && ctx.legacy.buildings ? ctx.combinedNoise?.(units.flatMap(u => u.parts).map(({ route, legacy }) => ({ route, result: legacy }))) ?? null : null;
  const blocking = screen.interactions.filter(i => !(decider && heard.includes(i)));
  if (blocking.length) {
    for (const i of blocking) { result.issues.push(interactionIssue(i.routeIds, i.reason, i.buildingIndex)); unprice(i.routeIds, i.reason); }
    return finish();
  }
  const together = decider ? combineNoise(heard.map(i => i.buildingIndex!), decider, ctx.legacy.buildings!,
    new Set(priced.flatMap(({ legacy }) => [...legacy.demolished, ...legacy.boughtOut].map(b => b.j)))) : [];
  for (const h of together) {
    const owner = h.wall?.routeId ?? h.buyout?.routeId; if (!owner) continue;
    const p = priced.find(q => q.route.id === owner)!, r = p.legacy, b = ctx.legacy.buildings!.items[h.buildingIndex];
    const k = nearestStation(r, b[0], b[1]);
    let list = ownWorks.get(owner); if (!list) ownWorks.set(owner, list = []);
    const work: ReplacementWork = h.wall
      ? { kind: 'noise-wall', s: r.s[k], x: b[0], y: b[1], length: h.wall.length, cost: h.wall.cost,
        label: `Noise wall ${h.wall.height} m for a house both roads are heard at (${Math.round(h.wall.length)} m)` }
      : { kind: 'buyout', s: r.s[k], x: b[0], y: b[1], length: 0, cost: h.buyout!.cost, label: 'House bought out: too loud with both roads together' };
    list.push(work);
    result.works.items.push({ ...replacementWork(p.route, list.length - 1, work), id: `${owner}:noise:${h.buildingIndex}` });
  }
  let total = 0, valid = true;
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
      contributions: h.sources.map(s => { const top = s.storeys[s.storeys.length - 1];
        return { sourceId: s.sourceId, routeId: s.routeId, buildingIndex: h.buildingIndex, height: top?.height ?? NOISE.receiverHeight,
          dayEnergy: top?.rawDay ?? 0, nightEnergy: top?.rawNight ?? 0, policy: 'combined' }; }),
      dayDb: h.dayDb, nightDb: h.nightDb, dayLimit: h.dayLimit, nightLimit: h.nightLimit, action: h.decision === 'buy' ? 'buy' : 'retain' };
    if (k >= 0) result.receivers[k] = decided; else result.receivers.push(decided);
    if (h.decision === 'buy') result.buildings.push({ buildingIndex: h.buildingIndex, action: 'buy', cost: h.buyout!.cost });
  }
  result.buildings = mergeBuildings(result.buildings);
  result.cost.total = total; result.complete = true; result.valid = valid;
  result.acousticScreen = { bounds: [], omittedDayEnergyUpperBound: screen.omittedDayEnergy,
    omittedNightEnergyUpperBound: screen.omittedNightEnergy, complete: true };
  return result;
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
    kind: w.kind === 'removal' ? 'formation' : w.kind === 'land' ? 'land' : w.kind === 'noise-wall' ? 'noise' : w.kind === 'buyout' ? 'property' : 'connection', surfaces: [], claims: w.kind === 'removal' || w.kind === 'land' ? (route.source?.intervals ?? []).map(i => ({ ...i })) : [],
    geometry: { meshes: [], terrainMasks: [], measurements: [{ id: `${route.id}:${w.kind}:${k}:length`, meshIds: [], quantity: w.length, unit: 'm' }] },
    cost: w.cost, dependencies: [], accepted: false, label: w.label, at: { x: w.x, y: w.y, s: w.s } };
}

/** Where a higher-ranking road's crossing holds a designed road: a grade band at that point of its line. */
interface Hold { x: number; y: number; min: number; max: number; owner: RouteDesign; crossing: CrossingResult;
  /** on its bridge over the owner: half the deck's length along the held road */
  deck?: number }
/** A hold on the line the held road is built on: its station there (and its deck's span). */
const placedHold = (h: Hold, line: readonly number[]): { s: number; min: number; max: number; bridge?: [number, number] } => {
  const s = lineStation(line, h.x, h.y);
  return { s, min: h.min, max: h.max, ...(h.deck !== undefined ? { bridge: [Math.max(0, s - h.deck), s + h.deck] as [number, number] } : {}) };
};
/** Along the owner, how far around a crossing its earthworks belong to that crossing, m (MODELLING ASSUMPTION:
 * the 150 m crossing billing margin, CROSSING_RULES.endMargin). */
const ZONE_ALONG = 150;
/** |sin| of the angle between the owner and the crossed road's plan line at the crossing. */
function crossingSine(own: Result, c: CrossingResult, line: readonly number[], s: number): number {
  const k = Math.max(0, Math.min(own.n - 2, c.i)), ox = own.x[k + 1] - own.x[k], oy = own.y[k + 1] - own.y[k];
  const j = Math.max(0, Math.min(line.length / 2 - 2, Math.round(s / 5))) * 2, lx = line[j + 2] - line[j], ly = line[j + 3] - line[j + 1];
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
  const band = (min: number, max: number): Hold => ({ x: at.x, y: at.y, min, max, owner, crossing: c });
  switch (c.type) {
    // under our bridge: low enough for the clearance the bridge was built with
    case 'bridge': return band(-Infinity, z - CROSSING_RULES.overHeight);
    case 'underpass': return band(ground - HOLD_TOLERANCE, ground + HOLD_TOLERANCE);
    case 'overbridge': {
      // on its bridge over us: the deck's height where it crosses our centreline
      const road = c.geometry?.road; if (!road?.length) return null;
      const deck = road.reduce((p, q) => Math.abs(q.d ?? Infinity) < Math.abs(p.d ?? Infinity) ? q : p).z + z - own.grade[c.i];
      // its own deck over our road: the span is measured along the crossed road already
      return { ...band(deck - HOLD_TOLERANCE, deck + HOLD_TOLERANCE), deck: (c.span ?? 0) / 2 };
    }
    case 'junction': case 'atGrade': return band(z - HOLD_TOLERANCE, z + HOLD_TOLERANCE);
    default: return null; // over our tunnel: free
  }
}
const ownerName = (r: RouteDesign) => r.role === 'mission' ? 'our road' : r.name;
/** A held road that misses its crossing's height (By hand), and the part of it the owner's bridge over
 * the owner already builds (its deck and ramps are billed with that crossing). */
function heldChecks(r: Result, holds: readonly (Hold & { s: number })[]): { violations: Result['violations']; credits: ReplacementWork[] } {
  const violations: Result['violations'] = [], credits: ReplacementWork[] = [], credited = new Uint8Array(r.n);
  for (const h of holds) {
    if (!(h.s >= 0 && h.s <= r.length)) continue;
    const k = Math.min(r.n - 2, Math.floor(h.s / r.ds)), t = (h.s - r.s[k]) / r.ds, z = r.grade[k] + (r.grade[k + 1] - r.grade[k]) * t;
    const name = ownerName(h.owner), type = h.crossing.type;
    // Auto aims at the band; its vertical curves may round a crest/sag by up to HOLD_SLACK more
    const off = z > h.max + HOLD_SLACK ? z - h.max : z < h.min - HOLD_SLACK ? z - h.min : 0;
    if (off) violations.push({ kind: 'crossing', s0: h.s, s1: h.s, basis: 'game',
      title: type === 'bridge' ? `Too high under ${name}’s bridge` : type === 'overbridge' ? `Not on its bridge over ${name}` : `Not level with ${name} where they cross`,
      fix: `${off > 0 ? 'Lower' : 'Raise'} this road here by ${Math.abs(off).toFixed(1)} m`,
      rule: 'Game rule: where roads cross, the crossing is built once, by the more important road; the other road keeps the height it was built for.' } as Result['violations'][number]);
    if (type !== 'overbridge') continue;
    const half = ((h.crossing.approachLength ?? 0) + (h.crossing.span ?? 0)) / 2;
    let credit = 0;
    for (let q = 0; q < r.n; q++) if (Math.abs(r.s[q] - h.s) <= half && !credited[q]) {
      credited[q] = 1; // overlapping crossings credit a cell once
      for (const key of [...SHARED_PARTS, 'bridges', 'culverts'] as const) credit += r.parts[key][q];
    }
    if (credit > 0) credits.push({ kind: 'junction', s: h.s, x: h.crossing.x, y: h.crossing.y, length: 2 * half, cost: -credit,
      label: `Its ${Math.round(2 * half)} m on the bridge over ${name} are built with that bridge, not twice` });
  }
  return { violations, credits };
}
