import './style.css';
import { scenarioParams } from './core/data/scenario';
import type { Result } from './core/evaluate';
import { missionProject } from './core/project-mission';
import { autoFollowingCorridor, corridorOfRoute, rejoinStretch } from './core/project-motorway';
import { DIRECTIONS_TEXT, placeName } from './core/terms';
import { RouteExtras } from './render/extras';
import { BuildAnnotations } from './render/build-tools';
import { RouteScene } from './render/route-scene';
import { footprintHit } from './render/route-pick';
import type { SourceHit } from './render/source-pick';
import { CrossingHighlight } from './ui/crossing-highlight';
import { LinkEditor } from './ui/link-edit';
import { BuildRoadTool, type Placement } from './ui/build-road';
import { buildInProject, registeredBuildKinds, type BuildKind } from './ui/route-kinds';
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
import type { RouteId } from './core/project';
import { ActiveRouteStore } from './ui/active-route-store';
import { pickScenario, addScenariosButton } from './ui/scenario-picker';
import { showSaveRecovery } from './ui/save-recovery';
import { StorageGuard, showStorageNotice } from './ui/storage-guard';
import { RouteBar } from './ui/route-bar';
import { activeSelection, qualifySelection } from './ui/route-selection';
import { CurveEditor } from './ui/curve-edit';
import { Hud, type DirectionsState } from './ui/hud';
import { noLinksCard, proposalCard, routeHeadCard, type RouteCardDeps } from './ui/route-cards';
import { lineFrame } from './ui/chainage';
import { ProfilePanel } from './ui/profile';
import { ViewBar } from './ui/viewbar';
import { EditBar } from './ui/editbar';
import { createDesignEdits } from './ui/design-edits';
import { createSelection } from './ui/selection';
import { createRoadLinks } from './ui/road-links';
import { createResultDisplay } from './ui/result-display';
import { profileEvents } from './ui/profile-events';
import { createMapGestures } from './ui/map-gestures';
import { hudEvents } from './ui/hud-events';
import { createMapPicks } from './ui/map-picks';
import { installMapHover } from './ui/map-hover';
import { installProfileBar } from './ui/profile-bar';
import { installShortcuts } from './ui/shortcuts';
import { installAutomation } from './automation';
import { hideToast, toast } from './ui/toast';
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
  let A = { x: meta.A.xy[0], y: meta.A.xy[1] }, B = { x: meta.B.xy[0], y: meta.B.xy[1] };
  document.getElementById('attrib')!.innerHTML = meta.attribution.join(' · ');
  document.getElementById('attrib')!.title = [document.getElementById('attrib')!.textContent,
    meta.baselineNote].filter(Boolean).join(' · ');
  document.getElementById('legend-official')!.textContent = scenario.labels.official;
  document.getElementById('legend-official')!.parentElement!.hidden = meta.official.xy.length < 2;

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
  /** what is on screen: the results shown and the selection (session.ts) */
  const session = newSession();
  if (store.route) { A = store.route.endpoints.a.position; B = store.route.endpoints.b.position; }
  // full evaluations and drag previews, each in its own worker (eval-workers.ts)
  const { worker, previewWorker } = startEvalWorkers(pack, scenario, A, B,
    { objectData, transportData, pricingData, waterData, terrainData, terrainClass: scenario.terrainClass });

  setStatus('building terrain…');
  const view = new View(document.getElementById('view')!, document.getElementById('overlay')!, pack, scenario.labels);
  const extras = new RouteExtras(view);
  const routeScene = new RouteScene(view);
  const noise = new NoiseLayer(view, pack, extras, document.getElementById('view')!, document.getElementById('overlay')!);
  const profileCanvas = document.getElementById('profile-canvas') as HTMLCanvasElement;
  const profile = new ProfilePanel(profileCanvas);
  const editBar = new EditBar(document.getElementById('editbar')!, () => store.undo(), () => store.redo());
  addScenariosButton(document.getElementById('editbar')!);
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
    document.getElementById('attrib')!.innerHTML = [...meta.attribution, ...(on && meta.orthophoto ? [meta.orthophoto.attribution] : [])].join(' · ');
    if (photoNote) photoNote.hidden = !on;
  }, noise, () => frameRoute());
  /** the active route as built (else its ends and bends) in view */
  /** `r`: the road to frame (default: the last result shown; right after a switch that is still the old road's) */
  const frameRoute = (r: Result | null = session.last) => {
    const d = store.read() ? store.design : null;
    view.frame(r ? Array.from({ length: Math.ceil(r.n / 20) + 1 }, (_, k) => { const i = Math.min(r.n - 1, k * 20); return { x: r.x[i], y: r.y[i] }; })
      : d ? [A, ...d.pis, B] : []);
  };

  const missionRouteId = () => projectStore.snapshot.design.routes.find(r => r.role === 'mission')?.id;
  /** exactly the one legacy road: the unchanged single-road score/verdict applies (core's facade) */
  const legacyFacade = () => {
    const d = projectStore.snapshot.design, only = d.routes[0];
    return d.routes.length === 1 && !d.corridors.length && !d.connections.length && only.role === 'mission' && !only.source
      && store.activeRouteId === only.id && store.read() !== null;
  };
  /** player names of the routes; a motorway's two directions are one motorway (its forward name) */
  const routeNames = () => {
    const d = projectStore.snapshot.design, names = Object.fromEntries(d.routes.map(r => [r.id, r.name]));
    for (const c of d.corridors) if (names[c.children.forward]) names[c.children.reverse] = names[c.children.forward];
    return names;
  };
  const projectScore = (pending: boolean) => {
    const mission = missionRouteId(), active = store.activeRouteId, alone = session.projectFull?.cost.alone ?? {};
    // While a road is dragged the project total follows its live price: the last full total with this road's
    // own bill replaced by the preview's (≈).
    const total = session.projectFull?.cost.total;
    const live = session.activePreviewPrice !== null && total !== null && total !== undefined && active && active in alone
      ? total - alone[active] + session.activePreviewPrice : null;
    // our road: the mission's route, and a motorway mission's other direction
    const missionCorridor = mission ? corridorOfRoute(projectStore.snapshot.design, mission) : undefined;
    const ours = new Set([mission, missionCorridor?.children.forward, missionCorridor?.children.reverse].filter((id): id is RouteId => !!id));
    const groups = Object.fromEntries(projectStore.snapshot.design.corridors.flatMap(c => [[c.children.forward, c.id], [c.children.reverse, c.id]]));
    // "Our road only" / "This railway only": what the price shown is for, in the active line's own word
    const word = (id: RouteId | null | undefined) => { const k = projectStore.snapshot.design.routes.find(r => r.id === id)?.kind; return k === 'railway' ? 'railway' : k === 'motorway' ? 'motorway' : 'road'; };
    const only = (id: RouteId | null | undefined) => `${id && ours.has(id) ? 'Our' : 'This'} ${word(id)} only`;
    const own = session.activePreviewPrice !== null ? { total: session.activePreviewPrice, approx: true, label: only(active), routeId: active ?? undefined }
      : active && active in alone ? { total: alone[active], approx: false, label: only(active), routeId: active }
        : mission && mission in alone ? { total: alone[mission], approx: false, label: only(mission), routeId: mission } : null;
    hud.setProject(session.projectFull, pending, projectStore.best, { missionRouteId: mission, ours, groups, legacy: legacyFacade(), ownPrice: own,
      liveTotal: live, dragging: session.activePreviewPrice !== null && projectStore.inTransaction,
      activeRouteId: active ?? undefined, names: routeNames(),
      lengths: Object.fromEntries(Object.values(session.projectFull?.routes ?? {}).flatMap(r => {
        const length = r.legacy?.length ?? r.surface?.points.at(-1)?.s; return length === undefined ? [] : [[r.routeId, length]];
      })) });
  };
  /** main-thread ms per consumer of the last handled result (drag-perf probe) */
  const handlerTiming: Record<string, number> = {};

  // ---- the selection: one thing at a time, shown in the inspector, on the map and in the profile ----
  /** shaping reroutes on the map (constructed once the store hooks exist) */
  let linkEdit: LinkEditor | undefined, works: CrossingHighlight | undefined;
  const inspector = new Inspector(document.getElementById('inspector')!, {
    building: binfo,
    maxRadius: (i) => curveEdit.maxRadius(i),
    together: (j) => {
      const receiver = session.projectFull?.complete ? session.projectFull.receivers.find(r => r.buildingIndex === j && r.together) : undefined;
      if (!receiver) return null;
      const routes = projectStore.snapshot.design.routes;
      return { receiver, name: (id) => { const r = routes.find(q => q.id === id); return !r || r.role === 'mission' ? 'our road' : r.name; } };
    },
  });
  // ---- road links: the transport graph, loaded on first need (ui/road-links.ts) ----
  const links = createRoadLinks({ session, store, projectStore, pack, view, transportData, worker, previewWorker, select: next => select(next) });
  const { ensure: ensureTransport, syncEnds, claimedSources, mappedRoadNear, legacyRoadAt } = links;
  // A saved project that already rebuilds mapped roads needs the graph before its first scene.
  if (claimedSources().length) await ensureTransport();
  view.onNeedTransport = () => { void ensureTransport(); };
  if (viewBar.photo) void ensureTransport(); // the photo was already on from the saved view
  const buildTool = new BuildRoadTool(() => inspector.host(), document.getElementById('overlay')!, view);
  // a rebuilt stretch's ends carry their own drag handles (labelled), so the tick stays unlabelled
  /** a side road's end on another road follows that road: its drawn end is where it was built */
  const endAt = (end: 'a' | 'b') => {
    const route = store.route, r = route && session.projectFull?.routes[route.id]?.legacy;
    // a paired motorway's directions are shown on its shared line (A→B): its ends are the motorway's
    const paired = route && corridorOfRoute(projectStore.snapshot.design, route.id);
    if (paired?.mode === 'paired') return paired.endpoints[end].position;
    if (!route || route.endpoints[end].anchor.kind !== 'route' || !r) return route?.endpoints[end].position;
    const i = end === 'a' ? 0 : r.n - 1; return { x: r.x[i], y: r.y[i], z: r.grade[i] };
  };
  // the motorway's return direction starts at B
  const reversed = () => !!store.route && projectStore.snapshot.design.corridors.some(c => c.mode === 'independent' && c.children.reverse === store.route!.id);
  /** what the active road's ends meet (the mission's interchanges), in its own direction */
  const endInfo = (end: 'a' | 'b') => store.route?.role === 'mission' ? scenario.ends?.[reversed() ? (end === 'a' ? 'b' : 'a') : end] : undefined;
  const activeEndpoints = () => ({
    a: { ...(endAt('a') ?? positionA), label: store.route?.role === 'mission' ? (reversed() ? scenario.labels.b : scenario.labels.a) : store.route?.source ? '' : 'Start', sign: endInfo('a')?.kind },
    b: { ...(endAt('b') ?? positionB), label: store.route?.role === 'mission' ? (reversed() ? scenario.labels.a : scenario.labels.b) : store.route?.source ? '' : 'End', sign: endInfo('b')?.kind },
    plain: !!store.route && store.route.role !== 'mission',
  });
  // ---- the selection (ui/selection.ts) ----
  const selection = createSelection({
    session, store, projectStore, pack, view, profile, extras, hud, inspector, annotations, intro, buildTool, activeEndpoints,
    get curveEdit() { return curveEdit; }, get linkEdit() { return linkEdit; }, get works() { return works; },
    get sourceEditor() { return links.editor; },
    switchRoute: id => switchRoute(id), routeCard: () => routeCard(),
  });
  const { selectedPi, select, selectPiece, revalidate } = selection;
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
    select(null); inspector.host(); links.editor.show(hit); hud.revealContext('inspector');
  };
  const showNoLinks = () => { select(null); noLinksCard(() => inspector.host(), () => select(null)); hud.revealContext('inspector'); };

  // ---- edits (ui/design-edits.ts) ----
  const { setStructure, setPin, commitFields, deletePi, takeProfile, addHeightAt, setVia, inspectorEvents, decisionEvents } = createDesignEdits({
    store, profile, get last() { return session.last; }, select: (next, fly) => select(next, fly),
  });
  inspector.ev = inspectorEvents;
  decisions.ev = decisionEvents;
  annotations.onPin = (s) => select({ kind: 'pin', s });
  annotations.onBuilding = (j) => select({ kind: 'building', j });
  annotations.onCulvert = (s) => selectPiece(s);

  // ---- evaluation: what happens with the workers' results (ui/result-display.ts) ----
  const results = createResultDisplay({
    session, store, projectStore, pack, scenario, worker, previewWorker, view, profile, hud, inspector, decisions, extras, routeScene, noise,
    annotations, links, handlerTiming, setStatus, projectScore, ensureTransport, revalidate, activeEndpoints, endInfo, binfo,
    get A() { return A; }, get B() { return B; },
    get curveEdit() { return curveEdit; }, get linkEdit() { return linkEdit; }, get works() { return works; },
    routeCard: () => routeCard(), directionsState: () => directionsState(),
  });
  const { evals, requestEval, settled, sceneIdle, syncDecorations, activeLegacy, frameLine, showActiveResult } = results;

  // on-map radius handles for the selected bend (grips, + / −)
  const curveEdit = new CurveEditor(view, document.getElementById('overlay')!, pack.terrain, {
    get a() { return A; }, get b() { return B; }, design: () => store.design, selected: () => selectedPi(), result: () => session.last,
    setRadius: (i, r, commit) => store.update((d) => { if (d.pis[i]) d.pis[i].r = r; }, commit),
    commit: () => store.commit(),
  });

  /** the motorway direction switch follows the active route */
  const syncDirections = () => {
    { const r = store.activeRouteId ? activeLegacy(session.projectFull?.routes[store.activeRouteId]) : undefined; frameLine(r?.length ?? 0, !!r); }
    const design = projectStore.snapshot.design, route = store.route, corridor = route ? corridorOfRoute(design, route.id) : undefined;
    inspector.oneDirection = corridor?.mode === 'independent';
    document.getElementById('profile')!.classList.toggle('one-direction', !!corridor && store.oneDirection);
    // the legend names the line being edited (a motorway built in a railway mission is a motorway)
    const kind = route?.kind ?? scenario.mode ?? 'road';
    document.getElementById('legend-route')!.textContent = kind;
    document.getElementById('legend-height')!.textContent = kind === 'railway' ? 'track height' : 'road height';
    profile.setLine(kind); hud.setLine(kind);
    // a motorway's ends are its corridor's A and B on the map (its direction towards A reads from B)
    profile.setEndLabels(corridor?.mode === 'paired' ? ['A', 'B'] : null);
    if (!corridor) { hud.setDirections(null); return; }
    hud.setDirections(directionsState());
  };
  /** what a drag of the active line bends (a motorway: both directions, or the chosen one) */
  const bendLabel = () => {
    const state = store.route?.kind === 'motorway' ? directionsState() : null;
    return !state || state.split ? 'drag to bend' : state.active === 'both' ? 'drag to bend both directions' : `drag to bend towards ${state.places[state.active]} only`;
  };
  /** both directions on one line again over a stretch where they ran apart */
  const joinStretch = (id: string) => {
    const route = store.route, corridor = route ? corridorOfRoute(projectStore.snapshot.design, route.id) : undefined;
    if (!corridor || projectStore.inTransaction) return;
    select(null);
    historyStep = true; // its own toast below
    store.editProject(d => { Object.assign(d, rejoinStretch(d, corridor.id, id)); });
    toast(DIRECTIONS_TEXT.joined, 'Undo', () => store.undo());
  };
  /** the motorway direction switch's state (HUD and the motorway's own card) */
  const directionsState = (): DirectionsState | null => {
    const design = projectStore.snapshot.design, route = store.route, corridor = route ? corridorOfRoute(design, route.id) : undefined;
    if (!route || !corridor) return null;
    const split = corridor.mode === 'independent', which = corridor.children.reverse === route.id ? 'reverse' : 'forward';
    const engineered = autoFollowingCorridor(design, corridor);
    const apart = new Set(engineered.mode === 'paired' ? engineered.stretches?.map(t => t.id) : []);
    // the mission's motorway runs between the scenario's places; any other between its own start and end
    return { split, active: split || store.oneDirection ? which : 'both',
      places: route.role === 'mission' ? { forward: placeName(scenario.labels.b), reverse: placeName(scenario.labels.a) } : { forward: 'its end', reverse: 'its start' },
      apart: corridor.mode === 'paired' ? (corridor.stretches ?? []).map(t => ({ id: t.id, s0: t.a, s1: t.b, following: !apart.has(t.id) })) : [] };
  };
  works = new CrossingHighlight(view, document.getElementById('overlay')!, {
    selected: () => (session.sel?.kind === 'crossing' ? session.sel.roadId : null), result: () => session.lastFull,
  });
  linkEdit = new LinkEditor(view, document.getElementById('overlay')!, {
    selected: () => (session.sel?.kind === 'crossing' ? session.sel.roadId : null), result: () => session.lastFull, design: () => store.design,
    select: (roadId) => { if (session.sel?.kind !== 'crossing' || session.sel.roadId !== roadId) select({ kind: 'crossing', roadId }); },
    setVia, commit: () => store.commit(), heightAt: (x, y) => pack.terrain.heightAt(x, y),
  });

  /** the active line's ends; a paired motorway's directions are edited in its shared line's frame (A→B) */
  const frameEnds = () => {
    if (!store.route) return;
    A = store.route.endpoints.a.position; B = store.route.endpoints.b.position;
    const paired = corridorOfRoute(projectStore.snapshot.design, store.route.id);
    if (paired?.mode === 'paired') { A = paired.endpoints.a.position; B = paired.endpoints.b.position; }
  };
  /** `oneDirection`: a motorway direction alone; absent: unchanged while staying on the same motorway */
  const switchRoute = (id: RouteId, created = false, oneDirection?: boolean) => {
    const design = projectStore.snapshot.design, here = store.route && corridorOfRoute(design, store.route.id);
    const one = oneDirection ?? (!!here && here === corridorOfRoute(design, id) && store.oneDirection);
    const shown = store.activeRouteId, shownOne = store.oneDirection;
    if (!store.switchRoute(id, created, one)) return false;
    syncDirections();
    evals.endGesture(); session.activePreviewPrice = null;
    frameEnds();
    session.sel = activeSelection(id, session.qualifiedSelection); session.qualifiedSelection = qualifySelection(id, session.sel);
    view.setHover(null); extras.setRange(null);
    // another line: its whole profile. The line the profile already shows (a click on our own road): the
    // profile keeps its zoom, and the selection that follows scrolls it only if the place is out of view
    if (store.activeRouteId !== shown || store.oneDirection !== shownOne) profile.fit();
    showActiveResult();
    if (!store.read()) curveEdit.hide();
    select(session.sel);
    if (session.projectFull) syncDecorations(session.projectFull);
    routeBar.set(projectStore.snapshot.design, id, projectStore.inTransaction);
    syncEnds();
    projectScore(!sceneIdle());
    return true;
  };
  /** separate motorway stretches known after the last committed change (a change of both directions next to
   * one joins it: say so) */
  let stretchIds = new Set<string>(), historyStep = false;
  const separateStretches = () => new Set(projectStore.snapshot.design.corridors.flatMap(c => c.mode === 'paired' ? (c.stretches ?? []).map(t => t.id) : []));
  stretchIds = separateStretches();
  store.onHistory = () => { select(null); historyStep = true; };
  buildTool.onClose = () => select(null);
  buildTool.onDone = (a, b) => {
    if (projectStore.inTransaction) projectStore.commit();
    let made: ReturnType<typeof buildInProject>;
    try {
      made = buildInProject(building, projectStore.snapshot.design, a, b, prefix => `${prefix}:${crypto.randomUUID()}`);
      const next = made.project;
      store.editProject(d => { for (const key of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[key]; Object.assign(d, next); });
    } catch (error) { console.warn('New road was not created', error); toast('This road could not be made here.'); return; }
    switchRoute(made.activeRouteId); select(null);
    toast(`Drag the ${building.kind === 'road' ? 'road' : building.kind} to bend it.`);
  };
  /** the kind being built (Build menu), which decides where its ends may go */
  let building: BuildKind = registeredBuildKinds()[0];
  routeBar.onBuild = kind => {
    const k = registeredBuildKinds().find(b => b.kind === kind); if (!k) return;
    building = k; select(null); buildTool.begin(k.label); hud.revealContext('inspector');
    if (pack.transportMeta) void ensureTransport(); // ends may join mapped lines
  };
  /** where a click while building puts a road end: on a road (joins it), else free ground */
  const placeAt = (clientX: number, clientY: number, x: number, y: number): Placement => {
    // A railway or motorway joins only lines of its own kind: a road picked near the click (at an overview, one
    // is near every click) is not where it ends; it ends on the ground there (roads are crossed, not joined).
    const joins = (kind: string | undefined) => building.kind === 'road' || kind === building.kind;
    const hit = routeAt(clientX, clientY, 10), rr = hit && session.projectFull?.routes[hit.routeId];
    const route = hit && projectStore.snapshot.design.routes.find(r => r.id === hit.routeId);
    if (hit && rr && route && joins(route.kind)) return building.onRoute(route, rr, hit.s);
    // on a road's carriageway or earthworks beside its centreline: that road, never "open ground"
    const under = footprintHit(Object.values(session.projectFull?.routes ?? {}).flatMap(r => {
      const legacy = r.routeId === store.activeRouteId && session.last ? session.last : r.legacy;
      return legacy ? [{ id: r.routeId, result: legacy }] : [];
    }), x, y);
    const underRoute = under && projectStore.snapshot.design.routes.find(r => r.id === under.routeId), ur = under && session.projectFull?.routes[under.routeId];
    if (under && underRoute && ur && joins(underRoute.kind)) return building.onRoute(underRoute, ur, under.s);
    const source = sourceAt(clientX, clientY);
    if (source?.kind === 'route-hit' && joins(projectStore.snapshot.design.routes.find(r => r.id === source.routeId)?.kind)) return { ok: false, why: 'This stretch is being rebuilt: join the new road instead.' };
    if (source?.kind === 'source' && links.index && joins(links.index.source(source.hit.sourceId)?.kind)) return building.onSource(links.index, source.hit.sourceId, source.hit.s);
    if (pack.terrain.isOob(x, y)) return { ok: false, why: 'Put the end on the map.' };
    if (building.kind === 'road' && legacyRoadAt(x, y)) return { ok: false, why: 'This map’s road links are missing, so a new road cannot join its roads yet. Join our road, or end on open ground.' };
    return { ok: true, label: `open ground (joins no ${building.kind === 'railway' ? 'railway' : 'road'})`, end: { position: { x, y, z: pack.terrain.heightAt(x, y) }, anchor: { kind: 'free' } } };
  };
  // a road chosen in the list comes into view when none of it is on screen
  routeBar.onSelect = id => {
    if (!switchRoute(id)) return;
    const route = store.route, r = session.projectFull?.routes[id]?.legacy;
    if (!route) return;
    const a = route.endpoints.a.position, b = route.endpoints.b.position;
    const mid = r ? { x: r.x[r.n >> 1], y: r.y[r.n >> 1] } : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const box = view.renderer.domElement.getBoundingClientRect();
    const seen = [a, b, mid].some(p => { const q = view.project(p.x, p.y, pack.terrain.heightAt(p.x, p.y)); return q.vis && q.sx > 0 && q.sy > 0 && q.sx < box.width && q.sy < box.height; });
    if (!seen) frameRoute(r ?? null);
  };
  routeBar.set(projectStore.snapshot.design, store.activeRouteId);
  syncEnds();
  syncDirections();

  store.on((d, committed) => {
    if (committed) evals.endGesture();
    hideToast(); hud.noteEdit(committed);
    if (committed) {
      const ids = separateStretches();
      if (!historyStep && !store.oneDirection && [...stretchIds].some(id => !ids.has(id))) toast(DIRECTIONS_TEXT.togetherAgain, 'Undo', () => store.undo());
      stretchIds = ids; historyStep = false;
    }
    frameEnds(); frameLine(lineFrame.length, true, d);
    session.sel = activeSelection(store.activeRouteId, session.qualifiedSelection);
    if (d) {
      if (session.sel?.kind === 'bend' && session.sel.i >= d.pis.length) select(null);
      view.setDesign(d, selectedPi(), activeEndpoints()); hud.setDesign(d);
      profile.selectBend(selectedPi()); curveEdit.refresh(); linkEdit?.refresh(); works?.refresh();
    } else { view.clearDesign(activeEndpoints()); profile.clear(); if (!links.editor?.selected) routeCard(); curveEdit.hide(); }
    editBar.set(store.undoLabel(), store.redoLabel());
    routeBar.set(projectStore.snapshot.design, store.activeRouteId, projectStore.inTransaction);
    syncEnds();
    syncDirections();
    // a borrowed card (a proposal's) may belong to a road undo just removed: restore the right card
    if (committed && inspector.isHosting && !links.editor?.selected) { if (d) inspector.set(session.sel); else routeCard(); }
    requestEval(!committed);
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
    get A() { return A; }, get B() { return B; },
    get transportIndex() { return links.index; }, get transportGraph() { return links.graph; },
    get sourceEditor() { return links.editor; }, get linkEdit() { return linkEdit; }, get selectGeneration() { return selection.generation; },
    ensureTransport, select, selectPiece, switchRoute, showSource, showNoLinks, deletePi, placeAt, mappedRoadNear, legacyRoadAt,
  });
  view.ev = mapEvents;

  // ---- profile: the same verbs (ui/profile-events.ts) ----
  profile.ev = profileEvents({
    store, view, select, selectPiece, takeProfile, commitFields, addHeightAt, setPin,
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
    ensureTransport, placeAt, mappedGrab, mappedRoadNear, bendLabel,
  });

  // map → profile: the part of the route the map shows (a light window), recomputed after camera moves
  let windowTimer = 0;
  const updateMapWindow = () => {
    windowTimer = 0;
    const r = session.last;
    if (!r) return;
    const box = canvasBox();
    let lo = Infinity, hi = -Infinity, seen = 0, total = 0;
    const step = Math.max(1, Math.floor(r.n / 400));
    for (let i = 0; i < r.n; i += step) {
      total++;
      const p = view.project(r.x[i], r.y[i], r.grade[i]);
      if (p.vis && p.sx >= 0 && p.sy >= 0 && p.sx <= box.width && p.sy <= box.height) { seen++; lo = Math.min(lo, r.s[i]); hi = Math.max(hi, r.s[i]); }
    }
    profile.setMapWindow(seen && seen < total * 0.9 ? { s0: lo, s1: hi } : null);
  };
  const prevRender = view.onRender;
  view.onRender = () => { prevRender?.(); if (!windowTimer) windowTimer = window.setTimeout(updateMapWindow, 120); };

  // ---- HUD (ui/hud-events.ts) ----
  hud.ev = hudEvents({
    store, projectStore, view, profile, hud, intro, settled, legacyFacade, takeProfile, select, switchRoute, joinStretch,
    get last() { return session.last; }, get lastFull() { return session.lastFull; }, get projectFull() { return session.projectFull; },
  });

  // ---- keyboard (ui/shortcuts.ts) ----
  installShortcuts({
    buildTool, intro, keyBox, showKey, select, setStructure, deletePi, undo: () => store.undo(), redo: () => store.redo(),
    get sel() { return session.sel; }, get mappedRoadSelected() { return !!links.editor?.selected; },
  });

  if (store.read()) { view.setDesign(store.design, null, activeEndpoints()); hud.setDesign(store.design); }
  else { view.clearDesign(activeEndpoints()); curveEdit.hide(); }
  projectScore(true);
  editBar.set(store.undoLabel(), store.redoLabel());
  setStatus('computing…');
  requestEval();

  // ---- debug / automation API (src/automation.ts) ----
  installAutomation({
    store, projectStore, view, pack, profile, viewBar, curveEdit, buildTool, meta, A, B, handlerTiming,
    get last() { return session.last; }, get projectFull() { return session.projectFull; },
    get transportIndex() { return links.index; }, get transportGraph() { return links.graph; }, get sourceEditor() { return links.editor; },
    get sel() { return session.sel; }, get qualifiedSelection() { return session.qualifiedSelection; },
    get received() { return evals.received; }, get heavyStats() { return results.heavyStats; }, get idleWaiters() { return results.idleWaiters; },
    sceneIdle, missionRouteId, switchRoute, select, selectPiece, placeAt, ensureTransport,
    releaseGrab,
  });
}

main().catch((e) => { console.error(e); setStatus(`Failed to load: ${e?.message ?? e}. Did you run "npm run data"?`); });
