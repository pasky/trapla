// The selection: one thing at a time (a stretch or piece, a bend, a pinned height, a height point, a crossed
// road, a house, an end), shown in the inspector, on the map and in the profile. select() is the one place
// that sets it everywhere; placeOf() says where a selection is; frameSelection() brings it into view.
// Moved out of main.ts verbatim; the selection itself lives in the Session.
import type { Design, Result } from '../core/evaluate';
import type { RouteId } from '../core/project';
import type { ProjectStore } from '../project-store';
import type { BuildAnnotations } from '../render/build-tools';
import type { RouteExtras } from '../render/extras';
import type { RenderEndpoints, View } from '../render/view';
import type { Pack } from '../scenario';
import type { Session } from '../session';
import type { ActiveRouteStore } from './active-route-store';
import { bendStations } from './bend-stations';
import type { BuildRoadTool } from './build-road';
import type { CrossingHighlight } from './crossing-highlight';
import type { CurveEditor } from './curve-edit';
import type { Hud } from './hud';
import { culvertAt, railCrossingAt, type Inspector, type Sel } from './inspector';
import type { Intro } from './intro';
import type { LinkEditor } from './link-edit';
import type { MappedRoadCard } from './mapped-road';
import { pieceAt } from './pieces';
import type { ProfilePanel } from './profile';
import { activeSelection, qualifySelection } from './route-selection';
import { stationIndex } from '../core/range';
import { corridorOfRoute } from '../core/project-motorway';

export interface SelectionContext {
  readonly session: Session;
  readonly store: ActiveRouteStore; readonly projectStore: ProjectStore; readonly pack: Pack; readonly view: View;
  readonly profile: ProfilePanel; readonly extras: RouteExtras; readonly hud: Hud; readonly inspector: Inspector;
  readonly annotations: BuildAnnotations; readonly intro: Intro; readonly buildTool: BuildRoadTool;
  /** made after the selection (they read it): the radius grips, the reroute editor, a crossing's works */
  readonly curveEdit: CurveEditor; readonly linkEdit: LinkEditor | undefined; readonly works: CrossingHighlight | undefined;
  /** the mapped-road card, once the road links are loaded */
  readonly sourceEditor: MappedRoadCard | null;
  switchRoute(id: RouteId): boolean;
  activeEndpoints(): RenderEndpoints;
  /** the active route's card when the road widgets cannot edit it */
  routeCard(): void;
  /** our road starts selected (a first-time player: the intro is up) */
  readonly startSelected: boolean;
  /** the road itself was just selected (ui/slip-sweep.ts) */
  onRoadSelected?: () => void;
  /** told after each selection (the map's gestures prepare what a drag of it would rebuild) */
  onSelected?(next: Sel | null): void;
}

/** Selecting these selects the road itself (a drag on it then bends it); anything else (a crossed road, a culvert,
 * a house) leaves it unselected, so a drag that starts on it moves the map. */
const ROAD_KINDS: ReadonlySet<Sel['kind']> = new Set(['stretch', 'bend', 'end', 'pin', 'vpi']);

export function createSelection(app: SelectionContext) {
  const selectedPi = () => (app.session.sel?.kind === 'bend' ? app.session.sel.i : null);
  /** a road as selected: a motorway's two directions are one road */
  const roadKey = (id: RouteId | null) => id && (corridorOfRoute(app.projectStore.snapshot.design, id)?.id ?? id);
  /** the active road is the selected one */
  const roadSelected = () => !!app.store.activeRouteId && app.session.selectedRoad === roadKey(app.store.activeRouteId);
  const setRoadSelected = (on: boolean) => { app.session.selectedRoad = on ? roadKey(app.store.activeRouteId) : null; };
  /** the road's selected look: its bend handles (and a rebuilt stretch's end handles) only while it is selected */
  const showRoadSelected = () => {
    document.getElementById('overlay')?.classList.toggle('road-idle', !roadSelected());
    app.inspector.roadSelected = roadSelected();
  };
  const stationNear = (x: number, y: number) => {
    if (!app.session.last) return 0;
    let bd = Infinity, s = 0;
    for (let k = 0; k < app.session.last.n; k += 2) { const d = (app.session.last.x[k] - x) ** 2 + (app.session.last.y[k] - y) ** 2; if (d < bd) { bd = d; s = app.session.last.s[k]; } }
    return s;
  };
  /** where the selection is: map point and station range */
  const placeOf = (t: Sel): { x: number; y: number; s0: number; s1: number } | null => {
    const r = app.session.last;
    if (!r) return null;
    const at = (s: number) => { const i = stationIndex(r, s); return { x: r.x[i], y: r.y[i] }; };
    switch (t.kind) {
      case 'stretch': return { ...at((t.s0 + t.s1) / 2), s0: t.s0, s1: t.s1 };
      case 'pin': return { ...at(t.s), s0: t.s, s1: t.s };
      case 'vpi': { const v = r.vpis[t.i]; return v ? { ...at(v.s), s0: v.s, s1: v.s } : null; }
      case 'bend': { const p = app.store.design.pis[t.i], b = bendStations(r, app.store.design)[t.i]; return p && b ? { x: p.x, y: p.y, s0: b.s, s1: b.s } : null; }
      case 'crossing': { const c = r.crossings.find((c) => c.roadId === t.roadId); return c ? { x: c.x, y: c.y, s0: c.s, s1: c.s } : null; }
      case 'building': {
        const b = app.pack.overlays.buildings[t.j];
        if (!b) return null;
        const s = stationNear(b[0], b[1]);
        return { x: b[0], y: b[1], s0: s, s1: s };
      }
      case 'end': { const i = t.end === 'a' ? 0 : r.n - 1; return { x: r.x[i], y: r.y[i], s0: r.s[i], s1: r.s[i] }; }
      case 'culvert': { const c = culvertAt(r, t.id, t.s); return c ? { x: c.x, y: c.y, s0: c.s, s1: c.s } : null; }
      case 'rail': { const c = railCrossingAt(r, t.s); return c ? { x: c.x, y: c.y, s0: c.s, s1: c.s } : null; }
    }
  };
  /** select `next` everywhere; `fly`: bring it into view on the map (if off screen) and in the profile */
  let selectGeneration = 0; // a deferred base-road pick yields to any later selection
  /** A single selected place seen from further than this (m per pixel) is too small to make out: framing flies in. */
  const FRAME_MPP = 6;
  const select = (next: Sel | null, fly = false) => {
    selectGeneration++;
    if (app.sourceEditor?.selected) app.sourceEditor.clear();
    if (app.buildTool.active) app.buildTool.cancel(false);
    // a house a road removes (under its works, or bought out by it): its card is that road's, priced or not
    const remover = next?.kind === 'building' ? app.session.projectFull?.buildings.find(b => b.buildingIndex === next.j && b.action !== 'retain')?.routeId : undefined;
    if (remover && remover !== app.store.activeRouteId && app.projectStore.snapshot.design.routes.some(r => r.id === remover)) app.switchRoute(remover);
    // a house belongs to the project: its card shows the road whose noise reaches it most
    else if (next?.kind === 'building' && app.session.projectFull?.complete && Object.keys(app.session.projectFull.routes).length > 1) {
      const contributions = app.session.projectFull.receivers.find(r => r.buildingIndex === next.j)?.contributions ?? [];
      const owner = contributions.reduce<(typeof contributions)[number] | null>((a, c) => (!a || c.dayEnergy > a.dayEnergy ? c : a), null)?.routeId;
      if (owner && owner !== app.store.activeRouteId) app.switchRoute(owner);
    }
    app.session.qualifiedSelection = app.store.activeRouteId ? qualifySelection(app.store.activeRouteId, next) : null;
    app.session.sel = activeSelection(app.store.activeRouteId, app.session.qualifiedSelection);
    if (next) setRoadSelected(ROAD_KINDS.has(next.kind));
    showRoadSelected();
    if (next) app.intro.hide();
    const range = next?.kind === 'stretch' ? { s0: next.s0, s1: next.s1 } : null;
    app.profile.setSelection(range); app.extras.setRange(range); app.hud.setRange(range);
    if (app.store.read()) app.view.setDesign(app.store.design, selectedPi(), app.activeEndpoints());
    else app.view.clearDesign(app.activeEndpoints());
    app.profile.selectBend(selectedPi()); if (app.store.read()) app.curveEdit.refresh();
    app.linkEdit?.refresh(); app.works?.refresh();
    const road = next?.kind === 'crossing' ? next.roadId : null;
    app.profile.selectCrossing(road); app.annotations.selectCrossing(road);
    app.annotations.selectBuilding(next?.kind === 'building' ? next.j : null);
    const culvert = next?.kind === 'culvert' ? next.s : null;
    app.profile.selectCulvert(culvert); app.annotations.selectCulvert(culvert);
    app.profile.selectRail(next?.kind === 'rail' ? next.s : null);
    app.profile.selectStation(next?.kind === 'pin' ? next.s : null);
    app.profile.select(next?.kind === 'vpi' ? next.i : null);
    app.inspector.set(next);
    if (!next && !app.store.read()) app.routeCard();
    if (next) {
      const p = placeOf(next);
      if (p) {
        app.profile.reveal(p.s0, p.s1);
        if (fly) frameSelection(next);
      }
      app.hud.revealContext('inspector');
    }
    app.onSelected?.(next);
  };
  /**
   * Show the player what they picked away from the map (a click in the profile or in a list): fly to it when it
   * is off the screen, seen from low over the horizon (it would sit on the horizon), or too small to make out
   * there (a piece shorter than a sixth of the view, a single place from further than FRAME_MPP m per pixel); a
   * long piece is framed whole. A selection already well in view stays put.
   */
  const frameSelection = (t: Sel) => {
    const p = placeOf(t);
    if (!p) return;
    const box = app.view.renderer.domElement.getBoundingClientRect();
    const q = app.view.project(p.x, p.y, app.pack.terrain.heightAt(p.x, p.y));
    const off = !q.vis || q.sx < 40 || q.sy < 40 || q.sx > box.width - 40 || q.sy > box.height - 40 || app.view.lowView;
    let small = app.view.metresPerPixel > FRAME_MPP;
    const r = app.session.last;
    if (p.s1 - p.s0 > 1 && r) {
      const at = (s: number) => { const i = stationIndex(r, s); return app.view.project(r.x[i], r.y[i], r.grade[i]); };
      const a = at(p.s0), b = at(p.s1);
      small = !a.vis || !b.vis || Math.hypot(a.sx - b.sx, a.sy - b.sy) < Math.min(box.width, box.height) / 6;
    }
    if (off || small) app.view.flyTo(p.x, p.y, Math.max(900, Math.min(6000, (p.s1 - p.s0) * 1.6)));
  };
  const selectPiece = (s: number, fly = false) => {
    if (!app.session.last) return;
    const p = pieceAt(app.session.last, s);
    select({ kind: 'stretch', s0: p.s0, s1: p.s1, piece: p.kind }, fly);
    app.onRoadSelected?.(); // (a click on the map selects the road by its piece)
  };
  /** after a recompute: drop a selection that no longer exists, refresh a piece's kind */
  const revalidate = (r: Result, d: Design) => {
    if (!app.session.sel) return;
    if ((app.session.sel.kind === 'bend' && !d.pis[app.session.sel.i]) || (app.session.sel.kind === 'pin' && !d.gradePins?.some((p) => Math.abs(p.s - (app.session.sel as { s: number }).s) < 0.1))
      || (app.session.sel.kind === 'crossing' && !r.crossings.some((c) => c.roadId === (app.session.sel as { roadId: number }).roadId))
      || (app.session.sel.kind === 'vpi' && (d.profileMode !== 'manual' || app.session.sel.i >= r.vpis.length - 1))
      || (app.session.sel.kind === 'stretch' && app.session.sel.s0 >= r.length)) { select(null); return; }
    // a culvert moves a little with an edit upstream: follow it (the same stream, the nearest one), or let it go
    if (app.session.sel.kind === 'culvert') {
      const c = culvertAt(r, app.session.sel.id, app.session.sel.s);
      if (!c) { select(null); return; }
      if (c.s !== app.session.sel.s) {
        app.session.sel = { kind: 'culvert', id: c.id, s: c.s }; app.inspector.sel = app.session.sel;
        app.session.qualifiedSelection = app.store.activeRouteId ? qualifySelection(app.store.activeRouteId, app.session.sel) : null;
        app.profile.selectCulvert(c.s); app.annotations.selectCulvert(c.s);
      }
    }
    // a railway crossing moves with an edit of our line: follow it (the nearest one), or let it go
    if (app.session.sel.kind === 'rail') {
      const c = railCrossingAt(r, app.session.sel.s);
      if (!c) { select(null); return; }
      if (c.s !== app.session.sel.s) {
        app.session.sel = { kind: 'rail', s: c.s }; app.inspector.sel = app.session.sel;
        app.session.qualifiedSelection = app.store.activeRouteId ? qualifySelection(app.store.activeRouteId, app.session.sel) : null;
        app.profile.selectRail(c.s);
      }
    }
    if (app.session.sel.kind === 'stretch' && app.session.sel.piece) { app.session.sel = { ...app.session.sel, piece: pieceAt(r, (app.session.sel.s0 + app.session.sel.s1) / 2).kind }; app.inspector.sel = app.session.sel; }
  };

  /** Esc, a click on open ground or on another thing: nothing selected, the road included */
  const deselect = () => { setRoadSelected(false); select(null); };
  /** the road itself selected (a pick in the road list, a new road, a press in its profile), with what is
   *  selected on it */
  const selectRoad = () => {
    if (roadSelected()) return;
    const sel = app.session.sel;
    setRoadSelected(true);
    select(sel && ROAD_KINDS.has(sel.kind) ? sel : null);
    app.onRoadSelected?.();
  };
  if (app.startSelected) setRoadSelected(true);
  showRoadSelected();
  return {
    showRoadSelected, get roadSelected() { return roadSelected(); },
    selectedPi, placeOf, select, frameSelection, selectPiece, revalidate, deselect, selectRoad,
    /** counts selections: a deferred pick yields to any later one */
    get generation() { return selectGeneration; },
  };
}
