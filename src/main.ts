import './style.css';
import { CATEGORIES, type CategoryId } from './core/data/categories';
import { D11_SCENARIO } from './core/data/scenario';
import { MIN_VPI_GAP, normalizeVpis, type Design, type Result } from './core/evaluate';
import { nearestLeg } from './core/horizontal';
import { RouteExtras } from './render/extras';
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

  const store = new Store('trapla.d11', startDesign);
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
  const profile = new ProfilePanel(document.getElementById('profile-canvas') as HTMLCanvasElement);
  const hud = new Hud(document.getElementById('hud')!, D11_SCENARIO);
  // after the HUD: it syncs the HUD's exaggeration select
  const viewBar = new ViewBar(document.getElementById('viewbar')!, view, meta.orthophoto?.attribution, (on) => {
    document.getElementById('attrib')!.innerHTML = [...meta.attribution, ...(on && meta.orthophoto ? [meta.orthophoto.attribution] : [])].join(' · ');
  });

  // station range picked for the cost breakdown: profile panel → HUD, profile, map
  const selection = new RangeSelection();
  selection.on((range) => { profile.setSelection(range); hud.setRange(range); extras.setRange(range); });

  let selectedPi: number | null = null;
  let selectedVpi: number | null = null;
  let last: Result | null = null;
  let posted = 0, received = 0;
  let idleWaiters: (() => void)[] = [];

  // designs of in-flight requests: intermediate results are shown (live feedback while dragging), but
  // always rendered with the design they were computed for
  const inflight = new Map<number, Design>();
  const requestEval = () => {
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
    extras.setResult(r, CATEGORIES[rd.category].crownWidth);
    // a range beyond the end of a shortened route is gone
    if (selection.range && selection.range.s0 >= r.length) selection.set(null);
    profile.setResult(r, r.vpis);
    if (r.valid && received === posted) store.offerBest(r.cost.total, rd);
    hud.setResult(r, rd, store.best);
    hud.setSelectedPi(selectedPi, r, store.design);
    hud.setSelectedVpi(selectedVpi, r);
    curveEdit.refresh();
    setStatus('');
    if (received === posted) { const w = idleWaiters; idleWaiters = []; w.forEach((f) => f()); }
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
    onPickTerrain: (x, y) => {
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

  // ---- HUD ----
  hud.ev = {
    onCategory: (c) => store.update((d) => { d.category = c as CategoryId; }),
    onSpeed: (s) => store.update((d) => { d.speed = s; }),
    onAutoProfile: () => store.update((d) => { d.profileMode = 'auto'; }),
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
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); store.redo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPi !== null) {
      const i = selectedPi;
      store.update((d) => { d.pis.splice(i, 1); });
      selectPi(null);
    } else if (e.key === 'Escape') { if (selection.range) selection.set(null); else selectPi(null); }
  });
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
    maxRadius: (i: number) => curveEdit.maxRadius(i),
    pick: (clientX: number, clientY: number) => view.pick(clientX, clientY),
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
