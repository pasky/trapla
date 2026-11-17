// What is under the pointer on the map: our road, another designed road, a crossed road or anything its
// crossing built, a house, a noise wall, a mapped road. Moved out of main.ts verbatim; it reads the app
// through `MapPickContext` (live getters).
import type { Result } from '../core/evaluate';
import type { ProjectResult, RouteDesign, RouteId, RouteResult } from '../core/project';
import type { BuildingPicker } from '../render/building-pick';
import { CrossingPicker } from '../render/crossing-pick';
import type { RouteExtras } from '../render/extras';
import { pickRoute, type PickRoute } from '../render/route-pick';
import type { SourceHit, SourcePicker } from '../render/source-pick';
import type { View } from '../render/view';
import type { Pack } from '../scenario';
import type { Sel } from './inspector';
import type { MappedRoadCard } from './mapped-road';

/** a mapped road is hit on its drawn width plus this many pixels (a near miss on empty ground still deselects) */
const SOURCE_PICK_SLACK_PX = 3;

export interface MapPickContext {
  readonly view: View; readonly pack: Pack; readonly extras: RouteExtras; readonly buildingPicker: BuildingPicker;
  /** the last full project result; the active road's shown result (a preview while dragging) */
  readonly projectFull: ProjectResult | null; readonly last: Result | null;
  readonly activeRouteId: RouteId | null;
  /** the road widgets can edit the active route */
  readonly editable: boolean;
  readonly routes: readonly RouteDesign[];
  /** mapped roads: pickable once the road links are loaded */
  readonly sourcePicker: SourcePicker | null; readonly sourceEditor: MappedRoadCard | null;
  readonly transportData: string | null;
}
export type MapPicks = ReturnType<typeof createMapPicks>;

export function createMapPicks(app: MapPickContext) {
  // buildings are pickable once they are a few pixels big
  const buildingsPickable = () => app.view.metresPerPixel < 3;
  // crossed roads are clickable once they are drawn big enough; from afar a click on the road picks its piece
  const crossingPickPx = () => (app.view.metresPerPixel < 4 ? 12 : app.view.metresPerPixel < 10 ? 6 : 0);
  const canvasBox = () => app.view.renderer.domElement.getBoundingClientRect();
  const surfacePicks = new Map<RouteId, { key: string; result: PickRoute['result'] }>();
  /** an unaccepted proposal is picked on the reference line it is drawn on */
  const surfacePick = (route: RouteResult): PickRoute['result'] | null => {
    const p = route.surface?.points; if (!p || p.length < 2) return null;
    const cached = surfacePicks.get(route.routeId); if (cached?.key === route.engineeringRevision) return cached.result;
    const z = p.map(q => q.z);
    const result = { n: p.length, s: p.map(q => q.s), x: p.map(q => q.x), y: p.map(q => q.y), grade: z, ground: z, kind: p.map(() => 0) };
    surfacePicks.set(route.routeId, { key: route.engineeringRevision, result: result as unknown as PickRoute['result'] });
    return surfacePicks.get(route.routeId)!.result;
  };
  const routeAt = (clientX: number, clientY: number, px: number) => {
    const box = canvasBox();
    const routes = Object.values(app.projectFull?.routes ?? {}).flatMap(route => {
      const r = route.routeId === app.activeRouteId && app.last ? app.last : route.legacy ?? surfacePick(route);
      return r ? [{ id: route.routeId, result: r }] : [];
    });
    return pickRoute(routes, clientX - box.left, clientY - box.top, px,
      (x, y, z) => app.view.project(x, y, z), (x, y) => app.view.drape(x, y), app.activeRouteId ?? undefined);
  };
  const roadAt = (clientX: number, clientY: number, px: number) => {
    const hit = routeAt(clientX, clientY, px);
    return hit?.routeId === app.activeRouteId && app.editable ? hit.index : -1;
  };
  const crossingAt = (clientX: number, clientY: number) => {
    const r = app.last;
    if (!r) return null;
    const box = canvasBox();
    let best = crossingPickPx(), hit: Result['crossings'][number] | null = null;
    for (const c of r.crossings) {
      if (c.roadId === undefined) continue;
      const p = app.view.project(c.x, c.y, Math.max(r.grade[c.i], r.grade[c.i] - c.h) + 2);
      const gap = Math.hypot(p.sx - (clientX - box.left), p.sy - (clientY - box.top));
      if (p.vis && gap < best) { best = gap; hit = c; }
    }
    return hit;
  };
  /** any drawn geometry a crossing owns (its rebuilt road stretch, reroute links, turning heads,
   * underpass box), on the drawn width plus the same slack as a mapped road */
  const crossingPicker = new CrossingPicker();
  const crossingWorksAt = (clientX: number, clientY: number) => {
    const r = app.last;
    if (!r || !crossingPickPx()) return null;
    const g = app.view.pick(clientX, clientY); if (!g) return null;
    crossingPicker.set(r.crossings);
    const box = canvasBox();
    return crossingPicker.at(clientX - box.left, clientY - box.top, g.x, g.y, Math.max(40, 30 * app.view.metresPerPixel), SOURCE_PICK_SLACK_PX,
      (x, y, z) => app.view.project(x, y, z));
  };
  const buildingAt = (clientX: number, clientY: number) => {
    if (!buildingsPickable()) return null;
    const g = app.view.pick(clientX, clientY);
    return g ? app.buildingPicker.at(clientX, clientY, { x: g.x, y: g.y, z: app.pack.terrain.heightAt(g.x, g.y) }) : null;
  };
  /** a mapped base road under the cursor; a stretch a project road already claims selects that road */
  const sourceAt = (clientX: number, clientY: number): { kind: 'source'; hit: SourceHit } | { kind: 'route-hit'; routeId: RouteId; s: number } | null => {
    if (!app.sourcePicker || !app.sourceEditor) return null;
    const g = app.view.pick(clientX, clientY); if (!g) return null;
    const box = canvasBox(), slack = SOURCE_PICK_SLACK_PX;
    const hit = app.sourcePicker.at(clientX - box.left, clientY - box.top, g.x, g.y, Math.max(40, 30 * app.view.metresPerPixel), slack,
      (x, y) => app.view.project(x, y, app.view.drape(x, y)));
    if (!hit) return null;
    for (const route of app.routes) for (const c of route.source?.intervals ?? [])
      if (c.sourceId === hit.sourceId && c.transportData === app.transportData && hit.s >= c.s0 && hit.s <= c.s1) return { kind: 'route-hit', routeId: route.id, s: hit.s - c.s0 };
    return { kind: 'source', hit };
  };
  /** what a click at a client point means */
  const thingAt = (clientX: number, clientY: number): Sel | { kind: 'route-hit'; routeId: RouteId; s: number } | { kind: 'source'; hit: SourceHit } | null => {
    const c = crossingAt(clientX, clientY);
    if (c) return { kind: 'crossing', roadId: c.roadId! };
    const hit = routeAt(clientX, clientY, 10);
    if (hit) return { kind: 'route-hit', routeId: hit.routeId, s: hit.s };
    // a crossing's own works before the rest of the mapped road (whose card is the base road's)
    const works = crossingWorksAt(clientX, clientY);
    if (works) return { kind: 'crossing', roadId: works.crossing.roadId! };
    const b = buildingAt(clientX, clientY);
    if (b !== null) return { kind: 'building', j: b };
    const w = app.extras.wallAt(clientX, clientY);
    if (w) return { kind: 'stretch', s0: w.s0, s1: w.s1 };
    // the cone of fill in front of a bridge's abutment (core/abutment-cone.ts): part of that bridge
    const cone = coneAt(clientX, clientY);
    if (cone !== null && app.activeRouteId) return { kind: 'route-hit', routeId: app.activeRouteId, s: cone };
    return sourceAt(clientX, clientY);
  };
  /** the station of the bridge whose abutment cone is under the pointer, or null */
  const coneAt = (clientX: number, clientY: number): number | null => {
    const r = app.last; if (!r?.cones?.length) return null;
    const g = app.view.pick(clientX, clientY); if (!g) return null;
    for (const c of r.cones) {
      const dx = g.x - c.x, dy = g.y - c.y, u = dx * c.tx + dy * c.ty, v = -dx * c.ty + dy * c.tx;
      const off = Math.max(0, Math.abs(v) - c.half);
      if (u >= -2 && Math.hypot(Math.max(0, u), off) <= c.reach + 2) return r.s[c.i];
    }
    return null;
  };
  return { canvasBox, routeAt, roadAt, crossingAt, crossingWorksAt, buildingAt, sourceAt, thingAt };
}
