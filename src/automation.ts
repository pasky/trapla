// The debug / automation API (`window.trapla`): what the headless scripts in scripts/ and qa/ drive the
// game through (smoke, playtest, drag-perf, the scene and screenshot scripts). Moved out of main.ts
// verbatim; it reads the app through `AutomationContext`, whose members are live views of main.ts's state.
// Nothing in the game itself may call this.
import type { Design, Result } from './core/evaluate';
import type { ProjectDesign, ProjectResult, RouteId } from './core/project';
import { replaceRouteFromLegacy } from './core/project-legacy';
import type { ProjectTransportIndex } from './core/project-network';
import { groundRoadSourceInfo } from './core/project-promotion';
import type { TransportGraphData } from './core/project-transport';
import { KIND } from './core/structures';
import type { ProjectStore } from './project-store';
import { routeIndicationHeight } from './render/route-indication';
import { culvertPlans } from './render/culvert-geometry';
import type { View } from './render/view';
import type { Pack } from './scenario';
import type { ActiveRouteStore } from './ui/active-route-store';
import { bendStations } from './ui/bend-stations';
import type { BuildRoadTool, Placement } from './ui/build-road';
import type { CurveEditor } from './ui/curve-edit';
import type { Sel } from './ui/inspector';
import type { MappedRoadCard } from './ui/mapped-road';
import type { ProfilePanel } from './ui/profile';
import { mappedLineKindFor } from './ui/route-kinds';
import type { RouteSelection } from './ui/route-selection';
import type { ViewBar, ViewPrefs } from './ui/viewbar';
import { stationIndex } from './core/range';

/** Live views of main.ts's state (getters: read at each call, as the closure variables were). */
export interface AutomationContext {
  readonly store: ActiveRouteStore; readonly projectStore: ProjectStore; readonly view: View; readonly pack: Pack;
  readonly profile: ProfilePanel; readonly viewBar: ViewBar; readonly curveEdit: CurveEditor; readonly buildTool: BuildRoadTool;
  readonly meta: Pack['meta'];
  /** the mission's ends when the game started */
  readonly A: { x: number; y: number }; readonly B: { x: number; y: number };
  /** the active road's shown result (a drag preview while dragging), the last full project result */
  readonly last: Result | null; readonly projectFull: ProjectResult | null;
  readonly transportIndex: ProjectTransportIndex | null; readonly transportGraph: TransportGraphData | null;
  readonly sourceEditor: MappedRoadCard | null;
  readonly sel: Sel | null; readonly qualifiedSelection: RouteSelection | null;
  /** the active road is selected (a drag on it bends it) */
  readonly roadSelected: boolean;
  /** id of the newest handled worker result */
  readonly received: number;
  readonly handlerTiming: Record<string, number>;
  readonly heavyStats: Record<string, number>;
  readonly idleWaiters: (() => void)[];
  sceneIdle(): boolean;
  missionRouteId(): RouteId | undefined;
  switchRoute(id: RouteId, created?: boolean, oneDirection?: boolean): boolean;
  select(next: Sel | null, fly?: boolean): void;
  selectPiece(s: number, fly?: boolean): void;
  /** the active road itself selected (ui/selection.ts) */
  selectRoad(): void;
  placeAt(clientX: number, clientY: number, x: number, y: number): Placement;
  ensureTransport(): Promise<void>;
  /** forget what a hitRoad probe grabbed */
  releaseGrab(): void;
}

export function installAutomation(c: AutomationContext): void {
  (window as unknown as { trapla: unknown }).trapla = {
    getDesign: () => structuredClone(c.store.design),
    setDesign: (d: Design) => {
      const id = c.missionRouteId() ?? c.store.activeRouteId; if (!id) return; c.switchRoute(id);
      c.store.editProject(draft => {
        Object.assign(draft, replaceRouteFromLegacy(draft, id, d));
        const route = draft.routes.find(r => r.id === id)!;
        // Explicit legacy automation semantics: its one speed also governed traffic emissions.
        if (route.kind === 'road' && route.specification.operations.speedPolicy !== 'independent') route.specification.operations.speed = d.speed;
      });
      // a step in progress (a held drag, + / − not yet settled) ends with the replacement: one undo step, none left open
      c.store.commit();
    },
    getProject: () => structuredClone(c.projectStore.snapshot.design),
    projectSnapshot: () => structuredClone(c.projectStore.snapshot),
    projectResult: () => c.projectFull,
    /** a road's works around station s: its bridge there (m), retaining walls within 150 m (count, length), billed parts within `reach` m */
    localWorks: (r: Result, s: number, reach = 300) => {
      const run = r.runs.find(x => x.kind === KIND.bridge && x.s0 <= s && x.s1 >= s);
      let cost = 0;
      for (const part of Object.values(r.parts)) for (let i = 0; i < r.n; i++) if (Math.abs(r.s[i] - s) <= reach) cost += part[i];
      const walls = r.retainingWalls.filter(w => w.s1 >= s - 150 && w.s0 <= s + 150);
      return { bridge: run ? run.s1 - run.s0 : 0, walls: walls.length, wallLength: walls.reduce((t, w) => t + w.s1 - w.s0, 0), cost };
    },
    activeRoute: () => c.store.activeRouteId,
    routeEndpoints: () => structuredClone(c.store.route?.endpoints ?? null),
    renderRoutes: () => c.view.routeGeometryStats(),
    groundHeight: (x: number, y: number) => c.pack.terrain.heightAt(x, y),
    /** the active road's stream culverts as drawn (render/culvert-geometry.ts) */
    culverts: () => c.last ? culvertPlans(c.last, c.pack.terrain.watercourses, (x, y) => c.pack.terrain.heightAt(x, y)) : [],
    routeScreen: (id: RouteId, s: number) => {
      const route = c.projectFull?.routes[id], r = route?.legacy;
      if (!r) { // an unaccepted proposal: its drawn reference line
        const p = route?.surface?.points; if (!p?.length) return null;
        const q = p.reduce((a, b) => (Math.abs(b.s - s) < Math.abs(a.s - s) ? b : a));
        return c.view.project(q.x, q.y, c.view.drape(q.x, q.y) + 2.5);
      }
      const i = stationIndex(r, s);
      return c.view.project(r.x[i], r.y[i], r.kind[i] === KIND.tunnel ? c.view.drape(r.x[i], r.y[i]) + 2 : r.grade[i] + 1.5);
    },
    handledRequest: () => c.received,
    /** promotable ground base roads at least minLength long, with their distance from the routes (m) */
    baseRoads: (minLength = 600) => {
      if (!c.transportIndex) return [];
      const routes = Object.values(c.projectFull?.routes ?? {}).flatMap(r => r.legacy ? [r.legacy] : []);
      return c.transportIndex.graph.sources.flatMap(source => {
        const length = source.stations[source.stations.length - 1];
        if (source.kind !== 'road' || length < minLength) return [];
        let info; try { info = groundRoadSourceInfo(c.transportIndex!, source.id); } catch { return []; }
        let clear = Infinity;
        for (let i = 0; i < source.xy.length; i += 2) for (const r of routes) for (let k = 0; k < r.n; k += 10)
          clear = Math.min(clear, Math.hypot(r.x[k] - source.xy[i], r.y[k] - source.xy[i + 1]));
        const mid = c.transportIndex!.branches({ transportData: c.transportIndex!.transportData, sourceId: source.id, s0: 0, s1: length })
          .filter(b => b.s > 50 && b.s < length - 50).map(b => b.s);
        return [{ id: source.id, name: info.name, legalClass: info.legalClass, length, clear, branches: mid, rebuildable: mappedLineKindFor(c.transportIndex!, source.id).verdict.ok }];
      });
    },
    /** mapped ways tagged highway=`highway` ('railway': railway lines), at least minLength long (ids, longest first) */
    sourceIds: (highway: string, minLength = 0) => (c.transportIndex?.graph.sources ?? []).filter(q => (highway === 'railway' ? q.kind === 'railway' : q.tags.highway === highway)
      && q.stations[q.stations.length - 1] >= minLength)
      .sort((p, q) => q.stations[q.stations.length - 1] - p.stations[p.stations.length - 1]).map(q => q.id),
    sourceScreen: (id: string, s: number) => { const p = c.transportIndex?.position(id, s); return p ? c.view.project(p.x, p.y, c.view.drape(p.x, p.y)) : null; },
    sourceSelection: () => c.sourceEditor?.selection ?? null,
    /** a mapped way's length (m) and tags */
    sourceLength: (id: string) => { const q = c.transportIndex?.graph.sources.find(q => q.id === id); return q ? q.stations[q.stations.length - 1] : 0; },
    sourceTags: (id: string) => c.transportIndex?.graph.sources.find(q => q.id === id)?.tags ?? null,
    /** the road links are loaded and parsed (they load on first need) */
    transportLoaded: () => !!c.transportGraph,
    /** the screen point (px inside the view) of the drawn ground at x, y */
    groundScreen: (x: number, y: number) => c.view.project(x, y, c.view.drape(x, y)),
    /** would a press at this client point drag something (bend our road, rebuild a mapped road) instead of panning? */
    grabsAt: (clientX: number, clientY: number) => { const on = c.view.ev.hitRoad?.(clientX, clientY) ?? false; c.releaseGrab(); return on; },
    sourcePoint: (id: string, s: number) => c.transportIndex?.position(id, s) ?? null,
    buildHover: () => c.buildTool.hoverText,
    building: () => c.buildTool.active,
    /** what a Build click at this client point would place (no change) */
    placementAt: (clientX: number, clientY: number) => { const g = c.view.pick(clientX, clientY); return g ? c.placeAt(clientX, clientY, g.x, g.y) : null; },
    /** a point on a drawn road away from ours (for checking the no-road-links card) */
    legacyRoadPoint: () => {
      const net = c.pack.overlays.net, r = c.last; if (!net || !r) return null;
      for (const w of net.ways) {
        if (!['tertiary', 'secondary', 'residential', 'unclassified'].includes(net.cls[w[0]]) || w.length < 5) continue;
        const x = (w[1] + w[3]) / 2, y = (w[2] + w[4]) / 2;
        let near = Infinity; for (let i = 0; i < r.n; i += 5) near = Math.min(near, Math.hypot(r.x[i] - x, r.y[i] - y));
        if (near > 400 && near < 3000 && !c.pack.terrain.isOob(x, y) && Math.hypot(w[3] - w[1], w[4] - w[2]) > 30) return { x, y };
      }
      return null;
    },
    lookAtSource: (id: string, s: number, dist = 900) => { const p = c.transportIndex?.position(id, s); if (p) c.view.lookAt(p.x, p.y, dist, 0, 55); },
    proposalLines: () => c.view.proposalCount,
    photoWithNetwork: () => c.view.photoWithNetwork,
    /** make a road the active one and select it, as the road list does */
    setActiveRoute: (id: RouteId, created?: boolean, oneDirection?: boolean) => { const ok = c.switchRoute(id, created, oneDirection); if (ok) c.selectRoad(); return ok; },
    projectSelection: () => structuredClone(c.qualifiedSelection),
    setProject: (design: ProjectDesign) => {
      c.select(null);
      if (c.projectStore.inTransaction) c.projectStore.cancel();
      c.projectStore.begin(); c.projectStore.update(draft => Object.assign(draft, structuredClone(design))); c.projectStore.commit();
    },
    result: () => c.last,
    summary: () => c.last && {
      length: c.last.length, travelMin: c.last.travelMin, valid: c.last.valid, cost: c.last.cost, violations: c.last.violations,
      quantities: { ...c.last.quantities, massHaul: undefined, hitBuildings: c.last.quantities.hitBuildings.length },
      runs: c.last.runs, timing: c.last.timing, vpis: c.last.vpis.length, crossings: c.last.crossings, walls: c.last.walls,
    },
    whenIdle: () => new Promise<void>((res) => { if (c.sceneIdle()) res(); else c.idleWaiters.push(res); }),
    /** parse the lazily loaded transport graph now (base-road hooks below need it) */
    whenTransport: () => c.ensureTransport().then(() => !!c.transportGraph),
    lookAt: (x: number, y: number, dist?: number, bearing?: number, elev?: number) => c.view.lookAt(x, y, dist, bearing, elev),
    screenOf: (x: number, y: number, z: number) => c.view.project(x, y, z),
    resetCamera: () => c.view.resetCamera(),
    /** select something (as a click would): a bend, pin, crossing, building, stretch or piece at a station */
    select: (t: Sel | null) => c.select(t),
    selectPiece: (s: number) => c.selectPiece(s),
    selection: () => c.sel && JSON.parse(JSON.stringify(c.sel)),
    /** the active road is selected: a drag on it bends it (else the drag moves the map; a click selects it) */
    roadSelected: () => c.roadSelected,
    selectPi: (i: number | null) => c.select(i === null ? null : { kind: 'bend', i }),
    selectStation: (s: number) => c.select({ kind: 'pin', s }),
    selectCrossing: (roadId: number) => c.select({ kind: 'crossing', roadId }, true),
    selectCulvert: (id: number, s: number) => c.select({ kind: 'culvert', id, s }, true),
    selectBuilding: (j: number) => c.select({ kind: 'building', j }),
    maxRadius: (i: number) => c.curveEdit.maxRadius(i),
    pick: (clientX: number, clientY: number) => c.view.pick(clientX, clientY),
    project: (x: number, y: number, z: number) => c.view.project(x, y, z),
    /** screen position (px inside the view) of building j's centroid, `up` metres above its ground */
    /** building j is drawn in 3D (false: no mesh) */
    buildingShown: (j: number) => c.view.buildingMesh(j) >= 0,
    /** building j is drawn as taken by the project (bought out: its standing colour) */
    buildingTaken: (j: number) => { const k = c.view.buildingMesh(j); return k >= 0 && !!c.view.buildingMeshes?.isMarked(k); },
    buildingScreen: (j: number, up = 2) => {
      const b = c.pack.overlays.buildings[j];
      return b && c.view.project(b[0], b[1], c.pack.terrain.heightAt(b[0], b[1]) + up);
    },
    profileFocus: (s0: number, s1: number) => c.profile.focus(s0, s1),
    /** a point of the profile chart (CSS px inside its canvas): station s, height z */
    profileScreen: (s: number, z: number) => ({ x: c.profile.stationX(s), y: c.profile.heightY(z) }),
    profileFit: () => c.profile.fit(),
    profileView: () => c.profile.view,
    profileHasRoad: () => c.profile.hasRoad,
    /** By hand: the height points with a handle at the profile's zoom */
    profileShownPoints: () => c.profile.shownPoints,
    profileHover: () => c.profile.hover,
    profilePoint: (s: number, z?: number, band?: boolean) => c.profile.toClient(s, z, band),
    bendStations: () => c.last && bendStations(c.last, c.store.design),
    cameraTarget: () => c.view.target,
    cameraDistance: () => c.view.cameraDistance,
    cameraPose: () => c.view.pose,
    undoLabels: () => ({ undo: c.store.undoLabel(), redo: c.store.redoLabel() }),
    selectRange: (s0: number | null, s1?: number) => c.select(s0 === null || s1 === undefined ? null : { kind: 'stretch', s0, s1 }),
    range: () => (c.sel?.kind === 'stretch' ? { s0: c.sel.s0, s1: c.sel.s1 } : null),
    /** the road's screen point (px inside the view) at station s */
    // where the road is drawn to grab: a tunnel at its ground-level indication, as picking uses
    roadScreen: (s: number) => { if (!c.last) return null; const i = stationIndex(c.last, s); return c.view.project(c.last.x[i], c.last.y[i], routeIndicationHeight(c.last, i, (x, y) => c.view.drape(x, y))); },
    mapWindow: () => (c.profile as unknown as { mapWindow: unknown }).mapWindow,
    setExaggeration: (e: number) => c.viewBar.set({ exag: e }),
    setView: (p: Partial<ViewPrefs>) => c.viewBar.set(p),
    viewBusy: () => c.view.busy,
    handlerTiming: () => ({ ...c.handlerTiming }),
    /** the last full result's sliced 3D rebuild: slices, busy / longest-slice / wall / commit ms */
    rebuildStats: () => ({ ...c.heavyStats }),
    /** live shader programs (a growing / changing list during edits means recompiles) */
    programs: () => (c.view.renderer.info.programs ?? []).map((p) => `${p.id}:${p.cacheKey.slice(0, 40)}`),
    /** debugging only: the 3D view */
    debugView: () => c.view,
    meta: c.meta,
    official: c.meta.official.xy,
    A: c.A, B: c.B,
  };
}
