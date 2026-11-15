// Railway routes (M1): a new conventional electrified line through the route kernel with the railway
// policy rows (data/categories.ts R1/R2: track geometry, 12.5 ‰ grade, SPOŽES prices, no level crossings)
// and CNOSSOS-EU train noise (rail-noise.ts) against the new-line limits 60 / 55 dB.
import { evaluate, type Design, type EvalContext, type EvalOptions, type Result } from './evaluate';
import { FREIGHT_TRAIN, PASSENGER_EMU, RAIL_TRAFFIC_PRIOR, type RailTrafficGroup } from './rail-noise';
import { modeCapability } from './mode-policy';
import { designSpeeds } from './data/norms';
import { RAIL_TIE_IN_M } from './data/railway';
import type { EndpointPair, ProjectDesign, RouteDesign } from './project';

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
      operations: { ...RAIL_TRAFFIC_PRIOR, passengerSpeed: speed, freightSpeed: 100 } } };
}

/** The scenario's mission made by a railway: same ports and time target; demand = the prior's trains. */
export type RailTrains = { passengerDay: number; passengerNight: number; freightDay: number; freightNight: number };
export const trainsPerDay = (t: RailTrains = RAIL_TRAFFIC_PRIOR) => t.passengerDay + t.passengerNight + t.freightDay + t.freightNight;
export function railwayMission(mission: ProjectDesign['mission'], trains: RailTrains = RAIL_TRAFFIC_PRIOR): ProjectDesign['mission'] {
  const perDay = trainsPerDay(trains);
  return { ...structuredClone(mission), connections: mission.connections.map(c => ({ ...c, kinds: ['railway'] as RouteDesign['kind'][],
    demand: { kind: 'railway' as const, trainsPerDay: perDay } })) };
}

/** A fresh railway mission: the base project's mission road becomes a railway between the same ports. */
export function createRailwayProject(base: ProjectDesign, d: Design, trains: RailTrains = RAIL_TRAFFIC_PRIOR): ProjectDesign {
  const mission = base.routes.find(r => r.role === 'mission');
  if (!mission) throw new Error('Mission route needed');
  if (d.category !== 'R1' && d.category !== 'R2') throw new Error('A railway needs the R1 or R2 category');
  const rail: RailwayRoute = { ...createRailwayRoute('route:railway', 'Railway', mission.endpoints, d.category === 'R1' ? 1 : 2, d.speed), role: 'mission' };
  rail.specification.operations = { ...rail.specification.operations, ...trains };
  return replaceRailwayFromDesign({ ...structuredClone(base), routes: [rail], corridors: [], connections: [], mission: railwayMission(base.mission, trains) }, rail.id, d);
}

/** The route's trains as noise groups (both directions, PROVISIONAL compositions in rail-noise.ts). */
export function railTraffic(route: RailwayRoute): RailTrafficGroup[] {
  const o = route.specification.operations;
  return [{ train: PASSENGER_EMU, speed: o.passengerSpeed, day: o.passengerDay, night: o.passengerNight },
    { train: FREIGHT_TRAIN, speed: o.freightSpeed, day: o.freightDay, night: o.freightNight }].filter(g => g.speed > 0 && g.day + g.night > 0);
}

export type RailwayEvaluation = { status: 'evaluated'; result: Result } | { status: 'incomplete'; reason: 'unsupported-policy'
  | 'unsupported-alignment' | 'unresolved-binding' | 'unimplemented-tangent' | 'source-needs-network' | 'mission-needs-network' | 'unsupported-crossing' };
export function evaluateProjectRailway(ctx: EvalContext, project: ProjectDesign, routeId: string, objectData: string,
  options: Pick<EvalOptions, 'preview' | 'materialValue'> = {}): RailwayEvaluation {
  const route = project.routes.find(r => r.id === routeId);
  if (!route || route.kind !== 'railway') throw new Error('Unknown railway');
  if (!modeCapability('railway').scoring) return { status: 'incomplete', reason: 'unsupported-policy' };
  const s = route.specification;
  if (s.policy !== RAILWAY_POLICY || s.gaugeMm !== 1435 || s.electrification !== 'AC25kV' || !designSpeeds(categoryOf(route)).includes(s.designSpeed))
    return { status: 'incomplete', reason: 'unsupported-policy' };
  if (route.alignment.kind !== 'pi' || !['auto', 'manual'].includes(route.alignment.vertical.kind)) return { status: 'incomplete', reason: 'unsupported-alignment' };
  if (project.objectData !== objectData || route.endpoints.a.binding !== 'resolved' || route.endpoints.b.binding !== 'resolved')
    return { status: 'incomplete', reason: 'unresolved-binding' };
  if (route.endpoints.a.tangent || route.endpoints.b.tangent) return { status: 'incomplete', reason: 'unimplemented-tangent' };
  if (route.source) return { status: 'incomplete', reason: 'source-needs-network' };
  for (const c of route.alignment.controls.crossings ?? []) {
    if (c.target.kind !== 'legacy-way') return { status: 'incomplete', reason: 'unsupported-crossing' };
    if (c.target.objectData !== project.objectData) return { status: 'incomplete', reason: 'unresolved-binding' };
  }
  // A mission railway must be what the mission asks for, between its ports (as the road kernel checks).
  const goal = route.role === 'mission' ? project.mission.connections[0] : undefined;
  if (route.role === 'mission') {
    const ends = [route.endpoints.a, route.endpoints.b];
    if (project.mission.connections.length !== 1 || !goal!.kinds.includes('railway') || (goal!.demand && goal!.demand.kind !== 'railway')
      || ends.some(e => e.anchor.kind !== 'mission') || (ends[0].anchor as { portId: string }).portId !== goal!.from || (ends[1].anchor as { portId: string }).portId !== goal!.to)
      return { status: 'incomplete', reason: 'mission-needs-network' };
    for (const e of ends) {
      const port = project.mission.ports.find(p => p.id === (e.anchor as { portId: string }).portId);
      if (!port || Math.hypot(e.position.x - port.position.x, e.position.y - port.position.y, e.position.z - port.position.z) > 1e-6)
        return { status: 'incomplete', reason: 'unresolved-binding' };
    }
  }
  const a = route.endpoints.a.position, b = route.endpoints.b.position;
  const explicitZ = (p: typeof a) => p.z === ctx.terrain.heightAt(p.x, p.y) ? undefined : p.z;
  // An end on an existing railway joins it there (a station): its first metres share that track's space.
  const onRail = (p: typeof a) => [-1, 0, 1].some(i => [-1, 0, 1].some(j => ctx.terrain.crossing(p.x + i * ctx.terrain.cell, p.y + j * ctx.terrain.cell) === 2));
  const tieIn = { a: onRail(a) ? RAIL_TIE_IN_M : 0, b: onRail(b) ? RAIL_TIE_IN_M : 0 };
  return { status: 'evaluated', result: evaluate({ ...ctx, a, b, scenario: { ...ctx.scenario, maxTravelMin: goal?.maxTravelMin ?? ctx.scenario.maxTravelMin } },
    railwayDesign(project, route), { ...options, endpointElevations: { a: explicitZ(a), b: explicitZ(b) }, railTraffic: railTraffic(route), ...(tieIn.a || tieIn.b ? { railTieIn: tieIn } : {}),
      goals: { time: goal?.maxTravelMin !== undefined, capacity: false } }) };
}

