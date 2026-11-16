// Paired motorway corridor (M1): ONE engineering evaluation of the common spine, never a sum of
// two carriageway kernels. Directional children carry identity, operations and acoustic sources;
// the spine owns the alignment, profile and structure controls (C0 corridor contract).
import type { Design, EvalContext, EvalOptions, Result } from './evaluate';
import type { VPI } from './vertical';
import { GRADE_PIN_TOLERANCE, type GradePin } from './grade-pins';
import { evaluate } from './evaluate';
import { CATEGORIES } from './data/categories';
import { designSpeeds } from './data/norms';
import { MOTORWAY_150_PILOT } from './data/motorway';
import { modeCapability } from './mode-policy';
import type { CorridorDesign, DrawnPart, ProjectDesign, RouteDesign, RoadOperations, SeparateStretch, XYZ } from './project';
import { buildAlignment, pointAt, station, type Alignment, type PI, type Vec2 } from './horizontal';
import { carryStretches, compositePis, compositeStart, editStretches, JOIN_RULES, joinedRanges as joinedOn, locateStretches,
  pairStations as pair, type Direction } from './motorway-stretches';
import { sliceResult, stitchResult } from './result-stitch';
import { timeViolation } from './checks';
import { horizontalRules, speedNorms } from './data/norms';
import { childStationAt, offsetCurvePath } from './offset-path';
import { childControls } from './motorway-commands';
import { cellLength, landPerM2, surchargeRate } from './cost';
import { LAND, PRICES } from './data/prices';
import { KIND } from './structures';
import type { Violation } from './checks';

/** Policy of a paired D 27.5 corridor priced as one whole-category SPK body (research/22, /33). */
export const MOTORWAY_POLICY = 'paired-d27.5';
export const MOTORWAY_CATEGORY = 'D27.5' as const;

export type MotorwayRoute = Extract<RouteDesign, { kind: 'motorway' }>;

/** The corridor owning a motorway child route, if any. */
export function corridorOfRoute(project: ProjectDesign, routeId: string): CorridorDesign | undefined {
  return project.corridors.find(c => c.children.forward === routeId || c.children.reverse === routeId);
}

/** Corridor-wide traffic: the children's directional demands added (never one copied twice). */
/** Whether a motorway runs the 150 km/h speed-limit pilot (data/motorway.ts): the posted limit set to 150
 * on a motorway designed for 130. Any other design speed keeps the design speed as the limit. */
export function speedLimit150(route: RouteDesign): boolean {
  return route.kind === 'motorway' && route.specification.designSpeed === MOTORWAY_150_PILOT.designSpeed
    && route.specification.operations.speedPolicy === 'independent' && route.specification.operations.speed === MOTORWAY_150_PILOT.limit;
}
/** Turn the pilot on/off for a whole corridor (both directions), one edit. */
export function setSpeedLimit150(project: ProjectDesign, corridorId: string, on: boolean): ProjectDesign {
  const next = structuredClone(project), corridor = next.corridors.find(c => c.id === corridorId);
  if (!corridor) throw new Error('Unknown corridor');
  for (const id of [corridor.children.forward, corridor.children.reverse]) {
    const r = next.routes.find(x => x.id === id);
    if (r?.kind !== 'motorway') continue;
    if (on && r.specification.designSpeed !== MOTORWAY_150_PILOT.designSpeed) throw new Error('The pilot needs a motorway designed for 130 km/h');
    r.specification.operations = { ...r.specification.operations, speed: on ? MOTORWAY_150_PILOT.limit : r.specification.designSpeed, speedPolicy: on ? 'independent' : 'design' };
    r.revision++;
  }
  return next;
}

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
  return structuredClone({ ...controls, category: MOTORWAY_CATEGORY, speed: spec.designSpeed,
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
  const before = corridor.spine.kind === 'pi' ? corridor.spine.pis : [], oldSpeed = corridorSpeed(next, corridor);
  corridor.spine = { kind: 'pi', pis, controls: { ...controls, ...(crossingOverrides === undefined ? {}
    : { crossings: crossingOverrides.map(c => ({ choice: c.type, target: { kind: 'legacy-way' as const, objectData: project.objectData, roadId: c.roadId } })) }) },
    vertical: profileMode === 'auto' ? { kind: 'auto', pins: gradePins ?? [], manualVpis: vpis }
      : { kind: 'manual', vpis, ...(gradePins === undefined ? {} : { autoPins: gradePins }) } };
  for (const id of [corridor.children.forward, corridor.children.reverse]) {
    const r = next.routes.find(x => x.id === id);
    if (r?.kind === 'motorway' && r.specification.designSpeed !== speed) {
      const pilot = speedLimit150(r);
      r.specification.designSpeed = speed;
      // a new design speed ends the 150 km/h pilot (it needs a motorway designed for 130)
      if (pilot) r.specification.operations = { ...r.specification.operations, speed, speedPolicy: 'design' };
      if (r.specification.operations.speedPolicy !== 'independent') r.specification.operations.speed = speed;
    }
  }
  next.buildingOverrides = buildingOverrides ?? [];
  if (corridor.stretches?.length) {
    // Both directions moved: where the shared line changed next to a separate stretch, they follow it
    // there again; elsewhere the own lines stay (a new design speed changes the shared line everywhere).
    const carried = speed === oldSpeed ? carryStretches(before, pis, corridor.stretches) : { kept: [], after: [], dropped: corridor.stretches.length };
    const rules = horizontalRules(speed, MOTORWAY_CATEGORY), A = corridor.endpoints.a.position, B = corridor.endpoints.b.position;
    const dL = buildAlignment(A, B, pis, rules).length - buildAlignment(A, B, before, rules).length;
    carried.kept.forEach((t, j) => { if (carried.after[j] && dL) shiftStretch(t, dL); });
    const located = locateStretches(A, B, pis, carried.kept, rules);
    if (located.length) corridor.stretches = located; else delete corridor.stretches;
  }
  return next;
}
const corridorSpeed = (project: ProjectDesign, corridor: CorridorDesign) => {
  const r = project.routes.find(x => x.id === corridor.children.forward);
  return r?.kind === 'motorway' ? r.specification.designSpeed : NaN;
};
/** Own height pins and choices are spine chainage: a change before the stretch moves them along. */
function shiftStretch(t: SeparateStretch, dL: number) {
  t.a += dL; t.b += dL;
  for (const line of [t.forward, t.reverse]) {
    if (!line) continue;
    line.pins = line.pins.map(p => ({ ...p, s: p.s + dL }));
    if (line.structureOverrides) line.structureOverrides = line.structureOverrides.map(o => ({ ...o, s0: o.s0 + dL, s1: o.s1 + dL }));
    if (line.wallOverrides) line.wallOverrides = line.wallOverrides.map(o => ({ ...o, s0: o.s0 + dL, s1: o.s1 + dL }));
  }
}

/** `unpriced`: engineered and shown, but the project cannot price it (no interchange at its ends). */
export type CorridorEvaluation =
  | { status: 'evaluated'; result: Result; unpriced?: 'motorway-needs-interchange'[] }
  /** Separate directions: each its own kernel result; the corridor ledger (absent in a drag preview,
   * which evaluates only the dragged direction) counts their shared formation, land and houses once. */
  | { status: 'split'; results: Record<string, Result>; ledger: SplitLedger | null; unpriced?: 'motorway-needs-interchange'[];
      /** Separate stretches of a paired corridor: what is drawn (the shared body's parts outside them, each
       * direction's own carriageway inside), and the spine's evaluation they were cut from. */
      drawn?: DrawnPart[]; spine?: Result; apart?: { s0: number; s1: number }[] }
  | { status: 'incomplete'; reason: 'unsupported-mode' | 'unsupported-policy' | 'unsupported-alignment' | 'unresolved-binding'
      | 'mission-needs-network' | 'unsupported-crossing' | 'separate-carriageways' };

/** One kernel evaluation of the paired corridor. Ends must be the mission's scenario ports: the
 * motorway continues beyond the map there (SPK's whole-category norm already includes earth-built
 * interchange branches, research/33 §3); any other end needs an interchange nobody has built. */
export function evaluateProjectCorridor(ctx: EvalContext, project: ProjectDesign, corridorId: string, objectData: string,
  options: Pick<EvalOptions, 'preview' | 'materialValue'> & { only?: string } = {}): CorridorEvaluation {
  const corridor = project.corridors.find(c => c.id === corridorId);
  if (!corridor) throw new Error('Unknown corridor');
  if (!modeCapability('motorway').scoring) return { status: 'incomplete', reason: 'unsupported-mode' };
  const kids = [corridor.children.forward, corridor.children.reverse].map(id => project.routes.find(r => r.id === id)) as MotorwayRoute[];
  const category = corridor.mode === 'paired' ? MOTORWAY_CATEGORY : CARRIAGEWAY_CATEGORY;
  if (kids.some(k => k.specification.policy !== MOTORWAY_POLICY || k.specification.crossSection !== category
    || !designSpeeds(MOTORWAY_CATEGORY).includes(k.specification.designSpeed) || k.specification.designSpeed !== kids[0].specification.designSpeed))
    return { status: 'incomplete', reason: 'unsupported-policy' };
  const alignments = corridor.mode === 'paired' ? [corridor.spine] : kids.map(k => k.alignment);
  if (alignments.some(a => a.kind !== 'pi' || !['auto', 'manual'].includes(a.vertical.kind))) return { status: 'incomplete', reason: 'unsupported-alignment' };
  if (project.objectData !== objectData || [corridor.endpoints.a, corridor.endpoints.b].some(e => e.binding !== 'resolved' || e.tangent))
    return { status: 'incomplete', reason: 'unresolved-binding' };
  for (const c of alignments.flatMap(a => a.kind === 'pi' ? a.controls.crossings ?? [] : [])) {
    if (c.target.kind !== 'legacy-way') return { status: 'incomplete', reason: 'unsupported-crossing' };
    if (c.target.objectData !== project.objectData) return { status: 'incomplete', reason: 'unresolved-binding' };
  }
  const goals = project.mission.connections, ends = [corridor.endpoints.a.anchor, corridor.endpoints.b.anchor];
  // The mission's motorway runs between its ports (it continues off the map there). Any other motorway
  // (Build → Motorway) is engineered and shown, but joins other roads only at interchanges the game
  // cannot build yet: it stays unpriced.
  const missionKids = kids.filter(k => k.role === 'mission').length;
  if (missionKids === 1) return { status: 'incomplete', reason: 'mission-needs-network' };
  const goal = missionKids ? goals[0] : undefined;
  if (goal && (goals.length !== 1 || !goal.kinds.includes('motorway') || ends.some(a => a.kind !== 'mission')
    || (ends[0] as { portId: string }).portId !== goal.from || (ends[1] as { portId: string }).portId !== goal.to
    || (goal.demand && goal.demand.kind !== 'road')))
    return { status: 'incomplete', reason: 'mission-needs-network' };
  if (goal) for (const e of [corridor.endpoints.a, corridor.endpoints.b]) {
    const anchor = e.anchor as { portId: string }, port = project.mission.ports.find(p => p.id === anchor.portId);
    if (!port || Math.hypot(e.position.x - port.position.x, e.position.y - port.position.y, e.position.z - port.position.z) > 1e-6)
      return { status: 'incomplete', reason: 'unresolved-binding' };
  }
  const unpriced = goal ? undefined : ['motorway-needs-interchange' as const];
  if (corridor.mode === 'independent') {
    // Each direction ends at its own lanes' continuation beside the port, at the port's height.
    const ports = [corridor.endpoints.a.position, corridor.endpoints.b.position];
    for (const [k, kid] of kids.entries()) for (const [e, port] of [[kid.endpoints.a, ports[k]], [kid.endpoints.b, ports[1 - k]]] as const)
      if (e.binding !== 'resolved' || Math.abs(Math.hypot(e.position.x - port.x, e.position.y - port.y) - CARRIAGEWAY_OFFSET) > 1e-3 || Math.abs(e.position.z - port.z) > 1e-6)
        return { status: 'incomplete', reason: 'unresolved-binding' };
    // Crossed roads where the directions run joined: the forward direction builds one crossing for both,
    // the reverse direction reuses it (evaluated after it). A drag preview of the reverse alone prices its own.
    const results: Record<string, Result> = {};
    const { only, ...evalOptions } = options;
    if (!only || only === kids[0].id) results[kids[0].id] = evaluateCarriageway(ctx, project, kids[0].id, { ...evalOptions, sharedCrossings: { own: true } });
    if (!only || only === kids[1].id) results[kids[1].id] = evaluateCarriageway(ctx, project, kids[1].id,
      { ...evalOptions, ...(results[kids[0].id] ? { sharedCrossings: { own: false, from: results[kids[0].id].crossings } } : {}) });
    const [f, r] = kids.map(k => results[k.id]);
    return { status: 'split', results, ledger: f && r && !options.preview ? splitLedger(f, r, (x, y) => ctx.terrain.heightAt(x, y)) : null, ...(unpriced ? { unpriced } : {}) };
  }
  const { only: _only, ...spineOptions } = options;
  if (corridor.stretches?.length) return { ...evaluateSeparated(ctx, project, corridor, kids, goal, options), ...(unpriced ? { unpriced } : {}) };
  return { status: 'evaluated', result: evaluateSpine(ctx, project, corridor, kids, goal, spineOptions), ...(unpriced ? { unpriced } : {}) };
}
type Goal = ProjectDesign['mission']['connections'][number] | undefined;
/** ONE kernel evaluation of the paired corridor's common spine (D 27.5). */
function evaluateSpine(ctx: EvalContext, project: ProjectDesign, corridor: CorridorDesign, kids: MotorwayRoute[], goal: Goal,
  options: Pick<EvalOptions, 'preview' | 'materialValue'>): Result {
  const ops = corridorOperations(project, corridor), a = corridor.endpoints.a.position, b = corridor.endpoints.b.position;
  const explicitZ = (p: typeof a) => p.z === ctx.terrain.heightAt(p.x, p.y) ? undefined : p.z;
  return evaluate({ ...ctx, a, b, scenario: { ...ctx.scenario, traffic: ops.aadt, heavyShare: ops.heavyShare,
    maxTravelMin: goal?.maxTravelMin ?? ctx.scenario.maxTravelMin } }, corridorDesign(project, corridor),
  { ...options, endpointElevations: { a: explicitZ(a), b: explicitZ(b) }, operatingSpeed: ops.speed, speedLimit150: kids.every(speedLimit150),
    capacityTraffic: goal?.demand?.kind === 'road' ? goal.demand.aadt : undefined,
    goals: { time: goal?.maxTravelMin !== undefined, capacity: goal?.demand !== undefined } });
}

/** A fresh paired motorway mission: corridor A→B plus two directional children (half the demand each). */
export function createMotorwayProject(base: ProjectDesign, d: Design, operations: { aadt: number; heavyShare: number }): ProjectDesign {
  const mission = base.routes.find(r => r.role === 'mission');
  if (!mission) throw new Error('Mission route needed');
  const { a, b } = mission.endpoints;
  const port = (e: typeof a) => base.mission.ports.find(p => p.id === (e.anchor as { portId?: string }).portId)?.name ?? '';
  return addMotorwayCorridor({ ...structuredClone(base), routes: [], connections: [], corridors: [], mission: motorwayMission(base.mission) },
    { a, b }, d, operations, { corridorId: 'corridor:motorway', forward: 'route:motorway-forward', reverse: 'route:motorway-reverse',
      acoustic: id => `acoustic:${id}` }, 'mission', { forward: `Motorway towards ${port(b)}`, reverse: `Motorway towards ${port(a)}` });
}

/** A paired motorway corridor between two ends added to a project: the corridor plus its two direction
 * routes (half the demand each), its line `d` on the shared spine. One project edit. */
export function addMotorwayCorridor(project: ProjectDesign, ends: Pick<RouteDesign['endpoints'], 'a' | 'b'>, d: Design,
  operations: { aadt: number; heavyShare: number }, ids: { corridorId: string; forward: string; reverse: string; acoustic: (routeId: string) => string },
  role: RouteDesign['role'], names: { forward: string; reverse: string }): ProjectDesign {
  if (d.category !== MOTORWAY_CATEGORY) throw new Error('Motorway needs the D 27.5 category');
  const { a, b } = ends;
  const spec = (aadt: number) => ({ kind: 'motorway' as const, policy: MOTORWAY_POLICY, crossSection: MOTORWAY_CATEGORY, designSpeed: d.speed,
    operations: { aadt, heavyShare: operations.heavyShare, speed: d.speed, speedPolicy: 'design' as const } });
  const half = operations.aadt / 2;
  const child = (id: string, name: string, reverse: boolean): MotorwayRoute => ({ id, name, role, revision: 0, kind: 'motorway',
    acousticSourceId: ids.acoustic(id), endpoints: reverse ? { a: structuredClone(b), b: structuredClone(a) } : structuredClone({ a, b }),
    alignment: { kind: 'corridor', corridorId: ids.corridorId, direction: reverse ? 'reverse' : 'forward' }, specification: spec(half) });
  const next: ProjectDesign = { ...structuredClone(project), routes: [...structuredClone(project.routes),
    child(ids.forward, names.forward, false), child(ids.reverse, names.reverse, true)],
  corridors: [...structuredClone(project.corridors), { id: ids.corridorId, revision: 0, kind: 'motorway', mode: 'paired', endpoints: structuredClone({ a, b }),
    children: { forward: ids.forward, reverse: ids.reverse }, formationPolicy: MOTORWAY_POLICY, correspondence: [],
    spine: { kind: 'pi', pis: [], controls: {}, vertical: { kind: 'auto', pins: [] } } }] };
  return replaceCorridorFromDesign(next, ids.corridorId, d);
}
/** The scenario's mission with its connection to be made by a motorway (saves and bests are keyed by it). */
export function motorwayMission(mission: ProjectDesign['mission']): ProjectDesign['mission'] {
  return { ...structuredClone(mission), connections: mission.connections.map(c => ({ ...c, kinds: ['motorway'] as RouteDesign['kind'][] })) };
}

/** Crown width the renderer/footprint screens use for a corridor (whole formation). */
export const motorwayCrownWidth = () => CATEGORIES[MOTORWAY_CATEGORY].crownWidth;

// ---- Separate carriageways (split / rejoin) --------------------------------------------------------

/** One direction of a split corridor (data/categories.ts 'D27.5-1'). */
export const CARRIAGEWAY_CATEGORY = 'D27.5-1' as const;
/** Each direction's axis lies in the middle of its half of the shared formation, so two of them side
 * by side rebuild the paired formation exactly (median halves meet on the spine). */
export const CARRIAGEWAY_OFFSET = CATEGORIES[MOTORWAY_CATEGORY].crownWidth / 4;

/** Bends of the offset tangent polygon: the same arcs' centres, radius R − dir·offset (offset > 0 = left
 * of travel). Straights and arcs of the offset path are exactly those of the spine offset; the result is
 * an ordinary editable bend list, so each direction can then be bent on its own. */
export function offsetBends(a: Vec2, b: Vec2, pis: readonly PI[], al: Alignment, offset: number): { a: Vec2; b: Vec2; pis: PI[] } {
  const pts = [a, ...pis, b];
  const normal = (p: Vec2, q: Vec2) => { const l = Math.hypot(q.x - p.x, q.y - p.y); return { x: -(q.y - p.y) / l, y: (q.x - p.x) / l }; };
  const legs = pts.slice(1).map((q, k) => normal(pts[k], q));
  const out: PI[] = pis.map((p, i) => {
    const n0 = legs[i], n1 = legs[i + 1], dot = n0.x * n1.x + n0.y * n1.y;
    const k = offset / Math.max(1e-9, 1 + dot);
    const c = al.curves[i];
    const r = c && c.unit >= 0 && !c.ignored && !c.tooSharp ? c.rEff - c.dir * offset : null;
    return { x: p.x + (n0.x + n1.x) * k, y: p.y + (n0.y + n1.y) * k, r: r !== null && r > 0 ? r : null };
  });
  const n0 = legs[0], n1 = legs[legs.length - 1];
  return { a: { x: a.x + n0.x * offset, y: a.y + n0.y * offset }, b: { x: b.x + n1.x * offset, y: b.y + n1.y * offset }, pis: out };
}


/** Split: each direction gets its own bends (the exact offset of the shared line, radii kept at or
 * above the minimum) and its own heights (the shared grade line mapped to its own chainage, By hand).
 * One atomic, undoable project edit; the shared line is kept for joining again. */
export function splitCorridor(project: ProjectDesign, corridorId: string, spine: Pick<Result, 'vpis' | 'length'>): ProjectDesign {
  const next = structuredClone(project), corridor = next.corridors.find(c => c.id === corridorId);
  if (!corridor || corridor.mode !== 'paired' || corridor.spine.kind !== 'pi') throw new Error('Only a paired corridor can be split');
  const d = corridorDesign(project, corridor), rules = horizontalRules(d.speed, d.category);
  const A = corridor.endpoints.a.position, B = corridor.endpoints.b.position;
  const al = buildAlignment(A, B, d.pis, rules);
  if (Math.abs(al.length - spine.length) > 1e-3) throw new Error('Stale corridor result');
  const minR = horizontalRules(d.speed, CARRIAGEWAY_CATEGORY).minRadius;
  for (const direction of ['forward', 'reverse'] as const) {
    const id = corridor.children[direction], route = next.routes.find(r => r.id === id) as MotorwayRoute;
    const offset = direction === 'forward' ? -CARRIAGEWAY_OFFSET : CARRIAGEWAY_OFFSET, sign = direction === 'forward' ? 1 : -1;
    const bends = offsetBends(A, B, d.pis, al, offset);
    // The inside direction's radius is the shared one less the offset: never below what this
    // direction's own norm and easing curves need (its own Auto radius), else keep the exact offset.
    const auto = buildAlignment(bends.a, bends.b, bends.pis.map(p => ({ ...p, r: null })), horizontalRules(d.speed, CARRIAGEWAY_CATEGORY));
    bends.pis.forEach((p, i) => { if (p.r !== null) p.r = Math.max(minR, auto.curves[i]?.rEff ?? 0, Math.round(p.r * 100) / 100); });
    const axis = offsetCurvePath(al, offset, sign);
    // Heights: every shared height point at its own chainage; By hand keeps exactly this line.
    const map = (s: number) => childStationAt(axis, s);
    let vpis = spine.vpis.map(v => ({ s: map(v.s), z: v.z, r: v.r }));
    if (sign < 0) vpis = vpis.reverse();
    vpis[0] = { ...vpis[0], s: 0 }; vpis[vpis.length - 1] = { ...vpis[vpis.length - 1], s: axis.path.length };
    const ends = sign > 0 ? [bends.a, bends.b] : [bends.b, bends.a], zs = sign > 0 ? [A.z, B.z] : [B.z, A.z];
    const controls = childControls(corridor.spine.controls, axis);
    route.alignment = { kind: 'pi', pis: sign > 0 ? bends.pis : [...bends.pis].reverse(), controls,
      vertical: { kind: 'manual', vpis } };
    // Each direction ends where its own lanes continue the motorway beyond the map, at the port's height.
    route.endpoints = { a: { position: { ...ends[0], z: zs[0] }, anchor: { kind: 'free' }, binding: 'resolved' },
      b: { position: { ...ends[1], z: zs[1] }, anchor: { kind: 'free' }, binding: 'resolved' } };
    route.specification = { ...route.specification, crossSection: CARRIAGEWAY_CATEGORY };
  }
  const { spine: retainedSpine, ...base } = corridor;
  next.corridors = next.corridors.map(c => c.id === corridorId ? { ...base, mode: 'independent' as const, retainedSpine } : c);
  return next;
}

/** Join the directions again: an explicit reset to the kept shared line (independent edits are dropped;
 * Undo brings them back). */
export function rejoinCorridor(project: ProjectDesign, corridorId: string): ProjectDesign {
  const next = structuredClone(project), corridor = next.corridors.find(c => c.id === corridorId);
  if (!corridor || corridor.mode !== 'independent') throw new Error('Only separate directions can be joined');
  for (const direction of ['forward', 'reverse'] as const) {
    const route = next.routes.find(r => r.id === corridor.children[direction]) as MotorwayRoute;
    const { a, b } = corridor.endpoints;
    route.alignment = { kind: 'corridor', corridorId, direction };
    route.endpoints = structuredClone(direction === 'forward' ? { a, b } : { a: b, b: a });
    route.specification = { ...route.specification, crossSection: MOTORWAY_CATEGORY };
  }
  const { retainedSpine: spine, ...base } = corridor;
  next.corridors = next.corridors.map(c => c.id === corridorId ? { ...base, mode: 'paired' as const, spine } : c);
  return next;
}

/** Kernel design of one separate direction (edited with the ordinary road widgets). */
export function carriagewayDesign(project: ProjectDesign, route: RouteDesign): Design {
  if (route.kind !== 'motorway' || route.alignment.kind !== 'pi') throw new Error('Not a separate motorway direction');
  const a = route.alignment, v = a.vertical;
  if (v.kind !== 'auto' && v.kind !== 'manual') throw new Error('Unsupported vertical authority');
  const { crossings, ...controls } = a.controls;
  const crossingOverrides = crossings?.map(c => {
    if (c.target.kind !== 'legacy-way' || c.target.objectData !== project.objectData) throw new Error('Crossing binding needs repair');
    return { roadId: c.target.roadId, type: c.choice };
  });
  return structuredClone({ ...controls, category: CARRIAGEWAY_CATEGORY, speed: route.specification.designSpeed, pis: a.pis,
    profileMode: v.kind, vpis: v.kind === 'manual' ? v.vpis : v.manualVpis ?? [], gradePins: v.kind === 'auto' ? v.pins : v.autoPins,
    crossingOverrides, buildingOverrides: project.buildingOverrides, objectData: project.objectData });
}
export function replaceCarriagewayFromDesign(project: ProjectDesign, routeId: string, d: Design): ProjectDesign {
  const next = structuredClone(project), route = next.routes.find(r => r.id === routeId);
  if (!route || route.kind !== 'motorway' || route.alignment.kind !== 'pi') throw new Error('Not a separate motorway direction');
  if (d.category !== CARRIAGEWAY_CATEGORY || !designSpeeds(d.category).includes(d.speed)) throw new Error('Wrong category for a motorway direction');
  const { category: _c, speed, pis, profileMode, vpis, gradePins, crossingOverrides, buildingOverrides, objectData: _o, ...controls } = structuredClone(d);
  route.alignment = { kind: 'pi', pis, controls: { ...controls, ...(crossingOverrides === undefined ? {}
    : { crossings: crossingOverrides.map(c => ({ choice: c.type, target: { kind: 'legacy-way' as const, objectData: project.objectData, roadId: c.roadId } })) }) },
    vertical: profileMode === 'auto' ? { kind: 'auto', pins: gradePins ?? [], manualVpis: vpis }
      : { kind: 'manual', vpis, ...(gradePins === undefined ? {} : { autoPins: gradePins }) } };
  // One design speed for the motorway: both directions follow.
  const corridor = corridorOfRoute(next, routeId);
  for (const id of corridor ? [corridor.children.forward, corridor.children.reverse] : [routeId]) {
    const r = next.routes.find(x => x.id === id);
    if (r?.kind === 'motorway' && r.specification.designSpeed !== speed) {
      const pilot = speedLimit150(r);
      r.specification.designSpeed = speed;
      // a new design speed ends the 150 km/h pilot (it needs a motorway designed for 130)
      if (pilot) r.specification.operations = { ...r.specification.operations, speed, speedPolicy: 'design' };
      if (r.specification.operations.speedPolicy !== 'independent') r.specification.operations.speed = speed;
    }
  }
  next.buildingOverrides = buildingOverrides ?? [];
  return next;
}

interface Line { n: number; s: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number>; tx: ArrayLike<number>; ty: ArrayLike<number> }
export const pairStations = pair;
/** Plan-only: where the other direction runs alongside on the left as one formation (crowns touch). */
export const JOINED_TOLERANCE = 0.5;
export function joinedRanges(a: Line, b: Line, side: 'L' | 'R' = 'L', same = false): { s0: number; s1: number }[] {
  return joinedOn(a, b, 2 * CARRIAGEWAY_OFFSET, JOINED_TOLERANCE, side, same);
}

const carriagewayLine = (route: MotorwayRoute) => {
  const a = route.alignment as Extract<MotorwayRoute['alignment'], { kind: 'pi' }>;
  return station(buildAlignment(route.endpoints.a.position, route.endpoints.b.position, a.pis,
    horizontalRules(route.specification.designSpeed, CARRIAGEWAY_CATEGORY)), 10);
};

/** One direction of a split corridor through the kernel. Noise: two directional sources, half the
 * corridor's traffic each, its own on its lane axis and the other direction's along that carriageway
 * (evaluate.ts motorwayLanes), so a house hears both. Houses beside a joined stretch are the outer
 * direction's to check (one decision per house). */
export function evaluateCarriageway(ctx: EvalContext, project: ProjectDesign, routeId: string,
  options: Pick<EvalOptions, 'preview' | 'materialValue' | 'sharedCrossings'> = {}): Result {
  const route = project.routes.find(r => r.id === routeId) as MotorwayRoute, corridor = corridorOfRoute(project, routeId)!;
  const other = project.routes.find(r => r.id === (corridor.children.forward === routeId ? corridor.children.reverse : corridor.children.forward)) as MotorwayRoute;
  const ops = corridorOperations(project, corridor), goal = route.role === 'mission' ? project.mission.connections[0] : undefined;
  const a = route.endpoints.a.position, b = route.endpoints.b.position;
  return evaluate({ ...ctx, a, b, scenario: { ...ctx.scenario, traffic: ops.aadt, heavyShare: ops.heavyShare,
    maxTravelMin: goal?.maxTravelMin ?? ctx.scenario.maxTravelMin } }, carriagewayDesign(project, route),
  { ...options, endpointElevations: { a: a.z, b: b.z }, operatingSpeed: ops.speed, speedLimit150: speedLimit150(route) && speedLimit150(other),
    leftJoined: joinedRanges(carriagewayLine(route), carriagewayLine(other)), otherCarriageway: carriagewayLine(other),
    goals: { time: goal?.maxTravelMin !== undefined, capacity: false } });
}

export interface SplitLedger {
  /** CZK taken off the sum of both directions' own bills: shared formation, land and buildings counted twice. */
  credit: number;
  parts: { joinedBase: number; overlapEarth: number; overlapLand: number; buildings: number };
  joinedLength: number;
  /** Earth counted by both directions, m³ (credited once) */
  overlapFill: number; overlapCut: number;
  violations: Violation[];
}

/** Where the two directions' bodies meet, count the shared earth, land and houses once; where they run
 * joined, the formation is one D 27.5 body (SPK: 50 % of the whole-category norm each, not 60 %).
 * A slope of one direction must not land on the other's carriageway. Station-wise transverse check on
 * the forward direction's normal (linear slope faces; benches ignored). */
export function splitLedger(f: Result, r: Result, heightAt: (x: number, y: number) => number, same = false): SplitLedger {
  // `same`: both run A→B (a separate stretch), so r's right side faces f; else r runs B→A, its left faces f
  const facing = same ? { day: r.dayR, z: r.zDayR, farDay: r.dayL, farZ: r.zDayL } : { day: r.dayL, z: r.zDayL, farDay: r.dayR, farZ: r.zDayR };
  const along = (dot: number, limit: number) => same ? dot > limit : dot < -limit;
  const w = CARRIAGEWAY_OFFSET, p = pairStations(f, r), out: SplitLedger = { credit: 0, parts: { joinedBase: 0, overlapEarth: 0, overlapLand: 0, buildings: 0 }, joinedLength: 0, overlapFill: 0, overlapCut: 0, violations: [] };
  const rate = (res: Result) => ({
    fill: res.quantities.fill > 0 ? (res.cost.earthDetail.fillPlacing + res.cost.earthDetail.borrow) / res.quantities.fill : 0,
    cut: res.quantities.cut > 0 ? (res.cost.earthDetail.excavation + res.cost.earthDetail.surplusHaul + res.cost.earthDetail.unsuitable) / res.quantities.cut : 0,
    haul: res.quantities.cut + res.quantities.fill > 0 ? res.cost.earthDetail.haul / (res.quantities.cut + res.quantities.fill) : 0,
  });
  const rf = rate(f);
  const at = (res: Result, s: number, a: ArrayLike<number>) => {
    const k = Math.max(0, Math.min(res.n - 2, Math.floor(s / res.ds))), t = Math.max(0, Math.min(1, (s - res.s[k]) / res.ds));
    return a[k] + (a[k + 1] - a[k]) * t;
  };
  const clashes: { s0: number; s1: number; need: number; overlap: boolean }[] = [];
  const noiseGaps: { s0: number; s1: number }[] = [];
  const noiseGap = (s: number) => {
    const last = noiseGaps[noiseGaps.length - 1];
    if (last && s - last.s1 <= f.ds + 1e-6) last.s1 = s; else noiseGaps.push({ s0: s, s1: s });
  };
  const clash = (s: number, need: number, overlap: boolean) => {
    const last = clashes[clashes.length - 1];
    if (last && last.overlap === overlap && s - last.s1 <= f.ds + 1e-6) { last.s1 = s; last.need = Math.max(last.need, need); }
    else clashes.push({ s0: s, s1: s, need, overlap });
  };
  for (let i = 0; i < f.n; i++) {
    const d = p.d[i];
    if (!Number.isFinite(d) || Math.abs(d) > 2 * w + 400) continue;
    const j = Math.max(0, Math.min(r.n - 1, Math.round(p.sb[i] / r.ds))), len = cellLength(i, f.n, f.ds);
    const zf = f.grade[i], zr = at(r, p.sb[i], r.grade), kf = f.kind[i], kr = r.kind[j];
    if (Math.abs(d) < 2 * w - JOINED_TOLERANCE) {
      // carriageways on top of each other (side by side or crossing over): only a structure with
      // clearance separates them
      const separated = Math.abs(zf - zr) >= 7 && (zf > zr ? kf === KIND.bridge || kr === KIND.tunnel : kr === KIND.bridge || kf === KIND.tunnel);
      if (!separated) clash(f.s[i], 2 * w - Math.abs(d), true);
      continue;
    }
    if (!along(p.dot[i], 0.9) || d < 0) continue;
    const joined = d <= 2 * w + JOINED_TOLERANCE;
    if (joined && along(p.dot[i], 0.95) && (Math.abs(zf - zr) > JOINED_TOLERANCE || (kf === KIND.tunnel) !== (kr === KIND.tunnel)))
      // houses beside a joined stretch were left to the outer direction's noise check; that holds only
      // where the two run as one body at one height
      noiseGap(f.s[i]);
    if (joined && Math.abs(zf - zr) <= JOINED_TOLERANCE && kf === kr && kf !== KIND.tunnel) {
      // One D 27.5 formation: 50 % of the whole-category norm per direction instead of 60 %, with its
      // surcharge (or price-book markup) on that base.
      const base = f.parts.roadBase[i] / 6 * (1 + surchargeRate(f.cell.urban[i]))
        + r.parts.roadBase[j] / 6 * (1 + surchargeRate(r.cell.urban[j])) * len / cellLength(j, r.n, r.ds);
      out.parts.joinedBase += base; out.joinedLength += len;
    }
    if (kf !== KIND.earth || kr !== KIND.earth) continue;
    // Bodies in f's frame, left of f: f's crown edge w, slope to dayL; r's crown edge d − w, slope to d − dayL_r.
    const dayF = f.dayL[i], dayR = at(r, p.sb[i], facing.day), zDayF = f.zDayL[i], zDayR = at(r, p.sb[i], facing.z);
    // Each body's top surface across f's normal: crown, then its slope faces on both sides (NaN outside it).
    const farF = f.dayR[i], zFarF = f.zDayR[i], farR = at(r, p.sb[i], facing.farDay), zFarR = at(r, p.sb[i], facing.farZ);
    const face = (z: number, zDay: number, u: number, day: number) => u <= w ? z : u <= day ? z + (zDay - z) * (u - w) / Math.max(1e-6, day - w) : NaN;
    const topF = (x: number) => x >= 0 ? face(zf, zDayF, x, dayF) : face(zf, zFarF, -x, farF);
    const topR = (x: number) => x <= d ? face(zr, zDayR, d - x, dayR) : face(zr, zFarR, x - d, farR);
    const lo = d - dayR, hi = dayF, fillF = zDayF <= zf, fillR = zDayR <= zr;
    if (hi - lo > 1e-6) {
      const steps = Math.max(2, Math.ceil((hi - lo) / 0.5)), dx = (hi - lo) / steps;
      let fill = 0, cut = 0, worst = 0;
      for (let k = 0; k < steps; k++) {
        const x = lo + (k + 0.5) * dx, g = heightAt(f.x[i] - f.ty[i] * x, f.y[i] + f.tx[i] * x), a = topF(x), b = topR(x);
        if (Number.isNaN(a) || Number.isNaN(b)) continue;
        if (a > g && b > g) fill += (Math.min(a, b) - g) * dx; else if (a < g && b < g) cut += (g - Math.max(a, b)) * dx;
        // a slope face standing on the other's carriageway (or the other's slope on ours)
        // An embankment face standing on the other carriageway, or a cutting face undermining it.
        // (A face buried in the other's embankment, or cut away by the other's cutting, is one body.)
        if (x > w && x >= d - w && x <= d + w && (fillF ? a > zr + 0.3 : a < zr - 0.3)) worst = Math.max(worst, hi - (d - w));
        if (x < d - w && x <= w && x >= -w && (fillR ? b > zf + 0.3 : b < zf - 0.3)) worst = Math.max(worst, w - lo);
      }
      if (worst > 0) clash(f.s[i], worst, false);
      const u = f.cell.urban[i], sur = 1 + surchargeRate(u);
      out.parts.overlapEarth += (fill * (rf.fill + rf.haul) + cut * (rf.cut + rf.haul)) * len * sur;
      out.overlapFill += fill * len; out.overlapCut += cut * len;
      out.parts.overlapLand += (hi - lo) * len * (landPerM2(u) + f.cell.forest[i] * LAND.forestExtraPerM2 + PRICES.topsoilDepth * PRICES.topsoil * sur);
    }
  }
  // a house taken by both directions is bought once
  const taken = new Map<number, number>();
  for (const b of [...f.demolished, ...f.boughtOut]) taken.set(b.j, b.cost);
  for (const b of [...r.demolished, ...r.boughtOut]) if (taken.has(b.j)) out.parts.buildings += Math.min(b.cost, taken.get(b.j)!);
  out.credit = out.parts.joinedBase + out.parts.overlapEarth + out.parts.overlapLand + out.parts.buildings;
  for (const g of noiseGaps) out.violations.push({ kind: 'noise', basis: 'engine', s0: g.s0, s1: g.s1,
    title: 'Noise beside the two directions is not checked here',
    fix: 'Give both directions the same height here, or move them apart',
    detail: 'Where the directions run side by side, the houses on each side are checked against the nearer direction. That only holds where they run as one embankment at one height.',
    rule: 'Engine limit: noise from two separately built directions is checked only where they share one body or stand apart.' });
  for (const c of clashes) out.violations.push({ kind: 'footprint', basis: 'engine', s0: c.s0, s1: c.s1,
    title: c.overlap ? 'The two directions overlap' : 'Slopes of the two directions clash',
    fix: c.overlap ? `Move the directions at least ${Math.ceil(c.need)} m further apart here, or carry one over the other on a bridge`
      : `Move the directions at least ${Math.ceil(c.need)} m further apart here, or give them the same height`,
    detail: 'Where the two directions run side by side at different heights, the slope of one would stand on the other. Walls in the median are not built by the game.',
    rule: 'Engine limit: the two directions of a motorway share one formation only at the same height; otherwise each needs room for its own slopes.' });
  return out;
}

// ---- Separate stretches (core/motorway-stretches.ts) ---------------------------------------------------

const directionOf = (corridor: CorridorDesign, routeId: string): Direction => corridor.children.forward === routeId ? 'forward' : 'reverse';
/** Station ranges a direction's own lines cover (spine chainage). */
const ownRanges = (corridor: CorridorDesign, dir: Direction) => (corridor.mode === 'paired' ? corridor.stretches ?? [] : []).filter(t => t[dir]).map(t => [t.a, t.b] as const);
const within = (ranges: readonly (readonly [number, number])[], s0: number, s1 = s0) => ranges.some(([a, b]) => s1 >= a && s0 <= b);

/** One direction of a paired motorway as the road widgets edit it: the common spine with this direction's
 * own bends in its separate stretches; heights pins and structure / wall choices of the shared body,
 * and its own inside its stretches. Heights are Auto here (By hand is set for both directions). */
export function directionDesign(project: ProjectDesign, routeId: string): Design {
  const corridor = corridorOfRoute(project, routeId);
  if (!corridor || corridor.mode !== 'paired') throw new Error('Not a direction of a paired motorway');
  const dir = directionOf(corridor, routeId), d = corridorDesign(project, corridor), stretches = corridor.stretches ?? [];
  const mine = ownRanges(corridor, dir), lines = stretches.flatMap(t => t[dir] ? [t[dir]!] : []);
  return { ...d, pis: compositePis(d.pis, stretches, dir).pis, profileMode: 'auto', vpis: [],
    gradePins: [...(d.profileMode === 'auto' ? d.gradePins ?? [] : []).filter(p => !within(mine, p.s)), ...lines.flatMap(l => l.pins)].sort((p, q) => p.s - q.s),
    structureOverrides: [...(d.structureOverrides ?? []).filter(o => !within(mine, o.s0, o.s1)), ...lines.flatMap(l => l.structureOverrides ?? [])],
    wallOverrides: [...(d.wallOverrides ?? []).filter(o => !within(mine, o.s0, o.s1)), ...lines.flatMap(l => l.wallOverrides ?? [])] };
}

/** Write one direction's edit back: a change of its bends makes it run on its own from a join before the
 * change to a join after it (core/motorway-stretches.ts); outside, both directions stay the shared body.
 * Height pins and structure / wall choices go to this direction's own line where it has one, else to the
 * shared body; crossings and the design speed are the motorway's. */
export function replaceDirectionFromDesign(project: ProjectDesign, routeId: string, d: Design,
  newId: () => string = () => `stretch:${Math.random().toString(36).slice(2, 10)}`): ProjectDesign {
  const corridor = corridorOfRoute(project, routeId);
  if (!corridor || corridor.mode !== 'paired') throw new Error('Not a direction of a paired motorway');
  const dir = directionOf(corridor, routeId), shown = directionDesign(project, routeId), spine = corridorDesign(project, corridor);
  // one design speed for the motorway: a new one changes the shared line (both directions)
  if (d.speed !== shown.speed) return replaceCorridorFromDesign(project, corridor.id, { ...spine, speed: d.speed });
  const rules = horizontalRules(spine.speed, MOTORWAY_CATEGORY), A = corridor.endpoints.a.position, B = corridor.endpoints.b.position;
  let stretches = structuredClone(corridor.stretches ?? []);
  const edited = editStretches(spine.pis, stretches, dir, d.pis, newId);
  if (edited) stretches = locateStretches(A, B, spine.pis, edited, rules);
  const own = (s0: number, s1 = s0) => stretches.find(t => t[dir] && s1 >= t.a && s0 <= t.b);
  const changes = <T>(before: readonly T[], after: readonly T[]) => {
    const key = (x: T) => JSON.stringify(x);
    return { added: after.filter(x => !before.some(y => key(y) === key(x))), removed: before.filter(x => !after.some(y => key(y) === key(x))).map(key) };
  };
  const pins = changes(shown.gradePins ?? [], d.gradePins ?? []);
  const so = changes(shown.structureOverrides ?? [], d.structureOverrides ?? []), wo = changes(shown.wallOverrides ?? [], d.wallOverrides ?? []);
  const drop = <T>(list: readonly T[] | undefined, removed: string[]) => (list ?? []).filter(x => !removed.includes(JSON.stringify(x)));
  for (const t of stretches) {
    const line = t[dir];
    if (!line) continue;
    line.pins = drop(line.pins, pins.removed);
    line.structureOverrides = drop(line.structureOverrides, so.removed); line.wallOverrides = drop(line.wallOverrides, wo.removed);
  }
  let spinePins = drop(spine.gradePins, pins.removed), spineSo = drop(spine.structureOverrides, so.removed), spineWo = drop(spine.wallOverrides, wo.removed);
  for (const p of pins.added) { const t = own(p.s); if (t) t[dir]!.pins.push(p); else spinePins = [...spinePins, p]; }
  for (const o of so.added) { const t = own(o.s0, o.s1); if (t) (t[dir]!.structureOverrides ??= []).push(o); else spineSo = [...spineSo, o]; }
  for (const o of wo.added) { const t = own(o.s0, o.s1); if (t) (t[dir]!.wallOverrides ??= []).push(o); else spineWo = [...spineWo, o]; }
  for (const t of stretches) for (const line of [t.forward, t.reverse]) {
    if (!line) continue;
    if (!line.structureOverrides?.length) delete line.structureOverrides;
    if (!line.wallOverrides?.length) delete line.wallOverrides;
  }
  const kept = <T>(list: T[], was: T[] | undefined) => list.length || was ? { list } : null;
  const so2 = kept(spineSo, spine.structureOverrides), wo2 = kept(spineWo, spine.wallOverrides);
  const { structureOverrides: _so, wallOverrides: _wo, ...rest } = spine;
  const next = replaceCorridorFromDesign(project, corridor.id, { ...rest, gradePins: spinePins.sort((p, q) => p.s - q.s),
    ...(so2 ? { structureOverrides: so2.list } : {}), ...(wo2 ? { wallOverrides: wo2.list } : {}),
    crossingOverrides: d.crossingOverrides, buildingOverrides: d.buildingOverrides });
  const c = next.corridors.find(x => x.id === corridor.id)!;
  if (c.mode !== 'paired') throw new Error('Corridor mode changed');
  if (stretches.length) c.stretches = stretches; else delete c.stretches;
  return next;
}

/** Both directions on the shared line again over one stretch (Undo brings its own lines back). */
export function rejoinStretch(project: ProjectDesign, corridorId: string, stretchId: string): ProjectDesign {
  const next = structuredClone(project), c = next.corridors.find(x => x.id === corridorId);
  if (!c || c.mode !== 'paired' || !c.stretches?.some(t => t.id === stretchId)) throw new Error('Unknown separate stretch');
  c.stretches = c.stretches.filter(t => t.id !== stretchId);
  if (!c.stretches.length) delete c.stretches;
  return next;
}

/** Crowns of the two directions closer than this keep one height (two slopes between them would clash):
 * the gap two 1 : 2 fill slopes (sections.ts DEFAULT_SLOPES) take for 7.5 m of height difference. Editor
 * choice, PROVISIONAL (no design rule found for how far apart twin carriageways may differ in height). */
const SIDE_BY_SIDE = 30;
/** the Auto search's knot spacing (autoprofile.ts default) and the shortest own-heights stretch it can
 * shape (two knots and their curves); shorter: the shared heights throughout */
const KNOT = 250, MIN_OWN_HEIGHTS = 2 * KNOT;
/** The last full spine evaluation per terrain: one direction's edits leave the shared line unchanged,
 * so its evaluation (heights at the joins, the shared body's bill) is reused, never redone. */
const spineMemo = new WeakMap<object, { key: string; result: Result }>();
function memoSpine(ctx: EvalContext, project: ProjectDesign, corridor: CorridorDesign, kids: MotorwayRoute[], goal: Goal,
  options: Pick<EvalOptions, 'preview' | 'materialValue'>): Result {
  const key = JSON.stringify([corridorDesign(project, corridor), corridor.endpoints, corridorOperations(project, corridor), kids.map(speedLimit150), goal, ctx.a, ctx.b]);
  const hit = spineMemo.get(ctx.terrain);
  if (hit?.key === key) return hit.result;
  if (options.preview) return evaluateSpine(ctx, project, corridor, kids, goal, options);
  const result = evaluateSpine(ctx, project, corridor, kids, goal, { materialValue: options.materialValue });
  spineMemo.set(ctx.terrain, { key, result });
  return result;
}

/** Spine stations where a separate stretch may join the shared body: on a straight clear of the arcs
 * (and the transition room beside them), off structures, crossings and vertical curves. Route ends always. */
function joinStations(spine: Result, al: Alignment, rules: ReturnType<typeof horizontalRules>): Uint8Array {
  const n = spine.n, ok = new Uint8Array(n), L = al.length, margin = JOIN_RULES.curve + rules.transition / 2;
  for (let i = 0; i < n; i++) {
    const s = spine.s[i];
    const straight = al.elements.some(e => e.kind === 'line' && s >= e.s0 + (e.s0 > 1e-6 ? margin : 0) && s <= e.s0 + e.len - (e.s0 + e.len < L - 1e-6 ? margin : 0));
    const clear = straight && !spine.runs.some(r => s >= r.s0 - JOIN_RULES.structure && s <= r.s1 + JOIN_RULES.structure)
      && !spine.crossings.some(c => Math.abs(c.s - s) < JOIN_RULES.crossing)
      && !spine.waterCrossings.some(c => Math.abs(c.s - s) < JOIN_RULES.structure)
      && !spine.vcurves.some(c => Math.abs(c.s - s) < c.len / 2 + JOIN_RULES.curve);
    ok[i] = clear ? 1 : 0;
  }
  ok[0] = ok[n - 1] = 1;
  return ok;
}

/** A paired corridor with separate stretches: the spine's ONE D 27.5 evaluation outside them; inside, each
 * direction's own carriageway (D 27.5-1) between the joins, its heights Auto from the shared grade line at
 * the joins (a direction without an own line there keeps the shared heights). Shared works between the two
 * carriageways are counted once (splitLedger); each direction is shown composed on the spine's stations. */
function evaluateSeparated(ctx: EvalContext, project: ProjectDesign, corridor: CorridorDesign, kids: MotorwayRoute[], goal: Goal,
  options: Pick<EvalOptions, 'preview' | 'materialValue'> & { only?: string }): Extract<CorridorEvaluation, { status: 'split' }> {
  if (corridor.mode !== 'paired') throw new Error('Paired corridor needed');
  const spine = memoSpine(ctx, project, corridor, kids, goal, options);
  const sd = corridorDesign(project, corridor), stretches = corridor.stretches ?? [];
  const rules = horizontalRules(sd.speed, MOTORWAY_CATEGORY), A = corridor.endpoints.a.position, B = corridor.endpoints.b.position;
  const spineAl = buildAlignment(A, B, sd.pis, rules), ok = joinStations(spine, spineAl, rules);
  // joins: the last allowed station at or before each stretch, the first at or after it; stretches whose
  // joins meet are one
  const groups: { i0: number; i1: number; members: SeparateStretch[] }[] = [];
  // a stretch's pieces carry every spine bend it replaces whole (its unchanged boundary copies too): the
  // joins lie on the straights beyond them, with room for their easing
  const room = JOIN_RULES.margin + JOIN_RULES.curve + rules.transition / 2;
  for (const t of stretches) {
    const a = Math.min(t.a, t.k0 < t.k1 ? spineAl.curves[t.k0].sStart - room : t.a), b = Math.max(t.b, t.k0 < t.k1 ? spineAl.curves[t.k1 - 1].sEnd + room : t.b);
    let i0 = Math.max(0, Math.min(spine.n - 1, Math.floor(a / spine.ds + 1e-9))), i1 = Math.max(0, Math.min(spine.n - 1, Math.ceil(b / spine.ds - 1e-9)));
    while (i0 > 0 && !ok[i0]) i0--;
    while (i1 < spine.n - 1 && !ok[i1]) i1++;
    if (i1 <= i0) { if (i1 < spine.n - 1) i1 = i0 + 1; else i0 = i1 - 1; }
    const last = groups[groups.length - 1];
    if (last && i0 <= last.i1) { last.i1 = Math.max(last.i1, i1); last.members.push(t); } else groups.push({ i0, i1, members: [t] });
  }
  const ops = corridorOperations(project, corridor), W = CARRIAGEWAY_OFFSET, minR = horizontalRules(sd.speed, CARRIAGEWAY_CATEGORY).minRadius;
  const firstBendAfter = (s: number) => { const k = spineAl.curves.findIndex(c => c.sStart >= s); return k < 0 ? sd.pis.length : k; };
  const { only, ...evalOptions } = options;
  const dirs = (['forward', 'reverse'] as const).filter(dir => !only || corridor.children[dir] === only);
  type Piece = { result: Result; bend0: number; line: ReturnType<typeof station> };
  const pieces: Record<Direction, Piece[]> = { forward: [], reverse: [] };
  const planOf = (g: (typeof groups)[number]) => {
    const s0 = spine.s[g.i0], s1 = spine.s[g.i1], k0 = firstBendAfter(s0), k1 = firstBendAfter(s1);
    const J0 = pointAt(spineAl, s0), J1 = pointAt(spineAl, s1);
    return Object.fromEntries((['forward', 'reverse'] as const).map(dir => {
      const comp = compositePis(sd.pis, stretches, dir), shownAl = buildAlignment(A, B, comp.pis, rules);
      const c0 = compositeStart(comp.segs, k0, comp.pis.length), c1 = compositeStart(comp.segs, k1, comp.pis.length);
      // the shown line's own arcs, fixed: the piece runs exactly on it
      const shownPis = comp.pis.slice(c0, c1), pis = shownPis.map((p, j) => { const c = shownAl.curves[c0 + j];
        return { x: p.x, y: p.y, r: c && c.unit >= 0 && !c.ignored && !c.tooSharp ? c.rEff : p.r }; });
      const vAl = buildAlignment(J0, J1, pis, rules), offset = dir === 'forward' ? -W : W;
      const bends = offsetBends(J0, J1, pis, vAl, offset);
      // an automatic radius stays automatic for the carriageway (never below what its own norm and easing
      // need); the player's radius is kept exactly, offset (its checks then say what is wrong)
      const auto = buildAlignment(bends.a, bends.b, bends.pis.map(p => ({ ...p, r: null })), horizontalRules(sd.speed, CARRIAGEWAY_CATEGORY));
      bends.pis.forEach((p, i) => { if (p.r !== null && shownPis[i].r === null) p.r = Math.max(minR, auto.curves[i]?.rEff ?? 0, Math.round(p.r * 100) / 100); });
      const al = buildAlignment(bends.a, bends.b, bends.pis, horizontalRules(sd.speed, CARRIAGEWAY_CATEGORY));
      return [dir, { bends, al, vAl, offset, bend0: c0, line: station(al, 10), own: g.members.some(t => t[dir]) }];
    })) as Record<Direction, { bends: ReturnType<typeof offsetBends>; al: Alignment; vAl: Alignment; offset: number; bend0: number; line: ReturnType<typeof station>; own: boolean }>;
  };
  // A join is no route end: where a carriageway's curve and its easing need more room before (after) it
  // than the straight gives, the join moves further out along the spine's allowed stations.
  const endShort = (al: Alignment, first: boolean) => {
    const j = first ? al.joints.find(x => x.from < 0) : [...al.joints].reverse().find(x => x.to < 0);
    return j ? j.tFrom + j.needFrom + j.tTo + j.needTo - j.length : 0;
  };
  const settle = (g: (typeof groups)[number]) => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const plan = planOf(g);
      const short0 = Math.max(...(['forward', 'reverse'] as const).map(d => endShort(plan[d].al, true)));
      const short1 = Math.max(...(['forward', 'reverse'] as const).map(d => endShort(plan[d].al, false)));
      let moved = false;
      if (short0 > 0.5 && g.i0 > 0) { g.i0 = Math.max(0, g.i0 - Math.ceil((short0 + JOIN_RULES.margin) / spine.ds)); while (g.i0 > 0 && !ok[g.i0]) g.i0--; moved = true; }
      if (short1 > 0.5 && g.i1 < spine.n - 1) { g.i1 = Math.min(spine.n - 1, g.i1 + Math.ceil((short1 + JOIN_RULES.margin) / spine.ds)); while (g.i1 < spine.n - 1 && !ok[g.i1]) g.i1++; moved = true; }
      if (!moved) return;
    }
  };
  groups.forEach(settle);
  for (let j = 1; j < groups.length;) {
    if (groups[j].i0 > groups[j - 1].i1) { j++; continue; }
    const [p, q] = groups.splice(j - 1, 2);
    const merged = { i0: Math.min(p.i0, q.i0), i1: Math.max(p.i1, q.i1), members: [...p.members, ...q.members] };
    groups.splice(j - 1, 0, merged); settle(merged); j = Math.max(1, j - 1);
  }
  const designs = groups.map(g => {
    const plan = planOf(g), s0 = spine.s[g.i0], s1 = spine.s[g.i1];
    return Object.fromEntries((['forward', 'reverse'] as const).map(dir => {
      const { bends, al, vAl, offset, bend0, line, own } = plan[dir], other = plan[dir === 'forward' ? 'reverse' : 'forward'];
      const Lp = al.length, toPiece = (s: number) => (s - s0) / (s1 - s0) * Lp;
      const inside = (x0: number, x1 = x0) => x1 > s0 && x0 < s1;
      const shown = directionDesign(project, corridor.children[dir]);
      let vertical: Pick<Design, 'profileMode' | 'vpis' | 'gradePins'>, fixedProfile: EvalOptions['fixedProfile'], sideBySidePins: GradePin[] = [];
      if (own) {
        // Where the two directions run side by side (closer than SIDE_BY_SIDE between the crowns) they keep
        // the shared heights; Auto between. The curve where Auto takes over reaches at most half a knot
        // spacing back, where they are already nearly that far apart (it shifts heights there by at most
        // D²/(8 R), < 1 m).
        const p = pairStations(line, other.line);
        const apart = (i: number) => Number.isFinite(p.d[i]) && (!(Math.abs(Math.abs(p.d[i]) - 2 * W) < SIDE_BY_SIDE) || !(p.dot[i] > 0.9));
        let n0 = 0, n1 = line.n - 1;
        while (n0 < line.n && !apart(n0)) n0++;
        while (n1 >= 0 && !apart(n1)) n1--;
        let x0 = line.s[Math.min(n0, line.n - 1)], x1 = line.s[Math.max(0, n1)];
        // the shared heights on this carriageway's chainage: by distance from the nearer join
        const map = (s: number) => s - s0 <= s1 - s ? Math.min(Lp, s - s0) : Math.max(0, Lp - (s1 - s));
        const shared: VPI[] = [{ s: 0, z: spine.grade[g.i0], r: null },
          ...spine.vpis.filter(v => v.s > s0 + 1 && v.s < s1 - 1).map(v => ({ s: map(v.s), z: v.z, r: v.r })).filter(v => v.s > 1 && v.s < Lp - 1),
          { s: Lp, z: spine.grade[g.i1], r: null }].sort((a, b) => a.s - b.s);
        // where Auto takes over: on a straight grade of the shared line, the change of grade there no larger
        // than one minimum-radius curve fits before (after) it without touching the shared line's roundings
        const curves = spine.vcurves.filter(c => c.s > s0 && c.s < s1 && c.len > 0).map(c => [map(c.s) - c.len / 2, map(c.s) + c.len / 2] as const);
        // (at least the curve of one 1 m step of the search's grade grid over a knot spacing)
        const norms = speedNorms(sd.speed, CARRIAGEWAY_CATEGORY), rMax = Math.max(norms.minCrestRadius, norms.minSagRadius), ROOM = rMax / KNOT / 2 + 10;
        const take = (x: number, forward: boolean): [number, number] => {
          for (let guard = 0; guard < 50; guard++) {
            const inCurve = curves.find(([lo, hi]) => x > lo - ROOM && x < hi + ROOM);
            if (!inCurve) break;
            x = forward ? inCurve[1] + ROOM : inCurve[0] - ROOM;
          }
          const behind = forward ? Math.max(0, ...curves.filter(([, hi]) => hi <= x).map(([, hi]) => hi)) : Math.min(Lp, ...curves.filter(([lo]) => lo >= x).map(([lo]) => lo));
          const room = Math.min(KNOT / 2, Math.abs(x - behind));
          return [x, 2 * room / rMax];
        };
        const [a0, slack0] = take(x0, true), [a1, slack1] = take(x1, false);
        x0 = a0; x1 = a1;
        const pins = (shown.gradePins ?? []).filter(q => inside(q.s)).map(q => ({ s: toPiece(q.s), z: q.z }));
        const auto = x1 - x0 >= MIN_OWN_HEIGHTS;
        // pins where the two run side by side cannot move this direction alone: checked, reported
        sideBySidePins = pins.filter(q => !auto || q.s <= x0 || q.s >= x1);
        if (auto) { vertical = { profileMode: 'auto', vpis: [], gradePins: pins.filter(q => q.s > x0 && q.s < x1) }; fixedProfile = { x0, x1, vpis: shared, slack: [slack0, slack1] }; }
        else vertical = { profileMode: 'manual', vpis: shared, gradePins: [] };
      } else {
        // the shared heights, mapped onto this carriageway's own chainage
        const path = offsetCurvePath({ elements: vAl.elements, length: vAl.length }, offset, 1);
        const map = (s: number) => childStationAt(path, s - s0) * Lp / path.path.length;
        vertical = { profileMode: 'manual', gradePins: [], vpis: [{ s: 0, z: spine.grade[g.i0], r: null },
          ...spine.vpis.filter(v => v.s > s0 + 1 && v.s < s1 - 1).map(v => ({ s: map(v.s), z: v.z, r: v.r })),
          { s: Lp, z: spine.grade[g.i1], r: null }] };
      }
      const clip = <T extends { s0: number; s1: number }>(list: readonly T[] | undefined) => (list ?? []).filter(o => inside(o.s0, o.s1))
        .map(o => ({ ...o, s0: toPiece(Math.max(s0, o.s0)), s1: toPiece(Math.min(s1, o.s1)) }));
      const design: Design = { ...sd, category: CARRIAGEWAY_CATEGORY, pis: bends.pis, ...vertical,
        structureOverrides: clip(shown.structureOverrides), wallOverrides: clip(shown.wallOverrides) };
      return [dir, { design, fixedProfile, sideBySidePins, a: { ...bends.a, z: spine.grade[g.i0] }, b: { ...bends.b, z: spine.grade[g.i1] }, bend0, line }];
    })) as Record<Direction, { design: Design; fixedProfile: EvalOptions['fixedProfile']; sideBySidePins: GradePin[]; a: XYZ; b: XYZ; bend0: number; line: ReturnType<typeof station> }>;
  });
  const runPiece = (g: number, dir: Direction, from?: Result) => {
    const p = designs[g][dir], other = designs[g][dir === 'forward' ? 'reverse' : 'forward'], side = dir === 'forward' ? 'L' as const : 'R' as const;
    const result = evaluate({ ...ctx, a: p.a, b: p.b, scenario: { ...ctx.scenario, traffic: ops.aadt, heavyShare: ops.heavyShare } }, p.design,
      { ...evalOptions, endpointElevations: { a: p.a.z, b: p.b.z }, operatingSpeed: ops.speed, speedLimit150: kids.every(speedLimit150),
        ...(p.fixedProfile ? { fixedProfile: p.fixedProfile } : {}),
        leftJoined: joinedRanges(p.line, other.line, side, true), joinedSide: side, otherCarriageway: other.line,
        ...(dir === 'forward' ? { sharedCrossings: { own: true } } : from ? { sharedCrossings: { own: false, from: from.crossings } } : {}),
        goals: { time: false, capacity: false } });
    for (const q of p.sideBySidePins) {
      const i = Math.max(0, Math.min(result.n - 2, Math.floor(q.s / result.ds))), t = (q.s - result.s[i]) / result.ds;
      const z = result.grade[i] + (result.grade[i + 1] - result.grade[i]) * t;
      if (Math.abs(z - q.z) <= GRADE_PIN_TOLERANCE + 1e-9) continue;
      result.violations.push({ kind: 'profile', basis: 'game', s0: q.s, s1: q.s, title: 'Height pin where both directions keep one height',
        fix: 'Pin it where this direction runs apart from the other, or remove it',
        detail: `Here the two directions run side by side, less than ${SIDE_BY_SIDE} m apart, and keep the shared height (${z.toFixed(1)} m, not ${q.z.toFixed(1)} m).`,
        rule: `Game rule: twin carriageways closer than ${SIDE_BY_SIDE} m keep one height (their slopes would meet).` });
      result.valid = false;
    }
    pieces[dir].push({ result, bend0: p.bend0, line: p.line });
    return result;
  };
  const ledgers: SplitLedger[] = [];
  groups.forEach((_, g) => {
    const f = dirs.includes('forward') ? runPiece(g, 'forward') : undefined;
    const r = dirs.includes('reverse') ? runPiece(g, 'reverse', f) : undefined;
    if (f && r && !options.preview) ledgers.push(splitLedger(f, r, (x, y) => ctx.terrain.heightAt(x, y), true));
  });
  const results: Record<string, Result> = {};
  for (const dir of dirs) {
    const comp = compositePis(sd.pis, stretches, dir);
    const baseBend = (k: number) => { const g = comp.segs.find(x => (x.stretch === null || !x.own) && k >= x.k0 && k < x.k1); return g ? g.c0 + k - g.k0 : null; };
    const st = stitchResult(spine, groups.map((g, j) => ({ i0: g.i0, i1: g.i1, piece: pieces[dir][j].result, offset: dir === 'forward' ? -W : W, bend0: pieces[dir][j].bend0 })), baseBend);
    if (goal?.maxTravelMin !== undefined && st.travelMin > goal.maxTravelMin + 1e-9) {
      st.violations.push(timeViolation(st.length, kids[0].specification.designSpeed, st.travelMin, goal.maxTravelMin)); st.valid = false;
    }
    results[corridor.children[dir]] = st;
  }
  // the shared body's parts outside the stretches and the pieces, as drawn
  const drawn: DrawnPart[] = [];
  let from = 0;
  groups.forEach((g, j) => {
    if (g.i0 > from) drawn.push({ id: `${corridor.id}#shared:${from}`, result: sliceResult(spine, from, g.i0), section: 'paired' });
    for (const dir of dirs) drawn.push({ id: `${corridor.children[dir]}#own:${groups[j].members[0].id}`, result: pieces[dir][j].result, section: 'carriageway',
      ...(dir === 'reverse' ? { mirrored: true } : {}), direction: dir });
    from = g.i1;
  });
  if (from < spine.n - 1) drawn.push({ id: `${corridor.id}#shared:${from}`, result: sliceResult(spine, from, spine.n - 1), section: 'paired' });
  const apart = groups.map(g => ({ s0: spine.s[g.i0], s1: spine.s[g.i1] }));
  if (options.preview || dirs.length < 2) return { status: 'split', results, ledger: null, drawn, spine, apart };
  // the bill: the shared body once (its parts outside the stretches) plus both carriageways inside, less
  // what the two carriageways share (splitLedger) and houses the shared body and a carriageway both take
  const shared = results[corridor.children.forward].cost.total - pieces.forward.reduce((t, p) => t + p.result.cost.total, 0);
  let houses = 0;
  const spineTaken = new Map<number, number>();
  for (const b of [...spine.demolished, ...spine.boughtOut]) if (!groups.some(g => b.i > g.i0 && b.i < g.i1)) spineTaken.set(b.j, b.cost);
  const pieceTaken = new Map<number, number>();
  for (const dir of ['forward', 'reverse'] as const) for (const p of pieces[dir]) for (const b of [...p.result.demolished, ...p.result.boughtOut])
    pieceTaken.set(b.j, Math.min(b.cost, pieceTaken.get(b.j) ?? Infinity));
  for (const [j, cost] of pieceTaken) if (spineTaken.has(j)) houses += Math.min(cost, spineTaken.get(j)!);
  const sum = (k: keyof SplitLedger['parts']) => ledgers.reduce((t, l) => t + l.parts[k], 0);
  const at = (j: number) => (s: number) => spine.s[groups[j].i0] + s / pieces.forward[j].result.length * (spine.s[groups[j].i1] - spine.s[groups[j].i0]);
  const ledger: SplitLedger = {
    credit: shared + ledgers.reduce((t, l) => t + l.credit, 0) + houses,
    parts: { joinedBase: sum('joinedBase'), overlapEarth: sum('overlapEarth'), overlapLand: sum('overlapLand'), buildings: sum('buildings') + houses },
    joinedLength: ledgers.reduce((t, l) => t + l.joinedLength, 0), overlapFill: ledgers.reduce((t, l) => t + l.overlapFill, 0),
    overlapCut: ledgers.reduce((t, l) => t + l.overlapCut, 0),
    violations: ledgers.flatMap((l, j) => l.violations.map(v => ({ ...v, s0: at(j)(v.s0), s1: at(j)(v.s1) }))),
  };
  return { status: 'split', results, ledger, drawn, spine, apart };
}
