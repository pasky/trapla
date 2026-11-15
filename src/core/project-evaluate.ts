// Project publication boundary. Legacy single-road semantics remain exact; unimplemented interactions
// expose proposed geometry with null project total, never a sum of independently completed road bills.
import { CATEGORIES } from './data/categories';
import { NOISE } from './data/urban';
import type { EvalContext, Result } from './evaluate';
import type { ProjectBuildingOutcome, ProjectEnvironment, ProjectIssue, ProjectReceiver, ProjectResult, ProjectSnapshot, RouteDesign, RouteResult, TransportSurface } from './project';
import { routeContacts, screenIndependence, type RouteContact } from './project-ledger';
import { evaluateProjectRoad, type SourceWays } from './project-road';
import { assertProjectDesign } from './project-validation';
import { noiseSource } from './road-noise';

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
  preview = false, materialValue?: number): { route: RouteResult; issue?: ProjectIssue } {
  const evaluated = evaluateProjectRoad(ctx.legacy, snapshot.design, route.id, ctx.environment.objectData, { preview, materialValue, sourceWays: ctx.sourceWays });
  const legacy = evaluated.status === 'evaluated' ? evaluated.result : undefined;
  return { route: { routeId: route.id, revision: route.revision,
    engineeringRevision: `${snapshot.epoch}:${snapshot.revision}:${route.revision}:${preview ? 'preview' : 'full'}`,
    surface: legacy ? roadSurface(route, legacy) : referenceRoadSurface(ctx.legacy, route), geometry: null,
    ...(legacy ? { legacy } : {}), complete: false, valid: false, accepted: false, attributedCost: null, dependencies: [], influence: [] },
    ...(evaluated.status === 'incomplete' ? { issue: issue(route.id, evaluated.reason) }
      : evaluated.unpriced ? { issue: { code: evaluated.unpriced, scope: { routeIds: [route.id] }, locations: [], blocking: 'incomplete' as const, ...UNPRICED[evaluated.unpriced] } } : {}) };
}
export function previewProjectRoute(ctx: ProjectEvalContext, snapshot: ProjectSnapshot, routeId: string, materialValue?: number): RouteResult {
  assertProjectDesign(snapshot.design);
  const route = snapshot.design.routes.find(r => r.id === routeId); if (!route) throw new Error('Unknown preview route');
  return routeProposal(ctx, snapshot, route, true, materialValue).route;
}

const defineRoute = <T>(record: Record<string, T>, id: string, value: T) =>
  // Define arbitrary stable IDs safely, including object-prototype names.
  Object.defineProperty(record, id, { value, enumerable: true, configurable: true, writable: true });
const routeIssues = (route: RouteDesign, r: Result): ProjectIssue[] => r.violations.map(v => ({ code: v.kind, blocking: 'invalid', check: 'violation', scope: { routeIds: [route.id] },
  locations: [{ routeId: route.id, s0: v.s0, s1: v.s1, ...(v.pi === undefined ? {} : { pi: v.pi }), ...(v.vpi === undefined ? {} : { vpi: v.vpi }) }],
  violation: { kind: v.kind, title: v.title, fix: v.fix, basis: v.basis, rule: v.rule, ...(v.detail ? { detail: v.detail } : {}) } }));
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
      buildingIndex: receiver.j, height, dayEnergy: 10 ** (raw.day / 10), nightEnergy: 10 ** (raw.night / 10), policy: 'legacy-road' }],
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
  for (const route of design.routes) {
    const proposal = routeProposal(ctx, snapshot, route);
    defineRoute(result.routes, route.id, proposal.route);
    if (proposal.route.legacy) engineered.push({ route, legacy: proposal.route.legacy });
    if (proposal.issue) { result.issues.push(proposal.issue); result.cost.unpriced.push({ routeId: route.id, reason: proposal.issue.code }); }
    else if (proposal.route.legacy) priced.push({ route, legacy: proposal.route.legacy });
  }
  // Keep each road's own bill and problems visible even while the project cannot be priced.
  for (const { route, legacy } of engineered) defineRoute(result.cost.alone, route.id, legacy.cost.total);
  const unprice = (routeIds: string[], reason: string) => {
    for (const routeId of routeIds) if (!result.cost.unpriced.some(u => u.routeId === routeId)) result.cost.unpriced.push({ routeId, reason });
  };
  // Every crossing/overlap between designed roads is reported on its own, whatever else is wrong.
  const corridorOf = new Map(design.corridors.flatMap(c => [[c.children.forward, c.id], [c.children.reverse, c.id]] as const));
  const surfaces = design.routes.flatMap(r => result.routes[r.id].surface ?? []);
  for (const c of routeContacts(surfaces, (a, b) => corridorOf.has(a) && corridorOf.get(a) === corridorOf.get(b))) {
    result.issues.push(contactIssue(c)); unprice(c.routeIds, contactIssue(c).code);
  }
  const missionRoutes = design.routes.filter(r => r.role === 'mission');
  if (design.mission.connections.length && missionRoutes.length !== 1) {
    result.issues.push(issue(missionRoutes[0]?.id ?? '', 'mission-needs-network'));
    unprice(missionRoutes.map(r => r.id), 'mission-needs-network');
  }
  // Joined roads share a junction nobody has checked yet.
  const joined = new Set<string>();
  // Only the mission road's own mission ports and free ends are evaluated as the legacy kernel does;
  // a tie-in to an existing road, another road or a mission port is a junction nobody has built or billed.
  for (const c of design.connections) {
    const routes = c.ports.flatMap(p => p.kind === 'route' ? [p.routeId] : []);
    for (const id of routes.length ? routes : design.routes.map(r => r.id)) joined.add(id);
  }
  for (const r of design.routes) for (const e of [r.endpoints.a, r.endpoints.b]) {
    if (e.anchor.kind === 'free' || (e.anchor.kind === 'mission' && r.role === 'mission')) continue;
    joined.add(r.id); if (e.anchor.kind === 'route') joined.add(e.anchor.routeId);
  }
  if (joined.size) { result.issues.push(issue([...joined][0], 'connection-pending')); unprice([...joined], 'connection-pending'); }
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
  if (priced.length === 1) {
    // Compatibility facade. One kernel bill and one physical source; never several bills added up.
    const { route, legacy: r } = priced[0], rr = result.routes[route.id];
    rr.complete = true; rr.valid = r.valid; rr.accepted = r.valid; rr.attributedCost = r.cost.total;
    result.complete = true; result.valid = r.valid; result.cost.total = r.cost.total;
    defineRoute(result.cost.routes, route.id, r.cost.total);
    result.issues = routeIssues(route, r);
    ({ buildings: result.buildings, receivers: result.receivers } = routeOutcome(ctx, route, r));
    // Legacy's all-height screen excludes only sub-limit receivers. One physical source means
    // that bound is sufficient; it is NOT a valid aggregate screen for two or more sources.
    result.acousticScreen = { bounds: [], omittedDayEnergyUpperBound: 10 ** (NOISE.limitDayDb / 10),
      omittedNightEnergyUpperBound: 10 ** (NOISE.limitNightDb / 10), complete: true };
    return result;
  }
  // Several roads: add their bills ONLY when nothing one builds, buys, closes or makes loud reaches another.
  // Unreachable in this wave (non-mission roads either end nowhere or have unpriced tie-ins); kept for C1.
  const screen = screenIndependence(priced.map(({ route, legacy }) => {
    const spec = route.specification, op = spec.kind === 'road' ? spec.operations : { aadt: Infinity, speed: Infinity, heavyShare: 1 };
    const halfWidth = spec.kind === 'road' && spec.crossSection !== 'existing' ? CATEGORIES[spec.crossSection].crownWidth / 2 : Infinity;
    return { routeId: route.id, result: legacy, aadt: op.aadt, speed: op.speed, heavyShare: op.heavyShare, halfWidth };
  }), ctx.legacy.buildings);
  if (!screen.independent) {
    for (const i of screen.interactions) { result.issues.push(interactionIssue(i.routeIds, i.reason, i.buildingIndex)); unprice(i.routeIds, i.reason); }
    return finish();
  }
  let total = 0, valid = true;
  const receivers = new Map<number, ProjectReceiver>();
  for (const { route, legacy } of priced) {
    const rr = result.routes[route.id];
    rr.complete = true; rr.valid = legacy.valid; rr.accepted = legacy.valid; rr.attributedCost = legacy.cost.total;
    defineRoute(result.cost.routes, route.id, legacy.cost.total);
    total += legacy.cost.total; valid &&= legacy.valid;
    result.issues.push(...routeIssues(route, legacy));
    const outcome = routeOutcome(ctx, route, legacy);
    result.buildings.push(...outcome.buildings);
    for (const r of outcome.receivers) {
      const seen = receivers.get(r.buildingIndex);
      if (!seen) { receivers.set(r.buildingIndex, r); continue; }
      // Distinct physical sources add as energy, never as dB or excess.
      const add = (a: number, b: number) => 10 * Math.log10(10 ** (a / 10) + 10 ** (b / 10));
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
