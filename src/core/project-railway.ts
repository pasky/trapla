// Railway routes (M1): a new conventional electrified line through the route kernel with the railway
// policy rows (data/categories.ts R1/R2: track geometry, 12.5 ‰ grade, SPOŽES prices, no level crossings)
// and CNOSSOS-EU train noise (rail-noise.ts) against the new-line limits 60 / 55 dB.
import { crossingOverridesOf, crossingTargetsOf } from './project-roadnet';
import { evaluate, type Design, type EvalContext, type EvalOptions, type Result } from './evaluate';
import { FREIGHT_TRAIN, PASSENGER_EMU, RAIL_TRAFFIC_PRIOR, type RailTrafficGroup } from './rail-noise';
import { modeCapability } from './mode-policy';
import { designSpeeds, horizontalRules, speedNorms } from './data/norms';
import { buildAlignment } from './horizontal';
import { ROAD_CHECKS, type TrackEnd } from './checks';
import { RAIL_MAX_GRADIENT, RAIL_TIE_IN_M, STATION_AXIS_RADIUS_M } from './data/railway';
import type { Terrain } from './terrain';
import * as dm from './detmath';
import type { ConnectionDesign, EndpointPair, ProjectDesign, RouteDesign, SourceInterval, SourceLocation, XYZ } from './project';
import type { ProjectTransportIndex } from './project-network';
import type { ProjectCommand } from '../project-store-contract';
import type { PI } from './horizontal';
import { applyKept, plannedKept } from './project-kept';
import type { ReplacementWork } from './project-replacement';
import { CATEGORIES } from './data/categories';
import { KIND } from './structures';

export const RAILWAY_POLICY = 'conventional-new';
/** PROVISIONAL game prior: freight trains run at 100 km/h, never faster than the line. */
const FREIGHT_SPEED = 100;
export type RailwayRoute = Extract<RouteDesign, { kind: 'railway' }>;
const categoryOf = (route: RailwayRoute) => route.specification.tracks === 1 ? 'R1' as const : 'R2' as const;

export function railwayDesign(project: ProjectDesign, route: RouteDesign): Design {
  if (route.kind !== 'railway' || route.alignment.kind !== 'pi') throw new Error('Not an editable railway');
  const a = route.alignment, v = a.vertical;
  if (v.kind !== 'auto' && v.kind !== 'manual') throw new Error('Unsupported vertical authority');
  const { crossings, ...controls } = a.controls;
  const crossingOverrides = crossings && crossingOverridesOf(project, crossings);
  return structuredClone({ ...controls, category: categoryOf(route), speed: route.specification.designSpeed, pis: a.pis,
    profileMode: v.kind, vpis: v.kind === 'manual' ? v.vpis : v.manualVpis ?? [], gradePins: v.kind === 'auto' ? v.pins : v.autoPins,
    crossingOverrides, buildingOverrides: project.buildingOverrides, objectData: project.objectData,
    ...(route.specification.maxGradient !== undefined ? { maxGradient: route.specification.maxGradient } : {}) });
}

export function replaceRailwayFromDesign(project: ProjectDesign, routeId: string, d: Design): ProjectDesign {
  const next = structuredClone(project), route = next.routes.find(r => r.id === routeId);
  if (!route || route.kind !== 'railway' || route.alignment.kind !== 'pi') throw new Error('Not an editable railway');
  if ((d.category !== 'R1' && d.category !== 'R2') || !designSpeeds(d.category).includes(d.speed)) throw new Error('Wrong category for a railway');
  const { category, speed, pis, profileMode, vpis, gradePins, crossingOverrides, buildingOverrides, objectData: _o, maxGradient: _g, ...controls } = structuredClone(d);
  route.alignment = { kind: 'pi', pis, controls: { ...controls, ...(crossingOverrides === undefined ? {}
    : { crossings: crossingTargetsOf(project, crossingOverrides) }) },
    vertical: profileMode === 'auto' ? { kind: 'auto', pins: gradePins ?? [], manualVpis: vpis }
      : { kind: 'manual', vpis, ...(gradePins === undefined ? {} : { autoPins: gradePins }) } };
  route.specification = { ...route.specification, tracks: category === 'R1' ? 1 : 2, designSpeed: speed,
    operations: { ...route.specification.operations, passengerSpeed: speed, freightSpeed: Math.min(FREIGHT_SPEED, speed) } };
  next.buildingOverrides = buildingOverrides ?? [];
  return next;
}

/** A new electrified line between two fixed ends. Train counts are explicit game assumptions until a
 * scenario supplies a timetable; they do not feed any noise result (none is computed). */
export function createRailwayRoute(id: string, name: string, endpoints: EndpointPair, tracks: 1 | 2 = 2, speed = 160): RailwayRoute {
  return { id, name, role: 'auxiliary', revision: 0, kind: 'railway', acousticSourceId: `acoustic:${id}`, endpoints: structuredClone(endpoints),
    alignment: { kind: 'pi', pis: [], controls: {}, vertical: { kind: 'auto', pins: [] } },
    specification: { kind: 'railway', policy: RAILWAY_POLICY, designSpeed: speed, gaugeMm: 1435, tracks, electrification: 'AC25kV',
      operations: { ...RAIL_TRAFFIC_PRIOR, passengerSpeed: speed, freightSpeed: Math.min(FREIGHT_SPEED, speed) } } };
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

/** Mapped railway lines by source id (flat x,y and stations, canonical OSM orientation): what a rebuilt
 * stretch takes up. Sent to the worker with the transport graph. */
export type RailPaths = ReadonlyMap<string, { xy: readonly number[]; stations: readonly number[] }>;
/** A mapped line's direction at station s (unit vector along the source; chord over ±TRACK_DIR_M). */
export function trackDirection(paths: RailPaths, sourceId: string, s: number): { x: number; y: number } | undefined {
  const p = paths.get(sourceId); if (!p) return undefined;
  const end = p.stations[p.stations.length - 1];
  const line = railInterval(paths, sourceId, Math.max(0, s - TRACK_DIR_M), Math.min(end, s + TRACK_DIR_M));
  if (!line || line.length < 2) return undefined;
  const q = line[0], r = line[line.length - 1], L = Math.hypot(r.x - q.x, r.y - q.y);
  return L > 1 ? { x: (r.x - q.x) / L, y: (r.y - q.y) / L } : undefined;
}
/** Half the chord over which a mapped track's direction is measured, m (a game measurement). */
const TRACK_DIR_M = 30;
/** The old track of a source interval as a polyline. */
export function railInterval(paths: RailPaths, sourceId: string, s0: number, s1: number): { x: number; y: number }[] | null {
  const p = paths.get(sourceId); if (!p) return null;
  const at = (s: number) => {
    let i = 0; while (i + 2 < p.stations.length && p.stations[i + 1] < s) i++;
    const t = Math.max(0, Math.min(1, (s - p.stations[i]) / ((p.stations[i + 1] - p.stations[i]) || 1)));
    return { x: p.xy[2 * i] + (p.xy[2 * i + 2] - p.xy[2 * i]) * t, y: p.xy[2 * i + 1] + (p.xy[2 * i + 3] - p.xy[2 * i + 1]) * t };
  };
  return [at(s0), ...p.stations.flatMap((s, i) => s > s0 && s < s1 ? [{ x: p.xy[2 * i], y: p.xy[2 * i + 1] }] : []), at(s1)];
}

/** A mapped railway stretch as an editable railway (Mapped line → rebuild): the exact source claim, ends on
 * the old line, continuations to the rest of it and to railways branching off, its line converted once into
 * bends that follow the old track (`bends`: where the old track is tighter than the rules, its own curve,
 * kept as it is; ui/road-edit.ts fitRoad). Single track at the line's own speed (rebuildSpeed). */
export function promoteGroundRailway(base: ProjectTransportIndex, input: { routeId: string; acousticSourceId: string; interval: SourceInterval; name: string },
  bends: (path: readonly { x: number; y: number; s: number }[], speed: number, category: 'R1' | 'R2') => PI[], keep?: RailwayRoute): Extract<ProjectCommand, { type: 'promote' }> {
  base.checkInterval(input.interval);
  const source = base.source(input.interval.sourceId)!;
  if (source.kind !== 'railway' || source.elevation !== 'terrain') throw new Error('Promotion needs a ground railway');
  const path = base.path(input.interval), start = input.interval.s0, length = input.interval.s1 - start;
  const at = (s: number): SourceLocation => ({ transportData: base.transportData, sourceId: source.id, s });
  const end = (p: XYZ, s: number) => ({ position: { x: p.x, y: p.y, z: p.z }, anchor: { kind: 'source' as const, location: at(s) }, binding: 'resolved' as const });
  const speed = keep?.specification.designSpeed ?? rebuildSpeed(source.tags.maxspeed), category = keep ? categoryOf(keep) : 'R1';
  const fresh = createRailwayRoute(input.routeId, input.name, { a: end(path[0], start), b: end(path[path.length - 1], input.interval.s1) }, 1, speed);
  const steep = oldLineGrade(base, source.id, input.interval);
  const route: RailwayRoute = { ...fresh, acousticSourceId: input.acousticSourceId,
    ...(keep ? { specification: structuredClone(keep.specification), name: keep.name } : {}),
    source: { binding: 'resolved', intervals: [{ ...input.interval }], transferredWorkIds: [] },
    alignment: { kind: 'pi', pis: bends(path.map(p => ({ x: p.x, y: p.y, s: p.s })), speed, category),
      controls: {}, vertical: { kind: 'auto', pins: [] } } };
  if (steep > RAIL_MAX_GRADIENT) route.specification = { ...route.specification, maxGradient: steep };
  else delete route.specification.maxGradient;
  const connections: ConnectionDesign[] = [];
  const connect = (id: string, s: number, location: SourceLocation, position: XYZ) => connections.push({ id, revision: 0, kind: 'continuation',
    position: { ...position }, ports: [{ kind: 'route', routeId: route.id, s }, { kind: 'source', location: { ...location } }] });
  connect(`connection:${route.id}:start`, 0, at(start), route.endpoints.a.position);
  connect(`connection:${route.id}:end`, length, at(input.interval.s1), route.endpoints.b.position);
  for (const branch of base.branches(input.interval)) for (const other of branch.other) {
    const o = base.source(other.sourceId), p = base.position(other.sourceId, other.s);
    if (!o || o.kind !== 'railway' || !p || o.elevation !== 'terrain') throw new Error('A rebuilt railway stretch joins only ground railways');
    connect(`connection:${route.id}:branch:${branch.nodeId}:${branch.s}:${other.sourceId}:${other.s}`, branch.s - start, other, p);
  }
  return { type: 'promote', routes: [route], connections };
}

/** A rebuilt line's design speed: the mapped line's own (OSM maxspeed), the fastest the game has rules for
 * at or below it, at least the slowest (60 km/h); a line without one is taken as 80 km/h (PROVISIONAL). */
export function rebuildSpeed(maxspeed: string | undefined): number {
  const v = Number.parseFloat(maxspeed ?? '');
  const want = Number.isFinite(v) && v > 0 ? v : 80, speeds = designSpeeds('R1');
  return speeds.find(s => s <= want) ?? speeds[speeds.length - 1];
}
/** A mapped line's grade over a stretch: from the ground at its two ends (which lie on the track), rounded up
 * to 0.5 ‰. Not its steepest piece: the ground model under a track also holds its embankments, cuttings and
 * the valleys its bridges cross, so local differences are not the track's grade. */
export function oldLineGrade(base: ProjectTransportIndex, sourceId: string, interval: SourceInterval): number {
  const a = base.position(sourceId, interval.s0), b = base.position(sourceId, interval.s1);
  if (!a || !b || !(interval.s1 > interval.s0)) return 0;
  return Math.ceil(Math.abs(b.z - a.z) / (interval.s1 - interval.s0) * 2000) / 2000;
}
/** The old line's bends that track curves fit between: a bend whose curve would not fit (too close to an
 * end or to its neighbour at this speed) is left out. */
export function fittingBends(a: { x: number; y: number }, b: { x: number; y: number }, pis: PI[], category: 'R1' | 'R2', speed: number): PI[] {
  const out = [...pis];
  for (let guard = 0; guard <= pis.length && out.length; guard++) {
    const al = buildAlignment(a, b, out, horizontalRules(speed, category));
    const bad = ROAD_CHECKS.horizontal(al, speedNorms(speed, category), { a, b, pis: out, category }).find(v => v.pi !== undefined);
    if (!bad) break;
    out.splice(bad.pi!, 1);
  }
  return out;
}

/** The station tracks' axis at `p` (unit vector, sign arbitrary): principal direction of the mapped railway
 * cells within STATION_AXIS_RADIUS_M (data/railway.ts). */
export function stationAxis(terrain: Terrain, p: { x: number; y: number }): { x: number; y: number } | undefined {
  const R = STATION_AXIS_RADIUS_M, step = terrain.cell;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, count = 0;
  for (let dx = -R; dx <= R; dx += step) for (let dy = -R; dy <= R; dy += step) {
    if (dx * dx + dy * dy > R * R || terrain.crossing(p.x + dx, p.y + dy) !== 2) continue;
    sx += dx; sy += dy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; count++;
  }
  if (count < 3) return undefined;
  const mx = sx / count, my = sy / count;
  const t = 0.5 * dm.atan2(2 * (sxy / count - mx * my), sxx / count - mx * mx - (syy / count - my * my));
  return { x: dm.cos(t), y: dm.sin(t) };
}

export type RailwayEvaluation = { status: 'evaluated'; result: Result; unpriced?: 'track-removal-unpriced'[];
  /** A rebuilt stretch: what the kernel billed where the old track is kept as it is (a credit; project-kept.ts). */
  keptWork?: ReplacementWork } | { status: 'incomplete'; reason: 'unsupported-policy'
  | 'unsupported-alignment' | 'unresolved-binding' | 'unimplemented-tangent' | 'source-needs-network' | 'mission-needs-network' | 'unsupported-crossing' };
export function evaluateProjectRailway(ctx: EvalContext, project: ProjectDesign, routeId: string, objectData: string,
  options: Pick<EvalOptions, 'preview' | 'materialValue' | 'structureValue' | 'keepClear' | 'holds'> & { railPaths?: RailPaths } = {}): RailwayEvaluation {
  const route = project.routes.find(r => r.id === routeId);
  if (!route || route.kind !== 'railway') throw new Error('Unknown railway');
  const { railPaths, ...evalOptions } = options;
  if (!modeCapability('railway').scoring) return { status: 'incomplete', reason: 'unsupported-policy' };
  const s = route.specification;
  if (s.policy !== RAILWAY_POLICY || s.gaugeMm !== 1435 || s.electrification !== 'AC25kV' || !designSpeeds(categoryOf(route)).includes(s.designSpeed))
    return { status: 'incomplete', reason: 'unsupported-policy' };
  if (route.alignment.kind !== 'pi' || !['auto', 'manual'].includes(route.alignment.vertical.kind)) return { status: 'incomplete', reason: 'unsupported-alignment' };
  if (project.objectData !== objectData || route.endpoints.a.binding !== 'resolved' || route.endpoints.b.binding !== 'resolved')
    return { status: 'incomplete', reason: 'unresolved-binding' };
  if (route.endpoints.a.tangent || route.endpoints.b.tangent) return { status: 'incomplete', reason: 'unimplemented-tangent' };
  // A rebuilt stretch takes up the old track it claims: that track is no obstacle to its new line.
  let retired: { x: number; y: number }[][] | undefined;
  if (route.source) {
    if (route.role !== 'auxiliary' || route.source.binding !== 'resolved' || !railPaths) return { status: 'incomplete', reason: 'source-needs-network' };
    retired = [];
    for (const i of route.source.intervals) {
      const line = railInterval(railPaths, i.sourceId, i.s0, i.s1);
      if (!line) return { status: 'incomplete', reason: 'source-needs-network' };
      retired.push(line);
    }
  }
  for (const c of route.alignment.controls.crossings ?? []) {
    if (c.target.kind !== 'legacy-way' && c.target.kind !== 'route') return { status: 'incomplete', reason: 'unsupported-crossing' };
    if (c.target.kind === 'legacy-way' && c.target.objectData !== project.objectData) return { status: 'incomplete', reason: 'unresolved-binding' };
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
  const design = railwayDesign(project, route);
  // On its bridge over a higher-ranking line this railway is that bridge (the player's own structures win).
  const decks = (options.holds ?? []).flatMap(h => h.bridge ? [{ s0: h.bridge[0], s1: h.bridge[1], kind: KIND.bridge }] : []);
  if (decks.length) design.structureOverrides = [...decks, ...design.structureOverrides ?? []];
  // Where a rebuilt stretch's line stays on its old track, the old track is kept as it is (project-kept.ts):
  // nothing is built there, so the kernel neither lifts it for a new structure nor meets the old line's own
  // level crossings, culverts and neighbours there; the new parts are tied to the old track's heights.
  const planned = retired && plannedKept(a, b, design, retired), kept = planned && planned.kept.some(Boolean) ? planned.kept : undefined;
  if (planned) design.pis = planned.pis;
  // ... and leaves that track no more steeply than a turnout: a mapped line's own direction there, or a
  // mission station's tracks (their axis on the map). A rebuilt stretch's own ends continue its old track:
  // no corner sharper than a turnout either, unless its end straight stays on the old track (kept as it is:
  // no corner is built there).
  const endStraightKept = (end: 'a' | 'b') => {
    if (!planned) return false;
    const p = end === 'a' ? a : b, q = design.pis.length ? design.pis[end === 'a' ? 0 : design.pis.length - 1] : end === 'a' ? b : a;
    const reach = Math.hypot(q.x - p.x, q.y - p.y), { st } = planned, length = st.s[st.n - 1];
    for (let i = 0; i < st.n; i++) if ((end === 'a' ? st.s[i] <= reach : length - st.s[i] <= reach) && !planned.kept[i]) return false;
    return true;
  };
  const trackEnd = (e: typeof route.endpoints.a, end: 'a' | 'b'): TrackEnd | undefined => {
    if (e.anchor.kind === 'source' && railPaths) {
      if (route.source && endStraightKept(end)) return undefined;
      const dir = trackDirection(railPaths, e.anchor.location.sourceId, e.anchor.location.s);
      return dir && { dir, ...(route.source ? { continues: true } : {}) };
    }
    const dir = e.anchor.kind === 'mission' && onRail(e.position) ? stationAxis(ctx.terrain, e.position) : undefined;
    return dir && { dir };
  };
  const ends = { a: trackEnd(route.endpoints.a, 'a'), b: trackEnd(route.endpoints.b, 'b') };
  const tieIn = { a: onRail(a) ? RAIL_TIE_IN_M : 0, b: onRail(b) ? RAIL_TIE_IN_M : 0,
    ...(ends.a || ends.b ? { ends: { ...(ends.a ? { a: ends.a } : {}), ...(ends.b ? { b: ends.b } : {}) } } : {}) };
  const result = evaluate({ ...ctx, a, b, scenario: { ...ctx.scenario, maxTravelMin: goal?.maxTravelMin ?? ctx.scenario.maxTravelMin } },
    design, { ...evalOptions, ...(retired ? { railRetired: retired } : {}), ...(kept ? { oldRoad: kept } : {}), endpointElevations: { a: explicitZ(a), b: explicitZ(b) }, railTraffic: railTraffic(route), ...(tieIn.a || tieIn.b ? { railTieIn: tieIn } : {}),
      goals: { time: goal?.maxTravelMin !== undefined, capacity: false } });
  let keptWork: ReplacementWork | null = null;
  if (kept && retired) {
    if (kept.length !== result.n) throw new Error('Kept cells do not match the railway’s stations');
    keptWork = applyKept(result, kept, CATEGORIES[design.category].crownWidth / 2, { paths: retired, heightAt: (x, y) => ctx.terrain.heightAt(x, y) }, 'railway');
  }
  return { status: 'evaluated', ...(retired ? { unpriced: ['track-removal-unpriced' as const] } : {}), result, ...(keptWork ? { keptWork } : {}) };
}

