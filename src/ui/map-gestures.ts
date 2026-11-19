// The map's gestures: a click inspects (selects) what is under it, a drag from the selected road bends it (a
// new bend on a straight, the bend itself on its curve), a drag on a selected mapped road's highlighted
// stretch rebuilds it as a project road in one undo step, a drag on a selected crossing's reroute shapes it, a
// double click adds a bend. A drag that starts on a road not selected moves the map like one on open ground:
// a click selects it first (the owner's review: random presses while panning bent the road). What a gesture
// has grabbed is this module's own state.
import { fitPlacedBend } from '../core/bend-fit';
import { dropStraightBends, passBends } from '../core/bend-order';
import { fitSetRadii } from '../core/fit-radii';
import { speedNorms } from '../core/data/norms';
import { nearestLeg } from '../core/horizontal';
import type { RouteId, SourceInterval } from '../core/project';
import type { ProjectTransportIndex } from '../core/project-network';
import type { TransportGraphData } from '../core/project-transport';
import type { ProjectStore } from '../project-store';
import type { ProjectCommand } from '../project-store-contract';
import type { MappedLineKind } from './route-kinds';
import type { SourceHit } from '../render/source-pick';
import type { View, ViewEvents } from '../render/view';
import type { Pack } from '../scenario';
import type { ActiveRouteStore } from './active-route-store';
import type { BuildRoadTool, Placement } from './build-road';
import type { Sel } from './inspector';
import type { Intro } from './intro';
import type { LinkEditor } from './link-edit';
import type { MapPicks } from './map-picks';
import type { MappedRoadCard } from './mapped-road';
import { radiusNotes } from './radius-notes';
import type { Result } from '../core/evaluate';
import { axisPoint, axisStation, CROSSING_DRAG_TEXT, slideAxis, slideSection, slideTo, type CrossingDrag, type CrossingDragPlan, type SlideSection } from './crossing-drag';
import { bendAt } from './road-edit';
import { toast } from './toast';

export interface MapGestureContext extends Pick<MapPicks, 'canvasBox' | 'routeAt' | 'roadAt' | 'crossingAt' | 'crossingWorksAt' | 'sourceAt' | 'thingAt'> {
  readonly store: ActiveRouteStore; readonly projectStore: ProjectStore; readonly view: View; readonly pack: Pack;
  readonly buildTool: BuildRoadTool; readonly intro: Intro;
  /** the ends the active line is edited between */
  readonly A: { x: number; y: number }; readonly B: { x: number; y: number };
  readonly transportIndex: ProjectTransportIndex | null; readonly transportGraph: TransportGraphData | null;
  readonly sourceEditor: MappedRoadCard | null; readonly linkEdit: LinkEditor | undefined;
  /** counts selections: a deferred pick yields to any later one */
  readonly selectGeneration: number;
  /** the last pointer position over the map (client px) */
  readonly lastClient: { x: number; y: number };
  /** the active road is selected (a drag on it bends it); the selection */
  readonly roadSelected: boolean; readonly sel: Sel | null;
  /** the active road's shown result */
  readonly last: Result | null;
  /** what a drag on a selected crossing's parts does (ui/crossing-drag.ts) */
  readonly crossingDrag: CrossingDrag;
  ensureTransport(): Promise<void>;
  select(next: Sel | null, fly?: boolean): void;
  selectPiece(s: number, fly?: boolean): void;
  /** nothing selected, the road included; the road itself selected */
  deselect(): void; selectRoad(): void;
  switchRoute(id: RouteId, created?: boolean, oneDirection?: boolean): boolean;
  showSource(hit: SourceHit): void;
  showNoLinks(): void;
  deletePi(i: number): void;
  placeAt(clientX: number, clientY: number, x: number, y: number): Placement;
  legacyRoadAt(x: number, y: number): boolean;
}

export function createMapGestures(app: MapGestureContext) {
  /** the selected mapped road's stretch under the pointer, if a drag there would rebuild it */
  let grabbing: SourceInterval | null = null;
  /** when a click on the map last left the road unselected (a double click's first click must not stop its
   *  second from adding a bend) */
  let deselectedAt = -Infinity;
  const mappedGrab = (clientX: number, clientY: number): SourceInterval | null => {
    const interval = app.sourceEditor?.interval; if (!interval) return null;
    const g = app.view.pick(clientX, clientY);
    return g && app.sourceEditor!.covers(g.x, g.y, Math.max(6, 8 * app.view.metresPerPixel)) ? { ...interval } : null;
  };
  /** The conversion of the stretch a drag of the selection would rebuild, worked out while the player looks (an idle
   * moment after the selection; ≈ 50–100 ms of fitting the old line: not in the drag's first move). Used once. */
  let prepared: { key: string; index: ProjectTransportIndex; command: Extract<ProjectCommand, { type: 'promote' }> } | null = null;
  let preparing: { key: string; cancel(): void } | null = null;
  const keyOf = (i: SourceInterval) => `${i.transportData}:${i.sourceId}:${i.s0}:${i.s1}`;
  const ids = () => ({ routeId: `route:${crypto.randomUUID()}`, acousticSourceId: `acoustic:${crypto.randomUUID()}` });
  const prepareRebuild = (interval: SourceInterval, lineKind: MappedLineKind) => {
    const key = keyOf(interval);
    if (prepared?.key === key || preparing?.key === key) return;
    preparing?.cancel();
    const run = () => {
      preparing = null;
      const index = app.transportIndex; if (!index) return;
      try { prepared = { key, index, command: lineKind.rebuild(index, interval, ids()) }; } catch { /* (a drag says so) */ }
    };
    const idle = (window as { requestIdleCallback?: (fn: () => void, o: { timeout: number }) => number }).requestIdleCallback;
    if (idle) { const h = idle(run, { timeout: 1000 }); preparing = { key, cancel: () => window.cancelIdleCallback(h) }; }
    else { const h = setTimeout(run, 50); preparing = { key, cancel: () => clearTimeout(h) }; }
  };
  /** a selected crossing: its ring's stretch (its works mostly lie on the same one) */
  const prepareFor = (next: Sel | null) => {
    if (next?.kind !== 'crossing' || !app.last) return;
    const c = app.last.crossings.find(x => x.roadId === next.roadId), p = c && app.crossingDrag.plan(c, 'ring', c);
    if (p?.ok && p.target.kind === 'mapped') prepareRebuild(p.target.interval, p.target.lineKind);
  };
  /** A mapped road's stretch becomes a project road (its line converted to bends that follow the old road), the
   * active one, in a step left open for the drag that follows (ONE undo step, committed when it ends). */
  const rebuild = (interval: SourceInterval, lineKind = app.sourceEditor?.lineKind): boolean => {
    if (!app.transportIndex || !lineKind) return false;
    let command;
    const ready = prepared?.key === keyOf(interval) && prepared.index === app.transportIndex ? prepared.command : null;
    prepared = null;
    try { command = ready ?? lineKind.rebuild(app.transportIndex, interval, ids()); }
    catch (error) { console.warn('This road could not be rebuilt', error); toast('This road cannot be changed here.'); return false; }
    const id = command.routes[0].id;
    app.intro.hide(); app.sourceEditor?.clear();
    if (app.projectStore.inTransaction) app.projectStore.commit();
    app.projectStore.begin();
    try { app.projectStore.dispatch(command); }
    catch (error) { app.projectStore.cancel(); console.warn('This road could not be rebuilt', error); toast('This road cannot be changed here.'); return false; }
    app.switchRoute(id, true);
    return true;
  };
  /** The first drag of a mapped road: it is rebuilt and the drag bends it, all one undo step. */
  const rebuildByDrag = (interval: SourceInterval, x: number, y: number, lineKind = app.sourceEditor?.lineKind): number | null => {
    if (!rebuild(interval, lineKind)) return null;
    const k = bendByDrag(x, y);
    // (the bend this first drag places, or one of the old line's it takes along, is fitted where its curve has
    // room on release: the drag is the conversion's, not yet the player's own placing of a bend)
    if (app.store.activeRouteId) placedByDrag = { routeId: app.store.activeRouteId, i: k };
    return k;
  };
  /** A drag that starts on the road: on a straight it adds a bend there, which is fitted on release where
   * its curve has room (no curve-room problem from one drag, core/bend-fit.ts); on the curve of a bend, or
   * within an easement's length of it (a new bend there would crowd it), it moves that bend, which keeps its
   * distance from the pointer for the rest of the drag. */
  let grabOffset: { i: number; dx: number; dy: number } | null = null;
  const bendByDrag = (x: number, y: number): number => {
    const d = app.store.design, near = speedNorms(d.speed, d.category).minTransition;
    const on = bendAt(app.A, app.B, d.pis, d.speed, d.category, { x, y }, 15, near);
    if (on !== null) { grabOffset = { i: on, dx: d.pis[on].x - x, dy: d.pis[on].y - y }; app.select({ kind: 'bend', i: on }); return on; }
    grabOffset = null;
    const k = insertBend(x, y, false); app.select({ kind: 'bend', i: k });
    if (app.store.activeRouteId) placedByDrag = { routeId: app.store.activeRouteId, i: k };
    return k;
  };
  /** the new bend a drag placed (also the one a rebuilding drag adds): on release it is fitted where its curve
   * has room (core/bend-fit.ts) */
  let placedByDrag: { routeId: RouteId; i: number } | null = null;
  /** the bend dragged now and the radii set before the drag (core/fit-radii.ts) */
  let dragWanted: { i: number; r: (number | null)[] } | null = null;
  /** the bend the drag holds now (its number after any swap) */
  let held: number | null = null;
  /** A drag of a selected crossing's ring or works (ui/crossing-drag.ts), planned at the press */
  let crossingGrab: Extract<CrossingDragPlan, { ok: true }> | null = null;
  /** the selected crossing's part under this point and what a drag there does (null: none of its parts, or a
   * reroute's new road: that has its own drag) */
  const crossingPlan = (clientX: number, clientY: number): CrossingDragPlan | null => {
    const sel = app.sel;
    if (sel?.kind !== 'crossing' || !app.last || app.buildTool.active) return null;
    const ring = app.crossingAt(clientX, clientY);
    if (ring?.roadId === sel.roadId) return app.crossingDrag.plan(ring, 'ring', ring);
    // a road of the project draws (and is picked as) its own body
    const own = app.last.crossings.find(c => c.roadId === sel.roadId && c.designed);
    if (own) {
      const p = app.crossingDrag.plan(own, 'works', own), hit = app.routeAt(clientX, clientY, 10);
      return p?.ok && p.target.kind === 'route' && hit?.routeId === p.target.routeId ? p : null;
    }
    const w = app.crossingWorksAt(clientX, clientY);
    if (!w || w.crossing.roadId !== sel.roadId || w.link !== undefined) return null;
    return app.crossingDrag.plan(w.crossing, 'works', { x: w.x, y: w.y });
  };
  /** A ring being slid: the crossed road's piece that moves (ui/crossing-drag.ts), our road's line it slides along,
   * the stations of the press and of the crossing on it, and the crossed road's name (the undo step's) */
  let slide: { section: SlideSection; axis: ReturnType<typeof slideAxis>; press: number; at: number; name: string } | null = null;
  const dragCrossing = (p: Extract<CrossingDragPlan, { ok: true }>, x: number, y: number): number | null => {
    const c = p.crossing;
    app.intro.hide();
    if (p.part === 'works') {
      if (p.target.kind === 'mapped') return rebuildByDrag(p.target.interval, x, y, p.target.lineKind);
      if (!app.switchRoute(p.target.routeId) || !app.store.read()) return null;
      return bendByDrag(x, y);
    }
    const axis = app.last ? slideAxis(app.last, c.s) : null;
    if (!axis || axis.s.length < 2) return null;
    if (p.target.kind === 'mapped') { if (!rebuild(p.target.interval, p.target.lineKind)) return null; }
    else if (!app.switchRoute(p.target.routeId) || !app.store.read()) return null;
    const d = app.store.design, section = slideSection(app.A, app.B, d.pis, d.speed, d.category, c);
    // (the bends the slide puts in are in the step it leaves open)
    app.store.update(draft => { draft.pis = section.pis.map(q => ({ ...q })); }, false);
    grabOffset = null; placedByDrag = null;
    slide = { section, axis, press: axisStation(axis, { x, y }), at: axisStation(axis, c), name: p.name };
    app.select({ kind: 'bend', i: section.held });
    return section.held;
  };
  const insertBend = (x: number, y: number, commit: boolean) => {
    const k = nearestLeg(app.A, app.B, app.store.design.pis, { x, y });
    app.store.update((d) => { d.pis.splice(k, 0, { x, y, r: null }); }, commit);
    return k;
  };
  const events: ViewEvents = {
    onPickTerrain: (_x, _y, clientX, clientY) => {
      app.intro.hide();
      if (app.buildTool.active) { app.buildTool.place(app.placeAt(clientX, clientY, _x, _y)); return; }
      const t = app.thingAt(clientX, clientY);
      // First click on a base road before the graph is parsed: parse it, then pick the road at the
      // clicked ground point (wherever the camera is by then), unless something else was selected meanwhile.
      const ground = !t && !app.transportGraph && app.pack.transportMeta ? app.view.pick(clientX, clientY) : null;
      if (t?.kind === 'route-hit') { if (app.switchRoute(t.routeId) && app.store.read()) app.selectPiece(t.s); }
      else if (t?.kind === 'source') app.showSource(t.hit);
      else if (!t && app.legacyRoadAt(_x, _y)) app.showNoLinks();
      else if (t) app.select(t);
      else { if (app.roadSelected) deselectedAt = performance.now(); app.deselect(); }
      if (ground) {
        const generation = app.selectGeneration;
        void app.ensureTransport().then(() => {
          if (generation !== app.selectGeneration) return;
          const p = app.view.project(ground.x, ground.y, app.view.drape(ground.x, ground.y)), box = app.canvasBox();
          const late = p.vis ? app.sourceAt(box.left + p.sx, box.top + p.sy) : null;
          if (late?.kind === 'source') app.showSource(late.hit);
        });
      }
    },
    // placing a new line: a click beside the map says so (never nothing at all); else it lets go of what
    // is selected, as one on open ground
    onPickNothing: () => {
      if (app.buildTool.active) { app.buildTool.place({ ok: false, why: 'That is beside the map: click on the map itself.' }); return; }
      if (app.roadSelected) deselectedAt = performance.now();
      app.deselect();
    },
    // (on the selected road only; the first click of the double click, on open ground, may have let go of it)
    onDoublePick: (x, y) => {
      if (app.buildTool.active || !app.store.read() || app.routeAt(app.lastClient.x, app.lastClient.y, 10)) return;
      if (!app.roadSelected && performance.now() - deselectedAt > 800) return;
      app.selectRoad(); app.select({ kind: 'bend', i: insertBend(x, y, true) });
    },
    // a drag from the selected road bends it (a click there still inspects the nearest thing); so does a
    // drag on a selected mapped road's highlighted stretch, which rebuilds that stretch. Any other press
    // (a road not selected, a mapped road whose card is not open) is the map's: a drag moves the map.
    hitRoad: (clientX, clientY) => {
      grabbing = null; crossingGrab = null;
      if (app.buildTool.active) return false;
      // a selected crossing's ring or works: a drag moves where it crosses, or bends the crossed road
      const plan = crossingPlan(clientX, clientY);
      if (plan?.ok) { crossingGrab = plan; return true; }
      if (app.roadSelected && app.roadAt(clientX, clientY, 9) >= 0) return true;
      // a designed road drawn there comes first (a click there picks it, as the hover says)
      if (app.routeAt(clientX, clientY, 10)) return false;
      grabbing = mappedGrab(clientX, clientY);
      return !!grabbing;
    },
    onRoadDrag: (x, y) => {
      if (crossingGrab) { const p = crossingGrab; crossingGrab = null; return dragCrossing(p, x, y); }
      if (grabbing) { const k = rebuildByDrag(grabbing, x, y); grabbing = null; return k; }
      // (let go of between the press and the first move, e.g. Esc: the drag is the map's no more, nor the road's)
      if (!app.store.read() || !app.roadSelected) return null; app.intro.hide(); return bendByDrag(x, y);
    },
    onPiSelect: (i) => { grabOffset = null; placedByDrag = null; held = null; slide = null; app.select(i === null ? null : { kind: 'bend', i }); },
    onPiDrag: (dragged, x, y) => {
      const o = grabOffset?.i === dragged ? grabOffset : null, route = app.store.activeRouteId;
      // a slid ring: the crossed road's piece moves so that it crosses our road as far along it as the pointer moved
      if (slide && dragged === slide.section.held) {
        const sl = slide, target = axisPoint(sl.axis, sl.at + axisStation(sl.axis, { x, y }) - sl.press);
        app.store.update(d => { d.pis = slideTo(sl.section, sl.axis, target); }, false);
        held = dragged;
        return dragged;
      }
      let i = dragged;
      app.store.update((d) => {
        d.pis[i].x = x + (o?.dx ?? 0); d.pis[i].y = y + (o?.dy ?? 0);
        // dragged along the road past a neighbouring bend: the two swap places in order, so that the line never
        // turns back on itself (core/bend-order.ts); what this drag holds by the bend's number goes with it
        const passed = passBends(app.A, app.B, d.pis, i);
        if (passed.i !== i) {
          const from = i; i = passed.i;
          d.pis = [...passed.pis];
          if (o) o.i = i;
          if (placedByDrag?.i === from) placedByDrag.i = i;
          if (dragWanted?.i === from) { const [r] = dragWanted.r.splice(from, 1); dragWanted.r.splice(i, 0, r); dragWanted.i = i; }
          radiusNotes.move(route, from, i);
        }
        // radii set by hand that the drag leaves too large are lowered just enough (and back up as room returns)
        // (an old road's own curve is not set by hand: off the old road it is Auto's, core/project-kept.ts)
        if (dragWanted?.i !== i) dragWanted = { i, r: d.pis.map((p, k) => p.mapped ? null : radiusNotes.wanted(route, k, p.r)) };
        if (!dragWanted.r.some((r, k) => r !== null && Math.abs(k - i) <= 1)) return;
        const fit = fitSetRadii(app.A, app.B, d.pis, i, dragWanted.r, d.speed, d.category);
        for (let k = Math.max(0, i - 1); k <= Math.min(d.pis.length - 1, i + 1); k++) d.pis[k].r = fit.pis[k].r;
        radiusNotes.record(route, i, fit.lowered);
      }, false);
      if (i !== dragged) app.select({ kind: 'bend', i });
      held = i;
      return i;
    },
    onPiDragEnd: () => {
      grabOffset = null; dragWanted = null;
      const slid = slide; slide = null;
      const placed = placedByDrag; placedByDrag = null;
      const i = held; held = null;
      const d = app.store.read(), ends = app.store.route?.endpoints;
      if (placed && d && ends && placed.routeId === app.store.activeRouteId) {
        const fitted = fitPlacedBend(ends.a.position, ends.b.position, d.pis, placed.i, d.category, d.speed);
        if (fitted) app.store.update(draft => { draft.pis = fitted; }, false);
      }
      // a bend the drag left on the line (it, or a neighbour it passed) is no bend, nor a neighbour the road now
      // skips for want of room for its curve: it goes (core/bend-order.ts)
      const now = app.store.read();
      if (i !== null && now) {
        const straight = dropStraightBends(app.A, app.B, now.pis, [i - 1, i, i + 1], { speed: now.speed, category: now.category, dragged: i });
        if (straight.dropped.length) {
          const route = app.store.activeRouteId;
          app.store.update(draft => { draft.pis = straight.pis.map(p => ({ ...p })); }, false);
          for (const k of [...straight.dropped].reverse()) radiusNotes.drop(route, k);
          app.select(straight.dropped.includes(i) ? null : { kind: 'bend', i: i - straight.dropped.filter(k => k < i).length });
        }
      }
      app.store.commit(slid ? CROSSING_DRAG_TEXT.undo(slid.name) : undefined);
    },
    onPiDelete: (i) => app.deletePi(i),
    // a selected crossing's reroute link: dragging it shapes it (adds a bend point there)
    grab: (clientX, clientY) => {
      if (!app.store.read() || app.buildTool.active || app.sel?.kind !== 'crossing') return null;
      const w = app.crossingWorksAt(clientX, clientY);
      return w?.link !== undefined && w.crossing.roadId === app.sel.roadId && app.linkEdit ? app.linkEdit.grab(w) : null;
    },
  };
  return {
    events, mappedGrab, crossingPlan, prepareFor, prepareRebuild,
    /** forget what a hitRoad probe grabbed (automation) */
    releaseGrab: () => { grabbing = null; crossingGrab = null; },
  };
}
