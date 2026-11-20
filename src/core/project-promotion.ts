import { ROAD_CLASSES } from './data/urban';
import type { ConnectionDesign, ProjectDesign, RoadSpec, RouteDesign, SourceInterval, SourceLocation, TransportSurface, XYZ } from './project';
import type { ProjectCommand } from '../project-store-contract';
import { ProjectSurfaceIndex, ProjectTransportIndex } from './project-network';
import { mappedRoadName } from './terms';
import { chainable, chainOffset, chainParts, chainPath, isChain, jointId } from './stretch-chain';

const distance = (a: XYZ, b: XYZ) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const locationKey = (l: SourceLocation) => JSON.stringify([l.transportData, l.sourceId, l.s]);
/** Source facts and explicit study-width prior only; missing operations are NOT filled from the mission. */
export function groundRoadSourceInfo(base: ProjectTransportIndex, sourceId: string): {
  name: string; legalClass: RoadSpec['legalClass']; width: number; widthBasis: 'study-road-class'; taggedSpeed: number | null;
} {
  const source = base.source(sourceId), row = ROAD_CLASSES[source?.tags.highway ?? ''];
  if (!source) throw new Error(base.unresolvedReason(sourceId) ?? 'Source binding is unresolved');
  if (source.kind !== 'road' || source.elevation !== 'terrain' || !row || row.noAtGrade) throw new Error('Promotion needs a supported ground road');
  const legalClass: RoadSpec['legalClass'] = source.tags.highway === 'primary' ? 'I' : source.tags.highway === 'secondary' ? 'II'
    : source.tags.highway === 'tertiary' ? 'III' : source.tags.highway === 'track' ? 'track' : source.tags.highway === 'service' ? 'service' : 'local';
  const raw = source.tags.maxspeed?.trim(), speed = raw && /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : NaN;
  // Its own name, else class and number as Czech maps write them ("road III/11436").
  return { name: mappedRoadName(source.tags), legalClass, width: row.width, widthBasis: 'study-road-class',
    taggedSpeed: Number.isFinite(speed) && speed > 0 ? speed : null };
}

/** Exact bounded source promotion. Geometry and branch connections are one atomic store command;
 * there is no hidden curve fitting, terrain-draped bridge or invented operation assumption. */
export function promoteGroundRoad(base: ProjectTransportIndex, input: {
  routeId: string; acousticSourceId: string; interval: SourceInterval; specification: RoadSpec; name: string;
}): Extract<ProjectCommand, { type: 'promote' }> {
  base.checkInterval(input.interval);
  const source = base.source(input.interval.sourceId)!;
  const { legalClass } = groundRoadSourceInfo(base, source.id);
  if (input.specification.policy !== 'existing-ground' || input.specification.crossSection !== 'existing'
    || input.specification.legalClass !== legalClass || !(input.specification.existingWidth! > 0)) throw new Error('Promotion needs explicit existing-road specification');
  const path = base.path(input.interval), start = input.interval.s0, length = input.interval.s1 - start;
  const sourceLocation = (s: number): SourceLocation => ({ transportData: base.transportData, sourceId: source.id, s });
  const route: RouteDesign = { id: input.routeId, acousticSourceId: input.acousticSourceId, revision: 0,
    name: input.name, kind: 'road', role: 'auxiliary', specification: structuredClone(input.specification),
    source: { binding: 'resolved', intervals: [{ ...input.interval }], transferredWorkIds: [] },
    endpoints: { a: { position: { x: path[0].x, y: path[0].y, z: path[0].z }, anchor: { kind: 'source', location: sourceLocation(start) }, binding: 'resolved' },
      b: { position: { x: path[path.length - 1].x, y: path[path.length - 1].y, z: path[path.length - 1].z },
        anchor: { kind: 'source', location: sourceLocation(input.interval.s1) }, binding: 'resolved' } },
    alignment: { kind: 'reference', provenance: 'imported', vertical: { kind: 'reference' }, controls: {},
      path: path.map(p => ({ x: p.x, y: p.y, s: p.s - start, elevation: { kind: 'ground' } })) },
  };
  const connections: ConnectionDesign[] = [];
  const connect = (id: string, s: number, location: SourceLocation, position: XYZ) => {
    connections.push({ id, revision: 0, kind: 'continuation', position: { ...position },
      ports: [{ kind: 'route', routeId: route.id, s }, { kind: 'source', location: { ...location } }] });
  };
  connect(`connection:${route.id}:start`, 0, sourceLocation(start), route.endpoints.a.position);
  connect(`connection:${route.id}:end`, length, sourceLocation(input.interval.s1), route.endpoints.b.position);
  for (const branch of base.branches(input.interval)) for (const other of branch.other) {
    const otherSource = base.source(other.sourceId)!, p = base.position(other.sourceId, other.s);
    if (otherSource.kind === 'railway') throw new Error('Level crossing with a railway is not supported yet');
    if (otherSource.kind !== 'road' || !p || otherSource.elevation !== 'terrain') throw new Error('Branch connection needs resolved ground-road data');
    connect(`connection:${route.id}:branch:${branch.nodeId}:${branch.s}:${other.sourceId}:${other.s}`, branch.s - start, other, p);
  }
  return { type: 'promote', routes: [route], connections };
}

/** The ground road of a stretch over several mapped ways (core/stretch-chain.ts): the first part on the ground. */
export const chainGroundSource = (base: ProjectTransportIndex, intervals: readonly SourceInterval[]) =>
  intervals.find(i => base.source(i.sourceId)?.elevation === 'terrain')?.sourceId ?? intervals[0]?.sourceId ?? '';
/** Promotion of a stretch over several mapped ways in route order (one interval: promoteGroundRoad, exactly): each
 * part a road of the stretch's legal class on the ground or a bridge, each meeting the next at a node. Its connections:
 * its two ends, each joint (`jointId`: where the old ways met, both of them its own), and every other way meeting it. */
export function promoteGroundChain(base: ProjectTransportIndex, input: {
  routeId: string; acousticSourceId: string; intervals: SourceInterval[]; specification: RoadSpec; name: string;
}): Extract<ProjectCommand, { type: 'promote' }> {
  const { intervals } = input;
  if (intervals.length === 1) return promoteGroundRoad(base, { ...input, interval: intervals[0] });
  if (!intervals.length || !isChain(base, intervals)) throw new Error('Not a stretch of one road');
  const first = base.source(chainGroundSource(base, intervals));
  for (const i of intervals) {
    base.checkInterval(i);
    if (!chainable(base.source(i.sourceId), first?.tags.highway)) throw new Error('Promotion needs a supported ground road');
  }
  const { legalClass } = groundRoadSourceInfo(base, first!.id);
  if (input.specification.policy !== 'existing-ground' || input.specification.crossSection !== 'existing'
    || input.specification.legalClass !== legalClass || !(input.specification.existingWidth! > 0)) throw new Error('Promotion needs explicit existing-road specification');
  const parts = chainParts(base, intervals), path = chainPath(base, intervals), own = new Set(intervals.map(i => i.sourceId));
  const location = (sourceId: string, s: number): SourceLocation => ({ transportData: base.transportData, sourceId, s });
  const entry = (k: number) => parts[k].reversed ? parts[k].interval.s1 : parts[k].interval.s0, exit = (k: number) => parts[k].reversed ? parts[k].interval.s0 : parts[k].interval.s1;
  const last = parts.length - 1, a = path[0], b = path[path.length - 1];
  const route: RouteDesign = { id: input.routeId, acousticSourceId: input.acousticSourceId, revision: 0,
    name: input.name, kind: 'road', role: 'auxiliary', specification: structuredClone(input.specification),
    source: { binding: 'resolved', intervals: intervals.map(i => ({ ...i })), transferredWorkIds: [] },
    endpoints: { a: { position: { x: a.x, y: a.y, z: a.z }, anchor: { kind: 'source', location: location(intervals[0].sourceId, entry(0)) }, binding: 'resolved' },
      b: { position: { x: b.x, y: b.y, z: b.z }, anchor: { kind: 'source', location: location(intervals[last].sourceId, exit(last)) }, binding: 'resolved' } },
    alignment: { kind: 'reference', provenance: 'imported', vertical: { kind: 'reference' }, controls: {},
      path: path.map(p => ({ x: p.x, y: p.y, s: p.s, elevation: base.source(intervals[p.part].sourceId)?.elevation === 'terrain' ? { kind: 'ground' } : { kind: 'unresolved' } })) },
  };
  const connections: ConnectionDesign[] = [];
  const connect = (id: string, s: number, ports: SourceLocation[], position: XYZ) => {
    connections.push({ id, revision: 0, kind: 'continuation', position: { ...position },
      ports: [{ kind: 'route', routeId: route.id, s }, ...ports.map(l => ({ kind: 'source' as const, location: { ...l } }))] });
  };
  const length = path[path.length - 1].s;
  connect(`connection:${route.id}:start`, 0, [location(intervals[0].sourceId, entry(0))], route.endpoints.a.position);
  connect(`connection:${route.id}:end`, length, [location(intervals[last].sourceId, exit(last))], route.endpoints.b.position);
  for (let k = 0; k < last; k++) {
    const s = chainOffset(parts, k + 1, entry(k + 1)), p = path.find(q => Math.abs(q.s - s) < 1e-6) ?? path[0];
    connect(jointId(route.id, k), s, [location(intervals[k].sourceId, exit(k)), location(intervals[k + 1].sourceId, entry(k + 1))], p);
  }
  const seen = new Set<string>();
  parts.forEach(({ interval }, k) => {
    for (const branch of base.branches(interval)) for (const other of branch.other) {
      if (own.has(other.sourceId)) continue; // (the stretch's own ways meet at its joints)
      const key = `${branch.nodeId}:${other.sourceId}:${other.s}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const otherSource = base.source(other.sourceId)!, p = base.position(other.sourceId, other.s);
      if (otherSource.kind === 'railway') throw new Error('Level crossing with a railway is not supported yet');
      if (otherSource.kind !== 'road' || !p || otherSource.elevation !== 'terrain') throw new Error('Branch connection needs resolved ground-road data');
      const s = chainOffset(parts, k, branch.s);
      connect(`connection:${route.id}:branch:${branch.nodeId}:${s}:${other.sourceId}:${other.s}`, s, [other], p);
    }
  });
  return { type: 'promote', routes: [route], connections };
}

export interface ReplacementAssessment {
  /** Topology feasibility only, NOT final engineering acceptance or score eligibility. */
  feasibleIntervals: SourceInterval[];
  failures: { routeId: string; reason: string; sourceLocation?: SourceLocation }[];
}
/** Check exact source continuations/branches against jointly proposed XYZ surfaces. Never use stale
 * accepted route geometry for endpoint matching. Final engineering/property/noise must also pass. */
export function assessReplacementConnections(base: ProjectTransportIndex, project: ProjectDesign,
  proposedSurfaces: readonly TransportSurface[]): ReplacementAssessment {
  const surfaces = new ProjectSurfaceIndex(proposedSurfaces), failures: ReplacementAssessment['failures'] = [];
  const byRoute = new Map(proposedSurfaces.map(s => [s.routeId, s]));
  const claims = new Map<string, { routeId: string; interval: SourceInterval }[]>();
  const blocked = new Set<string>();
  const fail = (routeId: string, reason: string, sourceLocation?: SourceLocation) => {
    failures.push({ routeId, reason, ...(sourceLocation ? { sourceLocation } : {}) }); blocked.add(routeId);
  };
  for (const r of project.routes) if (r.source) {
    if (r.source.binding !== 'resolved') { fail(r.id, 'unresolved-replacement'); continue; }
    for (const interval of r.source.intervals) {
      try { base.checkInterval(interval); } catch { fail(r.id, base.unresolvedReason(interval.sourceId) ?? 'unresolved-replacement'); continue; }
      let owned = claims.get(interval.sourceId); if (!owned) claims.set(interval.sourceId, owned = []);
      owned.push({ routeId: r.id, interval });
    }
  }
  for (const owned of claims.values()) {
    owned.sort((a, b) => a.interval.s0 - b.interval.s0 || a.interval.s1 - b.interval.s1 || a.routeId.localeCompare(b.routeId));
    // Sweep overlaps; keep only the active furthest end, no dense route/source Cartesian product.
    let furthest = owned[0];
    for (let i = 1; i < owned.length; i++) {
      const c = owned[i];
      if (c.interval.s0 < furthest.interval.s1) {
        fail(c.routeId, 'conflicting-source-claim'); fail(furthest.routeId, 'conflicting-source-claim');
      }
      if (c.interval.s1 > furthest.interval.s1) furthest = c;
    }
  }
  const contacts = new Map<string, Set<string>>(), dependencies = new Map<string, Set<string>>();
  const removedOwners = (location: SourceLocation): Set<string> | null => {
    if (location.transportData !== base.transportData) return null;
    const source = base.source(location.sourceId); if (!source) return null;
    let left = location.s === 0, right = location.s === source.stations[source.stations.length - 1];
    const owners = new Set<string>();
    for (const c of claims.get(location.sourceId) ?? []) {
      if (c.interval.s0 < location.s && c.interval.s1 >= location.s) { left = true; owners.add(c.routeId); }
      if (c.interval.s0 <= location.s && c.interval.s1 > location.s) { right = true; owners.add(c.routeId); }
    }
    return left && right && owners.size ? owners : null;
  };
  for (const c of project.connections) {
    let usable = true;
    const participants = new Set(c.ports.filter(p => p.kind === 'route').map(p => p.routeId));
    for (const port of c.ports) {
      let p: XYZ | null;
      if (port.kind === 'source') {
        const owners = removedOwners(port.location);
        if (owners) {
          // A fully replaced source is no longer an elevation/connectivity authority. Its owning
          // designed routes must explicitly appear at this connection and supply CURRENT XYZ.
          for (const id of owners) if (!participants.has(id)) usable = false;
          for (const id of owners) participants.add(id);
          p = c.position;
        } else p = port.location.transportData === base.transportData ? base.position(port.location.sourceId, port.location.s) : null;
      } else p = surfaces.position(port.routeId, port.s);
      if (!p || distance(p, c.position) > 1e-6) usable = false;
    }
    const ids = [...participants];
    for (let i = 1; i < ids.length; i++) {
      for (const [from, to] of [[ids[0], ids[i]], [ids[i], ids[0]]]) {
        let neighbours = dependencies.get(from); if (!neighbours) dependencies.set(from, neighbours = new Set()); neighbours.add(to);
      }
    }
    if (!usable) { for (const p of c.ports) if (p.kind === 'route') fail(p.routeId, 'connection-does-not-meet'); continue; }
    for (const p of c.ports) if (p.kind === 'source') {
      const key = locationKey(p.location); let routes = contacts.get(key); if (!routes) contacts.set(key, routes = new Set());
      for (const q of c.ports) if (q.kind === 'route') routes.add(q.routeId);
    }
  }
  for (const route of project.routes) {
    const surface = byRoute.get(route.id);
    if (!surface || surface.revision !== route.revision || surface.points.length < 2) { fail(route.id, 'missing-current-surface'); continue; }
    const ends = [surface.points[0], surface.points[surface.points.length - 1]];
    for (const [i, endpoint] of [route.endpoints.a, route.endpoints.b].entries()) {
      if (endpoint.binding !== 'resolved' || distance(ends[i], endpoint.position) > 1e-6) { fail(route.id, 'endpoint-does-not-meet'); continue; }
      if (endpoint.anchor.kind === 'route') {
        const target = endpoint.anchor.routeId;
        for (const [from, to] of [[route.id, target], [target, route.id]]) {
          let neighbours = dependencies.get(from); if (!neighbours) dependencies.set(from, neighbours = new Set()); neighbours.add(to);
        }
        const p = surfaces.position(target, endpoint.anchor.s);
        if (!p || distance(p, endpoint.position) > 1e-6) fail(route.id, 'designed-endpoint-does-not-meet');
      } else if (endpoint.anchor.kind === 'source') {
        const l = endpoint.anchor.location;
        // Another route replacing this source point removes the old road here; its ground XYZ is stale.
        const foreign = [...removedOwners(l) ?? []].filter(id => id !== route.id);
        for (const target of foreign) for (const [from, to] of [[route.id, target], [target, route.id]]) {
          let neighbours = dependencies.get(from); if (!neighbours) dependencies.set(from, neighbours = new Set()); neighbours.add(to);
        }
        if (foreign.length) { fail(route.id, 'source-endpoint-replaced', l); continue; }
        const p = l.transportData === base.transportData ? base.position(l.sourceId, l.s) : null;
        if (!p || distance(p, endpoint.position) > 1e-6) fail(route.id, 'source-endpoint-does-not-meet');
      }
    }
    for (const interval of route.source?.intervals ?? []) {
      if (blocked.has(route.id)) break;
      const source = base.source(interval.sourceId)!;
      const required: SourceLocation[] = [];
      if (interval.s0 > 0) required.push({ transportData: base.transportData, sourceId: source.id, s: interval.s0 });
      if (interval.s1 < source.stations[source.stations.length - 1]) required.push({ transportData: base.transportData, sourceId: source.id, s: interval.s1 });
      for (const b of base.branches(interval)) required.push(...b.other);
      for (const location of required) if (!contacts.get(locationKey(location))?.has(route.id)) fail(route.id, 'lost-source-connection', location);
    }
  }
  const queue = [...blocked];
  for (let i = 0; i < queue.length; i++) for (const id of dependencies.get(queue[i]) ?? []) if (!blocked.has(id)) {
    fail(id, 'dependent-connection-failed'); queue.push(id);
  }
  return { feasibleIntervals: project.routes.filter(r => !blocked.has(r.id)).flatMap(r => r.source?.intervals.map(i => ({ ...i })) ?? []), failures };
}
