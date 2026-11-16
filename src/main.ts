import './style.css';
import { CATEGORIES, type CategoryId } from './core/data/categories';
import { scenarioParams } from './core/data/scenario';
import { MIN_VPI_GAP, normalizeVpis, type Design, type Result } from './core/evaluate';
import { nearestLeg } from './core/horizontal';
import { paintOverride, type StructureKind } from './core/overrides';
import { cellsInRange } from './core/range';
import { KIND } from './core/structures';
import { ENDPOINT_JUNCTIONS, NOISE, ROAD_CLASSES } from './core/data/urban';
import { ROUNDABOUT_HOSTS } from './core/tie-in';
import { createRailNoiseModel } from './core/rail-noise';
import { railTraffic } from './core/project-railway';
import { createRailwayProject, railwayMission as railwayMissionOf } from './core/project-railway';
import { CARRIAGEWAY_CATEGORY, corridorOfRoute, corridorOperations, createMotorwayProject, MOTORWAY_CATEGORY, motorwayMission as motorwayMissionOf, rejoinCorridor, splitCorridor } from './core/project-motorway';
import { DIRECTIONS_TEXT } from './core/terms';
import { RouteExtras } from './render/extras';
import { runSliced, type SlicedJob, type Staged } from './render/slices';
import { BuildAnnotations } from './render/build-tools';
import { RouteScene } from './render/route-scene';
import { pickRoute, type PickRoute } from './render/route-pick';
import { SourcePicker, type SourceHit } from './render/source-pick';
import { CrossingPicker } from './render/crossing-pick';
import { LinkEditor } from './ui/link-edit';
import { shapeable } from './ui/link-shape';
import type { LinkVia } from './core/crossings';
import { lineHalfWidth } from './render/landcover';
import { ProjectTransportIndex } from './core/project-network';
import type { TransportGraphData } from './core/project-transport';
import { MappedRoadCard } from './ui/mapped-road';
import { StretchEnds } from './ui/stretch-ends';
import { BuildRoadTool, type Placement } from './ui/build-road';
import { strayDistance } from './ui/road-edit';
import { buildInProject, mappedLineKindFor, mappedLineKindOf, registeredBuildKinds, type BuildKind } from './ui/route-kinds';
import './ui/mode-kinds';
import { fitPlacedBend } from './core/bend-fit';
import { routeIndicationHeight } from './render/route-indication'; // Build → Motorway / Railway, rebuilding mapped railways
import { RoadNet } from './core/roadnet';
import { groundRoadSourceInfo } from './core/project-promotion';
import { BuildingPicker } from './render/building-pick';
import { objectDataKey, paintWallOverride, setBuildingOverride } from './core/build-controls';
import { DecisionList } from './ui/build-tools';
import { buildingInfo, Inspector, type Sel } from './ui/inspector';
import { pieceAt } from './ui/pieces';
import { createNoiseModel } from './core/road-noise';
import { buildingLevels } from './core/buildings';
import { NoiseLayer } from './render/noise';
import { View } from './render/view';
import { endpointJunctions, loadPack } from './scenario';
import { startDesign } from './state';
import { openProjectStore } from './project-store';
import { hasProjectSave } from './project-store-contract';
import { makeLegacyProjectContext, replaceRouteFromLegacy, projectFromLegacyDesign } from './core/project-legacy';
import type { Anchor, ProjectDesign, ProjectResult, ProjectSnapshot, RouteId, RouteResult, SourceInterval } from './core/project';
import { acceptsProjectMessage, type ProjectWorkerIn, type ProjectWorkerOut } from './core/project-protocol';
import { ActiveRouteStore } from './ui/active-route-store';
import { pickScenario, addScenariosButton } from './ui/scenario-picker';
import { showSaveRecovery } from './ui/save-recovery';
import { StorageGuard, showStorageNotice } from './ui/storage-guard';
import { RouteBar } from './ui/route-bar';
import { activeSelection, qualifySelection, type RouteSelection } from './ui/route-selection';
import { CurveEditor } from './ui/curve-edit';
import { Hud } from './ui/hud';
import { ProfilePanel } from './ui/profile';
import { provisionalProfile } from './ui/provisional';
import { ViewBar, type ViewPrefs } from './ui/viewbar';
import { EditBar } from './ui/editbar';
import type { WorkerIn } from './worker';
import { hideToast, toast } from './ui/toast';
import { Intro } from './ui/intro';

const status = document.getElementById('status')!;
/** a mapped road is hit on its drawn width plus this many pixels (a near miss on empty ground still deselects) */
const SOURCE_PICK_SLACK_PX = 3;
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
  const objectData = objectDataKey(pack.overlays.buildings, pack.overlays.binfo, pack.overlays.net);
  const transportData = pack.transportMeta?.fingerprint ?? null;
  const pricingData = [meta.ground?.fingerprint ?? (meta.ground ? JSON.stringify(meta.ground) : 'unmapped'), meta.watercourses?.sha256 ?? 'raster-water'].join(':');
  const legacyContext = makeLegacyProjectContext({ terrain: pack.terrain, scenario, a: A, b: B },
    { presetId, packId: meta.id, objectData, transportData });
  const positionA = legacyContext.endpoints.a.position, positionB = legacyContext.endpoints.b.position;
  // One deep-cloned scenario factory for first start AND Start over; existing saves never receive defaults.
  const initialRoad = (): Design => ({ ...startDesign(), ...structuredClone(scenario.initial ?? {}) });
  const motorwayMission = scenario.mode === 'motorway', railwayMission = scenario.mode === 'railway';
  // The mission ports come from the same legacy context; the corridor / railway then owns the alignment.
  const roadBase = () => projectFromLegacyDesign({ ...startDesign(), category: 'S9.5', speed: 90 }, legacyContext);
  const initialProject = () => motorwayMission
    ? createMotorwayProject(roadBase(), initialRoad(), { aadt: scenario.traffic, heavyShare: scenario.heavyShare ?? NOISE.heavyShare })
    : railwayMission ? createRailwayProject(roadBase(), initialRoad(), scenario.railTraffic)
    : projectFromLegacyDesign(initialRoad(), legacyContext);
  const openStore = () => openProjectStore({ storage, namespace: { scenarioId: scenario.id, presetId },
    objectData, transportData, pricingData, initial: initialProject,
    mission: motorwayMission ? motorwayMissionOf(legacyContext.mission) : railwayMission ? railwayMissionOf(legacyContext.mission, scenario.railTraffic) : legacyContext.mission,
    // Old single-road saves belong to the road exercise only, never to a motorway or railway mission.
    ...(motorwayMission || railwayMission ? {} : { legacy: { key: `trapla.${scenario.id}`, context: legacyContext, compatibleSemantics: scenario.id === 'd11' && presetId === 'd11' } }),
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
  if (store.route) { A = store.route.endpoints.a.position; B = store.route.endpoints.b.position; }
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const init: WorkerIn = {
    type: 'init', nx: meta.nx, ny: meta.ny, cell: meta.cell, base: meta.heights.base, scale: meta.heights.scale,
    q: pack.q.slice(), lc: pack.lc.slice(), ground: pack.terrain.ground, watercourses: pack.terrain.watercourses?.data, a: A, b: B, buildings: pack.overlays.buildings,
    binfo: pack.overlays.binfo, net: pack.overlays.net, scenario, junctions: endpointJunctions(meta),
    projectEnvironment: { objectData, transportData, pricingData, waterData: meta.watercourses?.sha256 ?? 'raster-water',
      terrainData: JSON.stringify([meta.id, meta.nx, meta.ny, meta.cell, meta.heights]), terrainClass: scenario.terrainClass },
  };
  worker.postMessage(init, [init.q.buffer, init.lc.buffer]);

  setStatus('building terrain…');
  const view = new View(document.getElementById('view')!, document.getElementById('overlay')!, pack, scenario.labels);
  const extras = new RouteExtras(view);
  const otherExtras = new Map<RouteId, { overlay: RouteExtras; result: Result }>();
  const routeScene = new RouteScene(view);
  const noise = new NoiseLayer(view, pack, extras, document.getElementById('view')!, document.getElementById('overlay')!);
  const profileCanvas = document.getElementById('profile-canvas') as HTMLCanvasElement;
  const profile = new ProfilePanel(profileCanvas);
  const editBar = new EditBar(document.getElementById('editbar')!, () => store.undo(), () => store.redo());
  addScenariosButton(document.getElementById('editbar')!);
  const hud = new Hud(document.getElementById('hud')!, scenario);
  const routeBar = new RouteBar(document.getElementById('view')!, registeredBuildKinds());
  const intro = new Intro(document.getElementById('view')!);
  const decisions = new DecisionList(hud.decisions, (n) => { document.getElementById('decisions-count')!.textContent = n ? String(n) : ''; });
  decisions.objectDataChanged = store.objectDataChanged;
  const binfo = (j: number) => { const f = pack.overlays.binfo?.[j]; return buildingInfo(f ?? undefined, buildingLevels(f ? f[1] : 0, f ? f[2] : 0), pack.overlays.buildings[j]); };
  const annotations = new BuildAnnotations(view, document.getElementById('overlay')!, pack);
  const buildingPicker = new BuildingPicker(view, pack);
  // after the HUD: it syncs the HUD's exaggeration select
  const viewBar = new ViewBar(document.getElementById('viewbar')!, view, meta.orthophoto?.attribution, (on) => {
    document.getElementById('attrib')!.innerHTML = [...meta.attribution, ...(on && meta.orthophoto ? [meta.orthophoto.attribution] : [])].join(' · ');
  }, noise);

  let last: Result | null = null;
  let projectFull: ProjectResult | null = null;
  let displayedProject: ProjectResult | null = null;
  let qualifiedSelection: RouteSelection | null = null;
  const missionRouteId = () => projectStore.snapshot.design.routes.find(r => r.role === 'mission')?.id;
  /** exactly the one legacy road: the unchanged single-road score/verdict applies (core's facade) */
  const legacyFacade = () => {
    const d = projectStore.snapshot.design, only = d.routes[0];
    return d.routes.length === 1 && !d.corridors.length && !d.connections.length && only.role === 'mission' && !only.source
      && store.activeRouteId === only.id && store.read() !== null;
  };
  /** the active road's live drag price (≈), until the next full result */
  let activePreviewPrice: number | null = null;
  /** player names of the routes; a motorway's two directions are one motorway (its forward name) */
  const routeNames = () => {
    const d = projectStore.snapshot.design, names = Object.fromEntries(d.routes.map(r => [r.id, r.name]));
    for (const c of d.corridors) if (names[c.children.forward]) names[c.children.reverse] = names[c.children.forward];
    return names;
  };
  const projectScore = (pending: boolean) => {
    const mission = missionRouteId(), active = store.activeRouteId, alone = projectFull?.cost.alone ?? {};
    // "Our road only" / "This railway only": what the price shown is for, in the active line's own word
    const word = (id: RouteId | null | undefined) => { const k = projectStore.snapshot.design.routes.find(r => r.id === id)?.kind; return k === 'railway' ? 'railway' : k === 'motorway' ? 'motorway' : 'road'; };
    const only = (id: RouteId | null | undefined) => `${id === mission ? 'Our' : 'This'} ${word(id)} only`;
    const own = activePreviewPrice !== null ? { total: activePreviewPrice, approx: true, label: only(active) }
      : active && active in alone ? { total: alone[active], approx: false, label: only(active) }
        : mission && mission in alone ? { total: alone[mission], approx: false, label: only(mission) } : null;
    hud.setProject(projectFull, pending, projectStore.best, { missionRouteId: mission, legacy: legacyFacade(), ownPrice: own,
      activeRouteId: active ?? undefined, names: routeNames(),
      lengths: Object.fromEntries(Object.values(projectFull?.routes ?? {}).flatMap(r => {
        const length = r.legacy?.length ?? r.surface?.points.at(-1)?.s; return length === undefined ? [] : [[r.routeId, length]];
      })) });
  };
  let posted = 0, received = 0;
  /** main-thread ms per consumer of the last handled result (drag-perf probe) */
  const handlerTiming: Record<string, number> = {};
  let idleWaiters: (() => void)[] = [];

  // ---- the selection: one thing at a time, shown in the inspector, on the map and in the profile ----
  let sel: Sel | null = null;
  /** shaping reroutes on the map (constructed once the store hooks exist) */
  let linkEdit: LinkEditor | undefined;
  let models: { key: string; model: ReturnType<typeof createNoiseModel> } | null = null;
  const inspector = new Inspector(document.getElementById('inspector')!, {
    noiseModel: (d) => {
      // the active route's own acoustic inputs, as its evaluation used them (road, motorway, railway)
      const route = store.route, design = projectStore.snapshot.design;
      const corridor = route?.kind === 'motorway' ? corridorOfRoute(design, route.id) : undefined;
      const ops = corridor ? corridorOperations(design, corridor) : route?.kind === 'road' ? route.specification.operations : null;
      const key = route?.kind === 'railway' ? `rail:${JSON.stringify(route.specification.operations)}`
        : `${d.category}:${d.speed}:${ops?.aadt ?? scenario.traffic}:${ops?.heavyShare ?? scenario.heavyShare}`;
      if (!models || models.key !== key) models = { key, model: route?.kind === 'railway' ? createRailNoiseModel(railTraffic(route))
        : createNoiseModel(ops?.aadt ?? scenario.traffic, d.speed, { heavyShare: ops?.heavyShare ?? scenario.heavyShare,
          ...(corridor ? { profile: 'motorway' as const } : {}) }) };
      return models.model;
    },
    building: binfo,
    maxRadius: (i) => curveEdit.maxRadius(i),
  });
  // ---- base roads: any mapped road can be inspected and offered for change (one inspector card) ----
  // The transport graph is not part of startup: its bytes are fetched when idle after the first frame
  // and parsed on first need (base-road click, photo overlay, a project that already rebuilds roads).
  let transportIndex: ProjectTransportIndex | null = null, sourcePicker: SourcePicker | null = null;
  let transportGraph: TransportGraphData | null = null, sourceEditor: MappedRoadCard | null = null, stretchEnds: StretchEnds | null = null;
  const syncEnds = () => (stretchEnds as StretchEnds | null)?.sync(store.route);
  const inspectorEl = document.getElementById('inspector')!;
  const claimedSources = () => projectStore.snapshot.design.routes.flatMap(r => r.source?.intervals ?? []);
  let transportReady: Promise<void> | null = null;
  const ensureTransport = () => transportReady ??= (async () => {
    let graph: TransportGraphData | null;
    try { graph = await pack.loadTransport(); } catch (error) {
      // Visible, and retried on the next need (a click on a road, the photo, a reload of a project).
      console.warn('Road map links are unavailable', error); transportReady = null;
      toast(error instanceof Error && /Reload|Rebuild/.test(error.message) ? error.message : 'Mapped roads could not be loaded. Click a road to try again.');
      return;
    }
    if (!graph || !pack.vectors || !transportData) return;
    try {
      transportIndex = new ProjectTransportIndex(graph, transportData, graph.vectorData, pack.terrain);
      // only the drawn road is clickable: its drawn width at the local scale (map or photo overlay), plus slack
      sourcePicker = new SourcePicker(graph, pack.vectors, (layer, res) => lineHalfWidth(layer, res, view.photoWithNetwork));
    } catch (error) { console.warn('Road map links are unavailable', error); transportIndex = null; sourcePicker = null; return; }
    transportGraph = graph;
    const editor = sourceEditor = new MappedRoadCard(() => inspectorEl, view, transportIndex, claimedSources);
    editor.onClose = () => select(null);
    const ends = stretchEnds = new StretchEnds(document.getElementById('overlay')!, view, transportIndex,
      () => projectStore.snapshot.design.routes.flatMap(r => (r.source?.intervals ?? []).map(interval => ({ routeId: r.id, interval }))));
    ends.onMove = (id, s0, s1) => {
      const kind = mappedLineKindOf(store.route!);
      try { if (!kind) throw new Error('No kind moves these ends'); store.editProject(d => { const next = kind.moveEnds(transportIndex!, d, id, s0, s1); Object.assign(d, next); }); }
      catch (error) { console.warn('Stretch ends not moved', error); toast('The rebuilt stretch cannot end there.'); ends.sync(store.route); }
    };
    ends.sync(store.route);
    // Road links let the game change mapped roads: the worker learns which legacy way each mapped road is.
    // ... and where each mapped railway runs (what a rebuilt railway stretch takes up).
    worker.postMessage({ type: 'source-ways', ways: graph.sources.flatMap(s => s.legacyNetIndex === undefined ? [] : [[s.id, s.legacyNetIndex]]),
      rails: graph.sources.flatMap(s => s.kind === 'railway' ? [[s.id, s.xy, s.stations]] : []) } satisfies WorkerIn);
    view.setTransport(graph);
  })();
  // A saved project that already rebuilds mapped roads needs the graph before its first scene.
  if (claimedSources().length) await ensureTransport();
  view.onNeedTransport = () => { void ensureTransport(); };
  if (viewBar.photo) void ensureTransport(); // the photo was already on from the saved view
  const buildTool = new BuildRoadTool(() => inspector.host(), document.getElementById('overlay')!, view);
  /** Without road links (an older map pack) mapped roads are still recognised, to say why they cannot change. */
  let legacyNet: RoadNet | null = null;
  const legacyRoadAt = (x: number, y: number) => {
    if (transportData || !pack.overlays.net) return false;
    legacyNet ??= new RoadNet(pack.overlays.net);
    return legacyNet.nearestWay(x, y, Math.max(4, 4 * view.metresPerPixel)) !== undefined;
  };
  // a rebuilt stretch's ends carry their own drag handles (labelled), so the tick stays unlabelled
  /** a side road's end on another road follows that road: its drawn end is where it was built */
  const endAt = (end: 'a' | 'b') => {
    const route = store.route, r = route && projectFull?.routes[route.id]?.legacy;
    if (!route || route.endpoints[end].anchor.kind !== 'route' || !r) return route?.endpoints[end].position;
    const i = end === 'a' ? 0 : r.n - 1; return { x: r.x[i], y: r.y[i], z: r.grade[i] };
  };
  // the motorway's return direction starts at B
  const reversed = () => !!store.route && projectStore.snapshot.design.corridors.some(c => c.children.reverse === store.route!.id);
  const activeEndpoints = () => ({
    a: { ...(endAt('a') ?? positionA), label: store.route?.role === 'mission' ? (reversed() ? scenario.labels.b : scenario.labels.a) : store.route?.source ? '' : 'Start' },
    b: { ...(endAt('b') ?? positionB), label: store.route?.role === 'mission' ? (reversed() ? scenario.labels.a : scenario.labels.b) : store.route?.source ? '' : 'End' },
    plain: !!store.route && store.route.role !== 'mission',
  });
  const selectedPi = () => (sel?.kind === 'bend' ? sel.i : null);
  const stationNear = (x: number, y: number) => {
    if (!last) return 0;
    let bd = Infinity, s = 0;
    for (let k = 0; k < last.n; k += 2) { const d = (last.x[k] - x) ** 2 + (last.y[k] - y) ** 2; if (d < bd) { bd = d; s = last.s[k]; } }
    return s;
  };
  /** where the selection is: map point and station range */
  const placeOf = (t: Sel): { x: number; y: number; s0: number; s1: number } | null => {
    const r = last;
    if (!r) return null;
    const at = (s: number) => { const i = Math.max(0, Math.min(r.n - 1, Math.round(s / r.ds))); return { x: r.x[i], y: r.y[i] }; };
    switch (t.kind) {
      case 'stretch': return { ...at((t.s0 + t.s1) / 2), s0: t.s0, s1: t.s1 };
      case 'pin': return { ...at(t.s), s0: t.s, s1: t.s };
      case 'vpi': { const v = r.vpis[t.i]; return v ? { ...at(v.s), s0: v.s, s1: v.s } : null; }
      case 'bend': { const p = store.design.pis[t.i], b = bendStations(r, store.design)[t.i]; return p && b ? { x: p.x, y: p.y, s0: b.s, s1: b.s } : null; }
      case 'crossing': { const c = r.crossings.find((c) => c.roadId === t.roadId); return c ? { x: c.x, y: c.y, s0: c.s, s1: c.s } : null; }
      case 'building': {
        const b = pack.overlays.buildings[t.j];
        if (!b) return null;
        const s = stationNear(b[0], b[1]);
        return { x: b[0], y: b[1], s0: s, s1: s };
      }
    }
  };
  /** select `next` everywhere; `fly`: bring it into view on the map (if off screen) and in the profile */
  let selectGeneration = 0; // a deferred base-road pick yields to any later selection
  const select = (next: Sel | null, fly = false) => {
    selectGeneration++;
    if (sourceEditor?.selected) sourceEditor.clear();
    if (buildTool.active) buildTool.cancel(false);
    // a house belongs to the project: its card shows the road whose noise reaches it most
    if (next?.kind === 'building' && projectFull?.complete && Object.keys(projectFull.routes).length > 1) {
      const contributions = projectFull.receivers.find(r => r.buildingIndex === next.j)?.contributions ?? [];
      const owner = contributions.reduce<(typeof contributions)[number] | null>((a, c) => (!a || c.dayEnergy > a.dayEnergy ? c : a), null)?.routeId;
      if (owner && owner !== store.activeRouteId) switchRoute(owner);
    }
    qualifiedSelection = store.activeRouteId ? qualifySelection(store.activeRouteId, next) : null;
    sel = activeSelection(store.activeRouteId, qualifiedSelection);
    if (next) intro.hide();
    const range = next?.kind === 'stretch' ? { s0: next.s0, s1: next.s1 } : null;
    profile.setSelection(range); extras.setRange(range); hud.setRange(range);
    if (store.read()) view.setDesign(store.design, selectedPi(), activeEndpoints());
    else view.clearDesign(activeEndpoints());
    profile.selectBend(selectedPi()); if (store.read()) curveEdit.refresh();
    linkEdit?.refresh();
    const road = next?.kind === 'crossing' ? next.roadId : null;
    profile.selectCrossing(road); annotations.selectCrossing(road);
    annotations.selectBuilding(next?.kind === 'building' ? next.j : null);
    profile.selectStation(next?.kind === 'pin' ? next.s : null);
    profile.select(next?.kind === 'vpi' ? next.i : null);
    inspector.set(next);
    if (!next && !store.read()) routeCard();
    if (next) {
      const p = placeOf(next);
      if (p) {
        profile.reveal(p.s0, p.s1);
        if (fly) {
          const q = view.project(p.x, p.y, pack.terrain.heightAt(p.x, p.y));
          const box = view.renderer.domElement.getBoundingClientRect();
          const off = !q.vis || q.sx < 40 || q.sy < 40 || q.sx > box.width - 40 || q.sy > box.height - 40;
          if (off) view.flyTo(p.x, p.y, Math.max(900, Math.min(6000, (p.s1 - p.s0) * 1.6)));
        }
      }
      hud.revealContext('inspector');
    }
  };
  /** the active route's card when the road widgets cannot edit it: a proposed change on map geometry */
  const routeCard = () => {
    const route = store.route, result = route ? projectFull?.routes[route.id] : undefined;
    if (!route || store.read()) { inspector.clear(route ? 'This road has not been checked yet.' : 'Choose a road to inspect.'); return; }
    const root = inspector.host(), h = document.createElement('div'), title = document.createElement('b'), close = document.createElement('button');
    root.replaceChildren(); root.className = 'card ctx inspector k-proposal';
    h.className = 'ctx-h'; title.textContent = route.name; close.className = 'x'; close.textContent = '✕'; close.title = 'Close';
    close.onclick = () => { const mission = missionRouteId(); if (mission) switchRoute(mission); };
    h.append(title, close);
    const state = document.createElement('div'); state.className = 'ctx-state'; state.textContent = 'Proposed change · not checked yet';
    const note = document.createElement('p'); note.textContent = 'The old road stays until this change is checked.';
    const length = route.alignment.kind === 'reference' ? route.alignment.path[route.alignment.path.length - 1].s : result?.surface?.points.at(-1)?.s;
    const size = document.createElement('div'); size.className = 'sub'; size.textContent = length ? `${Math.round(length)} m` : '';
    const remove = document.createElement('button'); remove.type = 'button'; remove.id = 'remove-route'; remove.textContent = 'Remove change';
    remove.onclick = () => {
      if (!projectStore.snapshot.design.routes.some(r => r.id === route.id) || projectStore.inTransaction) return;
      const mission = missionRouteId(); projectStore.dispatch({ type: 'delete-route', routeId: route.id });
      if (mission && mission !== route.id) switchRoute(mission);
    };
    root.append(h, state, note, size, remove);
  };
  /** A side road's own header (nothing selected): what it is, its traffic, and how to undo it. */
  let strayKey = '', stray = 0;
  inspector.routeHead = () => {
    const route = store.route, r = last;
    if (!route || route.role === 'mission' || route.kind !== 'road' || !r) return null;
    const op = route.specification.operations;
    const head = document.createElement('div'); head.className = 'route-head';
    const h = document.createElement('div'); h.className = 'ctx-h';
    const title = document.createElement('b'); title.textContent = route.name;
    const sub = document.createElement('small'); sub.textContent = `${(r.length / 1000).toFixed(2)} km`;
    h.append(title, sub);
    const what = document.createElement('div'); what.className = 'sub';
    const interval = route.source?.intervals[0];
    if (interval && transportIndex) {
      const key = `${route.id}:${route.revision}:${r.n}:${r.x[r.n >> 1]}`;
      if (key !== strayKey) {
        strayKey = key;
        try {
          const old = transportIndex.path(interval), line = Array.from({ length: Math.ceil(r.n / 2) }, (_, k) => ({ x: r.x[2 * k], y: r.y[2 * k] }));
          stray = strayDistance(line, old);
        } catch { stray = NaN; }
      }
      const accepted = projectFull?.acceptedReplacements.some(i => i.sourceId === interval.sourceId && i.s0 === interval.s0 && i.s1 === interval.s1);
      what.textContent = `Rebuilt stretch: its line is drawn as bends${Number.isFinite(stray) ? `, up to ${Math.round(stray)} m from the old road` : ''}. ${accepted
        ? 'The old road is gone where the new line leaves it.' : 'The old road stays until the change can be priced.'}`;
    } else {
      const end = (e: typeof route.endpoints.a) => e.anchor.kind === 'free' ? 'open ground'
        : e.anchor.kind === 'route' ? (() => { const host = projectStore.snapshot.design.routes.find(q => q.id === (e.anchor as { routeId: string }).routeId);
          return !host ? 'a road' : host.role === 'mission' ? 'our road' : host.name; })()
        : e.anchor.kind === 'source' ? (() => { const t = transportIndex?.source((e.anchor as { location: { sourceId: string } }).location.sourceId)?.tags;
          return t?.name || [ROAD_CLASSES[t?.highway ?? '']?.label ?? 'a road', t?.ref].filter(Boolean).join(' '); })() : 'a scenario end';
      what.textContent = `New road from ${end(route.endpoints.a)} to ${end(route.endpoints.b)}.`;
    }
    const form = document.createElement('form'); form.className = 'source-operations route-traffic';
    const fields: HTMLInputElement[] = [];
    for (const [key, label, unit, value] of [
      ['traffic', 'Traffic', 'vehicles/day', op.trafficUnknown ? '' : String(op.aadt)],
      ['heavy', 'Heavy vehicles', '%', op.trafficUnknown ? '' : String(Math.round(op.heavyShare * 1000) / 10)],
    ] as const) {
      const row = document.createElement('label'); row.textContent = label;
      const input = document.createElement('input'); input.type = 'number'; input.required = true; input.min = '0';
      input.max = key === 'traffic' ? '100000' : '100'; input.step = key === 'traffic' ? '1' : 'any'; input.name = key; input.value = value;
      const small = document.createElement('small'); small.textContent = unit;
      row.append(input, small); form.append(row); fields.push(input);
    }
    const apply = () => {
      const [traffic, heavy] = fields.map(f => f.value === '' ? NaN : Number(f.value));
      if (!(traffic >= 0 && traffic <= 100000 && heavy >= 0 && heavy <= 100)) return;
      const id = route.id;
      store.editProject(d => {
        const q = d.routes.find(x => x.id === id); if (!q || q.kind !== 'road') return;
        const { trafficUnknown: _unknown, ...rest } = q.specification.operations;
        q.specification.operations = { ...rest, aadt: Math.round(traffic), heavyShare: heavy / 100 };
      });
    };
    for (const f of fields) f.onchange = apply;
    form.onsubmit = e => { e.preventDefault(); apply(); };
    const remove = document.createElement('button'); remove.type = 'button'; remove.id = 'remove-route';
    remove.textContent = route.source ? 'Keep the old road' : 'Remove road';
    remove.onclick = () => {
      if (projectStore.inTransaction) return;
      const mission = missionRouteId();
      try { projectStore.dispatch({ type: 'delete-route', routeId: route.id }); }
      catch { toast('Another road joins this one: remove that road first.'); return; }
      if (mission) switchRoute(mission);
      toast(route.source ? 'The old road is kept.' : 'Road removed.', 'Undo', () => store.undo());
    };
    // what replacing the old stretch adds to this road's own price (C1 b)
    const works = projectFull?.works.items.filter(w => w.owner.kind === 'route' && w.owner.id === route.id && w.label) ?? [];
    const list = document.createElement('ul'); list.className = 'route-works';
    for (const w of works) {
      const li = document.createElement('li'), label = document.createElement('span'), cost = document.createElement('b');
      label.textContent = w.label!; cost.textContent = `${(w.cost / 1e6).toFixed(w.cost < 1e7 ? 1 : 0)} M CZK`;
      li.append(label, cost);
      if (w.at) li.onclick = () => { view.flyTo(w.at!.x, w.at!.y, 700); };
      list.append(li);
    }
    // each end that joins a road: its junction, Auto (a priority T) or a roundabout — plain choices
    const junctions = document.createElement('div'); junctions.className = 'route-junctions';
    if (!route.source && route.alignment.kind === 'pi') for (const end of ['a', 'b'] as const) {
      const anchor: Anchor = route.endpoints[end].anchor;
      const cls: string | undefined = anchor.kind === 'source' ? transportIndex?.source(anchor.location.sourceId)?.tags.highway : anchor.kind === 'route' ? 'designed' : undefined;
      if (!cls || ROAD_CLASSES[cls]?.noAtGrade) continue;
      const row = document.createElement('div'); row.className = 'ctx-row';
      const label = document.createElement('span'); label.textContent = end === 'a' ? 'Start junction' : 'End junction';
      const choice = document.createElement('div'); choice.className = 'seg choice';
      const current = route.alignment.controls.junctionForms?.[end];
      const options: [string, 'roundabout' | undefined, string][] = [['Auto', undefined, 'A priority T junction (research/29)']];
      if (cls === 'designed' || ROUNDABOUT_HOSTS.includes(cls)) options.push(['Roundabout', 'roundabout', `A roundabout, ${Math.round(ENDPOINT_JUNCTIONS.roundabout.cost / 1e6)} M CZK plus its ring's land (ŘSD awards, research/08)`]);
      if (options.length < 2) continue;
      for (const [text, value, title] of options) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.title = title; b.dataset.end = end;
        b.className = current === value ? 'on' : ''; b.setAttribute('aria-pressed', String(current === value));
        b.onclick = () => {
          if (current === value) return;
          const id = route.id;
          store.editProject(d => {
            const q = d.routes.find(x => x.id === id); if (!q || q.alignment.kind !== 'pi') return;
            const forms = { ...q.alignment.controls.junctionForms };
            if (value) forms[end] = value; else delete forms[end];
            if (Object.keys(forms).length) q.alignment.controls.junctionForms = forms; else delete q.alignment.controls.junctionForms;
          });
        };
        choice.append(b);
      }
      row.append(label, choice); junctions.append(row);
    }
    head.append(h, what, ...(junctions.childElementCount ? [junctions] : []), ...(works.length ? [list] : []), form, remove);
    return head;
  };
  const showSource = (hit: SourceHit) => {
    if (!sourceEditor) return;
    select(null); inspector.host(); sourceEditor.show(hit); hud.revealContext('inspector');
  };
  const showNoLinks = () => {
    select(null);
    const root = inspector.host(), h = document.createElement('div'), title = document.createElement('b'), close = document.createElement('button');
    root.replaceChildren(); root.className = 'card ctx inspector k-source';
    h.className = 'ctx-h'; title.textContent = 'Road'; close.className = 'x'; close.textContent = '✕'; close.title = 'Close (Esc)'; close.type = 'button';
    close.onclick = () => select(null); h.append(title, close);
    const p = document.createElement('p'); p.textContent = 'This map’s roads cannot be changed yet: its road links are missing.';
    root.append(h, p); hud.revealContext('inspector');
  };
  const selectPiece = (s: number, fly = false) => {
    if (!last) return;
    const p = pieceAt(last, s);
    select({ kind: 'stretch', s0: p.s0, s1: p.s1, piece: p.kind }, fly);
  };
  /** after a recompute: drop a selection that no longer exists, refresh a piece's kind */
  const revalidate = (r: Result, d: Design) => {
    if (!sel) return;
    if ((sel.kind === 'bend' && !d.pis[sel.i]) || (sel.kind === 'pin' && !d.gradePins?.some((p) => Math.abs(p.s - (sel as { s: number }).s) < 0.1))
      || (sel.kind === 'crossing' && !r.crossings.some((c) => c.roadId === (sel as { roadId: number }).roadId))
      || (sel.kind === 'vpi' && (d.profileMode !== 'manual' || sel.i >= r.vpis.length - 1))
      || (sel.kind === 'stretch' && sel.s0 >= r.length)) { select(null); return; }
    if (sel.kind === 'stretch' && sel.piece) { sel = { ...sel, piece: pieceAt(r, (sel.s0 + sel.s1) / 2).kind }; inspector.sel = sel; }
  };

  // ---- edits ----
  const cellsRange = (s0: number, s1: number) => {
    if (!last) return null;
    const [i0, i1] = cellsInRange(last, Math.max(0, s0), Math.min(s1, last.length));
    return { s0: Math.max(0, (i0 - 0.5) * last.ds), s1: Math.min(last.length, (i1 + 0.5) * last.ds) };
  };
  const setStructure = (kind: StructureKind | null, a: number, b: number) => {
    const range = cellsRange(a, b);
    if (!range) return;
    const previous = store.design.structureOverrides ?? [];
    const next = paintOverride(previous, range.s0, range.s1, kind);
    if (JSON.stringify(previous) !== JSON.stringify(next)) store.update((d) => { d.structureOverrides = next; });
  };
  const setWall = (sides: ('L' | 'R')[], height: number | null, a: number, b: number) => {
    const range = cellsRange(a, b);
    if (!range) return;
    const previous = store.design.wallOverrides ?? [];
    const next = sides.reduce((o, side) => paintWallOverride(o, range.s0, range.s1, side, height), previous);
    if (JSON.stringify(previous) !== JSON.stringify(next)) store.update((d) => { d.wallOverrides = next; });
  };
  const setPin = (s: number, z: number | null, commit = true) => store.update((d) => {
    d.gradePins = (d.gradePins ?? []).filter((p) => Math.abs(p.s - s) >= 0.1);
    if (z !== null) d.gradePins.push({ s, z });
    d.gradePins.sort((a, b) => a.s - b.s);
  }, commit);
  /** a field half-typed in the card applies to what it belongs to before indices shift */
  const commitFields = () => { const a = document.activeElement as HTMLElement | null; if (a && document.getElementById('inspector')?.contains(a)) a.blur(); };
  const deletePi = (i: number) => { commitFields(); store.update((d) => { d.pis.splice(i, 1); }); select(null); };
  const takeProfile = (d: Design) => {
    if (d.profileMode === 'auto' && last) d.vpis = last.vpis.map((v) => ({ ...v }));
    d.profileMode = 'manual';
    // keep the stored list identical to what the evaluator uses, so panel indices match the design
    if (last) d.vpis = normalizeVpis(d.vpis, last.length, last.vpis[0].z, last.vpis[last.vpis.length - 1].z);
  };
  /** Auto: pin the road's current height at station s; By hand: add a height point */
  const addHeightAt = (s: number) => {
    if (!last) return;
    const i = Math.max(0, Math.min(last.n - 2, Math.floor(s / last.ds))), t = (s - last.s[i]) / last.ds;
    const z = Math.round((last.grade[i] + t * (last.grade[i + 1] - last.grade[i])) * 10) / 10;
    if (store.design.profileMode === 'manual') { profile.ev.onVpiAdd?.(s, z); return; }
    if (!store.design.gradePins?.some((p) => Math.abs(p.s - s) < 0.1)) setPin(s, z);
    select({ kind: 'pin', s });
  };
  inspector.ev = {
    close: () => select(null),
    select: (t) => select(t, true),
    structure: setStructure,
    wall: setWall,
    pin: (s, z) => setPin(s, z),
    crossing: (roadId, type) => store.update((d) => {
      // a reroute keeps the player's shape while it stays a reroute
      const kept = type === 'reconnection' ? d.crossingOverrides?.find((o) => o.roadId === roadId && o.via) : undefined;
      d.crossingOverrides = (d.crossingOverrides ?? []).filter((o) => o.roadId !== roadId);
      if (type !== null) d.crossingOverrides.push({ roadId, type, ...(kept ? { via: kept.via, ...(kept.to !== undefined ? { to: kept.to } : {}) } : {}) });
    }),
    crossingPathAuto: (roadId) => setVia(roadId, null, true),
    building: (js, action) => store.editProject(d => { for (const j of js) d.buildingOverrides = setBuildingOverride(d.buildingOverrides, j, action); }),
    unpin: (s0, s1) => store.update((d) => { d.gradePins = (d.gradePins ?? []).filter((p) => p.s < s0 || p.s > s1); }),
    heightAt: (s) => addHeightAt(s),
    commit: () => store.commit(),
    radius: (i, r, commit = true) => store.update((d) => { if (d.pis[i]) d.pis[i].r = r; }, commit),
    deletePi,
    bendHeight: (i) => { const b = last && bendStations(last, store.design)[i]; if (b) addHeightAt(Math.round(b.s)); },
    vpiRadius: (i, r) => store.update((d) => { takeProfile(d); if (d.vpis[i]) d.vpis[i].r = r; }),
    deleteVpi: (i) => { commitFields(); store.update((d) => { takeProfile(d); d.vpis.splice(i, 1); }); select(null); },
  };
  decisions.ev = {
    select: (t) => select(t.kind === 'stretch' && last ? { ...t } : t, true),
    forget: (roadId) => store.update((d) => { d.crossingOverrides = (d.crossingOverrides ?? []).filter((o) => o.roadId !== roadId); }),
  };
  annotations.onPin = (s) => select({ kind: 'pin', s });
  annotations.onBuilding = (j) => select({ kind: 'building', j });
  annotations.onCulvert = (s) => selectPiece(s);

  // ---- evaluation in the worker ----
  // designs of in-flight requests: intermediate results are shown (live feedback while dragging), but
  // always rendered with the design they were computed for
  const inflight = new Map<number, { snapshot: ProjectSnapshot; design: Design | null; routeId: RouteId | null }>();
  // While the worker lags behind a drag (an older request is still running), show the moved
  // route's ground with the previous heights at once, at most once per frame. Display only.
  let previewFrame = 0;
  const schedulePreview = () => {
    if (previewFrame || received >= posted - 1 || !last) return;
    previewFrame = requestAnimationFrame(() => {
      previewFrame = 0;
      if (received < posted && last && store.read()) profile.setPreview(provisionalProfile(A, B, store.design, last, (x, y) => pack.terrain.heightAt(x, y)));
    });
  };
  // Two tiers: while a drag is in progress (uncommitted store updates) the worker runs the fast
  // preview evaluation and only cheap things follow it (centreline, profile, "≈" total); the full
  // evaluation, the 3D rebuild, the inspector and any best score follow once the drag pauses or ends.
  const FULL_AFTER_IDLE_MS = 150;
  let fullTimer = 0;
  let previewGesture: { id: string; sequence: number; lastDisplayedSequence: number } | null = null;
  /** the newest request: a full one for this design needs no repeat when the drag ends */
  let lastPost: { full: boolean; identity: string } | null = null;
  /** last full result: the preview's single auto-profile solve is priced at its material value */
  let lastFull: Result | null = null;
  /** the newest request is a full one and its result is in (the 3D rebuild may still run) */
  const settled = () => received === posted && !fullTimer;
  /** …and its 3D scene is up (whenIdle) */
  const sceneIdle = () => settled() && !heavy;
  /** the full result's 3D rebuild, run in slices between frames (see render/slices.ts) */
  let heavy: SlicedJob | null = null;
  let heavyStats = { slices: 0, busy: 0, maxSlice: 0, wall: 0, commit: 0, commitView: 0, commitCrossings: 0, overlays: 0 };
  const requestEval = (preview = false) => {
    clearTimeout(fullTimer); fullTimer = 0;
    const snapshot = projectStore.snapshot, identity = `${snapshot.epoch}:${snapshot.revision}`;
    if (!preview && lastPost?.full && lastPost.identity === identity) return;
    heavy?.cancel(); heavy = null; // a rebuild for an older design would only be thrown away
    hud.setProfileBusy(true);
    posted++;
    lastPost = { full: !preview, identity };
    inflight.set(posted, { snapshot, design: store.read(), routeId: store.activeRouteId });
    if (preview && !previewGesture) previewGesture = { id: crypto.randomUUID(), sequence: 0, lastDisplayedSequence: -1 };
    const message: ProjectWorkerIn = preview && store.activeRouteId
      ? { type: 'project-preview', id: posted, snapshot, routeId: store.activeRouteId, materialValue: lastFull?.quantities.materialValue,
          gesture: { id: previewGesture!.id, sequence: ++previewGesture!.sequence } }
      : { type: 'project-eval', id: posted, snapshot, displayedResult: displayedProject && { epoch: displayedProject.epoch, revision: displayedProject.revision } };
    worker.postMessage(message);
    projectScore(true);
    if (preview) fullTimer = window.setTimeout(() => { fullTimer = 0; requestEval(false); }, FULL_AFTER_IDLE_MS);
    schedulePreview();
  };
  const settle = () => {
    // the worker caught up with the newest request: no stretched provisional profile any more
    if (received === posted) profile.setPreview(null);
    if (!settled()) return;
    hud.setProfileBusy(false);
    if (!sceneIdle()) return;
    const w = idleWaiters; idleWaiters = []; w.forEach((f) => f());
    if (!transportPrefetched && pack.transportMeta) {
      // After the first settled scene, in idle time: download + verify the graph bytes only.
      transportPrefetched = true;
      const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200));
      idle(() => { pack.prefetchTransport().catch(error => console.warn('Road map links are unavailable', error)); });
    }
  };
  let transportPrefetched = false;

  const syncDecorations = (result: ProjectResult) => {
    view.setProposals(projectStore.snapshot.design.routes.flatMap(route => {
      const rr = result.routes[route.id];
      return rr && !rr.legacy && rr.surface ? [{ id: route.id, key: rr.engineeringRevision, active: route.id === store.activeRouteId, points: rr.surface.points }] : [];
    }));
    for (const [id, entry] of otherExtras) if (!result.routes[id]?.legacy) { entry.overlay.dispose(); otherExtras.delete(id); }
    for (const route of projectStore.snapshot.design.routes) {
      const r = result.routes[route.id]?.legacy;
      const splitDirection = route.kind === 'motorway' && route.alignment.kind === 'pi';
      if (!r || (route.kind !== 'road' && route.kind !== 'railway' && !splitDirection)) continue;
      const crown = route.kind === 'railway' ? CATEGORIES[route.specification.tracks === 1 ? 'R1' : 'R2'].crownWidth
        : route.kind !== 'road' ? CATEGORIES[CARRIAGEWAY_CATEGORY].crownWidth
        : route.specification.crossSection === 'existing' ? route.specification.existingWidth! : CATEGORIES[route.specification.crossSection].crownWidth;
      const controls = route.alignment.kind === 'corridor' ? {} : route.alignment.controls;
      const entry = otherExtras.get(route.id);
      if (route.id === store.activeRouteId) { entry?.overlay.setVisible(false); continue; }
      if (entry) { entry.overlay.setVisible(true); if (entry.result !== r) { entry.overlay.setResult(r, crown, controls.structureOverrides, controls.wallOverrides); entry.result = r; } }
      else { const overlay = new RouteExtras(view); overlay.setResult(r, crown, controls.structureOverrides, controls.wallOverrides); otherExtras.set(route.id, { overlay, result: r }); }
    }
    const r = store.activeRouteId ? result.routes[store.activeRouteId]?.legacy : undefined, d = store.read();
    if (r && d) {
      const crown = CATEGORIES[d.category].crownWidth; extras.setResult(r, crown, d.structureOverrides, d.wallOverrides);
      noise.setResult(r, crown); annotations.setResult(r, d);
    } else { extras.reset(); annotations.clear(); }
  };

  const showActiveResult = () => {
    const rd = store.read(), r = store.activeRouteId ? projectFull?.routes[store.activeRouteId]?.legacy : undefined;
    last = lastFull = r ?? null;
    hud.setRouteState(!!rd, !!r && !!rd);
    document.querySelector<HTMLElement>('.profile-bar > b')!.textContent = store.route ? `Profile · ${store.route.name}` : 'Profile';
    if (!r || !rd) {
      profile.clear(store.route && !store.read() ? 'No heights yet: this change is not checked.' : ''); if (!sourceEditor?.selected) routeCard();
      view.clearDesign(activeEndpoints()); return;
    }
    revalidate(r, rd);
    const cat = CATEGORIES[rd.category];
    profile.setGradeRule({ max: cat.maxGradient?.[scenario.terrainClass] ?? scenario.maxGradient, perMille: cat.mode === 'railway' });
    profile.setResult(r, r.vpis, rd.structureOverrides, rd.gradePins, rd.wallOverrides);
    profile.setMode(rd.profileMode); document.getElementById('profile')!.classList.toggle('manual', rd.profileMode === 'manual');
    profile.setBends(bendStations(r, rd));
    decisions.setResult(r, rd, j => binfo(j).kind);
    inspector.setNetworkPending(!(projectFull?.complete && projectFull.acousticScreen.complete));
    inspector.setResult(r, rd); hud.setDesign(rd); hud.setResult(r, rd, store.best); curveEdit.refresh(); linkEdit?.refresh();
  };

  worker.onmessage = (ev: MessageEvent<ProjectWorkerOut | { type: 'ready' }>) => {
    const m = ev.data;
    if (m.type === 'ready') return;
    const request = inflight.get(m.id);
    for (const k of inflight.keys()) if (k <= m.id) inflight.delete(k);
    if (m.id < received || !acceptsProjectMessage(projectStore.snapshot, m, store.activeRouteId ?? undefined, previewGesture ?? undefined)) return;
    received = m.id;
    if (m.type === 'project-error') {
      console.error('worker error', m.message);
      setStatus('This design could not be computed. Undo the last change.'); settle(); return;
    }
    let lap = performance.now();
    const took = (k: string) => { const now = performance.now(); handlerTiming[k] = now - lap; lap = now; };
    for (const k in handlerTiming) delete handlerTiming[k];
    if (m.type === 'project-preview') {
      if (previewGesture && m.gesture) previewGesture.lastDisplayedSequence = m.gesture.sequence;
      const r = m.result.legacy, rd = request?.design;
      if (r && rd) {
        const shown = r.preview ? r : { ...r, preview: true }; last = shown;
        // a paired motorway is drawn once, under its forward direction
        const drawn = projectStore.snapshot.design.corridors.find(c => c.mode === 'paired' && c.children.reverse === m.routeId)?.children.forward ?? m.routeId;
        routeScene.preview(drawn, shown); took('view');
        profile.setResult(shown, shown.vpis, rd.structureOverrides, rd.gradePins, rd.wallOverrides);
        profile.setMode(rd.profileMode); document.getElementById('profile')!.classList.toggle('manual', rd.profileMode === 'manual');
        profile.setBends(bendStations(shown, rd)); took('profile');
        if (m.routeId === store.activeRouteId) activePreviewPrice = shown.cost.total;
        hud.setResult(shown, rd, store.best); projectScore(true); took('hud');
        curveEdit.refresh(); took('curveEdit');
      }
      if (received < posted) schedulePreview(); settle(); return;
    }
    projectFull = m.result; activePreviewPrice = null;
    // Accepted rebuilt stretches leave the map: their drawn features follow from the road links here.
    if (!m.result.acceptedRenderReplacements.length && m.result.acceptedReplacements.length && transportIndex) {
      const base = transportIndex;
      m.result.acceptedRenderReplacements = m.result.acceptedReplacements.flatMap(i => { try { return base.renderIntervals(i); } catch { return []; } });
    }
    const result = m.result;
    // complete: one road, or roads core priced together after proving they share no houses or noise
    noise.setAvailable(result.complete && result.acousticScreen.complete);
    heavy?.cancel();
    const inputs = projectStore.snapshot.design.routes.flatMap(route => {
      const legacy = result.routes[route.id]?.legacy;
      if (!legacy) return [];
      if (route.kind === 'railway') return [{ id: route.id, result: legacy, crownWidth: CATEGORIES[route.specification.tracks === 1 ? 'R1' : 'R2'].crownWidth, buildingMarkers: result.complete }];
      // A paired motorway is ONE body drawn once (its forward direction carries the shared result).
      if (route.kind === 'motorway') {
        // split: each direction is its own body
        if (route.alignment.kind === 'pi') return [{ id: route.id, result: legacy, crownWidth: CATEGORIES[CARRIAGEWAY_CATEGORY].crownWidth, buildingMarkers: result.complete }];
        const corridor = projectStore.snapshot.design.corridors.find(c => c.children.forward === route.id);
        return corridor?.mode === 'paired' ? [{ id: route.id, result: legacy, crownWidth: CATEGORIES[MOTORWAY_CATEGORY].crownWidth, buildingMarkers: result.complete }] : [];
      }
      if (route.kind !== 'road') return [];
      const crownWidth = route.specification.crossSection === 'existing' ? route.specification.existingWidth! : CATEGORIES[route.specification.crossSection].crownWidth;
      return [{ id: route.id, result: legacy, crownWidth,
        buildingMarkers: result.complete }];
    });
    const started = performance.now(), stats = { slices: 0, busy: 0, maxSlice: 0 };
    heavy = runSliced((function* () {
      let geometry: Staged | undefined, sources: Staged | undefined, handedOver = false;
      try {
        geometry = yield* routeScene.build(inputs, result.buildings.filter(b => b.action === 'demolish').map(b => b.buildingIndex));
        const graph = transportGraph;
        // A project with rebuilt mapped roads (e.g. after undo/reload) whose graph is not parsed yet.
        if (!graph && result.acceptedRenderReplacements.length) void ensureTransport().then(() => { if (transportGraph) requestEval(false); });
        if (graph) sources = yield* view.buildSourceReplacements(graph, result.acceptedRenderReplacements);
        handedOver = true; return [geometry, sources] as const;
      } finally { if (!handedOver) { sources?.dispose(); geometry?.dispose(); } }
    })(), ([geometry, sources]) => {
      const t0 = performance.now(); geometry.commit(); const t1 = performance.now(); sources?.commit(); const t2 = performance.now();
      sourcePicker?.setAccepted(result.acceptedRenderReplacements);
      syncDecorations(result);
      displayedProject = result; heavy = null;
      projectStore.offerBest(result); projectScore(false);
      const t3 = performance.now();
      heavyStats = { ...stats, wall: t3 - started, commit: t3 - t0, commitView: t1 - t0, commitCrossings: t2 - t1, overlays: t3 - t2 };
      settle();
    }, error => {
      console.error('3D rebuild failed', error); setStatus('The 3D view could not be updated.');
      heavy = null; lastPost = null; settle();
    }, 8, stats); took('view');
    showActiveResult(); took('profile'); projectScore(true); took('hud');
    setStatus(''); settle();
  };

  // on-map radius handles for the selected bend (grips, + / −)
  const curveEdit = new CurveEditor(view, document.getElementById('overlay')!, pack.terrain, {
    get a() { return A; }, get b() { return B; }, design: () => store.design, selected: () => selectedPi(), result: () => last,
    setRadius: (i, r, commit) => store.update((d) => { if (d.pis[i]) d.pis[i].r = r; }, commit),
    commit: () => store.commit(),
  });

  /** the motorway direction switch follows the active route */
  const syncDirections = () => {
    const design = projectStore.snapshot.design, route = store.route, corridor = route ? corridorOfRoute(design, route.id) : undefined;
    inspector.oneDirection = corridor?.mode === 'independent';
    // the legend names the line being edited (a motorway built in a railway mission is a motorway)
    const kind = route?.kind ?? scenario.mode ?? 'road';
    document.getElementById('legend-route')!.textContent = kind;
    document.getElementById('legend-height')!.textContent = kind === 'railway' ? 'track height' : 'road height';
    if (!corridor) { hud.setDirections(null); return; }
    // the mission's motorway runs between the scenario's places; any other between its own start and end
    const mission = route!.role === 'mission';
    hud.setDirections({ split: corridor.mode === 'independent', active: corridor.children.reverse === route!.id ? 'reverse' : 'forward',
      places: mission ? { forward: scenario.labels.b, reverse: scenario.labels.a } : { forward: 'its end', reverse: 'its start' } });
  };
  /** a reroute's shape (null: its automatic path again); shaping a crossing makes it a reroute */
  const setVia = (roadId: number, via: LinkVia | null, commit: boolean, to?: number) => store.update((d) => {
    const list = d.crossingOverrides ??= [];
    let o = list.find((x) => x.roadId === roadId);
    if (!o) { if (!via) return; list.push(o = { roadId, type: 'reconnection' }); }
    if (via) { o.type = 'reconnection'; o.via = via; if (o.to === undefined && to !== undefined) o.to = to; } else { delete o.via; delete o.to; }
  }, commit);
  linkEdit = new LinkEditor(view, document.getElementById('overlay')!, {
    selected: () => (sel?.kind === 'crossing' ? sel.roadId : null), result: () => lastFull, design: () => store.design,
    select: (roadId) => { if (sel?.kind !== 'crossing' || sel.roadId !== roadId) select({ kind: 'crossing', roadId }); },
    setVia, commit: () => store.commit(), heightAt: (x, y) => pack.terrain.heightAt(x, y),
  });

  const switchRoute = (id: RouteId, created = false) => {
    if (!store.switchRoute(id, created)) return false;
    syncDirections();
    previewGesture = null; activePreviewPrice = null;
    if (store.route) { A = store.route.endpoints.a.position; B = store.route.endpoints.b.position; }
    sel = activeSelection(id, qualifiedSelection); qualifiedSelection = qualifySelection(id, sel);
    view.setHover(null); extras.setRange(null); profile.fit();
    showActiveResult();
    if (!store.read()) curveEdit.hide();
    select(sel);
    if (projectFull) syncDecorations(projectFull);
    routeBar.set(projectStore.snapshot.design, id, projectStore.inTransaction);
    syncEnds();
    projectScore(!sceneIdle());
    return true;
  };
  store.onHistory = () => select(null);
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
    const hit = routeAt(clientX, clientY, 10), rr = hit && projectFull?.routes[hit.routeId];
    const route = hit && projectStore.snapshot.design.routes.find(r => r.id === hit.routeId);
    if (hit && rr && route) return building.onRoute(route, rr, hit.s);
    const source = sourceAt(clientX, clientY);
    if (source?.kind === 'route-hit') return { ok: false, why: 'This stretch is being rebuilt: join the new road instead.' };
    if (source?.kind === 'source' && transportIndex) return building.onSource(transportIndex, source.hit.sourceId, source.hit.s);
    if (pack.terrain.isOob(x, y)) return { ok: false, why: 'Put the end on the map.' };
    if (legacyRoadAt(x, y)) return { ok: false, why: 'This map’s road links are missing, so a new road cannot join its roads yet. Join our road, or end on open ground.' };
    return { ok: true, label: `open ground (joins no ${building.kind === 'railway' ? 'railway' : 'road'})`, end: { position: { x, y, z: pack.terrain.heightAt(x, y) }, anchor: { kind: 'free' } } };
  };
  routeBar.onSelect = switchRoute;
  routeBar.set(projectStore.snapshot.design, store.activeRouteId);
  syncEnds();
  syncDirections();

  store.on((d, committed) => {
    if (committed) previewGesture = null;
    hideToast(); hud.noteEdit(committed);
    if (store.route) { A = store.route.endpoints.a.position; B = store.route.endpoints.b.position; }
    sel = activeSelection(store.activeRouteId, qualifiedSelection);
    if (d) {
      if (sel?.kind === 'bend' && sel.i >= d.pis.length) select(null);
      view.setDesign(d, selectedPi(), activeEndpoints()); hud.setDesign(d);
      profile.selectBend(selectedPi()); curveEdit.refresh(); linkEdit?.refresh();
    } else { view.clearDesign(activeEndpoints()); profile.clear(); if (!sourceEditor?.selected) routeCard(); curveEdit.hide(); }
    editBar.set(store.undoLabel(), store.redoLabel());
    routeBar.set(projectStore.snapshot.design, store.activeRouteId, projectStore.inTransaction);
    syncEnds();
    syncDirections();
    // a borrowed card (a proposal's) may belong to a road undo just removed: restore the right card
    if (committed && inspector.isHosting && !sourceEditor?.selected) { if (d) inspector.set(sel); else routeCard(); }
    requestEval(!committed);
  });

  // ---- map: click inspects, dragging the road bends it, empty ground deselects ----
  // buildings are pickable once they are a few pixels big
  const buildingsPickable = () => view.metresPerPixel < 3;
  // crossed roads are clickable once they are drawn big enough; from afar a click on the road picks its piece
  const crossingPickPx = () => (view.metresPerPixel < 4 ? 12 : view.metresPerPixel < 10 ? 6 : 0);
  const canvasBox = () => view.renderer.domElement.getBoundingClientRect();
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
  const routeAt = (clientX: number, clientY: number, px: number) => {
    const box = canvasBox();
    const routes = Object.values(projectFull?.routes ?? {}).flatMap(route => {
      const r = route.routeId === store.activeRouteId && last ? last : route.legacy ?? surfacePick(route);
      return r ? [{ id: route.routeId, result: r }] : [];
    });
    return pickRoute(routes, clientX - box.left, clientY - box.top, px,
      (x, y, z) => view.project(x, y, z), (x, y) => view.drape(x, y), store.activeRouteId ?? undefined);
  };
  const roadAt = (clientX: number, clientY: number, px: number) => {
    const hit = routeAt(clientX, clientY, px);
    return hit?.routeId === store.activeRouteId && store.read() ? hit.index : -1;
  };
  const crossingAt = (clientX: number, clientY: number) => {
    const r = last;
    if (!r) return null;
    const box = canvasBox();
    let best = crossingPickPx(), hit: Result['crossings'][number] | null = null;
    for (const c of r.crossings) {
      if (c.roadId === undefined) continue;
      const p = view.project(c.x, c.y, Math.max(r.grade[c.i], r.grade[c.i] - c.h) + 2);
      const gap = Math.hypot(p.sx - (clientX - box.left), p.sy - (clientY - box.top));
      if (p.vis && gap < best) { best = gap; hit = c; }
    }
    return hit;
  };
  /** any drawn geometry a crossing owns (its rebuilt road stretch, reroute links, turning heads,
   * underpass box), on the drawn width plus the same slack as a mapped road */
  const crossingPicker = new CrossingPicker();
  const crossingWorksAt = (clientX: number, clientY: number) => {
    const r = last;
    if (!r || !crossingPickPx()) return null;
    const g = view.pick(clientX, clientY); if (!g) return null;
    crossingPicker.set(r.crossings);
    const box = canvasBox();
    return crossingPicker.at(clientX - box.left, clientY - box.top, g.x, g.y, Math.max(40, 30 * view.metresPerPixel), SOURCE_PICK_SLACK_PX,
      (x, y, z) => view.project(x, y, z));
  };
  const buildingAt = (clientX: number, clientY: number) => {
    if (!buildingsPickable()) return null;
    const g = view.pick(clientX, clientY);
    return g ? buildingPicker.at(clientX, clientY, { x: g.x, y: g.y, z: pack.terrain.heightAt(g.x, g.y) }) : null;
  };
  /** a mapped base road under the cursor; a stretch a project road already claims selects that road */
  const sourceAt = (clientX: number, clientY: number): { kind: 'source'; hit: SourceHit } | { kind: 'route-hit'; routeId: RouteId; s: number } | null => {
    if (!sourcePicker || !sourceEditor) return null;
    const g = view.pick(clientX, clientY); if (!g) return null;
    const box = canvasBox(), slack = SOURCE_PICK_SLACK_PX;
    const hit = sourcePicker.at(clientX - box.left, clientY - box.top, g.x, g.y, Math.max(40, 30 * view.metresPerPixel), slack,
      (x, y) => view.project(x, y, view.drape(x, y)));
    if (!hit) return null;
    for (const route of projectStore.snapshot.design.routes) for (const c of route.source?.intervals ?? [])
      if (c.sourceId === hit.sourceId && c.transportData === transportData && hit.s >= c.s0 && hit.s <= c.s1) return { kind: 'route-hit', routeId: route.id, s: hit.s - c.s0 };
    return { kind: 'source', hit };
  };
  /** what a click at a client point means */
  const thingAt = (clientX: number, clientY: number): Sel | { kind: 'route-hit'; routeId: RouteId; s: number } | { kind: 'source'; hit: SourceHit } | null => {
    const c = crossingAt(clientX, clientY);
    if (c) return { kind: 'crossing', roadId: c.roadId! };
    const hit = routeAt(clientX, clientY, 10);
    if (hit) return { kind: 'route-hit', routeId: hit.routeId, s: hit.s };
    // a crossing's own works before the rest of the mapped road (whose card is the base road's)
    const works = crossingWorksAt(clientX, clientY);
    if (works) return { kind: 'crossing', roadId: works.crossing.roadId! };
    const b = buildingAt(clientX, clientY);
    if (b !== null) return { kind: 'building', j: b };
    const w = extras.wallAt(clientX, clientY);
    if (w) return { kind: 'stretch', s0: w.s0, s1: w.s1 };
    return sourceAt(clientX, clientY);
  };
  /** the selected mapped road's stretch under the pointer, if a drag there would rebuild it */
  let grabbing: SourceInterval | null = null;
  const mappedGrab = (clientX: number, clientY: number): SourceInterval | null => {
    const interval = sourceEditor?.interval; if (!interval) return null;
    const g = view.pick(clientX, clientY);
    return g && sourceEditor!.covers(g.x, g.y, Math.max(6, 8 * view.metresPerPixel)) ? { ...interval } : null;
  };
  /** The first drag of a mapped road: its stretch becomes a project road (line converted to bends that
   * follow the old road) and the drag bends it, all ONE undo step (committed when the drag ends). */
  const rebuildByDrag = (interval: SourceInterval, x: number, y: number): number | null => {
    const lineKind = sourceEditor?.lineKind;
    if (!transportIndex || !lineKind) return null;
    let command;
    try { command = lineKind.rebuild(transportIndex, interval, { routeId: `route:${crypto.randomUUID()}`, acousticSourceId: `acoustic:${crypto.randomUUID()}` }); }
    catch (error) { console.warn('This road could not be rebuilt', error); toast('This road cannot be changed here.'); return null; }
    const id = command.routes[0].id;
    intro.hide(); sourceEditor?.clear();
    if (projectStore.inTransaction) projectStore.commit();
    projectStore.begin();
    try { projectStore.dispatch(command); }
    catch (error) { projectStore.cancel(); console.warn('This road could not be rebuilt', error); toast('This road cannot be changed here.'); return null; }
    switchRoute(id, true);
    const k = insertBend(x, y, false); select({ kind: 'bend', i: k });
    placedByRebuild = { routeId: id, i: k };
    return k;
  };
  /** the bend the rebuilding drag placed: on release it is fitted where its curve has room (core/bend-fit.ts) */
  let placedByRebuild: { routeId: RouteId; i: number } | null = null;
  const insertBend = (x: number, y: number, commit: boolean) => {
    const k = nearestLeg(A, B, store.design.pis, { x, y });
    store.update((d) => { d.pis.splice(k, 0, { x, y, r: null }); }, commit);
    return k;
  };
  view.ev = {
    onPickTerrain: (_x, _y, clientX, clientY) => {
      intro.hide();
      if (buildTool.active) { buildTool.place(placeAt(clientX, clientY, _x, _y)); return; }
      const t = thingAt(clientX, clientY);
      // First click on a base road before the graph is parsed: parse it, then pick the road at the
      // clicked ground point (wherever the camera is by then), unless something else was selected meanwhile.
      const ground = !t && !transportGraph && pack.transportMeta ? view.pick(clientX, clientY) : null;
      if (t?.kind === 'route-hit') { if (switchRoute(t.routeId) && store.read()) selectPiece(t.s); }
      else if (t?.kind === 'source') showSource(t.hit);
      else if (!t && legacyRoadAt(_x, _y)) showNoLinks();
      else select(t);
      if (ground) {
        const generation = selectGeneration;
        void ensureTransport().then(() => {
          if (generation !== selectGeneration) return;
          const p = view.project(ground.x, ground.y, view.drape(ground.x, ground.y)), box = canvasBox();
          const late = p.vis ? sourceAt(box.left + p.sx, box.top + p.sy) : null;
          if (late?.kind === 'source') showSource(late.hit);
        });
      }
    },
    onDoublePick: (x, y) => { if (!store.read() || routeAt(lastClient.x, lastClient.y, 10)) return; select({ kind: 'bend', i: insertBend(x, y, true) }); },
    // a drag from the road always bends it (a click there still inspects the nearest thing); so does a
    // drag on a selected mapped road's highlighted stretch, which rebuilds that stretch
    hitRoad: (clientX, clientY) => {
      grabbing = null;
      if (buildTool.active) return false;
      if (roadAt(clientX, clientY, 9) >= 0) return true;
      grabbing = mappedGrab(clientX, clientY);
      return !!grabbing;
    },
    onRoadDrag: (x, y) => {
      if (grabbing) { const k = rebuildByDrag(grabbing, x, y); grabbing = null; return k; }
      if (!store.read()) return null; intro.hide(); const k = insertBend(x, y, false); select({ kind: 'bend', i: k }); return k;
    },
    onPiSelect: (i) => select(i === null ? null : { kind: 'bend', i }),
    onPiDrag: (i, x, y) => store.update((d) => { d.pis[i].x = x; d.pis[i].y = y; }, false),
    onPiDragEnd: () => {
      const placed = placedByRebuild; placedByRebuild = null;
      const d = store.read(), ends = store.route?.endpoints;
      if (placed && d && ends && placed.routeId === store.activeRouteId) {
        const fitted = fitPlacedBend(ends.a.position, ends.b.position, d.pis, placed.i, d.category, d.speed);
        if (fitted) store.update(draft => { draft.pis = fitted; }, false);
      }
      store.commit();
    },
    onPiDelete: (i) => deletePi(i),
    // a reroute link: dragging it shapes it (adds a bend point there)
    grab: (clientX, clientY) => {
      if (!store.read() || buildTool.active) return null;
      const w = crossingWorksAt(clientX, clientY);
      return w?.link !== undefined && linkEdit ? linkEdit.grab(w) : null;
    },
  };
  const lastClient = { x: 0, y: 0 };

  // ---- profile: the same verbs ----
  profile.ev = {
    onStationSelect: (s) => select({ kind: 'pin', s }, true),
    onCrossingSelect: (roadId) => select({ kind: 'crossing', roadId }, true),
    onPick: (s) => selectPiece(s, true),
    onVpiDrag: (i, s, z) => store.update((d) => { takeProfile(d); if (d.vpis[i]) { d.vpis[i].s = s; d.vpis[i].z = z; } }, false),
    onVpiDragEnd: () => store.commit(),
    onVpiAdd: (s, z) => {
      const vp = store.design.profileMode === 'auto' && last ? last.vpis : store.design.vpis;
      if (vp.some((v) => Math.abs(v.s - s) < MIN_VPI_GAP)) return;
      store.update((d) => {
        takeProfile(d);
        const k = d.vpis.findIndex((v) => v.s > s);
        d.vpis.splice(k < 0 ? d.vpis.length - 1 : k, 0, { s, z, r: null });
      });
    },
    onVpiDelete: (i) => { commitFields(); store.update((d) => { takeProfile(d); d.vpis.splice(i, 1); }); select(null); },
    onVpiSelect: (i) => { if (i !== null) select({ kind: 'vpi', i }); else if (sel?.kind === 'vpi') select(null); },
    onSelect: (range) => select(range ? { kind: 'stretch', s0: range.s0, s1: range.s1 } : null),
    onHover: (s, label) => {
      if (s === null || !last) { view.setHover(null); return; }
      const i = Math.max(0, Math.min(last.n - 1, Math.round(s / last.ds)));
      view.setHover({ x: last.x[i], y: last.y[i], z: last.grade[i] }, label);
    },
    onView: () => updateZoomButtons(),
    onBendHover: (i) => highlightBend(i),
    onBendSelect: (i) => select({ kind: 'bend', i }, true),
    onPinAdd: (s) => addHeightAt(s),
    onLineDrag: (s, z) => setPin(s, z, false),
    onPinDrag: (s, z) => store.update((d) => { const p = d.gradePins?.find((p) => Math.abs(p.s - s) < 0.1); if (p) p.z = z; }, false),
    onPinDragEnd: () => store.commit(),
  };

  // ---- the profile's key (legend) ----
  const keyB = document.getElementById('key-toggle')!, keyBox = document.getElementById('profile-key')!;
  const showKey = (on: boolean) => { keyBox.hidden = !on; keyB.setAttribute('aria-expanded', String(on)); keyB.classList.toggle('on', on); };
  keyB.onclick = () => showKey(!keyB.classList.contains('on'));
  document.addEventListener('pointerdown', (e) => { if (!keyBox.hidden && !keyBox.contains(e.target as Node) && e.target !== keyB) showKey(false); });

  // ---- profile zoom buttons ----
  const zoomOut = document.getElementById('zoom-out') as HTMLButtonElement;
  const fitB = document.getElementById('fit') as HTMLButtonElement;
  const updateZoomButtons = () => { zoomOut.disabled = profile.isWhole; fitB.hidden = profile.isWhole; };
  document.getElementById('zoom-in')!.onclick = () => profile.zoom(2);
  zoomOut.onclick = () => profile.zoom(0.5);
  fitB.onclick = () => profile.fit();
  updateZoomButtons();

  // ---- hover links between the map and the profile ----
  // the bend markers: profile → map
  const highlightBend = (i: number | null) => {
    for (const el of document.querySelectorAll<HTMLElement>('.pi.hl')) el.classList.remove('hl');
    if (i !== null) document.querySelector<HTMLElement>(`.pi[data-i="${i}"]`)?.classList.add('hl');
  };
  // map → profile: a bend marker, or the road under the mouse
  const overlayEl = document.getElementById('overlay')!;
  overlayEl.addEventListener('pointerover', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.pi');
    if (el) profile.setBendHover(Number(el.dataset.i));
  });
  overlayEl.addEventListener('pointerout', (e) => { if ((e.target as HTMLElement).closest('.pi')) profile.setBendHover(null); });
  let mapHoverAt: { x: number; y: number } | null = null, mapHoverFrame = 0, mapHoverKey = '';
  const mapHoverTick = () => {
    mapHoverFrame = 0;
    const at = mapHoverAt, r = last, canvas = view.renderer.domElement;
    let cursor = '', key = '';
    if (at && !buildTool.active && mappedGrab(at.x, at.y) && !(r && roadAt(at.x, at.y, 10) >= 0)) {
      cursor = 'grab'; key = 'mapped';
      if (key !== mapHoverKey) { const g = view.pick(at.x, at.y); if (g) view.setHover({ x: g.x, y: g.y, z: view.drape(g.x, g.y) }, 'drag to change'); }
    } else if (at && r && !buildTool.active) {
      const cross = crossingAt(at.x, at.y);
      const k = cross ? -1 : roadAt(at.x, at.y, 10);
      const building = cross || k >= 0 ? null : buildingAt(at.x, at.y);
      let works: ReturnType<typeof crossingWorksAt> = null;
      if (cross) {
        cursor = 'pointer'; key = `x${cross.roadId}`;
        if (key !== mapHoverKey) { view.setHover({ x: cross.x, y: cross.y, z: r.grade[cross.i] }, ROAD_CLASSES[cross.cls].label); profile.setHover(cross.s, true); }
      } else if (k >= 0) {
        cursor = 'grab'; key = `r${k}`;
        if (key !== mapHoverKey) { view.setHover({ x: r.x[k], y: r.y[k], z: r.kind[k] === KIND.tunnel ? r.ground[k] : r.grade[k] }, 'drag to bend'); profile.setHover(r.s[k], true); }
      } else if (routeAt(at.x, at.y, 10)) { cursor = 'pointer'; key = 'other-route'; }
      else if ((works = crossingWorksAt(at.x, at.y))) {
        const c = works.crossing, link = works.link !== undefined && shapeable(lastFull, store.design, c.roadId!);
        cursor = link ? 'grab' : 'pointer'; key = `x${c.roadId}${link ? 'l' : ''}`;
        if (key !== mapHoverKey) { view.setHover({ x: works.x, y: works.y, z: works.z }, `${ROAD_CLASSES[c.cls].label}${link ? ' · drag to reshape' : ''}`); profile.setHover(c.s, true); }
      } else if (building !== null) { cursor = 'pointer'; key = `b${building}`; }
      else if (extras.wallAt(at.x, at.y)) { cursor = 'pointer'; key = 'w'; }
      else if (sourceAt(at.x, at.y)) { cursor = 'pointer'; key = 'source'; }
    }
    if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
    if (key === mapHoverKey) return;
    if (!key.startsWith('x') && !key.startsWith('r') && key !== 'mapped') { view.setHover(null); profile.setHover(null, true); }
    mapHoverKey = key;
  };
  view.renderer.domElement.addEventListener('pointermove', (e) => {
    lastClient.x = e.clientX; lastClient.y = e.clientY;
    mapHoverAt = e.buttons ? null : { x: e.clientX, y: e.clientY }; // not while panning / rotating
    if (!mapHoverFrame) mapHoverFrame = requestAnimationFrame(mapHoverTick);
  });
  view.renderer.domElement.addEventListener('pointerleave', () => { mapHoverAt = null; if (!mapHoverFrame) mapHoverFrame = requestAnimationFrame(mapHoverTick); });

  // map → profile: the part of the route the map shows (a light window), recomputed after camera moves
  let windowTimer = 0;
  const updateMapWindow = () => {
    windowTimer = 0;
    const r = last;
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

  // ---- HUD ----
  hud.ev = {
    onCategory: (c) => store.update((d) => { d.category = c as CategoryId; }),
    onSpeed: (s) => store.update((d) => { d.speed = s; }),
    onProfileMode: (mode) => {
      if (mode === store.design.profileMode || (mode === 'manual' && (!last || !settled()))) return;
      store.update((d) => { if (mode === 'manual') takeProfile(d); else d.profileMode = 'auto'; });
    },
    onReset: () => {
      select(null);
      store.reset(); view.resetCamera(); profile.fit();
      toast('Back to the starting road.', 'Undo', () => store.undo());
    },
    onIntro: () => intro.show(),
    onDirection: (which) => {
      const route = store.route, corridor = route ? corridorOfRoute(projectStore.snapshot.design, route.id) : undefined;
      if (!corridor || projectStore.inTransaction) return;
      if (which === 'both') {
        if (corridor.mode !== 'independent') return;
        select(null);
        store.editProject(d => { Object.assign(d, rejoinCorridor(d, corridor.id)); });
        switchRoute(corridor.children.forward);
        toast(DIRECTIONS_TEXT.join, 'Undo', () => store.undo());
        return;
      }
      if (corridor.mode === 'paired') {
        // split from the settled shared line: its heights are what each direction starts from
        const spine = projectFull?.revision === projectStore.snapshot.revision ? projectFull.routes[corridor.children.forward]?.legacy : undefined;
        if (!spine || spine.preview) { toast('One moment: still computing.'); return; }
        select(null);
        store.editProject(d => { Object.assign(d, splitCorridor(d, corridor.id, spine)); });
      }
      switchRoute(corridor.children[which]);
    },
    onLoadBest: () => { if (store.best) { store.loadBest(); toast('Loaded your best design.', 'Undo', () => store.undo()); } },
    onExaggeration: (e) => viewBar.set({ exag: e }),
    onViolation: (k) => {
      // the list shows the last full result's violations (previews do not replace it)
      if (legacyFacade() || !projectFull) { showViolation(lastFull?.violations[k]); return; }
      const issue = hud.listedIssue(k), owner = issue?.scope.routeIds[0];
      if (!issue) return;
      // not checked yet (e.g. where two new roads meet): show the place; there is nothing to select or fix there
      if (issue.check === 'not-checked') {
        if (issue.at) view.flyTo(issue.at.x, issue.at.y, 1200);
        const here = issue.locations.find(l => l.routeId === store.activeRouteId);
        if (here && last) profile.focus(Math.max(0, here.s0 - 150), Math.min(last.length, here.s1 + 150));
        if (!issue.at && !here) hud.reveal('viol');
        return;
      }
      if (owner && owner !== store.activeRouteId) switchRoute(owner);
      if (issue.scope.buildingIndex !== undefined) { select({ kind: 'building', j: issue.scope.buildingIndex }, true); return; }
      // A road's own check: core lists each road's kernel violations in order, route-qualified. Its
      // ordinal among that road's 'invalid' issues identifies the kernel violation (never its title).
      const own = projectFull.issues.filter(i => i.blocking === 'invalid' && i.scope.routeIds.length === 1 && i.scope.routeIds[0] === store.activeRouteId);
      const n = own.indexOf(issue), v = n >= 0 && lastFull && own.length === lastFull.violations.length ? lastFull.violations[n] : undefined;
      if (v && v.title === issue.violation.title) { showViolation(v); return; }
      const at = issue.locations.find(l => l.routeId === store.activeRouteId), d = store.read();
      if (!at) { hud.reveal('viol'); return; }
      if (at.pi !== undefined && d?.pis[at.pi]) select({ kind: 'bend', i: at.pi }, true);
      else if (at.vpi !== undefined && d?.profileMode === 'manual' && lastFull && at.vpi > 0 && at.vpi < lastFull.vpis.length - 1) select({ kind: 'vpi', i: at.vpi }, true);
      else select({ kind: 'stretch', s0: at.s0, s1: at.s1 }, true);
    },
  };
  const showViolation = (v: Result['violations'][number] | undefined) => {
    const r = lastFull;
    if (!v || !r) return;
    const roadId = (v as { crossing?: { roadId?: number } }).crossing?.roadId;
    const pin = v.kind === 'profile' ? store.design.gradePins?.find((p) => p.s >= v.s0 - 1 && p.s <= v.s1 + 1) : undefined;
    const t: Sel | null = v.target?.buildings?.length ? { kind: 'building', j: v.target.buildings[0] }
      : roadId !== undefined ? { kind: 'crossing', roadId }
        : v.pi !== undefined ? { kind: 'bend', i: v.pi } : v.pis?.length ? { kind: 'bend', i: v.pis[0] }
          : v.vpi !== undefined && store.design.profileMode === 'manual' && v.vpi > 0 && v.vpi < r.vpis.length - 1 ? { kind: 'vpi', i: v.vpi }
          : pin ? { kind: 'pin', s: pin.s } : v.goal ? null
            : v.s1 - v.s0 < 60 ? (() => { const p = pieceAt(r, (v.s0 + v.s1) / 2); return { kind: 'stretch', s0: p.s0, s1: p.s1, piece: p.kind } as Sel; })()
              : { kind: 'stretch', s0: v.s0, s1: v.s1 };
    if (!t) { hud.reveal('viol'); return; }
    select(t);
    const i = Math.max(0, Math.min(r.n - 1, Math.round((v.s0 + v.s1) / 2 / r.ds)));
    view.lookAt(r.x[i], r.y[i], Math.max(1200, (v.s1 - v.s0) * 1.5), 20, 45);
    profile.focus(v.s0, v.s1);
  };

  // a drag (bend, height point, pin, radius grip) is applied without a history entry until it ends:
  // Undo / Redo in the middle of one would be overwritten by its final commit
  let pointerHeld = 0;
  window.addEventListener('pointerdown', () => { pointerHeld++; }, { capture: true });
  for (const t of ['pointerup', 'pointercancel'] as const) window.addEventListener(t, () => { pointerHeld = Math.max(0, pointerHeld - 1); }, { capture: true });
  window.addEventListener('blur', () => { pointerHeld = 0; });
  const undoRedo = (redo: boolean) => {
    if (pointerHeld) return;
    // a focused select / checkbox would keep the cards from redrawing with the restored design
    (document.activeElement as HTMLElement | null)?.blur?.();
    if (redo) store.redo(); else store.undo();
  };
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    // Escape closes the base-road card even from its typed fields (nothing was changed yet)
    if (e.key === 'Escape' && (sourceEditor?.selected || buildTool.active)) { e.preventDefault(); buildTool.cancel(false); select(null); return; }
    // Undo / Redo also right after choosing in a select or ticking a box; text fields keep their own undo
    const typing = t.closest('textarea, [contenteditable="true"]') || (t.matches('input') && !t.matches('[type=checkbox], [type=radio], [type=range]'));
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !typing && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
      e.preventDefault();
      undoRedo(e.key.toLowerCase() === 'y' || e.shiftKey);
      return;
    }
    if (t.closest('input, select, textarea, [contenteditable="true"]')) return;
    if (!e.ctrlKey && !e.metaKey && !e.altKey && sel?.kind === 'stretch') {
      const key = e.key.toLowerCase(), kinds: Record<string, StructureKind | null> = { a: null, b: 1, t: 2, e: 0 };
      if (key in kinds) {
        e.preventDefault();
        if (!e.repeat) setStructure(kinds[key], sel.s0, sel.s1);
        return;
      }
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel?.kind === 'bend') deletePi(sel.i);
    else if (e.key === 'Escape') {
      if (intro.visible) intro.hide();
      else if (!keyBox.hidden) showKey(false);
      else select(null);
    }
  }, { capture: true }); // stretch shortcuts take precedence over the map's view shortcuts

  if (store.read()) { view.setDesign(store.design, null, activeEndpoints()); hud.setDesign(store.design); }
  else { view.clearDesign(activeEndpoints()); curveEdit.hide(); }
  projectScore(true);
  editBar.set(store.undoLabel(), store.redoLabel());
  setStatus('computing…');
  requestEval();

  // ---- debug / automation API ----
  (window as unknown as { trapla: unknown }).trapla = {
    getDesign: () => structuredClone(store.design),
    setDesign: (d: Design) => {
      const id = missionRouteId() ?? store.activeRouteId; if (!id) return; switchRoute(id);
      store.editProject(draft => {
        Object.assign(draft, replaceRouteFromLegacy(draft, id, d));
        const route = draft.routes.find(r => r.id === id)!;
        // Explicit legacy automation semantics: its one speed also governed traffic emissions.
        if (route.kind === 'road' && route.specification.operations.speedPolicy !== 'independent') route.specification.operations.speed = d.speed;
      });
    },
    getProject: () => structuredClone(projectStore.snapshot.design),
    projectSnapshot: () => structuredClone(projectStore.snapshot),
    projectResult: () => projectFull,
    activeRoute: () => store.activeRouteId,
    routeEndpoints: () => structuredClone(store.route?.endpoints ?? null),
    renderRoutes: () => view.routeGeometryStats(),
    groundHeight: (x: number, y: number) => pack.terrain.heightAt(x, y),
    routeScreen: (id: RouteId, s: number) => {
      const route = projectFull?.routes[id], r = route?.legacy;
      if (!r) { // an unaccepted proposal: its drawn reference line
        const p = route?.surface?.points; if (!p?.length) return null;
        const q = p.reduce((a, b) => (Math.abs(b.s - s) < Math.abs(a.s - s) ? b : a));
        return view.project(q.x, q.y, view.drape(q.x, q.y) + 2.5);
      }
      const i = Math.max(0, Math.min(r.n - 1, Math.round(s / r.ds)));
      return view.project(r.x[i], r.y[i], r.kind[i] === KIND.tunnel ? view.drape(r.x[i], r.y[i]) + 2 : r.grade[i] + 1.5);
    },
    handledRequest: () => received,
    /** promotable ground base roads at least minLength long, with their distance from the routes (m) */
    baseRoads: (minLength = 600) => {
      if (!transportIndex) return [];
      const routes = Object.values(projectFull?.routes ?? {}).flatMap(r => r.legacy ? [r.legacy] : []);
      return transportIndex.graph.sources.flatMap(source => {
        const length = source.stations[source.stations.length - 1];
        if (source.kind !== 'road' || length < minLength) return [];
        let info; try { info = groundRoadSourceInfo(transportIndex!, source.id); } catch { return []; }
        let clear = Infinity;
        for (let i = 0; i < source.xy.length; i += 2) for (const r of routes) for (let k = 0; k < r.n; k += 10)
          clear = Math.min(clear, Math.hypot(r.x[k] - source.xy[i], r.y[k] - source.xy[i + 1]));
        const mid = transportIndex!.branches({ transportData: transportIndex!.transportData, sourceId: source.id, s0: 0, s1: length })
          .filter(b => b.s > 50 && b.s < length - 50).map(b => b.s);
        return [{ id: source.id, name: info.name, length, clear, branches: mid, rebuildable: mappedLineKindFor(transportIndex!, source.id).verdict.ok }];
      });
    },
    sourceScreen: (id: string, s: number) => { const p = transportIndex?.position(id, s); return p ? view.project(p.x, p.y, view.drape(p.x, p.y)) : null; },
    sourceSelection: () => sourceEditor?.selection ?? null,
    building: () => buildTool.active,
    /** what a Build click at this client point would place (no change) */
    placementAt: (clientX: number, clientY: number) => { const g = view.pick(clientX, clientY); return g ? placeAt(clientX, clientY, g.x, g.y) : null; },
    /** a point on a drawn road away from ours (for checking the no-road-links card) */
    legacyRoadPoint: () => {
      const net = pack.overlays.net, r = last; if (!net || !r) return null;
      for (const w of net.ways) {
        if (!['tertiary', 'secondary', 'residential', 'unclassified'].includes(net.cls[w[0]]) || w.length < 5) continue;
        const x = (w[1] + w[3]) / 2, y = (w[2] + w[4]) / 2;
        let near = Infinity; for (let i = 0; i < r.n; i += 5) near = Math.min(near, Math.hypot(r.x[i] - x, r.y[i] - y));
        if (near > 400 && near < 3000 && !pack.terrain.isOob(x, y) && Math.hypot(w[3] - w[1], w[4] - w[2]) > 30) return { x, y };
      }
      return null;
    },
    lookAtSource: (id: string, s: number, dist = 900) => { const p = transportIndex?.position(id, s); if (p) view.lookAt(p.x, p.y, dist, 0, 55); },
    proposalLines: () => view.proposalCount,
    photoWithNetwork: () => view.photoWithNetwork,
    setActiveRoute: switchRoute,
    projectSelection: () => structuredClone(qualifiedSelection),
    setProject: (design: ProjectDesign) => {
      select(null);
      if (projectStore.inTransaction) projectStore.cancel();
      projectStore.begin(); projectStore.update(draft => Object.assign(draft, structuredClone(design))); projectStore.commit();
    },
    result: () => last,
    summary: () => last && {
      length: last.length, travelMin: last.travelMin, valid: last.valid, cost: last.cost, violations: last.violations,
      quantities: { ...last.quantities, massHaul: undefined, hitBuildings: last.quantities.hitBuildings.length },
      runs: last.runs, timing: last.timing, vpis: last.vpis.length, crossings: last.crossings, walls: last.walls,
    },
    whenIdle: () => new Promise<void>((res) => { if (sceneIdle()) res(); else idleWaiters.push(res); }),
    /** parse the lazily loaded transport graph now (base-road hooks below need it) */
    whenTransport: () => ensureTransport().then(() => !!transportGraph),
    lookAt: (x: number, y: number, dist?: number, bearing?: number, elev?: number) => view.lookAt(x, y, dist, bearing, elev),
    resetCamera: () => view.resetCamera(),
    /** select something (as a click would): a bend, pin, crossing, building, stretch or piece at a station */
    select: (t: Sel | null) => select(t),
    selectPiece: (s: number) => selectPiece(s),
    selection: () => sel && JSON.parse(JSON.stringify(sel)),
    selectPi: (i: number | null) => select(i === null ? null : { kind: 'bend', i }),
    selectStation: (s: number) => select({ kind: 'pin', s }),
    selectCrossing: (roadId: number) => select({ kind: 'crossing', roadId }, true),
    selectBuilding: (j: number) => select({ kind: 'building', j }),
    maxRadius: (i: number) => curveEdit.maxRadius(i),
    pick: (clientX: number, clientY: number) => view.pick(clientX, clientY),
    project: (x: number, y: number, z: number) => view.project(x, y, z),
    /** screen position (px inside the view) of building j's centroid, `up` metres above its ground */
    /** building j is drawn in 3D (false: removed as demolished, or no mesh) */
    buildingShown: (j: number) => { const k = view.buildingMesh(j); return k >= 0 && !view.buildingMeshes?.isHidden(k); },
    buildingScreen: (j: number, up = 2) => {
      const b = pack.overlays.buildings[j];
      return b && view.project(b[0], b[1], pack.terrain.heightAt(b[0], b[1]) + up);
    },
    profileFocus: (s0: number, s1: number) => profile.focus(s0, s1),
    profileFit: () => profile.fit(),
    profileView: () => profile.view,
    profileHasRoad: () => profile.hasRoad,
    profileHover: () => profile.hover,
    profilePoint: (s: number, z?: number, band?: boolean) => profile.toClient(s, z, band),
    bendStations: () => last && bendStations(last, store.design),
    cameraTarget: () => view.target,
    cameraDistance: () => view.cameraDistance,
    undoLabels: () => ({ undo: store.undoLabel(), redo: store.redoLabel() }),
    selectRange: (s0: number | null, s1?: number) => select(s0 === null || s1 === undefined ? null : { kind: 'stretch', s0, s1 }),
    range: () => (sel?.kind === 'stretch' ? { s0: sel.s0, s1: sel.s1 } : null),
    /** the road's screen point (px inside the view) at station s */
    // where the road is drawn to grab: a tunnel at its ground-level indication, as picking uses
    roadScreen: (s: number) => { if (!last) return null; const i = Math.max(0, Math.min(last.n - 1, Math.round(s / last.ds))); return view.project(last.x[i], last.y[i], routeIndicationHeight(last, i, (x, y) => view.drape(x, y))); },
    mapWindow: () => (profile as unknown as { mapWindow: unknown }).mapWindow,
    setExaggeration: (e: number) => viewBar.set({ exag: e }),
    setView: (p: Partial<ViewPrefs>) => viewBar.set(p),
    viewBusy: () => view.busy,
    handlerTiming: () => ({ ...handlerTiming }),
    /** the last full result's sliced 3D rebuild: slices, busy / longest-slice / wall / commit ms */
    rebuildStats: () => ({ ...heavyStats }),
    /** live shader programs (a growing / changing list during edits means recompiles) */
    programs: () => (view.renderer.info.programs ?? []).map((p) => `${p.id}:${p.cacheKey.slice(0, 40)}`),
    meta,
    official: meta.official.xy,
    A, B,
  };
}

/** the plan's bends at their stations along the route: the middle of the bend's arc, or the nearest station */
function bendStations(r: Result, d: Design): { i: number; s: number }[] {
  return d.pis.map((p, i) => {
    const c = r.curves.find((c) => c.index === i);
    if (c && c.sEnd > c.sStart + 1) return { i, s: (c.sStart + c.sEnd) / 2 };
    let bd = Infinity, s = 0;
    for (let k = 0; k < r.n; k++) { const dd = (r.x[k] - p.x) ** 2 + (r.y[k] - p.y) ** 2; if (dd < bd) { bd = dd; s = r.s[k]; } }
    return { i, s };
  });
}

main().catch((e) => { console.error(e); setStatus(`Failed to load: ${e?.message ?? e}. Did you run "npm run data"?`); });
