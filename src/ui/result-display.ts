// What happens with the workers' results: a drag preview updates the cheap things (the moved centreline,
// the profile, the "≈" price); a full result rebuilds the 3D scene in slices between frames, then the
// cards, the decorations of the other roads and the score. Also when the game counts as settled / idle, and
// the provisional profile shown while the worker lags behind a drag. Moved out of main.ts verbatim; what
// is asked of the workers and which replies count is the EvalClient's (eval-client.ts).
import { CATEGORIES, lineOf, pairedName } from '../core/data/categories';
import type { ScenarioParams } from '../core/data/scenario';
import type { Design, Result } from '../core/evaluate';
import type { ProjectResult, RouteId, RouteResult } from '../core/project';
import { carriagewayCategory, corridorOfRoute } from '../core/project-motorway';
import type { ProjectWorkerOut } from '../core/project-protocol';
import { motorwayCategory, routeCrownWidth } from '../core/route-section';
import { DIRECTIONS_TEXT } from '../core/terms';
import { EvalClient, type EvalRequest } from '../eval-client';
import type { ProjectStore } from '../project-store';
import type { BuildAnnotations } from '../render/build-tools';
import { RouteExtras } from '../render/extras';
import type { NoiseLayer } from '../render/noise';
import type { RouteScene } from '../render/route-scene';
import { runSliced, type SlicedJob, type Staged } from '../render/slices';
import type { RenderEndpoints, View } from '../render/view';
import { isSlipRoad, laneOf, SLIP_ROAD } from '../core/slip-roads';
import { mergeSlipRoads } from '../render/slip-merge';
import type { Pack } from '../scenario';
import type { Session } from '../session';
import type { ActiveRouteStore } from './active-route-store';
import { bendStations } from './bend-stations';
import type { DecisionList } from './build-tools';
import { setLineFrame } from './chainage';
import type { CrossingHighlight } from './crossing-highlight';
import type { CurveEditor } from './curve-edit';
import type { DirectionsState, Hud } from './hud';
import type { buildingInfo, Inspector } from './inspector';
import type { LinkEditor } from './link-edit';
import type { ProfilePanel } from './profile';
import { provisionalProfile } from './provisional';
import type { RoadLinks } from './road-links';

export interface ResultDisplayContext {
  readonly session: Session;
  readonly store: ActiveRouteStore; readonly projectStore: ProjectStore; readonly pack: Pack; readonly scenario: ScenarioParams;
  readonly worker: Worker; readonly previewWorker: Worker;
  readonly view: View; readonly profile: ProfilePanel; readonly hud: Hud; readonly inspector: Inspector; readonly decisions: DecisionList;
  readonly extras: RouteExtras; readonly routeScene: RouteScene; readonly noise: NoiseLayer; readonly annotations: BuildAnnotations;
  readonly links: RoadLinks;
  /** the ends the active line is edited between */
  readonly A: { x: number; y: number }; readonly B: { x: number; y: number };
  /** made after this (they read results): the radius grips, the reroute editor, a crossing's works */
  readonly curveEdit: CurveEditor; readonly linkEdit: LinkEditor | undefined; readonly works: CrossingHighlight | undefined;
  /** main-thread ms per consumer of the last handled result (drag-perf probe) */
  readonly handlerTiming: Record<string, number>;
  setStatus(text: string): void;
  /** the score in the HUD; `pending`: a result is still awaited */
  projectScore(pending: boolean): void;
  ensureTransport(): Promise<void>;
  revalidate(r: Result, d: Design): void;
  routeCard(): void;
  activeEndpoints(): RenderEndpoints & { a: { label: string }; b: { label: string } };
  endInfo(end: 'a' | 'b'): NonNullable<ScenarioParams['ends']>['a'] | undefined;
  binfo(j: number): ReturnType<typeof buildingInfo>;
  directionsState(): DirectionsState | null;
  /** a full result is on screen, its scene committed (the twists are checked here, never on a drag preview) */
  afterFull?(result: ProjectResult): void;
}

export type ResultDisplay = ReturnType<typeof createResultDisplay>;

export function createResultDisplay(app: ResultDisplayContext) {
  const otherExtras = new Map<RouteId, { overlay: RouteExtras; result: Result }>();
  let idleWaiters: (() => void)[] = [];
  // While the worker lags behind a drag (an older request is still running), show the moved
  // route's ground with the previous heights at once, at most once per frame. Display only.
  let previewFrame = 0;
  const schedulePreview = () => {
    if (previewFrame || evals.received >= evals.posted - 1 || !app.session.last) return;
    previewFrame = requestAnimationFrame(() => {
      previewFrame = 0;
      if (evals.received < evals.posted && app.session.last && app.store.read()) app.profile.setPreview(provisionalProfile(app.A, app.B, app.store.design, app.session.last, (x, y) => app.pack.terrain.heightAt(x, y)));
    });
  };
  /** the newest request is a full one and its result is in (the 3D rebuild may still run) */
  const settled = () => evals.settled;
  /** …and its 3D scene is up (whenIdle) */
  const sceneIdle = () => settled() && !heavy;
  /** the full result's 3D rebuild, run in slices between frames (see render/slices.ts) */
  let heavy: SlicedJob | null = null;
  let heavyStats = { slices: 0, busy: 0, maxSlice: 0, wall: 0, commit: 0, commitView: 0, commitCrossings: 0, overlays: 0 };
  // What is asked of the workers and which replies count: eval-client.ts. Here: what to do with them.
  const evals: EvalClient = new EvalClient(app.worker, app.previewWorker, {
    snapshot: () => app.projectStore.snapshot, design: () => app.store.read(), activeRouteId: () => app.store.activeRouteId,
    previewPrices: () => ({ materialValue: app.session.lastFull?.quantities.materialValue, structureValue: app.session.lastFull?.quantities.structureValue }),
    displayed: () => app.session.displayedProject && { epoch: app.session.displayedProject.epoch, revision: app.session.displayedProject.revision },
    willPost: () => {
      heavy?.cancel(); heavy = null; // a rebuild for an older design would only be thrown away
      app.hud.setProfileBusy(true);
    },
    didPost: () => { app.projectScore(true); schedulePreview(); },
    error: message => { console.error('worker error', message); app.setStatus('This design could not be computed. Undo the last change.'); settle(); },
    band: m => {
      const r = app.session.projectFull?.routes[m.routeId]?.legacy;
      if (r && app.session.projectFull!.epoch === m.identity.epoch && app.session.projectFull!.revision === m.identity.revision
        && m.routeId === app.store.activeRouteId) app.noise.setBand(r, m.footprint);
    },
    preview: (m, request) => showPreview(m, request),
    full: m => showFull(m),
  });
  const requestEval = (preview = false) => evals.request(preview);
  const settle = () => {
    // the worker caught up with the newest request: no stretched provisional profile any more
    if (evals.received === evals.posted) app.profile.setPreview(null);
    if (!settled()) return;
    app.hud.setProfileBusy(false);
    if (!sceneIdle()) return;
    const w = idleWaiters; idleWaiters = []; w.forEach((f) => f());
    if (!transportPrefetched && app.pack.transportMeta) {
      // After the first settled scene, in idle time: download + verify the graph bytes only.
      transportPrefetched = true;
      const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200));
      idle(() => { app.pack.prefetchTransport().catch(error => console.warn('Road map links are unavailable', error)); });
    }
  };
  let transportPrefetched = false;

  const syncDecorations = (result: ProjectResult) => {
    app.view.setProposals(app.projectStore.snapshot.design.routes.flatMap(route => {
      const rr = result.routes[route.id];
      return rr && !rr.legacy && rr.surface ? [{ id: route.id, key: rr.engineeringRevision, active: route.id === app.store.activeRouteId, points: rr.surface.points }] : [];
    }));
    for (const [id, entry] of otherExtras) if (!result.routes[id]?.legacy) { entry.overlay.dispose(); otherExtras.delete(id); }
    const design = app.projectStore.snapshot.design;
    for (const route of design.routes) {
      const r = drawnAs(result.routes[route.id]?.legacy);
      let crown = routeCrownWidth(route);
      const splitDirection = route.kind === 'motorway' && route.alignment.kind === 'pi';
      // a paired motorway is one body, drawn once under its forward direction: its walls and culverts too
      const paired = route.kind === 'motorway' && route.alignment.kind === 'corridor' ? corridorOfRoute(design, route.id) : undefined;
      if (paired && route.kind === 'motorway') crown = CATEGORIES[motorwayCategory(route)].crownWidth;
      if (!r || (paired && (paired.mode !== 'paired' || paired.children.forward !== route.id))
        || (route.kind !== 'road' && route.kind !== 'railway' && !splitDirection && !paired)) { otherExtras.get(route.id)?.overlay.setVisible(false); continue; }
      const controls = route.alignment.kind === 'corridor' ? {} : route.alignment.controls;
      const entry = otherExtras.get(route.id);
      const active = route.id === app.store.activeRouteId || (!!paired && paired.children.reverse === app.store.activeRouteId);
      if (active) { entry?.overlay.setVisible(false); continue; }
      if (entry) { entry.overlay.setVisible(true); if (entry.result !== r) { entry.overlay.setResult(r, crown, controls.structureOverrides, controls.wallOverrides); entry.result = r; } }
      else { const overlay = new RouteExtras(app.view); overlay.setResult(r, crown, controls.structureOverrides, controls.wallOverrides); otherExtras.set(route.id, { overlay, result: r }); }
    }
    const r = app.store.activeRouteId ? activeLegacy(result.routes[app.store.activeRouteId]) : undefined, d = app.store.read();
    if (r && d) {
      const crown = CATEGORIES[d.category].crownWidth; app.extras.setResult(drawnAs(r)!, crown, d.structureOverrides, d.wallOverrides);
      app.noise.setResult(r, crown); app.annotations.setResult(r, d);
    } else { app.extras.reset(); app.annotations.clear(); }
  };

  /** the result the active design was evaluated as: a motorway with separate stretches edited as one
   * road shows its shared line; one direction, that direction composed */
  const activeLegacy = (rr: RouteResult | undefined) => rr?.shared && !app.store.oneDirection ? rr.shared : rr?.legacy;
  /** A motorway edited as one line while its directions run apart somewhere: there the profile shows each
   * direction's own heights (composed on the same stations), not the shared line's. */
  const syncApart = (shown: Result) => {
    const design = app.projectStore.snapshot.design, corridor = app.store.route && corridorOfRoute(design, app.store.route.id);
    const fr = corridor && app.session.projectFull?.routes[corridor.children.forward], f = fr?.legacy, r = corridor && app.session.projectFull?.routes[corridor.children.reverse]?.legacy;
    const state = app.directionsState();
    if (!corridor || app.store.oneDirection || !fr?.apart?.length || !f || !r || !state || f.n !== shown.n || r.n !== shown.n) { app.profile.setApart([]); return; }
    app.profile.setApart(fr.apart.map(a => ({ ...a, lines: [
      { label: DIRECTIONS_TEXT.towards(state.places.forward), grade: f.grade, kind: f.kind },
      { label: DIRECTIONS_TEXT.towards(state.places.reverse), grade: r.grade, kind: r.kind }] })));
  };
  /** the motorway's direction towards A, edited on its own, reads from its own start (B): ui/chainage.ts */
  const readsBackwards = () => app.store.oneDirection && !!app.store.route
    && app.projectStore.snapshot.design.corridors.some(c => c.mode === 'paired' && c.children.reverse === app.store.route!.id);
  /** the frame the active line is read in (ui/chainage.ts); its bends are the shown design's */
  const frameLine = (length: number, shown: boolean, design = app.store.read()) =>
    setLineFrame(length, shown && readsBackwards(), design?.pis.length ?? 0);
  app.view.bendsReversed = readsBackwards;
  const showActiveResult = () => {
    const rd = app.store.read(), r = app.store.activeRouteId ? activeLegacy(app.session.projectFull?.routes[app.store.activeRouteId]) : undefined;
    frameLine(r?.length ?? 0, !!r);
    app.session.last = app.session.lastFull = r ?? null;
    app.hud.setRouteState(!!rd, !!r && !!rd);
    const together = !!app.store.route && !app.store.oneDirection && app.projectStore.snapshot.design.corridors.some(c => c.mode === 'paired' && c.children.forward === app.store.route!.id);
    document.querySelector<HTMLElement>('.profile-bar > b')!.textContent = app.store.route ? `Profile · ${together ? `${app.store.route.kind === 'motorway' ? pairedName(motorwayCategory(app.store.route)) : app.store.route.name}, ${DIRECTIONS_TEXT.both.toLowerCase()}` : app.store.route.name}` : 'Profile';
    if (!r || !rd) {
      app.profile.clear(app.store.route && !app.store.read() ? 'No heights yet: this change is not checked.' : ''); if (!app.links.editor?.selected) app.routeCard();
      app.view.clearDesign(app.activeEndpoints()); return;
    }
    app.revalidate(r, rd);
    const cat = CATEGORIES[rd.category];
    app.profile.setGradeRule({ max: rd.maxGradient ?? cat.maxGradient?.[app.scenario.terrainClass] ?? app.scenario.maxGradient, perMille: cat.mode === 'railway', line: lineOf(cat) });
    app.profile.setResult(r, r.vpis, rd.structureOverrides, rd.profileMode === 'auto' ? rd.gradePins : [], rd.wallOverrides);
    syncApart(r);
    app.profile.setMode(rd.profileMode); document.getElementById('profile')!.classList.toggle('manual', rd.profileMode === 'manual');
    app.profile.setBends(bendStations(r, rd));
    app.decisions.setResult(r, rd, j => app.binfo(j).kind);
    app.inspector.setNetworkPending(!(app.session.projectFull?.complete && app.session.projectFull.acousticScreen.complete));
    const ends = app.activeEndpoints();
    app.inspector.ends = { a: app.endInfo('a'), b: app.endInfo('b'), names: { a: ends.a.label, b: ends.b.label } };
    app.inspector.setResult(r, rd); app.hud.setDesign(rd); app.hud.setResult(r, rd, app.store.best); app.curveEdit.refresh(); app.linkEdit?.refresh(); app.works?.refresh();
  };

  // the noise view's band: asked from the worker for the displayed result when the view needs it
  app.noise.requestBand = () => {
    const full = app.session.projectFull, routeId = app.store.activeRouteId, d = app.store.read();
    if (!full || !routeId || !d) return;
    evals.requestBand({ epoch: full.epoch, revision: full.revision }, routeId, CATEGORIES[d.category].crownWidth);
  };
  /** an accepted drag preview of the active road: the cheap things follow it (centreline, profile, "≈" total) */
  const showPreview = (m: Extract<ProjectWorkerOut, { type: 'project-preview' }>, request: EvalRequest | undefined) => {
    let lap = performance.now();
    const took = (k: string) => { const now = performance.now(); app.handlerTiming[k] = now - lap; lap = now; };
    for (const k in app.handlerTiming) delete app.handlerTiming[k];
    const r = activeLegacy(m.result), rd = request?.design;
    if (r && rd) {
      const shown = r.preview ? r : { ...r, preview: true }; app.session.last = shown;
      frameLine(shown.length, true, rd);
      // a paired motorway is drawn once, under its forward direction; with separate stretches, each
      // drawn part of the moved line (the shared body where both move)
      const corridor = app.projectStore.snapshot.design.corridors.find(c => c.children.reverse === m.routeId || c.children.forward === m.routeId);
      const parts = (m.result.drawn ?? []).filter(p => app.store.oneDirection ? p.direction && corridor?.children[p.direction] === m.routeId : !p.direction)
        .filter(p => app.routeScene.has(p.id));
      if (parts.length) for (const p of parts) app.routeScene.preview(p.id, p.result.preview ? p.result : { ...p.result, preview: true });
      else {
        // the drawn parts changed (a stretch appears, merges or goes): the moved line on what is drawn now
        const drawnNow = corridor ? (app.session.projectFull?.routes[corridor.children.forward]?.drawn ?? []).map(p => p.id) : [];
        const on = [corridor?.mode === 'paired' ? corridor.children.forward : m.routeId, ...drawnNow].find(id => app.routeScene.has(id));
        if (on) app.routeScene.preview(on, shown);
      }
      took('view');
      app.profile.setResult(shown, shown.vpis, rd.structureOverrides, rd.profileMode === 'auto' ? rd.gradePins : [], rd.wallOverrides);
      syncApart(shown);
      app.profile.setMode(rd.profileMode); document.getElementById('profile')!.classList.toggle('manual', rd.profileMode === 'manual');
      app.profile.setBends(bendStations(shown, rd)); took('profile');
      if (m.routeId === app.store.activeRouteId) app.session.activePreviewPrice = shown.cost.total;
      app.hud.setResult(shown, rd, app.store.best); app.projectScore(true); took('hud');
      app.curveEdit.refresh(); took('curveEdit');
    }
    if (evals.received < evals.posted) schedulePreview(); settle();
  };
  /** an accepted full result: the 3D rebuild (sliced), the cards, the score */
  const showFull = (m: Extract<ProjectWorkerOut, { type: 'project-result' }>) => {
    let lap = performance.now();
    const took = (k: string) => { const now = performance.now(); app.handlerTiming[k] = now - lap; lap = now; };
    for (const k in app.handlerTiming) delete app.handlerTiming[k];
    app.session.projectFull = m.result; app.session.activePreviewPrice = null;
    // Accepted rebuilt stretches leave the map: their drawn features follow from the road links here.
    if (!m.result.acceptedRenderReplacements.length && m.result.acceptedReplacements.length && app.links.index) {
      const base = app.links.index;
      m.result.acceptedRenderReplacements = m.result.acceptedReplacements.flatMap(i => { try { return base.renderIntervals(i); } catch { return []; } });
    }
    const result = m.result;
    // complete: one road, or roads core priced together after proving they share no houses or noise
    app.noise.setAvailable(result.complete && result.acousticScreen.complete);
    heavy?.cancel();
    const inputs = app.projectStore.snapshot.design.routes.flatMap(route => {
      const legacy = result.routes[route.id]?.legacy;
      if (!legacy) return [];
      if (route.kind === 'railway') return [{ id: route.id, result: legacy, crownWidth: routeCrownWidth(route) }];
      // A paired motorway is ONE body drawn once (its forward direction carries the shared result).
      if (route.kind === 'motorway') {
        // separate stretches: the shared body's parts and each direction's own carriageway
        const parts = result.routes[route.id]?.drawn;
        if (parts) return parts.map(p => ({ id: p.id, result: p.result, crownWidth: CATEGORIES[p.section === 'paired' ? motorwayCategory(route) : carriagewayCategory(motorwayCategory(route))].crownWidth,
          buildingMarkers: result.complete, ...(p.mirrored ? { mirrored: true } : {}) }));
        // split: each direction is its own body
        if (route.alignment.kind === 'pi') return [{ id: route.id, result: legacy, crownWidth: routeCrownWidth(route) }];
        const corridor = app.projectStore.snapshot.design.corridors.find(c => c.children.forward === route.id);
        return corridor?.mode === 'paired' ? [{ id: route.id, result: legacy, crownWidth: CATEGORIES[motorwayCategory(route)].crownWidth }] : [];
      }
      if (route.kind !== 'road') return [];
      return [{ id: route.id, result: legacy, crownWidth: routeCrownWidth(route) }];
    });
    mergeSlips(inputs);
    const started = performance.now(), stats = { slices: 0, busy: 0, maxSlice: 0 };
    heavy = runSliced((function* () {
      let geometry: Staged | undefined, sources: Staged | undefined, handedOver = false;
      try {
        geometry = yield* app.routeScene.build(inputs, [...result.buildings.filter(b => b.action !== 'retain').map(b => b.buildingIndex),
          ...result.works.items.flatMap(w => w.removes ?? [])]);
        const graph = app.links.graph;
        // A project with rebuilt mapped roads (e.g. after undo/reload) whose graph is not parsed yet.
        if (!graph && result.acceptedRenderReplacements.length) void app.ensureTransport().then(() => { if (app.links.graph) requestEval(false); });
        if (graph) sources = yield* app.view.buildSourceReplacements(graph, result.acceptedRenderReplacements);
        handedOver = true; return [geometry, sources] as const;
      } finally { if (!handedOver) { sources?.dispose(); geometry?.dispose(); } }
    })(), ([geometry, sources]) => {
      const t0 = performance.now(); geometry.commit(); const t1 = performance.now(); sources?.commit(); const t2 = performance.now();
      app.links.picker?.setAccepted(result.acceptedRenderReplacements);
      // a slip road's speed-change lane: its lines on the motorway (the dashed one first, then its taper's edge), and
      // the paving it adds beyond the hard shoulder (its middle, each point's half width)
      app.view.setLaneMarks(result.works.items.filter(w => w.id.includes(':lane:')).flatMap(w => w.surfaces.map((q, k) => k === 2
        ? { points: q.points, dashed: false, width: 0, paving: q.points.map(p => p.halfWidth) }
        : { points: q.points, dashed: k === 0, width: SLIP_ROAD.marking.width })));
      syncDecorations(result);
      app.session.displayedProject = result; heavy = null;
      app.projectStore.offerBest(result); app.projectScore(false);
      const t3 = performance.now();
      heavyStats = { ...stats, wall: t3 - started, commit: t3 - t0, commitView: t1 - t0, commitCrossings: t2 - t1, overlays: t3 - t2 };
      app.afterFull?.(result);
      settle();
    }, error => {
      console.error('3D rebuild failed', error); app.setStatus('The 3D view could not be updated.');
      heavy = null; evals.forgetLastPost(); settle();
    }, 8, stats, ([geometry, sources]) => { sources?.dispose(); geometry.dispose(); }); took('view');
    showActiveResult(); took('profile'); app.projectScore(true); took('hud');
    app.setStatus(''); settle();
  };

  /** Slip roads beside their motorway drawn as one body of earthworks (render/slip-merge.ts): the drawn copies, kept
   * while the results are the same (an unchanged body keeps its meshes). */
  let merged: { key: Result[]; out: Result[] } | null = null;
  /** a motorway's result as its body is drawn beside its slip roads (its walls stand where that body's edge is) */
  function drawnAs(r: Result | undefined) { return r && merged && merged.key[0] === r ? merged.out[0] : r; }
  const mergeSlips = (inputs: { id: string; result: Result }[]) => {
    const design = app.projectStore.snapshot.design;
    for (const c of design.corridors) {
      const host = inputs.find(i => i.id === c.children.forward), hostRoute = design.routes.find(q => q.id === c.children.forward);
      const slips = inputs.filter(i => { const r = design.routes.find(q => q.id === i.id);
        return !!r && isSlipRoad(r) && [r.endpoints.a.anchor, r.endpoints.b.anchor].some(a => a.kind === 'route' && (a.routeId === c.children.forward || a.routeId === c.children.reverse)); });
      if (!host || !slips.length || c.mode !== 'paired' || hostRoute?.kind !== 'motorway') continue;
      const key = [host.result, ...slips.map(s => s.result)];
      if (!merged || merged.key.length !== key.length || merged.key.some((r, k) => r !== key[k])) {
        // (each slip road's speed-change lane, as the evaluator builds it: its formation drawn wider on its side)
        const paired = { category: motorwayCategory(hostRoute), speed: hostRoute.specification.designSpeed };
        const lanes = slips.flatMap(sl => { const r = design.routes.find(q => q.id === sl.id)!;
          return (['a', 'b'] as const).flatMap(end => { const a = r.endpoints[end].anchor;
            if (a.kind !== 'route' || (a.routeId !== c.children.forward && a.routeId !== c.children.reverse)) return [];
            const speed = r.specification.kind === 'road' ? r.specification.designSpeed : 50;
            return [laneOf(sl.result, end, host.result, a.routeId === c.children.forward ? 1 : -1, speed, 'hilly', paired).lane]; }); });
        const m = mergeSlipRoads(host.result, slips.map(s => s.result), (x, y) => app.pack.terrain.heightAt(x, y), paired.category, lanes);
        merged = { key, out: [m.motorway, ...m.slips] };
      }
      host.result = merged.out[0]; slips.forEach((s, k) => { s.result = merged!.out[k + 1]; });
    }
  };
  return {
    evals, requestEval, settled, sceneIdle, syncDecorations, activeLegacy, frameLine, showActiveResult,
    /** the last full result's sliced 3D rebuild (drag-perf probe); who waits for the idle scene (automation) */
    get heavyStats() { return heavyStats; }, get idleWaiters() { return idleWaiters; },
  };
}
