// The line being edited and the lines of the project: switching to another one (its ends, profile, card,
// score), the motorway's directions (the switch's state, joining a stretch again), Build (where a new line's
// end may go, making it), the road list, and what follows every change of the design (the store's
// listener: the map, the cards, the next evaluation). Moved out of main.ts verbatim; the ends of the line
// being edited live in the Session, the kind being built here.
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
import { buildInProject, buildKindOf, registeredBuildKinds, type BuildKind, type EndContext } from './route-kinds';
import { RoadEnds } from './road-ends';
import type { PlacedEnd } from './road-edit';
import { isSlipRoad } from '../core/slip-roads';
import { followSource } from './source-editor';
import type { Anchor, ProjectDesign, RouteDesign, RouteId } from '../core/project';
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
  /** the active road itself selected; nothing selected, the road included; the road's selected look (ui/selection.ts) */
  selectRoad(): void; deselect(): void; showRoadSelected(): void;
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

/** A dragged end keeps to the road it joins while the pointer is this close to it, px (a click while building
 * joins a road within 10 px: an end already on one leaves it only when pulled clearly off). UI choice. */
const END_STICK = 36;
/** The project with a road's end put somewhere else: a junction form chosen for it goes with the road it was on. */
export function moveEnd(design: ProjectDesign, routeId: string, end: 'a' | 'b', placed: PlacedEnd) {
  const route = design.routes.find(r => r.id === routeId); if (!route) return;
  const sameRoad = (p: Anchor, q: Anchor) => p.kind === q.kind && (p.kind === 'route' ? p.routeId === (q as typeof p).routeId
    : p.kind === 'source' ? p.location.sourceId === (q as typeof p).location.sourceId : p.kind !== 'free');
  if (!sameRoad(route.endpoints[end].anchor, placed.anchor) && route.alignment.kind === 'pi' && route.alignment.controls.junctionForms?.[end]) {
    const forms = { ...route.alignment.controls.junctionForms }; delete forms[end];
    route.alignment.controls.junctionForms = forms;
  }
  // a slip road's end moved along its motorway takes the bend next to it along (the bend that leads it off the
  // carriageway, else left behind on the motorway's side)
  const was = route.endpoints[end], motorway = (a: Anchor) => a.kind === 'route' && design.routes.find(r => r.id === a.routeId)?.kind === 'motorway';
  if (isSlipRoad(route) && motorway(was.anchor) && motorway(placed.anchor) && route.alignment.kind === 'pi' && route.alignment.pis.length) {
    const k = end === 'a' ? 0 : route.alignment.pis.length - 1, p = route.alignment.pis[k];
    route.alignment.pis[k] = { ...p, x: p.x + placed.position.x - was.position.x, y: p.y + placed.position.y - was.position.y };
  }
  route.endpoints[end] = { position: { ...placed.position }, anchor: structuredClone(placed.anchor), binding: 'resolved' };
}

/** Wires the road list, Build and the store's listener, and shows the active line's directions. */
export function createRoutes(app: RoutesContext) {
  const { evals, requestEval, sceneIdle, syncDecorations, activeLegacy, frameLine, showActiveResult } = app.results;
  const { ensure: ensureTransport, legacyRoadAt } = app.links;
  const ends = app.session.ends;
  /** a built road's end handles (ui/road-ends.ts), next to a rebuilt stretch's (ui/stretch-ends.ts) */
  const roadEnds = new RoadEnds(document.getElementById('overlay')!, app.view, {
    place: (route, end, clientX, clientY, held) => placeEnd(route, end, clientX, clientY, held),
    drawnAt: (route, end) => drawnEnd(route, end),
    begin: routeId => { if (app.projectStore.inTransaction) app.projectStore.commit(); dragStart = structuredClone(app.projectStore.snapshot.design.routes.find(r => r.id === routeId) ?? null); app.projectStore.begin(); },
    // (each step from the road as it was when the drag began: a detour leaves nothing behind)
    move: (routeId, end, placed) => { if (app.projectStore.inTransaction && dragStart?.id === routeId) app.projectStore.update(d => {
      const k = d.routes.findIndex(r => r.id === routeId); if (k < 0) return;
      d.routes[k] = { ...structuredClone(dragStart!), revision: d.routes[k].revision }; moveEnd(d, routeId, end, placed); }); },
    finish: keep => { if (!app.projectStore.inTransaction) return; if (keep) app.projectStore.commit(); else app.projectStore.cancel(); },
    refuse: why => toast(`${why}: the end stays where it was.`),
  });
  /** the road whose end is dragged, as it was when the drag began */
  let dragStart: RouteDesign | null = null;
  const syncEnds = () => { app.links.syncEnds(); roadEnds.sync(app.store.route); };
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
    // (a house's card goes with the road it was opened on: carried over, it would switch back to that road)
    if (app.store.activeRouteId !== shown && app.session.qualifiedSelection?.kind === 'building') app.session.qualifiedSelection = null;
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
  // Undo / redo: the selection is by index or station, which a step may give to something else, so it is
  // cleared; when the step left the selected thing itself in place (a bend where it was, the same line under
  // a stretch: the step changed a radius, a structure, a wall) it is selected again, its card still open.
  app.store.onHistory = () => {
    const sel = app.session.sel, route = app.store.activeRouteId, before = sel && app.store.read() ? app.store.design : null;
    app.select(null); historyStep = true;
    if (!sel || !before) return;
    return () => {
      if (app.store.activeRouteId !== route || !app.store.read()) return;
      const d = app.store.design, same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
      const at = (p?: { x: number; y: number }) => p && [p.x, p.y];
      const still = sel.kind === 'bend' ? !!d.pis[sel.i] && same(at(d.pis[sel.i]), at(before.pis[sel.i]))
        : sel.kind === 'stretch' ? same([d.pis, d.speed, d.category], [before.pis, before.speed, before.category])
          : sel.kind === 'pin' ? !!d.gradePins?.some(p => Math.abs(p.s - sel.s) < 0.1)
            : sel.kind === 'vpi' ? d.profileMode === 'manual' && !!d.vpis[sel.i] && d.vpis[sel.i].s === before.vpis[sel.i]?.s
              : true; // a crossed road, a house, an end: named by what they are
      if (still) app.select(sel);
    };
  };
  app.buildTool.onClose = () => app.select(null);
  app.buildTool.refuse = (a, b) => building.refuse?.(a, b) ?? null;
  app.buildTool.onDone = (a, b) => {
    if (app.projectStore.inTransaction) app.projectStore.commit();
    let made: ReturnType<typeof buildInProject>;
    try {
      made = buildInProject(building, app.projectStore.snapshot.design, a, b, prefix => `${prefix}:${crypto.randomUUID()}`);
      const next = made.project;
      app.store.editProject(d => { for (const key of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[key]; Object.assign(d, next); });
    } catch (error) { console.warn('New road was not created', error); toast('This road could not be made here.'); return; }
    switchRoute(made.activeRouteId); app.select(null); app.selectRoad();
    toast(`Drag the ${building.kind === 'road' ? 'road' : building.kind} to bend it.`);
  };
  /** the kind being built (Build menu), which decides where its ends may go */
  let building: BuildKind = registeredBuildKinds()[0];
  app.routeBar.onBuild = (kind, label) => {
    const k = registeredBuildKinds().find(b => b.kind === kind && b.label === label); if (!k) return;
    building = k; app.deselect(); app.buildTool.begin(k.label, k.hint); app.hud.revealContext('inspector');
    if (app.pack.transportMeta) void ensureTransport(); // ends may join mapped lines
  };
  /** where an end goes next to another line: the point, the project, where a motorway's directions go */
  const endContext = (x: number, y: number, line: RouteDesign): EndContext => ({ at: { x, y }, design: app.projectStore.snapshot.design, ...(app.links.index ? { base: app.links.index } : {}),
    towards: line.role === 'mission' ? { forward: placeName(app.scenario.labels.b), reverse: placeName(app.scenario.labels.a) } : { forward: 'its end', reverse: 'its start' } });
  /** where a click while building puts a road end: on a road (joins it), else free ground */
  const placeAt = (clientX: number, clientY: number, x: number, y: number): Placement => placeFor(building, clientX, clientY, x, y);
  /** where an end of a line of this kind goes with the pointer there (`exclude`: the line itself, whose end is dragged) */
  const placeFor = (building: BuildKind, clientX: number, clientY: number, x: number, y: number, exclude?: RouteId): Placement => {
    // A railway or motorway joins only lines of its own kind: a road picked near the click (at an overview, one
    // is near every click) is not where it ends; it ends on the ground there (roads are crossed, not joined).
    const joins = (kind: string | undefined) => building.kind === 'road' || kind === building.kind;
    const hit = app.routeAt(clientX, clientY, 10, exclude), rr = hit && app.session.projectFull?.routes[hit.routeId];
    const route = hit && app.projectStore.snapshot.design.routes.find(r => r.id === hit.routeId);
    if (hit && rr && route && joins(route.kind)) return building.onRoute(route, rr, hit.s, endContext(x, y, route));
    // on a road's carriageway or earthworks beside its centreline: that road, never "open ground"
    const under = footprintHit(Object.values(app.session.projectFull?.routes ?? {}).flatMap(r => {
      if (r.routeId === exclude) return [];
      const legacy = r.routeId === app.store.activeRouteId && app.session.last ? app.session.last : r.legacy;
      return legacy ? [{ id: r.routeId, result: legacy }] : [];
    }), x, y);
    const underRoute = under && app.projectStore.snapshot.design.routes.find(r => r.id === under.routeId), ur = under && app.session.projectFull?.routes[under.routeId];
    if (under && underRoute && ur && joins(underRoute.kind)) return building.onRoute(underRoute, ur, under.s, endContext(x, y, underRoute));
    const source = app.sourceAt(clientX, clientY);
    if (source?.kind === 'route-hit' && joins(app.projectStore.snapshot.design.routes.find(r => r.id === source.routeId)?.kind)) return { ok: false, why: 'This stretch is being rebuilt: join the new road instead.' };
    if (source?.kind === 'source' && app.links.index && joins(app.links.index.source(source.hit.sourceId)?.kind)) return building.onSource(app.links.index, source.hit.sourceId, source.hit.s, { design: app.projectStore.snapshot.design, ...(exclude ? { exclude } : {}) });
    if (app.pack.terrain.isOob(x, y)) return { ok: false, why: 'Put the end on the map.' };
    if (building.kind === 'road' && legacyRoadAt(x, y)) return { ok: false, why: 'This map’s road links are missing, so a new road cannot join its roads yet. Join our road, or end on open ground.' };
    return { ok: true, label: `open ground (joins no ${building.kind === 'railway' ? 'railway' : 'road'})`, end: { position: { x, y, z: app.pack.terrain.heightAt(x, y) }, anchor: { kind: 'free' } } };
  };
  /** A built road's end dragged to the pointer: it keeps to the road it joined when the drag began (`held`) while the
   * pointer is within END_STICK px of it (along it, as far as that road goes), else it goes where a click while
   * building would put it (another road it passes over takes it only within a click's reach). */
  const placeEnd = (route: RouteDesign, end: 'a' | 'b', clientX: number, clientY: number, held: Anchor): Placement | null => {
    const kind = buildKindOf(route);
    const g = app.view.pick(clientX, clientY);
    if (!kind || !g) return null;
    // (the road it was on, and where along it it is now if still on it)
    const now = route.endpoints[end].anchor, same = now.kind === held.kind && (now.kind === 'route' ? now.routeId === (held as typeof now).routeId
      : now.kind === 'source' && now.location.sourceId === (held as typeof now).location.sourceId);
    const anchor = same ? now : held, reach = END_STICK * app.view.metresPerPixel;
    if (anchor.kind === 'route') {
      const host = app.projectStore.snapshot.design.routes.find(r => r.id === anchor.routeId), rr = host && app.session.projectFull?.routes[host.id], r = rr?.legacy;
      if (host && rr && r) {
        let k = 0, best = Infinity;
        for (let i = 0; i < r.n; i++) { const d = Math.hypot(r.x[i] - g.x, r.y[i] - g.y); if (d < best) { best = d; k = i; } }
        if (best <= reach) return kind.onRoute(host, rr, r.s[k], endContext(g.x, g.y, host));
      }
    } else if (anchor.kind === 'source' && app.links.index) {
      const source = app.links.index.source(anchor.location.sourceId);
      if (source) {
        const s = followSource(source, { lo: 0, hi: source.stations[source.stations.length - 1] }, g.x, g.y, anchor.location.s);
        const p = app.links.index.position(source.id, s);
        // (not along a stretch another road rebuilds: that is placed as a click there is)
        const claimed = app.links.claimedSources().some(c => c.sourceId === source.id && s >= c.s0 && s <= c.s1);
        if (p && !claimed && Math.hypot(p.x - g.x, p.y - g.y) <= reach) return kind.onSource(app.links.index, source.id, s, { design: app.projectStore.snapshot.design, exclude: route.id });
      }
    }
    return placeFor(kind, clientX, clientY, g.x, g.y, route.id);
  };
  /** an end as drawn: on another designed road where that road is built now, else where it was placed */
  const drawnEnd = (route: RouteDesign, end: 'a' | 'b') => {
    const e = route.endpoints[end], r = e.anchor.kind === 'route' ? app.session.projectFull?.routes[route.id]?.legacy : undefined;
    if (!r) return { ...e.position };
    const i = end === 'a' ? 0 : r.n - 1;
    return { x: r.x[i], y: r.y[i], z: r.grade[i] };
  };
  // a road chosen in the list comes into view when none of it is on screen
  app.routeBar.onSelect = id => {
    if (!switchRoute(id)) return;
    app.selectRoad();
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

  // the snapshot each change starts from: the score's change line compares with its full result
  const stepOf = () => `${app.projectStore.snapshot.epoch}:${app.projectStore.snapshot.revision}`;
  let stepBefore = stepOf();
  app.store.on((d, committed) => {
    if (committed) evals.endGesture();
    hideToast(); app.hud.noteEdit(committed, stepBefore); stepBefore = stepOf();
    if (committed) {
      const ids = separateStretches();
      if (!historyStep && !app.store.oneDirection && [...stretchIds].some(id => !ids.has(id))) toast(DIRECTIONS_TEXT.togetherAgain, 'Undo', () => app.store.undo());
      stretchIds = ids; historyStep = false;
    }
    frameEnds(); frameLine(lineFrame.length, true, d);
    app.session.sel = activeSelection(app.store.activeRouteId, app.session.qualifiedSelection);
    app.showRoadSelected(); // (an undo may have removed the selected road: the one now active is not selected)
    if (d) {
      if (app.session.sel?.kind === 'bend' && app.session.sel.i >= d.pis.length) app.select(null);
      app.view.setDesign(d, app.selectedPi(), app.activeEndpoints()); app.hud.setDesign(d);
      app.profile.selectBend(app.selectedPi()); app.curveEdit.refresh(); app.linkEdit?.refresh(); app.works?.refresh();
    } else { app.view.clearDesign(app.activeEndpoints()); app.profile.clear(); if (!app.links.editor?.selected) app.routeCard(); app.curveEdit.hide(); }
    app.editBar.set(app.projectStore.canUndo(), app.projectStore.canRedo());
    app.routeBar.set(app.projectStore.snapshot.design, app.store.activeRouteId, app.projectStore.inTransaction);
    syncEnds();
    syncDirections();
    // a borrowed card (a proposal's) may belong to a road undo just removed: restore the right card
    if (committed && app.inspector.isHosting && !app.links.editor?.selected) { if (d) app.inspector.set(app.session.sel); else app.routeCard(); }
    requestEval(!committed);
  });
  return { switchRoute, placeAt, bendLabel, joinStretch, directionsState };
}
