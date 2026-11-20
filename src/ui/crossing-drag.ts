// What a drag on a selected crossing's parts does (the owner's I/35 report: every press on the crossing's ring or on
// the crossed road's lit works moved the map). Select first, then drag, as everywhere:
//  - its ring (the marker on our road): slides where the crossed road crosses ours along our road. A mapped road is
//    rebuilt there (the any-road editing: its stretch between junctions becomes a project road) with a bend at the
//    crossing that follows the pointer along our road; a road of the project gets that bend of its own;
//  - its works (the crossed road's ramps, deck, box, rebuilt piece): bends that road, as a drag on it selected does;
//  - a reroute's new road keeps its own drag (link-edit.ts).
// Where a drag cannot change the crossed line, the hover says why instead (plan.ok false). Pure planning here; the
// gesture itself is map-gestures.ts's.
import type { CrossingResult } from '../core/crossings';
import type { Result } from '../core/evaluate';
import type { ProjectResult, RouteDesign, RouteId, SourceInterval } from '../core/project';
import type { ProjectTransportIndex } from '../core/project-network';
import type { RoadNetData } from '../core/roadnet';
import { ROAD_CLASSES } from '../core/data/urban';
import type { MappedRoadCard } from './mapped-road';
import type { MappedLineKind } from './route-kinds';
import { buildAlignment, nearestLeg, station, type PI } from '../core/horizontal';
import { bendRules, horizontalRules } from '../core/data/norms';
import type { CategoryId } from '../core/data/categories';

type XY = { x: number; y: number };
/** A press on the works further than this from the crossed way's own line (a side road regraded to meet it, a turning
 * head) is not on that way, m. */
const ON_WAY = 25;
/** How far along our road either side of the crossing the ring slides, m (a drag further is held at the end). */
export const SLIDE_REACH = 400;

export const CROSSING_DRAG_TEXT = {
  slide: 'drag to move where it crosses',
  bend: (name: string) => `drag to bend ${name}`,
  /** a cut way: nothing crosses our road there to move */
  cut: 'Cut here: pick how it crosses in the card',
  /** a road of the project joins the crossed road's stretch (a slip road's junction) */
  joined: 'A road you built joins it here: move that road’s end first',
  /** the undo step of a slide */
  undo: (name: string) => `moving where ${name} crosses`,
};

export type CrossingDragTarget = { kind: 'mapped'; interval: SourceInterval; lineKind: MappedLineKind } | { kind: 'route'; routeId: RouteId };
export type CrossingDragPlan = { ok: true; part: 'ring' | 'works'; hover: string; name: string; crossing: CrossingResult; target: CrossingDragTarget }
  | { ok: false; hover: string };

export interface CrossingDragContext {
  readonly transportIndex: ProjectTransportIndex | null;
  readonly sourceEditor: MappedRoadCard | null;
  readonly roadNet: RoadNetData | undefined;
  readonly projectFull: ProjectResult | null;
  readonly activeRouteId: RouteId | null;
  readonly routes: readonly RouteDesign[];
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const CUT = new Set<CrossingResult['type']>(['reconnection', 'diversion']);

export function createCrossingDrag(app: CrossingDragContext) {
  let ways: { index: ProjectTransportIndex; map: Map<number, string> } | null = null;
  /** the transport source of a pack way (a mapped bridge or tunnel: its OSM way's) */
  const sourceOf = (way: number): string | undefined => {
    const index = app.transportIndex; if (!index) return undefined;
    if (ways?.index !== index) ways = { index, map: new Map(index.graph.sources.flatMap(s => s.legacyNetIndex === undefined ? [] : [[s.legacyNetIndex, s.id] as const])) };
    const id = ways.map.get(way);
    if (id) return id;
    const net = app.roadNet, k = net ? way - net.ways.length : -1, osm = k >= 0 ? net?.structures?.osm?.[k] : undefined;
    return osm && index.source(`osm:way:${osm}`) ? `osm:way:${osm}` : undefined;
  };
  /** the station of the source nearest p, and how far p is from it */
  const stationOn = (sourceId: string, p: XY): { s: number; d: number } | null => {
    const q = app.transportIndex?.source(sourceId); if (!q || q.xy.length < 4) return null;
    let best = { s: 0, d: Infinity };
    for (let k = 1; k < q.stations.length; k++) {
      const ax = q.xy[2 * k - 2], ay = q.xy[2 * k - 1], dx = q.xy[2 * k] - ax, dy = q.xy[2 * k + 1] - ay;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / (dx * dx + dy * dy || 1)));
      const d = Math.hypot(p.x - ax - t * dx, p.y - ay - t * dy);
      if (d < best.d) best = { s: q.stations[k - 1] + t * (q.stations[k] - q.stations[k - 1]), d };
    }
    return best;
  };
  /** the project road the crossing crosses (a designed one), by its own mark or else by where it runs */
  const crossedRoute = (c: CrossingResult): { id: RouteId; name: string } | null => {
    if (!c.designed) return null;
    if (c.crossedRoute) return c.crossedRoute;
    let best: { id: RouteId; name: string; d: number } | null = null;
    for (const route of Object.values(app.projectFull?.routes ?? {})) {
      const r = route.legacy; if (!r || route.routeId === app.activeRouteId) continue;
      for (let i = 0; i < r.n; i++) {
        const d = Math.hypot(r.x[i] - c.x, r.y[i] - c.y);
        if (d < 15 && (!best || d < best.d)) best = { id: route.routeId, name: app.routes.find(q => q.id === route.routeId)?.name ?? 'the road', d };
      }
    }
    return best;
  };
  /** What a drag of this crossing's ring (`ring`) or of its works at ground point `at` (`works`) would do; null: the
   * road links are not loaded yet (nothing to say) or the press is not on the crossed way. */
  const plan = (c: CrossingResult, part: 'ring' | 'works', at: XY): CrossingDragPlan | null => {
    if (c.roadId === undefined) return null;
    if (part === 'ring' && CUT.has(c.type)) return { ok: false, hover: CROSSING_DRAG_TEXT.cut };
    const hover = (name: string) => part === 'ring' ? CROSSING_DRAG_TEXT.slide : CROSSING_DRAG_TEXT.bend(name);
    const designed = crossedRoute(c);
    if (designed) {
      const name = designed.name;
      return { ok: true, part, hover: hover(name), name, crossing: c, target: { kind: 'route', routeId: designed.id } };
    }
    if (c.designed) return null;
    if (!app.transportIndex || !app.sourceEditor) return null;
    const id = sourceOf(c.roadId);
    if (!id) return { ok: false, hover: 'This road cannot be changed here.' };
    const on = stationOn(id, part === 'ring' ? c : at);
    if (!on || (part === 'works' && on.d > ON_WAY)) return null;
    const stretch = app.sourceEditor.stretchAt(id, on.s);
    if (!stretch.ok) return { ok: false, hover: stretch.why };
    // (a road of the project ends on that stretch, a slip road's junction: it would lose where it joins)
    const { s0, s1 } = stretch.interval;
    if (app.routes.some(r => [r.endpoints.a.anchor, r.endpoints.b.anchor].some(e => e.kind === 'source' && e.location.sourceId === id && e.location.s >= s0 - 1 && e.location.s <= s1 + 1)))
      return { ok: false, hover: CROSSING_DRAG_TEXT.joined };
    // (a cut way's works away from our road: its own old line, rebuilt there as a drag on it selected does)
    return { ok: true, part, hover: hover(stretch.name), name: stretch.name, crossing: c, target: { kind: 'mapped', interval: stretch.interval, lineKind: stretch.lineKind } };
  };
  return { plan, sourceOf, label: (c: CrossingResult) => cap(ROAD_CLASSES[c.cls]?.label ?? 'road') };
}
export type CrossingDrag = ReturnType<typeof createCrossingDrag>;

type Axis = { x: number[]; y: number[]; s: number[] };
/** Our road's line around station s (± SLIDE_REACH), with its stations: what a slid ring follows. */
export function slideAxis(r: Result, s: number): Axis {
  const out: Axis = { x: [], y: [], s: [] };
  for (let i = 0; i < r.n; i++) if (Math.abs(r.s[i] - s) <= SLIDE_REACH) { out.x.push(r.x[i]); out.y.push(r.y[i]); out.s.push(r.s[i]); }
  return out;
}
/** The station on the axis nearest p. */
export function axisStation(a: Axis, p: XY): number {
  let best = Infinity, at = a.s[0] ?? 0;
  for (let k = 1; k < a.s.length; k++) {
    const ax = a.x[k - 1], ay = a.y[k - 1], dx = a.x[k] - ax, dy = a.y[k] - ay;
    const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(p.x - ax - t * dx, p.y - ay - t * dy);
    if (d < best) { best = d; at = a.s[k - 1] + t * (a.s[k] - a.s[k - 1]); }
  }
  return at;
}
/** The axis point at station s (held at its ends). */
export function axisPoint(a: Axis, s: number): XY {
  const n = a.s.length;
  if (!n) return { x: 0, y: 0 };
  if (s <= a.s[0]) return { x: a.x[0], y: a.y[0] };
  if (s >= a.s[n - 1]) return { x: a.x[n - 1], y: a.y[n - 1] };
  let k = 1; while (k < n - 1 && a.s[k] < s) k++;
  const t = (s - a.s[k - 1]) / ((a.s[k] - a.s[k - 1]) || 1);
  return { x: a.x[k - 1] + t * (a.x[k] - a.x[k - 1]), y: a.y[k - 1] + t * (a.y[k] - a.y[k - 1]) };
}

/** UI choices of the slide, m (no design rule: where the crossed road is re-routed locally, the norm then checks it):
 * the crossed road's bends whose curve comes within SLIDE_WINDOW of the crossing move with it; on a straight, two
 * new bends this far either side of the crossing (at least EDGE_ROOM clear of other curves and of the road's ends)
 * carry the piece between them across. */
const SLIDE_WINDOW = 60, EDGE_ROOM = 20;

/** The crossed road's piece a slid ring moves: its bends (`moving`, the road's bends with new ones put in), all moved
 * by the same step across the crossed road's direction there (`n`), so that it keeps its angle to ours. `held`: the
 * bend the drag holds (the one the view's drag follows). */
export interface SlideSection { line: { a: XY; b: XY; speed: number; category: CategoryId }; pis: PI[]; moving: number[]; n: XY; held: number; from: XY }

export function slideSection(a: XY, b: XY, pis0: readonly PI[], speed: number, category: CategoryId, p: XY): SlideSection {
  const al = (pis: PI[]) => buildAlignment(a, b, pis, horizontalRules(speed, category), bendRules(pis, speed, category));
  let pis = pis0.map(q => ({ ...q }));
  const line = al(pis), st = station(line, 2);
  let k0 = 0, best = Infinity;
  for (let k = 0; k < st.n; k++) { const d = Math.hypot(st.x[k] - p.x, st.y[k] - p.y); if (d < best) { best = d; k0 = k; } }
  const sc = st.s[k0], n = { x: -st.ty[k0], y: st.tx[k0] }, from = { x: st.x[k0], y: st.y[k0] };
  const curves = line.curves.filter(c => pis[c.index] && !c.ignored && c.sEnd > c.sStart);
  const pad = (c: (typeof curves)[number]) => Math.max(0, c.tTransition - c.t);
  const core = curves.filter(c => c.sEnd + pad(c) >= sc - SLIDE_WINDOW && c.sStart - pad(c) <= sc + SLIDE_WINDOW).map(c => c.index);
  const base = { line: { a, b, speed, category }, n, from };
  if (core.length) return { ...base, pis, moving: core, held: core[0] };
  // on a straight: a new bend either side, as far out as the straight leaves room (none: one at the crossing)
  const room = (s: number) => s > EDGE_ROOM && s < line.length - EDGE_ROOM && curves.every(c => s < c.sStart - pad(c) - EDGE_ROOM || s > c.sEnd + pad(c) + EDGE_ROOM);
  const at = (s: number) => { let k = 0; while (k < st.n - 1 && st.s[k] < s) k++; return { x: st.x[k], y: st.y[k] }; };
  const edges: XY[] = [];
  for (const sign of [-1, 1]) for (let d = SLIDE_WINDOW; d >= EDGE_ROOM; d -= 10) if (room(sc + sign * d)) { edges.push(at(sc + sign * d)); break; }
  const put = (q: XY) => { const k = nearestLeg(a, b, pis, q); pis = [...pis.slice(0, k), { x: q.x, y: q.y, r: null }, ...pis.slice(k)]; return k; };
  if (edges.length < 2) { const k = put(from); return { ...base, pis, moving: [k], held: k }; }
  const k1 = put(edges[0]), k2 = put(edges[1]);
  const moving = k2 <= k1 ? [k2, k1 + 1] : [k1, k2];
  return { ...base, pis, moving, held: moving[0] };
}
/** Where the crossed road's line (its bends `pis`) crosses our axis, nearest the point `near`; null: it does not. */
function crossingOf(sec: SlideSection, pis: PI[], axis: Axis, near: XY): XY | null {
  const { a, b, speed, category } = sec.line;
  const st = station(buildAlignment(a, b, pis, horizontalRules(speed, category), bendRules(pis, speed, category)), 4);
  let hit: XY | null = null, best = Infinity;
  for (let k = 1; k < st.n; k++) {
    const px = st.x[k - 1], py = st.y[k - 1], rx = st.x[k] - px, ry = st.y[k] - py;
    if (Math.hypot(px - near.x, py - near.y) > SLIDE_REACH) continue;
    for (let j = 1; j < axis.s.length; j++) {
      const qx = axis.x[j - 1], qy = axis.y[j - 1], sx = axis.x[j] - qx, sy = axis.y[j] - qy, den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((qx - px) * sy - (qy - py) * sx) / den, u = ((qx - px) * ry - (qy - py) * rx) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const x = px + t * rx, y = py + t * ry, d = Math.hypot(x - near.x, y - near.y);
      if (d < best) { best = d; hit = { x, y }; }
    }
  }
  return hit;
}
/** The section's bends moved so that the crossed road crosses our axis at `target` (on the axis): a step across the
 * crossed road's direction, corrected a few times where its curves make the first guess miss. */
export function slideTo(sec: SlideSection, axis: Axis, target: XY): PI[] {
  const move = (alpha: number) => sec.pis.map((q, k) => sec.moving.includes(k) ? { ...q, x: q.x + alpha * sec.n.x, y: q.y + alpha * sec.n.y } : q);
  let alpha = (target.x - sec.from.x) * sec.n.x + (target.y - sec.from.y) * sec.n.y, near = target;
  for (let round = 0; round < 3; round++) {
    const x = crossingOf(sec, move(alpha), axis, near);
    if (!x) break;
    const miss = (target.x - x.x) * sec.n.x + (target.y - x.y) * sec.n.y;
    if (Math.abs(miss) < 0.5) break;
    alpha += miss; near = x;
  }
  return move(alpha);
}
