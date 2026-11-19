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
    // (a cut way's works away from our road: its own old line, rebuilt there as a drag on it selected does)
    return { ok: true, part, hover: hover(stretch.name), name: stretch.name, crossing: c, target: { kind: 'mapped', interval: stretch.interval, lineKind: stretch.lineKind } };
  };
  return { plan, sourceOf, label: (c: CrossingResult) => cap(ROAD_CLASSES[c.cls]?.label ?? 'road') };
}
export type CrossingDrag = ReturnType<typeof createCrossingDrag>;

/** Our road's line around station s (± SLIDE_REACH), with its stations: what a slid ring follows. */
export function slideAxis(r: Result, s: number): { x: number[]; y: number[]; s: number[] } {
  const out = { x: [] as number[], y: [] as number[], s: [] as number[] };
  for (let i = 0; i < r.n; i++) if (Math.abs(r.s[i] - s) <= SLIDE_REACH) { out.x.push(r.x[i]); out.y.push(r.y[i]); out.s.push(r.s[i]); }
  return out;
}
/** The station on the axis nearest p. */
export function axisStation(a: { x: number[]; y: number[]; s: number[] }, p: XY): number {
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
export function axisPoint(a: { x: number[]; y: number[]; s: number[] }, s: number): XY {
  const n = a.s.length;
  if (!n) return { x: 0, y: 0 };
  if (s <= a.s[0]) return { x: a.x[0], y: a.y[0] };
  if (s >= a.s[n - 1]) return { x: a.x[n - 1], y: a.y[n - 1] };
  let k = 1; while (k < n - 1 && a.s[k] < s) k++;
  const t = (s - a.s[k - 1]) / ((a.s[k] - a.s[k - 1]) || 1);
  return { x: a.x[k - 1] + t * (a.x[k] - a.x[k - 1]), y: a.y[k - 1] + t * (a.y[k] - a.y[k - 1]) };
}
