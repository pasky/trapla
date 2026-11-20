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
  /** `exclude`: a road never picked (a road's own end dragged over it) */
  const routeAt = (clientX: number, clientY: number, px: number, exclude?: RouteId) => {
    const box = canvasBox();
    const routes = Object.values(app.projectFull?.routes ?? {}).flatMap(route => {
      if (route.routeId === exclude) return [];
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
  /** the station of a railway carried over our road on its bridge whose deck is under the cursor (within its
   * half-length along the railway, and its half-width) */
  const railAt = (clientX: number, clientY: number): number | null => {
    const r = app.last;
    if (!r?.railCrossings?.some(c => c.how === 'railway')) return null;
    const box = canvasBox(), px = clientX - box.left, py = clientY - box.top;
    let best: number | null = null, bd = 14;
    for (const c of r.railCrossings) if (c.how === 'railway' && c.price) for (let k = -4; k <= 4; k++) {
      const t = k / 4 * c.price.span / 2, q = app.view.project(c.x + c.tx * t, c.y + c.ty * t, c.g);
      if (!q?.vis) continue;
      const d = Math.hypot(q.sx - px, q.sy - py);
      if (d < bd) { bd = d; best = c.s; }
    }
    return best;
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
  const thingAt = (clientX: number, clientY: number): Sel | { kind: 'route-hit'; routeId: RouteId; s: number } | { kind: 'source'; hit: SourceHit } | { kind: 'official' } | null => {
    // a culvert's end (close up: its headwall, wings and apron at the slope's toe, a small target of its own)
    const culvert = app.extras.culvertAt(clientX, clientY);
    if (culvert) return { kind: 'culvert', id: culvert.id, s: culvert.s };
    const c = crossingAt(clientX, clientY);
    if (c) return { kind: 'crossing', roadId: c.roadId! };
    // a railway carried over us on its new bridge: its deck (a short target over our road, at the rails' level)
    const rail = railAt(clientX, clientY);
    if (rail !== null) return { kind: 'rail', s: rail };
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
    // a mapped road before the planned line drawn over it; the planned line before open ground
    return sourceAt(clientX, clientY) ?? (officialAt(clientX, clientY) ? { kind: 'official' } : null);
  };
  /** the dashed official / planned line under the pointer (drawn 3 m over the ground; within a few pixels of it). Its
   * points as drawn (≤ 25 m apart, on the map) are made once; a hover projects them only. */
  let official: { x: number; y: number; z: number }[] | null = null;
  const officialAt = (clientX: number, clientY: number): boolean => {
    if (!official) {
      const raw = (app.pack.meta.official?.xy ?? []) as [number, number][], T = app.pack.terrain;
      official = [];
      for (let i = 0; i < raw.length; i++) {
        const [x1, y1] = raw[i], [x0, y0] = raw[Math.max(0, i - 1)], m = i ? Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 25)) : 1;
        for (let k = 1; k <= m; k++) {
          const x = x0 + (x1 - x0) * k / m, y = y0 + (y1 - y0) * k / m;
          if (x >= 0 && y >= 0 && x <= T.width && y <= T.height) official.push({ x, y, z: app.view.drape(x, y) + 3 });
        }
      }
    }
    if (official.length < 2) return false;
    const box = canvasBox(), px = clientX - box.left, py = clientY - box.top, reach = 6;
    let prev = app.view.project(official[0].x, official[0].y, official[0].z);
    for (let i = 1; i < official.length; i++) {
      const p = official[i], q = app.view.project(p.x, p.y, p.z);
      if (prev.vis && q.vis) {
        const dx = q.sx - prev.sx, dy = q.sy - prev.sy, t = Math.max(0, Math.min(1, ((px - prev.sx) * dx + (py - prev.sy) * dy) / (dx * dx + dy * dy || 1)));
        if (Math.hypot(px - prev.sx - t * dx, py - prev.sy - t * dy) <= reach) return true;
      }
      prev = q;
    }
    return false;
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
  return { canvasBox, routeAt, roadAt, crossingAt, crossingWorksAt, buildingAt, sourceAt, thingAt, officialAt };
}
