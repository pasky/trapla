import './style.css';
import { CATEGORIES, type CategoryId } from './core/data/categories';
import { DEFAULT_SCENARIO, scenarioParams } from './core/data/scenario';
import { MIN_VPI_GAP, normalizeVpis, type Design, type Result } from './core/evaluate';
import { nearestLeg } from './core/horizontal';
import { paintOverride, type StructureKind } from './core/overrides';
import { cellsInRange } from './core/range';
import { KIND } from './core/structures';
import { ROAD_CLASSES } from './core/data/urban';
import { RouteExtras } from './render/extras';
import { runSliced, type SlicedJob, type Staged } from './render/slices';
import { BuildAnnotations } from './render/build-tools';
import { CrossingRenderer } from './render/crossings';
import { BuildingPicker } from './render/building-pick';
import { objectDataKey, paintWallOverride, setBuildingOverride } from './core/build-controls';
import { DecisionList } from './ui/build-tools';
import { buildingInfo, Inspector, type Sel } from './ui/inspector';
import { pieceAt } from './ui/pieces';
import { createNoiseModel } from './core/road-noise';
import { buildingLevels } from './core/buildings';
import { NoiseLayer } from './render/noise';
import { View } from './render/view';
import { loadPack } from './scenario';
import { startDesign, Store } from './state';
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
const setStatus = (s: string) => { status.textContent = s; status.style.display = s ? '' : 'none'; };

async function main() {
  // ?scenario=<id> picks another pack (public/scenarios/<id>, game parameters in core/data/scenario.ts)
  const scenario = scenarioParams(new URLSearchParams(location.search).get('scenario') ?? DEFAULT_SCENARIO);
  const pack = await loadPack(`${import.meta.env.BASE_URL}scenarios/${scenario.id}`, setStatus);
  const { meta } = pack;
  const A = { x: meta.A.xy[0], y: meta.A.xy[1] }, B = { x: meta.B.xy[0], y: meta.B.xy[1] };
  document.getElementById('attrib')!.innerHTML = meta.attribution.join(' · ');
  document.getElementById('attrib')!.title = document.getElementById('attrib')!.textContent ?? '';
  document.getElementById('legend-official')!.textContent = scenario.labels.official;

  const store = new Store(`trapla.${scenario.id}`, startDesign,
    [meta.ground?.fingerprint ?? (meta.ground ? JSON.stringify(meta.ground) : 'unmapped'), meta.watercourses?.sha256 ?? 'raster-water'].join(':'),
    objectDataKey(pack.overlays.buildings, pack.overlays.binfo, pack.overlays.net));
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const init: WorkerIn = {
    type: 'init', nx: meta.nx, ny: meta.ny, cell: meta.cell, base: meta.heights.base, scale: meta.heights.scale,
    q: pack.q.slice(), lc: pack.lc.slice(), ground: pack.terrain.ground, watercourses: pack.terrain.watercourses?.data, a: A, b: B, buildings: pack.overlays.buildings,
    binfo: pack.overlays.binfo, net: pack.overlays.net, scenario,
  };
  worker.postMessage(init, [init.q.buffer, init.lc.buffer]);

  setStatus('building terrain…');
  const view = new View(document.getElementById('view')!, document.getElementById('overlay')!, pack, scenario.labels);
  const extras = new RouteExtras(view);
  const crossingRenderer = new CrossingRenderer(view);
  const noise = new NoiseLayer(view, pack, extras, document.getElementById('view')!, document.getElementById('overlay')!);
  const profileCanvas = document.getElementById('profile-canvas') as HTMLCanvasElement;
  const profile = new ProfilePanel(profileCanvas);
  const editBar = new EditBar(document.getElementById('editbar')!, () => store.undo(), () => store.redo());
  const hud = new Hud(document.getElementById('hud')!, scenario);
  const intro = new Intro(document.getElementById('view')!);
  const decisions = new DecisionList(hud.decisions, (n) => { document.getElementById('decisions-count')!.textContent = n ? String(n) : ''; });
  decisions.objectDataChanged = store.objectDataChanged;
  const binfo = (j: number) => { const f = pack.overlays.binfo?.[j]; return buildingInfo(f ?? undefined, buildingLevels(f ? f[1] : 0, f ? f[2] : 0)); };
  const annotations = new BuildAnnotations(view, document.getElementById('overlay')!, pack);
  const buildingPicker = new BuildingPicker(view, pack);
  // after the HUD: it syncs the HUD's exaggeration select
  const viewBar = new ViewBar(document.getElementById('viewbar')!, view, meta.orthophoto?.attribution, (on) => {
    document.getElementById('attrib')!.innerHTML = [...meta.attribution, ...(on && meta.orthophoto ? [meta.orthophoto.attribution] : [])].join(' · ');
  }, noise);

  let last: Result | null = null;
  let posted = 0, received = 0;
  /** main-thread ms per consumer of the last handled result (drag-perf probe) */
  const handlerTiming: Record<string, number> = {};
  let idleWaiters: (() => void)[] = [];

  // ---- the selection: one thing at a time, shown in the inspector, on the map and in the profile ----
  let sel: Sel | null = null;
  let models: { key: string; model: ReturnType<typeof createNoiseModel> } | null = null;
  const inspector = new Inspector(document.getElementById('inspector')!, {
    noiseModel: (d) => {
      const key = `${d.speed}`;
      if (!models || models.key !== key) models = { key, model: createNoiseModel(scenario.traffic, d.speed, { heavyShare: scenario.heavyShare }) };
      return models.model;
    },
    building: binfo,
    maxRadius: (i) => curveEdit.maxRadius(i),
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
  const select = (next: Sel | null, fly = false) => {
    sel = next;
    if (next) intro.hide();
    const range = next?.kind === 'stretch' ? { s0: next.s0, s1: next.s1 } : null;
    profile.setSelection(range); extras.setRange(range); hud.setRange(range);
    view.setDesign(store.design, selectedPi()); profile.selectBend(selectedPi()); curveEdit.refresh();
    const road = next?.kind === 'crossing' ? next.roadId : null;
    profile.selectCrossing(road); annotations.selectCrossing(road);
    annotations.selectBuilding(next?.kind === 'building' ? next.j : null);
    profile.selectStation(next?.kind === 'pin' ? next.s : null);
    profile.select(next?.kind === 'vpi' ? next.i : null);
    inspector.set(next);
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
      d.crossingOverrides = (d.crossingOverrides ?? []).filter((o) => o.roadId !== roadId);
      if (type !== null) d.crossingOverrides.push({ roadId, type });
    }),
    building: (js, action) => store.update((d) => { for (const j of js) d.buildingOverrides = setBuildingOverride(d.buildingOverrides ?? [], j, action); }),
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
  const inflight = new Map<number, Design>();
  // While the worker lags behind a drag (an older request is still running), show the moved
  // route's ground with the previous heights at once, at most once per frame. Display only.
  let previewFrame = 0;
  const schedulePreview = () => {
    if (previewFrame || received >= posted - 1 || !last) return;
    previewFrame = requestAnimationFrame(() => {
      previewFrame = 0;
      if (received < posted && last) profile.setPreview(provisionalProfile(A, B, store.design, last, (x, y) => pack.terrain.heightAt(x, y)));
    });
  };
  // Two tiers: while a drag is in progress (uncommitted store updates) the worker runs the fast
  // preview evaluation and only cheap things follow it (centreline, profile, "≈" total); the full
  // evaluation, the 3D rebuild, the inspector and any best score follow once the drag pauses or ends.
  const FULL_AFTER_IDLE_MS = 150;
  let fullTimer = 0;
  /** the newest request: a full one for this design needs no repeat when the drag ends */
  let lastPost: { full: boolean; design: string } | null = null;
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
    const design = JSON.stringify(store.design);
    if (!preview && lastPost?.full && lastPost.design === design) {
      // the drag paused before it ended: its full result is in, but a design half-way through a drag
      // was not offered as the best one — now it is let go of
      const f = lastFull;
      if (received === posted && f && f.valid && last === f && store.offerBest(f.cost.total, store.design)) hud.setResult(f, store.design, store.best);
      return;
    }
    heavy?.cancel(); heavy = null; // a rebuild for an older design would only be thrown away
    hud.setProfileBusy(true);
    posted++;
    lastPost = { full: !preview, design };
    inflight.set(posted, JSON.parse(design));
    worker.postMessage({ type: 'eval', id: posted, design: store.design, preview,
      materialValue: preview ? lastFull?.quantities.materialValue : undefined } satisfies WorkerIn);
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
  };

  worker.onmessage = (ev: MessageEvent) => {
    const m = ev.data;
    if (m.type === 'error') {
      console.error('worker error', m.message); received = m.id;
      setStatus('This design could not be computed (a bug, see the console). Undo the last change.');
      settle();
      return;
    }
    if (m.type !== 'result') return;
    if (m.id < received) return; // older than what is shown
    received = m.id;
    const r: Result = m.result;
    const rd = inflight.get(m.id) ?? store.design;
    for (const k of inflight.keys()) if (k <= m.id) inflight.delete(k);
    last = r;
    let lap = performance.now();
    const took = (k: string) => { const now = performance.now(); handlerTiming[k] = now - lap; lap = now; };
    for (const k in handlerTiming) delete handlerTiming[k];
    // Only the newest full result rebuilds the 3D earthworks / crossings, re-checks the selection,
    // redraws the inspector and may become the best score; a preview, or a full result the drag has
    // already moved past, updates cheap things.
    if (r.preview || m.id !== posted) {
      // a superseded full result is shown as provisional too: its verdict is for an older design
      const shown: Result = r.preview ? r : { ...r, preview: true };
      last = shown;
      view.setPreview(shown); took('view');
      profile.setResult(shown, shown.vpis, rd.structureOverrides, rd.gradePins, rd.wallOverrides);
      profile.setMode(rd.profileMode); // a height-point drag switches Automatic to By hand
      document.getElementById('profile')!.classList.toggle('manual', rd.profileMode === 'manual');
      profile.setBends(bendStations(shown, rd)); took('profile');
      hud.setResult(shown, rd, store.best); took('hud');
      curveEdit.refresh(); took('curveEdit');
      setStatus('');
      if (received < posted) schedulePreview();
      settle();
      return;
    }
    lastFull = r;
    // The 3D earthworks, collars and crossings (hundreds of ms) are built in slices between
    // frames and swapped in together; the previous ones stay on screen until then.
    const crown = CATEGORIES[rd.category].crownWidth;
    heavy?.cancel();
    const started = performance.now(), stats = { slices: 0, busy: 0, maxSlice: 0 };
    heavy = runSliced((function* () {
      // both parts stay owned here until handed over: a cancel between them disposes the first
      let routeGeometry: Staged | undefined, crossingGeometry: Staged | undefined, handedOver = false;
      try {
        routeGeometry = yield* view.buildResult(r, crown);
        crossingGeometry = yield* crossingRenderer.build(r);
        handedOver = true;
        return [routeGeometry, crossingGeometry] as const;
      } finally {
        if (!handedOver) { crossingGeometry?.dispose(); routeGeometry?.dispose(); }
      }
    })(), ([routeGeometry, crossingGeometry]) => {
      const t0 = performance.now();
      routeGeometry.commit(); const t1 = performance.now();
      crossingGeometry.commit(); const t2 = performance.now();
      extras.setResult(r, crown, rd.structureOverrides, rd.wallOverrides);
      noise.setResult(r, crown);
      annotations.setResult(r, rd);
      heavy = null;
      const t3 = performance.now();
      heavyStats = { ...stats, wall: t3 - started, commit: t3 - t0, commitView: t1 - t0, commitCrossings: t2 - t1, overlays: t3 - t2 };
      settle();
    }, (e) => {
      console.error('3D rebuild failed', e);
      setStatus('The 3D view could not be updated (a bug, see the console).');
      heavy = null; lastPost = null; // the same design may be requested again
      settle();
    }, 8, stats); took('view');
    revalidate(r, rd);
    profile.setResult(r, r.vpis, rd.structureOverrides, rd.gradePins, rd.wallOverrides);
    profile.setMode(rd.profileMode);
    document.getElementById('profile')!.classList.toggle('manual', rd.profileMode === 'manual');
    profile.setBends(bendStations(r, rd)); took('profile');
    decisions.objectDataChanged = store.objectDataChanged;
    decisions.setResult(r, rd, (j) => binfo(j).kind); took('decisions');
    // the best design is a design the player let go of, not a position half-way through a drag
    if (r.valid && !uncommitted) store.offerBest(r.cost.total, rd);
    hud.setResult(r, rd, store.best); took('hud');
    inspector.setResult(r, rd); took('inspector');
    curveEdit.refresh(); took('curveEdit');
    setStatus('');
    settle();
  };

  // on-map radius handles for the selected bend (grips, + / −)
  const curveEdit = new CurveEditor(view, document.getElementById('overlay')!, pack.terrain, {
    a: A, b: B, design: () => store.design, selected: () => selectedPi(), result: () => last,
    setRadius: (i, r, commit) => store.update((d) => { if (d.pis[i]) d.pis[i].r = r; }, commit),
    commit: () => store.commit(),
  });

  let uncommitted = false;
  store.on((d, committed) => {
    uncommitted = !committed;
    hideToast(); // its Undo belongs to the edit before this one
    hud.noteEdit(committed);
    if (sel?.kind === 'bend' && sel.i >= d.pis.length) select(null);
    view.setDesign(d, selectedPi());
    hud.setDesign(d);
    editBar.set(store.undoLabel(), store.redoLabel());
    profile.selectBend(selectedPi());
    curveEdit.refresh();
    requestEval(!committed);
  });

  // ---- map: click inspects, dragging the road bends it, empty ground deselects ----
  // buildings are pickable once they are a few pixels big
  const buildingsPickable = () => view.metresPerPixel < 3;
  // crossed roads are clickable once they are drawn big enough; from afar a click on the road picks its piece
  const crossingPickPx = () => (view.metresPerPixel < 4 ? 12 : view.metresPerPixel < 10 ? 6 : 0);
  const canvasBox = () => view.renderer.domElement.getBoundingClientRect();
  /** station index of the road drawn within `px` of a client point, −1 if none: distance to the drawn
   * line between consecutive stations (tunnels are drawn on the ground above them) */
  const roadAt = (clientX: number, clientY: number, px: number) => {
    const r = last;
    if (!r) return -1;
    const box = canvasBox(), mx = clientX - box.left, my = clientY - box.top;
    const z = (i: number) => (r.kind[i] === KIND.tunnel ? r.ground[i] : r.grade[i]);
    let bd = px * px, k = -1;
    const step = Math.max(1, Math.floor(r.n / 1500));
    let prev = view.project(r.x[0], r.y[0], z(0)), pi = 0;
    for (let i = step; i < r.n + step - 1; i += step) {
      const j = Math.min(r.n - 1, i), p = view.project(r.x[j], r.y[j], z(j));
      if (p.vis && prev.vis) {
        const dx = p.sx - prev.sx, dy = p.sy - prev.sy, L2 = dx * dx + dy * dy;
        const t = L2 > 0 ? Math.max(0, Math.min(1, ((mx - prev.sx) * dx + (my - prev.sy) * dy) / L2)) : 0;
        const d = (prev.sx + t * dx - mx) ** 2 + (prev.sy + t * dy - my) ** 2;
        if (d < bd) { bd = d; k = Math.round(pi + t * (j - pi)); }
      }
      prev = p; pi = j;
    }
    return k;
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
  const buildingAt = (clientX: number, clientY: number) => {
    if (!buildingsPickable()) return null;
    const g = view.pick(clientX, clientY);
    return g ? buildingPicker.at(clientX, clientY, { x: g.x, y: g.y, z: pack.terrain.heightAt(g.x, g.y) }) : null;
  };
  /** what a click at a client point means */
  const thingAt = (clientX: number, clientY: number): Sel | 'road' | null => {
    const c = crossingAt(clientX, clientY);
    if (c) return { kind: 'crossing', roadId: c.roadId! };
    const k = roadAt(clientX, clientY, 10);
    if (k >= 0) return 'road';
    const b = buildingAt(clientX, clientY);
    if (b !== null) return { kind: 'building', j: b };
    const w = extras.wallAt(clientX, clientY);
    if (w) return { kind: 'stretch', s0: w.s0, s1: w.s1 };
    return null;
  };
  const insertBend = (x: number, y: number, commit: boolean) => {
    const k = nearestLeg(A, B, store.design.pis, { x, y });
    store.update((d) => { d.pis.splice(k, 0, { x, y, r: null }); }, commit);
    return k;
  };
  view.ev = {
    onPickTerrain: (_x, _y, clientX, clientY) => {
      intro.hide();
      const t = thingAt(clientX, clientY);
      if (t === 'road') { const k = roadAt(clientX, clientY, 10); if (last && k >= 0) selectPiece(last.s[k]); }
      else select(t);
    },
    onDoublePick: (x, y) => { if (roadAt(lastClient.x, lastClient.y, 10) >= 0) return; select({ kind: 'bend', i: insertBend(x, y, true) }); },
    // a drag from the road always bends it (a click there still inspects the nearest thing)
    hitRoad: (clientX, clientY) => roadAt(clientX, clientY, 9) >= 0,
    onRoadDrag: (x, y) => { intro.hide(); const k = insertBend(x, y, false); select({ kind: 'bend', i: k }); return k; },
    onPiSelect: (i) => select(i === null ? null : { kind: 'bend', i }),
    onPiDrag: (i, x, y) => store.update((d) => { d.pis[i].x = x; d.pis[i].y = y; }, false),
    onPiDragEnd: () => store.commit(),
    onPiDelete: (i) => deletePi(i),
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
    if (at && r) {
      const cross = crossingAt(at.x, at.y);
      const k = cross ? -1 : roadAt(at.x, at.y, 10);
      const building = cross || k >= 0 ? null : buildingAt(at.x, at.y);
      if (cross) {
        cursor = 'pointer'; key = `x${cross.roadId}`;
        if (key !== mapHoverKey) { view.setHover({ x: cross.x, y: cross.y, z: r.grade[cross.i] }, ROAD_CLASSES[cross.cls].label); profile.setHover(cross.s, true); }
      } else if (k >= 0) {
        cursor = 'grab'; key = `r${k}`;
        if (key !== mapHoverKey) { view.setHover({ x: r.x[k], y: r.y[k], z: r.kind[k] === KIND.tunnel ? r.ground[k] : r.grade[k] }, 'drag to bend'); profile.setHover(r.s[k], true); }
      } else if (building !== null) { cursor = 'pointer'; key = `b${building}`; }
      else if (extras.wallAt(at.x, at.y)) { cursor = 'pointer'; key = 'w'; }
    }
    if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
    if (key === mapHoverKey) return;
    if (!key.startsWith('x') && !key.startsWith('r')) { view.setHover(null); profile.setHover(null, true); }
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
      toast('Back to the straight line.', 'Undo', () => store.undo());
    },
    onIntro: () => intro.show(),
    onLoadBest: () => { if (store.best) { store.replace(store.best.design); toast('Loaded your best design.', 'Undo', () => store.undo()); } },
    onExaggeration: (e) => viewBar.set({ exag: e }),
    onViolation: (k) => {
      // the list shows the last full result's violations (previews do not replace it)
      const r = lastFull, v = r?.violations[k];
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
    },
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

  view.setDesign(store.design, null);
  hud.setDesign(store.design);
  editBar.set(store.undoLabel(), store.redoLabel());
  setStatus('computing…');
  requestEval();

  // ---- debug / automation API ----
  (window as unknown as { trapla: unknown }).trapla = {
    getDesign: () => JSON.parse(JSON.stringify(store.design)),
    setDesign: (d: Design) => store.replace(d),
    result: () => last,
    summary: () => last && {
      length: last.length, travelMin: last.travelMin, valid: last.valid, cost: last.cost, violations: last.violations,
      quantities: { ...last.quantities, massHaul: undefined, hitBuildings: last.quantities.hitBuildings.length },
      runs: last.runs, timing: last.timing, vpis: last.vpis.length, crossings: last.crossings, walls: last.walls,
    },
    whenIdle: () => new Promise<void>((res) => { if (sceneIdle()) res(); else idleWaiters.push(res); }),
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
    profileHover: () => profile.hover,
    profilePoint: (s: number, z?: number, band?: boolean) => profile.toClient(s, z, band),
    bendStations: () => last && bendStations(last, store.design),
    cameraTarget: () => view.target,
    cameraDistance: () => view.cameraDistance,
    undoLabels: () => ({ undo: store.undoLabel(), redo: store.redoLabel() }),
    selectRange: (s0: number | null, s1?: number) => select(s0 === null || s1 === undefined ? null : { kind: 'stretch', s0, s1 }),
    range: () => (sel?.kind === 'stretch' ? { s0: sel.s0, s1: sel.s1 } : null),
    /** the road's screen point (px inside the view) at station s */
    roadScreen: (s: number) => { if (!last) return null; const i = Math.max(0, Math.min(last.n - 1, Math.round(s / last.ds))); return view.project(last.x[i], last.y[i], last.grade[i]); },
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
