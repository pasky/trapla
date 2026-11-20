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
import { bendAt } from './road-edit';
import { toast } from './toast';

export interface MapGestureContext extends Pick<MapPicks, 'canvasBox' | 'routeAt' | 'roadAt' | 'crossingWorksAt' | 'sourceAt' | 'thingAt'> {
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
  ensureTransport(): Promise<void>;
  select(next: Sel | null, fly?: boolean): void;
  selectPiece(s: number, fly?: boolean): void;
  /** nothing selected, the road included; the road itself selected */
  deselect(): void; selectRoad(): void;
  switchRoute(id: RouteId, created?: boolean, oneDirection?: boolean): boolean;
  showSource(hit: SourceHit): void;
  showNoLinks(): void;
  /** the dashed official / planned line's card (ui/route-cards.ts officialCard) */
  showOfficial(): void;
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
  /** The first drag of a mapped road: its stretch becomes a project road (line converted to bends that
   * follow the old road) and the drag bends it, all ONE undo step (committed when the drag ends). */
  const rebuildByDrag = (interval: SourceInterval, x: number, y: number): number | null => {
    const lineKind = app.sourceEditor?.lineKind;
    if (!app.transportIndex || !lineKind) return null;
    let command;
    try { command = lineKind.rebuild(app.transportIndex, interval, { routeId: `route:${crypto.randomUUID()}`, acousticSourceId: `acoustic:${crypto.randomUUID()}` }); }
    catch (error) { console.warn('This road could not be rebuilt', error); toast('This road cannot be changed here.'); return null; }
    const id = command.routes[0].id;
    app.intro.hide(); app.sourceEditor?.clear();
    if (app.projectStore.inTransaction) app.projectStore.commit();
    app.projectStore.begin();
    try { app.projectStore.dispatch(command); }
    catch (error) { app.projectStore.cancel(); console.warn('This road could not be rebuilt', error); toast('This road cannot be changed here.'); return null; }
    app.switchRoute(id, true);
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
      else if (t?.kind === 'official') app.showOfficial();
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
      grabbing = null;
      if (app.buildTool.active) return false;
      if (app.roadSelected && app.roadAt(clientX, clientY, 9) >= 0) return true;
      // a designed road drawn there comes first (a click there picks it, as the hover says)
      if (app.routeAt(clientX, clientY, 10)) return false;
      grabbing = mappedGrab(clientX, clientY);
      return !!grabbing;
    },
    onRoadDrag: (x, y) => {
      if (grabbing) { const k = rebuildByDrag(grabbing, x, y); grabbing = null; return k; }
      // (let go of between the press and the first move, e.g. Esc: the drag is the map's no more, nor the road's)
      if (!app.store.read() || !app.roadSelected) return null; app.intro.hide(); return bendByDrag(x, y);
    },
    onPiSelect: (i) => { grabOffset = null; placedByDrag = null; held = null; app.select(i === null ? null : { kind: 'bend', i }); },
    onPiDrag: (dragged, x, y) => {
      const o = grabOffset?.i === dragged ? grabOffset : null, route = app.store.activeRouteId;
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
      app.store.commit();
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
    events, mappedGrab,
    /** forget what a hitRoad probe grabbed (automation) */
    releaseGrab: () => { grabbing = null; },
  };
}
