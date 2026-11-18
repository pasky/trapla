import './style.css';
import { scenarioParams } from './core/data/scenario';
import { missionProject } from './core/project-mission';
import { RouteExtras } from './render/extras';
import { BuildAnnotations } from './render/build-tools';
import { RouteScene } from './render/route-scene';
import type { SourceHit } from './render/source-pick';
import { CrossingHighlight } from './ui/crossing-highlight';
import { LinkEditor } from './ui/link-edit';
import { RoadNet } from './core/roadnet';
import { BuildRoadTool } from './ui/build-road';
import { registeredBuildKinds } from './ui/route-kinds';
import './ui/mode-kinds'; // Build → Motorway / Railway, rebuilding mapped railways
import { BuildingPicker } from './render/building-pick';
import { registerNet } from './core/project-roadnet';
import { DecisionList } from './ui/build-tools';
import { buildingInfo, Inspector } from './ui/inspector';
import { buildingLevels } from './core/buildings';
import { NoiseLayer } from './render/noise';
import { View } from './render/view';
import { loadPack, packIdentities } from './scenario';
import { startEvalWorkers } from './eval-workers';
import { newSession } from './session';
import { openProjectStore } from './project-store';
import { hasProjectSave } from './project-store-contract';
import { makeLegacyProjectContext } from './core/project-legacy';
import { ActiveRouteStore } from './ui/active-route-store';
import { pickScenario, addScenariosButton } from './ui/scenario-picker';
import { showSaveRecovery } from './ui/save-recovery';
import { StorageGuard, showStorageNotice } from './ui/storage-guard';
import { RouteBar } from './ui/route-bar';
import { CurveEditor } from './ui/curve-edit';
import { Hud } from './ui/hud';
import { noLinksCard, proposalCard, routeHeadCard, type RouteCardDeps } from './ui/route-cards';
import { ProfilePanel } from './ui/profile';
import { ViewBar } from './ui/viewbar';
import { EditBar } from './ui/editbar';
import { installToolbarFit } from './ui/toolbar-fit';
import { createDesignEdits } from './ui/design-edits';
import { createSelection } from './ui/selection';
import { createRoadLinks } from './ui/road-links';
import { createResultDisplay } from './ui/result-display';
import { createRoutes } from './ui/routes';
import { createActiveLine } from './ui/active-line';
import { createProjectScore } from './ui/project-score';
import { installMapWindow } from './ui/map-window';
import { profileEvents } from './ui/profile-events';
import { createMapGestures } from './ui/map-gestures';
import { radiusNotes } from './ui/radius-notes';
import { natureNotes } from './ui/nature-notes';
import { hudEvents } from './ui/hud-events';
import { createMapPicks } from './ui/map-picks';
import { installMapHover } from './ui/map-hover';
import { installProfileBar } from './ui/profile-bar';
import { installShortcuts } from './ui/shortcuts';
import { installAutomation } from './automation';
import { Intro } from './ui/intro';

const status = document.getElementById('status')!;
const setStatus = (s: string) => { status.textContent = s; status.style.display = s ? '' : 'none'; };

async function main() {
  const storage = new StorageGuard();
  const picked = await pickScenario({ hasSaved: (scenarioId, presetId) => {
    try { return hasProjectSave(storage, { scenarioId, presetId }) || (presetId === scenarioParams(scenarioId).presetId || presetId === scenarioId)
      && storage.getItem(`trapla.${scenarioId}.design`) !== null; } catch { return false; }
  } });
  const scenario = scenarioParams(picked.scenarioId, picked.presetId);
  const pack = await loadPack(`${import.meta.env.BASE_URL}scenarios/${scenario.id}`, setStatus);
  const { meta } = pack;
  // A mission with its own ends (railway stations on a mapped line) replaces the pack's road ends; the
  // motorway reference line means nothing to a railway.
  if (scenario.ports) { meta.A = { ...scenario.ports.a }; meta.B = { ...scenario.ports.b }; }
  if (scenario.mode === 'railway') meta.official = { ...meta.official, xy: [], kinds: [] };
  const A = { x: meta.A.xy[0], y: meta.A.xy[1] }, B = { x: meta.B.xy[0], y: meta.B.xy[1] };
  /** the map's sources (the photo's while it is on) */
  const attribution = (photo: boolean) => [...meta.attribution, ...pack.terrain.protectedAreas ? ['© AOPK ČR (protected areas), CC BY 4.0'] : [],
    ...(photo && meta.orthophoto ? [meta.orthophoto.attribution] : [])].join(' · ');
  document.getElementById('attrib')!.innerHTML = attribution(false);
  document.getElementById('attrib')!.title = [document.getElementById('attrib')!.textContent,
    meta.baselineNote].filter(Boolean).join(' · ');
  document.getElementById('legend-official')!.textContent = scenario.labels.official;
  document.getElementById('legend-official')!.parentElement!.hidden = meta.official.xy.length < 2;
  document.querySelector<HTMLElement>('#legend i.nature')!.parentElement!.hidden = !pack.terrain.protectedAreas;

  const presetId = scenario.presetId ?? scenario.id;
  const { objectData, transportData, pricingData, waterData, terrainData } = packIdentities(meta, pack.overlays, pack.transportMeta);
  // crossing choices on designed roads are stored on those roads; the editor maps them like the worker
  if (pack.overlays.net) registerNet(objectData, pack.overlays.net.ways.length);
  const legacyContext = makeLegacyProjectContext({ terrain: pack.terrain, scenario, a: A, b: B },
    { presetId, packId: meta.id, objectData, transportData });
  const positionA = legacyContext.endpoints.a.position, positionB = legacyContext.endpoints.b.position;
  // One scenario factory for first start AND Start over (core/project-mission.ts, shared with the Node scripts).
  const { initial: initialProject, mission } = missionProject(scenario, legacyContext);
  const openStore = () => openProjectStore({ storage, namespace: { scenarioId: scenario.id, presetId },
    objectData, transportData, pricingData, initial: initialProject, mission,
    // Old single-road saves belong to the road exercise only, never to a motorway or railway mission.
    ...(scenario.mode === 'motorway' || scenario.mode === 'railway' ? {} : { legacy: { key: `trapla.${scenario.id}`, context: legacyContext, compatibleSemantics: scenario.id === 'd11' && presetId === 'd11' } }),
  });
  let opened: ReturnType<typeof openStore>;
  try { opened = openStore(); }
  catch (error) {
    // Unreadable/unwritable storage: open again in memory (failed writes are dropped, never half-migrated).
    if (storage.problem === null) throw error;
    console.warn('Browser storage unavailable', error);
    storage.strict = false; opened = openStore();
  }
  storage.strict = false;
  if (!opened.store) { showSaveRecovery(opened.load.status === 'unsupported' ? opened.load.raw : ''); return; }
  const projectStore = opened.store;
  const storageNotice = () => showStorageNotice(document.getElementById('view')!, () => projectStore.snapshot.design);
  storage.onProblem = () => { console.warn('Saving stopped', storage.problem); storageNotice(); };
  if (storage.problem !== null) storageNotice();
  const store = new ActiveRouteStore(projectStore, initialProject);
  /** what is on screen: the results shown, the selection and the ends of the line being edited (session.ts) */
  const session = newSession(store.route ? { a: store.route.endpoints.a.position, b: store.route.endpoints.b.position } : { a: A, b: B });
  const ends = session.ends;
  // full evaluations and drag previews, each in its own worker (eval-workers.ts)
  const { worker, previewWorker } = startEvalWorkers(pack, scenario, ends.a, ends.b,
    { objectData, transportData, pricingData, waterData, terrainData, terrainClass: scenario.terrainClass });

  setStatus('building terrain…');
  const view = new View(document.getElementById('view')!, document.getElementById('overlay')!, pack, scenario.labels);
  const extras = new RouteExtras(view);
  const routeScene = new RouteScene(view);
  const noise = new NoiseLayer(view, pack, extras, document.getElementById('view')!, document.getElementById('overlay')!);
  const profileCanvas = document.getElementById('profile-canvas') as HTMLCanvasElement;
  const profile = new ProfilePanel(profileCanvas);
  const editBar = new EditBar(document.getElementById('editbar')!, () => store.undo(), () => store.redo(), (step) => step === 'undo' ? store.undoLabel() : store.redoLabel());
  addScenariosButton(document.getElementById('editbar')!);
  installToolbarFit(document.getElementById('view')!);
  const hud = new Hud(document.getElementById('hud')!, scenario);
  const routeBar = new RouteBar(document.getElementById('view')!, registeredBuildKinds());
  const intro = new Intro(document.getElementById('view')!, scenario.mode ?? 'road');
  // The start view frames A and B in what the toolbar, legend and attribution leave, clear of the intro.
  view.frameSafe = () => {
    const host = document.getElementById('view')!.getBoundingClientRect();
    const box = (id: string) => { const el = document.getElementById(id); const r = el && !el.hidden ? el.getBoundingClientRect() : null;
      return r && r.width && r.height ? { left: r.left - host.left, top: r.top - host.top, right: r.right - host.left, bottom: r.bottom - host.top } : null; };
    const bars = [box('editbar'), box('viewbar'), box('brand')].filter(b => b !== null);
    const lows = [box('legend'), box('attrib')].filter(b => b !== null);
    return { left: 0, right: host.width, top: Math.max(0, ...bars.map(b => b.bottom)), bottom: Math.min(host.height, ...lows.map(b => b.top)),
      avoid: [box('intro')].filter(b => b !== null) };
  };
  view.resetCamera();
  const decisions = new DecisionList(hud.decisions, (n) => { document.getElementById('decisions-count')!.textContent = n ? String(n) : ''; });
  decisions.objectDataChanged = store.objectDataChanged;
  const binfo = (j: number) => { const f = pack.overlays.binfo?.[j]; return buildingInfo(f ?? undefined, buildingLevels(f ? f[1] : 0, f ? f[2] : 0), pack.overlays.buildings[j]); };
  const annotations = new BuildAnnotations(view, document.getElementById('overlay')!, pack);
  const buildingPicker = new BuildingPicker(view, pack);
  // what the aerial photo shows that is not our road (Nová Paka: the real bypass under construction), on the map
  // while the photo is on
  const photoNote = scenario.photoNote ? document.createElement('div') : null;
  if (photoNote) { photoNote.id = 'photo-note'; photoNote.textContent = scenario.photoNote!; photoNote.hidden = true; document.getElementById('view')!.appendChild(photoNote); }
  const viewBar = new ViewBar(document.getElementById('viewbar')!, view, scenario.photoNote, (on) => {
    document.getElementById('attrib')!.innerHTML = attribution(on);
    if (photoNote) photoNote.hidden = !on;
  }, noise, () => frameRoute());
  // ---- the active line on the map: its ends as drawn, bringing it into view (ui/active-line.ts) ----
  const { endInfo, activeEndpoints, frameRoute } = createActiveLine({ session, store, projectStore, scenario, view, positionA, positionB });
  // ---- the score (ui/project-score.ts) ----
  const { missionRouteId, legacyFacade, projectScore } = createProjectScore({ session, store, projectStore, hud });
  /** main-thread ms per consumer of the last handled result (drag-perf probe) */
  const handlerTiming: Record<string, number> = {};

  // ---- the selection: one thing at a time, shown in the inspector, on the map and in the profile ----
  /** shaping reroutes on the map (constructed once the store hooks exist) */
  let linkEdit: LinkEditor | undefined, works: CrossingHighlight | undefined, mappedNet: RoadNet | undefined;
  const inspector = new Inspector(document.getElementById('inspector')!, {
    building: binfo,
    maxRadius: (i) => curveEdit.maxRadius(i),
    radiusNote: (i, r) => radiusNotes.get(store.activeRouteId, i, r),
    natureNotes: (r, d, s0, s1) => natureNotes(pack.terrain, r, d, s0, s1),
    together: (j) => {
      const receiver = session.projectFull?.complete ? session.projectFull.receivers.find(r => r.buildingIndex === j && r.together) : undefined;
      if (!receiver) return null;
      const routes = projectStore.snapshot.design.routes;
      return { receiver, name: (id) => { const r = routes.find(q => q.id === id); return !r || r.role === 'mission' ? 'our road' : r.name; } };
    },
    onRing: (j) => !!session.projectFull?.works.items.some(w => w.removes?.includes(j)),
    // (the road links hold the names: loaded the first time a card asks, then the card is drawn again)
    roadName: (way) => {
      if (!links.graph && !namesAsked) { namesAsked = true; void ensureTransport().then(() => inspector.render(true)); }
      return links.wayName(way);
    },
  });
  let namesAsked = false;
  // ---- road links: the transport graph, loaded on first need (ui/road-links.ts) ----
  const links = createRoadLinks({ session, store, projectStore, pack, view, transportData, worker, previewWorker, select: next => select(next) });
  const { ensure: ensureTransport, claimedSources, mappedRoadNear, legacyRoadAt } = links;
  // A saved project that already rebuilds mapped roads needs the graph before its first scene.
  if (claimedSources().length) await ensureTransport();
  view.onNeedTransport = () => { void ensureTransport(); };
  if (viewBar.photo) void ensureTransport(); // the photo was already on from the saved view
  const buildTool = new BuildRoadTool(() => inspector.host(), document.getElementById('overlay')!, view);
  // ---- the selection (ui/selection.ts) ----
  const selection = createSelection({
    session, store, projectStore, pack, view, profile, extras, hud, inspector, annotations, intro, buildTool, activeEndpoints,
    get curveEdit() { return curveEdit; }, get linkEdit() { return linkEdit; }, get works() { return works; },
    get sourceEditor() { return links.editor; },
    switchRoute: id => switchRoute(id), routeCard: () => routeCard(),
    // A first-time player (the intro is up) finds our road selected, so the first drag bends it as the intro
    // says; a returning player's drags move the map until a click selects a road.
    startSelected: intro.visible,
  });
  const { selectedPi, select, selectPiece, revalidate, deselect, selectRoad } = selection;
  view.onEndClick = (end) => select({ kind: 'end', end });
  /** the active route's card when the road widgets cannot edit it: a proposed change on map geometry */
  const routeCard = () => proposalCard(routeCards);

  inspector.isSideRoad = () => !!store.route && store.route.role !== 'mission';
  /** what the whole-road cards (ui/route-cards.ts) read and may do */
  const routeCards: RouteCardDeps = {
    route: () => store.route, result: () => session.last, project: () => session.projectFull, design: () => projectStore.snapshot.design,
    transport: () => links.index, editable: () => store.read() !== null, directions: () => directionsState(),
    onDirection: w => hud.ev.onDirection?.(w), joinStretch: id => joinStretch(id),
    editProject: edit => store.editProject(edit), inTransaction: () => projectStore.inTransaction,
    deleteRoute: id => projectStore.dispatch({ type: 'delete-route', routeId: id }),
    missionRouteId: () => missionRouteId(), switchRoute: id => { switchRoute(id); }, undo: () => store.undo(),
    flyTo: (x, y, dist) => { view.flyTo(x, y, dist); }, selectBend: i => select({ kind: 'bend', i }, true),
    host: () => inspector.host(), clear: message => inspector.clear(message),
  };
  inspector.routeHead = routeHeadCard(routeCards);

  const showSource = (hit: SourceHit) => {
    if (!links.editor) return;
    deselect(); inspector.host(); links.editor.show(hit); hud.revealContext('inspector');
  };
  const showNoLinks = () => { deselect(); noLinksCard(() => inspector.host(), () => select(null)); hud.revealContext('inspector'); };

  // ---- edits (ui/design-edits.ts) ----
  const { setStructure, setPin, commitFields, deletePi, takeProfile, addHeightAt, setVia, setEnd, inspectorEvents, decisionEvents } = createDesignEdits({
    store, profile, get last() { return session.last; }, select: (next, fly) => select(next, fly), deselect: () => deselect(),
  });
  inspector.ev = inspectorEvents;
  decisions.ev = decisionEvents;
  annotations.onPin = (s) => select({ kind: 'pin', s });
  annotations.onBuilding = (j) => select({ kind: 'building', j });
  annotations.onCulvert = (id, s) => select({ kind: 'culvert', id, s });

  // ---- evaluation: what happens with the workers' results (ui/result-display.ts) ----
  const results = createResultDisplay({
    session, store, projectStore, pack, scenario, worker, previewWorker, view, profile, hud, inspector, decisions, extras, routeScene, noise,
    annotations, links, handlerTiming, setStatus, projectScore, ensureTransport, revalidate, activeEndpoints, endInfo, binfo,
    get A() { return ends.a; }, get B() { return ends.b; },
    get curveEdit() { return curveEdit; }, get linkEdit() { return linkEdit; }, get works() { return works; },
    routeCard: () => routeCard(), directionsState: () => directionsState(),
  });
  const { evals, requestEval, settled, sceneIdle } = results;

  // on-map radius handles for the selected bend (grips, + / −)
  const curveEdit = new CurveEditor(view, document.getElementById('overlay')!, pack.terrain, {
    get a() { return ends.a; }, get b() { return ends.b; }, design: () => store.design, selected: () => selectedPi(), result: () => session.last,
    setRadius: (i, r, commit) => store.update((d) => { if (d.pis[i]) { d.pis[i].r = r; delete d.pis[i].mapped; } }, commit),
    commit: () => store.commit(),
  });

  works = new CrossingHighlight(view, document.getElementById('overlay')!, {
    selected: () => (session.sel?.kind === 'crossing' ? session.sel.roadId : null), result: () => session.lastFull, heightAt: (x, y) => pack.terrain.heightAt(x, y),
  });
  linkEdit = new LinkEditor(view, document.getElementById('overlay')!, {
    selected: () => (session.sel?.kind === 'crossing' ? session.sel.roadId : null), result: () => session.lastFull, design: () => store.design,
    select: (roadId) => { if (session.sel?.kind !== 'crossing' || session.sel.roadId !== roadId) select({ kind: 'crossing', roadId }); },
    setVia, commit: () => store.commit(), heightAt: (x, y) => pack.terrain.heightAt(x, y),
    setEnd: (roadId, side, end) => setEnd(roadId, side, end),
    roads: () => pack.overlays.net ? (mappedNet ??= new RoadNet(pack.overlays.net)) : null,
  });

  // ---- routes: the line being edited, the motorway's directions, Build, the road list, and what follows
  // every change of the design (ui/routes.ts) ----
  const { switchRoute, placeAt, bendLabel, joinStretch, directionsState } = createRoutes({
    session, store, projectStore, pack, scenario, view, profile, hud, inspector, extras, routeBar, editBar, buildTool, curveEdit, linkEdit, works,
    links, results, select, selectRoad, deselect, showRoadSelected: () => selection.showRoadSelected(), selectedPi, projectScore, frameRoute, activeEndpoints, routeCard,
    routeAt: (clientX, clientY, radius) => routeAt(clientX, clientY, radius), sourceAt: (clientX, clientY) => sourceAt(clientX, clientY),
  });

  // ---- map: click inspects, dragging the road bends it, empty ground deselects ----
  // what is under the pointer (ui/map-picks.ts)
  const { canvasBox, routeAt, roadAt, crossingAt, crossingWorksAt, buildingAt, sourceAt, thingAt } = createMapPicks({
    view, pack, extras, buildingPicker, transportData,
    get projectFull() { return session.projectFull; }, get last() { return session.last; }, get activeRouteId() { return store.activeRouteId; },
    get editable() { return store.read() !== null; }, get routes() { return projectStore.snapshot.design.routes; },
    get sourcePicker() { return links.picker; }, get sourceEditor() { return links.editor; },
  });
  // ---- map gestures: click, drag to bend / rebuild / shape, double click (ui/map-gestures.ts) ----
  const lastClient = { x: 0, y: 0 };
  const { events: mapEvents, mappedGrab, releaseGrab } = createMapGestures({
    store, projectStore, view, pack, buildTool, intro, lastClient, canvasBox, routeAt, roadAt, crossingWorksAt, sourceAt, thingAt,
    get A() { return ends.a; }, get B() { return ends.b; },
    get transportIndex() { return links.index; }, get transportGraph() { return links.graph; },
    get sourceEditor() { return links.editor; }, get linkEdit() { return linkEdit; }, get selectGeneration() { return selection.generation; },
    get roadSelected() { return selection.roadSelected; }, get sel() { return session.sel; },
    ensureTransport, select, selectPiece, deselect, selectRoad, switchRoute, showSource, showNoLinks, deletePi, placeAt, legacyRoadAt,
  });
  view.ev = mapEvents;

  // ---- profile: the same verbs (ui/profile-events.ts) ----
  profile.ev = profileEvents({
    store, view, select, selectPiece, selectRoad, takeProfile, commitFields, addHeightAt, setPin,
    get last() { return session.last; }, get sel() { return session.sel; },
    updateZoomButtons: () => updateZoomButtons(), highlightBend: i => highlightBend(i),
  });

  // ---- the profile's key (legend) and zoom buttons (ui/profile-bar.ts) ----
  const { keyBox, showKey, updateZoomButtons } = installProfileBar(profile);

  // ---- hover links between the map and the profile, the map's cursor (ui/map-hover.ts) ----
  const { highlightBend } = installMapHover({
    view, pack, profile, extras, buildTool, lastClient, routeAt, roadAt, crossingAt, crossingWorksAt, buildingAt, sourceAt,
    get last() { return session.last; }, get lastFull() { return session.lastFull; }, get design() { return store.design; },
    get transportIndex() { return links.index; }, get transportGraph() { return links.graph; },
    get roadSelected() { return selection.roadSelected; }, get selectedCrossing() { return session.sel?.kind === 'crossing' ? session.sel.roadId : null; },
    ensureTransport, placeAt, mappedGrab, mappedRoadNear, bendLabel,
  });

  // map → profile: the part of the route the map shows (ui/map-window.ts)
  installMapWindow({ session, view, profile, canvasBox });

  // ---- HUD (ui/hud-events.ts) ----
  hud.ev = hudEvents({
    store, projectStore, view, profile, hud, intro, settled, legacyFacade, takeProfile, select, selectRoad, switchRoute, joinStretch,
    get last() { return session.last; }, get lastFull() { return session.lastFull; }, get projectFull() { return session.projectFull; },
  });

  // ---- keyboard (ui/shortcuts.ts) ----
  installShortcuts({
    buildTool, intro, keyBox, showKey, deselect, setStructure, deletePi, undo: () => store.undo(), redo: () => store.redo(),
    cancelDrag: () => { store.cancelStep(); view.cancelDrag(); }, releaseDrag: () => store.release(),
    get sel() { return session.sel; }, get mappedRoadSelected() { return !!links.editor?.selected; },
  });

  if (store.read()) { view.setDesign(store.design, null, activeEndpoints()); hud.setDesign(store.design); }
  else { view.clearDesign(activeEndpoints()); curveEdit.hide(); }
  projectScore(true);
  editBar.set(projectStore.canUndo(), projectStore.canRedo());
  setStatus('computing…');
  requestEval();

  // ---- debug / automation API (src/automation.ts) ----
  installAutomation({
    store, projectStore, view, pack, profile, viewBar, curveEdit, buildTool, meta, A: ends.a, B: ends.b, handlerTiming,
    get last() { return session.last; }, get projectFull() { return session.projectFull; },
    get transportIndex() { return links.index; }, get transportGraph() { return links.graph; }, get sourceEditor() { return links.editor; },
    get sel() { return session.sel; }, get qualifiedSelection() { return session.qualifiedSelection; },
    get received() { return evals.received; }, get heavyStats() { return results.heavyStats; }, get idleWaiters() { return results.idleWaiters; },
    get roadSelected() { return selection.roadSelected; },
    sceneIdle, missionRouteId, switchRoute, select, selectPiece, selectRoad, placeAt, ensureTransport,
    releaseGrab,
  });
}

main().catch((e) => { console.error(e); setStatus(`Failed to load: ${e?.message ?? e}. Did you run "npm run data"?`); });
