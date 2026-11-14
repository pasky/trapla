import './style.css';
import { CATEGORIES, type CategoryId } from './core/data/categories';
import { D11_SCENARIO } from './core/data/scenario';
import { MIN_VPI_GAP, normalizeVpis, type Design, type Result } from './core/evaluate';
import { nearestLeg } from './core/horizontal';
import { paintOverride, type StructureKind } from './core/overrides';
import { cellsInRange } from './core/range';
import { RouteExtras } from './render/extras';
import { BuildAnnotations } from './render/build-tools';
import { CrossingRenderer } from './render/crossings';
import { BuildingPicker } from './render/building-pick';
import { setBuildingOverride } from './core/build-controls';
import { BuildTools } from './ui/build-tools';
import { NoiseLayer } from './render/noise';
import { View } from './render/view';
import { loadPack } from './scenario';
import { RangeSelection, startDesign, Store } from './state';
import { CurveEditor } from './ui/curve-edit';
import { Hud } from './ui/hud';
import { ProfilePanel } from './ui/profile';
import { ViewBar, type ViewPrefs } from './ui/viewbar';
import type { WorkerIn } from './worker';

const status = document.getElementById('status')!;
const setStatus = (s: string) => { status.textContent = s; status.style.display = s ? '' : 'none'; };

async function main() {
  const pack = await loadPack(`${import.meta.env.BASE_URL}scenarios/d11`, setStatus);
  const { meta } = pack;
  const A = { x: meta.A.xy[0], y: meta.A.xy[1] }, B = { x: meta.B.xy[0], y: meta.B.xy[1] };
  document.getElementById('attrib')!.innerHTML = meta.attribution.join(' · ');

  const store = new Store('trapla.d11', startDesign,
    meta.ground?.fingerprint ?? (meta.ground ? JSON.stringify(meta.ground) : 'unmapped'));
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const init: WorkerIn = {
    type: 'init', nx: meta.nx, ny: meta.ny, cell: meta.cell, base: meta.heights.base, scale: meta.heights.scale,
    q: pack.q.slice(), lc: pack.lc.slice(), ground: pack.terrain.ground, a: A, b: B, buildings: pack.overlays.buildings,
    binfo: pack.overlays.binfo, net: pack.overlays.net,
  };
  worker.postMessage(init, [init.q.buffer, init.lc.buffer]);

  setStatus('building terrain…');
  const view = new View(document.getElementById('view')!, document.getElementById('overlay')!, pack);
  const extras = new RouteExtras(view);
  const crossingRenderer = new CrossingRenderer(view);
  const noise = new NoiseLayer(view, pack, extras, document.getElementById('view')!, document.getElementById('overlay')!);
  const profile = new ProfilePanel(document.getElementById('profile-canvas') as HTMLCanvasElement);
  const hud = new Hud(document.getElementById('hud')!, D11_SCENARIO);
  const tools = new BuildTools(document.getElementById('hud')!);
  const annotations = new BuildAnnotations(view, document.getElementById('overlay')!, pack);
  const buildingPicker = new BuildingPicker(view, pack);
  const selectBuilding = (j: number) => { tools.selectBuilding(j); annotations.selectBuilding(j); };
  annotations.onBuilding = selectBuilding;
  tools.ev.selectBuilding = selectBuilding;
  tools.ev.building = (j, action) => store.update((d) => { d.buildingOverrides = setBuildingOverride(d.buildingOverrides ?? [], j, action); });
  const selectStation = (s: number) => { tools.selectStation(s); profile.selectStation(s); };
  annotations.onPin = selectStation;
  tools.ev.selectStation = selectStation;
  tools.ev.pin = (s, z) => store.update((d) => {
    d.gradePins = (d.gradePins ?? []).filter((p) => Math.abs(p.s - s) >= 0.1);
    if (z !== null) d.gradePins.push({ s, z });
    d.gradePins.sort((a, b) => a.s - b.s);
  });
  // after the HUD: it syncs the HUD's exaggeration select
  const viewBar = new ViewBar(document.getElementById('viewbar')!, view, meta.orthophoto?.attribution, (on) => {
    document.getElementById('attrib')!.innerHTML = [...meta.attribution, ...(on && meta.orthophoto ? [meta.orthophoto.attribution] : [])].join(' · ');
  }, noise);

  // station range picked for the cost breakdown: profile panel → HUD, profile, map
  const selection = new RangeSelection();
  selection.on((range) => { profile.setSelection(range); hud.setRange(range); extras.setRange(range); tools.setRange(range); });

  let selectedPi: number | null = null;
  let selectedVpi: number | null = null;
  let last: Result | null = null;
  const selectCrossing = (roadId: number) => {
    tools.selectCrossing(roadId);
    const c = last?.crossings.find((c) => c.roadId === roadId);
    if (c) { profile.selectStation(c.s); view.setHover({ x: c.x, y: c.y, z: last!.grade[c.i] }); }
  };
  tools.ev.selectCrossing = selectCrossing;
  tools.ev.crossing = (roadId, type) => store.update((d) => {
    d.crossingOverrides = (d.crossingOverrides ?? []).filter((o) => o.roadId !== roadId);
    if (type !== null) d.crossingOverrides.push({ roadId, type });
  });
  let posted = 0, received = 0;
  let idleWaiters: (() => void)[] = [];

  // designs of in-flight requests: intermediate results are shown (live feedback while dragging), but
  // always rendered with the design they were computed for
  const inflight = new Map<number, Design>();
  const requestEval = () => {
    hud.setProfileBusy(true);
    posted++;
    inflight.set(posted, JSON.parse(JSON.stringify(store.design)));
    worker.postMessage({ type: 'eval', id: posted, design: store.design } satisfies WorkerIn);
  };

  worker.onmessage = (ev: MessageEvent) => {
    const m = ev.data;
    if (m.type === 'error') { console.error('worker error', m.message); received = m.id; return; }
    if (m.type !== 'result') return;
    if (m.id < received) return; // older than what is shown
    received = m.id;
    const r: Result = m.result;
    const rd = inflight.get(m.id) ?? store.design;
    for (const k of inflight.keys()) if (k <= m.id) inflight.delete(k);
    last = r;
    view.setResult(r, CATEGORIES[rd.category].crownWidth);
    extras.setResult(r, CATEGORIES[rd.category].crownWidth, rd.structureOverrides);
    crossingRenderer.setResult(r);
    noise.setResult(r, CATEGORIES[rd.category].crownWidth);
    // a range beyond the end of a shortened route is gone
    if (selection.range && selection.range.s0 >= r.length) selection.set(null);
    profile.setResult(r, r.vpis, rd.structureOverrides, rd.gradePins);
    tools.setResult(r, rd);
    annotations.setResult(r, rd);
    if (r.valid && received === posted) store.offerBest(r.cost.total, rd);
    hud.setResult(r, rd, store.best);
    hud.setSelectedPi(selectedPi, r, store.design);
    hud.setSelectedVpi(selectedVpi, r);
    curveEdit.refresh();
    setStatus('');
    if (received === posted) { hud.setProfileBusy(false); const w = idleWaiters; idleWaiters = []; w.forEach((f) => f()); }
  };

  // on-map radius handles for the selected bend (grips, wheel, + / −, max, auto)
  const curveEdit = new CurveEditor(view, document.getElementById('overlay')!, pack.terrain, {
    a: A, b: B, design: () => store.design, selected: () => selectedPi, result: () => last,
    setRadius: (i, r, commit) => store.update((d) => { if (d.pis[i]) d.pis[i].r = r; }, commit),
    commit: () => store.commit(),
  });
  const selectPi = (i: number | null) => {
    selectedPi = i;
    view.setDesign(store.design, i);
    hud.setSelectedPi(i, last, store.design);
    curveEdit.refresh();
  };

  store.on((d) => {
    if (selectedPi !== null && selectedPi >= d.pis.length) selectedPi = null;
    view.setDesign(d, selectedPi);
    hud.setDesign(d, store.canUndo(), store.canRedo());
    curveEdit.refresh();
    requestEval();
  });

  // ---- map interactions ----
  view.ev = {
    onPickTerrain: (x, y, clientX, clientY) => {
      const building = buildingPicker.at(clientX, clientY, { x, y, z: pack.terrain.heightAt(x, y) });
      if (building !== null) { selectBuilding(building); return; }
      const rect = view.renderer.domElement.getBoundingClientRect();
      const mx = clientX - rect.left, my = clientY - rect.top;
      let picked: number | null = null, distance = 12;
      for (const c of last?.crossings ?? []) {
        const p = view.project(c.x, c.y, Math.max(last!.grade[c.i], last!.grade[c.i] - c.h) + 2);
        const gap = Math.hypot(p.sx - mx, p.sy - my);
        if (p.vis && gap < distance && c.roadId !== undefined) { picked = c.roadId; distance = gap; }
      }
      if (picked !== null) { selectCrossing(picked); return; }
      const k = nearestLeg(A, B, store.design.pis, { x, y });
      store.update((d) => { d.pis.splice(k, 0, { x, y, r: null }); });
      selectPi(k);
    },
    onPiSelect: (i) => selectPi(i),
    onPiDrag: (i, x, y) => store.update((d) => { d.pis[i].x = x; d.pis[i].y = y; }, false),
    onPiDragEnd: () => store.commit(),
    onPiDelete: (i) => { store.update((d) => { d.pis.splice(i, 1); }); selectPi(null); },
  };

  // ---- profile interactions ----
  const takeProfile = (d: Design) => {
    if (d.profileMode === 'auto' && last) d.vpis = last.vpis.map((v) => ({ ...v }));
    d.profileMode = 'manual';
    // keep the stored list identical to what the evaluator uses, so panel indices match the design
    if (last) d.vpis = normalizeVpis(d.vpis, last.length, last.vpis[0].z, last.vpis[last.vpis.length - 1].z);
  };
  profile.ev = {
    onStationSelect: selectStation,
    onCrossingSelect: selectCrossing,
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
    onVpiDelete: (i) => { store.update((d) => { takeProfile(d); d.vpis.splice(i, 1); }); selectedVpi = null; },
    onVpiSelect: (i) => { selectedVpi = i; hud.setSelectedVpi(i, last); },
    onSelect: (range) => selection.set(range),
    onHover: (s) => {
      if (s === null || !last) { view.setHover(null); return; }
      const i = Math.max(0, Math.min(last.n - 1, Math.round(s / last.ds)));
      view.setHover({ x: last.x[i], y: last.y[i], z: last.grade[i] });
    },
  };

  const setStructure = (kind: StructureKind | null) => {
    const range = selection.range;
    if (!range || !last) return;
    const [i0, i1] = cellsInRange(last, range.s0, Math.min(range.s1, last.length));
    const s0 = Math.max(0, (i0 - 0.5) * last.ds), s1 = Math.min(last.length, (i1 + 0.5) * last.ds);
    const previous = store.design.structureOverrides ?? [];
    const next = paintOverride(previous, s0, s1, kind);
    if (next.length === previous.length && next.every((r, i) => r.s0 === previous[i].s0 && r.s1 === previous[i].s1 && r.kind === previous[i].kind)) return;
    store.update((d) => { d.structureOverrides = next; });
  };

  // ---- HUD ----
  hud.ev = {
    onCategory: (c) => store.update((d) => { d.category = c as CategoryId; }),
    onSpeed: (s) => store.update((d) => { d.speed = s; }),
    onProfileMode: (mode) => {
      if (mode === store.design.profileMode || (mode === 'manual' && (!last || received !== posted))) return;
      store.update((d) => { if (mode === 'manual') takeProfile(d); else d.profileMode = 'auto'; });
    },
    onStructure: setStructure,
    onUndo: () => store.undo(),
    onRedo: () => store.redo(),
    onReset: () => { selectPi(null); store.reset(); view.resetCamera(); },
    onLoadBest: () => { if (store.best) store.replace(store.best.design); },
    onRadius: (i, r) => store.update((d) => { if (d.pis[i]) d.pis[i].r = r; }),
    onDeletePi: (i) => { store.update((d) => { d.pis.splice(i, 1); }); selectPi(null); },
    onVpiRadius: (i, r) => store.update((d) => { takeProfile(d); if (d.vpis[i]) d.vpis[i].r = r; }),
    onDeleteVpi: (i) => { store.update((d) => { takeProfile(d); d.vpis.splice(i, 1); }); selectedVpi = null; hud.setSelectedVpi(null, last); },
    onClearRange: () => selection.set(null),
    onExaggeration: (e) => viewBar.set({ exag: e }),
    onViolation: (k) => {
      const v = last?.violations[k];
      if (!v || !last) return;
      const i = Math.max(0, Math.min(last.n - 1, Math.round((v.s0 + v.s1) / 2 / last.ds)));
      view.lookAt(last.x[i], last.y[i], Math.max(1500, (v.s1 - v.s0) * 1.5), 20, 45);
      profile.focus(v.s0, v.s1);
      if (v.pi !== undefined) selectPi(v.pi);
    },
  };

  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('input, select, textarea, [contenteditable="true"]')) return;
    if (!e.ctrlKey && !e.metaKey && !e.altKey && selection.range) {
      const key = e.key.toLowerCase();
      if (['b', 't', 'e', 'c'].includes(key)) {
        e.preventDefault();
        if (!e.repeat) setStructure(key === 'b' ? 1 : key === 't' ? 2 : key === 'e' ? 0 : null);
        return;
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); store.redo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPi !== null) {
      const i = selectedPi;
      store.update((d) => { d.pis.splice(i, 1); });
      selectPi(null);
    } else if (e.key === 'Escape') { if (selection.range) selection.set(null); else selectPi(null); }
  }, { capture: true }); // range shortcuts take precedence over the map's E/C shortcuts
  document.getElementById('fit')!.onclick = () => profile.fit();

  view.setDesign(store.design, null);
  hud.setDesign(store.design, store.canUndo(), store.canRedo());
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
    whenIdle: () => new Promise<void>((res) => { if (received === posted) res(); else idleWaiters.push(res); }),
    lookAt: (x: number, y: number, dist?: number, bearing?: number, elev?: number) => view.lookAt(x, y, dist, bearing, elev),
    resetCamera: () => view.resetCamera(),
    selectPi,
    selectStation,
    selectCrossing,
    selectBuilding,
    maxRadius: (i: number) => curveEdit.maxRadius(i),
    pick: (clientX: number, clientY: number) => view.pick(clientX, clientY),
    project: (x: number, y: number, z: number) => view.project(x, y, z),
    /** screen position (px inside the view) of building j's centroid, `up` metres above its ground */
    buildingScreen: (j: number, up = 2) => {
      const b = pack.overlays.buildings[j];
      return b && view.project(b[0], b[1], pack.terrain.heightAt(b[0], b[1]) + up);
    },
    profileFocus: (s0: number, s1: number) => profile.focus(s0, s1),
    profileFit: () => profile.fit(),
    profileView: () => profile.view,
    selectRange: (s0: number | null, s1?: number) => selection.set(s0 === null || s1 === undefined ? null : { s0, s1 }),
    range: () => selection.range,
    setExaggeration: (e: number) => viewBar.set({ exag: e }),
    setView: (p: Partial<ViewPrefs>) => viewBar.set(p),
    viewBusy: () => view.busy,
    meta,
    official: meta.official.xy,
    A, B,
  };
}

main().catch((e) => { console.error(e); setStatus(`Failed to load: ${e?.message ?? e}. Did you run "npm run data"?`); });
