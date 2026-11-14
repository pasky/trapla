import './style.css';
import { CATEGORIES, type CategoryId } from './core/data/categories';
import { DEFAULT_SCENARIO, scenarioParams } from './core/data/scenario';
import { MIN_VPI_GAP, normalizeVpis, type Design, type Result } from './core/evaluate';
import { nearestLeg } from './core/horizontal';
import { paintOverride, type StructureKind } from './core/overrides';
import { cellsInRange } from './core/range';
import { ROAD_CLASSES } from './core/data/urban';
import { RouteExtras } from './render/extras';
import { BuildAnnotations } from './render/build-tools';
import { CrossingRenderer } from './render/crossings';
import { BuildingPicker } from './render/building-pick';
import { objectDataKey, paintWallOverride, setBuildingOverride } from './core/build-controls';
import { BuildTools, buildingKind } from './ui/build-tools';
import { buildingLevels } from './core/buildings';
import { NoiseLayer } from './render/noise';
import { View } from './render/view';
import { loadPack } from './scenario';
import { RangeSelection, startDesign, Store } from './state';
import { CurveEditor } from './ui/curve-edit';
import { Hud } from './ui/hud';
import { ProfilePanel } from './ui/profile';
import { ViewBar, type ViewPrefs } from './ui/viewbar';
import { EditBar } from './ui/editbar';
import { SelectionBar } from './ui/selection-bar';
import type { WorkerIn } from './worker';
import { toast } from './ui/toast';
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
  const selBar = new SelectionBar(document.getElementById('profile')!, profileCanvas, profile);
  const editBar = new EditBar(document.getElementById('editbar')!, () => store.undo(), () => store.redo());
  const hud = new Hud(document.getElementById('hud')!, scenario);
  const intro = new Intro(document.getElementById('view')!);
  const tools = new BuildTools(hud.context, hud.decisions, (n) => { document.getElementById('decisions-count')!.textContent = n ? String(n) : ''; });
  tools.objectDataChanged = store.objectDataChanged;
  tools.describeBuilding = (j) => { const f = pack.overlays.binfo?.[j]; return buildingKind(f ?? undefined, buildingLevels(f ? f[1] : 0, f ? f[2] : 0)); };
  const annotations = new BuildAnnotations(view, document.getElementById('overlay')!, pack);
  const buildingPicker = new BuildingPicker(view, pack);
  const selectBuilding = (j: number) => { tools.selectBuilding(j); annotations.selectBuilding(j); closeStation(); };
  const closeBuilding = () => { tools.selectBuilding(null); annotations.selectBuilding(null); };
  tools.ev.closeBuilding = closeBuilding;
  annotations.onBuilding = selectBuilding;
  tools.ev.selectBuilding = selectBuilding;
  tools.ev.building = (j, action) => store.update((d) => { d.buildingOverrides = setBuildingOverride(d.buildingOverrides ?? [], j, action); });
  let station: number | null = null;
  const showStation = () => {
    if (station === null || !last) return;
    const s = station, pin = store.design.gradePins?.find((p) => Math.abs(p.s - s) < 0.1);
    const i = Math.max(0, Math.min(last.n - 1, Math.round(s / last.ds)));
    selBar.showStation(s, pin?.z ?? last.grade[i], !!pin, store.design.profileMode === 'auto');
  };
  const selectStation = (s: number) => { station = s; tools.selectStation(s); annotations.selectBuilding(null); profile.selectStation(s); showStation(); };
  const closeStation = () => { station = null; profile.selectStation(null); selBar.hide('station'); };
  annotations.onPin = selectStation;
  annotations.onCulvert = (s) => { profile.focus(s - 250, s + 250); };
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
  selection.on((range) => {
    profile.setSelection(range); hud.setRange(range); extras.setRange(range); tools.setRange(range);
    if (range) { closeStation(); selBar.showRange(range, store.design.structureOverrides); } else selBar.hide('range');
  });

  let selectedPi: number | null = null;
  let selectedVpi: number | null = null;
  let last: Result | null = null;
  const selectCrossing = (roadId: number) => {
    tools.selectCrossing(roadId);
    annotations.selectBuilding(null);
    profile.selectCrossing(roadId);
    const c = last?.crossings.find((c) => c.roadId === roadId);
    closeStation();
    if (c) view.setHover({ x: c.x, y: c.y, z: last!.grade[c.i] }, 'crossed road');
  };
  const closeCrossing = () => { tools.selectCrossing(null); profile.selectCrossing(null); view.setHover(null); };
  tools.ev.selectCrossing = (roadId) => {
    selectCrossing(roadId);
    // from the list / ‹ › buttons: bring the crossing into view
    const c = last?.crossings.find((c) => c.roadId === roadId);
    if (c && last) { view.flyTo(c.x, c.y, 900); profile.focus(c.s - 300, c.s + 300); }
  };
  tools.ev.closeCrossing = closeCrossing;
  tools.ev.structure = (kind) => setStructure(kind);
  tools.ev.clearRange = () => selection.set(null);
  tools.ev.selectRange = (s0, s1) => { selection.set({ s0, s1 }); profile.focus(s0, s1); };
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
    extras.setResult(r, CATEGORIES[rd.category].crownWidth, rd.structureOverrides, rd.wallOverrides);
    crossingRenderer.setResult(r);
    noise.setResult(r, CATEGORIES[rd.category].crownWidth);
    // a range beyond the end of a shortened route is gone
    if (selection.range && selection.range.s0 >= r.length) selection.set(null);
    profile.setResult(r, r.vpis, rd.structureOverrides, rd.gradePins, rd.wallOverrides);
    profile.setMode(rd.profileMode);
    document.getElementById('profile')!.classList.toggle('manual', rd.profileMode === 'manual');
    profile.setBends(bendStations(r, rd));
    if (selection.range && selBar.showing === 'range') selBar.showRange(selection.range, rd.structureOverrides);
    showStation();
    tools.objectDataChanged = store.objectDataChanged;
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
    profile.selectBend(i);
    selBar.hide('bend'); // a bend's bar belongs to the bend picked in the profile (re-shown there)
    view.setDesign(store.design, i);
    hud.setSelectedPi(i, last, store.design);
    curveEdit.refresh();
  };

  store.on((d) => {
    if (selectedPi !== null && selectedPi >= d.pis.length) selectedPi = null;
    view.setDesign(d, selectedPi);
    hud.setDesign(d);
    editBar.set(store.undoLabel(), store.redoLabel());
    selBar.hide('bend'); // its station / mode may be stale now
    profile.selectBend(selectedPi);
    curveEdit.refresh();
    requestEval();
  });

  // ---- map interactions ----
  // From afar a click near the road means "a bend here": buildings are pickable only once they are
  // a few pixels big, and crossed roads need a closer click
  const buildingsPickable = () => view.metresPerPixel < 2.5;
  const crossingPickPx = () => (view.metresPerPixel < 4 ? 12 : 6);
  view.ev = {
    onPickTerrain: (x, y, clientX, clientY, forceBend) => {
      intro.hide();
      const building = forceBend || !buildingsPickable() ? null : buildingPicker.at(clientX, clientY, { x, y, z: pack.terrain.heightAt(x, y) });
      if (building !== null) { selectBuilding(building); return; }
      const rect = view.renderer.domElement.getBoundingClientRect();
      const mx = clientX - rect.left, my = clientY - rect.top;
      let picked: number | null = null, distance = crossingPickPx();
      for (const c of last?.crossings ?? []) {
        const p = view.project(c.x, c.y, Math.max(last!.grade[c.i], last!.grade[c.i] - c.h) + 2);
        const gap = Math.hypot(p.sx - mx, p.sy - my);
        if (p.vis && gap < distance && c.roadId !== undefined) { picked = c.roadId; distance = gap; }
      }
      if (!forceBend && picked !== null) { selectCrossing(picked); return; }
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
    onHover: (s, label) => {
      if (s === null || !last) { view.setHover(null); return; }
      const i = Math.max(0, Math.min(last.n - 1, Math.round(s / last.ds)));
      view.setHover({ x: last.x[i], y: last.y[i], z: last.grade[i] }, label);
    },
    // a click in the profile zooms it there; the map glides to the same spot at a matching distance
    onZoomTo: (s, span) => {
      if (!last) return;
      const i = Math.max(0, Math.min(last.n - 1, Math.round(s / last.ds)));
      view.flyTo(last.x[i], last.y[i], Math.max(700, Math.min(20000, span * 0.9)));
    },
    onView: () => updateZoomButtons(),
    onDraw: () => selBar.place(),
    onBendHover: (i) => highlightBend(i),
    onBendSelect: (i) => {
      selectPi(i);
      const pi = store.design.pis[i], b = last && bendStations(last, store.design)[i];
      if (pi) view.flyTo(pi.x, pi.y);
      if (b && !selection.range) { closeStation(); selBar.showBend(i, b.s, store.design.profileMode === 'auto'); }
    },
    onPinAdd: (s) => addHeightAt(s),
    onPinDrag: (s, z) => store.update((d) => { const p = d.gradePins?.find((p) => Math.abs(p.s - s) < 0.1); if (p) p.z = z; }, false),
    onPinDragEnd: () => store.commit(),
  };

  /** Automatic: pin the road's current height at station s (then drag / type it); By hand: add a height point */
  const addHeightAt = (s: number) => {
    if (!last) return;
    const i = Math.max(0, Math.min(last.n - 2, Math.floor(s / last.ds))), t = (s - last.s[i]) / last.ds;
    const z = Math.round((last.grade[i] + t * (last.grade[i + 1] - last.grade[i])) * 10) / 10;
    if (store.design.profileMode === 'manual') { profile.ev.onVpiAdd?.(s, z); return; }
    if (!store.design.gradePins?.some((p) => Math.abs(p.s - s) < 0.1)) tools.ev.pin?.(s, z);
    selectStation(s);
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

  // ---- the selection bar over the profile ----
  selBar.ev = {
    structure: (kind) => setStructure(kind),
    close: (what) => { if (what === 'range') selection.set(null); else if (what === 'bend') selBar.hide('bend'); else closeStation(); },
    walls: () => {
      const w = document.getElementById('wall-tools');
      if (w) hud.scrollTo(w);
    },
    pin: (s, z) => tools.ev.pin?.(s, z),
    heightAt: (s) => { selBar.hide('bend'); addHeightAt(Math.round(s)); },
    refresh: () => showStation(),
  };

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
  let mapHoverAt: { x: number; y: number } | null = null, mapHoverFrame = 0, mapHoverK = -1;
  const mapHoverTick = () => {
    mapHoverFrame = 0;
    const at = mapHoverAt, r = last;
    let k = -1;
    if (at && r) {
      // the road as drawn (bridges included): nearest projected station within 12 px of the mouse
      const box = view.renderer.domElement.getBoundingClientRect();
      const mx = at.x - box.left, my = at.y - box.top;
      let bd = 12 * 12;
      const step = Math.max(1, Math.floor(r.n / 1500));
      for (let i = 0; i < r.n; i += step) {
        const p = view.project(r.x[i], r.y[i], r.grade[i]);
        const d = (p.sx - mx) ** 2 + (p.sy - my) ** 2;
        if (p.vis && d < bd) { bd = d; k = i; }
      }
      // refine between the subsampled stations
      if (k >= 0 && step > 1) for (let i = Math.max(0, k - step); i <= Math.min(r.n - 1, k + step); i++) {
        const p = view.project(r.x[i], r.y[i], r.grade[i]);
        const d = (p.sx - mx) ** 2 + (p.sy - my) ** 2;
        if (d < bd) { bd = d; k = i; }
      }
    }
    // what a click would pick: a crossed road or a building (pointer cursor, a label / tooltip), else a bend
    const canvas = view.renderer.domElement;
    let cross: Result['crossings'][number] | null = null, building: number | null = null;
    if (at && r) {
      const box = canvas.getBoundingClientRect();
      let best = crossingPickPx();
      for (const c of r.crossings) {
        if (c.roadId === undefined) continue;
        const p = view.project(c.x, c.y, Math.max(r.grade[c.i], r.grade[c.i] - c.h) + 2);
        const gap = Math.hypot(p.sx - (at.x - box.left), p.sy - (at.y - box.top));
        if (p.vis && gap < best) { best = gap; cross = c; }
      }
      if (!cross) {
        const g = view.pick(at.x, at.y);
        if (g && buildingsPickable()) building = buildingPicker.at(at.x, at.y, { x: g.x, y: g.y, z: pack.terrain.heightAt(g.x, g.y) });
      }
    }
    const cursor = cross || building !== null ? 'pointer' : '';
    if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
    const title = cross ? '' : building !== null ? 'Building: click for its options (Shift+click adds a bend here instead)' : '';
    if (canvas.title !== title) canvas.title = title;
    if (cross && r) {
      mapHoverK = -2;
      view.setHover({ x: cross.x, y: cross.y, z: r.grade[cross.i] }, `${ROAD_CLASSES[cross.cls].label} — click for options`);
      profile.setHover(cross.s, true);
      return;
    }
    if (k === mapHoverK) return; // nothing new to draw
    mapHoverK = k;
    if (k >= 0 && r) {
      profile.setHover(r.s[k], true);
      view.setHover({ x: r.x[k], y: r.y[k], z: r.grade[k] });
    } else {
      profile.setHover(null, true);
      view.setHover(null);
    }
  };
  view.renderer.domElement.addEventListener('pointermove', (e) => {
    mapHoverAt = e.buttons ? null : { x: e.clientX, y: e.clientY }; // not while panning / rotating
    if (!mapHoverFrame) mapHoverFrame = requestAnimationFrame(mapHoverTick);
  });
  view.renderer.domElement.addEventListener('pointerleave', () => { mapHoverAt = null; if (!mapHoverFrame) mapHoverFrame = requestAnimationFrame(mapHoverTick); });

  const paintRange = () => {
    const range = selection.range;
    if (!range || !last) return null;
    const [i0, i1] = cellsInRange(last, range.s0, Math.min(range.s1, last.length));
    return { s0: Math.max(0, (i0 - 0.5) * last.ds), s1: Math.min(last.length, (i1 + 0.5) * last.ds) };
  };
  tools.ev.wall = (side, height) => {
    const range = paintRange();
    if (!range) return;
    const previous = store.design.wallOverrides ?? [];
    const next = paintWallOverride(previous, range.s0, range.s1, side, height);
    if (JSON.stringify(previous) !== JSON.stringify(next)) store.update((d) => { d.wallOverrides = next; });
  };
  const setStructure = (kind: StructureKind | null) => {
    const range = paintRange();
    if (!range) return;
    const { s0, s1 } = range;
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
    onReset: () => {
      selectPi(null); selection.set(null); closeStation(); closeCrossing(); closeBuilding(); selectedVpi = null; hud.setSelectedVpi(null, last);
      store.reset(); view.resetCamera(); profile.fit();
      toast('Started over from the straight line.', 'Undo', () => store.undo());
    },
    onClosePi: () => selectPi(null),
    onCloseVpi: () => { selectedVpi = null; hud.setSelectedVpi(null, last); },
    onIntro: () => intro.show(),
    onLoadBest: () => { if (store.best) { store.replace(store.best.design); toast('Loaded your best valid design.', 'Undo', () => store.undo()); } },
    onRadius: (i, r) => store.update((d) => { if (d.pis[i]) d.pis[i].r = r; }),
    onDeletePi: (i) => { store.update((d) => { d.pis.splice(i, 1); }); selectPi(null); },
    onBendHeight: (i) => { const b = last && bendStations(last, store.design)[i]; if (b) addHeightAt(Math.round(b.s)); },
    onVpiRadius: (i, r) => store.update((d) => { takeProfile(d); if (d.vpis[i]) d.vpis[i].r = r; }),
    onDeleteVpi: (i) => { store.update((d) => { takeProfile(d); d.vpis.splice(i, 1); }); selectedVpi = null; hud.setSelectedVpi(null, last); },
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

  // a drag (bend, height point, pin, radius grip) is applied without a history entry until it ends:
  // Undo / Redo in the middle of one would be overwritten by its final commit
  let pointerHeld = 0;
  window.addEventListener('pointerdown', () => { pointerHeld++; }, { capture: true });
  for (const t of ['pointerup', 'pointercancel'] as const) window.addEventListener(t, () => { pointerHeld = Math.max(0, pointerHeld - 1); }, { capture: true });
  window.addEventListener('blur', () => { pointerHeld = 0; });
  const undoRedo = (redo: boolean) => {
    if (pointerHeld) return;
    // a focused select / checkbox would keep the build tools from redrawing with the restored design
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
    if (!e.ctrlKey && !e.metaKey && !e.altKey && selection.range) {
      const key = e.key.toLowerCase();
      if (['b', 't', 'e', 'c'].includes(key)) {
        e.preventDefault();
        if (!e.repeat) setStructure(key === 'b' ? 1 : key === 't' ? 2 : key === 'e' ? 0 : null);
        return;
      }
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPi !== null) {
      const i = selectedPi;
      store.update((d) => { d.pis.splice(i, 1); });
      selectPi(null);
    } else if (e.key === 'Escape') {
      if (intro.visible) intro.hide();
      else if (!keyBox.hidden) showKey(false);
      else if (selection.range) selection.set(null);
      else if (station !== null) closeStation();
      else if (tools.crossing !== null) closeCrossing();
      else if (tools.building !== null) closeBuilding();
      else selectPi(null);
    }
  }, { capture: true }); // range shortcuts take precedence over the map's E/C shortcuts

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
    profileHover: () => profile.hover,
    profilePoint: (s: number, z?: number, band?: boolean) => profile.toClient(s, z, band),
    bendStations: () => last && bendStations(last, store.design),
    cameraTarget: () => view.target,
    undoLabels: () => ({ undo: store.undoLabel(), redo: store.redoLabel() }),
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
