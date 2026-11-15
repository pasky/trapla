// Motorways and railways in the kind-generic "any line" flows (route-kinds.ts): Build → Motorway,
// Build → Railway, and a mapped railway rebuilt by dragging it. Registered after the road kinds.
import { MOTORWAY_TRAFFIC } from '../core/data/scenario';
import { addMotorwayCorridor, MOTORWAY_CATEGORY } from '../core/project-motorway';
import { createRailwayRoute, promoteGroundRailway, type RailwayRoute } from '../core/project-railway';
import type { EndpointConstraint, ProjectDesign, RouteDesign } from '../core/project';
import type { ProjectTransportIndex } from '../core/project-network';
import { KIND } from '../core/structures';
import { fitBends, moveStretchEnds, type PlacedEnd } from './road-edit';
import { registerBuildKind, registerMappedLineKind, type BuildKind, type MappedLineKind } from './route-kinds';

/** A rebuilt railway's old line becomes bends where it strays more than this from a chord, and bends
 * closer than RAIL_BEND_GAP are merged: track curves at 120 km/h are ≥ 740 m in radius, so the old
 * line's every wiggle cannot be a bend. Display/edit choices, not design rules (m). */
const RAIL_FIT_TOLERANCE = 25, RAIL_BEND_GAP = 300;
const railBends = (path: readonly { x: number; y: number; s: number }[]) => fitBends(path, RAIL_FIT_TOLERANCE, RAIL_BEND_GAP);

const unique = (project: ProjectDesign, base: string) => {
  const used = new Set(project.routes.map(r => r.name));
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base} ${n}`;
  return name;
};
const resolved = (e: PlacedEnd): EndpointConstraint => ({ position: { ...e.position }, anchor: structuredClone(e.anchor), binding: 'resolved' });
const railName = (base: ProjectTransportIndex, sourceId: string) => {
  const t = base.source(sourceId)?.tags;
  return t?.name || (t?.ref ? `Railway ${t.ref}` : 'Railway');
};
const groundRailway = (base: ProjectTransportIndex, sourceId: string) => {
  const source = base.source(sourceId);
  return !!source && source.kind === 'railway' && source.elevation === 'terrain' && !source.bridge && !source.tunnel;
};

export const RAIL_LINE: MappedLineKind = {
  kind: 'railway',
  rebuildable(base, sourceId) {
    const source = base.source(sourceId);
    if (source?.kind !== 'railway') return null;
    if (!groundRailway(base, sourceId)) return { ok: false, why: 'Railway bridges and tunnels cannot be rebuilt yet.' };
    if (source.tags.service) return { ok: false, why: 'Sidings and yards cannot be rebuilt: only running lines.' };
    return { ok: true, becomes: 'single-track electric railway (120 km/h)' };
  },
  rebuild: (base, interval, ids) => promoteGroundRailway(base, { ...ids, interval, name: railName(base, interval.sourceId) }, railBends),
  moveEnds: (base, project, routeId, s0, s1) => moveStretchEnds(base, project, routeId, s0, s1, (interval, route) =>
    promoteGroundRailway(base, { routeId: route.id, acousticSourceId: route.acousticSourceId, interval, name: route.name }, railBends,
      route.kind === 'railway' ? route as RailwayRoute : undefined)),
};

export const RAIL_BUILD: BuildKind = {
  kind: 'railway', label: 'Railway',
  onSource(base, sourceId, s) {
    const source = base.source(sourceId);
    if (!source || source.kind !== 'railway') return { ok: false, why: 'A railway cannot end on a road: end it on a railway or on open ground.' };
    const p = groundRailway(base, sourceId) ? base.position(sourceId, s) : null;
    if (!p) return { ok: false, why: 'A railway cannot join on a bridge or in a tunnel.' };
    return { ok: true, label: `joins ${railName(base, sourceId).replace(/^Railway/, 'the railway')}`,
      end: { position: p, anchor: { kind: 'source', location: { transportData: base.transportData, sourceId, s } } } };
  },
  onRoute(route, result, s) {
    const r = result.legacy;
    if (route.kind !== 'railway') return { ok: false, why: 'A railway cannot end on a road: end it on a railway or on open ground.' };
    if (!r) return { ok: false, why: 'This railway is not checked yet, so nothing can join it.' };
    const i = Math.max(0, Math.min(r.n - 1, Math.round(s / r.ds)));
    if (r.kind[i] !== KIND.earth) return { ok: false, why: 'A railway cannot join on a bridge or in a tunnel.' };
    return { ok: true, label: `joins ${route.name}`, end: { position: { x: r.x[i], y: r.y[i], z: r.grade[i] }, anchor: { kind: 'route', routeId: route.id, s: r.s[i] } } };
  },
  // a single-track line at 120 km/h: the cheapest the game has rules for; double track and speed in its card
  create: (project, a, b, ids): RouteDesign => ({ ...createRailwayRoute(ids.routeId, unique(project, 'New railway'), { a: resolved(a), b: resolved(b) }, 1, 120),
    acousticSourceId: ids.acousticSourceId }),
};

export const MOTORWAY_BUILD: BuildKind = {
  kind: 'motorway', label: 'Motorway',
  onSource() { return { ok: false, why: 'A motorway joins other roads only at interchanges, which are not in the game yet: end it on open ground.' }; },
  onRoute() { return { ok: false, why: 'A motorway joins other roads only at interchanges, which are not in the game yet: end it on open ground.' }; },
  // Both directions on one D 27.5 line at 120 km/h; traffic: the national mean motorway prior of the
  // motorway missions (data/scenario.ts). It stays unpriced: no interchange at its ends.
  createInProject(project, a, b, newId) {
    const forward = newId('route'), reverse = newId('route'), name = unique(project, 'New motorway');
    const next = addMotorwayCorridor(project, { a: resolved(a), b: resolved(b) },
      { category: MOTORWAY_CATEGORY, speed: 120, pis: [], profileMode: 'auto', vpis: [] },
      { aadt: MOTORWAY_TRAFFIC.traffic, heavyShare: MOTORWAY_TRAFFIC.heavyShare },
      { corridorId: newId('corridor'), forward, reverse, acoustic: () => newId('acoustic') }, 'auxiliary',
      { forward: name, reverse: `${name}, other direction` });
    return { project: next, activeRouteId: forward };
  },
};

registerBuildKind(MOTORWAY_BUILD);
registerBuildKind(RAIL_BUILD);
registerMappedLineKind(RAIL_LINE);
