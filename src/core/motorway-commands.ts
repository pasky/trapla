import type { ProjectCommand } from '../project-store-contract';
import type { CorridorDesign, EndpointConstraint, ProjectIdentity, RouteControls, RouteDesign } from './project';
import { childStationAt, curvePointAt, type OffsetPath } from './offset-path';
import type { PairedGeometry } from './paired-carriageways';

type FrozenPoint = { s: number; z: number };
/** Supplied by the owning corridor engineering kernel, NEVER reconstructed from a render mesh. */
export interface MotorwayMaterialization {
  /** Snapshot identity covers dependency changes; a load/context reset must change epoch (C0). */
  identity: ProjectIdentity;
  corridorId: string;
  corridorRevision: number;
  childRevisions: { forward: number; reverse: number };
  plan: PairedGeometry;
  /** Actual resolved CHILD heights, already in each child's own travel-direction chainage. */
  profiles: { forward: readonly FrozenPoint[]; reverse: readonly FrozenPoint[] };
}

type MotorwayRoute = Extract<RouteDesign, { kind: 'motorway' }>;
function childrenFor(corridor: CorridorDesign, routes: readonly RouteDesign[]): [MotorwayRoute, MotorwayRoute] {
  const forward = routes.find(r => r.id === corridor.children.forward), reverse = routes.find(r => r.id === corridor.children.reverse);
  if (!forward || !reverse || forward.kind !== 'motorway' || reverse.kind !== 'motorway' || forward.id === reverse.id
    || forward.acousticSourceId === reverse.acousticSourceId) throw new Error('Distinct directional motorway routes and physical acoustic sources required');
  return [forward, reverse];
}
function checkMaterialization(corridor: CorridorDesign, children: readonly [MotorwayRoute, MotorwayRoute], resolved: MotorwayMaterialization, current: ProjectIdentity): void {
  if (resolved.identity.epoch !== current.epoch || resolved.identity.revision !== current.revision
    || corridor.id !== resolved.corridorId || corridor.revision !== resolved.corridorRevision
    || children[0].revision !== resolved.childRevisions.forward || children[1].revision !== resolved.childRevisions.reverse) throw new Error('Stale motorway materialization');
  for (const direction of ['forward', 'reverse'] as const) {
    const axis = direction === 'forward' ? resolved.plan.right.axis : resolved.plan.left.axis;
    const points = resolved.profiles[direction];
    if (axis.direction !== (direction === 'forward' ? 1 : -1) || points.length < 2
      || points[0].s !== 0 || Math.abs(points[points.length - 1].s - axis.path.length) > 1e-6
      || points.some((p, i) => ![p.s, p.z].every(Number.isFinite) || (i > 0 && p.s <= points[i - 1].s))) throw new Error('Resolved directional profile must cover its exact child path');
  }
}

function materializedEndpoint(old: EndpointConstraint, axis: OffsetPath, profile: readonly FrozenPoint[], isEnd: boolean): EndpointConstraint {
  const i = isEnd ? profile.length - 1 : 0, neighbour = isEnd ? i - 1 : 1;
  const p = curvePointAt(axis.path, isEnd ? axis.path.length : 0), grade = (profile[neighbour].z - profile[i].z) / (profile[neighbour].s - profile[i].s);
  const norm = Math.hypot(1, grade), position = { x: p.x, y: p.y, z: profile[i].z };
  const tangent = { x: p.tx / norm, y: p.ty / norm, z: grade / norm };
  // A free endpoint can take its resolved position. An external anchor cannot be silently moved.
  const samePosition = Math.hypot(old.position.x - position.x, old.position.y - position.y, old.position.z - position.z) <= 1e-6;
  const sameTangent = !old.tangent || Math.hypot(old.tangent.x - tangent.x, old.tangent.y - tangent.y, old.tangent.z - tangent.z) <= 1e-6;
  return { position, tangent, anchor: structuredClone(old.anchor),
    binding: old.anchor.kind === 'free' ? 'resolved' : samePosition && sameTangent ? old.binding : 'unresolved' };
}
function materializedEndpoints(route: RouteDesign, axis: OffsetPath, profile: readonly FrozenPoint[]) {
  return { a: materializedEndpoint(route.endpoints.a, axis, profile, false), b: materializedEndpoint(route.endpoints.b, axis, profile, true) };
}

/**
 * Common structure intent maps to each child. Common spine walls mean OUTER corridor walls:
 * R belongs only to forward R; L belongs only to reverse R. Copying both to each child would
 * manufacture two median walls. Inactive out-of-spine ranges stay in retainedSpine for rejoin.
 */
export function childControls(controls: RouteControls, axis: OffsetPath): RouteControls {
  const last = axis.correspondence[axis.correspondence.length - 1].spineEnd;
  const range = (s0: number, s1: number) => {
    const lo = Math.max(0, s0), hi = Math.min(last, s1);
    if (!(hi > lo)) return null;
    const a = childStationAt(axis, lo), b = childStationAt(axis, hi);
    return { s0: Math.min(a, b), s1: Math.max(a, b) };
  };
  const structures = controls.structureOverrides?.flatMap(r => { const mapped = range(r.s0, r.s1); return mapped ? [{ ...mapped, kind: r.kind }] : []; });
  const walls = controls.wallOverrides?.flatMap(w => {
    if (w.side !== (axis.direction === 1 ? 'R' : 'L')) return [];
    const mapped = range(w.s0, w.s1);
    return mapped ? [{ ...mapped, side: 'R' as const, height: w.height }] : [];
  });
  // Keep original paint order: later overlapping entries win even after reversing chainage.
  return { ...structuredClone(controls), ...(structures ? { structureOverrides: structures } : {}),
    ...(walls ? { wallOverrides: walls } : {}) };
}
function correspondence(plan: PairedGeometry) {
  const spans = plan.right.axis.correspondence;
  return [...spans.map(s => s.spineStart), spans[spans.length - 1].spineEnd].map(spineS => ({ spineS,
    forwardS: childStationAt(plan.right.axis, spineS), reverseS: childStationAt(plan.left.axis, spineS) }));
}

/**
 * One atomic Store command. Stable children/source IDs, exact physical curves and resolved grades
 * survive the split. Independent editing starts with frozen built heights; selecting Auto later is
 * an explicit vertical-authority change. Original pins/VPIs and inactive controls survive in retainedSpine.
 */
export function splitMotorwayCommand(corridor: Extract<CorridorDesign, { mode: 'paired' }>, routes: readonly RouteDesign[], resolved: MotorwayMaterialization,
  current: ProjectIdentity): Extract<ProjectCommand, { type: 'split-corridor' }> {
  const children = childrenFor(corridor, routes);
  checkMaterialization(corridor, children, resolved, current);
  for (let i = 0; i < children.length; i++) {
    const alignment = children[i].alignment;
    if (alignment.kind !== 'corridor' || alignment.corridorId !== corridor.id || alignment.direction !== (i === 0 ? 'forward' : 'reverse')) throw new Error('Paired child must derive only from its owning corridor');
  }
  const materialize = (route: MotorwayRoute, direction: 'forward' | 'reverse'): MotorwayRoute => {
    const axis = direction === 'forward' ? resolved.plan.right.axis : resolved.plan.left.axis, profile = resolved.profiles[direction];
    return { ...structuredClone(route), revision: route.revision + 1, endpoints: materializedEndpoints(route, axis, profile),
      alignment: { kind: 'exact', path: { elements: axis.path.elements.map(e => ({ ...e })), length: axis.path.length },
        vertical: { kind: 'frozen', points: profile.map(p => ({ ...p })) }, controls: childControls(corridor.spine.controls, axis) } };
  };
  const { spine, ...base } = corridor;
  return { type: 'split-corridor', corridor: { ...structuredClone(base), mode: 'independent', revision: corridor.revision + 1,
    retainedSpine: structuredClone(spine), correspondence: correspondence(resolved.plan) },
    children: [materialize(children[0], 'forward'), materialize(children[1], 'reverse')] };
}

/** Explicit destructive reset of independent geometry/controls, undoable as one complete command. */
export function rejoinMotorwayCommand(corridor: Extract<CorridorDesign, { mode: 'independent' }>, routes: readonly RouteDesign[], resolved: MotorwayMaterialization,
  current: ProjectIdentity, resetIndependentEdits: true): Extract<ProjectCommand, { type: 'rejoin-corridor' }> {
  if (resetIndependentEdits !== true) throw new Error('Rejoin requires explicit reset of independent edits');
  const children = childrenFor(corridor, routes);
  checkMaterialization(corridor, children, resolved, current);
  if (children.some(c => c.alignment.kind === 'corridor')) throw new Error('Independent children must own their alignments');
  const derive = (route: MotorwayRoute, direction: 'forward' | 'reverse'): MotorwayRoute => {
    const axis = direction === 'forward' ? resolved.plan.right.axis : resolved.plan.left.axis;
    return { ...structuredClone(route), revision: route.revision + 1,
      endpoints: materializedEndpoints(route, axis, resolved.profiles[direction]), alignment: { kind: 'corridor', corridorId: corridor.id, direction } };
  };
  const { retainedSpine, ...base } = corridor;
  return { type: 'rejoin-corridor', corridor: { ...structuredClone(base), mode: 'paired', revision: corridor.revision + 1,
    spine: structuredClone(retainedSpine), correspondence: correspondence(resolved.plan) },
    children: [derive(children[0], 'forward'), derive(children[1], 'reverse')] };
}
