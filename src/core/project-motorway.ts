// Paired motorway corridor (M1): ONE engineering evaluation of the common spine, never a sum of
// two carriageway kernels. Directional children carry identity, operations and acoustic sources;
// the spine owns the alignment, profile and structure controls (C0 corridor contract).
import type { Design, EvalContext, EvalOptions, Result } from './evaluate';
import { evaluate } from './evaluate';
import { CATEGORIES } from './data/categories';
import { designSpeeds } from './data/norms';
import { modeCapability } from './mode-policy';
import type { CorridorDesign, ProjectDesign, RouteDesign, RoadOperations } from './project';
import { buildAlignment, station, type Alignment, type PI, type Vec2 } from './horizontal';
import { horizontalRules } from './data/norms';
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
  /** Separate directions: each its own kernel result; the corridor ledger (absent in a drag preview,
   * which evaluates only the dragged direction) counts their shared formation, land and houses once. */
  | { status: 'split'; results: Record<string, Result>; ledger: SplitLedger | null }
  | { status: 'incomplete'; reason: 'unsupported-mode' | 'unsupported-policy' | 'unsupported-alignment' | 'unresolved-binding'
      | 'mission-needs-network' | 'unsupported-crossing' | 'separate-carriageways' };

/** One kernel evaluation of the paired corridor. Ends must be the mission's scenario ports: the
 * motorway continues beyond the map there (SPK's whole-category norm already includes earth-built
 * interchange branches, research/33 §3); any other end needs an interchange nobody has built. */
export function evaluateProjectCorridor(ctx: EvalContext, project: ProjectDesign, corridorId: string, objectData: string,
  options: Pick<EvalOptions, 'preview' | 'materialValue' | 'structureValue'> & { only?: string } = {}): CorridorEvaluation {
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
    return { status: 'split', results, ledger: f && r && !options.preview ? splitLedger(f, r, (x, y) => ctx.terrain.heightAt(x, y)) : null };
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
  const port = (id: string) => base.mission.ports.find(p => p.id === (id === 'a' ? (a.anchor as { portId?: string }).portId : (b.anchor as { portId?: string }).portId))?.name ?? '';
  const project: ProjectDesign = { ...structuredClone(base), routes: [
    child('route:motorway-forward', `Motorway towards ${port('b')}`, false), child('route:motorway-reverse', `Motorway towards ${port('a')}`, true)], connections: [],
  corridors: [{ id: corridorId, revision: 0, kind: 'motorway', mode: 'paired', endpoints: structuredClone({ a, b }),
    children: { forward: 'route:motorway-forward', reverse: 'route:motorway-reverse' }, formationPolicy: MOTORWAY_POLICY, correspondence: [],
    spine: { kind: 'pi', pis: [], controls: {}, vertical: { kind: 'auto', pins: [] } } }],
  mission: motorwayMission(base.mission) };
  return replaceCorridorFromDesign(project, corridorId, d);
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
      r.specification.designSpeed = speed;
      if (r.specification.operations.speedPolicy !== 'independent') r.specification.operations.speed = speed;
    }
  }
  next.buildingOverrides = buildingOverrides ?? [];
  return next;
}

/** For every station of `a`, the other direction's matching point: lateral offset (left of `a`
 * positive), its chainage and tangent agreement. Bounded local search along both polylines. */
interface Line { n: number; s: ArrayLike<number>; x: ArrayLike<number>; y: ArrayLike<number>; tx: ArrayLike<number>; ty: ArrayLike<number> }
export function pairStations(a: Line, b: Line): { d: Float64Array; sb: Float64Array; dot: Float64Array } {
  const d = new Float64Array(a.n).fill(NaN), sb = new Float64Array(a.n).fill(NaN), dot = new Float64Array(a.n).fill(NaN);
  let j = -1;
  const dist = (i: number, k: number) => (a.x[i] - b.x[k]) ** 2 + (a.y[i] - b.y[k]) ** 2;
  for (let i = 0; i < a.n; i++) {
    if (j < 0 || i % 50 === 0) { let best = Infinity; for (let k = 0; k < b.n; k += 4) { const q = dist(i, k); if (q < best) { best = q; j = k; } } }
    for (let moved = true, guard = 0; moved && guard < 400; guard++) {
      moved = false;
      for (const k of [j - 1, j + 1]) if (k >= 0 && k < b.n && dist(i, k) < dist(i, j)) { j = k; moved = true; }
    }
    // foot of the perpendicular from b's segment onto a's normal line
    const nx = -a.ty[i], ny = a.tx[i];
    for (const k of [j - 1, j]) {
      if (k < 0 || k + 1 >= b.n) continue;
      const u0 = (b.x[k] - a.x[i]) * a.tx[i] + (b.y[k] - a.y[i]) * a.ty[i], u1 = (b.x[k + 1] - a.x[i]) * a.tx[i] + (b.y[k + 1] - a.y[i]) * a.ty[i];
      if ((u0 > 0) === (u1 > 0) && u0 !== 0) continue;
      const t = u0 / (u0 - u1 || 1e-12), px = b.x[k] + (b.x[k + 1] - b.x[k]) * t, py = b.y[k] + (b.y[k + 1] - b.y[k]) * t;
      d[i] = (px - a.x[i]) * nx + (py - a.y[i]) * ny; sb[i] = b.s[k] + (b.s[k + 1] - b.s[k]) * t;
      dot[i] = a.tx[i] * b.tx[k] + a.ty[i] * b.ty[k];
      break;
    }
  }
  return { d, sb, dot };
}

/** Plan-only: where the other direction runs alongside on the left as one formation (crowns touch). */
export const JOINED_TOLERANCE = 0.5;
export function joinedRanges(a: Line, b: Line): { s0: number; s1: number }[] {
  const p = pairStations(a, b), out: { s0: number; s1: number }[] = [];
  for (let i = 0; i < a.n; i++) {
    if (!(Math.abs(p.d[i] - 2 * CARRIAGEWAY_OFFSET) <= JOINED_TOLERANCE && p.dot[i] < -0.95)) continue;
    const last = out[out.length - 1];
    if (last && a.s[i] - last.s1 <= a.s[1] - a.s[0] + 1e-6) last.s1 = a.s[i]; else out.push({ s0: a.s[i], s1: a.s[i] });
  }
  return out;
}

const carriagewayLine = (route: MotorwayRoute) => {
  const a = route.alignment as Extract<MotorwayRoute['alignment'], { kind: 'pi' }>;
  return station(buildAlignment(route.endpoints.a.position, route.endpoints.b.position, a.pis,
    horizontalRules(route.specification.designSpeed, CARRIAGEWAY_CATEGORY)), 10);
};

/** One direction of a split corridor through the kernel. Noise: each direction is checked as if it
 * carried the WHOLE corridor's traffic on its own axis, a safe upper bound on the two directions' sum
 * for every house (at most +3 dB too loud where only one direction is near), until a joint calculation
 * exists. Houses beside a joined stretch belong to the outer direction. */
export function evaluateCarriageway(ctx: EvalContext, project: ProjectDesign, routeId: string,
  options: Pick<EvalOptions, 'preview' | 'materialValue' | 'structureValue' | 'sharedCrossings'> = {}): Result {
  const route = project.routes.find(r => r.id === routeId) as MotorwayRoute, corridor = corridorOfRoute(project, routeId)!;
  const other = project.routes.find(r => r.id === (corridor.children.forward === routeId ? corridor.children.reverse : corridor.children.forward)) as MotorwayRoute;
  const ops = corridorOperations(project, corridor), goal = project.mission.connections[0];
  const a = route.endpoints.a.position, b = route.endpoints.b.position;
  return evaluate({ ...ctx, a, b, scenario: { ...ctx.scenario, traffic: ops.aadt, heavyShare: ops.heavyShare,
    maxTravelMin: goal?.maxTravelMin ?? ctx.scenario.maxTravelMin } }, carriagewayDesign(project, route),
  { ...options, endpointElevations: { a: a.z, b: b.z }, operatingSpeed: ops.speed,
    leftJoined: joinedRanges(carriagewayLine(route), carriagewayLine(other)),
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
export function splitLedger(f: Result, r: Result, heightAt: (x: number, y: number) => number): SplitLedger {
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
    if (!(p.dot[i] < -0.9) || d < 0) continue;
    const joined = d <= 2 * w + JOINED_TOLERANCE;
    if (joined && p.dot[i] < -0.95 && (Math.abs(zf - zr) > JOINED_TOLERANCE || (kf === KIND.tunnel) !== (kr === KIND.tunnel)))
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
    const dayF = f.dayL[i], dayR = at(r, p.sb[i], r.dayL), zDayF = f.zDayL[i], zDayR = at(r, p.sb[i], r.zDayL);
    // Each body's top surface across f's normal: crown, then its slope faces on both sides (NaN outside it).
    const farF = f.dayR[i], zFarF = f.zDayR[i], farR = at(r, p.sb[i], r.dayR), zFarR = at(r, p.sb[i], r.zDayR);
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
