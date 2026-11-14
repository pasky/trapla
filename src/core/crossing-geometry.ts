// Bounded study geometry on real OSM polylines. Quantities are measured from these same paths.
import type { CrossingGeometry, CrossingPoint, CrossingResult, CrossingRoute } from './crossings';
import { ACCESS, CROSSING_RULES, ROAD_CLASSES } from './data/urban';
import type { RoadNet } from './roadnet';

const MAX_POINTS = 500, MAX_REACH = 2000, STEP = 10, SETBACK = 3;
const CLEARANCE = 4.8, DEPTH = CROSSING_RULES.underDepth - CLEARANCE;
type XY = { x: number; y: number };
type WayPoint = XY & { d: number };

export function crossingPlanLength(path: readonly XY[]): number {
  let length = 0;
  for (let i = 1; i < path.length; i++) length += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return length;
}

function routeGeometry(route: CrossingRoute) {
  const n = route.s.length;
  const at = (s: number) => {
    let lo = 0, hi = n - 1;
    while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (route.s[m] <= s) lo = m; else hi = m; }
    const t = Math.max(0, Math.min(1, (s - route.s[lo]) / (route.s[hi] - route.s[lo] || 1)));
    const lerp = (v: ArrayLike<number>) => v[lo] + (v[hi] - v[lo]) * t;
    const tx = lerp(route.tx), ty = lerp(route.ty), norm = Math.hypot(tx, ty) || 1;
    return { s, x: lerp(route.x), y: lerp(route.y), tx: tx / norm, ty: ty / norm, z: lerp(route.grade),
      left: route.left ? lerp(route.left) : lerp(route.width) / 2,
      right: route.right ? lerp(route.right) : lerp(route.width) / 2 };
  };
  // Streaming nearest-segment projection: no samples × route Cartesian-product allocation.
  const project = (q: XY) => {
    let best = Infinity, station = route.s[0];
    for (let i = 0; i + 1 < n; i++) {
      const dx = route.x[i + 1] - route.x[i], dy = route.y[i + 1] - route.y[i];
      const t = Math.max(0, Math.min(1, ((q.x - route.x[i]) * dx + (q.y - route.y[i]) * dy) / (dx * dx + dy * dy || 1)));
      const d2 = (q.x - route.x[i] - t * dx) ** 2 + (q.y - route.y[i] - t * dy) ** 2;
      if (d2 < best) { best = d2; station = route.s[i] + t * (route.s[i + 1] - route.s[i]); }
    }
    const p = at(station);
    return { ...p, lateral: (q.x - p.x) * -p.ty + (q.y - p.y) * p.tx };
  };
  const margin = (q: XY, extra: number) => {
    const p = project(q);
    return Math.abs(p.lateral) - (p.lateral >= 0 ? p.left : p.right) - extra;
  };
  return { at, project, margin };
}

function along(path: readonly WayPoint[], d: number): WayPoint {
  let i = 0;
  while (i + 2 < path.length && path[i + 1].d < d) i++;
  const a = path[i], b = path[i + 1], t = Math.max(0, Math.min(1, (d - a.d) / (b.d - a.d || 1)));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, d: a.d + (b.d - a.d) * t };
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

export function buildCrossingGeometry(crossings: CrossingResult[], route: CrossingRoute,
  heightAt: (x: number, y: number) => number, roads?: RoadNet): void {
  if (route.s.length < 2) return;
  const { at, project, margin } = routeGeometry(route);
  const terrainPoint = (q: XY & { d?: number }): CrossingPoint => {
    const ground = heightAt(q.x, q.y);
    return { ...q, z: ground, ground, surface: 'terrain' };
  };
  const diagnose = (g: CrossingGeometry, message: string) => {
    g.clipped = true;
    if (!g.diagnostics?.includes(message)) (g.diagnostics ??= []).push(message);
  };
  const rawPaths = new Map<CrossingResult, CrossingPoint[]>();
  const anchors = new Map<CrossingResult, [CrossingPoint | undefined, CrossingPoint | undefined]>();
  const maxLinkWidth = (c: CrossingResult) => Math.max(ROAD_CLASSES[c.cls].width,
    ...crossings.filter(t => t.targetS === c.s && t.targetRoadId === c.roadId).map(t => ROAD_CLASSES[t.cls].width));
  const getPath = (roadId: number | undefined, x: number, y: number, g: CrossingGeometry) => {
    if (roadId === undefined || !roads) { diagnose(g, 'No real crossed-way alignment is available'); return []; }
    return denseWay(roads.connectedCrossingPath(roadId, x, y, MAX_REACH), message => diagnose(g, message));
  };

  for (const c of crossings) {
    const g: CrossingGeometry = c.geometry = { width: ROAD_CLASSES[c.cls].width, schematic: false };
    const path = getPath(c.roadId, c.x, c.y, g);
    if (path.length < 2) { diagnose(g, 'Crossed way has no usable polyline'); continue; }
    const isRaised = c.type === 'overbridge', adjusted = isRaised || c.type === 'junction';
    let road = path.map(terrainPoint);
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
      if (first === 0 || last === path.length - 1) diagnose(g, 'Existing way ends inside the crossing footprint');
      const core = [along(path, d0), ...path.filter(q => q.d > d0 && q.d < d1), along(path, d1)];
      let deckZ = -Infinity;
      for (const q of core) deckZ = Math.max(deckZ, project(q).z + CROSSING_RULES.underDepth, heightAt(q.x, q.y));
      const edgeZ = (d: number) => isRaised ? deckZ : project(along(path, d)).z;
      // Tie to actual terrain on each side. The linear engineered approach may require fill or cut;
      // neither is silently replaced by max(terrain,ramp), which creates uncontrolled gradients.
      const foot = (edge: number, direction: number) => {
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
      for (const q of [road[0], road[road.length - 1]]) if (Math.abs(q.z - q.ground) > 0.3) {
        q.z = q.ground; q.surface = 'terrain'; delete q.support;
      }
      if (isRaised) {
        const start = road.findIndex(q => q.d === d0), end = road.findIndex(q => q.d === d1);
        g.deck = { start, end, depth: DEPTH };
        c.span = d1 - d0; c.approachLength = d0 - f0 + f1 - d1;
        c.cost = (c.span * ROAD_CLASSES[c.cls].bridgePerKm + c.approachLength * (c.roadPerKm ?? ROAD_CLASSES[c.cls].roadPerKm[0])) / 1000;
      }
    } else if (['bridge', 'tunnel'].includes(c.type)) {
      // Only show the vicinity of the crossing; its existing road is unchanged at terrain level.
      let centre = road.findIndex(q => q.d! >= 0), lo = centre, hi = centre;
      while (lo > 0 && margin(road[lo], maxLinkWidth(c) / 2 + SETBACK + STEP) < 0) lo--;
      while (hi + 1 < road.length && margin(road[hi], maxLinkWidth(c) / 2 + SETBACK + STEP) < 0) hi++;
      road = road.slice(Math.max(0, lo - 1), Math.min(road.length, hi + 2));
    }
    rawPaths.set(c, adjusted || ['bridge', 'tunnel'].includes(c.type) ? road : path.map(terrainPoint));
    if (['bridge', 'overbridge', 'tunnel', 'junction'].includes(c.type)) g.road = road;
  }

  // A ground anchor must actually lie on the crossed alignment, beyond every engineered approach
  // and beyond the footprint plus half the incoming road width and a physical setback.
  const groundAnchors = (path: CrossingPoint[], width: number): [CrossingPoint | undefined, CrossingPoint | undefined] => {
    const out: [CrossingPoint | undefined, CrossingPoint | undefined] = [undefined, undefined];
    for (const side of [-1, 1]) {
      let best = Infinity;
      for (let i = 0; i < path.length; i++) {
        const q = path[i], p = project(q);
        if (side * p.lateral <= 0 || q.surface !== 'terrain') continue;
        const off = (side > 0 ? p.left : p.right) + width / 2 + SETBACK;
        if (Math.abs(p.lateral) < off - 1e-6) continue;
        // Interpolate an exact crossing of the side corridor when the previous point is ground too.
        let candidate = q;
        for (const j of [i - 1, i + 1]) {
          if (!path[j] || path[j].surface !== 'terrain' || margin(path[j], width / 2 + SETBACK) >= 0) continue;
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
        const distance = Math.abs(candidate.d ?? p.s);
        if (distance < best) { best = distance; out[side < 0 ? 0 : 1] = candidate; }
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
        endAnchors.set(key, groundAnchors(getPath(way, p.x, p.y, g).map(terrainPoint), g.width));
      }
      finish = endAnchors.get(key);
    }
    const start = anchors.get(c);
    if (!start?.[0] || !start[1] || !finish?.[0] || !finish[1]) {
      diagnose(g, 'No real ground-level road anchor exists on both sides'); continue;
    }
    const sidePoint = (s: number, side: number) => {
      const p = at(s), offset = (side > 0 ? p.left : p.right) + g.width / 2 + SETBACK;
      return terrainPoint({ x: p.x - p.ty * offset * side, y: p.y + p.tx * offset * side });
    };
    const links: CrossingPoint[][] = [];
    for (const side of [-1, 1]) {
      const k = side < 0 ? 0 : 1, a = start[k]!, b = finish[k]!;
      const s0 = project(a).s, s1 = project(b).s, lo = Math.min(s0, s1), hi = Math.max(s0, s1);
      const stations = [lo];
      for (let i = 0; i < route.s.length; i++) if (route.s[i] > lo && route.s[i] < hi) stations.push(route.s[i]);
      stations.push(hi);
      // Avoid chord cuts across changing earthwork edges; retain route stations, then drape all
      // interpolated connector samples. An excessively long link is explicitly budget-limited.
      if (stations.length > MAX_POINTS - 4) {
        diagnose(g, 'Link exceeds the bounded route sampling budget');
        const stride = Math.ceil(stations.length / (MAX_POINTS - 4));
        const reduced = stations.filter((_, i) => i % stride === 0); if (reduced[reduced.length - 1] !== hi) reduced.push(hi);
        stations.splice(0, stations.length, ...reduced);
      }
      if (s1 < s0) stations.reverse();
      const controls = [a, ...stations.map(s => sidePoint(s, side)), b];
      const link: CrossingPoint[] = [a];
      const length = crossingPlanLength(controls), budget = Math.max(0, MAX_POINTS - controls.length);
      for (let i = 1; i < controls.length; i++) {
        const p = controls[i - 1], q = controls[i], len = Math.hypot(q.x - p.x, q.y - p.y);
        const count = Math.min(Math.max(1, Math.ceil(len / STEP)), 1 + Math.floor(budget * len / (length || 1)));
        for (let j = 1; j <= count; j++) {
          const t = j / count;
          link.push(j === count ? q : terrainPoint({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }));
        }
      }
      links.push(link);
    }
    g.links = links as [CrossingPoint[], CrossingPoint[]];
    g.turnarounds = [start[0], start[1]];
    c.linkLength = links.reduce((sum, path) => sum + crossingPlanLength(path), 0);
    c.cost = c.linkLength * (c.roadPerKm ?? ROAD_CLASSES[c.cls].roadPerKm[0]) / 1000 + (c.cls === 'service' ? ACCESS : 0);
  }
}

export interface CrossingAuditIssue { roadId?: number; s: number; message: string }
/** Independent streaming checks over final geometry, suitable for tests and saved-design audits. */
export function auditCrossingGeometry(crossings: readonly CrossingResult[], route: CrossingRoute,
  heightAt: (x: number, y: number) => number): CrossingAuditIssue[] {
  const issues: CrossingAuditIssue[] = [];
  if (route.s.length < 2) return issues;
  const { project, margin } = routeGeometry(route);
  for (const c of crossings) {
    const g = c.geometry;
    const report = (message: string) => { if (!issues.some(v => v.roadId === c.roadId && v.s === c.s && v.message === message)) issues.push({ roadId: c.roadId, s: c.s, message }); };
    if (!g) { report('Missing crossing geometry'); continue; }
    for (const message of g.diagnostics ?? []) report(message);
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
      for (const q of [path[0], path[path.length - 1]]) if (q && Math.abs(q.z - heightAt(q.x, q.y)) > 0.3) report('Dangling endpoint');
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
    if (g.links) {
      for (const path of g.links) for (const q of path) if (margin(q, g.width / 2) < -0.1) report('Link intrudes into the earthwork footprint');
      if (Math.abs(g.links.reduce((sum, path) => sum + crossingPlanLength(path), 0) - (c.linkLength ?? 0)) > 0.01) report('Link quantity differs from geometry');
    }
  }
  return issues;
}
