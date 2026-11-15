// Persistence boundary validation. Invalid/newer saves are preserved, never normalised into defaults.
import { CROSSING_CHOICES, MAX_LINK_COORD, MAX_LINK_VIA } from './crossings';
import type { AlignmentDesign, ProjectDesign } from './project';

type Obj = Record<string, unknown>;
const object = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const list = (v: unknown): v is unknown[] => Array.isArray(v);
const integer = (v: unknown): v is number => number(v) && Number.isSafeInteger(v) && v >= 0;
const choice = (v: unknown, values: readonly unknown[]) => values.includes(v);
const xyz = (v: unknown) => object(v) && number(v.x) && number(v.y) && number(v.z);
const location = (v: unknown) => object(v) && text(v.transportData) && text(v.sourceId) && number(v.s) && v.s >= 0;
const interval = (v: unknown) => object(v) && text(v.transportData) && text(v.sourceId)
  && number(v.s0) && number(v.s1) && v.s0 >= 0 && v.s1 > v.s0;
const stationPoints = (v: unknown, radius = false) => list(v) && v.every(p => object(p) && number(p.s) && p.s >= 0 && number(p.z)
  && (!radius || p.r === null || (number(p.r) && p.r > 0)));
function vertical(v: unknown): boolean {
  if (!object(v)) return false;
  if (v.kind === 'auto') return stationPoints(v.pins) && (v.manualVpis === undefined || stationPoints(v.manualVpis, true));
  if (v.kind === 'manual') return stationPoints(v.vpis, true) && (v.autoPins === undefined || stationPoints(v.autoPins));
  if (v.kind === 'frozen') return stationPoints(v.points) && (v.points as Obj[]).length >= 2
    && (v.points as Obj[]).every((p, i, a) => !i || (p.s as number) > (a[i - 1].s as number));
  return false;
}
function controls(v: unknown): boolean {
  if (!object(v)) return false;
  if (['profileMode', 'vpis', 'gradePins', 'crossingOverrides', 'buildingOverrides', 'category', 'speed', 'pis'].some(k => k in v)) return false;
  if (v.structureOverrides !== undefined && (!list(v.structureOverrides) || !v.structureOverrides.every(p => object(p)
    && number(p.s0) && p.s0 >= 0 && number(p.s1) && p.s1 > p.s0 && choice(p.kind, [0, 1, 2])))) return false;
  if (v.wallOverrides !== undefined && (!list(v.wallOverrides) || !v.wallOverrides.every(p => object(p)
    && number(p.s0) && p.s0 >= 0 && number(p.s1) && p.s1 > p.s0 && choice(p.side, ['L', 'R']) && number(p.height)
    && (p.height === 0 || p.height >= 2 && p.height <= 6)))) return false;
  if (v.crossings !== undefined && (!list(v.crossings) || !v.crossings.every(c => {
    if (!object(c) || !choice(c.choice, CROSSING_CHOICES) || !object(c.target)) return false;
    // a shaped reroute: two lists of bend points (one per side of our road)
    if (c.via !== undefined && (c.choice !== 'reconnection' || !list(c.via) || c.via.length !== 2 || !c.via.every(side => list(side)
      && side.length <= MAX_LINK_VIA && side.every(p => object(p) && number(p.x) && number(p.y) && Math.abs(p.x) <= MAX_LINK_COORD && Math.abs(p.y) <= MAX_LINK_COORD)))) return false;
    if (c.to !== undefined && (c.via === undefined || !Number.isSafeInteger(c.to) || (c.to as number) < -2)) return false;
    const t = c.target;
    return t.kind === 'legacy-way' ? text(t.objectData) && integer(t.roadId)
      : t.kind === 'source' ? interval(t.interval)
      : t.kind === 'route' && text(t.routeId) && number(t.s0) && t.s0 >= 0 && number(t.s1) && t.s1 >= t.s0;
  }))) return false;
  return true;
}
function alignment(v: unknown): boolean {
  if (!object(v)) return false;
  if (v.kind === 'corridor') return text(v.corridorId) && choice(v.direction, ['forward', 'reverse'])
    && !('controls' in v) && !('vertical' in v) && !('pis' in v) && !('path' in v);
  if (!controls(v.controls)) return false;
  if (v.kind === 'pi') return vertical(v.vertical) && list(v.pis) && v.pis.every(p => object(p) && number(p.x) && number(p.y)
    && (p.r === null || number(p.r) && p.r > 0));
  if (v.kind === 'exact') {
    if (!vertical(v.vertical) || !object(v.path) || !number(v.path.length) || v.path.length <= 0 || !list(v.path.elements) || !v.path.elements.length) return false;
    let s = 0;
    for (const e of v.path.elements) {
      if (!object(e) || !number(e.s0) || Math.abs(e.s0 - s) > 1e-6 || !number(e.len) || e.len <= 0) return false;
      if (e.kind === 'line') { if (![e.x0, e.y0, e.dx, e.dy].every(number) || Math.abs(Math.hypot(e.dx as number, e.dy as number) - 1) > 1e-6) return false; }
      else if (e.kind === 'arc') { if (![e.cx, e.cy, e.r, e.a0].every(number) || (e.r as number) <= 0 || !choice(e.dir, [-1, 1]) || !Number.isInteger(e.pi)) return false; }
      else return false;
      s += e.len;
    }
    return Math.abs(s - v.path.length) <= 1e-6;
  }
  if (v.kind === 'reference') return choice(v.provenance, ['imported', 'built-work', 'independent-carriageway'])
    && (vertical(v.vertical) || object(v.vertical) && v.vertical.kind === 'reference')
    && list(v.path) && v.path.length >= 2 && v.path.every((p, i, a) => object(p) && number(p.x) && number(p.y)
      && number(p.s) && (i ? object(a[i - 1]) && number((a[i - 1] as Obj).s) && p.s > ((a[i - 1] as Obj).s as number) : p.s === 0)
      && object(p.elevation) && (choice(p.elevation.kind, ['ground', 'unresolved'])
        || p.elevation.kind === 'known' && number(p.elevation.z) && text(p.elevation.evidence)));
  return false;
}
function endpoint(v: unknown): boolean {
  if (!object(v) || !xyz(v.position) || !choice(v.binding, ['resolved', 'unresolved']) || !object(v.anchor)) return false;
  if (v.tangent !== undefined && (!xyz(v.tangent) || Math.abs(Math.hypot(...['x', 'y', 'z'].map(k => (v.tangent as Obj)[k] as number)) - 1) > 1e-6)) return false;
  const a = v.anchor;
  return a.kind === 'free' || a.kind === 'mission' && text(a.portId) || a.kind === 'source' && location(a.location)
    || a.kind === 'route' && text(a.routeId) && number(a.s) && a.s >= 0;
}
const endpoints = (v: unknown) => object(v) && endpoint(v.a) && endpoint(v.b);
function spec(v: unknown, kind: unknown): boolean {
  if (!object(v) || v.kind !== kind || !text(v.policy) || !number(v.designSpeed) || v.designSpeed <= 0 || !object(v.operations)) return false;
  const o = v.operations;
  if (kind === 'road' || kind === 'motorway') {
    if (!number(o.aadt) || o.aadt < 0 || !number(o.heavyShare) || o.heavyShare < 0 || o.heavyShare > 1 || !number(o.speed) || o.speed <= 0
      || o.speedPolicy !== undefined && !choice(o.speedPolicy, ['design', 'independent'])) return false;
    return kind === 'motorway' ? text(v.crossSection) : choice(v.legalClass, ['I', 'II', 'III', 'local', 'service', 'track'])
      && choice(v.crossSection, ['S7.5', 'S9.5', 'S11.5', 'existing'])
      && (v.crossSection !== 'existing' || number(v.existingWidth) && v.existingWidth > 0);
  }
  return kind === 'railway' && (v.gaugeMm === null || number(v.gaugeMm) && v.gaugeMm > 0) && choice(v.tracks, [1, 2])
    && choice(v.electrification, ['unknown', 'none', 'AC25kV', 'DC3kV', 'other'])
    && ['passengerDay', 'passengerNight', 'freightDay', 'freightNight', 'passengerSpeed', 'freightSpeed'].every(k => number(o[k]) && (o[k] as number) >= 0);
}
/** Never JSON-clone before this check: JSON turns NaN into null and silently drops undefined. */
export function assertProjectDesign(value: unknown, allowStaleBindings = false): asserts value is ProjectDesign {
  const fail = (reason: string): never => { throw new Error(`Invalid project: ${reason}`); };
  if (!object(value) || value.schemaVersion !== 1) fail('unsupported schema');
  const p = value as Obj;
  // Reject non-JSON/NaN state before persistence can silently change it. Iterative and linear.
  const pending: unknown[] = [value];
  const seen = new Set<object>();
  while (pending.length) {
    const next = pending.pop();
    if (typeof next === 'number' && !Number.isFinite(next) || typeof next === 'bigint' || typeof next === 'function' || typeof next === 'symbol') fail('non-JSON value');
    if (next && typeof next === 'object') {
      if (seen.has(next)) continue;
      seen.add(next);
      if (Array.isArray(next)) {
        for (let i = 0; i < next.length; i++) if (!Object.prototype.hasOwnProperty.call(next, i) || next[i] === undefined) fail('sparse or undefined array element');
      } else if (Object.getPrototypeOf(next) !== Object.prototype && Object.getPrototypeOf(next) !== null) fail('non-plain object');
      for (const child of Object.values(next)) pending.push(child);
    }
  }
  try { JSON.stringify(value); } catch { fail('cyclic value'); }
  if (!['scenarioId', 'presetId', 'packId', 'objectData'].every(k => text(p[k])) || !(p.transportData === null || text(p.transportData))) fail('identity');
  if (!list(p.routes) || !list(p.corridors) || !list(p.connections) || !list(p.buildingOverrides) || !object(p.mission)) fail('collections');
  const routes = p.routes as unknown[], corridors = p.corridors as unknown[], connections = p.connections as unknown[];
  const ids = new Set<string>();
  const unique = (id: unknown) => { if (!text(id) || ids.has(id)) fail('duplicate or missing identity'); ids.add(id as string); };
  for (const r of routes) {
    if (!object(r) || !text(r.name) || !integer(r.revision) || !text(r.acousticSourceId) || !choice(r.role, ['mission', 'auxiliary'])
      || !spec(r.specification, r.kind) || !alignment(r.alignment) || !endpoints(r.endpoints)) fail('route');
    const route = r as Obj; unique(route.id);
    if (route.source !== undefined) {
      const s = route.source;
      if (!object(s) || !choice(s.binding, ['resolved', 'unresolved']) || !list(s.intervals) || !s.intervals.length
        || !s.intervals.every(interval) || !list(s.transferredWorkIds) || !s.transferredWorkIds.every(text)) fail('source replacement');
    }
  }
  const routeMap = new Map((routes as unknown as ProjectDesign['routes']).map(r => [r.id, r]));
  const owners = new Map<string, string>();
  for (const c of corridors) {
    if (!object(c) || c.kind !== 'motorway' || !integer(c.revision) || !endpoints(c.endpoints) || !text(c.formationPolicy)
      || !object(c.children) || !text(c.children.forward) || !text(c.children.reverse) || c.children.forward === c.children.reverse
      || !list(c.correspondence) || !c.correspondence.every(k => object(k) && [k.spineS, k.forwardS, k.reverseS].every(v => number(v) && v >= 0))) fail('corridor');
    const corridor = c as Obj; unique(corridor.id);
    const spine = corridor.mode === 'paired' ? corridor.spine : corridor.mode === 'independent' ? corridor.retainedSpine : null;
    if (!alignment(spine) || (spine as AlignmentDesign).kind === 'corridor') fail('corridor spine');
    if (corridor.mode === 'paired' && 'retainedSpine' in corridor || corridor.mode === 'independent' && 'spine' in corridor) fail('competing spine authority');
    for (const direction of ['forward', 'reverse'] as const) {
      const id = (corridor.children as Record<string, string>)[direction], r = routeMap.get(id);
      if (!r || r.kind !== 'motorway' || owners.has(id)) fail('corridor child');
      owners.set(id, corridor.id as string);
      const a = r!.alignment;
      if (corridor.mode === 'paired' ? a.kind !== 'corridor' || a.corridorId !== corridor.id || a.direction !== direction : a.kind !== 'exact') fail('child alignment authority');
    }
  }
  const mission = p.mission as Obj;
  if (!text(mission.id) || !integer(mission.revision) || !list(mission.ports) || !list(mission.connections)) fail('mission');
  const ports = new Set<string>();
  for (const port of mission.ports as unknown[]) {
    if (!object(port) || !text(port.id) || ports.has(port.id) || typeof port.name !== 'string' || !xyz(port.position)) fail('mission port');
    ports.add((port as Obj).id as string);
  }
  for (const c of mission.connections as unknown[]) {
    if (!object(c) || !ports.has(c.from as string) || !ports.has(c.to as string) || !choice(c.direction, ['both', 'forward'])
      || !list(c.kinds) || !c.kinds.length || !c.kinds.every(k => choice(k, ['road', 'motorway', 'railway']))
      || c.maxTravelMin !== undefined && (!number(c.maxTravelMin) || c.maxTravelMin <= 0)
      || c.demand !== undefined && (!object(c.demand) || !(c.demand.kind === 'road' ? number(c.demand.aadt) && c.demand.aadt >= 0
        : c.demand.kind === 'railway' && number(c.demand.trainsPerDay) && c.demand.trainsPerDay >= 0))) fail('mission connection');
  }
  const checkEndpoints = (pair: ProjectDesign['routes'][number]['endpoints']) => {
    for (const e of [pair.a, pair.b]) {
      const a = e.anchor;
      if (a.kind === 'route' && !routeMap.has(a.routeId) || a.kind === 'mission' && !ports.has(a.portId)) fail('dangling endpoint');
      if (e.binding === 'resolved' && a.kind === 'source' && a.location.transportData !== p.transportData && !allowStaleBindings) fail('resolved source fingerprint');
      if (e.binding === 'resolved' && a.kind === 'mission') {
        const port = (mission.ports as ProjectDesign['mission']['ports']).find(port => port.id === a.portId)!;
        if (Math.hypot(e.position.x - port.position.x, e.position.y - port.position.y, e.position.z - port.position.z) > 1e-6) fail('resolved mission position');
      }
    }
  };
  const checkAlignmentReferences = (a: AlignmentDesign) => {
    if (a.kind !== 'corridor') for (const c of a.controls.crossings ?? [])
      if (c.target.kind === 'route' && !routeMap.has(c.target.routeId)) fail('dangling crossing');
  };
  for (const r of routeMap.values()) {
    if (r.alignment.kind === 'corridor' && owners.get(r.id) !== r.alignment.corridorId) fail('orphan corridor child');
    if (r.source?.binding === 'resolved' && r.source.intervals.some(i => i.transportData !== p.transportData) && !allowStaleBindings) fail('resolved replacement fingerprint');
    checkEndpoints(r.endpoints); checkAlignmentReferences(r.alignment);
  }
  for (const c of corridors as ProjectDesign['corridors']) {
    checkEndpoints(c.endpoints); checkAlignmentReferences(c.mode === 'paired' ? c.spine : c.retainedSpine);
  }
  for (const c of connections) {
    if (!object(c) || !integer(c.revision) || !choice(c.kind, ['continuation', 'junction', 'interchange']) || !xyz(c.position)
      || !list(c.ports) || c.ports.length < 2 || !c.ports.every(port => object(port) && (port.kind === 'source' ? location(port.location)
        : port.kind === 'route' && routeMap.has(port.routeId as string) && number(port.s) && port.s >= 0))) fail('connection');
    unique((c as Obj).id);
  }
  const buildings = new Set<number>();
  for (const b of p.buildingOverrides as unknown[]) {
    if (!object(b) || !integer(b.j) || buildings.has(b.j) || !choice(b.action, ['buy', 'keep'])) fail('building decision');
    buildings.add((b as Obj).j as number);
  }
}
