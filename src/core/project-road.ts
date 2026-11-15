// Explicit dispatch boundary for the legacy road kernel. This is a ROUTE evaluation, not a network bill.
import { evaluate, type EvalContext, type EvalOptions, type Result } from './evaluate';
import { legacyDesignForRoute } from './project-legacy';
import { modeCapability } from './mode-policy';
import type { ProjectDesign } from './project';

export type ProjectRoadEvaluation =
  | { status: 'evaluated'; result: Result }
  | { status: 'incomplete'; reason: 'unsupported-mode' | 'unsupported-policy' | 'unsupported-alignment'
      | 'unresolved-binding' | 'unimplemented-tangent' | 'source-needs-network' | 'mission-needs-network' | 'unsupported-crossing' };

export function evaluateProjectRoad(ctx: EvalContext, project: ProjectDesign, routeId: string,
  objectData: string, options: Pick<EvalOptions, 'preview' | 'materialValue'> = {}): ProjectRoadEvaluation {
  const route = project.routes.find(r => r.id === routeId);
  if (!route) throw new Error('Unknown project route');
  // BEFORE categories, horizontal/vertical norms, AADT, pricing or emissions are selected.
  if (!modeCapability(route.kind).scoring || route.kind !== 'road') return { status: 'incomplete', reason: 'unsupported-mode' };
  const spec = route.specification;
  if (spec.policy !== 'legacy-road' || ![70, 80, 90].includes(spec.designSpeed) || spec.crossSection === 'existing'
    || spec.legalClass !== (spec.crossSection === 'S7.5' ? 'II' : 'I')) return { status: 'incomplete', reason: 'unsupported-policy' };
  if (project.objectData !== objectData || route.endpoints.a.binding !== 'resolved' || route.endpoints.b.binding !== 'resolved')
    return { status: 'incomplete', reason: 'unresolved-binding' };
  if (route.endpoints.a.tangent || route.endpoints.b.tangent) return { status: 'incomplete', reason: 'unimplemented-tangent' };
  if (route.source) return { status: 'incomplete', reason: 'source-needs-network' };
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
  const a = route.endpoints.a.position, b = route.endpoints.b.position;
  const result = evaluate({ ...ctx, a, b, scenario: { ...ctx.scenario,
    traffic: spec.operations.aadt, heavyShare: spec.operations.heavyShare,
    maxTravelMin: goal?.maxTravelMin ?? ctx.scenario.maxTravelMin } }, design,
  { ...options, endpointElevations: { a: a.z, b: b.z }, operatingSpeed: spec.operations.speed,
    capacityTraffic: goal?.demand?.kind === 'road' ? goal.demand.aadt : undefined,
    goals: { time: mission && goal?.maxTravelMin !== undefined, capacity: mission && goal?.demand !== undefined } });
  return { status: 'evaluated', result };
}
