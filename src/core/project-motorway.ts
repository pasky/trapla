// Paired motorway corridor (M1): ONE engineering evaluation of the common spine, never a sum of
// two carriageway kernels. Directional children carry identity, operations and acoustic sources;
// the spine owns the alignment, profile and structure controls (C0 corridor contract).
import type { Design, EvalContext, EvalOptions, Result } from './evaluate';
import { evaluate } from './evaluate';
import { CATEGORIES } from './data/categories';
import { designSpeeds } from './data/norms';
import { modeCapability } from './mode-policy';
import type { CorridorDesign, ProjectDesign, RouteDesign, RoadOperations } from './project';

/** Policy of a paired D 27.5 corridor priced as one whole-category SPK body (research/22, /29). */
export const MOTORWAY_POLICY = 'paired-d27.5';
export const MOTORWAY_CATEGORY = 'D27.5' as const;

export type MotorwayRoute = Extract<RouteDesign, { kind: 'motorway' }>;

/** The corridor owning a motorway child route, if any. */
export function corridorOfRoute(project: ProjectDesign, routeId: string): CorridorDesign | undefined {
  return project.corridors.find(c => c.children.forward === routeId || c.children.reverse === routeId);
}

/** Corridor-wide traffic: the children's directional demands added (never one copied twice). */
export function corridorOperations(project: ProjectDesign, corridor: CorridorDesign): RoadOperations {
  const kids = [corridor.children.forward, corridor.children.reverse].map(id => project.routes.find(r => r.id === id));
  if (kids.some(k => !k || k.kind !== 'motorway')) throw new Error('Corridor children must be motorway routes');
  const [f, r] = kids as MotorwayRoute[], aadt = f.specification.operations.aadt + r.specification.operations.aadt;
  const heavy = aadt > 0 ? (f.specification.operations.aadt * f.specification.operations.heavyShare
    + r.specification.operations.aadt * r.specification.operations.heavyShare) / aadt : f.specification.operations.heavyShare;
  return { aadt, heavyShare: heavy, speed: f.specification.operations.speed };
}

/** Kernel design of a paired corridor's spine (road widgets edit it through the active-route adapter). */
export function corridorDesign(project: ProjectDesign, corridor: CorridorDesign): Design {
  if (corridor.mode !== 'paired') throw new Error('Separate carriageways have their own alignments');
  const forward = project.routes.find(r => r.id === corridor.children.forward);
  if (!forward || forward.kind !== 'motorway') throw new Error('Corridor child missing');
  const spine = corridor.spine, spec = forward.specification;
  if (spine.kind !== 'pi' || (spine.vertical.kind !== 'auto' && spine.vertical.kind !== 'manual')) throw new Error('Spine needs bend controls');
  const v = spine.vertical;
  const { crossings, ...controls } = spine.controls;
  const crossingOverrides = crossings?.map(c => {
    if (c.target.kind !== 'legacy-way' || c.target.objectData !== project.objectData) throw new Error('Crossing binding needs repair');
    return { roadId: c.target.roadId, type: c.choice };
  });
  return structuredClone({ ...controls, category: spec.crossSection as typeof MOTORWAY_CATEGORY, speed: spec.designSpeed,
    pis: spine.pis, profileMode: v.kind, vpis: v.kind === 'manual' ? v.vpis : v.manualVpis ?? [],
    gradePins: v.kind === 'auto' ? v.pins : v.autoPins, crossingOverrides, buildingOverrides: project.buildingOverrides,
    objectData: project.objectData });
}

/** Write the edited spine back; speed edits apply to both directions. Building choices stay project-wide. */
export function replaceCorridorFromDesign(project: ProjectDesign, corridorId: string, d: Design): ProjectDesign {
  const next = structuredClone(project), corridor = next.corridors.find(c => c.id === corridorId);
  if (!corridor || corridor.mode !== 'paired') throw new Error('Unknown paired corridor');
  if (d.category !== MOTORWAY_CATEGORY || !designSpeeds(d.category).includes(d.speed)) throw new Error('Motorway design needs a motorway category and speed');
  if (d.objectData && d.objectData !== project.objectData) throw new Error('Foreign object binding needs repair');
  const { category: _c, speed, pis, profileMode, vpis, gradePins, crossingOverrides, buildingOverrides, objectData: _o, ...controls } = structuredClone(d);
  corridor.spine = { kind: 'pi', pis, controls: { ...controls, ...(crossingOverrides === undefined ? {}
    : { crossings: crossingOverrides.map(c => ({ choice: c.type, target: { kind: 'legacy-way' as const, objectData: project.objectData, roadId: c.roadId } })) }) },
    vertical: profileMode === 'auto' ? { kind: 'auto', pins: gradePins ?? [], manualVpis: vpis }
      : { kind: 'manual', vpis, ...(gradePins === undefined ? {} : { autoPins: gradePins }) } };
  for (const id of [corridor.children.forward, corridor.children.reverse]) {
    const r = next.routes.find(x => x.id === id);
    if (r?.kind === 'motorway' && r.specification.designSpeed !== speed) {
      r.specification.designSpeed = speed;
      if (r.specification.operations.speedPolicy !== 'independent') r.specification.operations.speed = speed;
    }
  }
  next.buildingOverrides = buildingOverrides ?? [];
  return next;
}

export type CorridorEvaluation =
  | { status: 'evaluated'; result: Result }
  | { status: 'incomplete'; reason: 'unsupported-mode' | 'unsupported-policy' | 'unsupported-alignment' | 'unresolved-binding'
      | 'mission-needs-network' | 'unsupported-crossing' | 'separate-carriageways' };

/** One kernel evaluation of the paired corridor. Ends must be the mission's scenario ports: the
 * motorway continues beyond the map there (SPK's whole-category norm already includes earth-built
 * interchange branches, research/29 §3); any other end needs an interchange nobody has built. */
export function evaluateProjectCorridor(ctx: EvalContext, project: ProjectDesign, corridorId: string, objectData: string,
  options: Pick<EvalOptions, 'preview' | 'materialValue'> = {}): CorridorEvaluation {
  const corridor = project.corridors.find(c => c.id === corridorId);
  if (!corridor) throw new Error('Unknown corridor');
  if (!modeCapability('motorway').scoring) return { status: 'incomplete', reason: 'unsupported-mode' };
  if (corridor.mode !== 'paired') return { status: 'incomplete', reason: 'separate-carriageways' };
  const kids = [corridor.children.forward, corridor.children.reverse].map(id => project.routes.find(r => r.id === id)) as MotorwayRoute[];
  if (kids.some(k => k.specification.policy !== MOTORWAY_POLICY || k.specification.crossSection !== MOTORWAY_CATEGORY
    || !designSpeeds(MOTORWAY_CATEGORY).includes(k.specification.designSpeed) || k.specification.designSpeed !== kids[0].specification.designSpeed))
    return { status: 'incomplete', reason: 'unsupported-policy' };
  if (corridor.spine.kind !== 'pi' || !['auto', 'manual'].includes(corridor.spine.vertical.kind)) return { status: 'incomplete', reason: 'unsupported-alignment' };
  if (project.objectData !== objectData || [corridor.endpoints.a, corridor.endpoints.b].some(e => e.binding !== 'resolved' || e.tangent))
    return { status: 'incomplete', reason: 'unresolved-binding' };
  for (const c of corridor.spine.controls.crossings ?? []) {
    if (c.target.kind !== 'legacy-way') return { status: 'incomplete', reason: 'unsupported-crossing' };
    if (c.target.objectData !== project.objectData) return { status: 'incomplete', reason: 'unresolved-binding' };
  }
  const goals = project.mission.connections, goal = goals[0];
  const ends = [corridor.endpoints.a.anchor, corridor.endpoints.b.anchor];
  if (goals.length !== 1 || !goal.kinds.includes('motorway') || ends.some(a => a.kind !== 'mission')
    || (ends[0] as { portId: string }).portId !== goal.from || (ends[1] as { portId: string }).portId !== goal.to
    || kids.some(k => k.role !== 'mission') || (goal.demand && goal.demand.kind !== 'road'))
    return { status: 'incomplete', reason: 'mission-needs-network' };
  for (const e of [corridor.endpoints.a, corridor.endpoints.b]) {
    const anchor = e.anchor as { portId: string }, port = project.mission.ports.find(p => p.id === anchor.portId);
    if (!port || Math.hypot(e.position.x - port.position.x, e.position.y - port.position.y, e.position.z - port.position.z) > 1e-6)
      return { status: 'incomplete', reason: 'unresolved-binding' };
  }
  const ops = corridorOperations(project, corridor), a = corridor.endpoints.a.position, b = corridor.endpoints.b.position;
  const explicitZ = (p: typeof a) => p.z === ctx.terrain.heightAt(p.x, p.y) ? undefined : p.z;
  const result = evaluate({ ...ctx, a, b, scenario: { ...ctx.scenario, traffic: ops.aadt, heavyShare: ops.heavyShare,
    maxTravelMin: goal.maxTravelMin ?? ctx.scenario.maxTravelMin } }, corridorDesign(project, corridor),
  { ...options, endpointElevations: { a: explicitZ(a), b: explicitZ(b) }, operatingSpeed: ops.speed,
    capacityTraffic: goal.demand?.kind === 'road' ? goal.demand.aadt : undefined,
    goals: { time: goal.maxTravelMin !== undefined, capacity: goal.demand !== undefined } });
  return { status: 'evaluated', result };
}

/** A fresh paired motorway mission: corridor A→B plus two directional children (half the demand each). */
export function createMotorwayProject(base: ProjectDesign, d: Design, operations: { aadt: number; heavyShare: number }): ProjectDesign {
  const mission = base.routes.find(r => r.role === 'mission');
  if (!mission) throw new Error('Mission route needed');
  if (d.category !== MOTORWAY_CATEGORY) throw new Error('Motorway needs the D 27.5 category');
  const { a, b } = mission.endpoints;
  const spec = (aadt: number) => ({ kind: 'motorway' as const, policy: MOTORWAY_POLICY, crossSection: MOTORWAY_CATEGORY, designSpeed: d.speed,
    operations: { aadt, heavyShare: operations.heavyShare, speed: d.speed, speedPolicy: 'design' as const } });
  const corridorId = 'corridor:motorway', half = operations.aadt / 2;
  const child = (id: string, name: string, reverse: boolean): MotorwayRoute => ({ id, name, role: 'mission', revision: 0, kind: 'motorway',
    acousticSourceId: `acoustic:${id}`, endpoints: reverse ? { a: structuredClone(b), b: structuredClone(a) } : structuredClone({ a, b }),
    alignment: { kind: 'corridor', corridorId, direction: reverse ? 'reverse' : 'forward' }, specification: spec(half) });
  const project: ProjectDesign = { ...structuredClone(base), routes: [
    child('route:motorway-forward', 'Motorway', false), child('route:motorway-reverse', 'Motorway (return)', true)], connections: [],
  corridors: [{ id: corridorId, revision: 0, kind: 'motorway', mode: 'paired', endpoints: structuredClone({ a, b }),
    children: { forward: 'route:motorway-forward', reverse: 'route:motorway-reverse' }, formationPolicy: MOTORWAY_POLICY, correspondence: [],
    spine: { kind: 'pi', pis: [], controls: {}, vertical: { kind: 'auto', pins: [] } } }],
  mission: { ...structuredClone(base.mission), connections: base.mission.connections.map(c => ({ ...c, kinds: ['motorway'] as RouteDesign['kind'][] })) } };
  return replaceCorridorFromDesign(project, corridorId, d);
}

/** Crown width the renderer/footprint screens use for a corridor (whole formation). */
export const motorwayCrownWidth = () => CATEGORIES[MOTORWAY_CATEGORY].crownWidth;
