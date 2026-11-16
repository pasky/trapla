import './style.css';
import { CATEGORIES } from './core/data/categories';
import { speedNorms } from './core/data/norms';
import { scenarioParams } from './core/data/scenario';
import type { Design, Result } from './core/evaluate';
import { nearestLeg } from './core/horizontal';
import { missionProject } from './core/project-mission';
import { routeCrownWidth } from './core/route-section';
import { autoFollowingCorridor, CARRIAGEWAY_CATEGORY, corridorOfRoute, MOTORWAY_CATEGORY, rejoinStretch } from './core/project-motorway';
import { DIRECTIONS_TEXT } from './core/terms';
import { RouteExtras } from './render/extras';
import { runSliced, type SlicedJob, type Staged } from './render/slices';
import { BuildAnnotations } from './render/build-tools';
import { RouteScene } from './render/route-scene';
import { footprintHit } from './render/route-pick';
import { SourcePicker, type SourceHit } from './render/source-pick';
import { CrossingHighlight } from './ui/crossing-highlight';
import { LinkEditor } from './ui/link-edit';
import { lineHalfWidth } from './render/landcover';
import { ProjectTransportIndex } from './core/project-network';
import type { TransportGraphData } from './core/project-transport';
import { MappedRoadCard } from './ui/mapped-road';
import { StretchEnds } from './ui/stretch-ends';
import { BuildRoadTool, type Placement } from './ui/build-road';
import { bendAt, coveredStretches } from './ui/road-edit';
import { buildInProject, mappedLineKindOf, registeredBuildKinds, type BuildKind } from './ui/route-kinds';
import './ui/mode-kinds'; // Build → Motorway / Railway, rebuilding mapped railways
import { fitPlacedBend } from './core/bend-fit';
import { RoadNet } from './core/roadnet';
import { BuildingPicker } from './render/building-pick';
import { registerNet } from './core/project-roadnet';
import { DecisionList } from './ui/build-tools';
import { buildingInfo, Inspector, type Sel } from './ui/inspector';
import { pieceAt } from './ui/pieces';
import { buildingLevels } from './core/buildings';
import { NoiseLayer } from './render/noise';
import { View } from './render/view';
import { loadPack, packIdentities } from './scenario';
import { startEvalWorkers } from './eval-workers';
import { openProjectStore } from './project-store';
import { hasProjectSave } from './project-store-contract';
import { makeLegacyProjectContext } from './core/project-legacy';
import type { ProjectResult, ProjectSnapshot, RouteId, RouteResult, SourceInterval } from './core/project';
import { acceptsProjectMessage, type ProjectWorkerIn } from './core/project-protocol';
import { ActiveRouteStore } from './ui/active-route-store';
import { pickScenario, addScenariosButton } from './ui/scenario-picker';
import { showSaveRecovery } from './ui/save-recovery';
import { StorageGuard, showStorageNotice } from './ui/storage-guard';
import { RouteBar } from './ui/route-bar';
import { activeSelection, qualifySelection, type RouteSelection } from './ui/route-selection';
import { CurveEditor } from './ui/curve-edit';
import { Hud, type DirectionsState } from './ui/hud';
import { noLinksCard, proposalCard, routeHeadCard, type RouteCardDeps } from './ui/route-cards';
import { lineFrame, setLineFrame } from './ui/chainage';
import { ProfilePanel } from './ui/profile';
import { provisionalProfile } from './ui/provisional';
import { ViewBar } from './ui/viewbar';
import { EditBar } from './ui/editbar';
import { bendStations } from './ui/bend-stations';
import { createDesignEdits } from './ui/design-edits';
import { profileEvents } from './ui/profile-events';
import { hudEvents } from './ui/hud-events';
import { createMapPicks } from './ui/map-picks';
import { installMapHover } from './ui/map-hover';
import { installProfileBar } from './ui/profile-bar';
import { installShortcuts } from './ui/shortcuts';
import { installAutomation } from './automation';
import type { WorkerIn, WorkerOut } from './worker-protocol';
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
  if (store.route) { A = store.route.endpoints.a.position; B = store.route.endpoints.b.position; }
  // full evaluations and drag previews, each in its own worker (eval-workers.ts)
  const { worker, previewWorker } = startEvalWorkers(pack, scenario, A, B,
    { objectData, transportData, pricingData, waterData, terrainData, terrainClass: scenario.terrainClass });

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
  const viewBar = new ViewBar(document.getElementById('viewbar')!, view, meta.orthophoto?.attribution, (on) => {
    document.getElementById('attrib')!.innerHTML = [...meta.attribution, ...(on && meta.orthophoto ? [meta.orthophoto.attribution] : [])].join(' · ');
  }, noise, () => frameRoute());
  /** the active route as built (else its ends and bends) in view */
  /** `r`: the road to frame (default: the last result shown; right after a switch that is still the old road's) */
  const frameRoute = (r: Result | null = last) => {
    const d = store.read() ? store.design : null;
    view.frame(r ? Array.from({ length: Math.ceil(r.n / 20) + 1 }, (_, k) => { const i = Math.min(r.n - 1, k * 20); return { x: r.x[i], y: r.y[i] }; })
      : d ? [A, ...d.pis, B] : []);
  };

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
    // While a road is dragged the project total follows its live price: the last full total with this road's
    // own bill replaced by the preview's (≈).
    const total = projectFull?.cost.total;
    const live = activePreviewPrice !== null && total !== null && total !== undefined && active && active in alone
      ? total - alone[active] + activePreviewPrice : null;
    // our road: the mission's route, and a motorway mission's other direction
    const missionCorridor = mission ? corridorOfRoute(projectStore.snapshot.design, mission) : undefined;
    const ours = new Set([mission, missionCorridor?.children.forward, missionCorridor?.children.reverse].filter((id): id is RouteId => !!id));
    const groups = Object.fromEntries(projectStore.snapshot.design.corridors.flatMap(c => [[c.children.forward, c.id], [c.children.reverse, c.id]]));
    // "Our road only" / "This railway only": what the price shown is for, in the active line's own word
    const word = (id: RouteId | null | undefined) => { const k = projectStore.snapshot.design.routes.find(r => r.id === id)?.kind; return k === 'railway' ? 'railway' : k === 'motorway' ? 'motorway' : 'road'; };
    const only = (id: RouteId | null | undefined) => `${id && ours.has(id) ? 'Our' : 'This'} ${word(id)} only`;
    const own = activePreviewPrice !== null ? { total: activePreviewPrice, approx: true, label: only(active), routeId: active ?? undefined }
      : active && active in alone ? { total: alone[active], approx: false, label: only(active), routeId: active }
        : mission && mission in alone ? { total: alone[mission], approx: false, label: only(mission), routeId: mission } : null;
    hud.setProject(projectFull, pending, projectStore.best, { missionRouteId: mission, ours, groups, legacy: legacyFacade(), ownPrice: own,
      liveTotal: live, dragging: activePreviewPrice !== null && projectStore.inTransaction,
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
  let linkEdit: LinkEditor | undefined, works: CrossingHighlight | undefined;
  const inspector = new Inspector(document.getElementById('inspector')!, {
    building: binfo,
    maxRadius: (i) => curveEdit.maxRadius(i),
    together: (j) => {
      const receiver = projectFull?.complete ? projectFull.receivers.find(r => r.buildingIndex === j && r.together) : undefined;
      if (!receiver) return null;
      const routes = projectStore.snapshot.design.routes;
      return { receiver, name: (id) => { const r = routes.find(q => q.id === id); return !r || r.role === 'mission' ? 'our road' : r.name; } };
    },
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
    // what the mapped roads carry today (the pack's traffic census; without it: class averages)
    const census = await pack.loadTraffic();
    try {
      transportIndex = new ProjectTransportIndex(graph, transportData, graph.vectorData, pack.terrain, census);
      // only the drawn road is clickable: its drawn width at the local scale (map or photo overlay), plus slack
      sourcePicker = new SourcePicker(graph, pack.vectors, (layer, res) => lineHalfWidth(layer, res, view.photoWithNetwork));
    } catch (error) { console.warn('Road map links are unavailable', error); transportIndex = null; sourcePicker = null; return; }
    transportGraph = graph;
    // where other roads' earthworks cover a mapped road it is gone: a rebuilt stretch stops short of them
    const covered = (sourceId: string) => coveredStretches(transportIndex!, sourceId, projectStore.snapshot.design.routes.flatMap(r => {
      const built = projectFull?.routes[r.id]?.legacy;
      return built && !r.source?.intervals.some(i => i.sourceId === sourceId) ? [{ ...built, name: r.role === 'mission' ? 'our road' : r.name }] : [];
    }));
    const editor = sourceEditor = new MappedRoadCard(() => inspectorEl, view, transportIndex, claimedSources, covered);
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
    const sourceWays = { type: 'source-ways', ways: graph.sources.flatMap(s => s.legacyNetIndex === undefined ? [] : [[s.id, s.legacyNetIndex]]),
      rails: graph.sources.flatMap(s => s.kind === 'railway' ? [[s.id, s.xy, s.stations]] : []) } satisfies WorkerIn;
    worker.postMessage(sourceWays); previewWorker.postMessage(sourceWays);
    view.setTransport(graph);
  })();
  // A saved project that already rebuilds mapped roads needs the graph before its first scene.
  if (claimedSources().length) await ensureTransport();
  view.onNeedTransport = () => { void ensureTransport(); };
  if (viewBar.photo) void ensureTransport(); // the photo was already on from the saved view
  const buildTool = new BuildRoadTool(() => inspector.host(), document.getElementById('overlay')!, view);
  /** Without road links (an older map pack) mapped roads are still recognised, to say why they cannot change. */
  let legacyNet: RoadNet | null = null;
  /** a drawn mapped road near this ground point (the pack's road overlay; no road links needed) */
  const mappedRoadNear = (x: number, y: number, px = 8, min = 6) => {
    if (!pack.overlays.net) return false;
    legacyNet ??= new RoadNet(pack.overlays.net);
    return legacyNet.nearestWay(x, y, Math.max(min, px * view.metresPerPixel)) !== undefined;
  };
  /** a mapped road in a pack without road links (its card says it cannot be changed here) */
  const legacyRoadAt = (x: number, y: number) => !transportData && mappedRoadNear(x, y, 4, 4);
  // a rebuilt stretch's ends carry their own drag handles (labelled), so the tick stays unlabelled
  /** a side road's end on another road follows that road: its drawn end is where it was built */
  const endAt = (end: 'a' | 'b') => {
    const route = store.route, r = route && projectFull?.routes[route.id]?.legacy;
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
      case 'end': { const i = t.end === 'a' ? 0 : r.n - 1; return { x: r.x[i], y: r.y[i], s0: r.s[i], s1: r.s[i] }; }
    }
  };
  view.onEndClick = (end) => select({ kind: 'end', end });
  /** select `next` everywhere; `fly`: bring it into view on the map (if off screen) and in the profile */
  let selectGeneration = 0; // a deferred base-road pick yields to any later selection
  /** A single selected place seen from further than this (m per pixel) is too small to make out: framing flies in. */
  const FRAME_MPP = 6;
  const select = (next: Sel | null, fly = false) => {
    selectGeneration++;
    if (sourceEditor?.selected) sourceEditor.clear();
    if (buildTool.active) buildTool.cancel(false);
    // a house a road removes (under its works, or bought out by it): its card is that road's, priced or not
    const remover = next?.kind === 'building' ? projectFull?.buildings.find(b => b.buildingIndex === next.j && b.action !== 'retain')?.routeId : undefined;
    if (remover && remover !== store.activeRouteId && projectStore.snapshot.design.routes.some(r => r.id === remover)) switchRoute(remover);
    // a house belongs to the project: its card shows the road whose noise reaches it most
    else if (next?.kind === 'building' && projectFull?.complete && Object.keys(projectFull.routes).length > 1) {
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
    linkEdit?.refresh(); works?.refresh();
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
        if (fly) frameSelection(next);
      }
      hud.revealContext('inspector');
    }
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
    const box = view.renderer.domElement.getBoundingClientRect();
    const q = view.project(p.x, p.y, pack.terrain.heightAt(p.x, p.y));
    const off = !q.vis || q.sx < 40 || q.sy < 40 || q.sx > box.width - 40 || q.sy > box.height - 40 || view.lowView;
    let small = view.metresPerPixel > FRAME_MPP;
    const r = last;
    if (p.s1 - p.s0 > 1 && r) {
      const at = (s: number) => { const i = Math.max(0, Math.min(r.n - 1, Math.round(s / r.ds))); return view.project(r.x[i], r.y[i], r.grade[i]); };
      const a = at(p.s0), b = at(p.s1);
      small = !a.vis || !b.vis || Math.hypot(a.sx - b.sx, a.sy - b.sy) < Math.min(box.width, box.height) / 6;
    }
    if (off || small) view.flyTo(p.x, p.y, Math.max(900, Math.min(6000, (p.s1 - p.s0) * 1.6)));
  };
  /** the active route's card when the road widgets cannot edit it: a proposed change on map geometry */
  const routeCard = () => proposalCard(routeCards);

  inspector.isSideRoad = () => !!store.route && store.route.role !== 'mission';
  /** what the whole-road cards (ui/route-cards.ts) read and may do */
  const routeCards: RouteCardDeps = {
    route: () => store.route, result: () => last, project: () => projectFull, design: () => projectStore.snapshot.design,
    transport: () => transportIndex, editable: () => store.read() !== null, directions: () => directionsState(),
    onDirection: w => hud.ev.onDirection?.(w), joinStretch: id => joinStretch(id),
    editProject: edit => store.editProject(edit), inTransaction: () => projectStore.inTransaction,
    deleteRoute: id => projectStore.dispatch({ type: 'delete-route', routeId: id }),
    missionRouteId: () => missionRouteId(), switchRoute: id => { switchRoute(id); }, undo: () => store.undo(),
    flyTo: (x, y, dist) => { view.flyTo(x, y, dist); }, selectBend: i => select({ kind: 'bend', i }, true),
    host: () => inspector.host(), clear: message => inspector.clear(message),
  };
  inspector.routeHead = routeHeadCard(routeCards);

  const showSource = (hit: SourceHit) => {
    if (!sourceEditor) return;
    select(null); inspector.host(); sourceEditor.show(hit); hud.revealContext('inspector');
  };
  const showNoLinks = () => { select(null); noLinksCard(() => inspector.host(), () => select(null)); hud.revealContext('inspector'); };

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

  // ---- edits (ui/design-edits.ts) ----
  const { setStructure, setPin, commitFields, deletePi, takeProfile, addHeightAt, setVia, inspectorEvents, decisionEvents } = createDesignEdits({
    store, profile, get last() { return last; }, select: (next, fly) => select(next, fly),
  });
  inspector.ev = inspectorEvents;
  decisions.ev = decisionEvents;
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
          structureValue: lastFull?.quantities.structureValue,
          gesture: { id: previewGesture!.id, sequence: ++previewGesture!.sequence } }
      : { type: 'project-eval', id: posted, snapshot, displayedResult: displayedProject && { epoch: displayedProject.epoch, revision: displayedProject.revision } };
    (message.type === 'project-preview' ? previewWorker : worker).postMessage(message);
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
      const crown = routeCrownWidth(route);
      const controls = route.alignment.kind === 'corridor' ? {} : route.alignment.controls;
      const entry = otherExtras.get(route.id);
      if (route.id === store.activeRouteId) { entry?.overlay.setVisible(false); continue; }
      if (entry) { entry.overlay.setVisible(true); if (entry.result !== r) { entry.overlay.setResult(r, crown, controls.structureOverrides, controls.wallOverrides); entry.result = r; } }
      else { const overlay = new RouteExtras(view); overlay.setResult(r, crown, controls.structureOverrides, controls.wallOverrides); otherExtras.set(route.id, { overlay, result: r }); }
    }
    const r = store.activeRouteId ? activeLegacy(result.routes[store.activeRouteId]) : undefined, d = store.read();
    if (r && d) {
      const crown = CATEGORIES[d.category].crownWidth; extras.setResult(r, crown, d.structureOverrides, d.wallOverrides);
      noise.setResult(r, crown); annotations.setResult(r, d);
    } else { extras.reset(); annotations.clear(); }
  };

  /** the result the active design was evaluated as: a motorway with separate stretches edited as one
   * road shows its shared line; one direction, that direction composed */
  const activeLegacy = (rr: RouteResult | undefined) => rr?.shared && !store.oneDirection ? rr.shared : rr?.legacy;
  /** A motorway edited as one line while its directions run apart somewhere: there the profile shows each
   * direction's own heights (composed on the same stations), not the shared line's. */
  const syncApart = (shown: Result) => {
    const design = projectStore.snapshot.design, corridor = store.route && corridorOfRoute(design, store.route.id);
    const fr = corridor && projectFull?.routes[corridor.children.forward], f = fr?.legacy, r = corridor && projectFull?.routes[corridor.children.reverse]?.legacy;
    const state = directionsState();
    if (!corridor || store.oneDirection || !fr?.apart?.length || !f || !r || !state || f.n !== shown.n || r.n !== shown.n) { profile.setApart([]); return; }
    profile.setApart(fr.apart.map(a => ({ ...a, lines: [
      { label: DIRECTIONS_TEXT.towards(state.places.forward), grade: f.grade, kind: f.kind },
      { label: DIRECTIONS_TEXT.towards(state.places.reverse), grade: r.grade, kind: r.kind }] })));
  };
  /** the motorway's direction towards A, edited on its own, reads from its own start (B): ui/chainage.ts */
  const readsBackwards = () => store.oneDirection && !!store.route
    && projectStore.snapshot.design.corridors.some(c => c.mode === 'paired' && c.children.reverse === store.route!.id);
  /** the frame the active line is read in (ui/chainage.ts); its bends are the shown design's */
  const frameLine = (length: number, shown: boolean, design = store.read()) =>
    setLineFrame(length, shown && readsBackwards(), design?.pis.length ?? 0);
  view.bendsReversed = readsBackwards;
  const showActiveResult = () => {
    const rd = store.read(), r = store.activeRouteId ? activeLegacy(projectFull?.routes[store.activeRouteId]) : undefined;
    frameLine(r?.length ?? 0, !!r);
    last = lastFull = r ?? null;
    hud.setRouteState(!!rd, !!r && !!rd);
    const together = !!store.route && !store.oneDirection && projectStore.snapshot.design.corridors.some(c => c.mode === 'paired' && c.children.forward === store.route!.id);
    document.querySelector<HTMLElement>('.profile-bar > b')!.textContent = store.route ? `Profile · ${together ? `${store.route.kind === 'motorway' ? 'Motorway' : store.route.name}, ${DIRECTIONS_TEXT.both.toLowerCase()}` : store.route.name}` : 'Profile';
    if (!r || !rd) {
      profile.clear(store.route && !store.read() ? 'No heights yet: this change is not checked.' : ''); if (!sourceEditor?.selected) routeCard();
      view.clearDesign(activeEndpoints()); return;
    }
    revalidate(r, rd);
    const cat = CATEGORIES[rd.category];
    profile.setGradeRule({ max: rd.maxGradient ?? cat.maxGradient?.[scenario.terrainClass] ?? scenario.maxGradient, perMille: cat.mode === 'railway', line: cat.mode });
    profile.setResult(r, r.vpis, rd.structureOverrides, rd.profileMode === 'auto' ? rd.gradePins : [], rd.wallOverrides);
    syncApart(r);
    profile.setMode(rd.profileMode); document.getElementById('profile')!.classList.toggle('manual', rd.profileMode === 'manual');
    profile.setBends(bendStations(r, rd));
    decisions.setResult(r, rd, j => binfo(j).kind);
    inspector.setNetworkPending(!(projectFull?.complete && projectFull.acousticScreen.complete));
    const ends = activeEndpoints();
    inspector.ends = { a: endInfo('a'), b: endInfo('b'), names: { a: ends.a.label, b: ends.b.label } };
    inspector.setResult(r, rd); hud.setDesign(rd); hud.setResult(r, rd, store.best); curveEdit.refresh(); linkEdit?.refresh(); works?.refresh();
  };

  // the noise view's band: asked from the worker for the displayed result when the view needs it
  let bandAsked = 0;
  noise.requestBand = () => {
    const full = projectFull, routeId = store.activeRouteId, d = store.read();
    if (!full || !routeId || !d) return;
    worker.postMessage({ type: 'noise-band', id: ++bandAsked, identity: { epoch: full.epoch, revision: full.revision }, routeId,
      crownWidth: CATEGORIES[d.category].crownWidth } satisfies ProjectWorkerIn);
  };
  worker.onmessage = previewWorker.onmessage = (ev: MessageEvent<WorkerOut>) => {
    const m = ev.data;
    if (m.type === 'ready') return;
    if (m.type === 'noise-band') {
      const r = projectFull?.routes[m.routeId]?.legacy;
      if (m.id === bandAsked && r && projectFull!.epoch === m.identity.epoch && projectFull!.revision === m.identity.revision
        && m.routeId === store.activeRouteId) noise.setBand(r, m.footprint);
      return;
    }
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
      const r = activeLegacy(m.result), rd = request?.design;
      if (r && rd) {
        const shown = r.preview ? r : { ...r, preview: true }; last = shown;
        frameLine(shown.length, true, rd);
        // a paired motorway is drawn once, under its forward direction; with separate stretches, each
        // drawn part of the moved line (the shared body where both move)
        const corridor = projectStore.snapshot.design.corridors.find(c => c.children.reverse === m.routeId || c.children.forward === m.routeId);
        const parts = (m.result.drawn ?? []).filter(p => store.oneDirection ? p.direction && corridor?.children[p.direction] === m.routeId : !p.direction)
          .filter(p => routeScene.has(p.id));
        if (parts.length) for (const p of parts) routeScene.preview(p.id, p.result.preview ? p.result : { ...p.result, preview: true });
        else {
          // the drawn parts changed (a stretch appears, merges or goes): the moved line on what is drawn now
          const drawnNow = corridor ? (projectFull?.routes[corridor.children.forward]?.drawn ?? []).map(p => p.id) : [];
          const on = [corridor?.mode === 'paired' ? corridor.children.forward : m.routeId, ...drawnNow].find(id => routeScene.has(id));
          if (on) routeScene.preview(on, shown);
        }
        took('view');
        profile.setResult(shown, shown.vpis, rd.structureOverrides, rd.profileMode === 'auto' ? rd.gradePins : [], rd.wallOverrides);
        syncApart(shown);
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
      if (route.kind === 'railway') return [{ id: route.id, result: legacy, crownWidth: routeCrownWidth(route) }];
      // A paired motorway is ONE body drawn once (its forward direction carries the shared result).
      if (route.kind === 'motorway') {
        // separate stretches: the shared body's parts and each direction's own carriageway
        const parts = result.routes[route.id]?.drawn;
        if (parts) return parts.map(p => ({ id: p.id, result: p.result, crownWidth: CATEGORIES[p.section === 'paired' ? MOTORWAY_CATEGORY : CARRIAGEWAY_CATEGORY].crownWidth,
          buildingMarkers: result.complete, ...(p.mirrored ? { mirrored: true } : {}) }));
        // split: each direction is its own body
        if (route.alignment.kind === 'pi') return [{ id: route.id, result: legacy, crownWidth: routeCrownWidth(route) }];
        const corridor = projectStore.snapshot.design.corridors.find(c => c.children.forward === route.id);
        return corridor?.mode === 'paired' ? [{ id: route.id, result: legacy, crownWidth: CATEGORIES[MOTORWAY_CATEGORY].crownWidth }] : [];
      }
      if (route.kind !== 'road') return [];
      return [{ id: route.id, result: legacy, crownWidth: routeCrownWidth(route) }];
    });
    const started = performance.now(), stats = { slices: 0, busy: 0, maxSlice: 0 };
    heavy = runSliced((function* () {
      let geometry: Staged | undefined, sources: Staged | undefined, handedOver = false;
      try {
        geometry = yield* routeScene.build(inputs, result.buildings.filter(b => b.action === 'demolish').map(b => b.buildingIndex),
          result.buildings.filter(b => b.action === 'buy').map(b => b.buildingIndex));
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
    }, 8, stats, ([geometry, sources]) => { sources?.dispose(); geometry.dispose(); }); took('view');
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
    { const r = store.activeRouteId ? activeLegacy(projectFull?.routes[store.activeRouteId]) : undefined; frameLine(r?.length ?? 0, !!r); }
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
      places: route.role === 'mission' ? { forward: scenario.labels.b, reverse: scenario.labels.a } : { forward: 'its end', reverse: 'its start' },
      apart: corridor.mode === 'paired' ? (corridor.stretches ?? []).map(t => ({ id: t.id, s0: t.a, s1: t.b, following: !apart.has(t.id) })) : [] };
  };
  works = new CrossingHighlight(view, document.getElementById('overlay')!, {
    selected: () => (sel?.kind === 'crossing' ? sel.roadId : null), result: () => lastFull,
  });
  linkEdit = new LinkEditor(view, document.getElementById('overlay')!, {
    selected: () => (sel?.kind === 'crossing' ? sel.roadId : null), result: () => lastFull, design: () => store.design,
    select: (roadId) => { if (sel?.kind !== 'crossing' || sel.roadId !== roadId) select({ kind: 'crossing', roadId }); },
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
    if (!store.switchRoute(id, created, one)) return false;
    syncDirections();
    previewGesture = null; activePreviewPrice = null;
    frameEnds();
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
    const hit = routeAt(clientX, clientY, 10), rr = hit && projectFull?.routes[hit.routeId];
    const route = hit && projectStore.snapshot.design.routes.find(r => r.id === hit.routeId);
    if (hit && rr && route && joins(route.kind)) return building.onRoute(route, rr, hit.s);
    // on a road's carriageway or earthworks beside its centreline: that road, never "open ground"
    const under = footprintHit(Object.values(projectFull?.routes ?? {}).flatMap(r => {
      const legacy = r.routeId === store.activeRouteId && last ? last : r.legacy;
      return legacy ? [{ id: r.routeId, result: legacy }] : [];
    }), x, y);
    const underRoute = under && projectStore.snapshot.design.routes.find(r => r.id === under.routeId), ur = under && projectFull?.routes[under.routeId];
    if (under && underRoute && ur && joins(underRoute.kind)) return building.onRoute(underRoute, ur, under.s);
    const source = sourceAt(clientX, clientY);
    if (source?.kind === 'route-hit' && joins(projectStore.snapshot.design.routes.find(r => r.id === source.routeId)?.kind)) return { ok: false, why: 'This stretch is being rebuilt: join the new road instead.' };
    if (source?.kind === 'source' && transportIndex && joins(transportIndex.source(source.hit.sourceId)?.kind)) return building.onSource(transportIndex, source.hit.sourceId, source.hit.s);
    if (pack.terrain.isOob(x, y)) return { ok: false, why: 'Put the end on the map.' };
    if (building.kind === 'road' && legacyRoadAt(x, y)) return { ok: false, why: 'This map’s road links are missing, so a new road cannot join its roads yet. Join our road, or end on open ground.' };
    return { ok: true, label: `open ground (joins no ${building.kind === 'railway' ? 'railway' : 'road'})`, end: { position: { x, y, z: pack.terrain.heightAt(x, y) }, anchor: { kind: 'free' } } };
  };
  // a road chosen in the list comes into view when none of it is on screen
  routeBar.onSelect = id => {
    if (!switchRoute(id)) return;
    const route = store.route, r = projectFull?.routes[id]?.legacy;
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
    if (committed) previewGesture = null;
    hideToast(); hud.noteEdit(committed);
    if (committed) {
      const ids = separateStretches();
      if (!historyStep && !store.oneDirection && [...stretchIds].some(id => !ids.has(id))) toast(DIRECTIONS_TEXT.togetherAgain, 'Undo', () => store.undo());
      stretchIds = ids; historyStep = false;
    }
    frameEnds(); frameLine(lineFrame.length, true, d);
    sel = activeSelection(store.activeRouteId, qualifiedSelection);
    if (d) {
      if (sel?.kind === 'bend' && sel.i >= d.pis.length) select(null);
      view.setDesign(d, selectedPi(), activeEndpoints()); hud.setDesign(d);
      profile.selectBend(selectedPi()); curveEdit.refresh(); linkEdit?.refresh(); works?.refresh();
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
  // what is under the pointer (ui/map-picks.ts)
  const { canvasBox, routeAt, roadAt, crossingAt, crossingWorksAt, buildingAt, sourceAt, thingAt } = createMapPicks({
    view, pack, extras, buildingPicker, transportData,
    get projectFull() { return projectFull; }, get last() { return last; }, get activeRouteId() { return store.activeRouteId; },
    get editable() { return store.read() !== null; }, get routes() { return projectStore.snapshot.design.routes; },
    get sourcePicker() { return sourcePicker; }, get sourceEditor() { return sourceEditor; },
  });
  /** the selected mapped road's stretch under the pointer, if a drag there would rebuild it */
  let grabbing: SourceInterval | null = null, grabbedSource: SourceHit | null = null;
  /** a press on a mapped road before the road links are loaded (client point; `ready` once they are) */
  type EarlyGrab = { x: number; y: number; ready: boolean };
  let grabbedEarly = null as EarlyGrab | null;
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
    const k = bendByDrag(x, y);
    // (a new bend, not one the old line's own curve already had, is fitted where its curve has room on release)
    return k;
  };
  /** A drag that starts on the road: on a straight it adds a bend there, which is fitted on release where
   * its curve has room (no curve-room problem from one drag, core/bend-fit.ts); on the curve of a bend, or
   * within an easement's length of it (a new bend there would crowd it), it moves that bend, which keeps its
   * distance from the pointer for the rest of the drag. */
  let grabOffset: { i: number; dx: number; dy: number } | null = null;
  const bendByDrag = (x: number, y: number): number => {
    const d = store.design, near = speedNorms(d.speed, d.category).minTransition;
    const on = bendAt(A, B, d.pis, d.speed, d.category, { x, y }, 15, near);
    if (on !== null) { grabOffset = { i: on, dx: d.pis[on].x - x, dy: d.pis[on].y - y }; select({ kind: 'bend', i: on }); return on; }
    grabOffset = null;
    const k = insertBend(x, y, false); select({ kind: 'bend', i: k });
    if (store.activeRouteId) placedByDrag = { routeId: store.activeRouteId, i: k };
    return k;
  };
  /** the new bend a drag placed (also the one a rebuilding drag adds): on release it is fitted where its curve
   * has room (core/bend-fit.ts) */
  let placedByDrag: { routeId: RouteId; i: number } | null = null;
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
    // placing a new line: a click beside the map says so (never nothing at all)
    onPickNothing: () => { if (buildTool.active) buildTool.place({ ok: false, why: 'That is beside the map: click on the map itself.' }); },
    onDoublePick: (x, y) => { if (!store.read() || routeAt(lastClient.x, lastClient.y, 10)) return; select({ kind: 'bend', i: insertBend(x, y, true) }); },
    // a drag from the road always bends it (a click there still inspects the nearest thing); so does a
    // drag on a selected mapped road's highlighted stretch, which rebuilds that stretch
    hitRoad: (clientX, clientY) => {
      grabbing = null; grabbedSource = null; grabbedEarly = null;
      if (buildTool.active) return false;
      if (roadAt(clientX, clientY, 9) >= 0) return true;
      grabbing = mappedGrab(clientX, clientY);
      if (grabbing) return true;
      // another designed road drawn there comes first (a click there picks it, as the hover says)
      const other = routeAt(clientX, clientY, 10);
      const corridorOf = (id: RouteId | null | undefined) => id ? corridorOfRoute(projectStore.snapshot.design, id)?.id ?? id : undefined;
      if (other && corridorOf(other.routeId) !== corridorOf(store.activeRouteId)) return false;
      // a drag that starts on any other mapped road never pans the map: it rebuilds the stretch there, or
      // its card says why it cannot be changed
      const s = sourceAt(clientX, clientY);
      if (s?.kind === 'source') { grabbedSource = s.hit; return true; }
      // before the road links are loaded: a mapped road there is held (no pan); a drag waits for the links
      // and then rebuilds it (a click opens its card once they are loaded)
      const g = !transportGraph && pack.transportMeta ? view.pick(clientX, clientY) : null;
      if (g && mappedRoadNear(g.x, g.y)) {
        const early: EarlyGrab = { x: g.x, y: g.y, ready: false }; grabbedEarly = early;
        void ensureTransport().then(() => { early.ready = true; if (grabbedEarly === early) view.resumeRoadDrag(); });
        return true;
      }
      return false;
    },
    onRoadDrag: (x, y) => {
      if (grabbedEarly) {
        if (!grabbedEarly.ready) return 'wait';
        // the pressed ground point, where it is on the screen now (a camera flight may have moved on)
        const g = grabbedEarly, at = view.project(g.x, g.y, view.drape(g.x, g.y)), box = canvasBox(); grabbedEarly = null;
        const s = at.vis ? sourceAt(box.left + at.sx, box.top + at.sy) : null;
        if (s?.kind !== 'source') return null;
        grabbedSource = s.hit;
      }
      if (grabbedSource) {
        showSource(grabbedSource); grabbedSource = null;
        const interval = sourceEditor?.interval;
        return interval ? rebuildByDrag({ ...interval }, x, y) : null;
      }
      if (grabbing) { const k = rebuildByDrag(grabbing, x, y); grabbing = null; return k; }
      if (!store.read()) return null; intro.hide(); return bendByDrag(x, y);
    },
    onPiSelect: (i) => { grabOffset = null; placedByDrag = null; select(i === null ? null : { kind: 'bend', i }); },
    onPiDrag: (i, x, y) => { const o = grabOffset?.i === i ? grabOffset : null; store.update((d) => { d.pis[i].x = x + (o?.dx ?? 0); d.pis[i].y = y + (o?.dy ?? 0); }, false); },
    onPiDragEnd: () => {
      grabOffset = null;
      const placed = placedByDrag; placedByDrag = null;
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
  // ---- profile: the same verbs (ui/profile-events.ts) ----
  profile.ev = profileEvents({
    store, view, select, selectPiece, takeProfile, commitFields, addHeightAt, setPin,
    get last() { return last; }, get sel() { return sel; },
    updateZoomButtons: () => updateZoomButtons(), highlightBend: i => highlightBend(i),
  });

  // ---- the profile's key (legend) and zoom buttons (ui/profile-bar.ts) ----
  const { keyBox, showKey, updateZoomButtons } = installProfileBar(profile);

  // ---- hover links between the map and the profile, the map's cursor (ui/map-hover.ts) ----
  const { highlightBend } = installMapHover({
    view, pack, profile, extras, buildTool, lastClient, routeAt, roadAt, crossingAt, crossingWorksAt, buildingAt, sourceAt,
    get last() { return last; }, get lastFull() { return lastFull; }, get design() { return store.design; },
    get transportIndex() { return transportIndex; }, get transportGraph() { return transportGraph; },
    ensureTransport, placeAt, mappedGrab, mappedRoadNear, bendLabel,
  });

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

  // ---- HUD (ui/hud-events.ts) ----
  hud.ev = hudEvents({
    store, projectStore, view, profile, hud, intro, settled, legacyFacade, takeProfile, select, switchRoute, joinStretch,
    get last() { return last; }, get lastFull() { return lastFull; }, get projectFull() { return projectFull; },
  });

  // ---- keyboard (ui/shortcuts.ts) ----
  installShortcuts({
    buildTool, intro, keyBox, showKey, select, setStructure, deletePi, undo: () => store.undo(), redo: () => store.redo(),
    get sel() { return sel; }, get mappedRoadSelected() { return !!sourceEditor?.selected; },
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
    get last() { return last; }, get projectFull() { return projectFull; },
    get transportIndex() { return transportIndex; }, get transportGraph() { return transportGraph; }, get sourceEditor() { return sourceEditor; },
    get sel() { return sel; }, get qualifiedSelection() { return qualifiedSelection; },
    get received() { return received; }, get heavyStats() { return heavyStats; }, get idleWaiters() { return idleWaiters; },
    sceneIdle, missionRouteId, switchRoute, select, selectPiece, placeAt, ensureTransport,
    releaseGrab: () => { grabbing = null; grabbedSource = null; grabbedEarly = null; },
  });
}

main().catch((e) => { console.error(e); setStatus(`Failed to load: ${e?.message ?? e}. Did you run "npm run data"?`); });
