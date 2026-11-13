// Longitudinal profile panel (2D canvas): terrain, grade line with VPIs and vertical curves,
// cut/fill areas, bridges, tunnels, violations. VPIs are draggable.

import type { Result } from '../core/evaluate';
import { KIND } from '../core/structures';
import type { VPI } from '../core/vertical';

export interface ProfileEvents {
  onVpiDrag?: (i: number, s: number, z: number) => void;
  onVpiDragEnd?: () => void;
  onVpiAdd?: (s: number, z: number) => void;
  onVpiDelete?: (i: number) => void;
  onVpiSelect?: (i: number | null) => void;
  onHover?: (s: number | null) => void;
}

export class ProfilePanel {
  private ctx: CanvasRenderingContext2D;
  private r: Result | null = null;
  private vpis: VPI[] = [];
  private v0 = 0;
  private v1 = 1;
  private fitted = false;
  private hoverS: number | null = null;
  private selected: number | null = null;
  private flash: { s0: number; s1: number } | null = null;
  private zr = { lo: 0, hi: 1 };
  private pad = { l: 52, r: 14, t: 26, b: 22 };
  ev: ProfileEvents = {};

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.draw()).observe(canvas);
    this.install();
  }

  setResult(r: Result, vpis: VPI[]) {
    const lenChanged = !this.r || Math.abs(this.r.length - r.length) > 1;
    this.r = r;
    this.vpis = vpis;
    if (!this.fitted || lenChanged && this.v1 - this.v0 >= (this.r?.length ?? 0) * 0.98) this.fit();
    this.draw();
  }

  select(i: number | null) { this.selected = i; this.draw(); }

  fit() { if (this.r) { this.v0 = 0; this.v1 = this.r.length; this.fitted = true; } this.draw(); }

  focus(s0: number, s1: number) {
    if (!this.r) return;
    const span = Math.max(1500, (s1 - s0) * 3);
    const c = (s0 + s1) / 2;
    this.v0 = Math.max(0, c - span / 2);
    this.v1 = Math.min(this.r.length, this.v0 + span);
    this.flash = { s0, s1 };
    this.draw();
  }

  setHover(s: number | null) { this.hoverS = s; this.draw(); }

  // ---- coordinate transforms ----
  private get W() { return this.canvas.clientWidth; }
  private get H() { return this.canvas.clientHeight; }
  private X(s: number) { return this.pad.l + ((s - this.v0) / (this.v1 - this.v0)) * (this.W - this.pad.l - this.pad.r); }
  private S(px: number) { return this.v0 + ((px - this.pad.l) / (this.W - this.pad.l - this.pad.r)) * (this.v1 - this.v0); }
  private Y(z: number) { return this.pad.t + (1 - (z - this.zr.lo) / (this.zr.hi - this.zr.lo)) * (this.H - this.pad.t - this.pad.b); }
  private Z(py: number) { return this.zr.lo + (1 - (py - this.pad.t) / (this.H - this.pad.t - this.pad.b)) * (this.zr.hi - this.zr.lo); }

  draw() {
    const c = this.canvas, dpr = window.devicePixelRatio || 1;
    const W = this.W, H = this.H;
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
    for (const v of this.vpis) if (v.s >= this.v0 && v.s <= this.v1) { lo = Math.min(lo, v.z); hi = Math.max(hi, v.z); }
    const m = Math.max(8, (hi - lo) * 0.08);
    this.zr = { lo: lo - m, hi: hi + m };
    const L = this.pad.l, R = W - this.pad.r, T = this.pad.t, B = H - this.pad.b;
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
    // hover
    if (this.hoverS !== null && this.hoverS >= this.v0 && this.hoverS <= this.v1) {
      const i = Math.max(0, Math.min(r.n - 1, Math.round(this.hoverS / r.ds)));
      const x = this.X(r.s[i]);
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, T); g.lineTo(x, B); g.stroke();
      const h = r.grade[i] - r.ground[i];
      const txt = `km ${(r.s[i] / 1000).toFixed(2)} · ground ${r.ground[i].toFixed(1)} · grade ${r.grade[i].toFixed(1)} m · ${h >= 0 ? 'fill' : 'cut'} ${Math.abs(h).toFixed(1)} m` +
        (r.kind[i] === KIND.bridge ? ' · bridge' : r.kind[i] === KIND.tunnel ? ' · tunnel' : '');
      g.font = '12px system-ui, sans-serif';
      const tw = g.measureText(txt).width + 12;
      const bx = Math.min(R - tw, Math.max(L, x + 8));
      g.fillStyle = 'rgba(255,255,255,0.92)';
      g.fillRect(bx, T + 2, tw, 18);
      g.fillStyle = '#111';
      g.textAlign = 'left';
      g.fillText(txt, bx + 6, T + 15);
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
      g.fillText(`${z.toFixed(0)}`, L - 6, y + 4);
      g.strokeStyle = 'rgba(0,0,0,0.07)'; g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke();
    }
    g.save(); g.translate(12, (T + B) / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText('elevation m (Bpv)', 0, 0); g.restore();
  }

  private hitVpi(px: number, py: number): number | null {
    let best: number | null = null, bd = 10;
    this.vpis.forEach((v, k) => {
      const d = Math.hypot(this.X(v.s) - px, this.Y(v.z) - py);
      if (d < bd) { bd = d; best = k; }
    });
    return best;
  }

  private install() {
    const c = this.canvas;
    const rel = (e: MouseEvent) => { const b = c.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    let drag: { mode: 'vpi' | 'pan'; i: number; x0: number; v0: number; v1: number; moved: boolean } | null = null;
    c.addEventListener('pointerdown', (e) => {
      if (!this.r) return;
      const p = rel(e);
      const k = this.hitVpi(p.x, p.y);
      if (e.button === 2) {
        if (k !== null && k > 0 && k < this.vpis.length - 1) this.ev.onVpiDelete?.(k);
        return;
      }
      c.setPointerCapture(e.pointerId);
      if (k !== null && k > 0 && k < this.vpis.length - 1) {
        drag = { mode: 'vpi', i: k, x0: p.x, v0: this.v0, v1: this.v1, moved: false };
        this.selected = k;
        this.ev.onVpiSelect?.(k);
      } else {
        drag = { mode: 'pan', i: -1, x0: p.x, v0: this.v0, v1: this.v1, moved: false };
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
      this.hoverS = s >= 0 && s <= this.r.length ? s : null;
      c.style.cursor = this.hitVpi(p.x, p.y) !== null ? 'grab' : 'crosshair';
      this.ev.onHover?.(this.hoverS);
      this.draw();
    });
    const end = () => {
      if (drag?.mode === 'vpi' && drag.moved) this.ev.onVpiDragEnd?.();
      if (drag?.mode === 'pan' && !drag.moved) { this.selected = null; this.ev.onVpiSelect?.(null); }
      drag = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => { this.hoverS = null; this.ev.onHover?.(null); this.draw(); });
    c.addEventListener('dblclick', (e) => {
      if (!this.r) return;
      const p = rel(e);
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
      this.draw();
    }, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}

function niceStep(x: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
