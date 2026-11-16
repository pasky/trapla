// The line being edited and the lines of the project: switching to another one (its ends, profile, card,
// score), the motorway's directions (the switch's state, joining a stretch again), Build (where a new line's
// end may go, making it), the road list, and what follows every change of the design (the store's
// listener: the map, the cards, the next evaluation). Moved out of main.ts verbatim; the ends of the line
// being edited live in the Session, the kind being built here.
import type { RouteId } from '../core/project';
import { autoFollowingCorridor, corridorOfRoute, rejoinStretch } from '../core/project-motorway';
import type { ScenarioParams } from '../core/data/scenario';
import type { Result } from '../core/evaluate';
import { DIRECTIONS_TEXT, placeName } from '../core/terms';
import type { ProjectStore } from '../project-store';
import type { RouteExtras } from '../render/extras';
import { footprintHit } from '../render/route-pick';
import type { RenderEndpoints, View } from '../render/view';
import type { Pack } from '../scenario';
import type { Session } from '../session';
import type { ActiveRouteStore } from './active-route-store';
import type { BuildRoadTool, Placement } from './build-road';
import { lineFrame } from './chainage';
import type { CrossingHighlight } from './crossing-highlight';
import type { CurveEditor } from './curve-edit';
import type { EditBar } from './editbar';
import type { DirectionsState, Hud } from './hud';
import type { Inspector, Sel } from './inspector';
import type { LinkEditor } from './link-edit';
import type { MapPicks } from './map-picks';
import type { ProfilePanel } from './profile';
import type { ResultDisplay } from './result-display';
import type { RoadLinks } from './road-links';
import type { RouteBar } from './route-bar';
import { buildInProject, registeredBuildKinds, type BuildKind } from './route-kinds';
import { activeSelection, qualifySelection } from './route-selection';
import { hideToast, toast } from './toast';

export interface RoutesContext {
  readonly session: Session;
  readonly store: ActiveRouteStore; readonly projectStore: ProjectStore; readonly pack: Pack; readonly scenario: ScenarioParams;
  readonly view: View; readonly profile: ProfilePanel; readonly hud: Hud; readonly inspector: Inspector; readonly extras: RouteExtras;
  readonly routeBar: RouteBar; readonly editBar: EditBar; readonly buildTool: BuildRoadTool;
  readonly curveEdit: CurveEditor; readonly linkEdit: LinkEditor | undefined; readonly works: CrossingHighlight | undefined;
  readonly links: RoadLinks; readonly results: ResultDisplay;
  select(next: Sel | null, fly?: boolean): void;
  selectedPi(): number | null;
  /** the score in the HUD; `pending`: a result is still awaited */
  projectScore(pending: boolean): void;
  /** the active route as built (else its ends and bends) in view */
  frameRoute(r?: Result | null): void;
  activeEndpoints(): RenderEndpoints;
  /** the active route's card when the road widgets cannot edit it */
  routeCard(): void;
  /** what is under the pointer (made after this: ui/map-picks.ts) */
  routeAt: MapPicks['routeAt']; sourceAt: MapPicks['sourceAt'];
}

/** Wires the road list, Build and the store's listener, and shows the active line's directions. */
export function createRoutes(app: RoutesContext) {
  const { evals, requestEval, sceneIdle, syncDecorations, activeLegacy, frameLine, showActiveResult } = app.results;
  const { ensure: ensureTransport, syncEnds, legacyRoadAt } = app.links;
  const ends = app.session.ends;
  /** the motorway direction switch follows the active route */
  const syncDirections = () => {
    { const r = app.store.activeRouteId ? activeLegacy(app.session.projectFull?.routes[app.store.activeRouteId]) : undefined; frameLine(r?.length ?? 0, !!r); }
    const design = app.projectStore.snapshot.design, route = app.store.route, corridor = route ? corridorOfRoute(design, route.id) : undefined;
    app.inspector.oneDirection = corridor?.mode === 'independent';
    document.getElementById('profile')!.classList.toggle('one-direction', !!corridor && app.store.oneDirection);
    // the legend names the line being edited (a motorway built in a railway mission is a motorway)
    const kind = route?.kind ?? app.scenario.mode ?? 'road';
    document.getElementById('legend-route')!.textContent = kind;
    document.getElementById('legend-height')!.textContent = kind === 'railway' ? 'track height' : 'road height';
    app.profile.setLine(kind); app.hud.setLine(kind);
    // a motorway's ends are its corridor's A and B on the map (its direction towards A reads from B)
    app.profile.setEndLabels(corridor?.mode === 'paired' ? ['A', 'B'] : null);
    if (!corridor) { app.hud.setDirections(null); return; }
    app.hud.setDirections(directionsState());
  };
  /** what a drag of the active line bends (a motorway: both directions, or the chosen one) */
  const bendLabel = () => {
    const state = app.store.route?.kind === 'motorway' ? directionsState() : null;
    return !state || state.split ? 'drag to bend' : state.active === 'both' ? 'drag to bend both directions' : `drag to bend towards ${state.places[state.active]} only`;
  };
  /** both directions on one line again over a stretch where they ran apart */
  const joinStretch = (id: string) => {
    const route = app.store.route, corridor = route ? corridorOfRoute(app.projectStore.snapshot.design, route.id) : undefined;
    if (!corridor || app.projectStore.inTransaction) return;
    app.select(null);
    historyStep = true; // its own toast below
    app.store.editProject(d => { Object.assign(d, rejoinStretch(d, corridor.id, id)); });
    toast(DIRECTIONS_TEXT.joined, 'Undo', () => app.store.undo());
  };
  /** the motorway direction switch's state (HUD and the motorway's own card) */
  const directionsState = (): DirectionsState | null => {
    const design = app.projectStore.snapshot.design, route = app.store.route, corridor = route ? corridorOfRoute(design, route.id) : undefined;
    if (!route || !corridor) return null;
    const split = corridor.mode === 'independent', which = corridor.children.reverse === route.id ? 'reverse' : 'forward';
    const engineered = autoFollowingCorridor(design, corridor);
    const apart = new Set(engineered.mode === 'paired' ? engineered.stretches?.map(t => t.id) : []);
    // the mission's motorway runs between the scenario's places; any other between its own start and end
    return { split, active: split || app.store.oneDirection ? which : 'both',
      places: route.role === 'mission' ? { forward: placeName(app.scenario.labels.b), reverse: placeName(app.scenario.labels.a) } : { forward: 'its end', reverse: 'its start' },
      apart: corridor.mode === 'paired' ? (corridor.stretches ?? []).map(t => ({ id: t.id, s0: t.a, s1: t.b, following: !apart.has(t.id) })) : [] };
  };
  /** the active line's ends; a paired motorway's directions are edited in its shared line's frame (A→B) */
  const frameEnds = () => {
    if (!app.store.route) return;
    ends.a = app.store.route.endpoints.a.position; ends.b = app.store.route.endpoints.b.position;
    const paired = corridorOfRoute(app.projectStore.snapshot.design, app.store.route.id);
    if (paired?.mode === 'paired') { ends.a = paired.endpoints.a.position; ends.b = paired.endpoints.b.position; }
  };
  /** `oneDirection`: a motorway direction alone; absent: unchanged while staying on the same motorway */
  const switchRoute = (id: RouteId, created = false, oneDirection?: boolean) => {
    const design = app.projectStore.snapshot.design, here = app.store.route && corridorOfRoute(design, app.store.route.id);
    const one = oneDirection ?? (!!here && here === corridorOfRoute(design, id) && app.store.oneDirection);
    const shown = app.store.activeRouteId, shownOne = app.store.oneDirection;
    if (!app.store.switchRoute(id, created, one)) return false;
    syncDirections();
    evals.endGesture(); app.session.activePreviewPrice = null;
    frameEnds();
    app.session.sel = activeSelection(id, app.session.qualifiedSelection); app.session.qualifiedSelection = qualifySelection(id, app.session.sel);
    app.view.setHover(null); app.extras.setRange(null);
    // another line: its whole profile. The line the profile already shows (a click on our own road): the
    // profile keeps its zoom, and the selection that follows scrolls it only if the place is out of view
    if (app.store.activeRouteId !== shown || app.store.oneDirection !== shownOne) app.profile.fit();
    showActiveResult();
    if (!app.store.read()) app.curveEdit.hide();
    app.select(app.session.sel);
    if (app.session.projectFull) syncDecorations(app.session.projectFull);
    app.routeBar.set(app.projectStore.snapshot.design, id, app.projectStore.inTransaction);
    syncEnds();
    app.projectScore(!sceneIdle());
    return true;
  };
  /** separate motorway stretches known after the last committed change (a change of both directions next to
   * one joins it: say so) */
  let stretchIds = new Set<string>(), historyStep = false;
  const separateStretches = () => new Set(app.projectStore.snapshot.design.corridors.flatMap(c => c.mode === 'paired' ? (c.stretches ?? []).map(t => t.id) : []));
  stretchIds = separateStretches();
  app.store.onHistory = () => { app.select(null); historyStep = true; };
  app.buildTool.onClose = () => app.select(null);
  app.buildTool.onDone = (a, b) => {
    if (app.projectStore.inTransaction) app.projectStore.commit();
    let made: ReturnType<typeof buildInProject>;
    try {
      made = buildInProject(building, app.projectStore.snapshot.design, a, b, prefix => `${prefix}:${crypto.randomUUID()}`);
      const next = made.project;
      app.store.editProject(d => { for (const key of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[key]; Object.assign(d, next); });
    } catch (error) { console.warn('New road was not created', error); toast('This road could not be made here.'); return; }
    switchRoute(made.activeRouteId); app.select(null);
    toast(`Drag the ${building.kind === 'road' ? 'road' : building.kind} to bend it.`);
  };
  /** the kind being built (Build menu), which decides where its ends may go */
  let building: BuildKind = registeredBuildKinds()[0];
  app.routeBar.onBuild = kind => {
    const k = registeredBuildKinds().find(b => b.kind === kind); if (!k) return;
    building = k; app.select(null); app.buildTool.begin(k.label); app.hud.revealContext('inspector');
    if (app.pack.transportMeta) void ensureTransport(); // ends may join mapped lines
  };
  /** where a click while building puts a road end: on a road (joins it), else free ground */
  const placeAt = (clientX: number, clientY: number, x: number, y: number): Placement => {
    // A railway or motorway joins only lines of its own kind: a road picked near the click (at an overview, one
    // is near every click) is not where it ends; it ends on the ground there (roads are crossed, not joined).
    const joins = (kind: string | undefined) => building.kind === 'road' || kind === building.kind;
    const hit = app.routeAt(clientX, clientY, 10), rr = hit && app.session.projectFull?.routes[hit.routeId];
    const route = hit && app.projectStore.snapshot.design.routes.find(r => r.id === hit.routeId);
    if (hit && rr && route && joins(route.kind)) return building.onRoute(route, rr, hit.s);
    // on a road's carriageway or earthworks beside its centreline: that road, never "open ground"
    const under = footprintHit(Object.values(app.session.projectFull?.routes ?? {}).flatMap(r => {
      const legacy = r.routeId === app.store.activeRouteId && app.session.last ? app.session.last : r.legacy;
      return legacy ? [{ id: r.routeId, result: legacy }] : [];
    }), x, y);
    const underRoute = under && app.projectStore.snapshot.design.routes.find(r => r.id === under.routeId), ur = under && app.session.projectFull?.routes[under.routeId];
    if (under && underRoute && ur && joins(underRoute.kind)) return building.onRoute(underRoute, ur, under.s);
    const source = app.sourceAt(clientX, clientY);
    if (source?.kind === 'route-hit' && joins(app.projectStore.snapshot.design.routes.find(r => r.id === source.routeId)?.kind)) return { ok: false, why: 'This stretch is being rebuilt: join the new road instead.' };
    if (source?.kind === 'source' && app.links.index && joins(app.links.index.source(source.hit.sourceId)?.kind)) return building.onSource(app.links.index, source.hit.sourceId, source.hit.s);
    if (app.pack.terrain.isOob(x, y)) return { ok: false, why: 'Put the end on the map.' };
    if (building.kind === 'road' && legacyRoadAt(x, y)) return { ok: false, why: 'This map’s road links are missing, so a new road cannot join its roads yet. Join our road, or end on open ground.' };
    return { ok: true, label: `open ground (joins no ${building.kind === 'railway' ? 'railway' : 'road'})`, end: { position: { x, y, z: app.pack.terrain.heightAt(x, y) }, anchor: { kind: 'free' } } };
  };
  // a road chosen in the list comes into view when none of it is on screen
  app.routeBar.onSelect = id => {
    if (!switchRoute(id)) return;
    const route = app.store.route, r = app.session.projectFull?.routes[id]?.legacy;
    if (!route) return;
    const a = route.endpoints.a.position, b = route.endpoints.b.position;
    const mid = r ? { x: r.x[r.n >> 1], y: r.y[r.n >> 1] } : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const box = app.view.renderer.domElement.getBoundingClientRect();
    const seen = [a, b, mid].some(p => { const q = app.view.project(p.x, p.y, app.pack.terrain.heightAt(p.x, p.y)); return q.vis && q.sx > 0 && q.sy > 0 && q.sx < box.width && q.sy < box.height; });
    if (!seen) app.frameRoute(r ?? null);
  };
  app.routeBar.set(app.projectStore.snapshot.design, app.store.activeRouteId);
  syncEnds();
  syncDirections();

  app.store.on((d, committed) => {
    if (committed) evals.endGesture();
    hideToast(); app.hud.noteEdit(committed);
    if (committed) {
      const ids = separateStretches();
      if (!historyStep && !app.store.oneDirection && [...stretchIds].some(id => !ids.has(id))) toast(DIRECTIONS_TEXT.togetherAgain, 'Undo', () => app.store.undo());
      stretchIds = ids; historyStep = false;
    }
    frameEnds(); frameLine(lineFrame.length, true, d);
    app.session.sel = activeSelection(app.store.activeRouteId, app.session.qualifiedSelection);
    if (d) {
      if (app.session.sel?.kind === 'bend' && app.session.sel.i >= d.pis.length) app.select(null);
      app.view.setDesign(d, app.selectedPi(), app.activeEndpoints()); app.hud.setDesign(d);
      app.profile.selectBend(app.selectedPi()); app.curveEdit.refresh(); app.linkEdit?.refresh(); app.works?.refresh();
    } else { app.view.clearDesign(app.activeEndpoints()); app.profile.clear(); if (!app.links.editor?.selected) app.routeCard(); app.curveEdit.hide(); }
    app.editBar.set(app.store.undoLabel(), app.store.redoLabel());
    app.routeBar.set(app.projectStore.snapshot.design, app.store.activeRouteId, app.projectStore.inTransaction);
    syncEnds();
    syncDirections();
    // a borrowed card (a proposal's) may belong to a road undo just removed: restore the right card
    if (committed && app.inspector.isHosting && !app.links.editor?.selected) { if (d) app.inspector.set(app.session.sel); else app.routeCard(); }
    requestEval(!committed);
  });
  return { switchRoute, placeAt, bendLabel, joinStretch, directionsState };
}
