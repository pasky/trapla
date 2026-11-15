// The one card for whatever is selected — a piece of road or a dragged stretch, a bend, a pinned height,
// a height point, a crossed road, a building — under the score. Same shape for all of them: what it is,
// what the game decided (numbers first), its violations with the fix as a button where one exists, the
// choices (Auto first), and "More" for the numbers. With nothing selected: where the money goes.
import type { Violation } from '../core/checks';
import { crossingChoice, type CrossingChoice } from '../core/crossings';
import { CROSSING_CHOICE_TEXT, crossingOutcome } from '../core/terms';
import { CATEGORIES } from '../core/data/categories';
import { speedNorms } from '../core/data/norms';
import { BUILDING_KINDS, NOISE, ROAD_CLASSES } from '../core/data/urban';
import type { BuildingOverride } from '../core/build-controls';
import type { Design, Result } from '../core/evaluate';
import type { StructureKind } from '../core/overrides';
import type { NoiseModel } from '../core/road-noise';
import { KIND } from '../core/structures';
import { czk } from './costgroups';
import { noiseSectionSvg } from './noise-section';
import { cellsCost, pieceDepth, PIECE_NAME, topPieces, type PieceKind } from './pieces';
import { activeStructure } from './structure-bar';

export type Sel =
  | { kind: 'stretch'; s0: number; s1: number; piece?: PieceKind }
  | { kind: 'bend'; i: number }
  | { kind: 'pin'; s: number }
  | { kind: 'vpi'; i: number }
  | { kind: 'crossing'; roadId: number }
  | { kind: 'building'; j: number };

export interface InspectorEvents {
  close?: () => void;
  select?: (sel: Sel) => void;
  /** bridge / tunnel / earthwork / Auto (null) on a station range */
  structure?: (kind: StructureKind | null, s0: number, s1: number) => void;
  /** walls on these sides of a station range: height in m, 0 = none, null = Auto */
  wall?: (sides: ('L' | 'R')[], height: number | null, s0: number, s1: number) => void;
  pin?: (s: number, z: number | null) => void;
  crossing?: (roadId: number, type: CrossingChoice | null) => void;
  /** one decision for these buildings, one edit */
  building?: (js: number[], action: BuildingOverride['action'] | null) => void;
  /** remove the pins between s0 and s1, one edit */
  unpin?: (s0: number, s1: number) => void;
  /** By hand: a height point at station s */
  heightAt?: (s: number) => void;
  /** a radius drag (slider) ended */
  commit?: () => void;
  radius?: (i: number, r: number | null, commit?: boolean) => void;
  deletePi?: (i: number) => void;
  /** pin the road's height at bend i (Auto) / add a height point there (By hand) */
  bendHeight?: (i: number) => void;
  vpiRadius?: (i: number, r: number | null) => void;
  deleteVpi?: (i: number) => void;
}

const km = (s: number) => (s / 1000).toFixed(2);
const m0 = (v: number) => `${Math.round(v).toLocaleString('en-US')} m`;
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
const SIDE = { L: 'left', R: 'right' } as const;
const MORE_KEY = 'trapla.more';

/** the crossing card's choices: the shared vocabulary (core/terms.ts) */
const CROSSING_OPTIONS = CROSSING_CHOICE_TEXT as unknown as [string, string, string][];
const STRUCTURE_OPTIONS: [string, string, string][] = [
  ['clear', 'Auto', 'Let the game choose (key A)'], ['1', 'Bridge', 'Bridge the whole stretch (key B)'],
  ['2', 'Tunnel', 'Tunnel the whole stretch (key T)'], ['0', 'Earthwork', 'Only cuts and embankments (key E)'],
];

export class Inspector {
  ev: InspectorEvents = {};
  sel: Sel | null = null;
  /** "More" open (remembered) */
  private more = false;
  private r: Result | null = null;
  private d: Design | null = null;
  private pending = false;

  constructor(private el: HTMLElement, private ctx: {
    noiseModel: (d: Design) => NoiseModel;
    building: (j: number) => { kind: string; levels: number; dwelling: boolean };
    maxRadius: (i: number) => number | null;
  }) {
    try { this.more = localStorage.getItem(MORE_KEY) === '1'; } catch { /* private mode */ }
    el.addEventListener('click', (e) => this.click(e));
    el.addEventListener('change', (e) => this.change(e));
    // the building card: hovering a wall height redraws the cross-section with that wall
    el.addEventListener('pointerover', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.k-building .wall-row button');
      this.preview(b ? (b.dataset.wallL ?? b.dataset.wallR ?? null) : null);
    });
    el.addEventListener('pointerleave', () => this.preview(null));
    el.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === 'pi-slider' && this.sel?.kind === 'bend') {
        const f = this.el.querySelector<HTMLInputElement>('#pi-r');
        if (f) f.value = t.value;
        this.ev.radius?.(this.sel.i, Number(t.value), false);
      }
    });
    // do not redraw under the player's fingers while they type; redraw once they leave the field
    el.addEventListener('focusout', () => queueMicrotask(() => { if (this.pending && !el.contains(document.activeElement)) this.render(); }));
  }

  set(sel: Sel | null) {
    // a field being typed into belongs to the old selection: let it apply there (change on blur) first
    const a = document.activeElement as HTMLElement | null;
    if (a && this.el.contains(a)) a.blur();
    this.sel = sel; this.pending = false; this.previewing = null;
    this.render(true);
  }

  private previewing: string | null = null;
  /** redraw the building's cross-section with a wall of height `v` (m, 'auto' = as built) */
  private preview(v: string | null) {
    if (v === this.previewing || this.sel?.kind !== 'building' || !this.r || !this.d) return;
    this.previewing = v;
    const svg = this.el.querySelector('.noise-section');
    const rec = this.r.noise.receivers.find((p) => p.j === (this.sel as { j: number }).j);
    if (!svg || !rec?.key) return;
    const wall = v === null || v === 'auto' ? rec.key.wall : Number(v);
    const html = noiseSectionSvg({ ...rec, key: { ...rec.key, wall } }, this.ctx.building(rec.j).levels, this.ctx.noiseModel(this.d), CATEGORIES[this.d.category].crownWidth, this.r.noise.footprint?.limit ?? NOISE.limitNightDb);
    svg.outerHTML = html;
  }
  setResult(r: Result, d: Design) { this.r = r; this.d = d; this.render(); }

  /** `force`: the selection changed (redraw even under a focused field) */
  render(force = false) {
    if (!force && document.activeElement && this.el.contains(document.activeElement) && document.activeElement.matches('input[type=number]')) { this.pending = true; return; }
    this.pending = false;
    const r = this.r, d = this.d, sel = this.sel;
    if (!r || !d) { this.el.innerHTML = ''; return; }
    let html = '';
    if (sel?.kind === 'stretch') html = this.stretch(r, d, sel);
    else if (sel?.kind === 'bend') html = this.bend(r, d, sel.i);
    else if (sel?.kind === 'pin') html = this.pin(r, d, sel.s);
    else if (sel?.kind === 'vpi') html = this.vpi(r, sel.i);
    else if (sel?.kind === 'crossing') html = this.crossing(r, d, sel.roadId);
    else if (sel?.kind === 'building') html = this.building(r, d, sel.j);
    const shown = html ? sel : null;
    if (!html) html = this.money(r);
    this.el.innerHTML = html;
    this.el.className = `card ctx inspector${shown ? ` k-${shown.kind}` : ' idle'}${this.more ? ' more' : ''}`;
  }

  // ---- shared pieces of a card ----
  private head(title: string, sub = '', nav = '') {
    return `<div class="ctx-h"><b>${title}</b><small>${sub}</small>${nav}<button type="button" class="x" title="Close (Esc)">✕</button></div>`;
  }
  private choices(id: string, attr: string, options: [string, string, string][], active: string | null) {
    return `<div class="seg choice" id="${id}" role="group">${options.map(([v, label, title]) =>
      `<button type="button" ${attr}="${v}" class="${active === v ? 'on' : ''}" aria-pressed="${active === v}" title="${esc(title)}">${label}</button>`).join('')}</div>`;
  }
  private moreToggle() { return `<button type="button" class="more-t" aria-expanded="${this.more}">${this.more ? 'Less ▴' : 'More ▾'}</button>`; }
  /** violations about this thing: title, short fix, and fix buttons */
  private issues(list: { v: Violation; fixes: string }[]) {
    if (!list.length) return '';
    return list.slice(0, 3).map(({ v, fixes }) => `<div class="ctx-issue"><b>⚠ ${esc(v.title)}</b>${fixes ? `<div class="fixes">${fixes}</div>` : `<div class="vfix">${esc(v.fix)}</div>`}</div>`).join('')
      + (list.length > 3 ? `<div class="sub">+${list.length - 3} more in Violations</div>` : '');
  }

  // ---- nothing selected: where the money goes ----
  private money(r: Result) {
    const top = topPieces(r, 5);
    return `<div class="ctx-h"><b>Where the money goes</b></div>
      <ol class="money">${top.map((p) => `<li><button type="button" class="link" data-piece="${p.s0},${p.s1},${p.kind}"><i class="pk-${p.kind}"></i>${PIECE_NAME[p.kind]} <small>km ${km(p.s0)}–${km(p.s1)}</small><span>${czk(p.cost)}</span></button></li>`).join('')}</ol>
      <div class="sub hint">Drag the road to bend it. Click anything to inspect it.</div>`;
  }

  // ---- a piece of road / a dragged stretch ----
  private stretch(r: Result, d: Design, sel: Extract<Sel, { kind: 'stretch' }>) {
    const s0 = Math.max(0, sel.s0), s1 = Math.min(r.length, sel.s1);
    if (s1 <= s0) return '';
    const i0 = Math.max(0, Math.round(s0 / r.ds)), i1 = Math.min(r.n - 1, Math.max(i0, Math.round(s1 / r.ds) - (s1 >= r.length ? 0 : 1)));
    const cost = cellsCost(r, i0, i1), len = s1 - s0, depth = pieceDepth(r, i0, i1);
    const active = activeStructure({ s0, s1 }, d.structureOverrides);
    const mine = active !== 'clear' && active !== null;
    let title = 'Stretch', status = `${m0(len)} · ${czk(cost)}`, why = '';
    if (sel.piece) {
      title = PIECE_NAME[sel.piece];
      const what = sel.piece === 'bridge' ? 'high' : sel.piece === 'tunnel' ? 'under ground' : sel.piece === 'cut' ? 'deep' : 'high';
      status = `${m0(len)} · up to ${depth.toFixed(0)} m ${what} · ${czk(cost)}`;
      const water = r.waterCrossings.find((c) => c.s >= s0 && c.s <= s1 && sel.piece === 'bridge' && c.structure === 'bridge');
      why = mine ? 'Your choice.' : water ? `Auto: bridges the ${esc(water.waterKind)}.`
        : { bridge: 'Auto: cheaper here than an embankment.', tunnel: 'Auto: cheaper here than a cut.', fill: 'Auto: cheaper here than a bridge.', cut: 'Auto: cheaper here than a tunnel.' }[sel.piece];
    } else {
      let b = 0, t = 0;
      for (let i = i0; i <= i1; i++) { if (r.kind[i] === KIND.bridge) b++; else if (r.kind[i] === KIND.tunnel) t++; }
      const share = (100 * cost) / Math.max(1, r.cost.total);
      why = [b ? `bridge ${m0(b * r.ds)}` : '', t ? `tunnel ${m0(t * r.ds)}` : '', `${share.toFixed(0)} % of the cost`].filter(Boolean).join(' · ');
    }
    // walls along it, per side: the player's paint or Auto's walls
    const wallState = (side: 'L' | 'R') => {
      const mineW = (d.wallOverrides ?? []).filter((o) => o.side === side && o.s1 > s0 + 1 && o.s0 < s1 - 1);
      const auto = r.walls.filter((w) => w.side === side && w.s1 > s0 && w.s0 < s1);
      const covers = mineW.length === 1 && mineW[0].s0 <= s0 + r.ds && mineW[0].s1 >= s1 - r.ds;
      const active = covers ? String(mineW[0].height) : mineW.length ? null : 'auto';
      const now = mineW.length ? mineW.map((o) => (o.height ? `${o.height} m` : 'none')).join(', ') + ' (yours)'
        : auto.length ? `Auto: ${[...new Set(auto.map((w) => `${w.height} m`))].join(', ')}` : 'Auto: none';
      return { active, now };
    };
    const near = r.noise.receivers.some((p) => p.i >= i0 - 10 && p.i <= i1 + 10 && p.raw > -3) || r.walls.some((w) => w.s1 > s0 && w.s0 < s1) || (d.wallOverrides ?? []).some((o) => o.s1 > s0 && o.s0 < s1);
    const wallRow = (side: 'L' | 'R') => {
      const st = wallState(side);
      const opts: [string, string, string][] = [['auto', 'Auto', 'Walls where houses need them'], ['0', 'None', 'No wall: too-loud houses become violations'], ...[3, 4, 5, 6].map((h): [string, string, string] => [String(h), `${h} m`, `${h} m wall along the whole stretch`])];
      return `<div class="wall-row"><span class="lbl">${cap(SIDE[side])}</span>${this.choices(`wall-${side}`, `data-wall-${side}`, opts, st.active)}<small>${st.now}</small></div>`;
    };
    const vio = r.violations.filter((v) => !v.goal && v.s1 >= s0 && v.s0 <= s1).map((v) => ({ v, fixes: this.fixes(v, d) }));
    const pinAt = sel.piece ? (s0 + s1) / 2 : s0;
    const gi = Math.max(0, Math.min(r.n - 1, Math.round(pinAt / r.ds)));
    return `${this.head(title, `km ${km(s0)}–${km(s1)}`)}
      <div class="ctx-state"><b>${status}</b>${why ? `<div class="why">${why}</div>` : ''}</div>
      ${this.issues(vio)}
      ${this.choices('structure-choice', 'data-structure', STRUCTURE_OPTIONS, active)}
      ${near ? `<div class="ctx-lbl">Noise walls</div>${wallRow('L')}${wallRow('R')}` : ''}
      <div class="more-box">
        ${near ? '' : `<div class="ctx-lbl">Noise walls</div>${wallRow('L')}${wallRow('R')}`}
        <div class="ctx-lbl">Road height</div>
        ${d.profileMode === 'auto' ? `<div class="ctx-row"><label>km ${km(pinAt)} <input id="pin-z" type="number" step="0.1" value="${r.grade[gi].toFixed(1)}"> m</label><button type="button" id="pin-set" data-s="${Math.round(pinAt)}">Pin</button></div>`
          : `<div class="ctx-row"><span>km ${km(pinAt)} · ${r.grade[gi].toFixed(1)} m</span><button type="button" id="hp-add" data-s="${Math.round(pinAt)}">Height point here</button></div>`}
        ${this.costLines(r, i0, i1)}
      </div>
      <div class="ctx-foot">${this.moreToggle()}</div>`;
  }

  /** the bill of cells i0…i1 by component, largest first */
  private costLines(r: Result, i0: number, i1: number) {
    const rows: [string, number][] = [];
    const add = (label: string, keys: string[]) => {
      let v = 0;
      for (const k of keys) { const a = (r.parts as unknown as Record<string, Float64Array>)[k]; if (a) for (let i = i0; i <= i1; i++) v += a[i]; }
      if (v > 1) rows.push([label, v]);
    };
    add('Road', ['roadBase']); add('Earthworks', ['excavation', 'fillPlacing', 'haul', 'surplusHaul', 'unsuitable', 'borrow', 'topsoil', 'geotechnical']);
    add('Culverts', ['culverts']); add('Bridges', ['bridges']); add('Tunnels', ['tunnels']); add('Crossed roads', ['crossings']);
    add('Noise walls', ['noiseWalls']); add('Other', ['surcharge']); add('Land + forest', ['land', 'forest']);
    add('Buildings', ['buildings', 'noiseBuyouts']);
    rows.sort((a, b) => b[1] - a[1]);
    return `<div class="ctx-lbl">Cost</div><table class="mini">${rows.map(([l, v]) => `<tr><td>${l}</td><td>${czk(v)}</td></tr>`).join('')}</table>`;
  }

  /** fix buttons for a violation, '' when it has none */
  private fixes(v: Violation, d: Design): string {
    const b: string[] = [];
    const btn = (attrs: string, label: string) => b.push(`<button type="button" class="fix" ${attrs}>${label}</button>`);
    const t = v.target;
    if (t?.wall) btn(`data-fix-wall="${t.wall.sides.join('')},${t.wall.height},${t.wall.s0},${t.wall.s1}"`, `${t.wall.height} m wall ${t.wall.sides.map((s) => SIDE[s]).join(' + ')} <small>km ${km(t.wall.s0)}–${km(t.wall.s1)}</small>`);
    if (t?.buildings?.length) {
      btn(`data-fix-buy="${t.buildings.join(',')}"`, t.buildings.length === 1 ? 'Buy out' : `Buy out ${t.buildings.length}`);
      if (t.buildings.some((j) => d.buildingOverrides?.some((o) => o.j === j && o.action === 'keep'))) btn(`data-fix-unkeep="${t.buildings.join(',')}"`, 'Stop keeping');
    }
    const roadId = (v as Violation & { crossing?: { roadId?: number } }).crossing?.roadId;
    if (roadId !== undefined && d.crossingOverrides?.some((o) => o.roadId === roadId)) btn(`data-fix-crossing="${roadId}"`, 'Back to Auto');
    if (v.kind === 'footprint' && !t) btn(`data-fix-bridge="${Math.max(0, v.s0 - 40)},${v.s1 + 40}"`, 'Bridge it');
    if (v.kind === 'structure' && (d.structureOverrides ?? []).some((o) => o.s1 > v.s0 && o.s0 < v.s1 + 1)) btn(`data-fix-structure="${v.s0},${Math.max(v.s1, v.s0 + 1)}"`, 'Back to Auto');
    if (v.kind === 'profile' && (d.gradePins ?? []).some((p) => p.s >= v.s0 - 1 && p.s <= v.s1 + 1)) btn(`data-fix-unpin="${v.s0},${v.s1}"`, 'Unpin');
    return b.join('');
  }

  // ---- bend ----
  private bend(r: Result, d: Design, i: number) {
    const pi = d.pis[i];
    if (!pi) return '';
    const cv = r.curves.find((c) => c.index === i), n = speedNorms(d.speed);
    const auto = pi.r === null, rv = pi.r ?? cv?.r ?? n.minRadius;
    // "Widest" is an action, not a state: finding the largest radius that fits is a geometry search
    // (tens of ms), done only when it is clicked
    const active = auto ? 'auto' : null;
    const turn = cv ? `turns ${((cv.delta * 180) / Math.PI).toFixed(0)}°` : '';
    const status = cv && cv.sEnd > cv.sStart + 1 ? `R ${m0(cv.rEff)} · ${m0(cv.delta * cv.rEff)} of curve` : 'no curve (straight)';
    const vio = r.violations.filter((v) => v.pi === i || v.pis?.includes(i)).map((v) => ({ v, fixes: '' }));
    return `${this.head(`Bend ${i + 1}`, turn)}
      <div class="ctx-state"><b>${status}</b><div class="why">${auto ? 'Tightest the rules allow.' : 'Your radius.'}</div></div>
      ${this.issues(vio)}
      ${this.choices('radius-choice', 'data-radius', [['auto', 'Tightest', `Smallest radius allowed (${n.minRadius} m at ${d.speed} km/h)`], ['max', 'Widest', 'Largest radius that fits between the neighbours']], active)}
      <div class="more-box">
        <div class="ctx-row"><label>Radius <input id="pi-r" type="number" min="50" step="5" value="${Math.round(rv)}"> m</label></div>
        <input id="pi-slider" type="range" min="${Math.round(n.minRadius * 0.5)}" max="5000" step="5" value="${Math.round(rv)}" title="Or drag the ◇ grips on the map">
        ${cv ? `<div class="sub">curve starts ${m0(cv.t)} before the bend</div>` : ''}
      </div>
      <div class="ctx-foot"><button type="button" id="pi-height">${d.profileMode === 'auto' ? 'Pin height here' : 'Height point here'}</button><button type="button" id="pi-del" class="danger" title="Del, or right-click the bend">Delete</button>${this.moreToggle()}</div>`;
  }

  // ---- pinned height (Auto) ----
  private pin(r: Result, d: Design, s: number) {
    const p = d.gradePins?.find((q) => Math.abs(q.s - s) < 0.1);
    if (!p) return '';
    const i = Math.max(0, Math.min(r.n - 1, Math.round(s / r.ds)));
    const vio = r.violations.filter((v) => v.kind === 'profile' && v.s0 <= s + 1 && v.s1 >= s - 1).map((v) => ({ v, fixes: '' }));
    return `${this.head('Pinned height', `km ${km(s)}`)}
      <div class="ctx-state"><b>${p.z.toFixed(1)} m</b> · road now ${r.grade[i].toFixed(1)} m<div class="why">${d.profileMode === 'auto' ? 'Auto passes within 0.5 m of it. Drag it in the profile.' : 'Not used while the height is set by hand.'}</div></div>
      ${this.issues(vio)}
      <div class="ctx-row"><label>Height <input id="pin-z" type="number" step="0.1" value="${p.z.toFixed(1)}"> m</label><button type="button" id="pin-set" data-s="${s}">Set</button><button type="button" id="pin-clear" data-s="${s}">Unpin</button></div>`;
  }

  // ---- height point (By hand) ----
  private vpi(r: Result, i: number) {
    if (i <= 0 || i >= r.vpis.length - 1) return '';
    const vc = r.vcurves[i - 1], v = r.vpis[i];
    const what = vc?.type === 'crest' ? 'Hilltop' : vc?.type === 'sag' ? 'Dip' : 'Height point';
    const vio = r.violations.filter((x) => x.vpi === i).map((x) => ({ v: x, fixes: '' }));
    return `${this.head(`${what} ${i}`, `km ${km(v.s)}`)}
      <div class="ctx-state"><b>${v.z.toFixed(1)} m</b> · rounding R ${m0(vc?.r ?? 0)}<div class="why">Drag it in the profile.</div></div>
      ${this.issues(vio)}
      <div class="ctx-row"><label>Rounding <input id="vpi-r" type="number" min="100" step="100" value="${Math.round(vc?.r ?? 0)}" ${v.r === null ? 'disabled' : ''}> m</label>
        <label><input id="vpi-auto" type="checkbox" ${v.r === null ? 'checked' : ''}> smallest</label></div>
      <div class="ctx-foot"><button type="button" id="vpi-del" class="danger">Delete</button></div>`;
  }

  // ---- crossed road ----
  private crossing(r: Result, d: Design, roadId: number) {
    const c = r.crossings.find((x) => x.roadId === roadId);
    if (!c) return '';
    const choice = crossingChoice(roadId, d.crossingOverrides ?? []) ?? '';
    const all = r.crossings.filter((x) => x.roadId === roadId);
    const cost = all.reduce((a, x) => a + x.cost, 0);
    const roads = crossedRoads(r), k = roads.findIndex((x) => x.roadId === roadId);
    const nav = `<button type="button" class="nav" data-nav="-1" title="Previous crossed road" ${k <= 0 ? 'disabled' : ''}>‹</button><button type="button" class="nav" data-nav="1" title="Next crossed road" ${k >= roads.length - 1 ? 'disabled' : ''}>›</button>`;
    const vio = (c.issues ?? []).map((v) => ({ v, fixes: this.fixes(v, d) }));
    const rel = `our road ${Math.abs(c.h).toFixed(0)} m ${c.h >= 0 ? 'above' : 'below'} it`, outcome = crossingOutcome(c);
    return `${this.head(cap(ROAD_CLASSES[c.cls].label), `km ${km(c.s)}${all.length > 1 ? ` · crossed ${all.length}×` : ''}`, nav)}
      <div class="ctx-state"><b>${esc(outcome.label)}${cost > 0 ? ` · ${czk(cost)}` : ''}</b><div class="why">${esc(outcome.explain)}</div><div class="why">${rel}${choice ? ' · your choice' : ''}</div></div>
      ${this.issues(vio)}
      ${this.choices('crossing-choice', 'data-crossing', CROSSING_OPTIONS, choice)}`;
  }

  // ---- building ----
  private building(r: Result, d: Design, j: number) {
    const info = this.ctx.building(j);
    const action = d.buildingOverrides?.find((o) => o.j === j)?.action ?? '';
    const removed = r.demolished.find((p) => p.j === j), bought = r.boughtOut.find((p) => p.j === j);
    const kept = r.kept.find((p) => p.j === j), rec = r.noise.receivers.find((p) => p.j === j);
    const limit = r.noise.footprint?.limit ?? NOISE.limitNightDb;
    let state: string, why = '';
    if (removed) { state = `Demolished · ${czk(removed.cost)}`; why = 'In the road\'s way.'; }
    else if (bought) { state = `Bought out · ${czk(bought.cost)}`; why = bought.reason === 'manual' ? 'Your choice.' : `Too loud even behind a ${NOISE.wallHeights[NOISE.wallHeights.length - 1]} m wall.`; }
    else if (kept?.hit) state = 'Kept — in the road\'s way';
    else if (rec?.unresolved) { state = `Stays · ${(limit + rec.mitigated).toFixed(1)} dB at night (limit ${limit})`; why = action === 'keep' ? 'You keep it, so it is not bought out.' : 'Your wall choice stops the automatic buyout.'; }
    else if (rec) {
      state = rec.status === 'wall' ? `Stays · behind a ${rec.wall} m wall` : rec.status === 'cut' ? 'Stays · shielded by a cut' : 'Stays · quiet enough';
      why = `${(limit + rec.mitigated).toFixed(1)} dB at night at the top floor (limit ${limit}).`;
    } else state = 'Stays · far from the road';
    if (action === 'keep' && !kept?.hit && !rec?.unresolved) why = (why ? `${why} ` : '') + 'You keep it.';
    const vio = r.violations.filter((v) => v.target?.buildings?.includes(j)).map((v) => ({ v, fixes: this.fixes(v, d) }));
    let section = '', walls = '';
    if (rec?.key && !removed && !(bought && bought.reason === 'manual')) {
      section = noiseSectionSvg(rec, info.levels, this.ctx.noiseModel(d), CATEGORIES[d.category].crownWidth, limit);
      // the wall on that side, next to the house: its stretch, or the house's exposure ± the wall margin
      const side = rec.key.side, i = rec.key.i;
      const w = r.walls.find((x) => x.side === side && i >= x.i0 && i <= x.i1);
      const fix = vio.find(({ v }) => v.target?.wall)?.v.target?.wall;
      const s0 = w?.s0 ?? fix?.s0 ?? Math.max(0, r.s[i] - NOISE.margin), s1 = w?.s1 ?? fix?.s1 ?? Math.min(r.length, r.s[i] + NOISE.margin);
      const mine = (d.wallOverrides ?? []).find((o) => o.side === side && o.s0 <= r.s[i] && o.s1 >= r.s[i]);
      const active = mine ? String(mine.height) : 'auto';
      const opts: [string, string, string][] = [['auto', 'Auto', 'Walls where houses need them'], ['0', 'None', 'No wall'], ...[3, 4, 5, 6].map((h): [string, string, string] => [String(h), `${h} m`, `${h} m wall`])];
      walls = `<div class="wall-row" data-range="${s0},${s1}"><span class="lbl">Wall ${SIDE[side]}</span>${this.choices(`wall-${side}`, `data-wall-${side}`, opts, active)}<small>km ${km(s0)}–${km(s1)}</small></div>`;
    }
    const opt: [string, string, string][] = [['', 'Auto', 'Demolish if in the way; buy out if no wall helps'], ['buy', 'Buy out', 'Buy and demolish it, plot included'], ['keep', 'Keep', 'Never demolish or buy it']];
    return `${this.head(cap(info.kind), `${info.levels} floor${info.levels === 1 ? '' : 's'}`)}
      <div class="ctx-state"><b>${state}</b>${why ? `<div class="why">${why}</div>` : ''}</div>
      ${this.issues(vio)}
      ${section}${walls}
      ${this.choices('building-choice', 'data-building', opt, action)}`;
  }

  // ---- events ----
  private click(e: MouseEvent) {
    const b = (e.target as HTMLElement).closest('button');
    if (!b || !this.r || !this.d) return;
    const sel = this.sel, r = this.r;
    if (b.classList.contains('x')) { this.ev.close?.(); return; }
    if (b.classList.contains('more-t')) {
      this.more = !this.more;
      try { localStorage.setItem(MORE_KEY, this.more ? '1' : '0'); } catch { /* private mode */ }
      this.render(); return;
    }
    if (b.dataset.piece) { const [s0, s1, kind] = b.dataset.piece.split(','); this.ev.select?.({ kind: 'stretch', s0: Number(s0), s1: Number(s1), piece: kind as PieceKind }); return; }
    if (b.dataset.fixWall) {
      const [sides, h, s0, s1] = b.dataset.fixWall.split(',');
      this.ev.wall?.(sides.split('') as ('L' | 'R')[], Number(h), Number(s0), Number(s1)); return;
    }
    if (b.dataset.fixBuy) { this.ev.building?.(b.dataset.fixBuy.split(',').map(Number), 'buy'); return; }
    if (b.dataset.fixUnkeep) { this.ev.building?.(b.dataset.fixUnkeep.split(',').map(Number), null); return; }
    if (b.dataset.fixCrossing) { this.ev.crossing?.(Number(b.dataset.fixCrossing), null); return; }
    if (b.dataset.fixBridge) { const [s0, s1] = b.dataset.fixBridge.split(',').map(Number); this.ev.structure?.(1, s0, s1); return; }
    if (b.dataset.fixStructure) { const [s0, s1] = b.dataset.fixStructure.split(',').map(Number); this.ev.structure?.(null, s0, s1); return; }
    if (b.dataset.fixUnpin) { const [s0, s1] = b.dataset.fixUnpin.split(',').map(Number); this.ev.unpin?.(s0 - 1, s1 + 1); return; }
    if (sel?.kind === 'stretch') {
      if (b.dataset.structure !== undefined) { this.ev.structure?.(b.dataset.structure === 'clear' ? null : Number(b.dataset.structure) as StructureKind, sel.s0, sel.s1); return; }
    }
    for (const side of ['L', 'R'] as const) {
      const v = b.dataset[`wall${side}`];
      if (v === undefined) continue;
      const h = v === 'auto' ? null : Number(v);
      const row = b.closest<HTMLElement>('.wall-row')?.dataset.range?.split(',').map(Number);
      const [s0, s1] = row ?? (sel?.kind === 'stretch' ? [sel.s0, sel.s1] : [NaN, NaN]);
      if (Number.isFinite(s0)) this.ev.wall?.([side], h, s0, s1);
      return;
    }
    if (b.id === 'pin-set') { const z = this.el.querySelector<HTMLInputElement>('#pin-z')?.valueAsNumber; if (Number.isFinite(z)) this.ev.pin?.(Number(b.dataset.s), z!); return; }
    if (b.id === 'pin-clear') { this.ev.pin?.(Number(b.dataset.s), null); return; }
    if (b.id === 'hp-add') { this.ev.heightAt?.(Number(b.dataset.s)); return; }
    if (sel?.kind === 'bend') {
      if (b.dataset.radius === 'auto') this.ev.radius?.(sel.i, null);
      else if (b.dataset.radius === 'max') { const m = this.ctx.maxRadius(sel.i); if (m !== null) this.ev.radius?.(sel.i, m); }
      else if (b.id === 'pi-del') this.ev.deletePi?.(sel.i);
      else if (b.id === 'pi-height') this.ev.bendHeight?.(sel.i);
      return;
    }
    if (sel?.kind === 'vpi' && b.id === 'vpi-del') { this.ev.deleteVpi?.(sel.i); return; }
    if (sel?.kind === 'crossing') {
      if (b.dataset.nav) { const roads = crossedRoads(r), k = roads.findIndex((x) => x.roadId === sel.roadId), n = roads[k + Number(b.dataset.nav)]; if (n) this.ev.select?.({ kind: 'crossing', roadId: n.roadId! }); }
      else if (b.dataset.crossing !== undefined) this.ev.crossing?.(sel.roadId, (b.dataset.crossing || null) as CrossingChoice | null);
      return;
    }
    if (sel?.kind === 'building' && b.dataset.building !== undefined) this.ev.building?.([sel.j], (b.dataset.building || null) as BuildingOverride['action'] | null);
  }

  private change(e: Event) {
    const t = e.target as HTMLInputElement, sel = this.sel;
    if (sel?.kind === 'bend' && t.id === 'pi-r' && Number.isFinite(t.valueAsNumber)) this.ev.radius?.(sel.i, Math.max(10, t.valueAsNumber));
    if (sel?.kind === 'bend' && t.id === 'pi-slider') this.ev.commit?.();
    if (sel?.kind === 'vpi' && t.id === 'vpi-r') this.ev.vpiRadius?.(sel.i, t.valueAsNumber);
    if (sel?.kind === 'vpi' && t.id === 'vpi-auto') this.ev.vpiRadius?.(sel.i, t.checked ? null : Math.round(this.r?.vcurves[sel.i - 1]?.r ?? 0));
    if (t.id === 'pin-z') this.el.querySelector<HTMLButtonElement>('#pin-set')?.click();
  }
}

/** every crossed road once, in route order */
export function crossedRoads(r: Result) {
  const list = r.crossings.filter((c) => c.roadId !== undefined).sort((a, b) => a.s - b.s);
  return list.filter((c, i) => list.findIndex((x) => x.roadId === c.roadId) === i);
}

/** "house", levels, dwelling: from the pack's building info */
export function buildingInfo(info: ArrayLike<number> | undefined, levels: number) {
  const k = BUILDING_KINDS[info ? info[2] : 0];
  return { kind: k?.label ?? 'building', levels, dwelling: !!k?.dwelling };
}
