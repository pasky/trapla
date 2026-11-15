// Project publication boundary. Legacy single-road semantics remain exact; unimplemented interactions
// expose proposed geometry with null project total, never a sum of independently completed road bills.
import { CATEGORIES } from './data/categories';
import { NOISE } from './data/urban';
import type { EvalContext, Result } from './evaluate';
import type { ProjectEnvironment, ProjectIssue, ProjectResult, ProjectSnapshot, RouteDesign, RouteResult, TransportSurface } from './project';
import { evaluateProjectRoad } from './project-road';
import { assertProjectDesign } from './project-validation';
import { noiseSource } from './road-noise';

export interface ProjectEvalContext { legacy: EvalContext; environment: ProjectEnvironment }
const issue = (routeId: string, code: string): ProjectIssue => ({ code, scope: { routeIds: [routeId] }, locations: [], blocking: 'incomplete',
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
function routeProposal(ctx: ProjectEvalContext, snapshot: ProjectSnapshot, route: RouteDesign,
  preview = false, materialValue?: number): { route: RouteResult; issue?: ProjectIssue } {
  const evaluated = evaluateProjectRoad(ctx.legacy, snapshot.design, route.id, ctx.environment.objectData, { preview, materialValue });
  const legacy = evaluated.status === 'evaluated' ? evaluated.result : undefined;
  return { route: { routeId: route.id, revision: route.revision,
    engineeringRevision: `${snapshot.epoch}:${snapshot.revision}:${route.revision}:${preview ? 'preview' : 'full'}`,
    surface: legacy ? roadSurface(route, legacy) : referenceRoadSurface(ctx.legacy, route), geometry: null,
    ...(legacy ? { legacy } : {}), complete: false, valid: false, accepted: false, attributedCost: null, dependencies: [], influence: [] },
    ...(evaluated.status === 'incomplete' ? { issue: issue(route.id, evaluated.reason) } : {}) };
}
export function previewProjectRoute(ctx: ProjectEvalContext, snapshot: ProjectSnapshot, routeId: string, materialValue?: number): RouteResult {
  assertProjectDesign(snapshot.design);
  const route = snapshot.design.routes.find(r => r.id === routeId); if (!route) throw new Error('Unknown preview route');
  return routeProposal(ctx, snapshot, route, true, materialValue).route;
}

export function evaluateProject(ctx: ProjectEvalContext, snapshot: ProjectSnapshot): ProjectResult {
  assertProjectDesign(snapshot.design);
  const result: ProjectResult = { epoch: snapshot.epoch, revision: snapshot.revision, routes: {}, works: { items: [] },
    cost: { total: null, routes: {}, shared: 0, materialBalance: 'per-route' }, issues: [], acceptedReplacements: [], acceptedRenderReplacements: [],
    buildings: [], receivers: [], complete: false, valid: false,
    acousticScreen: { bounds: [], omittedDayEnergyUpperBound: Infinity, omittedNightEnergyUpperBound: Infinity, complete: false } };
  for (const route of snapshot.design.routes) {
    const proposal = routeProposal(ctx, snapshot, route);
    // Define arbitrary stable IDs safely, including object-prototype names.
    Object.defineProperty(result.routes, route.id, { value: proposal.route, enumerable: true, configurable: true, writable: true });
    if (proposal.issue) result.issues.push(proposal.issue);
  }
  const route = snapshot.design.routes[0], r = route ? result.routes[route.id]?.legacy : undefined;
  const legacyOnly = snapshot.design.routes.length === 1 && route.role === 'mission' && !route.source
    && snapshot.design.corridors.length === 0 && snapshot.design.connections.length === 0 && !!r && result.issues.length === 0;
  if (!legacyOnly || !r || route.kind !== 'road') {
    if (!result.issues.length) result.issues.push(issue(route?.id ?? '', 'network-accounting-pending'));
    return result;
  }
  // Compatibility facade only. There is exactly one kernel bill and one physical source;
  // this branch is NEVER used to add separate route bills or acquire a building twice.
  const rr = result.routes[route.id];
  rr.complete = true; rr.valid = r.valid; rr.accepted = r.valid; rr.attributedCost = r.cost.total;
  result.complete = true; result.valid = r.valid;
  result.cost.total = r.cost.total;
  Object.defineProperty(result.cost.routes, route.id, { value: r.cost.total, enumerable: true, configurable: true, writable: true });
  result.issues = r.violations.map(v => ({ code: v.kind, blocking: 'invalid', scope: { routeIds: [route.id] },
    locations: [{ routeId: route.id, s0: v.s0, s1: v.s1, ...(v.pi === undefined ? {} : { pi: v.pi }), ...(v.vpi === undefined ? {} : { vpi: v.vpi }) }],
    violation: { kind: v.kind, title: v.title, fix: v.fix, basis: v.basis, rule: v.rule, ...(v.detail ? { detail: v.detail } : {}) } }));
  result.buildings = [...r.demolished.map(b => ({ buildingIndex: b.j, action: 'demolish' as const, cost: b.cost })),
    ...r.boughtOut.map(b => ({ buildingIndex: b.j, action: 'buy' as const, cost: b.cost })),
    ...r.kept.map(b => ({ buildingIndex: b.j, action: 'retain' as const, cost: 0 }))];
  // Road periods share propagation/attenuation; recover their absolute levels from the legacy
  // controlling excess and fixed source offset. No multi-source inference is made from excess.
  const op = route.specification.operations, source = noiseSource(op.aadt, op.speed, { heavyShare: op.heavyShare });
  const levels = (excess: number) => Number.isFinite(source.excessDb) ? {
    day: source.dayDb - source.excessDb + excess, night: source.nightDb - source.excessDb + excess,
  } : { day: -Infinity, night: -Infinity };
  result.receivers = r.noise.receivers.map(receiver => {
    const raw = levels(receiver.raw), built = levels(receiver.mitigated);
    const height = NOISE.receiverHeight + ((ctx.legacy.buildings?.levels[receiver.j] ?? 1) - 1) * NOISE.storeyHeight;
    return { buildingIndex: receiver.j, height, contributions: [{ sourceId: route.acousticSourceId, routeId: route.id,
      buildingIndex: receiver.j, height, dayEnergy: 10 ** (raw.day / 10), nightEnergy: 10 ** (raw.night / 10), policy: 'legacy-road' }],
      dayDb: built.day, nightDb: built.night, dayLimit: NOISE.limitDayDb, nightLimit: NOISE.limitNightDb,
      action: receiver.status === 'bought' ? 'buy' as const : 'retain' as const };
  });
  // Legacy's all-height screen excludes only sub-limit receivers. One physical source means
  // that bound is sufficient; it is NOT a valid aggregate screen for two or more sources.
  result.acousticScreen = { bounds: [], omittedDayEnergyUpperBound: 10 ** (NOISE.limitDayDb / 10),
    omittedNightEnergyUpperBound: 10 ** (NOISE.limitNightDb / 10), complete: true };
  return result;
}
