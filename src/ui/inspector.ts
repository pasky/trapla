// The one card for whatever is selected — a piece of road or a dragged stretch, a bend, a pinned height,
// a height point, a crossed road, a building — under the score. Same shape for all of them: what it is,
// what the game decided (numbers first), its violations with the fix as a button where one exists, the
// choices (Auto first), and "More" for the numbers. With nothing selected: where the money goes.
import type { Violation } from '../core/checks';
import { crossingChoice, crossingSquare, crossingVia, type CrossingChoice } from '../core/crossings';
import { SQUARE_BELOW } from '../core/crossing-geometry';
import { shapeable } from './link-shape';
import { BRIDGE_STYLE_TEXT, CROSSING_CHOICE_TEXT, crossingOutcome, endCard, HAIRPIN_NOTE, MINOR_CROSSING_TEXT, MOTORWAY_AUTOMATIC, oldLineWords, ourWords, RAILWAY_AUTOMATIC, thisRoadWords, togetherHouseText, type EndConnection, type OurLine } from '../core/terms';
import type { ProjectReceiver } from '../core/project';
import { CATEGORIES } from '../core/data/categories';
import { designSpeeds, HAIRPIN, horizontalRules, speedNorms } from '../core/data/norms';
import { autoRadius } from '../core/horizontal';
import { BRIDGE_STYLES } from '../core/data/bridges';
import { conePavingCost } from '../core/abutment-cone';
import { bendSpeed, bendSpeedChoices, bendStretch, hairpinSpeed } from '../core/design-speed';
import { BUILDING_KIND, BUILDING_KINDS, BUILDING_RULES, NOISE, ROAD_CLASSES } from '../core/data/urban';
import { wallOverrideMasks, type BuildingOverride } from '../core/build-controls';
import type { Design, Result } from '../core/evaluate';
import type { StructureChoice, StructureKind } from '../core/overrides';
import { noiseBreakdown, noiseField, type NoiseField, type NoiseReceiver } from '../core/noise';
import { KIND } from '../core/structures';
import { STRUCTURE_RULES, TUNNEL_RULES } from '../core/data/prices';
import { czk } from './costgroups';
import { floorLevels, noisePlan, noiseSectionSvg, type HouseRect } from './noise-section';
import { cellsCost, pieceDepth, PIECE_NAME, topPieces, type PieceKind } from './pieces';
import { activeStructure } from './structure-bar';
import { bendNo, shownRange, shownS, shownSide, shownText } from './chainage';
import { stationIndex } from '../core/range';
import { CULVERT_RULES } from '../core/data/culverts';
import { culvertCard } from '../core/terms';
import { culvertSection } from '../render/culvert-geometry';

export type Sel =
  | { kind: 'stretch'; s0: number; s1: number; piece?: PieceKind }
  | { kind: 'bend'; i: number }
  | { kind: 'pin'; s: number }
  | { kind: 'vpi'; i: number }
  | { kind: 'crossing'; roadId: number }
  | { kind: 'building'; j: number }
  /** a stream culvert under our road (Result.waterCrossings): its stream and station */
  | { kind: 'culvert'; id: number; s: number }
  /** a mission end that meets an interchange or a road (scenario data) */
  | { kind: 'end'; end: 'a' | 'b' };

export interface InspectorEvents {
  close?: () => void;
  select?: (sel: Sel) => void;
  /** bridge / tunnel / earthwork / Auto (null) on a station range; a tunnel's method ('cut': cut and cover) or
   * a bridge's style */
  structure?: (kind: StructureKind | null, s0: number, s1: number, method?: StructureChoice, auto?: boolean) => void;
  /** walls on these sides of a station range: height in m, 0 = none, null = Auto */
  wall?: (sides: ('L' | 'R')[], height: number | null, s0: number, s1: number) => void;
  pin?: (s: number, z: number | null) => void;
  crossing?: (roadId: number, type: CrossingChoice | null) => void;
  /** back to the automatic path of a reroute the player shaped */
  crossingPathAuto?: (roadId: number) => void;
  /** an underpass or a bridge over us laid on a new line square to ours (true) or kept on its own (false) */
  crossingSquare?: (roadId: number, type: 'underpass' | 'overbridge', square: boolean) => void;
  /** one decision for these buildings, one edit */
  building?: (js: number[], action: BuildingOverride['action'] | null) => void;
  /** remove the pins between s0 and s1, one edit */
  unpin?: (s0: number, s1: number) => void;
  /** By hand: a height point at station s */
  heightAt?: (s: number) => void;
  /** a radius drag (slider) ended */
  commit?: () => void;
  radius?: (i: number, r: number | null, commit?: boolean) => void;
  /** design speed of bend i's stretch (null: the road's) */
  bendSpeed?: (i: number, speed: number | null) => void;
  /** bend i a hairpin or an ordinary curve */
  hairpin?: (i: number, on: boolean, speed?: number) => void;
  deletePi?: (i: number) => void;
  /** pin the road's height at bend i (Auto) / add a height point there (By hand) */
  bendHeight?: (i: number) => void;
  vpiRadius?: (i: number, r: number | null) => void;
  deleteVpi?: (i: number) => void;
}

/** kilometres as the player reads them on the active line (ui/chainage.ts) */
const km = (s: number) => (shownS(s) / 1000).toFixed(2);
const kmr = (s0: number, s1: number) => { const [a, b] = shownRange(s0, s1); return `${(a / 1000).toFixed(2)}–${(b / 1000).toFixed(2)}`; };
const m0 = (v: number) => `${Math.round(v).toLocaleString('en-US')} m`;
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
const SIDE = { L: 'left', R: 'right' } as const;
const MORE_KEY = 'trapla.more';

/** the crossing card's choices: the shared vocabulary (core/terms.ts) */
const CROSSING_OPTIONS = CROSSING_CHOICE_TEXT as unknown as [string, string, string][];
/** A motorway has no level junctions: Automatic never offers one, and neither does the card. */
/** A local road or track meets every road it may at its level, without junction spacing. */
const MINOR_CROSSING_OPTIONS: [string, string, string][] = CROSSING_OPTIONS.map(([v, label, why]) =>
  [v, label, v === '' ? MINOR_CROSSING_TEXT.automatic : v === 'junction' ? MINOR_CROSSING_TEXT.junction : why]);
const crossingOptions = (line: OurLine, minor = false): [string, string, string][] => line === 'road' ? (minor ? MINOR_CROSSING_OPTIONS : CROSSING_OPTIONS)
  : CROSSING_OPTIONS.filter(([v]) => v !== 'junction').map(([v, label, why]) => [v, label, v === '' ? (line === 'railway' ? RAILWAY_AUTOMATIC : MOTORWAY_AUTOMATIC) : ourWords(why, line)]);
/** a tunnel's method: the tunnel card's choice */
/** why no arch fits a bridge (support-layout archFor), in a few words */
const ARCH_MISS: Record<NonNullable<Result['runs'][number]['archMiss']>, string> = {
  short: `The bridge is too short for an arch of at least ${BRIDGE_STYLES.arch.minArch} m.`,
  long: `The bridge is too long for one arch: an arch bridge is at most ${BRIDGE_STYLES.arch.lengthMax} times its arch.`,
  shallow: 'The valley is too shallow under the road for an arch to rise in.',
  deep: 'The valley is too deep for an arch: it would have to rise too steeply.',
  ground: 'An arch would cut into the valley side.',
  blocked: 'An arch would stand on, or pass too low over, a road, a railway or water.',
  spans: 'Its approach spans would be too long.',
  lift: 'An arch here would need the road higher.',
};
const TUNNEL_METHODS: [string, string, string][] = [
  ['mined', 'Mined', 'Dug underground; built from a pit and covered again near its ends, where the ground is thin'],
  ['cut', 'Cut and cover', `Built in a pit that is filled in again over it: at most ${TUNNEL_RULES.cutCoverMaxCover} m of ground over the tunnel`],
];
const STRUCTURE_OPTIONS: [string, string, string][] = [
  ['clear', 'Auto', 'Let the game choose (key A)'], ['1', 'Bridge', 'Bridge the whole stretch (key B)'],
  ['2', 'Tunnel', 'Tunnel the whole stretch (key T)'], ['0', 'Earthwork', 'Only cuts and embankments (key E)'],
];

export class Inspector {
  ev: InspectorEvents = {};
  sel: Sel | null = null;
  /** "More" open (remembered) */
  private more = false;
  /** one direction of a split motorway is shown: its pieces are that direction's, not the total's */
  oneDirection = false;
  private r: Result | null = null;
  private d: Design | null = null;
  private networkPending = false;
  /** The active road's own header (null: none, e.g. our road), given what the card shows (null: nothing
   * selected): a side road's settings on top of whatever is selected on it; one with `data-place="below"`
   * (a motorway's directions) below a selected piece's card. */
  routeHead?: (shown: Sel['kind'] | null) => HTMLElement | null;
  /** The active road is not ours (a rebuilt or new side road): its crossing card says "this road" where
   * the shared vocabulary says "our road" (core/terms.ts thisRoadWords). */
  isSideRoad?: () => boolean;
  setNetworkPending(pending: boolean) { this.networkPending = pending; this.render(); }
  private pending = false;

  constructor(private el: HTMLElement, private ctx: {
    building: (j: number) => { kind: string; levels: number; dwelling: boolean; rect?: HouseRect };
    maxRadius: (i: number) => number | null;
    /** a radius the editor lowered to fit during a drag (ui/radius-notes.ts): what was set */
    radiusNote?: (i: number, r: number | null) => { from: number; to: number } | null;
    /** a house heard by two or more roads and decided once for the project: its project receiver and the
     * roads' names (null: decided by one road alone, or the project is not priced) */
    together?: (j: number) => { receiver: ProjectReceiver; name: (routeId: string) => string } | null;
  }) {
    try { this.more = localStorage.getItem(MORE_KEY) === '1'; } catch { /* private mode */ }
    el.addEventListener('click', (e) => this.click(e));
    el.addEventListener('change', (e) => this.change(e));
    // the building card: hovering a wall height redraws the cross-section with that wall
    el.addEventListener('pointerover', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.k-building .wall-row button');
      this.preview(b ? (b.dataset.wallL ?? b.dataset.wallR ?? null) : null, b?.dataset.wallL !== undefined ? 'L' : b?.dataset.wallR !== undefined ? 'R' : undefined);
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
    this.sel = sel; this.pending = false; this.previewing = null; this.hosted = false;
    this.render(true);
  }

  private previewing: string | null = null;
  /** redraw the building's plan and cross-section with a wall of height `v` (m, 'auto' = as built) */
  private preview(v: string | null, side?: 'L' | 'R') {
    if (v === this.previewing || this.sel?.kind !== 'building' || !this.r || !this.d) return;
    this.previewing = v;
    const box = this.el.querySelector('.noise-views');
    const range = this.el.querySelector<HTMLElement>('.wall-row')?.dataset.range?.split(',').map(Number);
    const r0 = this.r, rec = r0.noise.receivers.find((p) => p.j === (this.sel as { j: number }).j);
    if (!box || !rec || !r0.noise.source) return;
    // the stations the choice would paint: the same mask as applying it
    const mask = side && range ? wallOverrideMasks(this.r.s, [{ side, s0: range[0], s1: range[1], height: 1 }])[side] : null;
    const wall = v === null || v === 'auto' || !side || !mask ? undefined
      : { side, height: Number(v), at: (i: number) => !Number.isNaN(mask[i]) };
    const r = this.r;
    box.innerHTML = wall ? this.noiseViews(r, this.d, rec, wall) : this.noiseViews(r, this.d, rec, this.restWall?.wall, this.restWall?.lead);
  }
  /** the wall a house card shows when no choice is previewed (a bought-out house: the best wall Auto tried) */
  private restWall: { wall: { side: 'L' | 'R'; height: number; at: (i: number) => boolean }; lead: string } | null = null;

  private field: { r: Result; f: NoiseField } | null = null;
  private noiseFieldOf(r: Result): NoiseField {
    if (this.field?.r !== r) this.field = { r, f: noiseField(r.noise.source!) };
    return this.field.f;
  }

  /** the house's plan (where the noise comes from) and cross-section (its floors), as built or with a
   * previewed wall choice: the same sum the game decided with */
  private noiseViews(r: Result, d: Design, rec: NoiseReceiver, wall?: { side: 'L' | 'R'; height: number; at: (i: number) => boolean }, lead = '') {
    const info = this.ctx.building(rec.j), crown = CATEGORIES[d.category].crownWidth, src = r.noise.source;
    if (!src) return '';
    const limit = r.noise.limit;
    const walls = { L: Float64Array.from(r.noise.L), R: Float64Array.from(r.noise.R) };
    if (wall) {
      const gap = (wall.side === 'L' ? src.L : src.R).gap;
      for (let i = 0; i < r.n; i++) if (wall.at(i)) walls[wall.side][i] = gap[i] ? 0 : wall.height;
    }
    const field = this.noiseFieldOf(r);
    const floors = floorLevels(field, rec, walls.L, walls.R);
    let loud = floors[0];
    for (const f of floors) if (f.after > loud.after) loud = f;
    const z = rec.ground + NOISE.receiverHeight + loud.floor * NOISE.storeyHeight;
    const { rays } = noiseBreakdown(field, rec.x, rec.y, z, walls.L, walls.R);
    const plan = info.rect ? noisePlan(r, info.rect, rec, rays, crown, loud.after, walls) : null;
    const section = noiseSectionSvg(r, rec, floors, crown, limit, walls[rec.side][rec.i], r.s[rec.i]);
    return `${plan ? `${plan.svg}<div class="why plan-why">${esc(lead ? lead + plan.caption[0].toLowerCase() + plan.caption.slice(1) : plan.caption)}</div>` : ''}${section}`;
  }
  setResult(r: Result, d: Design) { this.r = r; this.d = d; this.render(); }
  /** Another card (a base road, a proposed change) borrows this ONE inspector until the next selection. */
  private hosted = false;
  host(): HTMLElement {
    const a = document.activeElement as HTMLElement | null;
    if (a && this.el.contains(a)) a.blur();
    this.hosted = true; this.sel = null; this.pending = false; this.el.hidden = false; return this.el;
  }
  get isHosting() { return this.hosted; }
  clear(message = 'Choose a road to inspect.') {
    this.hosted = false;
    this.r = null; this.d = null; this.sel = null;
    this.el.replaceChildren(); this.el.className = 'card ctx inspector idle'; this.el.hidden = false;
    const text = document.createElement('p'); text.textContent = message; this.el.append(text);
  }

  /** `force`: the selection changed (redraw even under a focused field) */
  render(force = false) {
    if (this.hosted) return;
    // not under the player's fingers: a field being typed into, a slider being dragged
    if (!force && document.activeElement && this.el.contains(document.activeElement) && document.activeElement.matches('input[type=number], input[type=range]')) { this.pending = true; return; }
    this.pending = false;
    const r = this.r, d = this.d, sel = this.sel;
    // nothing to show yet (the first result is still being worked out): no empty card outline
    this.el.hidden = !r || !d;
    if (!r || !d) { this.el.innerHTML = ''; return; }
    let html = '';
    if (sel?.kind === 'stretch') html = this.stretch(r, d, sel);
    else if (sel?.kind === 'bend') html = this.bend(r, d, sel.i);
    else if (sel?.kind === 'pin') html = this.pin(r, d, sel.s);
    else if (sel?.kind === 'vpi') html = this.vpi(r, sel.i);
    else if (sel?.kind === 'crossing') html = this.crossing(r, d, sel.roadId);
    else if (sel?.kind === 'building') html = this.building(r, d, sel.j);
    else if (sel?.kind === 'end') html = this.end(r, sel.end);
    else if (sel?.kind === 'culvert') html = this.culvert(r, d, sel.id, sel.s);
    const shown = html ? sel : null;
    if (!html) html = this.money(r);
    this.el.innerHTML = html;
    this.el.className = `card ctx inspector${shown ? ` k-${shown.kind}` : ' idle'}${this.more ? ' more' : ''}`;
    // a side road's own settings (what it is, traffic, junctions, works, how to remove it) stay on top of
    // whatever is selected on it, as our road's type and speed stay in the score card
    const head = this.routeHead?.(shown?.kind ?? null);
    if (head && shown && head.dataset.place === 'below') this.el.append(head); else if (head) this.el.prepend(head);
  }

  // ---- shared pieces of a card ----
  private head(title: string, sub = '', nav = '') {
    return `<div class="ctx-h"><b>${title}</b><small>${sub}</small>${nav}<button type="button" class="x" title="Close (Esc)">✕</button></div>`;
  }
  private choices(id: string, attr: string, options: [string, string, string][], active: string | null) {
    return `<div class="seg choice" id="${id}" role="group">${options.map(([v, label, title]) =>
      `<button type="button" ${attr}="${v}" class="${active === v ? 'on' : ''}" aria-pressed="${active === v}" title="${esc(title)}">${label}</button>`).join('')}</div>`;
  }
  /** the structure choices, Earthwork with what an open cut would cost against Auto's tunnel where a cut would be
   * deeper than designers cut (Run.deepCut) */
  private structureOptions(r: Result, piece: string | undefined, s0: number, s1: number, mine: boolean): [string, string, string][] {
    const deep = !mine && piece === 'tunnel' ? r.runs.find((q) => q.kind === KIND.tunnel && q.s1 > s0 && q.s0 < s1 && q.deepCut)?.deepCut : undefined;
    if (!deep) return STRUCTURE_OPTIONS;
    const diff = deep.earth - deep.tunnel;
    return STRUCTURE_OPTIONS.map(([v, label, title]) => v === '0'
      ? [v, `${label} <small>${diff >= 0 ? '+' : '−'}${czk(Math.abs(diff)).replace(' CZK', '')}</small>`, `An open cut instead, up to ${deep.depth.toFixed(0)} m deep: about ${czk(Math.abs(diff))} ${diff >= 0 ? 'more' : 'less'} (key E)`] as [string, string, string]
      : [v, label, title]);
  }
  private moreToggle() { return `<button type="button" class="more-t" aria-expanded="${this.more}">${this.more ? 'Less ▴' : 'More ▾'}</button>`; }
  /** violations about this thing: title, short fix, and fix buttons */
  private issues(list: { v: Violation; fixes: string }[]) {
    if (!list.length) return '';
    // the same problem with the same fix at several places: once, with how many
    // (the same buttons, for their places: one set over all of them)
    const groups = new Map<string, { v: Violation; fixes: string; count: number }>();
    for (const { v, fixes } of list) {
      const key = `${v.kind}\n${shownText(v.title)}\n${fixes.replace(/data-[a-z-]+="[^"]*"/g, '') || shownText(v.fix)}`, g = groups.get(key);
      if (!g) { groups.set(key, { v, fixes, count: 1 }); continue; }
      g.count++;
      g.v = { ...g.v, s0: Math.min(g.v.s0, v.s0), s1: Math.max(g.v.s1, v.s1) };
      if (this.d && !g.v.target) g.fixes = this.fixes(g.v, this.d);
    }
    const shown = [...groups.values()].slice(0, 3), rest = list.length - shown.reduce((a, g) => a + g.count, 0);
    return shown.map(({ v, fixes, count }) => `<div class="ctx-issue"><b>⚠ ${esc(shownText(v.title))}${count > 1 ? ` <small>(${count} places)</small>` : ''}</b>${fixes ? `<div class="fixes">${fixes}</div>` : `<div class="vfix">${esc(shownText(v.fix))}</div>`}</div>`).join('')
      + (rest > 0 ? `<div class="sub">+${rest} more in Violations</div>` : '');
  }

  /** what a rebuilt stretch replaces: "old road", "old track" */
  private get oldLine() { return oldLineWords(this.d ? CATEGORIES[this.d.category].mode as OurLine : 'road'); }
  // ---- nothing selected: where the money goes ----
  private money(r: Result) {
    const top = topPieces(r, 5);
    // a rebuilt stretch still wholly on its old road builds nothing
    if (!top.length && r.keptCells) return `<div class="sub hint">Nothing is built yet: every metre stays on the ${this.oldLine}. Drag it to change its line.</div>`;
    return `<div class="ctx-h"><b>Where ${this.oneDirection ? 'this direction’s' : 'the'} money goes</b></div>
      <ol class="money">${top.map((p) => `<li><button type="button" class="link" data-piece="${p.s0},${p.s1},${p.kind}"><i class="pk-${p.kind}"></i>${PIECE_NAME[p.kind]} <small>km ${kmr(p.s0, p.s1)}</small><span>${czk(p.cost)}</span></button></li>`).join('')}</ol>
      <div class="sub hint">Drag the ${this.d ? CATEGORIES[this.d.category].mode : 'road'} to bend it. Click anything to inspect it.</div>`;
  }

  // ---- a piece of road / a dragged stretch ----
  private stretch(r: Result, d: Design, sel: Extract<Sel, { kind: 'stretch' }>) {
    const s0 = Math.max(0, sel.s0), s1 = Math.min(r.length, sel.s1);
    if (s1 <= s0) return '';
    const i0 = Math.max(0, Math.round(s0 / r.ds)), i1 = Math.min(r.n - 1, Math.max(i0, Math.round(s1 / r.ds) - (s1 >= r.length ? 0 : 1)));
    const cost = cellsCost(r, i0, i1), len = s1 - s0, depth = pieceDepth(r, i0, i1);
    // a rebuilt stretch, where it stays on the old road: nothing is built, so there is nothing to choose
    if (r.keptCells && Array.from({ length: i1 - i0 + 1 }, (_, k) => r.keptCells![i0 + k]).every(Boolean))
      return `${this.head(this.oldLine.replace(/^o/, 'O'), `km ${km(s0)}–${km(s1)}`)}
      <div class="ctx-state"><b>${m0(len)} · kept as it is</b><div class="why">Nothing is built here. Drag it off the ${this.oldLine} to build a new ${this.d ? CATEGORIES[this.d.category].mode : 'road'} there.</div></div>`;
    const active = activeStructure({ s0, s1 }, d.structureOverrides);
    const mine = active !== 'clear' && active !== null;
    let title = 'Stretch', status = `${m0(len)} · ${czk(cost)}`, why = '';
    if (sel.piece) {
      title = PIECE_NAME[sel.piece];
      const what = sel.piece === 'bridge' ? 'high' : sel.piece === 'tunnel' ? 'under ground' : sel.piece === 'cut' ? 'deep' : 'high';
      status = `${m0(len)} · up to ${depth.toFixed(0)} m ${what} · ${czk(cost)}`;
      const water = r.waterCrossings.find((c) => c.s >= s0 && c.s <= s1 && sel.piece === 'bridge' && c.structure === 'bridge');
      // Auto compares the options at the road's present height, buildings and land included; a choice
      // of the player's lets Auto set the height again for it (so its figures may differ from before)
      // (the method or style the player chose on Auto's tunnel or bridge leaves it Auto's: said with the choice)
      const cutChosen = sel.piece === 'tunnel' && r.runs.some((q) => q.kind === KIND.tunnel && q.s1 > s0 && q.s0 < s1 && q.method === 'cut');
      const deep = sel.piece === 'tunnel' ? r.runs.find((q) => q.kind === KIND.tunnel && q.s1 > s0 && q.s0 < s1 && q.deepCut)?.deepCut : undefined;
      why = mine ? (d.profileMode === 'auto' ? 'Your choice; Auto set the road height for it.' : 'Your choice.') : cutChosen ? 'Auto’s tunnel, built by cut and cover as you chose.'
        : deep ? `Auto: a cut here would be up to ${deep.depth.toFixed(0)} m deep; designers tunnel where a cut would be deeper than ${STRUCTURE_RULES.deepCut} m.` : water ? `Auto: bridges the ${esc(water.waterKind)}.`
        : { bridge: 'Auto: at this height cheaper than an embankment.', tunnel: 'Auto: at this depth cheaper than a cut.', fill: 'Auto: at this height cheaper than a bridge.', cut: 'Auto: at this depth cheaper than a tunnel.' }[sel.piece];
    } else {
      let b = 0, t = 0;
      for (let i = i0; i <= i1; i++) { if (r.kind[i] === KIND.bridge) b++; else if (r.kind[i] === KIND.tunnel) t++; }
      const share = (100 * cost) / Math.max(1, r.cost.total);
      why = [b ? `bridge ${m0(b * r.ds)}` : '', t ? `tunnel ${m0(t * r.ds)}` : '', `${share.toFixed(0)} % of the cost`].filter(Boolean).join(' · ');
    }
    // walls along it, per side: the player's paint or Auto's walls
    const wallState = (side: 'L' | 'R') => {
      const mineW = (d.wallOverrides ?? []).filter((o) => o.side === side && o.s1 > s0 + r.ds / 2 && o.s0 < s1 - r.ds / 2);
      const auto = r.walls.filter((w) => w.side === side && w.s1 > s0 && w.s0 < s1);
      const covers = mineW.length === 1 && mineW[0].s0 <= s0 + r.ds && mineW[0].s1 >= s1 - r.ds;
      const active = covers ? String(mineW[0].height) : mineW.length ? null : 'auto';
      const now = mineW.length ? mineW.map((o) => (o.height ? `${o.height} m` : 'none')).join(', ') + ' (yours)'
        : auto.length ? `Auto: ${[...new Set(auto.map((w) => `${w.height} m`))].join(', ')}` : 'Auto: none';
      return { active, now };
    };
    // (no wall in a tunnel: nothing there is heard)
    let open = false;
    for (let i = i0; i <= i1 && !open; i++) open = r.kind[i] !== KIND.tunnel;
    const near = open && (r.noise.receivers.some((p) => p.i >= i0 - 10 && p.i <= i1 + 10 && p.raw > -3) || r.walls.some((w) => w.s1 > s0 && w.s0 < s1) || (d.wallOverrides ?? []).some((o) => o.s1 > s0 && o.s0 < s1));
    const wallRow = (side: 'L' | 'R') => {
      const st = wallState(side);
      const opts: [string, string, string][] = [['auto', 'Auto', 'Walls where houses need them'], ['0', 'None', 'No wall: too-loud houses become violations'], ...NOISE.playerWallHeights.map((h): [string, string, string] => [String(h), `${h} m`, `${h} m wall along the whole stretch`])];
      // walls Auto adds for the houses beside the player's choice (which may take a wall away from them)
      const mineW = (d.wallOverrides ?? []).filter((o) => o.side === side && o.s1 > s0 + r.ds / 2 && o.s0 < s1 - r.ds / 2);
      const none = mineW.some((o) => !o.height);
      const around = mineW.length ? (r.wallsAroundChoices ?? []).filter((w) => w.side === side && w.s1 > s0 - 2000 && w.s0 < s1 + 2000) : [];
      const adds = around.map((w) => `<div class="sub around">Auto adds ${m0(w.s1 - w.s0)} of ${w.height} m wall at km ${kmr(w.s0, w.s1)} ${none ? 'instead' : 'as well'} <button type="button" class="link" data-stretch="${w.s0},${w.s1}">Show</button></div>`).join('');
      return `<div class="wall-row"><span class="lbl">${cap(SIDE[shownSide(side)])}</span>${this.choices(`wall-${side}`, `data-wall-${side}`, opts, st.active)}<small>${st.now}</small></div>${adds}`;
    };
    const vio = r.violations.filter((v) => !v.goal && v.s1 >= s0 && v.s0 <= s1).map((v) => ({ v, fixes: this.fixes(v, d) }));
    // a tunnel: how it is built, and its method as a choice
    const tunnel = sel.piece === 'tunnel' ? r.runs.find((q) => q.kind === KIND.tunnel && q.s1 > s0 && q.s0 < s1) : undefined;
    let method = '';
    if (tunnel) {
      const cc = tunnel.cutCoverM ?? 0, mined = Math.max(0, tunnel.length - cc);
      const how = [mined > 0 ? `mined ${m0(mined)}` : '', cc > 0 ? `cut and cover ${m0(cc)}${mined > 0 ? ' at its ends' : ''}` : '',
        (tunnel.tubes ?? 1) >= 2 ? 'two tubes (heavy traffic)' : (tunnel.tubes ?? 1) > 1 ? 'with an escape tunnel beside it' : ''].filter(Boolean).join(' · ');
      method = `<div class="sub">${cap(how)}</div><div class="ctx-lbl">Method</div>${this.choices('tunnel-method', 'data-method', TUNNEL_METHODS, tunnel.method === 'cut' ? 'cut' : 'mined')}`;
    }
    // a bridge: its style as a choice, each with its price against this one
    const bridge = sel.piece === 'bridge' ? r.runs.find((q) => q.kind === KIND.bridge && q.s1 > s0 && q.s0 < s1) : undefined;
    if (bridge?.styles) {
      const now = bridge.style ?? 'short', here = bridge.styles[now] ?? 0;
      const buttons = BRIDGE_STYLE_TEXT.map(([v, label, title]) => {
        const p = bridge.styles![v], diff = p === undefined || v === now ? '' : ` <small>${p >= here ? '+' : '−'}${czk(Math.abs(p - here)).replace(' CZK', '')}</small>`;
        const unfit = v === 'arch' && bridge.archMiss ? ARCH_MISS[bridge.archMiss] : 'Does not fit this bridge.';
        return `<button type="button" data-style="${v}" class="${v === now ? 'on' : ''}" aria-pressed="${v === now}" ${p === undefined && v !== now ? 'disabled' : ''} title="${esc(p === undefined && v !== now ? `${title} ${unfit}` : title)}">${label}${diff}</button>`;
      }).join('');
      const span = bridge.layout?.span ?? r.ds * 3, arch = bridge.arch ? `arch ${m0(bridge.arch.s1 - bridge.arch.s0)}` : '';
      // its ends in fills: the cones in front of the abutments (core/abutment-cone.ts)
      const cones = (r.cones ?? []).filter((c) => c.i >= bridge.i0 && c.i <= bridge.i1);
      const ends = cones.length ? `<div class="sub">${cones.length === 2 ? `Its ends stand on fills ${cones.map((c) => c.height.toFixed(0)).join(' and ')} m high` : `One end stands on a fill ${cones[0].height.toFixed(0)} m high`}, sloping on under the bridge: ${Math.round(cones.reduce((t, c) => t + c.volume, 0)).toLocaleString('en-US')} m³ of fill, ${czk(cones.reduce((t, c) => t + conePavingCost(c), 0))} of paving.</div>` : '';
      // an end whose fill would cover what lies below: a wall down to the ground there (support-layout.ts)
      const closed = bridge.closedEnds?.filter(Boolean).length ?? 0;
      const walls = closed ? `<div class="sub">${closed === 2 ? 'Both ends are walls' : 'One end is a wall'} down to the ground, so the fill does not cover what lies below.</div>` : '';
      method = `${ends}${walls}<div class="ctx-lbl">Bridge style</div><div class="seg choice" id="bridge-style" role="group">${buttons}</div>
        ${bridge.archMiss && bridge.styles?.arch === undefined ? `<div class="sub">No arch: ${ARCH_MISS[bridge.archMiss].replace(/^./, (c) => c.toLowerCase())}</div>` : ''}
        <div class="sub">${bridge.styleChosen ? 'Your choice' : 'Auto: the cheapest that fits'}${arch ? ` · ${arch}` : bridge.style === 'long' || span > 45 ? ` · longest span ${m0(span)}` : ''}</div>`;
    }
    const pinAt = sel.piece ? (s0 + s1) / 2 : s0;
    const gi = stationIndex(r, pinAt);
    return `${this.head(title, `km ${kmr(s0, s1)}`)}
      <div class="ctx-state"><b>${status}</b>${why ? `<div class="why">${why}</div>` : ''}</div>
      ${this.issues(vio)}
      ${this.choices('structure-choice', 'data-structure', this.structureOptions(r, sel.piece, s0, s1, mine), active)}
      ${method}
      ${near ? `<div class="ctx-lbl">Noise walls</div>${wallRow(shownSide('L'))}${wallRow(shownSide('R'))}` : ''}
      <div class="more-box">
        ${near || !open ? '' : `<div class="ctx-lbl">Noise walls</div>${wallRow(shownSide('L'))}${wallRow(shownSide('R'))}`}
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
    if (t?.wall) btn(`data-fix-wall="${t.wall.sides.join('')},${t.wall.height},${t.wall.s0},${t.wall.s1}"`, `${t.wall.height} m wall ${t.wall.sides.map((s) => SIDE[shownSide(s)]).join(' + ')} <small>km ${kmr(t.wall.s0, t.wall.s1)}</small>`);
    if (t?.buildings?.length) {
      btn(`data-fix-buy="${t.buildings.join(',')}"`, t.buildings.length === 1 ? 'Buy out' : `Buy out ${t.buildings.length}`);
      if (t.buildings.some((j) => d.buildingOverrides?.some((o) => o.j === j && o.action === 'keep'))) btn(`data-fix-unkeep="${t.buildings.join(',')}"`, 'Stop keeping');
    }
    if (t?.road !== undefined) btn(`data-road-card="${t.road}"`, 'The side road');
    if (t?.hairpin) btn(`data-fix-hairpin="${t.hairpin.pi},${t.hairpin.speed}"`, `Make it a hairpin <small>${t.hairpin.speed} km/h</small>`);
    // a bend's radius set by hand: back to Auto (only the bends still set by hand; an old road's own curve counts)
    const auto = (t?.auto ?? []).filter((i) => d.pis[i] && d.pis[i].r !== null);
    if (auto.length) btn(`data-fix-auto="${auto.join(',')}"`, 'Back to Auto');
    const roadId = (v as Violation & { crossing?: { roadId?: number } }).crossing?.roadId;
    // a flawed reroute shape: back to its automatic path (the choice to reroute stays)
    if (roadId !== undefined && (v as Violation & { crossing?: { code?: string } }).crossing?.code === 'shape') btn(`data-fix-crossing-path="${roadId}"`, 'Automatic path');
    else if (roadId !== undefined && d.crossingOverrides?.some((o) => o.roadId === roadId)) btn(`data-fix-crossing="${roadId}"`, 'Back to Auto');
    // (not where our road already is on a bridge: a pier or a bridge end on something asks for a longer bridge)
    const onBridge = !!this.r && this.r.kind[stationIndex(this.r, v.s0)] === KIND.bridge;
    if (v.kind === 'footprint' && !t && !onBridge) btn(`data-fix-bridge="${Math.max(0, v.s0 - 40)},${v.s1 + 40}"`, 'Bridge it');
    if (v.kind === 'structure' && (d.structureOverrides ?? []).some((o) => o.s1 > v.s0 && o.s0 < v.s1 + 1)) btn(`data-fix-structure="${v.s0},${Math.max(v.s1, v.s0 + 1)}"`, 'Back to Auto');
    if (v.kind === 'profile' && (d.gradePins ?? []).some((p) => p.s >= v.s0 - 1 && p.s <= v.s1 + 1)) btn(`data-fix-unpin="${v.s0},${v.s1}"`, 'Unpin');
    return b.join('');
  }

  // ---- bend ----
  private bend(r: Result, d: Design, i: number) {
    const pi = d.pis[i];
    if (!pi) return '';
    const speed = bendSpeed(pi, d.speed, d.category), speeds = bendSpeedChoices(d.speed, d.category);
    // the stretch this bend's speed covers, and the faster elements Auto keeps on it where they fit (plan-speeds.ts,
    // design-speed.ts searchSpeeds)
    const stretch = bendStretch(r, d.pis, i, d.speed);
    const kept = r.planSpeeds?.[i] ?? null, line = CATEGORIES[d.category].mode === 'railway' ? 'line' : 'road';
    const slowed = speed < d.speed && !pi.hairpin, heights = slowed && d.profileMode === 'auto' && !r.ownHeights;
    const stretchNote = stretch ? `<div class="sub">${stretch.s0 <= 1 && stretch.s1 >= r.length - 1 ? `Its stretch is the whole ${line}` : `Its stretch: km ${kmr(stretch.s0, stretch.s1)}`}${d.speed < Math.max(...designSpeeds(d.category)) ? `; no faster than the whole ${line}, ${d.speed} km/h` : ''}.${heights ? ` Auto rounds its hilltops and dips as for ${d.speed} km/h.` : ''}</div>` : '';
    const keptNote = kept !== null && kept > speed ? `Auto keeps the ${kept} km/h curve here: it fits.` : '';
    const cv = r.curves.find((c) => c.index === i), n = speedNorms(speed, d.category);
    // (an old road's own curve stands while it lies on the old road; built anew it is Auto's: core/project-kept.ts)
    const auto = pi.r === null || !!(pi.mapped && cv?.auto), rv = auto ? cv?.r ?? n.minRadius : pi.r ?? n.minRadius, lowered = this.ctx.radiusNote?.(i, pi.r) ?? null;
    const road = CATEGORIES[d.category].mode === 'road' && !CATEGORIES[d.category].minor;
    // (no hairpin note while a violation says it may not stand there)
    const hairpinNote = pi.hairpin && !r.violations.some((v) => v.pis?.includes(i) && /^Hairpin/.test(v.title))
      ? `<div class="sub">${HAIRPIN_NOTE}</div>` : '';
    // "Widest" is an action, not a state: finding the largest radius that fits is a geometry search
    // (tens of ms), done only when it is clicked
    const active = auto ? 'auto' : null;
    const turn = cv ? `turns ${((cv.delta * 180) / Math.PI).toFixed(0)}°` : '';
    const status = cv && cv.sEnd > cv.sStart + 1 ? `R ${m0(cv.rEff)} · ${m0(cv.delta * cv.rEff)} of curve` : 'no curve (straight)';
    const vio = r.violations.filter((v) => v.pi === i || v.pis?.includes(i)).map((v) => ({ v, fixes: this.fixes(v, d) }));
    return `${this.head(`${pi.hairpin ? 'Hairpin' : 'Bend'} ${bendNo(i)}`, turn)}
      <div class="ctx-state"><b>${status}</b><div class="why">${pi.hairpin ? `A hairpin: a tight turn for climbing steep ground, driven at about ${Math.round(hairpinSpeed(cv?.rEff ?? HAIRPIN.radius))} km/h.` : keptNote && auto ? keptNote : auto ? 'Tightest the rules allow.' : pi.mapped ? `The ${this.oldLine}’s own curve, kept as it is.` : lowered ? `Your radius, lowered from ${m0(lowered.from)} to ${m0(lowered.to)} to fit between its neighbours.` : 'Your radius.'}</div>${hairpinNote}</div>
      ${this.issues(vio)}
      ${pi.hairpin ? '' : this.choices('radius-choice', 'data-radius', slowed
        // (a slowed bend: Auto keeps the faster curve where it fits; the tightest is the player's to ask for)
        ? [['auto', 'Auto', `The ${d.speed} km/h curve where it fits, else the tightest`], ['min', 'Tightest', `Smallest radius allowed (${n.minRadius} m at ${speed} km/h)`], ['max', 'Widest', 'Largest radius that fits between the neighbours']]
        : [['auto', 'Tightest', `Smallest radius allowed (${n.minRadius} m at ${speed} km/h)`], ['max', 'Widest', 'Largest radius that fits between the neighbours']], active)}
      ${speeds.length > 1 ? `<div class="ctx-row">Design speed here ${this.choices('bend-speed', 'data-bend-speed', speeds.map((v) => [String(v), `${v}`, v === d.speed ? `${v} km/h, as the whole ${line}` : `${v} km/h for this bend's stretch: curves down to ${speedNorms(v, d.category).minRadius} m`] as [string, string, string]), String(speed))}</div>${stretchNote}${keptNote && !auto ? `<div class="why">${keptNote}</div>` : ''}` : ''}
      ${road && (pi.hairpin || (cv?.delta ?? 0) >= HAIRPIN.minTurn) ? `<div class="ctx-row">${this.choices('bend-type', 'data-hairpin', [['0', 'Curve', 'An ordinary curve'], ['1', 'Hairpin', `A ${HAIRPIN.radius} m hairpin with widened lanes, for steep mountain ground`]], pi.hairpin ? '1' : '0')}</div>` : ''}
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
    const i = stationIndex(r, s);
    const vio = r.violations.filter((v) => v.kind === 'profile' && v.s0 <= s + 1 && v.s1 >= s - 1).map((v) => ({ v, fixes: '' }));
    return `${this.head('Pinned height', `km ${km(s)}`)}
      <div class="ctx-state"><b>${p.z.toFixed(1)} m</b> · road now ${r.grade[i].toFixed(1)} m<div class="why">${d.profileMode === 'auto' ? 'Auto passes within 0.5 m of it. Drag it in the profile.' : 'Not used while the height is set by hand.'}</div></div>
      ${this.issues(vio)}
      <div class="ctx-row"><label>Height <input id="pin-z" type="number" step="0.1" value="${p.z.toFixed(1)}"> m</label><button type="button" id="pin-set" data-s="${s}">Set</button><button type="button" id="pin-clear" data-s="${s}">Unpin</button></div>`;
  }

  // ---- a mission end (an interchange, a road it joins) ----
  /** what the mission's ends meet and their names (set by the app; reversed directions swap them) */
  ends: { a?: EndConnection; b?: EndConnection; names: { a: string; b: string } } | null = null;
  private end(r: Result, end: 'a' | 'b') {
    const info = this.ends?.[end];
    if (!info) return '';
    const card = endCard(info, end);
    return `${this.head(esc(card.title), `${end.toUpperCase()} · ${esc(this.ends!.names[end])} · km ${km(end === 'a' ? 0 : r.length)}`)}
      <div class="ctx-state">${card.lines.map(l => esc(l)).join('<br>')}</div>`;
  }

  // ---- a stream culvert ----
  private culvert(r: Result, d: Design, id: number, s: number) {
    const c = culvertAt(r, id, s);
    if (!c?.size || c.size.type === 'bridge') return '';
    const card = culvertCard({ ...c, size: { ...c.size, type: c.size.type }, ...(c.size.buried ? { frameCover: CULVERT_RULES.maxFrameCover,
      vaultSpan: culvertSection(c.size).width } : {}) }, CATEGORIES[d.category].mode as OurLine);
    // the alternative: a bridge over the stream and its banks (the span the game would need, as in the problem's fix)
    const half = Math.max(c.width + 2 * CULVERT_RULES.bridgeBanks, c.q100 / (CULVERT_RULES.velocity * 2) + 2 * CULVERT_RULES.bridgeBanks) / Math.max(0.01, c.sine) / 2 + r.ds;
    const s0 = Math.max(0, c.s - half), s1 = Math.min(r.length, c.s + half);
    return `${this.head(card.title, `km ${km(c.s)}`)}
      <div class="ctx-state"><b>${esc(card.state)} · ${czk(c.cost)}</b>${card.why.map(t => `<div class="why">${esc(t)}</div>`).join('')}</div>
      <div class="more-box">${card.more.map(t => `<div class="sub">${esc(t)}</div>`).join('')}</div>
      <div class="ctx-foot"><button type="button" data-fix-bridge="${s0},${s1}" title="Put our ${CATEGORIES[d.category].mode} on a bridge over the stream here instead">Bridge instead</button>${this.moreToggle()}</div>`;
  }

  // ---- height point (By hand) ----
  private vpi(r: Result, i: number) {
    if (i <= 0 || i >= r.vpis.length - 1) return '';
    const vc = r.vcurves[i - 1], v = r.vpis[i];
    const what = vc?.type === 'crest' ? 'hilltop' : vc?.type === 'sag' ? 'dip' : '';
    const vio = r.violations.filter((x) => x.vpi === i).map((x) => ({ v: x, fixes: '' }));
    return `${this.head('Height point', `km ${km(v.s)}`)}
      <div class="ctx-state"><b>${v.z.toFixed(1)} m</b>${what ? ` · ${what}` : ''} · rounding R ${m0(vc?.r ?? 0)}<div class="why">Drag it in the profile.</div></div>
      ${this.issues(vio)}
      <div class="ctx-row"><label>Rounding <input id="vpi-r" type="number" min="100" step="100" value="${Math.round(vc?.r ?? 0)}" ${v.r === null ? 'disabled' : ''}> m</label>
        <label><input id="vpi-auto" type="checkbox" ${v.r === null ? 'checked' : ''}> smallest</label></div>
      <div class="ctx-foot"><button type="button" id="vpi-del" class="danger">Delete</button></div>`;
  }

  // ---- crossed road ----
  private crossing(r: Result, d: Design, roadId: number) {
    const all = r.crossings.filter((x) => x.roadId === roadId);
    // (a road crossing ours more than once: the card describes the crossing the player shaped, if any)
    const c = all.find((x) => x.via) ?? all[0];
    if (!c) return '';
    const choice = crossingChoice(roadId, d.crossingOverrides ?? []) ?? '';
    const cost = all.reduce((a, x) => a + x.cost, 0);
    const roads = crossedRoads(r), k = roads.findIndex((x) => x.roadId === roadId);
    const nav = `<button type="button" class="nav" data-nav="-1" title="Previous crossed road" ${k <= 0 ? 'disabled' : ''}>‹</button><button type="button" class="nav" data-nav="1" title="Next crossed road" ${k >= roads.length - 1 ? 'disabled' : ''}>›</button>`;
    const vio = (c.issues ?? []).map((v) => ({ v, fixes: this.fixes(v, d) }));
    // against the crossed road as it is today (an overbridge lifts it; "below it" read like the clearance under it)
    const line = CATEGORIES[d.category].mode;
    // (a new road of the project is not there today: the ground where it crosses)
    const level = c.designed ? 'the ground where they cross' : 'the crossed road’s level today';
    const rel = Math.abs(c.h) < 0.5 ? `our ${line} at ${level}`
      : `our ${line} ${Math.abs(c.h).toFixed(0)} m ${c.h >= 0 ? 'above' : 'below'} ${level}`, outcome = crossingOutcome(c, line);
    // a new road of the project is bridged, carried over us or met, never cut and rerouted
    const options = crossingOptions(CATEGORIES[d.category].gradeSeparated ? line : 'road', !!CATEGORIES[d.category].minor).filter(([v]) => !c.designed || v !== 'reconnection');
    const many = all.length > 1 ? `<div class="why">This ${ROAD_CLASSES[c.cls].label} crosses our ${line} ${all.length} times (km ${all.map((x) => km(x.s)).join(', ')})${choice ? '; your choice applies at each' : ''}. The price is for all of them${cost > c.cost ? ` (${czk(c.cost)} here)` : ''}.</div>` : '';
    const body = `
      <div class="ctx-state"><b>${esc(outcome.label)}${cost > 0 ? ` · ${czk(cost)}` : ''}</b><div class="why">${esc(outcome.explain)}</div>${many}<div class="why">${rel}${choice ? ' · your choice' : ''}</div>${c.raised && c.raised.cost > 0
        ? `<div class="why">For it our ${line} is built up to ${c.raised.m.toFixed(1)} m higher: ${czk(c.raised.cost)} more in all.</div>` : ''}</div>
      ${this.issues(vio)}
      ${this.linkPath(c, d)}
      ${this.squareLine(c, d, line)}
      ${this.choices('crossing-choice', 'data-crossing', options, choice)}`;
    return `${this.head(c.crossedRoute ? esc(c.crossedRoute.name) : cap(ROAD_CLASSES[c.cls].label), `km ${km(c.s)}`, nav)}${this.isSideRoad?.() ? thisRoadWords(body, line) : body}`;
  }
  /** a skewed underpass or bridge over us: straightened to cross ours at a right angle, or on its own line */
  private squareLine(c: Result['crossings'][number], d: Design, line: OurLine) {
    if (c.type !== 'underpass' && c.type !== 'overbridge') return '';
    return ourWords(this.squareRow(c, d), line);
  }
  private squareRow(c: Result['crossings'][number], d: Design) {
    const set = crossingSquare(c.roadId, d.crossingOverrides ?? []), what = ROAD_CLASSES[c.cls].label;
    if (c.squared !== undefined) return `<div class="ctx-row square-line"><span>Straightened to cross at a right angle${set ? ' (your choice)' : ''}</span>
        <button type="button" data-crossing-square="0" title="Keep the ${esc(what)} on its own line, meeting our road at ${Math.round(c.squared)}°">Keep its line</button></div>`;
    const skew = c.geometry?.skew;
    // (your straightening that cannot be built: it stays on its own line, the problem says why)
    if (set === true && skew !== undefined) return `<div class="ctx-row square-line"><span>Meets our road at ${Math.round(skew)}°: it cannot be straightened here</span>
        <button type="button" data-crossing-square="0" title="Keep the ${esc(what)} on its own line, meeting our road at ${Math.round(skew)}°">Keep its line</button></div>`;
    if (skew !== undefined && skew < SQUARE_BELOW && !c.geometry?.sameSide) return `<div class="ctx-row square-line"><span>Meets our road at ${Math.round(skew)}°${set === false ? ' (your choice)' : ''}</span>
        <button type="button" data-crossing-square="1" title="Lay the ${esc(what)} on a new line near our road that crosses it at a right angle">Straighten it</button></div>`;
    return '';
  }
  /** a reroute's path: drag it on the map; once shaped, one button takes it back to Automatic */
  private linkPath(c: Result['crossings'][number], d: Design) {
    if ((c.type !== 'reconnection' && c.type !== 'diversion') || c.moved) return '';
    if (!shapeable(this.r, d, c.roadId!)) return `<div class="why link-path">This road crosses ours more than once: choose "Cut and reroute" for it to reshape its new roads.</div>`;
    const via = crossingVia(c.roadId, d.crossingOverrides ?? []), bends = via ? via[0].length + via[1].length : 0;
    return bends ? `<div class="ctx-row link-path"><span>Path: your shape, ${bends} bend point${bends === 1 ? '' : 's'}</span>
        <button type="button" data-crossing-path="auto" title="Let the game route the new road again">Automatic path</button></div>`
      : `<div class="why link-path">Drag the new road on the map to reshape it.</div>`;
  }

  // ---- building ----
  private building(r: Result, d: Design, j: number) {
    const info = this.ctx.building(j);
    const action = d.buildingOverrides?.find((o) => o.j === j)?.action ?? '';
    const removed = r.demolished.find((p) => p.j === j), bought = r.boughtOut.find((p) => p.j === j);
    const kept = r.kept.find((p) => p.j === j), rec = r.noise.receivers.find((p) => p.j === j);
    const limit = r.noise.limit, period = r.noise.controlling === 'night' ? 'at night' : 'by day';
    let state: string, why = '';
    // heard by two or more roads: their noise added together decides it (wall, buyout), once for the project
    const tog = removed ? null : this.ctx.together?.(j), together = tog ? togetherHouseText(tog.receiver, tog.name, czk) : null;
    if (together) ({ state, why } = together);
    else if (removed) {
      state = `Demolished · ${czk(removed.cost)}`;
      const ours = removed.in === 'bridge' ? 'our bridge' : removed.in === 'embankment' ? 'our embankment' : 'our cut';
      const host = removed.host !== undefined ? this.ctx.building(removed.host).kind : '';
      why = host ? `It stands within ${/^[aeiou]/i.test(host) ? 'an' : 'a'} ${host} that is demolished, km ${km(r.s[removed.i])}, and goes with it.`
        : removed.in === 'reroute' ? `In the way of the new road that reconnects a road we cut at km ${km(r.s[removed.i])}.`
        : removed.in === 'works' ? `Under the earth slopes of the road raised or lowered to cross ours at km ${km(r.s[removed.i])}.`
        : removed.strip ? `In the ${BUILDING_RULES.clearance} m working strip beside ${ours}, km ${km(r.s[removed.i])}.`
        : removed.pier ? `A pier of our bridge stands on it, km ${km(r.s[removed.i])}.`
        : removed.in === 'bridge' ? `Under our bridge, km ${km(r.s[removed.i])}: ${this.ctx.building(j).kind === BUILDING_KINDS[BUILDING_KIND.minor].label
          ? 'a garage or shed may not stay under a bridge (fire).' : `the deck is too low above it (less than ${BUILDING_RULES.underDeckFalsework} m up, it is built on scaffolding standing on the ground; higher, it needs ${BUILDING_RULES.underDeckGap} m over the roof).`}`
        : `${removed.in === 'cut' ? 'In' : 'Under'} ${ours}, km ${km(r.s[removed.i])}.`;
    }
    else if (bought) {
      state = `Bought out · ${czk(bought.cost)}`;
      const top = NOISE.wallHeights[NOISE.wallHeights.length - 1];
      // two levels: as built (the section below) and with the best wall Auto could build (why it is bought)
      const built = rec && r.noise.source ? Math.max(...floorLevels(this.noiseFieldOf(r), rec, r.noise.L, r.noise.R).map((f) => f.after)) : NaN;
      why = bought.reason === 'manual' ? 'Your choice.' : rec ? `${built === built ? `As built ${(limit + built).toFixed(1)} dB ${period}; b` : 'B'}ehind a ${top} m wall still ${(limit + rec.mitigated).toFixed(1)} dB (limit ${limit}).`
        : `Too loud even behind a ${top} m wall.`;
    }
    else if (kept?.hit) state = 'Kept — in the road\'s way';
    else if (rec?.unresolved) { state = `Stays · ${(limit + rec.mitigated).toFixed(1)} dB ${period} (limit ${limit})`; why = action === 'keep' ? 'You keep it, so it is not bought out.' : 'Your wall choice stops the automatic buyout.'; }
    else if (rec) {
      state = rec.status === 'wall' ? (rec.wall > 0 ? `Stays · behind a ${rec.wall} m wall` : 'Stays · behind walls') : rec.status === 'cut' ? 'Stays · shielded by a cut' : 'Stays · quiet enough';
      why = `${(limit + rec.mitigated).toFixed(1)} dB ${period} on the ${rec.storeys === 1 ? 'only' : rec.floor === rec.storeys - 1 ? 'top' : 'loudest'} floor (limit ${limit}).`;
    } else if (r.besideOldRoad?.includes(j)) { state = 'Stays'; why = `The ${this.oldLine} is kept as it is here: nothing changes for this house.`; }
    else state = 'Stays · far from the road';
    // kept clear of our works by a retaining wall instead of demolished (Auto's price comparison, or the player keeps it)
    const walled = !removed && !bought ? r.walledOff?.find((p) => p.j === j) : undefined;
    if (walled) {
      if (!rec && !together) state = 'Stays · a wall keeps our works clear';
      const wall = `a ${walled.height.toFixed(1)} m retaining wall along our road, km ${kmr(walled.s0, walled.s1)},`;
      why = (why ? `${why} ` : '') + (walled.kept ? `You keep it: ${wall} keeps the works clear of it (${czk(walled.wall)}).`
        : `Auto: ${wall} keeps the works clear of it for ${czk(walled.wall)}; demolishing it would cost ${czk(walled.demolition)}.`);
    }
    if (action === 'keep' && !kept?.hit && (together || !rec?.unresolved) && !walled) why = (why ? `${why} ` : '') + 'You keep it.';
    // What this road does on its own always stands (a house in its way is gone, priced or not); only the
    // noise of the project's other roads may still be missing here, and the card says so.
    const pending = this.networkPending && !removed && !bought
      ? '<div class="ctx-state pending">Not checked yet: the noise of the project’s other roads here.</div>' : '';
    const vio = r.violations.filter((v) => v.target?.buildings?.includes(j)).map((v) => ({ v, fixes: this.fixes(v, d) }));
    let section = '', walls = '';
    this.restWall = null;
    if (rec && r.noise.source && !removed && !(bought && bought.reason === 'manual')) {
      // the wall on that side, next to the house: its stretch, the computed fix, or the shortest wall the
      // house would need (twice its distance from the wall line)
      const side = rec.side, i = rec.i, src = r.noise.source;
      const w = r.walls.find((x) => x.side === side && i >= x.i0 && i <= x.i1);
      const fix = vio.find(({ v }) => v.target?.wall)?.v.target?.wall;
      const half = Math.max(25, NOISE.minWallLengthFactor * Math.max(0, rec.d - (side === 'L' ? src.L : src.R).wallOff[i]) / 2);
      // its own wall request (which may step over several heights) first, then the stretch standing there
      const own = rec.span && [Math.max(0, r.s[rec.span[0]] - r.ds / 2), Math.min(r.length, r.s[rec.span[1]] + r.ds / 2)];
      const s0 = own?.[0] ?? w?.s0 ?? fix?.s0 ?? Math.max(0, r.s[i] - half), s1 = own?.[1] ?? w?.s1 ?? fix?.s1 ?? Math.min(r.length, r.s[i] + half);
      // bought out: drawn behind the highest wall Auto tried, so plan, section and the card tell one story
      const top = NOISE.wallHeights[NOISE.wallHeights.length - 1];
      // (over the stretch Auto tried it on: the whole stretch its level was summed over, cell by cell)
      if (bought) this.restWall = { wall: { side, height: top, at: (k: number) => k >= rec.window[0] && k <= rec.window[1] }, lead: `Behind a ${top} m wall: ` };
      section = `<div class="noise-views">${this.noiseViews(r, d, rec, this.restWall?.wall, this.restWall?.lead)}</div>`;
      const mine = (d.wallOverrides ?? []).find((o) => o.side === side && o.s0 <= r.s[i] && o.s1 >= r.s[i]);
      const active = mine ? String(mine.height) : 'auto';
      const opts: [string, string, string][] = [['auto', 'Auto', 'Walls where houses need them'], ['0', 'None', 'No wall'], ...NOISE.playerWallHeights.map((h): [string, string, string] => [String(h), `${h} m`, `${h} m wall`])];
      // what stands there now: the player's choice, or what Auto built (as piece cards say)
      // (the walls standing along this stretch on that side, as the map draws them, not only at the house)
      const built = r.walls.filter((x) => x.side === side && x.s1 > s0 && x.s0 < s1);
      const heights = (list: typeof built) => [...new Set(list.map((x) => `${x.height} m`))].join(', ');
      // beside the player's own stretch, Auto's walls on the rest of it
      const beside = mine ? built.filter((x) => x.s0 < mine.s0 - 1 || x.s1 > mine.s1 + 1) : [];
      const now = mine ? `${mine.height ? `${mine.height} m` : 'none'} (yours)${beside.length ? ` · Auto: ${heights(beside)} beside it` : ''}`
        : built.length ? `Auto: ${heights(built)}` : 'Auto: none';
      // the walls Auto builds beside the player's choice for the stretch this house hears (as the piece card says)
      const around = mine ? (r.wallsAroundChoices ?? []).filter((x) => x.side === side && x.i1 >= rec.window[0] && x.i0 <= rec.window[1]) : [];
      const adds = around.length ? around.map((x) => `<div class="sub around">Auto adds ${m0(x.s1 - x.s0)} of ${x.height} m wall at km ${kmr(x.s0, x.s1)} ${mine?.height ? 'as well' : 'instead'} <button type="button" class="link" data-stretch="${x.s0},${x.s1}">Show</button></div>`).join('')
        // Auto's walls beside the player's own stretch: where they stand
        : beside.length ? `<div class="sub around">Auto's ${heights(beside)} wall beside it, km ${kmr(Math.min(...beside.map((x) => x.s0)), Math.max(...beside.map((x) => x.s1)))} <button type="button" class="link" data-stretch="${Math.min(...beside.map((x) => x.s0))},${Math.max(...beside.map((x) => x.s1))}">Show</button></div>` : '';
      walls = `<div class="wall-row" data-range="${s0},${s1}"><span class="lbl">Wall ${SIDE[shownSide(side)]}</span>${this.choices(`wall-${side}`, `data-wall-${side}`, opts, active)}<small>${now} · km ${kmr(s0, s1)}</small></div>${adds}`;
      // the wall it stays behind is Auto's beside the player's choice, not the choice itself
      if (mine && rec.status === 'wall' && around.length && !(mine.height && mine.height >= rec.wall)) {
        state = `Stays · behind Auto's ${rec.wall > 0 ? `${rec.wall} m ` : ''}wall beside your choice`;
      }
    }
    // In the road's way it is demolished whatever else is chosen: no separate "buy out" next to that
    const opt: [string, string, string][] = removed && action !== 'buy'
      ? [['', 'Demolish', 'It is in our road\'s way: bought and demolished'], ['keep', 'Keep', 'Never demolish it: our road must miss it']]
      : [['', 'Auto', 'Demolish if in the way; buy out if no wall helps'], ['buy', 'Buy out', 'Buy and demolish it, plot included'], ['keep', 'Keep', 'Never demolish or buy it']];
    return `${this.head(cap(info.kind), `${info.levels} floor${info.levels === 1 ? '' : 's'}`)}
      <div class="ctx-state"><b>${state}</b>${why ? `<div class="why">${why}</div>` : ''}</div>${pending}
      ${this.issues(vio)}
      ${section}${walls}
      ${this.choices('building-choice', 'data-building', opt, action)}`;
  }

  // ---- events ----
  private click(e: MouseEvent) {
    if (this.hosted) return;
    const b = (e.target as HTMLElement).closest('button');
    if (!b || !this.r || !this.d) return;
    const sel = this.sel, r = this.r;
    if (b.classList.contains('x')) { this.ev.close?.(); return; }
    if (b.classList.contains('more-t')) {
      this.more = !this.more;
      try { localStorage.setItem(MORE_KEY, this.more ? '1' : '0'); } catch { /* private mode */ }
      this.render(); return;
    }
    if (b.dataset.roadCard) { this.ev.select?.({ kind: 'crossing', roadId: Number(b.dataset.roadCard) }); return; }
    if (b.dataset.stretch) { const [s0, s1] = b.dataset.stretch.split(',').map(Number); this.ev.select?.({ kind: 'stretch', s0, s1 }); return; }
    if (b.dataset.piece) { const [s0, s1, kind] = b.dataset.piece.split(','); this.ev.select?.({ kind: 'stretch', s0: Number(s0), s1: Number(s1), piece: kind as PieceKind }); return; }
    if (b.dataset.fixWall) {
      const [sides, h, s0, s1] = b.dataset.fixWall.split(',');
      this.ev.wall?.(sides.split('') as ('L' | 'R')[], Number(h), Number(s0), Number(s1)); return;
    }
    if (b.dataset.fixBuy) { this.ev.building?.(b.dataset.fixBuy.split(',').map(Number), 'buy'); return; }
    if (b.dataset.fixUnkeep) { this.ev.building?.(b.dataset.fixUnkeep.split(',').map(Number), null); return; }
    if (b.dataset.fixCrossing) { this.ev.crossing?.(Number(b.dataset.fixCrossing), null); return; }
    if (b.dataset.fixCrossingPath) { this.ev.crossingPathAuto?.(Number(b.dataset.fixCrossingPath)); return; }
    if (b.dataset.crossingPath !== undefined && sel?.kind === 'crossing') { this.ev.crossingPathAuto?.(sel.roadId); return; }
    if (b.dataset.crossingSquare !== undefined && sel?.kind === 'crossing') {
      const c = this.r?.crossings.find((x) => x.roadId === sel.roadId && (x.type === 'underpass' || x.type === 'overbridge'));
      if (c) this.ev.crossingSquare?.(sel.roadId, c.type as 'underpass' | 'overbridge', b.dataset.crossingSquare === '1');
      return;
    }
    if (b.dataset.fixBridge) { const [s0, s1] = b.dataset.fixBridge.split(',').map(Number); this.ev.structure?.(1, s0, s1); return; }
    if (b.dataset.fixStructure) { const [s0, s1] = b.dataset.fixStructure.split(',').map(Number); this.ev.structure?.(null, s0, s1); return; }
    if (b.dataset.fixHairpin) { const [pi, speed] = b.dataset.fixHairpin.split(',').map(Number); this.ev.hairpin?.(pi, true, speed); return; }
    if (b.dataset.fixAuto) { const bends = b.dataset.fixAuto.split(',').map(Number); bends.forEach((i, k) => this.ev.radius?.(i, null, k === bends.length - 1)); return; }
    if (b.dataset.fixUnpin) { const [s0, s1] = b.dataset.fixUnpin.split(',').map(Number); this.ev.unpin?.(s0 - 1, s1 + 1); return; }
    if (sel?.kind === 'stretch') {
      if (b.dataset.structure !== undefined) { this.ev.structure?.(b.dataset.structure === 'clear' ? null : Number(b.dataset.structure) as StructureKind, sel.s0, sel.s1); return; }
      // Mined on Auto's tunnel is what it is: nothing to paint
      // a tunnel's method or a bridge's style, over the whole structure: on Auto's, only that choice (it stays Auto's)
      const choice = b.dataset.method !== undefined ? KIND.tunnel : b.dataset.style !== undefined ? KIND.bridge : undefined;
      if (choice !== undefined && !b.classList.contains('on')) {
        const run = this.r?.runs.find((q) => q.kind === choice && q.s1 > sel.s0 && q.s0 < sel.s1), s0 = run?.s0 ?? sel.s0, s1 = run?.s1 ?? sel.s1;
        const value = choice === KIND.tunnel ? (b.dataset.method === 'cut' ? 'cut' : undefined) : b.dataset.style as StructureChoice;
        // (where the player painted this bridge or tunnel it stays theirs: overrides.ts paintOverride)
        this.ev.structure?.(choice, s0, s1, value, activeStructure({ s0, s1 }, this.d?.structureOverrides) !== String(choice));
        return;
      }
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
      else if (b.dataset.radius === 'min') {
        // the tightest its own speed allows (horizontal.ts autoRadius, as Auto takes it at the road's speed)
        const p = this.d?.pis[sel.i], cv = this.r?.curves.find((c) => c.index === sel.i);
        if (p && cv) this.ev.radius?.(sel.i, autoRadius(cv.delta, horizontalRules(bendSpeed(p, this.d!.speed, this.d!.category), this.d!.category)));
      }
      else if (b.dataset.radius === 'max') { const m = this.ctx.maxRadius(sel.i); if (m !== null) this.ev.radius?.(sel.i, m); }
      else if (b.dataset.bendSpeed) this.ev.bendSpeed?.(sel.i, Number(b.dataset.bendSpeed));
      else if (b.dataset.hairpin) this.ev.hairpin?.(sel.i, b.dataset.hairpin === '1');
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
    if (this.hosted) return;
    const t = e.target as HTMLInputElement, sel = this.sel;
    if (sel?.kind === 'bend' && t.id === 'pi-r' && Number.isFinite(t.valueAsNumber)) this.ev.radius?.(sel.i, Math.max(10, t.valueAsNumber));
    if (sel?.kind === 'bend' && t.id === 'pi-slider') { this.ev.commit?.(); t.blur(); }
    if (sel?.kind === 'vpi' && t.id === 'vpi-r') this.ev.vpiRadius?.(sel.i, t.valueAsNumber);
    if (sel?.kind === 'vpi' && t.id === 'vpi-auto') this.ev.vpiRadius?.(sel.i, t.checked ? null : Math.round(this.r?.vcurves[sel.i - 1]?.r ?? 0));
    if (t.id === 'pin-z') this.el.querySelector<HTMLButtonElement>('#pin-set')?.click();
  }
}

/** the culvert of stream `id` nearest station s (a pipe or a box under our earthworks), if any within 100 m */
export function culvertAt(r: Pick<Result, 'waterCrossings'>, id: number, s: number) {
  let best: Result['waterCrossings'][number] | undefined;
  for (const c of r.waterCrossings) if (c.size && c.id === id && Math.abs(c.s - s) < 100 && (!best || Math.abs(c.s - s) < Math.abs(best.s - s))) best = c;
  return best;
}

/** every crossed road once, in route order */
export function crossedRoads(r: Result) {
  const list = r.crossings.filter((c) => c.roadId !== undefined).sort((a, b) => a.s - b.s);
  return list.filter((c, i) => list.findIndex((x) => x.roadId === c.roadId) === i);
}

/** "house", levels, dwelling: from the pack's building info */
export function buildingInfo(info: ArrayLike<number> | undefined, levels: number, circle?: ArrayLike<number>) {
  const k = BUILDING_KINDS[info ? info[2] : 0];
  // the rectangle the noise model measures from (BuildingIndex: a square in the circle without info)
  const rect: HouseRect | undefined = info ? { x: info[3], y: info[4], hl: info[5], hw: info[6], angle: info[7] }
    : circle ? { x: circle[0], y: circle[1], hl: circle[2] / Math.SQRT2, hw: circle[2] / Math.SQRT2, angle: 0 } : undefined;
  return { kind: k?.label ?? 'building', levels, dwelling: !!k?.dwelling, ...(rect ? { rect } : {}) };
}
