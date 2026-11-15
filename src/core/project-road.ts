// Explicit dispatch boundary for the legacy road kernel. This is a ROUTE evaluation, not a network bill.
import { evaluate, type EvalContext, type EvalOptions, type Result } from './evaluate';
import { legacyDesignForRoute } from './project-legacy';
import { modeCapability } from './mode-policy';
import type { ProjectDesign, RoadSpec, RouteDesign, XYZ } from './project';
import type { RoadNet } from './roadnet';
import { tieInChecks, tieIns } from './tie-in';
import { replacementWorks, type Replacement } from './project-replacement';

export type ProjectRoadEvaluation =
  /** `unpriced`: the road itself was engineered, but the project cannot price this change yet. */
  | { status: 'evaluated'; result: Result; unpriced?: ('source-needs-network' | 'traffic-unknown')[];
      /** Ends joined to an existing ground road whose junction this road's bill includes. */
      junctionEnds?: ('a' | 'b')[];
      /** A rebuilt stretch: removing its old road and reconnecting its side roads (C1 b). */
      replacement?: Replacement }
  | { status: 'incomplete'; reason: 'unsupported-mode' | 'unsupported-policy' | 'unsupported-alignment'
      | 'unresolved-binding' | 'unimplemented-tangent' | 'source-needs-network' | 'mission-needs-network' | 'unsupported-crossing' };

/** Legacy road-net way of each mapped source (pack sidecar `legacyNetIndex`), to leave a rebuilt
 * stretch out of the network its own replacement is checked against. */
export type SourceWays = ReadonlyMap<string, number>;
const cutNets: { key: string; roads: RoadNet; base: RoadNet }[] = [];
/** The existing network without the stretches this route rebuilds (bounded cache: drags reuse it). */
function networkWithout(roads: RoadNet, route: RouteDesign, sourceWays: SourceWays | undefined): RoadNet | null {
  const intervals = route.source?.intervals ?? [];
  if (intervals.length !== 1) return null;
  const way = sourceWays?.get(intervals[0].sourceId);
  if (way === undefined) return null;
  // Interval ends are the route's end anchors (promotion invariant); measured on the legacy way itself.
  const a = route.endpoints.a.position, b = route.endpoints.b.position;
  const da = roads.wayStation(way, a.x, a.y), db = roads.wayStation(way, b.x, b.y);
  const key = `${way}:${Math.min(da, db).toFixed(2)}:${Math.max(da, db).toFixed(2)}`;
  const hit = cutNets.find(c => c.key === key && c.base === roads);
  if (hit) return hit.roads;
  const cut = roads.without([{ way, d0: Math.min(da, db), d1: Math.max(da, db) }]);
  cutNets.unshift({ key, roads: cut, base: roads }); cutNets.length = Math.min(cutNets.length, 4);
  return cut;
}
/** Cross-sections the road kernel prices for each legal class (S 7.5 for class II/III, S 9.5 for class I/II,
 * S 11.5 for class I); the legal class itself selects no other rule in this kernel. */
const legalClassFits = (spec: RoadSpec) => ({ 'S7.5': ['II', 'III'], 'S9.5': ['I', 'II'], 'S11.5': ['I'] } as Record<string, string[]>)[spec.crossSection]?.includes(spec.legalClass) ?? false;

export function evaluateProjectRoad(ctx: EvalContext, project: ProjectDesign, routeId: string,
  objectData: string, options: Pick<EvalOptions, 'preview' | 'materialValue'> & { sourceWays?: SourceWays;
    /** Ends on another designed road follow that road's CURRENT line (its nearest point and height). */
    ends?: { a?: XYZ; b?: XYZ } } = {}): ProjectRoadEvaluation {
  const route = project.routes.find(r => r.id === routeId);
  if (!route) throw new Error('Unknown project route');
  // BEFORE categories, horizontal/vertical norms, AADT, pricing or emissions are selected.
  if (!modeCapability(route.kind).scoring || route.kind !== 'road') return { status: 'incomplete', reason: 'unsupported-mode' };
  const spec = route.specification;
  if (spec.policy !== 'legacy-road' || ![70, 80, 90].includes(spec.designSpeed) || spec.crossSection === 'existing'
    || !legalClassFits(spec)) return { status: 'incomplete', reason: 'unsupported-policy' };
  if (project.objectData !== objectData || route.endpoints.a.binding !== 'resolved' || route.endpoints.b.binding !== 'resolved')
    return { status: 'incomplete', reason: 'unresolved-binding' };
  if (route.endpoints.a.tangent || route.endpoints.b.tangent) return { status: 'incomplete', reason: 'unimplemented-tangent' };
  // A rebuilt stretch is engineered against the network without its own old stretch; it needs the
  // sidecar's link to the legacy road net, and its replacement is not priced yet (C1 b).
  let roads = ctx.roads, sourceWay: number | undefined;
  if (route.source) {
    sourceWay = options.sourceWays?.get(route.source.intervals[0]?.sourceId ?? '');
    const cut = route.role === 'auxiliary' && ctx.roads ? networkWithout(ctx.roads, route, options.sourceWays) : null;
    if (!cut) return { status: 'incomplete', reason: 'source-needs-network' };
    roads = cut;
  }
  if (route.alignment.kind !== 'pi' || !['auto', 'manual'].includes(route.alignment.vertical.kind)) return { status: 'incomplete', reason: 'unsupported-alignment' };
  const mission = route.role === 'mission';
  const goals = project.mission.connections;
  if (mission && (goals.length !== 1 || !goals[0].kinds.includes('road')
    || route.endpoints.a.anchor.kind !== 'mission' || route.endpoints.b.anchor.kind !== 'mission'
    || route.endpoints.a.anchor.portId !== goals[0].from || route.endpoints.b.anchor.portId !== goals[0].to))
    return { status: 'incomplete', reason: 'mission-needs-network' };
  if (mission) for (const e of [route.endpoints.a, route.endpoints.b]) {
    const anchor = e.anchor;
    const port = anchor.kind === 'mission' ? project.mission.ports.find(p => p.id === anchor.portId) : undefined;
    if (!port || Math.hypot(e.position.x - port.position.x, e.position.y - port.position.y, e.position.z - port.position.z) > 1e-6)
      return { status: 'incomplete', reason: 'unresolved-binding' };
  }
  const goal = mission ? goals[0] : undefined;
  if (goal?.demand && goal.demand.kind !== 'road') return { status: 'incomplete', reason: 'mission-needs-network' };
  for (const c of route.alignment.controls.crossings ?? []) {
    if (c.target.kind !== 'legacy-way') return { status: 'incomplete', reason: 'unsupported-crossing' };
    if (c.target.objectData !== project.objectData) return { status: 'incomplete', reason: 'unresolved-binding' };
  }
  const design = legacyDesignForRoute(project, routeId);
  const a = options.ends?.a ?? route.endpoints.a.position, b = options.ends?.b ?? route.endpoints.b.position;
  // A ground-level end keeps the kernel's own terrain sample at its end station (legacy, bit-exact);
  // only an explicit non-ground XYZ (e.g. another road's deck) overrides it.
  const explicitZ = (p: typeof a) => p.z === ctx.terrain.heightAt(p.x, p.y) ? undefined : p.z;
  // A side road's ends on existing ground roads are junction works of this road (C1 a); a rebuilt
  // stretch's ends continue as its old road.
  const ties = route.role === 'auxiliary' && roads ? tieIns(roads, route.endpoints, !!route.source) : [];
  const junctions = ties.length ? { junctions: [...ctx.junctions ?? [], ...ties.map(t => t.junction)] } : {};
  const result = evaluate({ ...ctx, roads, ...junctions, a, b, scenario: { ...ctx.scenario,
    traffic: spec.operations.aadt, heavyShare: spec.operations.heavyShare,
    maxTravelMin: goal?.maxTravelMin ?? ctx.scenario.maxTravelMin } }, design,
  { ...options, endpointElevations: { a: explicitZ(a), b: explicitZ(b) }, operatingSpeed: spec.operations.speed,
    capacityTraffic: goal?.demand?.kind === 'road' ? goal.demand.aadt : undefined,
    goals: { time: mission && goal?.maxTravelMin !== undefined, capacity: mission && goal?.demand !== undefined } });
  if (ties.length && roads && !options.preview) {
    const found = tieInChecks(ties, result, roads, ctx.terrain, ctx.buildings);
    if (found.length) { result.violations.push(...found); result.valid = false; }
  }
  // The replacement's own works; without the old road's link (no road links) it cannot be priced.
  const replacement = route.source && sourceWay !== undefined && ctx.roads && !options.preview
    ? replacementWorks(route, result, ctx.roads, sourceWay, project.connections, id => options.sourceWays?.get(id)) : undefined;
  if (replacement?.violations.length) { result.violations.push(...replacement.violations); result.valid = false; }
  const unpriced = [...route.source && !replacement && !options.preview ? ['source-needs-network' as const] : [], ...spec.operations.trafficUnknown ? ['traffic-unknown' as const] : []];
  const junctionEnds = ties.filter(t => t.junction.kind !== 'continuation').map(t => t.end);
  return { status: 'evaluated', result, ...(unpriced.length ? { unpriced } : {}), ...(junctionEnds.length ? { junctionEnds } : {}),
    ...(replacement ? { replacement } : {}) };
}
