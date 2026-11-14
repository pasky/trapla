// Longitudinal profile panel (2D canvas): terrain, grade line with VPIs and vertical curves,
// cut/fill areas, bridges, tunnels, crossings, violations; below it, on the same horizontal scale,
// the alignment elements (tangents / curves) and a stacked "cost per metre" strip. VPIs are
// draggable; hovering shows the cost split at that station; dragging in the strip (or Shift+drag
// anywhere) selects a station range, clicking an alignment element selects that element.

import { cellLength, PART_KEYS, type PartKey } from '../core/cost';
import { ROAD_CLASSES } from '../core/data/urban';
import type { Result } from '../core/evaluate';
import { crossingLabel } from '../core/crossings';
import { groundDescription } from '../core/ground';
import { KIND } from '../core/structures';
import type { StructureOverride } from '../core/overrides';
import type { WallOverride } from '../core/build-controls';
import type { VPI } from '../core/vertical';
import type { StationRange } from '../state';
import { COST_GROUPS, czk, perM } from './costgroups';

export interface ProfileEvents {
  onVpiDrag?: (i: number, s: number, z: number) => void;
  onVpiDragEnd?: () => void;
  onVpiAdd?: (s: number, z: number) => void;
  onVpiDelete?: (i: number) => void;
  onVpiSelect?: (i: number | null) => void;
  onHover?: (s: number | null) => void;
  onStationSelect?: (s: number) => void;
  onCrossingSelect?: (roadId: number) => void;
  /** a station range was picked for the cost breakdown (null = whole route) */
  onSelect?: (r: StationRange | null) => void;
}

/** the cost strip never averages over less than this, so lump sums (buildings, junctions) stay readable, m */
const MIN_WINDOW = 50;
const BAND_H = 11, STRIP_H = 54, GAP_CHART = 6, GAP_BAND = 3;

interface Element { s0: number; s1: number; curve: boolean; label: string }

export class ProfilePanel {
  private ctx: CanvasRenderingContext2D;
  private r: Result | null = null;
  private vpis: VPI[] = [];
  private overrides: readonly StructureOverride[] = [];
  private pins: readonly { s: number; z: number }[] = [];
  private wallOverrides: readonly WallOverride[] = [];
  private pinStation: number | null = null;
  private v0 = 0;
  private v1 = 1;
  /** the view shows the whole route (and keeps doing so when the route's length changes) */
  private whole = true;
  private hoverS: number | null = null;
  private hoverClient: { x: number; y: number } | null = null;
  private selected: number | null = null;
  private flash: { s0: number; s1: number } | null = null;
  private sel: StationRange | null = null;
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
    // legend of the cost strip, next to the profile legend
    const bar = canvas.parentElement?.querySelector('.profile-bar');
    if (bar && !bar.querySelector('.cost-legend')) {
      const el = document.createElement('span');
      el.className = 'cost-legend';
      el.innerHTML = '<b>Cost per metre</b>' + COST_GROUPS.map((g) => `<span class="sw" style="background:${g.color}"></span>${g.short}`).join('');
      bar.insertBefore(el, bar.querySelector('button'));
    }
    this.install();
  }

  setResult(r: Result, vpis: VPI[], overrides: readonly StructureOverride[] = [], pins: readonly { s: number; z: number }[] = [], walls: readonly WallOverride[] = []) {
    this.overrides = overrides;
    this.pins = pins;
    this.wallOverrides = walls;
    this.r = r;
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
    this.updateTip();
  }

  select(i: number | null) { this.selected = i; this.draw(); }
  selectStation(s: number | null) { this.pinStation = s; this.draw(); }

  /** show the selected station range (set by the owner of the selection state) */
  setSelection(r: StationRange | null) { this.sel = r; this.draw(); }

  /** visible station range (diagnostics) */
  get view() { return { v0: this.v0, v1: this.v1 }; }

  fit() { this.whole = true; if (this.r) { this.v0 = 0; this.v1 = this.r.length; } this.draw(); }

  focus(s0: number, s1: number) {
    if (!this.r) return;
    const span = Math.max(1500, (s1 - s0) * 3);
    const c = (s0 + s1) / 2;
    this.v0 = Math.max(0, c - span / 2);
    this.v1 = Math.min(this.r.length, this.v0 + span);
    this.whole = this.v1 - this.v0 >= this.r.length;
    this.flash = { s0, s1 };
    this.draw();
  }

  setHover(s: number | null) { this.hoverS = s; this.draw(); }

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

  draw() {
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
    if (!r) return;
    // visible station range and elevation range
    const i0 = Math.max(0, Math.floor(this.v0 / r.ds) - 1), i1 = Math.min(r.n - 1, Math.ceil(this.v1 / r.ds) + 1);
    let lo = Infinity, hi = -Infinity;
    for (let i = i0; i <= i1; i++) {
      lo = Math.min(lo, r.ground[i], r.grade[i]);
      hi = Math.max(hi, r.ground[i], r.grade[i]);
    }
    for (const v of [...this.vpis, ...this.pins]) if (v.s >= this.v0 && v.s <= this.v1) { lo = Math.min(lo, v.z); hi = Math.max(hi, v.z); }
    const m = Math.max(8, (hi - lo) * 0.08);
    this.zr = { lo: lo - m, hi: hi + m };
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
    // ground
    g.beginPath();
    g.moveTo(this.X(r.s[i0]), B);
    for (let i = i0; i <= i1; i++) g.lineTo(this.X(r.s[i]), this.Y(r.ground[i]));
    g.lineTo(this.X(r.s[i1]), B);
    g.closePath();
    g.fillStyle = '#e3d6bb';
    g.fill();
    // cut / fill between grade and ground
    for (let i = i0; i < i1; i++) {
      if (r.kind[i] !== KIND.earth || r.kind[i + 1] !== KIND.earth) continue;
      const h0 = r.grade[i] - r.ground[i], h1 = r.grade[i + 1] - r.ground[i + 1];
      g.fillStyle = h0 + h1 > 0 ? 'rgba(110,160,60,0.55)' : 'rgba(215,140,50,0.6)';
      g.beginPath();
      g.moveTo(this.X(r.s[i]), this.Y(r.ground[i]));
      g.lineTo(this.X(r.s[i + 1]), this.Y(r.ground[i + 1]));
      g.lineTo(this.X(r.s[i + 1]), this.Y(r.grade[i + 1]));
      g.lineTo(this.X(r.s[i]), this.Y(r.grade[i]));
      g.closePath();
      g.fill();
    }
    g.strokeStyle = '#8a7148';
    g.lineWidth = 1.2;
    g.beginPath();
    for (let i = i0; i <= i1; i++) { const x = this.X(r.s[i]), y = this.Y(r.ground[i]); if (i === i0) g.moveTo(x, y); else g.lineTo(x, y); }
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
    for (let i = i0; i < i1; i++) {
      g.strokeStyle = bad[i] ? '#e01e1e' : r.kind[i] === KIND.bridge ? '#2f6fcf' : r.kind[i] === KIND.tunnel ? '#7a4fc0' : '#222';
      if (r.kind[i] === KIND.tunnel) g.setLineDash([6, 4]); else g.setLineDash([]);
      g.beginPath(); g.moveTo(this.X(r.s[i]), this.Y(r.grade[i])); g.lineTo(this.X(r.s[i + 1]), this.Y(r.grade[i + 1])); g.stroke();
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
      if (b - a > 24) g.fillText(['E', 'B', 'T'][o.kind] + ' manual', a + 3, y + 15, b - a - 5);
    }
    for (const o of this.wallOverrides) {
      const a = this.X(Math.max(this.v0, o.s0)), b = this.X(Math.min(this.v1, r.length, o.s1));
      if (b <= a) continue;
      const y = this.pad.t + (o.side === 'L' ? 30 : 46);
      g.strokeStyle = g.fillStyle = o.height ? '#087575' : '#c12d80';
      g.lineWidth = 2; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(a, y); g.lineTo(b, y); g.stroke();
      g.font = 'bold 10px system-ui'; g.textAlign = 'left';
      if (b - a > 20) g.fillText(`${o.side} ${o.height ? `wall ${o.height} m` : 'no wall'}`, a + 2, y + 11, b - a - 4);
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
      g.beginPath(); g.rect(px - hw, yr - hh, 2 * hw, 2 * hh); g.fill(); g.stroke();
      if (x.type === 'overbridge') { g.beginPath(); g.moveTo(px - 8, yr); g.lineTo(px + 8, yr); g.lineWidth = 2.5; g.stroke(); }
    }
    // demolished buildings: red squares on the ground
    g.fillStyle = '#d7301f';
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
    for (let k = 0; k < this.vpis.length - 1; k++) {
      const a = this.X(this.vpis[k].s), b = this.X(this.vpis[k + 1].s);
      if (b - a < 46 || b < L || a > R) continue;
      const gr = r.grades[k] ?? 0;
      const ym = this.Y((this.vpis[k].z + this.vpis[k + 1].z) / 2);
      g.fillStyle = Math.abs(gr) > 0.06 + 1e-6 ? '#d00' : '#333';
      g.fillText(`${(gr * 100).toFixed(1)} %`, (a + b) / 2, ym - 8);
    }
    // Requested pin elevations are drawn separately from the realised grade, including failures.
    for (const pin of this.pins) {
      if (pin.s < this.v0 || pin.s > this.v1) continue;
      const x = this.X(pin.s), y = this.Y(pin.z);
      g.strokeStyle = '#b45800'; g.fillStyle = '#ffb339'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, y + 8); g.lineTo(x, y - 5); g.stroke();
      g.beginPath(); g.arc(x, y - 5, 4, 0, 2 * Math.PI); g.fill(); g.stroke();
      g.fillStyle = '#864000'; g.fillText(`pin ${pin.z.toFixed(1)}`, x, y - 15);
    }
    if (this.pinStation !== null) {
      g.strokeStyle = '#b45800'; g.setLineDash([3, 4]);
      const x = this.X(this.pinStation);
      g.beginPath(); g.moveTo(x, T); g.lineTo(x, B); g.stroke(); g.setLineDash([]);
    }
    // VPIs
    this.vpis.forEach((v, k) => {
      const x = this.X(v.s), y = this.Y(v.z);
      const end = k === 0 || k === this.vpis.length - 1;
      g.beginPath();
      if (end) g.rect(x - 4, y - 4, 8, 8); else g.arc(x, y, k === this.selected ? 6.5 : 5, 0, Math.PI * 2);
      g.fillStyle = k === this.selected ? '#ffd400' : '#fff';
      g.fill();
      g.strokeStyle = '#222';
      g.lineWidth = 1.5;
      g.stroke();
    });
    g.restore();

    this.drawElements(g, L, R);
    this.drawStrip(g, L, R);

    // selected range and hover line span the chart and the strip
    g.save();
    g.beginPath(); g.rect(L, T - 4, R - L, this.stripB - T + 4); g.clip();
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
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, T); g.lineTo(x, this.stripB); g.stroke();
    }
    g.restore();
    // axes
    g.fillStyle = '#555';
    g.font = '11px system-ui, sans-serif';
    g.textAlign = 'center';
    const span = this.v1 - this.v0;
    const kstep = niceStep(span / 8);
    for (let s = Math.ceil(this.v0 / kstep) * kstep; s <= this.v1; s += kstep) {
      const x = this.X(s);
      g.fillText(kstep >= 1000 ? `${(s / 1000).toFixed(0)} km` : `${(s / 1000).toFixed(1)}`, x, H - 6);
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
    g.save(); g.translate(12, (T + B) / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText('elevation m (Bpv)', 0, 0); g.restore();
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
    if (!this.sel) {
      g.fillStyle = 'rgba(0,0,0,0.42)';
      g.textAlign = 'right';
      g.fillText('drag here to select a stretch · click a curve / tangent above', R - 6, top + 11);
    }
  }

  /** tooltip: key facts and the cost split at the hovered station */
  private updateTip() {
    const r = this.r, s = this.hoverS, at = this.hoverClient;
    if (!r || s === null || !at) { this.tip.style.display = 'none'; return; }
    const i = Math.max(0, Math.min(r.n - 1, Math.round(s / r.ds)));
    const hgt = r.grade[i] - r.ground[i];
    const k = r.kind[i];
    const how = k === KIND.bridge ? `bridge, ${hgt.toFixed(1)} m above the ground`
      : k === KIND.tunnel ? `tunnel, ${(-hgt).toFixed(1)} m below the ground`
        : hgt >= 0 ? `embankment ${hgt.toFixed(1)} m high` : `cut ${(-hgt).toFixed(1)} m deep`;
    const u = r.cell.urban[i], f = r.cell.forest[i];
    const land = [u > 0.02 ? `built-up area${u < 0.98 ? ` ${(u * 100).toFixed(0)} %` : ''}` : '', f > 0.02 ? `forest${f < 0.98 ? ` ${(f * 100).toFixed(0)} %` : ''}` : '']
      .filter(Boolean).join(', ') || 'open land';
    const wPx = (this.v1 - this.v0) / (this.W - this.pad.l - this.pad.r);
    const [a, b] = this.window(s, wPx);
    const len = this.cumLen[b + 1] - this.cumLen[a];
    const facts: string[] = [];
    const geology = groundDescription(r.geology.profiles[r.geology.ids[i]]);
    // Pack names can come from service attributes; do not interpolate them as HTML.
    const escapedGeology = geology.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    for (const o of this.wallOverrides) if (s >= o.s0 && s <= o.s1) facts.push(`player ${o.side === 'L' ? 'left' : 'right'} wall: ${o.height ? `${o.height} m` : 'removed'} (clear to restore Auto)`);
    for (const w of r.walls) {
      if (i >= w.i0 && i <= w.i1) facts.push(`noise wall: ${w.side === 'L' ? 'left' : 'right'}, ${w.height} m high (provisional)`);
    }
    for (const x of r.crossings) {
      if (x.i < a || x.i > b) continue;
      const row = ROAD_CLASSES[x.cls];
      facts.push(`crosses a ${row.label} (${x.h >= 0 ? '+' : '−'}${Math.abs(x.h).toFixed(1)} m): ${crossingLabel(x)}${x.cost > 0 ? ` — ${czk(x.cost)}` : ''}`);
    }
    let nb = 0, cb = 0;
    for (const d of r.demolished) if (d.i >= a && d.i <= b) { nb++; cb += d.cost; }
    if (nb) facts.push(`${nb} footprint demolition${nb > 1 ? 's' : ''} — ${czk(cb)}`);
    let nBuy = 0, cBuy = 0;
    for (const d of r.boughtOut) if (d.i >= a && d.i <= b) { nBuy++; cBuy += d.cost; }
    if (nBuy) facts.push(`${nBuy} off-corridor buyout${nBuy > 1 ? 's' : ''} — ${czk(cBuy)} (noise or player acquisition + demolition)`);
    for (const kept of r.kept) if (kept.i >= a && kept.i <= b) facts.push(`kept building #${kept.j}${kept.hit ? ': footprint conflict' : ''}`);
    let total = 0;
    const rows = COST_GROUPS.map((gr, gi) => {
      const v = (this.cum[gi][b + 1] - this.cum[gi][a]) / len;
      total += v;
      if (!(v > 0.5)) return '';
      let detail = '';
      if (gr.id === 'earthworks') {
        const names: [PartKey, string][] = [['excavation', 'excavation'], ['fillPlacing', 'fill'], ['borrow', 'bought fill'], ['haul', 'haul'], ['surplusHaul', 'surplus to tip'], ['unsuitable', 'unsuitable to tip'], ['topsoil', 'topsoil'], ['geotechnical', 'geotechnical'], ['culverts', 'culverts']];
        detail = names.map(([key, name]) => [name, (this.cumKey[key][b + 1] - this.cumKey[key][a]) / len] as [string, number])
          .filter((p) => p[1] > 0.5).sort((p, q) => q[1] - p[1]).slice(0, 3).map((p) => `${p[0]} ${perM(p[1])}`).join(', ');
      }
      return `<tr><td><i style="background:${gr.color}"></i>${gr.label}${detail ? `<small>${detail}</small>` : ''}</td><td>${perM(v)}</td></tr>`;
    }).join('');
    this.tip.innerHTML = `<div class="tip-h"><b>km ${(r.s[i] / 1000).toFixed(2)}</b> · ${how}</div>
      <div class="tip-sub">ground ${r.ground[i].toFixed(1)} m · grade ${r.grade[i].toFixed(1)} m · ${land}</div>
      <div class="tip-fact">${escapedGeology}</div>
      ${facts.map((t) => `<div class="tip-fact">${t}</div>`).join('')}
      <table>${rows}<tr class="tip-total"><td>Cost per metre <small>average over ${len.toFixed(0)} m</small></td><td>${perM(total)} CZK</td></tr></table>`;
    this.tip.style.display = '';
    // above the panel, next to the cursor; never over the profile itself
    const box = this.canvas.getBoundingClientRect();
    const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
    let left = at.x + 14;
    if (left + tw > box.right - 4) left = at.x - 14 - tw;
    this.tip.style.left = `${Math.max(4, left)}px`;
    this.tip.style.top = `${Math.max(4, box.top - 30 - th)}px`;
  }

  private hitVpi(px: number, py: number): number | null {
    let best: number | null = null, bd = 10;
    this.vpis.forEach((v, k) => {
      const d = Math.hypot(this.X(v.s) - px, this.Y(v.z) - py);
      if (d < bd) { bd = d; best = k; }
    });
    return best;
  }

  /** a range snapped to whole station cells */
  private snap(sa: number, sb: number): StationRange {
    const r = this.r!;
    const lo = Math.max(0, Math.min(sa, sb)), hi = Math.min(r.length, Math.max(sa, sb));
    const a = Math.max(0, (Math.round(lo / r.ds) - 0.5) * r.ds), b = Math.min(r.length, (Math.round(hi / r.ds) + 0.5) * r.ds);
    return { s0: a, s1: b };
  }

  private install() {
    const c = this.canvas;
    const rel = (e: MouseEvent) => { const b = c.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    const inCost = (y: number) => y > this.chartB + GAP_CHART / 2;
    let drag: { mode: 'vpi' | 'pan' | 'select'; i: number; x0: number; v0: number; v1: number; s0: number; moved: boolean } | null = null;
    c.addEventListener('pointerdown', (e) => {
      if (!this.r) return;
      const p = rel(e);
      const k = inCost(p.y) ? null : this.hitVpi(p.x, p.y);
      if (e.altKey && e.button === 0 && !inCost(p.y)) {
        const s = Math.max(0, Math.min(this.r.length, Math.round(this.S(p.x))));
        const existing = this.pins.find((pin) => Math.abs(this.X(pin.s) - p.x) < 8);
        this.ev.onStationSelect?.(existing?.s ?? s);
        return;
      }
      if (e.button === 0 && !e.shiftKey && !inCost(p.y) && k === null) {
        const crossing = this.r.crossings.find((c) => c.roadId !== undefined && Math.hypot(this.X(c.s) - p.x, this.Y(this.r!.grade[c.i] - c.h) - p.y) < 8);
        if (crossing) { this.ev.onCrossingSelect?.(crossing.roadId!); return; }
      }
      if (e.button === 2) {
        if (k !== null && k > 0 && k < this.vpis.length - 1) this.ev.onVpiDelete?.(k);
        return;
      }
      c.setPointerCapture(e.pointerId);
      const base = { i: -1, x0: p.x, v0: this.v0, v1: this.v1, s0: this.S(p.x), moved: false };
      if (inCost(p.y) || e.shiftKey) {
        drag = { ...base, mode: 'select' };
      } else if (k !== null && k > 0 && k < this.vpis.length - 1) {
        drag = { ...base, mode: 'vpi', i: k };
        this.selected = k;
        this.ev.onVpiSelect?.(k);
      } else {
        drag = { ...base, mode: 'pan' };
      }
      this.draw();
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.r) return;
      const p = rel(e);
      if (drag?.mode === 'vpi') {
        drag.moved = true;
        const prev = this.vpis[drag.i - 1].s, next = this.vpis[drag.i + 1].s;
        const s = Math.max(prev + 20, Math.min(next - 20, this.S(p.x)));
        const z = Math.round(this.Z(p.y) * 10) / 10;
        this.ev.onVpiDrag?.(drag.i, s, z);
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
        return;
      }
      const s = this.S(p.x);
      if (drag?.mode === 'select') {
        if (Math.abs(p.x - drag.x0) > 3) drag.moved = true;
        if (drag.moved) this.ev.onSelect?.(this.snap(drag.s0, s));
      }
      this.hoverS = s >= 0 && s <= this.r.length ? s : null;
      this.hoverClient = { x: e.clientX, y: e.clientY };
      c.style.cursor = inCost(p.y) || e.shiftKey ? 'col-resize' : this.hitVpi(p.x, p.y) !== null ? 'grab' : 'crosshair';
      this.ev.onHover?.(this.hoverS);
      this.draw();
      this.updateTip();
    });
    const end = () => {
      if (drag?.mode === 'vpi' && drag.moved) this.ev.onVpiDragEnd?.();
      if (drag?.mode === 'pan' && !drag.moved) { this.selected = null; this.ev.onVpiSelect?.(null); }
      if (drag?.mode === 'select' && !drag.moved && this.r) {
        // a click picks the tangent / curve under the cursor; clicking it again clears the selection
        const s = drag.s0;
        const el = this.elements.find((x) => s >= x.s0 && s <= x.s1);
        if (el) {
          const pick = this.snap(el.s0, el.s1);
          const same = this.sel && Math.abs(this.sel.s0 - pick.s0) < 1 && Math.abs(this.sel.s1 - pick.s1) < 1;
          this.ev.onSelect?.(same ? null : pick);
        }
      }
      drag = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => { this.hoverS = null; this.hoverClient = null; this.ev.onHover?.(null); this.draw(); this.updateTip(); });
    c.addEventListener('dblclick', (e) => {
      if (!this.r) return;
      const p = rel(e);
      if (inCost(p.y) || e.altKey) return;
      if (this.hitVpi(p.x, p.y) !== null) return;
      const s = this.S(p.x);
      if (s <= 20 || s >= this.r.length - 20) return;
      this.ev.onVpiAdd?.(s, Math.round(this.Z(p.y) * 10) / 10);
    });
    c.addEventListener('wheel', (e) => {
      if (!this.r) return;
      e.preventDefault();
      const p = rel(e);
      const s = this.S(p.x);
      const f = Math.exp(e.deltaY * 0.0015);
      const span = Math.max(300, Math.min(this.r.length, (this.v1 - this.v0) * f));
      const t = (s - this.v0) / (this.v1 - this.v0);
      this.v0 = Math.max(0, Math.min(this.r.length - span, s - t * span));
      this.v1 = this.v0 + span;
      this.whole = span >= this.r.length;
      this.draw();
      this.updateTip();
    }, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}

function niceStep(x: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
