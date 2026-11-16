// Longitudinal profile panel (2D canvas): ground, the road's height line with its height points (VPIs)
// and vertical curves, cut/fill areas, bridges, tunnels, crossings, violations, the plan's bends as
// numbered markers; below it, on the same horizontal scale, the alignment elements (straights / curves)
// and a stacked "cost per metre" strip.
// Mouse, no modifiers — the same verbs as on the map: click = select the piece of road there (the map
// follows), drag sideways = select any stretch, click a curve / straight in the band = select it, drag the
// road line up / down = pin its height there (Auto), drag a height point (By hand), wheel = zoom,
// right/middle-drag = scroll. Hovering shows what is there and the place on the map.

import { cellLength, PART_KEYS, type PartKey } from '../core/cost';
import { ROAD_CLASSES } from '../core/data/urban';
import type { Result } from '../core/evaluate';
import { crossingLabel } from '../core/crossings';
import { KIND } from '../core/structures';
import type { StructureOverride } from '../core/overrides';
import type { WallOverride } from '../core/build-controls';
import type { VPI } from '../core/vertical';
import type { ProvisionalProfile } from './provisional';
import type { StationRange } from '../state';
import { COST_GROUPS, perM } from './costgroups';

export interface ProfileEvents {
  onVpiDrag?: (i: number, s: number, z: number) => void;
  onVpiDragEnd?: () => void;
  onVpiAdd?: (s: number, z: number) => void;
  onVpiDelete?: (i: number) => void;
  onVpiSelect?: (i: number | null) => void;
  /** the station under the mouse; `label` when it is a height point (named on the map too) */
  onHover?: (s: number | null, label?: string) => void;
  onStationSelect?: (s: number) => void;
  /** Automatic: a click on the road line pins its current height there */
  onPinAdd?: (s: number) => void;
  /** a pinned height dragged up / down (transient), and released */
  onPinDrag?: (s: number, z: number) => void;
  onPinDragEnd?: () => void;
  onCrossingSelect?: (roadId: number) => void;
  /** a station range was picked for the cost breakdown (null = whole route) */
  onSelect?: (r: StationRange | null) => void;
  /** a click at station s (select the piece of road there) */
  onPick?: (s: number) => void;
  /** Auto: the road line dragged up / down at station s — pin it there at height z (transient), and released */
  onLineDrag?: (s: number, z: number) => void;
  /** the visible stretch changed (zoom buttons, the floating selection bar) */
  onView?: () => void;
  /** after every redraw (overlays that follow the profile's scale) */
  onDraw?: () => void;
  onBendHover?: (i: number | null) => void;
  onBendSelect?: (i: number) => void;
}

/** what is under the mouse in the profile panel */
type Under =
  | { kind: 'none' | 'chart' | 'strip' }
  | { kind: 'bend'; i: number }
  | { kind: 'vpi'; k: number }
  | { kind: 'pin'; s: number }
  | { kind: 'crossing'; roadId: number }
  | { kind: 'line'; s: number }
  | { kind: 'band'; el: Element };

/** narrowest zoom, m */
const MIN_SPAN = 300;
/** centre line of the bend markers, in the top padding */
const BEND_Y = 12;

/** the cost strip never averages over less than this, so lump sums (buildings, junctions) stay readable, m */
const MIN_WINDOW = 50;
const BAND_H = 11, STRIP_H = 54, GAP_CHART = 6, GAP_BAND = 3;

interface Element { s0: number; s1: number; curve: boolean; label: string }

export class ProfilePanel {
  private ctx: CanvasRenderingContext2D;
  private r: Result | null = null;
  private vpis: VPI[] = [];
  /** Provisional ground/grade of a newer design than `r` (drag in progress); display only. */
  private preview: ProvisionalProfile | null = null;
  private overrides: readonly StructureOverride[] = [];
  private pins: readonly { s: number; z: number }[] = [];
  private wallOverrides: readonly WallOverride[] = [];
  private pinStation: number | null = null;
  private selCrossing: number | null = null;
  private v0 = 0;
  private v1 = 1;
  /** the view shows the whole route (and keeps doing so when the route's length changes) */
  private whole = true;
  private hoverS: number | null = null;
  private hoverClient: { x: number; y: number } | null = null;
  private selected: number | null = null;
  private mode: 'auto' | 'manual' = 'auto';
  /** the plan's bends at their stations (i = index of the bend, label i + 1 like on the map) */
  private bends: { i: number; s: number }[] = [];
  private selectedBend: number | null = null;
  private hoverBend: number | null = null;
  /** the hover line comes from the mouse over the map (drawn with a station label) */
  private hoverFromMap = false;
  private under: Under = { kind: 'none' };
  /** a height point or pin is being dragged */
  private dragging = false;
  private flash: { s0: number; s1: number } | null = null;
  private sel: StationRange | null = null;
  /** the part of the route the map shows (light window), null when it shows all of it */
  private mapWindow: { s0: number; s1: number } | null = null;
  private zr = { lo: 0, hi: 1 };
  private pad = { l: 52, r: 14, t: 26, b: 22 };
  /** prefix sums over station cells: one per cost group, plus cell length; and per part key */
  private cum: Float64Array[] = [];
  private cumKey = {} as Record<PartKey, Float64Array>;
  private cumLen = new Float64Array(1);
  private elements: Element[] = [];
  private tip: HTMLElement;
  // cost strip cache
  private stripCanvas = document.createElement('canvas');
  private stripFor: Result | null = null;
  private stripKey = '';
  private stripMax = 0;
  ev: ProfileEvents = {};

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.draw()).observe(canvas);
    this.tip = document.createElement('div');
    this.tip.className = 'profile-tip';
    this.tip.style.display = 'none';
    document.body.appendChild(this.tip);
    // the cost strip's colours in the profile's key
    const key = document.getElementById('cost-key');
    if (key) key.innerHTML = COST_GROUPS.map((g) => `<div><i class="sw" style="background:${g.color}"></i>${g.label}</div>`).join('');
    this.install();
  }

  /** shown on an empty profile (e.g. a proposed change that has no checked heights yet) */
  private emptyNote = '';
  clear(note = '') {
    this.emptyNote = note;
    this.r = null; this.preview = null; this.vpis = []; this.bends = []; this.sel = null;
    this.selected = this.selectedBend = this.pinStation = this.selCrossing = null;
    this.tip.style.display = 'none'; this.draw();
  }

  /** the steepest slope the shown route's category allows (labels above it are red); tracks in per mille */
  private gradeRule = { max: 0.06, perMille: false };
  setGradeRule(rule: { max: number; perMille: boolean }) { this.gradeRule = rule; }
  setResult(r: Result, vpis: VPI[], overrides: readonly StructureOverride[] = [], pins: readonly { s: number; z: number }[] = [], walls: readonly WallOverride[] = []) {
    this.overrides = overrides;
    this.pins = pins;
    this.wallOverrides = walls;
    this.r = r; this.emptyNote = '';
    this.vpis = vpis;
    // prefix sums of the bill
    const n = r.n;
    const prefix = (f: (i: number) => number) => {
      const c = new Float64Array(n + 1);
      for (let i = 0; i < n; i++) c[i + 1] = c[i] + f(i);
      return c;
    };
    for (const k of PART_KEYS) this.cumKey[k] = prefix((i) => r.parts[k][i]);
    this.cum = COST_GROUPS.map((g) => prefix((i) => { let v = 0; for (const k of g.keys) v += r.parts[k][i]; return v; }));
    this.cumLen = prefix((i) => cellLength(i, n, r.ds));
    // alignment elements: tangents between the curves; the arcs of one compound curve (bends joined
    // by the horizontal solver) are one stretch, labelled with its range of radii
    const els: Element[] = [];
    let prev = 0, unit = -1, lo = 0, hi = 0;
    for (const c of [...r.curves].sort((a, b) => a.sStart - b.sStart)) {
      if (!(c.sEnd > c.sStart + 1)) continue;
      const last = els[els.length - 1];
      if (last?.curve && c.unit >= 0 && c.unit === unit && c.sStart <= prev + 1) {
        lo = Math.min(lo, c.rEff); hi = Math.max(hi, c.rEff);
        last.s1 = c.sEnd;
        last.label = Math.round(lo) === Math.round(hi) ? `R ${Math.round(lo)}` : `R ${Math.round(lo)}–${Math.round(hi)}`;
      } else {
        if (c.sStart > prev + 1) els.push({ s0: prev, s1: c.sStart, curve: false, label: '' });
        els.push({ s0: Math.max(prev, c.sStart), s1: c.sEnd, curve: true, label: `R ${Math.round(c.rEff)}` });
        unit = c.unit; lo = hi = c.rEff;
      }
      prev = Math.max(prev, c.sEnd);
    }
    if (r.length > prev + 1) els.push({ s0: prev, s1: r.length, curve: false, label: '' });
    this.elements = els;
    // a fitted view follows the route's length; a zoomed one keeps its span, clamped to the new route
    if (this.whole) { this.v0 = 0; this.v1 = r.length; } else {
      const span = Math.min(this.v1 - this.v0, r.length);
      this.v0 = Math.max(0, Math.min(r.length - span, this.v0));
      this.v1 = this.v0 + span;
      this.whole = span >= r.length;
    }
    this.draw();
    // what is under a resting mouse may have changed (e.g. Undo removed the hovered height point)
    if (this.hoverClient && !this.dragging) {
      const b = this.canvas.getBoundingClientRect();
      this.setUnder(this.hit(this.hoverClient.x - b.left, this.hoverClient.y - b.top));
    } else if (!this.hoverClient) this.setUnder({ kind: 'none' });
    this.updateTip();
  }

  select(i: number | null) { this.selected = i; this.draw(); }
  selectStation(s: number | null) { this.pinStation = s; this.draw(); }
  /** the crossed road whose options are open (highlighted) */
  selectCrossing(roadId: number | null) { this.selCrossing = roadId; this.draw(); }
  setPreview(p: ProvisionalProfile | null) { if (p !== this.preview) { this.preview = p; this.draw(); } }

  /** show the selected station range (set by the owner of the selection state) */
  setSelection(r: StationRange | null) { this.sel = r; this.draw(); }
  setMapWindow(w: { s0: number; s1: number } | null) {
    const a = this.mapWindow;
    if (a === w || (a && w && Math.abs(a.s0 - w.s0) < 1 && Math.abs(a.s1 - w.s1) < 1)) return;
    this.mapWindow = w; this.draw();
  }
  /** make the stretch visible: zoom out / scroll only if it is not already in view */
  reveal(s0: number, s1: number) {
    if (!this.r) return;
    const span = this.v1 - this.v0;
    if (s0 >= this.v0 && s1 <= this.v1) { this.draw(); return; }
    if (s1 - s0 < span * 0.9) this.show((s0 + s1) / 2, span); else this.show((s0 + s1) / 2, (s1 - s0) * 1.4);
  }

  /** visible station range (diagnostics) */
  get view() { return { v0: this.v0, v1: this.v1 }; }
  /** a road is drawn (false after clear()) */
  get hasRoad() { return !!this.r; }

  /** the whole route is visible */
  get isWhole() { return this.whole; }
  /** the hover line (diagnostics) */
  get hover() { return { s: this.hoverS, fromMap: this.hoverFromMap }; }

  fit() { this.whole = true; if (this.r) { this.v0 = 0; this.v1 = this.r.length; } this.draw(); this.ev.onView?.(); }

  focus(s0: number, s1: number) {
    if (!this.r) return;
    this.flash = { s0, s1 };
    this.show((s0 + s1) / 2, Math.max(1500, (s1 - s0) * 3));
  }

  /** zoom by a factor (> 1 = in) around the middle of the view */
  zoom(f: number) { this.show((this.v0 + this.v1) / 2, (this.v1 - this.v0) / f); }

  /** show `span` metres centred on station c (clamped to the route) */
  private show(c: number, span: number) {
    if (!this.r) return;
    const L = this.r.length;
    span = Math.max(Math.min(MIN_SPAN, L), Math.min(L, span));
    this.v0 = Math.max(0, Math.min(L - span, c - span / 2));
    this.v1 = this.v0 + span;
    this.whole = span >= L;
    this.draw();
    this.updateTip();
    this.ev.onView?.();
  }

  /** hover line at station s; `fromMap`: the mouse is over the road on the map (labelled, off-view arrow) */
  setHover(s: number | null, fromMap = false) {
    if (fromMap && this.hoverClient) return; // the mouse is over the profile itself
    this.hoverS = s; this.hoverFromMap = fromMap && s !== null; this.draw();
  }

  /** Automatic draws the height points small (they are the game's), By hand full size */
  setMode(mode: 'auto' | 'manual') { if (mode !== this.mode) { this.mode = mode; this.draw(); } }

  setBends(bends: { i: number; s: number }[]) { this.bends = bends; this.draw(); }
  selectBend(i: number | null) { if (i !== this.selectedBend) { this.selectedBend = i; this.draw(); } }
  setBendHover(i: number | null) { if (i !== this.hoverBend) { this.hoverBend = i; this.draw(); } }

  /** x of station s in CSS px from the canvas' left edge, and the chart's top (for overlays) */
  stationX(s: number) { this.flush(); return this.X(s); }
  get chartTop() { return this.pad.t; }
  get chartBottom() { this.flush(); return this.chartB; }
  /** client (page) coordinates of station s at height z (default: on the road line); `band`: in the curve band */
  toClient(s: number, z?: number, band = false) {
    this.flush();
    const b = this.canvas.getBoundingClientRect();
    const y = band ? this.bandT + BAND_H / 2 : z === undefined ? this.Y(this.gradeAt(s)) : this.Y(z);
    return { x: b.left + this.X(s), y: b.top + y, bendY: b.top + BEND_Y, stripY: b.top + (this.stripT + this.stripB) / 2 };
  }
  get plotLeft() { return this.pad.l; }
  get plotRight() { return this.W - this.pad.r; }

  // ---- coordinate transforms ----
  // canvas CSS size, read once per draw: X() / Y() are called thousands of times per frame and every
  // clientWidth / clientHeight read is a DOM call (≈ 20 ms per draw before this cache)
  private cw = 0;
  private ch = 0;
  private get W() { return this.cw; }
  private get H() { return this.ch; }
  /** bottom of the profile chart */
  private get chartB() { return this.H - this.pad.b - STRIP_H - GAP_BAND - BAND_H - GAP_CHART; }
  private get bandT() { return this.chartB + GAP_CHART; }
  private get stripT() { return this.bandT + BAND_H + GAP_BAND; }
  private get stripB() { return this.H - this.pad.b; }
  private X(s: number) { return this.pad.l + ((s - this.v0) / (this.v1 - this.v0)) * (this.W - this.pad.l - this.pad.r); }
  private S(px: number) { return this.v0 + ((px - this.pad.l) / (this.W - this.pad.l - this.pad.r)) * (this.v1 - this.v0); }
  private Y(z: number) { return this.pad.t + (1 - (z - this.zr.lo) / (this.zr.hi - this.zr.lo)) * (this.chartB - this.pad.t); }
  private Z(py: number) { return this.zr.lo + (1 - (py - this.pad.t) / (this.chartB - this.pad.t)) * (this.zr.hi - this.zr.lo); }

  /** station cells averaged for a strip column / the tooltip around station s (at least MIN_WINDOW wide) */
  private window(s: number, width: number): [number, number] {
    const r = this.r!;
    const half = Math.max(width, MIN_WINDOW) / 2;
    let i0 = Math.ceil((s - half) / r.ds), i1 = Math.floor((s + half) / r.ds);
    if (i1 < i0) i0 = i1 = Math.round(s / r.ds);
    return [Math.max(0, Math.min(r.n - 1, i0)), Math.max(0, Math.min(r.n - 1, i1))];
  }

  /** Redraw at the next animation frame: a result sets data, mode, bends… each asking for a
   * draw (≈ 10 ms each); one paint per frame is enough. Readers of the drawn scales (hit tests,
   * toClient) flush a pending paint first. */
  draw() { if (!this.drawFrame) this.drawFrame = requestAnimationFrame(() => { this.drawFrame = 0; this.paint(); }); }
  private drawFrame = 0;
  /** a paint is scheduled for the next frame (it ends with `ev.onDraw`) */
  get drawPending() { return this.drawFrame !== 0; }
  /** paint now if a draw is pending (the scales below are set by the paint) */
  private flush() { if (this.drawFrame) { cancelAnimationFrame(this.drawFrame); this.drawFrame = 0; this.paint(); } }

  private paint() {
    const c = this.canvas, dpr = window.devicePixelRatio || 1;
    const W = this.cw = c.clientWidth, H = this.ch = c.clientHeight;
    if (!W || !H) return;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = this.ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#f7f5f0';
    g.fillRect(0, 0, W, H);
    const r = this.r;
    if (!r) {
      if (this.emptyNote) { g.fillStyle = '#667'; g.font = '13px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(this.emptyNote, W / 2, H / 2); g.textAlign = 'start'; }
      return;
    }
    // visible station range and elevation range
    const i0 = Math.max(0, Math.floor(this.v0 / r.ds) - 1), i1 = Math.min(r.n - 1, Math.ceil(this.v1 / r.ds) + 1);
    let lo = Infinity, hi = -Infinity;
    for (let i = i0; i <= i1; i++) {
      lo = Math.min(lo, r.ground[i], r.grade[i]);
      hi = Math.max(hi, r.ground[i], r.grade[i]);
    }
    for (const v of [...this.vpis, ...this.pins]) if (v.s >= this.v0 && v.s <= this.v1) { lo = Math.min(lo, v.z); hi = Math.max(hi, v.z); }
    // A provisional route can leave the last result's height range (a ridge, a hollow).
    const pv = this.preview;
    if (pv) for (let j = 0; j < pv.s.length; j++) if (pv.s[j] >= this.v0 && pv.s[j] <= this.v1) {
      lo = Math.min(lo, pv.ground[j], pv.grade[j]); hi = Math.max(hi, pv.ground[j], pv.grade[j]);
    }
    const m = Math.max(8, (hi - lo) * 0.08);
    // the height scale holds still while a handle is dragged (it would run away from the mouse)
    if (!this.dragging) this.zr = { lo: lo - m, hi: hi + m };
    const L = this.pad.l, R = W - this.pad.r, T = this.pad.t, B = this.chartB;
    g.save();
    g.beginPath(); g.rect(L, T - 4, R - L, B - T + 4); g.clip();
    // violations bands
    g.fillStyle = 'rgba(255,40,40,0.12)';
    for (const v of r.violations) {
      if (v.goal) continue;
      const a = this.X(v.s0 - r.ds), b = this.X(v.s1 + r.ds);
      g.fillRect(a, T, Math.max(3, b - a), B - T);
    }
    if (this.flash) {
      g.fillStyle = 'rgba(255,200,0,0.25)';
      const a = this.X(this.flash.s0), b = this.X(this.flash.s1);
      g.fillRect(a, T, Math.max(4, b - a), B - T);
    }
    // A long route has several stations per pixel: lines and areas step over them (at most ~2 per
    // pixel; ends of runs are always kept), so a 60 km profile paints as fast as an 18 km one.
    const stride = Math.max(1, Math.floor((i1 - i0) / Math.max(1, 2 * (R - L))));
    const along = (a: number, b: number, f: (i: number) => void) => { for (let i = a; i < b; i += stride) f(i); f(b); };
    // ground
    g.beginPath();
    g.moveTo(this.X(r.s[i0]), B);
    along(i0, i1, i => g.lineTo(this.X(r.s[i]), this.Y(r.ground[i])));
    g.lineTo(this.X(r.s[i1]), B);
    g.closePath();
    g.fillStyle = '#e3d6bb';
    g.fill();
    // cut / fill between grade and ground
    // One area per run of earthwork cells of one sign (embankment / cutting).
    const earthSign = (i: number) => r.kind[i] !== KIND.earth || r.kind[i + 1] !== KIND.earth ? 0
      : r.grade[i] - r.ground[i] + r.grade[i + 1] - r.ground[i + 1] > 0 ? 1 : -1;
    for (let i = i0; i < i1;) {
      const sign = earthSign(i);
      let j = i;
      while (j + 1 < i1 && earthSign(j + 1) === sign) j++;
      if (sign) {
        g.fillStyle = sign > 0 ? 'rgba(110,160,60,0.55)' : 'rgba(215,140,50,0.6)';
        g.beginPath();
        g.moveTo(this.X(r.s[i]), this.Y(r.ground[i]));
        along(i, j + 1, k => g.lineTo(this.X(r.s[k]), this.Y(r.ground[k])));
        for (let k = j + 1; k > i; k -= stride) g.lineTo(this.X(r.s[k]), this.Y(r.grade[k]));
        g.lineTo(this.X(r.s[i]), this.Y(r.grade[i]));
        g.closePath();
        g.fill();
      }
      i = j + 1;
    }
    g.strokeStyle = '#8a7148';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(this.X(r.s[i0]), this.Y(r.ground[i0]));
    along(i0, i1, i => g.lineTo(this.X(r.s[i]), this.Y(r.ground[i])));
    g.stroke();
    // structures
    for (const run of r.runs) {
      const a = this.X(run.s0), b = this.X(run.s1);
      if (b < L || a > R) continue;
      if (run.kind === KIND.bridge) {
        g.fillStyle = 'rgba(47,143,255,0.18)';
        g.beginPath();
        g.moveTo(a, this.Y(r.grade[run.i0]));
        for (let i = run.i0; i <= run.i1; i++) g.lineTo(this.X(r.s[i]), this.Y(r.grade[i]));
        for (let i = run.i1; i >= run.i0; i--) g.lineTo(this.X(r.s[i]), this.Y(r.ground[i]));
        g.closePath(); g.fill();
        g.strokeStyle = '#2f6fcf';
        g.lineWidth = 1;
        const nP = Math.max(1, Math.round(run.length / 40));
        for (let k = 1; k < nP; k++) {
          const i = Math.round(run.i0 + ((run.i1 - run.i0) * k) / nP);
          g.beginPath(); g.moveTo(this.X(r.s[i]), this.Y(r.grade[i])); g.lineTo(this.X(r.s[i]), this.Y(r.ground[i])); g.stroke();
        }
      } else {
        g.fillStyle = 'rgba(120,90,180,0.25)';
        g.beginPath();
        for (let i = run.i0; i <= run.i1; i++) g.lineTo(this.X(r.s[i]), this.Y(r.grade[i] + 8));
        for (let i = run.i1; i >= run.i0; i--) g.lineTo(this.X(r.s[i]), this.Y(r.grade[i]));
        g.closePath(); g.fill();
      }
    }
    // tangent polygon
    g.setLineDash([4, 4]);
    g.strokeStyle = 'rgba(60,60,60,0.55)';
    g.lineWidth = 1;
    g.beginPath();
    this.vpis.forEach((v, k) => { const x = this.X(v.s), y = this.Y(v.z); if (k === 0) g.moveTo(x, y); else g.lineTo(x, y); });
    g.stroke();
    g.setLineDash([]);
    // Noise walls at their actual top elevation; dashed = right side.
    g.strokeStyle = '#14a3a3';
    g.lineWidth = 2;
    for (const w of r.walls) {
      if (w.s1 < this.v0 || w.s0 > this.v1) continue;
      g.strokeStyle = w.side === 'R' ? '#087575' : '#14a3a3';
      g.setLineDash(w.side === 'R' ? [3, 2] : []);
      g.beginPath();
      const stations = [w.s0, ...Array.from({ length: w.i1 - w.i0 + 1 }, (_, k) => r.s[w.i0 + k]), w.s1]
        .filter((s, i, a) => i === 0 || s !== a[i - 1]);
      for (const [k, s] of stations.entries()) {
        const a = Math.min(r.n - 2, Math.max(0, Math.floor(s / r.ds))), t = (s - r.s[a]) / r.ds;
        const z = r.grade[a] + t * (r.grade[a + 1] - r.grade[a]);
        const x = this.X(s), y = this.Y(z + w.height);
        if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.setLineDash([]);
    // grade line coloured by kind / violation
    const bad = new Uint8Array(r.n);
    for (const v of r.violations) if (!v.goal) for (let i = Math.max(0, Math.floor(v.s0 / r.ds)); i <= Math.min(r.n - 1, Math.ceil(v.s1 / r.ds)); i++) bad[i] = 1;
    g.lineWidth = 2.5;
    // One stroke per run of stations drawn alike.
    const gradeStyle = (i: number) => bad[i] ? '#e01e1e' : r.kind[i] === KIND.bridge ? '#2f6fcf' : r.kind[i] === KIND.tunnel ? '#7a4fc0' : '#222';
    for (let i = i0; i < i1;) {
      const style = gradeStyle(i), tunnel = r.kind[i] === KIND.tunnel;
      g.strokeStyle = style;
      g.setLineDash(tunnel ? [6, 4] : []);
      g.beginPath(); g.moveTo(this.X(r.s[i]), this.Y(r.grade[i]));
      let j = i;
      while (j < i1 && gradeStyle(j) === style && (r.kind[j] === KIND.tunnel) === tunnel) j++;
      along(i + 1, j, k => g.lineTo(this.X(r.s[k]), this.Y(r.grade[k])));
      g.stroke();
      i = j;
    }
    g.setLineDash([]);
    // Manual ranges are marked separately from the resulting structures (including invalid paint).
    g.save();
    for (const o of this.overrides) {
      const a = this.X(Math.max(this.v0, o.s0)), b = this.X(Math.min(this.v1, r.length, o.s1));
      if (b <= a) continue;
      const y = this.pad.t + 5;
      g.strokeStyle = g.fillStyle = ['#976025', '#2f6fcf', '#7a4fc0'][o.kind];
      g.lineWidth = 3; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(a, y + 5); g.lineTo(a, y); g.lineTo(b, y); g.lineTo(b, y + 5); g.stroke();
      g.font = 'bold 10px system-ui'; g.textAlign = 'left';
      if (b - a > 24) g.fillText(`your ${['earthwork', 'bridge', 'tunnel'][o.kind]}`, a + 3, y + 15, b - a - 5);
    }
    for (const o of this.wallOverrides) {
      const a = this.X(Math.max(this.v0, o.s0)), b = this.X(Math.min(this.v1, r.length, o.s1));
      if (b <= a) continue;
      const y = this.pad.t + (o.side === 'L' ? 30 : 46);
      g.strokeStyle = g.fillStyle = o.height ? '#087575' : '#c12d80';
      g.lineWidth = 2; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(a, y); g.lineTo(b, y); g.stroke();
      g.font = 'bold 10px system-ui'; g.textAlign = 'left';
      if (b - a > 20) g.fillText(`${o.side === 'L' ? 'left' : 'right'}: ${o.height ? `wall ${o.height} m` : 'no wall'}`, a + 2, y + 11, b - a - 4);
    }
    g.restore();
    // crossed roads: a mark at the crossed road's level, linked to the grade line
    for (const x of r.crossings) {
      if (x.s < this.v0 || x.s > this.v1) continue;
      const px = this.X(x.s), yg = this.Y(r.grade[x.i]), yr = this.Y(r.grade[x.i] - x.h);
      const minor = !ROAD_CLASSES[x.cls].separable;
      g.strokeStyle = 'rgba(40,40,40,0.55)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(px, yg); g.lineTo(px, yr); g.stroke();
      g.fillStyle = x.type === 'atGrade' && ROAD_CLASSES[x.cls].noAtGrade ? '#d33' : x.cost > 0 ? '#e0a800' : '#fff';
      g.strokeStyle = x.requestedType ? '#b45800' : '#222';
      g.lineWidth = x.requestedType ? 2.5 : 1.2;
      const hw = minor ? 3 : 4.5, hh = minor ? 2 : 3;
      if (x.roadId !== undefined && x.roadId === this.selCrossing) {
        g.save(); g.fillStyle = 'rgba(255,212,0,0.85)'; g.strokeStyle = '#1d232a'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(px, yr, 9, 0, 2 * Math.PI); g.fill(); g.stroke(); g.restore();
        g.fillStyle = x.type === 'atGrade' && ROAD_CLASSES[x.cls].noAtGrade ? '#d33' : x.cost > 0 ? '#e0a800' : '#fff';
        g.strokeStyle = x.requestedType ? '#b45800' : '#222';
        g.lineWidth = x.requestedType ? 2.5 : 1.2;
      }
      g.beginPath(); g.rect(px - hw, yr - hh, 2 * hw, 2 * hh); g.fill(); g.stroke();
      if (x.type === 'overbridge') { g.beginPath(); g.moveTo(px - 8, yr); g.lineTo(px + 8, yr); g.lineWidth = 2.5; g.stroke(); }
      const box = x.type === 'underpass' ? x.geometry?.underpass : undefined;
      if (box) { // the clear opening of the box through our embankment, at the crossed road
        const top = this.Y(r.grade[x.i] - x.h + box.height);
        g.save(); g.strokeStyle = '#6f6c64'; g.lineWidth = 2; g.strokeRect(px - 7, top, 14, yr - top); g.restore();
      }
    }
    // Watercourse culverts: blue rings at stream-bed elevation (not a second road crossing).
    g.strokeStyle = '#167d9a'; g.lineWidth = 2;
    for (const c of r.waterCrossings) if ((c.structure === 'pipe' || c.structure === 'box') && c.s >= this.v0 && c.s <= this.v1) {
      g.beginPath(); g.arc(this.X(c.s), this.Y(c.bed) - 4, 4, 0, 2 * Math.PI); g.stroke();
    }
    // demolished buildings: dark squares on the ground
    g.fillStyle = '#3d434b';
    for (const b of r.demolished) {
      if (b.i < i0 || b.i > i1) continue;
      g.fillRect(this.X(r.s[b.i]) - 2, this.Y(r.ground[b.i]) - 7, 4, 4);
    }
    // Kept buildings: green outlined squares; red outline means a footprint conflict.
    for (const b of r.kept) {
      if (b.i < i0 || b.i > i1) continue;
      const x = this.X(r.s[b.i]), y = this.Y(r.ground[b.i]) - 20;
      g.strokeStyle = b.hit ? '#d7301f' : '#467d19'; g.lineWidth = 2;
      g.strokeRect(x - 4, y - 4, 8, 8);
    }
    // Noise / player buyouts: magenta diamonds, offset above the footprint-demolition squares.
    g.fillStyle = '#c43c9b';
    for (const b of r.boughtOut) {
      if (b.i < i0 || b.i > i1) continue;
      const x = this.X(r.s[b.i]), y = this.Y(r.ground[b.i]) - 12;
      g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 4, y); g.lineTo(x, y + 4); g.lineTo(x - 4, y); g.closePath(); g.fill();
    }
    // grade labels
    g.font = '11px system-ui, sans-serif';
    g.fillStyle = '#333';
    g.textAlign = 'center';
    // the category's steepest slope (the scenarios' road value 6 % otherwise); track grades in per mille
    const { max: maxGrade, perMille: rail } = this.gradeRule;
    for (let k = 0; k < this.vpis.length - 1; k++) {
      const a = this.X(this.vpis[k].s), b = this.X(this.vpis[k + 1].s);
      if (b - a < 46 || b < L || a > R) continue;
      const gr = r.grades[k] ?? 0;
      const ym = this.Y((this.vpis[k].z + this.vpis[k + 1].z) / 2);
      g.fillStyle = Math.abs(gr) > maxGrade + 1e-6 ? '#d00' : '#333';
      g.fillText(rail ? `${(gr * 1000).toFixed(1)} ‰` : `${(gr * 100).toFixed(1)} %`, (a + b) / 2, ym - 8);
    }
    // Requested pin elevations are drawn separately from the realised grade, including failures.
    for (const pin of this.pins) {
      if (pin.s < this.v0 || pin.s > this.v1) continue;
      // a map pin: head above, point at the pinned height; grows under the mouse (drag it up / down)
      const x = this.X(pin.s), y = this.Y(pin.z);
      const hov = this.under.kind === 'pin' && Math.abs(this.under.s - pin.s) < 0.1;
      const hr = hov ? 6.5 : 5;
      g.strokeStyle = '#864000'; g.fillStyle = '#ffb339'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 9); g.stroke();
      g.beginPath(); g.arc(x, y - 9 - hr, hr, 0, 2 * Math.PI); g.fill(); g.stroke();
      g.beginPath(); g.arc(x, y, 2.5, 0, 2 * Math.PI); g.fillStyle = '#864000'; g.fill();
      g.fillStyle = '#864000';
      // the label above the head, or beside it near the top of the chart
      if (y - 14 - 2 * hr < T + 10) { g.textAlign = 'left'; g.fillText(`pinned ${pin.z.toFixed(1)} m`, x + hr + 4, y - 9 - hr + 4); g.textAlign = 'center'; }
      else g.fillText(`pinned ${pin.z.toFixed(1)} m`, x, y - 12 - 2 * hr);
    }
    if (this.pinStation !== null) {
      g.strokeStyle = '#b45800'; g.setLineDash([3, 4]);
      const x = this.X(this.pinStation);
      g.beginPath(); g.moveTo(x, T); g.lineTo(x, B); g.stroke(); g.setLineDash([]);
    }
    // height points (VPIs) are handles only By hand; in Automatic they are the game's and not drawn
    // (the player's handles there are the pins). The hovered / selected one grows.
    const hovK = this.under.kind === 'vpi' ? this.under.k : -1;
    if (this.mode === 'manual') this.vpis.forEach((v, k) => {
      const x = this.X(v.s), y = this.Y(v.z);
      if (x < L - 8 || x > R + 8) return;
      const end = k === 0 || k === this.vpis.length - 1;
      const rad = k === this.selected || k === hovK ? 6.5 : 5;
      g.beginPath();
      // diamonds: height points are not the plan's bends (numbered circles above the chart)
      if (end) g.rect(x - 4, y - 4, 8, 8);
      else { const d = rad * 1.25; g.moveTo(x, y - d); g.lineTo(x + d, y); g.lineTo(x, y + d); g.lineTo(x - d, y); g.closePath(); }
      g.fillStyle = k === this.selected ? '#ffd400' : end ? '#222' : '#fff';
      g.fill();
      g.strokeStyle = '#222';
      g.lineWidth = 1.5;
      g.stroke();
    });
    g.restore();

    this.drawElements(g, L, R);
    this.drawStrip(g, L, R);
    this.drawBends(g, L, R);

    // selected range and hover line span the chart and the strip
    g.save();
    g.beginPath(); g.rect(L, T - 4, R - L, this.stripB - T + 4); g.clip();
    if (this.mapWindow) {
      const a = this.X(this.mapWindow.s0), b = this.X(this.mapWindow.s1);
      g.fillStyle = 'rgba(31,111,235,0.07)';
      g.fillRect(a, T, b - a, this.stripB - T);
      g.fillStyle = 'rgba(31,111,235,0.55)';
      g.fillRect(a, T - 3, Math.max(2, b - a), 3);
    }
    if (this.sel) {
      const a = this.X(this.sel.s0), b = this.X(this.sel.s1);
      g.fillStyle = 'rgba(255,214,0,0.16)';
      g.fillRect(a, T, b - a, this.stripB - T);
      g.strokeStyle = '#c79a00';
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(a, T); g.lineTo(a, this.stripB); g.moveTo(b, T); g.lineTo(b, this.stripB); g.stroke();
      g.fillStyle = '#c79a00';
      g.fillRect(a, this.stripB - 2, b - a, 2);
    }
    if (this.hoverS !== null && this.hoverS >= this.v0 && this.hoverS <= this.v1) {
      const x = this.X(this.hoverS);
      g.strokeStyle = this.hoverFromMap ? '#1d232a' : 'rgba(0,0,0,0.5)';
      g.lineWidth = this.hoverFromMap ? 1.5 : 1;
      g.beginPath(); g.moveTo(x, T); g.lineTo(x, this.stripB); g.stroke();
      if (this.hoverFromMap) {
        // the spot under the mouse on the map: a dot on the road line, as on the map
        const z = this.gradeAt(this.hoverS);
        g.fillStyle = '#ffd400'; g.strokeStyle = '#000'; g.lineWidth = 2;
        g.beginPath(); g.arc(x, this.Y(z), 5.5, 0, 2 * Math.PI); g.fill(); g.stroke();
      }
    }
    g.restore();
    if (this.hoverFromMap && this.hoverS !== null) this.drawMapHoverLabel(g, this.hoverS, L, R, T);
    // axes
    g.fillStyle = '#555';
    g.font = '11px system-ui, sans-serif';
    g.textAlign = 'center';
    const span = this.v1 - this.v0;
    const kstep = niceStep(span / 8);
    for (let s = Math.ceil(this.v0 / kstep) * kstep; s <= this.v1; s += kstep) {
      const x = this.X(s);
      // as many decimals as the step needs (a short side road steps by 50 m: 0.05, 0.10, …)
      g.fillText(kstep >= 1000 ? `${(s / 1000).toFixed(0)} km` : `${(s / 1000).toFixed(kstep >= 100 ? 1 : kstep >= 10 ? 2 : 3)}`, x, H - 6);
      g.strokeStyle = 'rgba(0,0,0,0.07)'; g.beginPath(); g.moveTo(x, T); g.lineTo(x, B); g.stroke();
    }
    g.textAlign = 'right';
    const zstep = niceStep((this.zr.hi - this.zr.lo) / 5);
    for (let z = Math.ceil(this.zr.lo / zstep) * zstep; z <= this.zr.hi; z += zstep) {
      const y = this.Y(z);
      if (y > B - 4) continue;
      g.fillText(`${z.toFixed(0)}`, L - 6, y + 4);
      g.strokeStyle = 'rgba(0,0,0,0.07)'; g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke();
    }
    g.save(); g.translate(12, (T + B) / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText('height above sea, m', 0, 0); g.restore();
    const p = this.preview;
    if (p) {
      // The worker lags behind a drag: wash out the last result and show the moved route's ground
      // with the previous heights stretched over it until the evaluation catches up.
      g.save(); g.beginPath(); g.rect(L, T - 4, R - L, B - T + 4); g.clip();
      g.fillStyle = 'rgba(247,245,240,0.7)'; g.fillRect(L, T - 4, R - L, B - T + 4);
      const j0 = Math.max(0, Math.floor(this.v0 / p.ds) - 1), j1 = Math.min(p.s.length - 1, Math.ceil(this.v1 / p.ds) + 1);
      const line = (v: Float64Array) => { g.beginPath(); for (let j = j0; j <= j1; j++) { const x = this.X(p.s[j]), y = this.Y(v[j]); if (j === j0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); };
      g.strokeStyle = '#8a7148'; g.lineWidth = 1.5; line(p.ground);
      g.strokeStyle = '#1d232a'; g.lineWidth = 2; g.setLineDash([6, 4]); line(p.grade); g.setLineDash([]);
      g.font = '11px system-ui, sans-serif'; g.textAlign = 'left'; g.fillStyle = '#5a5040';
      g.fillText('computing…', L + 6, T + 12);
      g.restore();
    }
    // one line on how to change the road height in this mode
    const hints = this.mode === 'manual'
      ? ['By hand: drag a ◆ · double-click the line adds one · right-click deletes', 'drag a ◆']
      : ['drag the line up / down to pin a height', 'drag the line to pin'];
    // bottom left of the chart, over the ground (the floating bar sits over the selection)
    g.font = '11px system-ui, sans-serif'; g.textAlign = 'left';
    const hint = hints.find((t) => g.measureText(t).width < (R - L) * 0.7) ?? hints[hints.length - 1];
    // only while the mouse is over the profile (or before anything is selected): it would otherwise hide
    // the crossing / building marks along the bottom of the chart
    if (this.hoverClient || (!this.sel && this.pinStation === null && this.selCrossing === null)) {
      const hw = g.measureText(hint).width;
      g.fillStyle = 'rgba(247,245,240,0.8)'; g.fillRect(L + 2, B - 17, hw + 8, 15);
      g.fillStyle = this.mode === 'manual' ? '#1f5fbf' : '#555'; g.fillText(hint, L + 6, B - 6);
    }
    this.ev.onDraw?.();
  }

  /** road height at station s (linear between stations) */
  private gradeAt(s: number) {
    const r = this.r!;
    const a = Math.min(r.n - 2, Math.max(0, Math.floor(s / r.ds))), t = Math.max(0, Math.min(1, (s - r.s[a]) / r.ds));
    return r.grade[a] + t * (r.grade[a + 1] - r.grade[a]);
  }

  /** the plan's bends as numbered circles above the chart, like the markers on the map */
  private drawBends(g: CanvasRenderingContext2D, L: number, R: number) {
    const vis = this.bends.filter((b) => b.s >= this.v0 && b.s <= this.v1).sort((a, b) => a.s - b.s);
    const bot = this.bandT + BAND_H;
    g.save();
    g.beginPath(); g.rect(L - 10, 0, R - L + 20, bot); g.clip();
    // thin guides from each marker down through the chart to its curve in the band
    g.lineWidth = 1;
    for (const b of vis) {
      const x = Math.round(this.X(b.s)) + 0.5;
      const sel = b.i === this.selectedBend, hov = b.i === this.hoverBend;
      g.strokeStyle = sel ? '#b08d00' : hov ? 'rgba(0,0,0,0.6)' : 'rgba(29,35,42,0.16)';
      g.setLineDash(sel || hov ? [4, 3] : [2, 3]);
      g.beginPath(); g.moveTo(x, BEND_Y + 8); g.lineTo(x, bot); g.stroke();
    }
    g.setLineDash([]);
    g.font = 'bold 10px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // numbered like the map markers; a marker crowding the previous numbered one shrinks to a dot
    const full = new Set<number>();
    let lastX = -Infinity;
    for (const b of [...vis].sort((p, q) => p.s - q.s)) { const x = this.X(b.s); if (x - lastX >= 17) { full.add(b.i); lastX = x; } }
    // the hovered / selected ones last, on top
    const order = [...vis].sort((a, b) => Number(a.i === this.hoverBend || a.i === this.selectedBend) - Number(b.i === this.hoverBend || b.i === this.selectedBend));
    for (const b of order) {
      const x = this.X(b.s);
      const sel = b.i === this.selectedBend, hov = b.i === this.hoverBend;
      const rad = full.has(b.i) || sel || hov ? 8 : 4;
      g.beginPath(); g.arc(x, BEND_Y, rad, 0, 2 * Math.PI);
      g.fillStyle = sel ? '#ffd400' : hov ? '#fff3a8' : '#fff'; g.fill();
      g.strokeStyle = '#1d232a'; g.lineWidth = 1.8; g.stroke();
      if (rad === 8) { g.fillStyle = '#1d232a'; g.fillText(String(b.i + 1), x, BEND_Y + 0.5); }
    }
    g.restore();
    if (this.bends.length) {
      g.fillStyle = '#777'; g.font = '9px system-ui, sans-serif'; g.textAlign = 'right';
      g.fillText('bends', L - 6, BEND_Y + 3);
    }
  }

  /** "km x.xx" over the hover line when the mouse is on the map; an arrow at the edge when off view */
  private drawMapHoverLabel(g: CanvasRenderingContext2D, s: number, L: number, R: number, T: number) {
    const off = s < this.v0 ? -1 : s > this.v1 ? 1 : 0;
    const text = `${off < 0 ? '◀ ' : ''}km ${(s / 1000).toFixed(2)}${off > 0 ? ' ▶' : ''}`;
    g.save();
    g.font = 'bold 11px system-ui, sans-serif';
    const w = g.measureText(text).width + 10;
    const x = off < 0 ? L + 2 : off > 0 ? R - w - 2 : Math.max(L, Math.min(R - w, this.X(s) - w / 2));
    const y = T + 2;
    g.fillStyle = '#1d232a'; g.beginPath(); g.roundRect(x, y, w, 17, 4); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(text, x + 5, y + 9);
    g.restore();
  }

  /** band of alignment elements: tangents (light) and curves (dark, with radius) — click to select */
  private drawElements(g: CanvasRenderingContext2D, L: number, R: number) {
    const y = this.bandT;
    g.save();
    g.beginPath(); g.rect(L, y, R - L, BAND_H); g.clip();
    g.font = '9px system-ui, sans-serif';
    g.textAlign = 'center';
    for (const e of this.elements) {
      const a = this.X(e.s0), b = this.X(e.s1);
      if (b < L || a > R) continue;
      g.fillStyle = e.curve ? '#8fa3bd' : '#ddd6c6';
      g.fillRect(a + 0.5, y, Math.max(1, b - a - 1), BAND_H);
      if (e.curve && b - a > 34) { g.fillStyle = '#fff'; g.fillText(e.label, (a + b) / 2, y + BAND_H - 2.5); }
    }
    g.restore();
    g.fillStyle = '#777';
    g.font = '9px system-ui, sans-serif';
    g.textAlign = 'right';
    g.fillText('curves', L - 6, y + BAND_H - 2);
    // the element under the mouse is outlined: a click selects it
    if (this.under.kind === 'band') {
      const a = this.X(this.under.el.s0), b = this.X(this.under.el.s1);
      g.strokeStyle = '#1d232a'; g.lineWidth = 1.5;
      g.strokeRect(Math.max(L, a) + 0.5, y + 0.5, Math.min(R, b) - Math.max(L, a) - 1, BAND_H - 1);
    }
  }

  /**
   * Stacked cost per metre, one column per pixel, averaged over at least MIN_WINDOW metres. The
   * column height follows the square root of the cost (a demolished block costs 50× a plain
   * kilometre; on a linear scale everything else would vanish); within a column the components share
   * the height in proportion. Rendered to an offscreen canvas and reused until the view changes.
   */
  private drawStrip(g: CanvasRenderingContext2D, L: number, R: number) {
    const r = this.r!;
    const top = this.stripT, bot = this.stripB, h = bot - top;
    const nCol = Math.max(1, Math.floor(R - L));
    const dpr = window.devicePixelRatio || 1;
    const key = `${this.v0}|${this.v1}|${nCol}|${h}|${dpr}`;
    if (this.stripFor !== r || this.stripKey !== key) {
      this.stripFor = r; this.stripKey = key;
      const cv = this.stripCanvas;
      cv.width = Math.round(nCol * dpr); cv.height = Math.round(h * dpr);
      const sg = cv.getContext('2d')!;
      sg.setTransform(dpr, 0, 0, dpr, 0, 0);
      sg.fillStyle = '#efece4';
      sg.fillRect(0, 0, nCol, h);
      const nG = COST_GROUPS.length;
      const vals = new Float64Array(nCol * nG), tot = new Float64Array(nCol);
      const wPx = (this.v1 - this.v0) / (R - L);
      let max = 0;
      for (let c = 0; c < nCol; c++) {
        const s = this.S(L + c + 0.5);
        if (s < 0 || s > r.length) continue;
        const [a, b] = this.window(s, wPx);
        const len = this.cumLen[b + 1] - this.cumLen[a];
        for (let k = 0; k < nG; k++) {
          const v = (this.cum[k][b + 1] - this.cum[k][a]) / len;
          vals[c * nG + k] = v; tot[c] += v;
        }
        if (tot[c] > max) max = tot[c];
      }
      this.stripMax = max;
      // pixels per CZK/m in each column, then one pass per component (one fill style each)
      const scale = new Float64Array(nCol), y = new Float64Array(nCol).fill(h);
      for (let c = 0; c < nCol; c++) if (tot[c] > 0) scale[c] = (h * Math.sqrt(tot[c] / max)) / tot[c];
      for (let k = 0; k < nG; k++) {
        sg.fillStyle = COST_GROUPS[k].color;
        for (let c = 0; c < nCol; c++) {
          const dh = vals[c * nG + k] * scale[c];
          if (dh <= 0) continue;
          sg.fillRect(c, y[c] - dh, 1, dh);
          y[c] -= dh;
        }
      }
    }
    g.drawImage(this.stripCanvas, L, top, nCol, h);
    const max = this.stripMax;
    // guide lines at ¼ and 1/16 of the maximum (½ and ¼ of the height)
    g.strokeStyle = 'rgba(0,0,0,0.13)';
    g.lineWidth = 1;
    g.fillStyle = '#555';
    g.font = '10px system-ui, sans-serif';
    g.textAlign = 'right';
    for (const [f, label] of [[1, true], [0.5, true], [0.25, false]] as [number, boolean][]) {
      const y = Math.round(bot - h * f) + 0.5;
      if (f < 1) { g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke(); }
      if (label && max > 0) g.fillText(perM(max * f * f), L - 6, y + (f === 1 ? 9 : 3));
    }
    g.fillText('CZK/m', L - 6, bot);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.strokeRect(L + 0.5, top + 0.5, R - L - 1, h - 1);
  }

  /** tooltip: three short lines — where and what, the cost per metre, one notable thing */
  private updateTip() {
    const r = this.r, s = this.hoverS, at = this.hoverClient;
    if (!r || s === null || !at) { this.tip.style.display = 'none'; return; }
    const i = Math.max(0, Math.min(r.n - 1, Math.round(s / r.ds)));
    const hgt = r.grade[i] - r.ground[i];
    const k = r.kind[i];
    const how = k === KIND.bridge ? `bridge ${hgt.toFixed(0)} m high`
      : k === KIND.tunnel ? `tunnel ${(-hgt).toFixed(0)} m under ground`
        : hgt >= 0 ? `embankment ${hgt.toFixed(1)} m` : `cut ${(-hgt).toFixed(1)} m deep`;
    const wPx = (this.v1 - this.v0) / (this.W - this.pad.l - this.pad.r);
    const [a, b] = this.window(s, wPx);
    const len = this.cumLen[b + 1] - this.cumLen[a];
    let total = 0;
    const groups = COST_GROUPS.map((gr, gi) => { const v = (this.cum[gi][b + 1] - this.cum[gi][a]) / len; total += v; return [gr, v] as const; })
      .filter(([, v]) => v > 0.5).sort((p, q) => q[1] - p[1]).slice(0, 2);
    const facts: string[] = [];
    for (const x of r.crossings) if (x.i >= a && x.i <= b) facts.push(`${ROAD_CLASSES[x.cls].label}: ${crossingLabel(x)}`);
    for (const c of r.waterCrossings) if (c.i >= a && c.i <= b) facts.push(`${c.waterKind}: ${c.structure}`);
    let nb = 0;
    for (const d of r.demolished) if (d.i >= a && d.i <= b) nb++;
    if (nb) facts.push(`${nb} building${nb > 1 ? 's' : ''} demolished`);
    const v = r.violations.find((x) => !x.goal && x.s0 <= r.s[b] + r.ds && x.s1 >= r.s[a] - r.ds);
    const e = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const compact = this.under.kind === 'bend' || this.under.kind === 'vpi' || this.under.kind === 'pin';
    if (compact) this.tip.innerHTML = `<div class="tip-hint first">${this.hint()}</div>`;
    else this.tip.innerHTML = `<div><b>km ${(r.s[i] / 1000).toFixed(2)}</b> · ${how}</div>
      <div class="tip-sub"><b>${perM(total)} CZK/m</b> · ${groups.map(([gr, v]) => `<i style="background:${gr.color}"></i>${gr.short} ${perM(v)}`).join(' ')}</div>
      ${v ? `<div class="tip-bad">⚠ ${e(v.title)}</div>` : facts.length ? `<div class="tip-fact">${e(facts[0])}${facts.length > 1 ? ` +${facts.length - 1}` : ''}</div>` : ''}`;
    this.tip.style.display = '';
    // inside the profile, above the cursor (the map's spot it marks stays visible)
    const box = this.canvas.getBoundingClientRect();
    const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
    let left = at.x + 14;
    if (left + tw > box.right - 4) left = at.x - 14 - tw;
    this.tip.style.left = `${Math.max(box.left + 4, left)}px`;
    this.tip.style.top = `${Math.max(box.top + 2, at.y - th - 12)}px`;
  }

  /** what a click / drag does at the thing under the mouse (the tooltip over handles) */
  private hint(): string {
    const u = this.under, manual = this.mode === 'manual';
    switch (u.kind) {
      case 'vpi': { const v = this.vpis[u.k]; return v ? `<b>◆ ${v.z.toFixed(1)} m</b> · drag up / down${manual ? ' · right-click deletes' : ''}` : ''; }
      case 'bend': return `<b>Bend ${u.i + 1}</b> · click to select`;
      case 'pin': { const p = this.pins.find((q) => Math.abs(q.s - u.s) < 0.1); return `<b>Pinned ${p ? p.z.toFixed(1) : ''} m</b> · drag up / down · click for options`; }
      default: return '';
    }
  }

  /** the thing under a point of the canvas (CSS px) */
  private hit(px: number, py: number): Under {
    this.flush();
    const r = this.r;
    if (!r || px < this.pad.l - 10 || px > this.W - this.pad.r + 10) return { kind: 'none' };
    if (py < this.pad.t - 3) {
      let best: number | null = null, bd = 11;
      for (const b of this.bends) { const d = Math.abs(this.X(b.s) - px); if (d < bd) { bd = d; best = b.i; } }
      return best !== null ? { kind: 'bend', i: best } : { kind: 'chart' };
    }
    if (py > this.chartB + GAP_CHART / 2) {
      if (py <= this.bandT + BAND_H + GAP_BAND / 2) {
        const s = this.S(px);
        const el = this.elements.find((x) => s >= x.s0 && s <= x.s1);
        if (el) return { kind: 'band', el };
      }
      return { kind: 'strip' };
    }
    let k: number | null = null, bd = 10;
    if (this.mode === 'manual') this.vpis.forEach((v, j) => {
      if (j === 0 || j === this.vpis.length - 1) return;
      const d = Math.hypot(this.X(v.s) - px, this.Y(v.z) - py);
      if (d < bd) { bd = d; k = j; }
    });
    if (k !== null) return { kind: 'vpi', k };
    const pin = this.pins.find((p) => Math.abs(this.X(p.s) - px) < 8 && py > this.Y(p.z) - 23 && py < this.Y(p.z) + 4);
    if (pin) return { kind: 'pin', s: pin.s };
    // a crossed road's mark, unless the road line is nearer: zoomed out, the marks sit densely on the line
    // and would otherwise take every click meant for pinning (their radius shrinks there too)
    const s = this.S(px);
    const onLine = s > 20 && s < r.length - 20 ? Math.abs(this.Y(this.gradeAt(s)) - py) : Infinity;
    const reach = (this.v1 - this.v0) / Math.max(1, this.W - this.pad.l - this.pad.r) > 10 ? 4 : 8;
    let x: (typeof r.crossings)[number] | null = null, xd = reach;
    for (const c of r.crossings) {
      if (c.roadId === undefined) continue;
      const d = Math.hypot(this.X(c.s) - px, this.Y(r.grade[c.i] - c.h) - py);
      if (d < xd) { xd = d; x = c; }
    }
    if (x && xd <= onLine) return { kind: 'crossing', roadId: x.roadId! };
    if (onLine < 6) return { kind: 'line', s };
    return { kind: 'chart' };
  }

  /** a range snapped to whole station cells */
  private snap(sa: number, sb: number): StationRange {
    const r = this.r!;
    const lo = Math.max(0, Math.min(sa, sb)), hi = Math.min(r.length, Math.max(sa, sb));
    const a = Math.max(0, (Math.round(lo / r.ds) - 0.5) * r.ds), b = Math.min(r.length, (Math.round(hi / r.ds) + 0.5) * r.ds);
    return { s0: a, s1: b };
  }

  private setUnder(u: Under) {
    const prev = this.under;
    this.under = u;
    const bend = u.kind === 'bend' ? u.i : null;
    if ((prev.kind === 'bend' ? prev.i : null) !== bend) { this.hoverBend = bend; this.ev.onBendHover?.(bend); }
  }

  private install() {
    const c = this.canvas;
    const rel = (e: MouseEvent) => { const b = c.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    const cursor = (u: Under) => u.kind === 'vpi' || (u.kind === 'pin' && this.mode === 'auto') || (u.kind === 'line' && this.mode === 'auto') ? 'ns-resize'
      : u.kind === 'line' ? 'copy' : u.kind === 'none' ? 'default' : 'pointer';
    // 'press': a left button down on the chart / band / strip — a click if it does not move, else a range drag
    let drag: { mode: 'vpi' | 'pin' | 'pan' | 'press' | 'select' | 'line'; under: Under; i: number; x0: number; v0: number; v1: number; s0: number; moved: boolean; y0: number; dy: number } | null = null;
    c.addEventListener('pointerdown', (e) => {
      if (!this.r) return;
      const p = rel(e);
      const u = this.hit(p.x, p.y);
      const base = { under: u, i: -1, x0: p.x, y0: p.y, dy: 0, v0: this.v0, v1: this.v1, s0: this.S(p.x), moved: false };
      if (e.button === 2 && u.kind === 'vpi') { this.ev.onVpiDelete?.(u.k); return; }
      if (e.button === 1 || e.button === 2) {
        e.preventDefault();
        c.setPointerCapture(e.pointerId);
        drag = { ...base, mode: 'pan' };
        c.style.cursor = 'grabbing';
        return;
      }
      if (e.button !== 0) return;
      if (u.kind === 'bend') { this.ev.onBendSelect?.(u.i); return; }
      if (u.kind === 'pin' && this.mode === 'manual') { this.ev.onStationSelect?.(u.s); return; }
      if (u.kind === 'crossing') { this.ev.onCrossingSelect?.(u.roadId); return; }
      c.setPointerCapture(e.pointerId);
      if (u.kind === 'pin') {
        // keep the grab offset: the pin's point follows the mouse at the distance it was grabbed
        const pin = this.pins.find((q) => Math.abs(q.s - u.s) < 0.1)!;
        drag = { ...base, mode: 'pin', s0: u.s, dy: p.y - this.Y(pin.z) };
      } else if (u.kind === 'vpi') {
        drag = { ...base, mode: 'vpi', i: u.k };
        this.selected = u.k;
        this.ev.onVpiSelect?.(u.k);
        c.style.cursor = 'grabbing';
      } else drag = { ...base, mode: 'press' };
      this.draw();
      // the road line in Auto: dragging it up / down pins the height there (decided by the first move)
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.r) return;
      const p = rel(e);
      if (drag?.mode === 'vpi') {
        drag.moved = true;
        this.dragging = true;
        const prev = this.vpis[drag.i - 1].s, next = this.vpis[drag.i + 1].s;
        const s = Math.max(prev + 20, Math.min(next - 20, this.S(p.x)));
        const z = Math.round(this.Z(p.y) * 10) / 10;
        this.ev.onVpiDrag?.(drag.i, s, z);
        return;
      }
      if (drag?.mode === 'pin') {
        if (!drag.moved && Math.abs(p.y - drag.y0) < 3) return;
        drag.moved = true;
        this.dragging = true;
        const z = Math.round(this.Z(p.y - drag.dy) * 10) / 10, s0 = drag.s0;
        this.pins = this.pins.map((q) => (Math.abs(q.s - s0) < 0.1 ? { s: q.s, z } : q)); // at once, before the recompute
        this.draw();
        this.ev.onPinDrag?.(s0, z);
        return;
      }
      if (drag?.mode === 'pan') {
        const dx = p.x - drag.x0;
        if (Math.abs(dx) > 3) drag.moved = true;
        const span = drag.v1 - drag.v0;
        const ds = -(dx / (this.W - this.pad.l - this.pad.r)) * span;
        this.v0 = Math.max(0, Math.min(this.r.length - span, drag.v0 + ds));
        this.v1 = this.v0 + span;
        this.draw();
        this.ev.onView?.();
        return;
      }
      const s = this.S(p.x);
      if (drag?.mode === 'press' && drag.under.kind === 'line' && this.mode === 'auto' && Math.abs(p.y - drag.y0) > 3 && Math.abs(p.y - drag.y0) > Math.abs(p.x - drag.x0)) {
        drag.mode = 'line';
        drag.s0 = Math.round(drag.under.s);
        drag.dy = drag.y0 - this.Y(this.gradeAt(drag.s0));
      }
      if (drag?.mode === 'line') {
        drag.moved = true;
        this.dragging = true;
        const z = Math.round(this.Z(p.y - drag.dy) * 10) / 10, s0 = drag.s0;
        this.pins = [...this.pins.filter((q) => Math.abs(q.s - s0) >= 0.1), { s: s0, z }];
        this.draw();
        this.ev.onLineDrag?.(s0, z);
        c.style.cursor = 'ns-resize';
        return;
      }
      if (drag?.mode === 'press' && Math.abs(p.x - drag.x0) > 4) drag.mode = 'select';
      if (drag?.mode === 'select') {
        drag.moved = true;
        this.ev.onSelect?.(this.snap(drag.s0, s));
        c.style.cursor = 'col-resize';
      } else {
        this.setUnder(this.hit(p.x, p.y));
        c.style.cursor = cursor(this.under);
      }
      this.hoverS = s >= 0 && s <= this.r.length ? s : null;
      this.hoverFromMap = false;
      this.hoverClient = { x: e.clientX, y: e.clientY };
      const u = this.under;
      if (u.kind === 'vpi') this.ev.onHover?.(this.vpis[u.k].s, `◆ height point ${u.k} · ${this.vpis[u.k].z.toFixed(1)} m`);
      else this.ev.onHover?.(this.hoverS);
      this.draw();
      this.updateTip();
    });
    const end = (e: PointerEvent) => {
      const d = drag;
      drag = null;
      this.dragging = false;
      if (!d || !this.r) return;
      if (d.mode === 'vpi' && d.moved) this.ev.onVpiDragEnd?.();
      if (d.mode === 'pin') { if (d.moved) this.ev.onPinDragEnd?.(); else this.ev.onStationSelect?.(d.s0); }
      if (d.mode === 'line') { this.ev.onPinDragEnd?.(); this.ev.onStationSelect?.(d.s0); }
      if (d.mode === 'press' && e.type === 'pointerup') {
        const u = d.under;
        if (u.kind === 'band') {
          // a click picks the straight / curve; clicking it again clears the selection
          const pick = this.snap(u.el.s0, u.el.s1);
          const same = this.sel && Math.abs(this.sel.s0 - pick.s0) < 1 && Math.abs(this.sel.s1 - pick.s1) < 1;
          this.ev.onSelect?.(same ? null : pick);
        } else {
          if (this.selected !== null) { this.selected = null; this.ev.onVpiSelect?.(null); }
          this.ev.onPick?.(Math.max(0, Math.min(this.r.length, d.s0)));
        }
      }
      const p = rel(e);
      this.setUnder(this.hit(p.x, p.y));
      c.style.cursor = cursor(this.under);
      this.draw();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => {
      if (drag) return; // captured: the drag goes on
      this.setUnder({ kind: 'none' });
      this.hoverS = null; this.hoverClient = null; this.ev.onHover?.(null); this.draw(); this.updateTip();
    });
    c.addEventListener('wheel', (e) => {
      if (!this.r) return;
      e.preventDefault();
      const p = rel(e);
      const span0 = this.v1 - this.v0;
      // sideways scrolling (touchpad, Shift+wheel) scrolls along the route; plain wheel zooms at the mouse
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (sideways) {
        const ds = (sideways / (this.W - this.pad.l - this.pad.r)) * span0;
        this.v0 = Math.max(0, Math.min(this.r.length - span0, this.v0 + ds));
        this.v1 = this.v0 + span0;
      } else {
        const s = this.S(p.x);
        const span = Math.max(Math.min(MIN_SPAN, this.r.length), Math.min(this.r.length, span0 * Math.exp(e.deltaY * 0.0015)));
        const t = (s - this.v0) / span0;
        this.v0 = Math.max(0, Math.min(this.r.length - span, s - t * span));
        this.v1 = this.v0 + span;
        this.whole = span >= this.r.length;
      }
      this.draw();
      this.updateTip();
      this.ev.onView?.();
    }, { passive: false });
    c.addEventListener('dblclick', (e) => {
      if (!this.r || this.mode !== 'manual') return;
      const p = rel(e), u = this.hit(p.x, p.y);
      if (u.kind === 'line') this.ev.onVpiAdd?.(u.s, Math.round(this.gradeAt(u.s) * 10) / 10);
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('auxclick', (e) => e.preventDefault());
  }
}

function niceStep(x: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
