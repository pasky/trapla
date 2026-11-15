import type { PointOnAlignment } from './horizontal';
import { curveIntersections } from './curve-intersections';
import { curvePointAt, offsetCurvePath, type CurvePath, type OffsetPath } from './offset-path';

/** Signed LEFT offsets from the common spine, sorted low to high. All dimensions in metres. */
export interface CarriagewayBand { min: number; max: number }
export interface PairedCrossSection {
  /** Right-hand traffic: right band travels along spine, left band travels against it. */
  right: CarriagewayBand;
  left: CarriagewayBand;
  formation: CarriagewayBand;
}
export interface PairedCarriageway {
  axis: OffsetPath;
  /** Physical edges, ordered by increasing spine offset (not travel-relative left/right). */
  edges: readonly [OffsetPath, OffsetPath];
  start: PointOnAlignment;
  end: PointOnAlignment;
}
export interface PairedGeometry {
  right: PairedCarriageway;
  left: PairedCarriageway;
  formationEdges: readonly [OffsetPath, OffsetPath];
  medianWidth: number;
  /** Geometry checks only; true does NOT mean the route is scored, connected or norm compliant. */
  planChecksComplete: boolean;
  issues: PairedGeometryIssue[];
}
export type PairedGeometryIssue =
  | { kind: 'radius'; side: 'right' | 'left'; element: number; actual: number; required: number }
  | { kind: 'self-intersection'; boundary: number; first: number; second: number }
  | { kind: 'boundary-intersection'; firstBoundary: number; secondBoundary: number }
  | { kind: 'intersection-budget' };

/**
 * Derives actual carriageway axes/edges and formation edges. Centre/edge offsets are exact
 * on lines and circles, including compound arcs; no displaced tangent-intersection polygon.
 * The caller supplies a sourced cross-section and minimum carriageway (not spine) radius.
 * Crossing/clearance checks are plan-only: no hidden assumption about endpoint elevations,
 * grade-separated self-crossings, decks, tunnels, or an interchange at a spine endpoint.
 */
export function pairedCarriageways(spine: CurvePath, section: PairedCrossSection, minimumRadius: number): PairedGeometry {
  const { right, left, formation } = section;
  if (![right.min, right.max, left.min, left.max, formation.min, formation.max, minimumRadius].every(Number.isFinite)
    || minimumRadius <= 0 || right.min >= right.max || left.min >= left.max || right.max >= left.min
    || formation.min > right.min || formation.max < left.max) throw new Error('Invalid paired cross-section or radius');
  const carriageway = (band: CarriagewayBand, direction: 1 | -1): PairedCarriageway => {
    const axis = offsetCurvePath(spine, (band.min + band.max) / 2, direction);
    return { axis, edges: [offsetCurvePath(spine, band.min, direction), offsetCurvePath(spine, band.max, direction)],
      start: curvePointAt(axis.path, 0), end: curvePointAt(axis.path, axis.path.length) };
  };
  const result: PairedGeometry = {
    right: carriageway(right, 1), left: carriageway(left, -1),
    formationEdges: [offsetCurvePath(spine, formation.min), offsetCurvePath(spine, formation.max)],
    medianWidth: left.min - right.max, planChecksComplete: true, issues: [],
  };
  for (const side of ['right', 'left'] as const) result[side].axis.path.elements.forEach((e, element) => {
    if (e.kind === 'arc' && e.r < minimumRadius) result.issues.push({ kind: 'radius', side, element, actual: e.r, required: minimumRadius });
  });
  // Four pavement boundaries plus two formation boundaries. Same-offset coincident edges are
  // intentional ownership, not two works; deduplicate them before pairwise intersection checks.
  const boundaries = [...result.right.edges, ...result.left.edges, ...result.formationEdges]
    .filter((p, i, paths) => paths.findIndex(q => q.offset === p.offset) === i);
  let budgetHit = false;
  for (let i = 0; i < boundaries.length; i++) {
    const own = curveIntersections(boundaries[i].path);
    budgetHit ||= !own.complete;
    for (const c of own.collisions) result.issues.push({ kind: 'self-intersection', boundary: i, first: c.first, second: c.second });
    for (let j = 0; j < i; j++) {
      const pair = curveIntersections(boundaries[j].path, boundaries[i].path);
      budgetHit ||= !pair.complete;
      if (pair.collisions.length) result.issues.push({ kind: 'boundary-intersection', firstBoundary: j, secondBoundary: i });
    }
  }
  if (budgetHit) { result.planChecksComplete = false; result.issues.push({ kind: 'intersection-budget' }); }
  return result;
}

export interface ConnectionPort extends PointOnAlignment { z: number; grade: number }
export interface PortTolerance { position: number; elevation: number; tangentRadians: number; grade: number }
/** Physical same-travel-direction port comparison. Never snaps or extends an unconnected path. */
export function connectionMismatch(actual: ConnectionPort, target: ConnectionPort, tolerance: PortTolerance) {
  const values = [...Object.values(actual), ...Object.values(target), ...Object.values(tolerance)];
  if (!values.every(Number.isFinite) || Object.values(tolerance).some(v => v < 0)
    || Math.abs(Math.hypot(actual.tx, actual.ty) - 1) > 1e-8 || Math.abs(Math.hypot(target.tx, target.ty) - 1) > 1e-8) throw new Error('Invalid connection port or tolerance');
  const position = Math.hypot(actual.x - target.x, actual.y - target.y), elevation = Math.abs(actual.z - target.z);
  const tangentRadians = Math.acos(Math.max(-1, Math.min(1, actual.tx * target.tx + actual.ty * target.ty)));
  const grade = Math.abs(actual.grade - target.grade);
  return { position, elevation, tangentRadians, grade,
    matches: position <= tolerance.position && elevation <= tolerance.elevation && tangentRadians <= tolerance.tangentRadians && grade <= tolerance.grade };
}
