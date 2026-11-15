// Railway routes (M1): a new conventional electrified line through the route kernel with the railway
// policy rows (data/categories.ts R1/R2: track geometry, SPOŽES prices, no level crossings). Train noise
// and the freight ruling gradient have no sourced Czech values (research/30, /32): a railway is shown,
// checked and billed, but stays unpriced in the project until those checks exist.
import { evaluate, type Design, type EvalContext, type EvalOptions, type Result } from './evaluate';
import { designSpeeds } from './data/norms';
import type { EndpointPair, ProjectDesign, ProjectIssue, RouteDesign } from './project';

export const RAILWAY_POLICY = 'conventional-new';
export type RailwayRoute = Extract<RouteDesign, { kind: 'railway' }>;
const categoryOf = (route: RailwayRoute) => route.specification.tracks === 1 ? 'R1' as const : 'R2' as const;

export function railwayDesign(project: ProjectDesign, route: RouteDesign): Design {
  if (route.kind !== 'railway' || route.alignment.kind !== 'pi') throw new Error('Not an editable railway');
  const a = route.alignment, v = a.vertical;
  if (v.kind !== 'auto' && v.kind !== 'manual') throw new Error('Unsupported vertical authority');
  const { crossings, ...controls } = a.controls;
  const crossingOverrides = crossings?.map(c => {
    if (c.target.kind !== 'legacy-way' || c.target.objectData !== project.objectData) throw new Error('Crossing binding needs repair');
    return { roadId: c.target.roadId, type: c.choice };
  });
  return structuredClone({ ...controls, category: categoryOf(route), speed: route.specification.designSpeed, pis: a.pis,
    profileMode: v.kind, vpis: v.kind === 'manual' ? v.vpis : v.manualVpis ?? [], gradePins: v.kind === 'auto' ? v.pins : v.autoPins,
    crossingOverrides, buildingOverrides: project.buildingOverrides, objectData: project.objectData });
}

export function replaceRailwayFromDesign(project: ProjectDesign, routeId: string, d: Design): ProjectDesign {
  const next = structuredClone(project), route = next.routes.find(r => r.id === routeId);
  if (!route || route.kind !== 'railway' || route.alignment.kind !== 'pi') throw new Error('Not an editable railway');
  if ((d.category !== 'R1' && d.category !== 'R2') || !designSpeeds(d.category).includes(d.speed)) throw new Error('Wrong category for a railway');
  const { category, speed, pis, profileMode, vpis, gradePins, crossingOverrides, buildingOverrides, objectData: _o, ...controls } = structuredClone(d);
  route.alignment = { kind: 'pi', pis, controls: { ...controls, ...(crossingOverrides === undefined ? {}
    : { crossings: crossingOverrides.map(c => ({ choice: c.type, target: { kind: 'legacy-way' as const, objectData: project.objectData, roadId: c.roadId } })) }) },
    vertical: profileMode === 'auto' ? { kind: 'auto', pins: gradePins ?? [], manualVpis: vpis }
      : { kind: 'manual', vpis, ...(gradePins === undefined ? {} : { autoPins: gradePins }) } };
  route.specification = { ...route.specification, tracks: category === 'R1' ? 1 : 2, designSpeed: speed,
    operations: { ...route.specification.operations, passengerSpeed: speed } };
  next.buildingOverrides = buildingOverrides ?? [];
  return next;
}

/** A new electrified line between two fixed ends. Train counts are explicit game assumptions until a
 * scenario supplies a timetable; they do not feed any noise result (none is computed). */
export function createRailwayRoute(id: string, name: string, endpoints: EndpointPair, tracks: 1 | 2 = 2, speed = 160): RailwayRoute {
  return { id, name, role: 'auxiliary', revision: 0, kind: 'railway', acousticSourceId: `acoustic:${id}`, endpoints: structuredClone(endpoints),
    alignment: { kind: 'pi', pis: [], controls: {}, vertical: { kind: 'auto', pins: [] } },
    specification: { kind: 'railway', policy: RAILWAY_POLICY, designSpeed: speed, gaugeMm: 1435, tracks, electrification: 'AC25kV',
      operations: { passengerDay: 0, passengerNight: 0, freightDay: 0, freightNight: 0, passengerSpeed: speed, freightSpeed: 100 } } };
}

export type RailwayEvaluation = { status: 'evaluated'; result: Result } | { status: 'incomplete'; reason: 'unsupported-policy' | 'unsupported-alignment' | 'unresolved-binding' };
export function evaluateProjectRailway(ctx: EvalContext, project: ProjectDesign, routeId: string,
  options: Pick<EvalOptions, 'preview' | 'materialValue'> = {}): RailwayEvaluation {
  const route = project.routes.find(r => r.id === routeId);
  if (!route || route.kind !== 'railway') throw new Error('Unknown railway');
  const s = route.specification;
  if (s.policy !== RAILWAY_POLICY || s.gaugeMm !== 1435 || s.electrification !== 'AC25kV' || !designSpeeds(categoryOf(route)).includes(s.designSpeed))
    return { status: 'incomplete', reason: 'unsupported-policy' };
  if (route.alignment.kind !== 'pi' || !['auto', 'manual'].includes(route.alignment.vertical.kind)) return { status: 'incomplete', reason: 'unsupported-alignment' };
  if (route.endpoints.a.binding !== 'resolved' || route.endpoints.b.binding !== 'resolved') return { status: 'incomplete', reason: 'unresolved-binding' };
  const a = route.endpoints.a.position, b = route.endpoints.b.position;
  const explicitZ = (p: typeof a) => p.z === ctx.terrain.heightAt(p.x, p.y) ? undefined : p.z;
  return { status: 'evaluated', result: evaluate({ ...ctx, a, b }, railwayDesign(project, route),
    { ...options, endpointElevations: { a: explicitZ(a), b: explicitZ(b) }, goals: { time: false, capacity: false } }) };
}

/** What a railway cannot be checked for yet (shown separately from violations; blocks a project price). */
export function railwayPendingIssues(routeId: string): ProjectIssue[] {
  const pending = (code: string, title: string, rule: string): ProjectIssue => ({ code, blocking: 'incomplete', check: 'not-checked',
    scope: { routeIds: [routeId] }, locations: [],
    violation: { kind: 'crossing', basis: 'engine', title, fix: 'The railway is shown and billed; its price joins the project once this is checked', rule } });
  return [
    pending('rail-noise', 'Train noise is not checked yet', 'Engine limit: no sourced Czech train noise emission data yet (research/32); the line is never treated as quiet.'),
    pending('rail-gradient', 'Steepest grade for freight trains is not checked yet', 'Engine limit: no sourced ruling gradient for mixed passenger and freight lines (research/30); only the general 4 % ceiling is checked.'),
  ];
}
