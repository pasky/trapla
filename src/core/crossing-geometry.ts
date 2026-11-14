// Bounded study geometry on real OSM polylines. Quantities are measured from these same paths.
import type { CrossingGeometry, CrossingIssue, CrossingPoint, CrossingResult, CrossingRoute } from './crossings';
import { ACCESS, CROSSING_RULES, ROAD_CLASSES } from './data/urban';
import type { RoadNet } from './roadnet';
import { bridgeModel } from './bridge';
import { smoothLink } from './crossing-link';

const MAX_POINTS = 500, MAX_REACH = CROSSING_RULES.linkHardReach, STEP = 10, SETBACK = 3;
const CLEARANCE = 4.8, DEPTH = CROSSING_RULES.underDepth - CLEARANCE;
type XY = { x: number; y: number };
type WayPoint = XY & { d: number };
type CachedPath = { path: readonly Readonly<WayPoint>[]; diagnostics: readonly string[] };
// Match the main bridge model's clear-span overbridge layout: abutments on the banks, no
// piers in our traffic corridor. Raised earth approaches are billed separately below.
const deckPrice = (c: CrossingResult, span: number) => bridgeModel(ROAD_CLASSES[c.cls]).total(span, 0, { span, pierDensity: 0 });

export function crossingPlanLength(path: readonly XY[]): number {
  let length = 0;
  for (let i = 1; i < path.length; i++) length += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return length;
}

function lerpAt(v: ArrayLike<number>, lo: number, hi: number, t: number): number {
  return v[lo] + (v[hi] - v[lo]) * t;
}

function routeGeometry(route: CrossingRoute) {
  const n = route.s.length;
  const at = (s: number) => {
    let lo = 0, hi = n - 1;
    while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (route.s[m] <= s) lo = m; else hi = m; }
    const t = Math.max(0, Math.min(1, (s - route.s[lo]) / (route.s[hi] - route.s[lo] || 1)));
    const tx = lerpAt(route.tx, lo, hi, t), ty = lerpAt(route.ty, lo, hi, t), norm = Math.hypot(tx, ty) || 1;
    return { s, x: lerpAt(route.x, lo, hi, t), y: lerpAt(route.y, lo, hi, t), tx: tx / norm, ty: ty / norm, z: lerpAt(route.grade, lo, hi, t),
      left: route.left ? lerpAt(route.left, lo, hi, t) : lerpAt(route.width, lo, hi, t) / 2,
      right: route.right ? lerpAt(route.right, lo, hi, t) : lerpAt(route.width, lo, hi, t) / 2 };
  };
  // Exact segment AABB tree: unlike a station window it remains correct beside hairpins, while
  // avoiding a full-route scan for every footprint bisection and every terrain sample.
  interface Node { x0: number; y0: number; x1: number; y1: number; indices?: number[]; left?: Node; right?: Node }
  const tree = (indices: number[]): Node => {
    const node: Node = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const i of indices) for (const j of [i, i + 1]) {
      node.x0 = Math.min(node.x0, route.x[j]); node.x1 = Math.max(node.x1, route.x[j]);
      node.y0 = Math.min(node.y0, route.y[j]); node.y1 = Math.max(node.y1, route.y[j]);
    }
    if (indices.length <= 12) node.indices = indices;
    else {
      const axis = node.x1 - node.x0 >= node.y1 - node.y0 ? route.x : route.y;
      indices.sort((a, b) => axis[a] + axis[a + 1] - axis[b] - axis[b + 1]);
      const middle = indices.length >> 1;
      node.left = tree(indices.slice(0, middle)); node.right = tree(indices.slice(middle));
    }
    return node;
  };
  const root = tree(Array.from({ length: n - 1 }, (_, i) => i));
  type Projection = ReturnType<typeof at> & { lateral: number };
  // Numeric coordinate keys avoid formatting every terrain/bisection sample. The cache is local
  // to this build, so edited grades and footprints never reuse an earlier design's projection.
  const projected = new Map<number, Map<number, Projection>>();
  let projectedCount = 0;
  // Each synchronous tree walk finishes before another project call can reuse this scratch state.
  let best = Infinity, station = route.s[0];
  const distance = (node: Node, q: XY) => Math.max(node.x0 - q.x, 0, q.x - node.x1) ** 2 + Math.max(node.y0 - q.y, 0, q.y - node.y1) ** 2;
  const visit = (node: Node, q: XY) => {
    if (distance(node, q) > best) return;
    if (node.indices) for (const i of node.indices) {
      const dx = route.x[i + 1] - route.x[i], dy = route.y[i + 1] - route.y[i];
      const t = Math.max(0, Math.min(1, ((q.x - route.x[i]) * dx + (q.y - route.y[i]) * dy) / (dx * dx + dy * dy || 1)));
      const d2 = (q.x - route.x[i] - t * dx) ** 2 + (q.y - route.y[i] - t * dy) ** 2;
      const s = route.s[i] + t * (route.s[i + 1] - route.s[i]);
      if (d2 < best || (d2 === best && s < station)) { best = d2; station = s; }
    } else {
      const a = node.left!, b = node.right!;
      if (distance(a, q) <= distance(b, q)) { visit(a, q); visit(b, q); } else { visit(b, q); visit(a, q); }
    }
  };
  const project = (q: XY, cache = true) => {
    let column = cache ? projected.get(q.x) : undefined;
    const cached = column?.get(q.y);
    if (cached) return cached;
    best = Infinity; station = route.s[0];
    visit(root, q);
    const p = at(station), result = { s: p.s, x: p.x, y: p.y, tx: p.tx, ty: p.ty, z: p.z,
      left: p.left, right: p.right, lateral: (q.x - p.x) * -p.ty + (q.y - p.y) * p.tx };
    if (cache && projectedCount < 50000) {
      if (!column) projected.set(q.x, column = new Map());
      column.set(q.y, result); projectedCount++;
    }
    return result;
  };
  const margin = (q: XY, extra: number, cache = true) => {
    const p = project(q, cache);
    return Math.abs(p.lateral) - (p.lateral >= 0 ? p.left : p.right) - extra;
  };
  return { at, project, margin };
}

function along(path: readonly Readonly<WayPoint>[], d: number): WayPoint {
  let i = 0;
  while (i + 2 < path.length && path[i + 1].d < d) i++;
  const a = path[i], b = path[i + 1], t = Math.max(0, Math.min(1, (d - a.d) / (b.d - a.d || 1)));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, d: Math.max(path[0].d, Math.min(path[path.length - 1].d, d)) };
}

/** Retain ALL source bends. A dense way is cropped near the crossing, never straightened. */
function denseWay(input: WayPoint[], diagnose: (s: string) => void): WayPoint[] {
  let path = input;
  if (path.length > MAX_POINTS - 16) {
    let centre = 0;
    for (let i = 1; i < path.length; i++) if (Math.abs(path[i].d) < Math.abs(path[centre].d)) centre = i;
    const start = Math.max(0, Math.min(path.length - MAX_POINTS + 16, centre - Math.floor((MAX_POINTS - 16) / 2)));
    path = path.slice(start, start + MAX_POINTS - 16); diagnose('OSM detail exceeds the bounded point budget');
  }
  if (path.length < 2) return path;
  const out: WayPoint[] = [], total = path[path.length - 1].d - path[0].d;
  const budget = MAX_POINTS - 16 - path.length;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1], len = b.d - a.d;
    const count = Math.min(Math.max(1, Math.ceil(len / STEP)), 1 + Math.floor(budget * len / (total || 1)));
    for (let k = 0; k < count; k++) {
      const t = k / count;
      out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), d: a.d + t * len });
    }
  }
  out.push(path[path.length - 1]);
  return out;
}

function buildCrossingGeometryOnce(crossings: CrossingResult[], route: CrossingRoute,
  heightAt: (x: number, y: number) => number, roads: RoadNet | undefined,
  spatial: ReturnType<typeof routeGeometry>, paths: Map<string, CachedPath>): CrossingIssue[] {
  const { at, project, margin } = spatial;
  for (const c of crossings) if (c.issues) c.issues = c.issues.filter(v => v.crossing.code !== 'geometry');
  const terrainPoint = (q: XY & { d?: number }): CrossingPoint => {
    const ground = heightAt(q.x, q.y);
    // All callers supply XY or way samples. Explicit shapes avoid a generic object spread for
    // every terrain point, while retaining the optional station's presence and property order.
    return 'd' in q ? { x: q.x, y: q.y, d: q.d, z: ground, ground, surface: 'terrain' }
      : { x: q.x, y: q.y, z: ground, ground, surface: 'terrain' };
  };
  const diagnose = (g: CrossingGeometry, message: string) => {
    g.clipped = true;
    if (!g.diagnostics?.includes(message)) (g.diagnostics ??= []).push(message);
  };
  // Terrain-only source samples need elevations only at the selected anchors, not along the
  // entire bounded way. Engineered paths retain their full surface/support metadata.
  type AnchorSample = Readonly<WayPoint> | CrossingPoint;
  const rawPaths = new Map<CrossingResult, readonly AnchorSample[]>();
  const survivingSides = new Map<CrossingResult, [boolean, boolean]>();
  const anchors = new Map<CrossingResult, [CrossingPoint | undefined, CrossingPoint | undefined]>();
  const maxLinkWidth = (c: CrossingResult) => Math.max(ROAD_CLASSES[c.cls].width,
    ...crossings.filter(t => t.targetS === c.s && t.targetRoadId === c.roadId).map(t => ROAD_CLASSES[t.cls].width));
  const getPath = (roadId: number | undefined, x: number, y: number, g: CrossingGeometry) => {
    if (roadId === undefined || !roads) { diagnose(g, 'No real crossed-way alignment is available'); return []; }
    const key = `${roadId}:${x},${y}`;
    let cached = paths.get(key);
    if (!cached) {
      const diagnostics: string[] = [];
      cached = { path: denseWay(roads.connectedCrossingPath(roadId, x, y, MAX_REACH), message => diagnostics.push(message)), diagnostics };
      paths.set(key, cached);
    }
    for (const message of cached.diagnostics) diagnose(g, message);
    return cached.path;
  };

  for (const c of crossings) {
    const g: CrossingGeometry = c.geometry = { width: ROAD_CLASSES[c.cls].width, schematic: false };
    const path = getPath(c.roadId, c.x, c.y, g);
    if (path.length < 2) {
      diagnose(g, 'Crossed way has no usable polyline');
      if (c.type === 'overbridge') { c.span = 0; c.approachLength = 0; c.cost = 0; }
      continue;
    }
    // Connection works consume short stubs through the whole link corridor, not just the main
    // earthwork toe. Use the same half-width + setback as groundAnchors; otherwise a 0.1–6 m
    // remnant would be required to reconnect while being geometrically forbidden any anchor.
    const corridor = maxLinkWidth(c) / 2 + SETBACK;
    const sides: [boolean, boolean] = [false, false];
    for (const q of [...path].sort((a, b) => Math.abs(a.d) - Math.abs(b.d))) {
      const p = project(q);
      if (Math.abs(p.lateral) > (p.lateral > 0 ? p.left : p.right) + corridor) sides[p.lateral < 0 ? 0 : 1] = true;
      if (sides[0] && sides[1]) break;
    }
    survivingSides.set(c, sides);
    const isRaised = c.type === 'overbridge', adjusted = isRaised || c.type === 'junction';
    let road: CrossingPoint[] = [];
    if (adjusted) {
      // Find the connected interval of the *whole road ribbon* over the actual earthwork footprint.
      // This handles skew, bends and varying/asymmetric widths, unlike width/sin(angle) alone.
      const extra = g.width / 2 + (isRaised ? 2 : 0);
      let centre = 0;
      for (let i = 1; i < path.length; i++) if (Math.abs(path[i].d) < Math.abs(path[centre].d)) centre = i;
      let first = centre, last = centre;
      while (first > 0 && margin(path[first - 1], extra) <= 0) first--;
      while (last + 1 < path.length && margin(path[last + 1], extra) <= 0) last++;
      const boundary = (inside: number, outside: number) => {
        let a = path[inside].d, b = path[outside].d;
        for (let k = 0; k < 24; k++) { const m = (a + b) / 2; if (margin(along(path, m), extra) <= 0) a = m; else b = m; }
        return (a + b) / 2;
      };
      const d0 = first > 0 ? boundary(first, first - 1) : path[first].d;
      const d1 = last + 1 < path.length ? boundary(last, last + 1) : path[last].d;
      if (first === 0 || last === path.length - 1) {
        if (isRaised) {
          diagnose(g, 'Existing way ends inside the crossing footprint');
          // There are not two abutments. Never display a deck dropping into our carriageway.
          c.span = 0; c.approachLength = 0; c.cost = 0;
          continue;
        }
      }
      const core = [along(path, d0), ...path.filter(q => q.d > d0 && q.d < d1), along(path, d1)];
      let deckZ = -Infinity;
      let minS = Infinity, maxS = -Infinity;
      for (const q of core) {
        const p = project(q); minS = Math.min(minS, p.s); maxS = Math.max(maxS, p.s);
        deckZ = Math.max(deckZ, p.z + CROSSING_RULES.underDepth, heightAt(q.x, q.y));
      }
      // Include intervening crown stations and the ribbon edges, not just sampled road centreline.
      for (let i = 0; i < route.s.length; i++) if (route.s[i] >= minS - g.width / 2 && route.s[i] <= maxS + g.width / 2)
        deckZ = Math.max(deckZ, route.grade[i] + CROSSING_RULES.underDepth);
      const edgeZ = (d: number) => isRaised ? deckZ : project(along(path, d)).z;
      // Tie to actual terrain on each side. The linear engineered approach may require fill or cut;
      // neither is silently replaced by max(terrain,ramp), which creates uncontrolled gradients.
      const foot = (edge: number, direction: number) => {
        const endpoint = direction < 0 ? path[0] : path[path.length - 1];
        if (c.type === 'junction' && Math.abs(edge - endpoint.d) < 1e-6 && margin(endpoint, 0) <= 0) return edge;
        const candidates = path.filter(q => direction * (q.d - edge) > 1e-4);
        if (direction < 0) candidates.reverse();
        const z = edgeZ(edge);
        for (const q of candidates) if (Math.abs(heightAt(q.x, q.y) - z) <= Math.abs(q.d - edge) * CROSSING_RULES.approachGradient + 1e-8) return q.d;
        diagnose(g, 'Approach cannot meet the 6% gradient before the real way endpoint');
        return direction < 0 ? path[0].d : path[path.length - 1].d;
      };
      const f0 = foot(d0, -1), f1 = foot(d1, 1);
      // Short terrain tails make the actual joins visible; tails are maintenance, not new approaches.
      const a = Math.max(path[0].d, f0 - STEP), b = Math.min(path[path.length - 1].d, f1 + STEP);
      const distances = [...new Set([a, f0, d0, ...path.filter(q => q.d > a && q.d < b).map(q => q.d), d1, f1, b])].sort((p, q) => p - q);
      road = distances.map(d => {
        const q = terrainPoint(along(path, d));
        if (d < d0 && d > f0) {
          q.z = edgeZ(d0) + (heightAt(along(path, f0).x, along(path, f0).y) - edgeZ(d0)) * (d0 - d) / (d0 - f0);
        } else if (d > d1 && d < f1) {
          q.z = edgeZ(d1) + (heightAt(along(path, f1).x, along(path, f1).y) - edgeZ(d1)) * (d - d1) / (f1 - d1);
        } else if (d >= d0 && d <= d1) q.z = isRaised ? deckZ : project(q).z;
        if (isRaised && d >= d0 && d <= d1) q.surface = 'deck';
        else if (Math.abs(q.z - q.ground) > 1e-7) { q.surface = 'ramp'; q.support = q.z >= q.ground ? 'embankment' : 'retaining'; }
        return q;
      });
      // If an actual way ends inside the footprint, do not disguise an elevated dangling end.
      // Such infeasible topology is reported, and the endpoint remains at its connected terrain road.
      for (const q of [road[0], road[road.length - 1]]) {
        if (c.type === 'junction' && margin(q, 0) <= 0) {
          q.z = project(q).z; q.connection = 'main-road';
          if (Math.abs(q.z - q.ground) > 1e-7) { q.surface = 'ramp'; q.support = q.z >= q.ground ? 'embankment' : 'retaining'; }
        } else if (Math.abs(q.z - q.ground) > 0.3) {
          q.z = q.ground; q.surface = 'terrain'; delete q.support;
        }
      }
      // Ordinary road-per-km rates cannot represent viaduct-scale approach earthworks. Keep
      // explicit choices visible but reject this unpriced engineering; Auto will try real links.
      if (road.some(q => q.surface === 'ramp' && Math.abs(q.z - q.ground) > 10))
        diagnose(g, 'Approach earthwork exceeds the 10 m study-stage support limit');
      const start = road.findIndex(q => q.d === d0), end = road.findIndex(q => q.d === d1);
      g.approaches = [{ start: road.findIndex(q => q.d === f0), end: start }, { start: end, end: road.findIndex(q => q.d === f1) }];
      if (isRaised) {
        g.deck = { start, end, depth: DEPTH };
        c.span = d1 - d0; c.approachLength = d0 - f0 + f1 - d1;
        c.cost = deckPrice(c, c.span) + c.approachLength * (c.roadPerKm ?? ROAD_CLASSES[c.cls].roadPerKm[0]) / 1000;
      }
    } else if (['bridge', 'tunnel'].includes(c.type)) {
      // Only show the vicinity of the crossing; its existing road is unchanged at terrain level.
      let centre = path.findIndex(q => q.d >= 0), lo = centre, hi = centre;
      while (lo > 0 && margin(path[lo], corridor + STEP) < 0) lo--;
      while (hi + 1 < path.length && margin(path[hi], corridor + STEP) < 0) hi++;
      road = path.slice(Math.max(0, lo - 1), Math.min(path.length, hi + 2)).map(terrainPoint);
    }
    rawPaths.set(c, adjusted ? road : path);
    if (['bridge', 'overbridge', 'tunnel', 'junction'].includes(c.type)) g.road = road;
  }

  // A ground anchor must actually lie on the crossed alignment, beyond every engineered approach
  // and beyond the footprint plus half the incoming road width and a physical setback.
  const isTerrain = (q: AnchorSample) => !('surface' in q) || q.surface === 'terrain';
  const groundAnchors = (path: readonly AnchorSample[], width: number): [CrossingPoint | undefined, CrossingPoint | undefined] => {
    const out: [CrossingPoint | undefined, CrossingPoint | undefined] = [undefined, undefined];
    const order = Array.from({ length: path.length }, (_, i) => i).sort((a, b) => Math.abs(path[a].d ?? 0) - Math.abs(path[b].d ?? 0));
    for (const side of [-1, 1]) {
      for (const i of order) {
        const q = path[i], p = project(q);
        if (side * p.lateral <= 0 || !isTerrain(q)) continue;
        const off = (side > 0 ? p.left : p.right) + width / 2 + SETBACK;
        if (Math.abs(p.lateral) < off - 1e-6) continue;
        // Interpolate an exact crossing of the side corridor when the previous point is ground too.
        let candidate = 'surface' in q ? q : terrainPoint(q);
        for (const j of [i - 1, i + 1]) {
          if (!path[j] || !isTerrain(path[j]) || margin(path[j], width / 2 + SETBACK) >= 0) continue;
          let lo = 0, hi = 1;
          for (let k = 0; k < 24; k++) {
            const t = (lo + hi) / 2, a = path[j];
            const v = { x: a.x + (q.x - a.x) * t, y: a.y + (q.y - a.y) * t };
            if (margin(v, width / 2 + SETBACK) < 0) lo = t; else hi = t;
          }
          const t = hi, a = path[j];
          candidate = terrainPoint({ x: a.x + (q.x - a.x) * t, y: a.y + (q.y - a.y) * t,
            ...(a.d !== undefined && q.d !== undefined ? { d: a.d + (q.d - a.d) * t } : {}) });
        }
        out[side < 0 ? 0 : 1] = candidate;
        break;
      }
    }
    return out;
  };
  for (const c of crossings) if (rawPaths.has(c)) anchors.set(c, groundAnchors(rawPaths.get(c)!, maxLinkWidth(c)));
  const endAnchors = new Map<string, [CrossingPoint | undefined, CrossingPoint | undefined]>();
  for (const c of crossings) if (c.targetS !== undefined && (c.type === 'reconnection' || c.type === 'diversion')) {
    const g = c.geometry!;
    const target = crossings.find(t => t !== c && t.s === c.targetS && t.roadId === c.targetRoadId && !t.issues?.length && !ROAD_CLASSES[t.cls].noAtGrade);
    let finish = target ? anchors.get(target) : undefined;
    if (!target) {
      const key = `${c.targetS}:${g.width}`, p = at(c.targetS);
      if (!endAnchors.has(key)) {
        const way = roads?.nearestWay(p.x, p.y);
        endAnchors.set(key, groundAnchors(getPath(way, p.x, p.y, g), g.width));
      }
      finish = endAnchors.get(key);
    }
    const start = anchors.get(c);
    const required = survivingSides.get(c) ?? [true, true];
    if (required.some((needed, k) => needed && (!start?.[k] || !finish?.[k])))
      diagnose(g, 'No real ground-level anchor exists for a surviving road branch');
    const sidePoint = (s: number, side: number) => {
      const p = at(s), offset = (side > 0 ? p.left : p.right) + g.width / 2 + SETBACK;
      return terrainPoint({ x: p.x - p.ty * offset * side, y: p.y + p.tx * offset * side });
    };
    const links: CrossingPoint[][] = [];
    for (const side of [-1, 1]) {
      const k = side < 0 ? 0 : 1, a = start?.[k], b = finish?.[k];
      if (!required[k] || !a || !b) { links.push([]); continue; }
      const s0 = project(a).s, s1 = project(b).s, lo = Math.min(s0, s1), hi = Math.max(s0, s1);
      const stations = [lo];
      for (let i = 0; i < route.s.length; i++) if (route.s[i] > lo && route.s[i] < hi) stations.push(route.s[i]);
      stations.push(hi);
      // Start with the full daylight boundary, then shortcut only with checked clearance.
      // Draping and billing use that same path. Excessively long links are explicitly budget-limited.
      if (stations.length > MAX_POINTS - 4) {
        diagnose(g, 'Link exceeds the bounded route sampling budget');
        const stride = Math.ceil(stations.length / (MAX_POINTS - 4));
        const reduced = stations.filter((_, i) => i % stride === 0); if (reduced[reduced.length - 1] !== hi) reduced.push(hi);
        stations.splice(0, stations.length, ...reduced);
      }
      if (s1 < s0) stations.reverse();
      const controls = smoothLink([a, ...stations.map(s => sidePoint(s, side)), b],
        // One-off chord probes must not evict reusable anchor/bisection projections.
        q => margin(q, g.width / 2, false), terrainPoint, SETBACK - 1e-5);
      const link: CrossingPoint[] = [a];
      const length = crossingPlanLength(controls), budget = Math.max(0, MAX_POINTS - controls.length);
      for (let i = 1; i < controls.length; i++) {
        const p = controls[i - 1], q = controls[i], len = Math.hypot(q.x - p.x, q.y - p.y);
        if (len < 1e-7) continue;
        const count = Math.min(Math.max(1, Math.ceil(len / STEP)), 1 + Math.floor(budget * len / (length || 1)));
        for (let j = 1; j <= count; j++) {
          const t = j / count;
          link.push(j === count ? q : terrainPoint({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }));
        }
      }
      links.push(link);
    }
    g.links = links as [CrossingPoint[], CrossingPoint[]];
    g.turnarounds = links.filter(path => path.length > 0).map(path => path[0]);
    c.linkLength = links.reduce((sum, path) => sum + crossingPlanLength(path), 0);
    c.cost = c.linkLength * (c.roadPerKm ?? ROAD_CLASSES[c.cls].roadPerKm[0]) / 1000 + (c.cls === 'service' && c.linkLength > 0 ? ACCESS : 0);
  }
  // Refine terrain-only spans against interior elevations, not just their endpoints. This prevents
  // a nominally draped 10 m chord from floating over a sharp gully between its stored samples.
  // Original OSM vertices and engineered boundaries retain object identity; recursion and output
  // are bounded even on discontinuous/malformed terrain callbacks.
  const refineTerrain = (path: CrossingPoint[], g: CrossingGeometry): CrossingPoint[] => {
    if (path.length < 2) return path;
    const out = [path[0]];
    let budget = Math.max(0, MAX_POINTS - path.length);
    const segment = (a: CrossingPoint, b: CrossingPoint, depth: number) => {
      let error = 0;
      if (a.surface === 'terrain' && b.surface === 'terrain') for (const t of [0.25, 0.5, 0.75])
        error = Math.max(error, Math.abs(a.z + (b.z - a.z) * t - heightAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)));
      if (error > 0.2 && budget > 0 && depth < 12) {
        budget--;
        const mid = terrainPoint({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
          ...(a.d !== undefined && b.d !== undefined ? { d: (a.d + b.d) / 2 } : {}) });
        segment(a, mid, depth + 1); segment(mid, b, depth + 1);
      } else {
        if (error > 0.5) diagnose(g, 'Terrain profile exceeds the bounded point budget');
        out.push(b);
      }
    };
    for (let i = 1; i < path.length; i++) segment(path[i - 1], path[i], 0);
    return out;
  };
  for (const c of crossings) {
    const g = c.geometry!;
    if (g.road) {
      const old = g.road, road = refineTerrain(old, g);
      if (g.deck) { g.deck.start = road.indexOf(old[g.deck.start]); g.deck.end = road.indexOf(old[g.deck.end]); }
      if (g.approaches) for (const range of g.approaches) { range.start = road.indexOf(old[range.start]); range.end = road.indexOf(old[range.end]); }
      g.road = road;
    }
    if (g.links) g.links = g.links.map(path => refineTerrain(path, g)) as [CrossingPoint[], CrossingPoint[]];
  }
  const issues: CrossingIssue[] = [];
  for (const c of crossings) for (const message of c.geometry?.diagnostics ?? []) {
    const issue: CrossingIssue = { kind: 'crossing', s0: c.s, s1: c.s, title: message,
      fix: 'Change the crossing treatment or main-road grade; this OSM alignment cannot support the requested geometry',
      basis: 'game', rule: 'Crossed roads retain their real alignment, tie to terrain and require supported approaches with a 6% design gradient',
      detail: 'No existing-road endpoint is extrapolated. Incomplete geometry is not a feasible crossing.',
      crossing: { roadId: c.roadId, requested: c.requestedType ?? (c.type === 'diversion' ? 'reconnection' : c.type === 'tunnel' || c.type === 'atGrade' ? 'bridge' : c.type), code: 'geometry' } };
    (c.issues ??= []).push(issue); issues.push(issue);
  }
  return issues;
}

/** Geometry-aware, bounded Auto feedback. Explicit choices are never changed. Candidate links
 * grow only onto already connected real roads; dependency checks keep the connection graph acyclic.
 * One final rebuild anchors every dependent link to the treatment actually selected, and remeasures
 * its bill. This is a local feasibility/economic pass, not an unrestricted network optimizer. */
export function buildCrossingGeometry(crossings: CrossingResult[], route: CrossingRoute,
  heightAt: (x: number, y: number) => number, roads?: RoadNet): CrossingIssue[] {
  if (route.s.length < 2) return [];
  const spatial = routeGeometry(route);
  // Candidate treatments and the final rebuild use the same immutable OSM alignment. Share only
  // its dense XY samples, not mutable terrain/engineered points or treatment-dependent anchors.
  const paths = new Map<string, CachedPath>();
  const build = (items: CrossingResult[]) => buildCrossingGeometryOnce(items, route, heightAt, roads, spatial, paths);
  build(crossings);
  const clone = (c: CrossingResult): CrossingResult => ({ ...c, geometry: undefined,
    issues: c.issues?.filter(v => v.crossing.code !== 'geometry') });
  const feasible = (c: CrossingResult) => !c.issues?.length && !c.geometry?.diagnostics?.length;
  const baseline = crossings.map(c => ({ state: { ...c }, feasible: feasible(c) }));
  const dependsOn = (target: CrossingResult, source: CrossingResult): boolean => {
    const visited = new Set<CrossingResult>();
    let next: CrossingResult | undefined = target;
    while (next && !visited.has(next)) {
      if (next === source) return true;
      visited.add(next);
      const current: CrossingResult = next;
      next = current.targetS === undefined ? undefined : crossings.find(t => t.s === current.targetS && t.roadId === current.targetRoadId);
    }
    return !!next;
  };
  let changed = false;
  for (const c of crossings) {
    if (c.requestedType || ROAD_CLASSES[c.cls].noAtGrade || !['overbridge', 'reconnection', 'diversion'].includes(c.type)) continue;
    let best = c;
    const originalFeasible = feasible(c);
    if (c.type !== 'overbridge' && (!originalFeasible || c.cost > deckPrice(c, route.width[c.i]))) {
      const over = clone(c); over.type = 'overbridge'; delete over.targetS; delete over.targetRoadId; delete over.linkLength;
      build([over]);
      if (feasible(over) && (!originalFeasible || over.cost < best.cost)) best = over;
    }
    if (c.type !== 'overbridge' && originalFeasible) {
      if (best !== c) {
        delete c.linkLength; delete c.targetS; delete c.targetRoadId;
        Object.assign(c, best); changed = true;
      }
      continue;
    }
    // Long detours are a feasibility fallback, not a way to shave a tiny amount off an already
    // workable overbridge. Keep ordinary economic swaps within the 750 m shortlist.
    const reach = feasible(best) ? CROSSING_RULES.linkMaxReach : CROSSING_RULES.linkHardReach;
    const targets = crossings.filter(t => t !== c && feasible(t) && t.type !== 'atGrade' && !ROAD_CLASSES[t.cls].noAtGrade
      && (c.cls === 'track' || c.cls === 'service' || (t.cls !== 'track' && t.cls !== 'service'))
      && Math.abs(t.s - c.s) <= reach && !dependsOn(t, c))
      .sort((a, b) => Math.abs(a.s - c.s) - Math.abs(b.s - c.s) || a.s - b.s);
    for (const target of targets.slice(0, originalFeasible ? 1 : 3)) {
      const link = clone(c); link.type = c.cls === 'track' ? 'diversion' : 'reconnection';
      delete link.span; delete link.approachLength;
      link.targetS = target.s; link.targetRoadId = target.roadId;
      const anchor = clone(target);
      // A resolved diversion's source is a real ground-level road node; its downstream link need
      // not be rebuilt to evaluate a new branch arriving at that source.
      if (anchor.type === 'reconnection' || anchor.type === 'diversion') anchor.type = 'bridge';
      build([anchor, link]);
      if (feasible(link) && (!feasible(best) || link.cost < best.cost)) { best = link; break; }
    }
    if (best !== c) {
      delete c.span; delete c.approachLength; delete c.linkLength; delete c.targetS; delete c.targetRoadId;
      Object.assign(c, best); changed = true;
    }
  }
  if (!changed) return crossings.flatMap(c => c.issues?.filter(v => v.crossing.code === 'geometry') ?? []);
  const issues = build(crossings);
  // A new target treatment can move the ground anchor of a dependent link. Do not buy a cheaper
  // local option by breaking a previously feasible connection elsewhere in the network.
  if (crossings.some((c,i) => baseline[i].feasible && !feasible(c))) {
    crossings.forEach((c,i) => {
      for (const key of ['geometry','issues','span','approachLength','linkLength','targetS','targetRoadId'] as const) delete c[key];
      Object.assign(c, baseline[i].state);
    });
    return build(crossings);
  }
  return issues;
}

export interface CrossingAuditIssue { roadId?: number; s: number; message: string; severity: 'error' | 'infeasible' }
/** Independent streaming checks over final geometry, suitable for tests and saved-design audits. */
export function auditCrossingGeometry(crossings: readonly CrossingResult[], route: CrossingRoute,
  heightAt: (x: number, y: number) => number, roads?: RoadNet): CrossingAuditIssue[] {
  const issues: CrossingAuditIssue[] = [];
  if (route.s.length < 2) return issues;
  const { project, margin } = routeGeometry(route);
  for (const c of crossings) {
    const g = c.geometry;
    const report = (message: string, severity: CrossingAuditIssue['severity'] = 'error') => {
      if (!issues.some(v => v.roadId === c.roadId && v.s === c.s && v.message === message)) issues.push({ roadId: c.roadId, s: c.s, message, severity });
    };
    if (!g) { report('Missing crossing geometry'); continue; }
    for (const message of g.diagnostics ?? []) report(message, 'infeasible');
    const paths = [...(g.road ? [g.road] : []), ...(g.links ?? [])];
    for (const path of paths) {
      if (path.length > MAX_POINTS) report('Point budget exceeded');
      for (const q of path) {
        const ground = heightAt(q.x, q.y);
        if (![q.x, q.y, q.z, q.ground].every(Number.isFinite)) report('Non-finite geometry');
        if (Math.abs(q.ground - ground) > 0.01) report('Stale terrain metadata');
        if (q.surface === 'terrain' && Math.abs(q.z - ground) > 0.3) report('Terrain sample is not draped');
        if (q.surface !== 'deck' && Math.abs(q.z - ground) > 0.3 && !q.support) report('Adjusted surface lacks earthwork support');
      }
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        if (a.surface === 'deck' || b.surface === 'deck' || a.support || b.support) continue;
        for (const t of [0.25, 0.5, 0.75]) {
          const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
          if (z - heightAt(x, y) > 0.5) report('Unsupported flotation between terrain samples');
          if (heightAt(x, y) - z > 0.5) report('Terrain road is buried between samples');
        }
      }
      for (const q of [path[0], path[path.length - 1]]) if (q) {
        const connected = q.connection === 'main-road';
        if (connected && margin(q, 0) > 0.3) report('Main-road endpoint lies outside its footprint');
        if (Math.abs(q.z - (connected ? project(q).z : heightAt(q.x, q.y))) > 0.3) report('Dangling endpoint');
      }
    }
    if (g.deck && g.road) {
      const { start, end, depth } = g.deck, road = g.road;
      if (start < 0 || end <= start || end >= road.length) report('Invalid deck bounds');
      else {
        for (let i = start; i <= end; i++) {
          const q = road[i];
          if (q.z - depth < project(q).z + CLEARANCE - 0.01) report('Deck does not clear the crown by 4.8 m');
        }
        if (Math.abs(crossingPlanLength(road.slice(start, end + 1)) - (c.span ?? 0)) > 0.01) report('Deck quantity differs from geometry');
      }
    }
    if (g.approaches && g.road) {
      let length = 0;
      for (const { start, end } of g.approaches) {
        if (start < 0 || end < start || end >= g.road.length) { report('Invalid approach bounds'); continue; }
        length += crossingPlanLength(g.road.slice(start, end + 1));
        for (let i = start + 1; i <= end; i++) {
          const a = g.road[i - 1], b = g.road[i], run = Math.hypot(b.x - a.x, b.y - a.y);
          if (Math.abs(b.z - a.z) > run * CROSSING_RULES.approachGradient + 0.01
            && !g.diagnostics?.some(message => message.includes('6% gradient'))) report('Undiagnosed excessive approach gradient');
        }
      }
      if (c.type === 'overbridge' && Math.abs(length - (c.approachLength ?? 0)) > 0.01) report('Approach quantity differs from geometry');
    }
    if (g.links) {
      for (const path of g.links) {
        for (const q of path) if (margin(q, g.width / 2) < -0.1) report('Link intrudes into the earthwork footprint');
        if (roads && path.length) for (const q of [path[0], path[path.length - 1]])
          if (roads.nearestWay(q.x, q.y, 0.3) === undefined) report('Link endpoint does not meet a real ground road');
      }
      if (Math.abs(g.links.reduce((sum, path) => sum + crossingPlanLength(path), 0) - (c.linkLength ?? 0)) > 0.01) report('Link quantity differs from geometry');
      const price = (c.linkLength ?? 0) * (c.roadPerKm ?? ROAD_CLASSES[c.cls].roadPerKm[0]) / 1000
        + (c.cls === 'service' && (c.linkLength ?? 0) > 0 ? ACCESS : 0);
      if (Math.abs(price - c.cost) > 0.01) report('Link bill differs from measured quantities');
    }
    if (c.type === 'overbridge') {
      const price = deckPrice(c, c.span ?? 0) + (c.approachLength ?? 0) * (c.roadPerKm ?? ROAD_CLASSES[c.cls].roadPerKm[0]) / 1000;
      if (Math.abs(price - c.cost) > 0.01) report('Overbridge bill differs from measured quantities');
    }
  }
  return issues;
}
