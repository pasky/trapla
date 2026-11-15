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
import { assertProjectDesign } from './project-validation';
import { noiseSource } from './road-noise';
import * as dm from './detmath';

export interface ProjectEvalContext { legacy: EvalContext; environment: ProjectEnvironment; sourceWays?: SourceWays }
const issue = (routeId: string, code: string): ProjectIssue => ({ code, scope: { routeIds: routeId ? [routeId] : [] }, locations: [], blocking: 'incomplete', check: 'not-checked',
  violation: { kind: 'crossing', basis: 'engine', title: 'Road checks are not finished',
    fix: 'Keep the existing road until its replacement is checked',
    rule: 'Engine limit: this foundation does not yet check shared construction, connections and combined noise for this design.' } });
function roadSurface(route: RouteDesign, result: Result): TransportSurface {
  const width = route.kind === 'road' && route.specification.crossSection !== 'existing' ? CATEGORIES[route.specification.crossSection].crownWidth : 0;
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
  preview = false, materialValue?: number, ends?: { a?: XYZ; b?: XYZ }): { route: RouteResult; issues: ProjectIssue[]; junctionEnds: ('a' | 'b')[]; replacement?: Replacement } {
  const evaluated = evaluateProjectRoad(ctx.legacy, snapshot.design, route.id, ctx.environment.objectData, { preview, materialValue, sourceWays: ctx.sourceWays,
    ...(ends ? { ends } : {}) });
  const legacy = evaluated.status === 'evaluated' ? evaluated.result : undefined;
  return { route: { routeId: route.id, revision: route.revision,
    engineeringRevision: `${snapshot.epoch}:${snapshot.revision}:${route.revision}:${preview ? 'preview' : 'full'}`,
    surface: legacy ? roadSurface(route, legacy) : referenceRoadSurface(ctx.legacy, route), geometry: null,
    ...(legacy ? { legacy } : {}), complete: false, valid: false, accepted: false, attributedCost: null, dependencies: [], influence: [] },
    junctionEnds: evaluated.status === 'evaluated' ? evaluated.junctionEnds ?? [] : [],
    ...(evaluated.status === 'evaluated' && evaluated.replacement ? { replacement: evaluated.replacement } : {}),
    issues: evaluated.status === 'incomplete' ? [issue(route.id, evaluated.reason)]
      : (evaluated.unpriced ?? []).map(code => ({ code, scope: { routeIds: [route.id] }, locations: [], blocking: 'incomplete' as const, ...UNPRICED[code] })) };
}
export function previewProjectRoute(ctx: ProjectEvalContext, snapshot: ProjectSnapshot, routeId: string, materialValue?: number): RouteResult {
  assertProjectDesign(snapshot.design);
  const route = snapshot.design.routes.find(r => r.id === routeId); if (!route) throw new Error('Unknown preview route');
  return routeProposal(ctx, snapshot, route, true, materialValue).route;
}

const defineRoute = <T>(record: Record<string, T>, id: string, value: T) =>
  // Define arbitrary stable IDs safely, including object-prototype names.
  Object.defineProperty(record, id, { value, enumerable: true, configurable: true, writable: true });
/** The kernel names the mission's ends A and B; any other road's ends are its start and end. */
const endWords = (route: RouteDesign, text: string) => route.role === 'mission' ? text
  : text.replace(/\b(to|from|near|at) A\b/g, '$1 its start').replace(/\b(to|from|near|at) B\b/g, '$1 its end');
const routeIssues = (route: RouteDesign, r: Result): ProjectIssue[] => r.violations.map(v => ({ code: v.kind, blocking: 'invalid', check: 'violation', scope: { routeIds: [route.id] },
  locations: [{ routeId: route.id, s0: v.s0, s1: v.s1, ...(v.pi === undefined ? {} : { pi: v.pi }), ...(v.vpi === undefined ? {} : { vpi: v.vpi }) }],
  violation: { kind: v.kind, title: endWords(route, v.title), fix: endWords(route, v.fix), basis: v.basis, rule: v.rule, ...(v.detail ? { detail: endWords(route, v.detail) } : {}) } }));
function routeOutcome(ctx: ProjectEvalContext, route: RouteDesign, r: Result): { buildings: ProjectBuildingOutcome[]; receivers: ProjectReceiver[] } {
  const buildings = [...r.demolished.map(b => ({ buildingIndex: b.j, action: 'demolish' as const, cost: b.cost })),
    ...r.boughtOut.map(b => ({ buildingIndex: b.j, action: 'buy' as const, cost: b.cost })),
    ...r.kept.map(b => ({ buildingIndex: b.j, action: 'retain' as const, cost: 0 }))];
  // Road periods share propagation/attenuation; recover their absolute levels from the legacy
  // controlling excess and fixed source offset. No multi-source inference is made from excess.
  const op = route.specification.kind === 'road' ? route.specification.operations : null;
  const source = op ? noiseSource(op.aadt, op.speed, { heavyShare: op.heavyShare }) : null;
  const levels = (excess: number) => source && Number.isFinite(source.excessDb) ? {
    day: source.dayDb - source.excessDb + excess, night: source.nightDb - source.excessDb + excess,
  } : { day: -Infinity, night: -Infinity };
  const receivers = r.noise.receivers.map(receiver => {
    const raw = levels(receiver.raw), built = levels(receiver.mitigated);
    const height = NOISE.receiverHeight + ((ctx.legacy.buildings?.levels[receiver.j] ?? 1) - 1) * NOISE.storeyHeight;
    return { buildingIndex: receiver.j, height, contributions: [{ sourceId: route.acousticSourceId, routeId: route.id,
      buildingIndex: receiver.j, height, dayEnergy: dm.pow(10, raw.day / 10), nightEnergy: dm.pow(10, raw.night / 10), policy: 'legacy-road' }],
      dayDb: built.day, nightDb: built.night, dayLimit: NOISE.limitDayDb, nightLimit: NOISE.limitNightDb,
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

export function evaluateProject(ctx: ProjectEvalContext, snapshot: ProjectSnapshot): ProjectResult {
  assertProjectDesign(snapshot.design);
  const design = snapshot.design;
  const result: ProjectResult = { epoch: snapshot.epoch, revision: snapshot.revision, routes: {}, works: { items: [] },
    cost: { total: null, routes: {}, shared: 0, materialBalance: 'per-route', alone: {}, unpriced: [] }, issues: [],
    acceptedReplacements: [], acceptedRenderReplacements: [], buildings: [], receivers: [], complete: false, valid: false,
    acousticScreen: { bounds: [], omittedDayEnergyUpperBound: Infinity, omittedNightEnergyUpperBound: Infinity, complete: false } };
  const priced: { route: RouteDesign; legacy: Result }[] = [], engineered: typeof priced = [];
  /** route ends whose junction with an existing road is built and billed by that route (C1 a) */
  const builtJunctions = new Set<string>();
  /** a rebuilt stretch's own works: old road removed, side roads reconnected (C1 b) */
  const replacements = new Map<string, Replacement>();
  // A side road ending on another designed road follows that road's current line: the joined road is
  // evaluated first (dependency order, stable otherwise). A cycle of such ends is not built yet.
  const hostOf = (r: RouteDesign) => [r.endpoints.a.anchor, r.endpoints.b.anchor].flatMap(x => x.kind === 'route' ? [x.routeId] : []);
  const order: RouteDesign[] = [], placed = new Set<string>();
  for (let pass = 0; pass <= design.routes.length && order.length < design.routes.length; pass++)
    for (const r of design.routes) if (!placed.has(r.id) && hostOf(r).every(h => placed.has(h) || !design.routes.some(q => q.id === h))) { order.push(r); placed.add(r.id); }
  const cyclic = design.routes.filter(r => !placed.has(r.id));
  const legacyOf = new Map<string, Result>();
  /** ends on another designed road: its nearest point and height now */
  const followEnds = (r: RouteDesign) => {
    const out: { a?: XYZ; b?: XYZ } = {};
    for (const end of ['a', 'b'] as const) {
      const anchor = r.endpoints[end].anchor, host = anchor.kind === 'route' ? legacyOf.get(anchor.routeId) : undefined;
      if (!host) continue;
      const p = r.endpoints[end].position, k = nearestStation(host, p.x, p.y);
      out[end] = { x: host.x[k], y: host.y[k], z: host.grade[k] };
    }
    return out.a || out.b ? out : undefined;
  };
  for (const route of [...order, ...cyclic]) {
    const proposal = routeProposal(ctx, snapshot, route, false, undefined, followEnds(route));
    if (proposal.route.legacy) legacyOf.set(route.id, proposal.route.legacy);
    defineRoute(result.routes, route.id, proposal.route);
    if (proposal.route.legacy) engineered.push({ route, legacy: proposal.route.legacy });
    for (const end of proposal.junctionEnds) builtJunctions.add(`${route.id}:${end}`);
    if (proposal.replacement) replacements.set(route.id, proposal.replacement);
    for (const i of proposal.issues) { result.issues.push(i); result.cost.unpriced.push({ routeId: route.id, reason: i.code }); }
    if (!proposal.issues.length && proposal.route.legacy) priced.push({ route, legacy: proposal.route.legacy });
  }
  // Junctions where a side road meets another designed road: built and billed by the side road (C1 c),
  // checked against the joined road's current design. Each road's other junctions (and ends) count.
  const ownWorks = new Map<string, ReplacementWork[]>(), junctionsOn = new Map<string, number[]>();
  const designedJunctions = new Map<string, { routeId: string; x: number; y: number; r: number }[]>();
  for (const { route, legacy } of engineered) for (const end of ['a', 'b'] as const) {
    const anchor = route.endpoints[end].anchor;
    if (anchor.kind !== 'route' || cyclic.includes(route)) continue;
    const hostRoute = design.routes.find(q => q.id === anchor.routeId), host = legacyOf.get(anchor.routeId);
    if (!hostRoute || !host || hostRoute.kind !== 'road' || hostRoute.specification.crossSection === 'existing') continue;
    const spec = hostRoute.specification, crown = CATEGORIES[spec.crossSection as Exclude<typeof spec.crossSection, 'existing'>].crownWidth;
    let stations = junctionsOn.get(hostRoute.id);
    if (!stations) junctionsOn.set(hostRoute.id, stations = [0, host.length, ...host.crossings.filter(c => c.type === 'junction').map(c => c.s)]);
    const t = designedTieIn(legacy, end, { name: hostRoute.role === 'mission' ? 'our road' : hostRoute.name, legalClass: spec.legalClass,
      crownWidth: crown, result: host, junctions: stations }, ctx.legacy.terrain, ctx.legacy.buildings);
    stations.push(t.s);
    if (t.violations.length) { legacy.violations.push(...t.violations); legacy.valid = false; }
    const i = end === 'a' ? 0 : legacy.n - 1, k = Math.max(0, Math.min(host.n - 1, Math.round(t.s / host.ds)));
    let list = ownWorks.get(route.id); if (!list) ownWorks.set(route.id, list = []);
    list.push({ kind: 'junction', s: legacy.s[i], x: legacy.x[i], y: legacy.y[i], length: 0, cost: t.cost, label: t.label });
    // The side road's first metres lie inside the joined road's own earthworks: built (and bought) once.
    const inside = host.cell.width[k] / 2;
    let credit = 0;
    for (let q = 0; q < legacy.n; q++) {
      const fromEnd = end === 'a' ? legacy.s[q] : legacy.length - legacy.s[q];
      if (fromEnd >= inside) continue;
      for (const key of SHARED_PARTS) credit += legacy.parts[key][q];
    }
    if (credit > 0) list.push({ kind: 'junction', s: legacy.s[i], x: legacy.x[i], y: legacy.y[i], length: inside, cost: -credit,
      label: `Its first ${Math.round(inside)} m are inside ${t.label.replace('Junction with ', '')}’s earthworks: not built twice` });
    let j = designedJunctions.get(route.id); if (!j) designedJunctions.set(route.id, j = []);
    j.push({ routeId: hostRoute.id, x: legacy.x[i], y: legacy.y[i], r: host.cell.width[k] / 2 + ENDPOINT_JUNCTIONS['tie-in'].zone + INDEPENDENCE_SCREEN.clearance });
    builtJunctions.add(`${route.id}:${end}`);
  }
  for (const [id, rep] of replacements) ownWorks.set(id, [...ownWorks.get(id) ?? [], ...rep.works]);
  // Keep each road's own bill and problems visible even while the project cannot be priced.
  for (const { route, legacy } of engineered) defineRoute(result.cost.alone, route.id, legacy.cost.total);
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
    result.issues.push(contactIssue(c)); unprice(c.routeIds, contactIssue(c).code);
  }
  const missionRoutes = design.routes.filter(r => r.role === 'mission');
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
  if (design.corridors.length) unprice(design.corridors.flatMap(c => [c.children.forward, c.children.reverse]), 'unsupported-mode');
  if (!design.routes.length) result.issues.push(issue('', 'network-accounting-pending'));
  const finish = () => {
    for (const { route, legacy } of engineered) result.issues.push(...routeIssues(route, legacy));
    return result;
  };
  if (result.cost.unpriced.length || result.issues.length) return finish();
  if (priced.length === 1 && !replacements.size) {
    // Compatibility facade. One kernel bill and one physical source; never several bills added up.
    const { route, legacy: r } = priced[0], rr = result.routes[route.id];
    rr.complete = true; rr.valid = r.valid; rr.accepted = r.valid; rr.attributedCost = r.cost.total;
    result.complete = true; result.valid = r.valid; result.cost.total = r.cost.total;
    defineRoute(result.cost.routes, route.id, r.cost.total);
    result.issues = routeIssues(route, r);
    ({ buildings: result.buildings, receivers: result.receivers } = routeOutcome(ctx, route, r));
    // Legacy's all-height screen excludes only sub-limit receivers. One physical source means
    // that bound is sufficient; it is NOT a valid aggregate screen for two or more sources.
    result.acousticScreen = { bounds: [], omittedDayEnergyUpperBound: dm.pow(10, NOISE.limitDayDb / 10),
      omittedNightEnergyUpperBound: dm.pow(10, NOISE.limitNightDb / 10), complete: true };
    return result;
  }
  // Several roads: add their bills ONLY when nothing one builds, buys, closes or makes loud reaches another.
  // Unreachable in this wave (non-mission roads either end nowhere or have unpriced tie-ins); kept for C1.
  const screen = screenIndependence(priced.map(({ route, legacy }) => {
    const spec = route.specification, op = spec.kind === 'road' ? spec.operations : { aadt: Infinity, speed: Infinity, heavyShare: 1 };
    const halfWidth = spec.kind === 'road' && spec.crossSection !== 'existing' ? CATEGORIES[spec.crossSection].crownWidth / 2 : Infinity;
    // a rebuilt stretch changes its old road too, wherever another road might touch it
    const way = route.source?.intervals[0] && ctx.sourceWays?.get(route.source.intervals[0].sourceId);
    return { routeId: route.id, result: legacy, aadt: op.aadt, speed: op.speed, heavyShare: op.heavyShare, halfWidth,
      ...(way !== undefined ? { extraRoads: [way] } : {}),
      ...(designedJunctions.has(route.id) ? { junctions: designedJunctions.get(route.id) } : {}),
      ...(replacements.get(route.id)?.works.some(w => w.kind === 'reconnection' && w.length > 1)
        ? { extraLines: replacements.get(route.id)!.works.filter(w => w.kind === 'reconnection' && w.length > 1).map(w => {
          const n = nearestStation(legacy, w.x, w.y); return { ax: w.x, ay: w.y, bx: legacy.x[n], by: legacy.y[n], r: (ROAD_CLASSES[w.cls ?? '']?.width ?? 6.5) / 2 };
        }) } : {}) };
  }), ctx.legacy.buildings);
  if (!screen.independent) {
    for (const i of screen.interactions) { result.issues.push(interactionIssue(i.routeIds, i.reason, i.buildingIndex)); unprice(i.routeIds, i.reason); }
    return finish();
  }
  let total = 0, valid = true;
  const receivers = new Map<number, ProjectReceiver>();
  for (const { route, legacy } of priced) {
    const rr = result.routes[route.id];
    // its own bill plus, for a rebuilt stretch, removing the old road and reconnecting its side roads
    const works = ownWorks.get(route.id), own = legacy.cost.total + (works ?? []).reduce((t, w) => t + w.cost, 0);
    rr.complete = true; rr.valid = legacy.valid; rr.accepted = legacy.valid; rr.attributedCost = own;
    defineRoute(result.cost.routes, route.id, own);
    total += own; valid &&= legacy.valid;
    for (const [k, w] of (works ?? []).entries()) result.works.items.push(replacementWork(route, k, w));
    if (route.source && replacements.has(route.id)) result.acceptedReplacements.push(...route.source.intervals.map(i => ({ ...i })));
    result.issues.push(...routeIssues(route, legacy));
    const outcome = routeOutcome(ctx, route, legacy);
    result.buildings.push(...outcome.buildings);
    for (const r of outcome.receivers) {
      const seen = receivers.get(r.buildingIndex);
      if (!seen) { receivers.set(r.buildingIndex, r); continue; }
      // Distinct physical sources add as energy, never as dB or excess.
      const add = (a: number, b: number) => 10 * dm.log10(dm.pow(10, a / 10) + dm.pow(10, b / 10));
      receivers.set(r.buildingIndex, { ...seen, contributions: [...seen.contributions, ...r.contributions],
        dayDb: add(seen.dayDb, r.dayDb), nightDb: add(seen.nightDb, r.nightDb), action: seen.action === 'buy' || r.action === 'buy' ? 'buy' : 'retain' });
    }
  }
  result.receivers = [...receivers.values()];
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
    kind: w.kind === 'removal' ? 'formation' : w.kind === 'land' ? 'land' : 'connection', surfaces: [], claims: w.kind === 'removal' || w.kind === 'land' ? (route.source?.intervals ?? []).map(i => ({ ...i })) : [],
    geometry: { meshes: [], terrainMasks: [], measurements: [{ id: `${route.id}:${w.kind}:${k}:length`, meshIds: [], quantity: w.length, unit: 'm' }] },
    cost: w.cost, dependencies: [], accepted: true, label: w.label, at: { x: w.x, y: w.y, s: w.s } };
}
