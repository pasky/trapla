// On-map editing of the selected bend's curve: two grips at the arc ends (drag along the leg), a live
// radius label with "max" (largest radius that fits) and "auto", mouse wheel on the bend / grips / label,
// and the + / − keys. Works on a main-thread copy of the alignment (cheap) so it is in step with the drag;
// all changes go through the store, so the HUD radius field, undo/redo and persistence stay in sync.

import './curve-edit.css';
import { horizontalViolations } from '../core/checks';
import { horizontalRules } from '../core/data/norms';
import type { Design, Result } from '../core/evaluate';
import { buildAlignment, pointAt, type Alignment, type PI, type Vec2 } from '../core/horizontal';
import type { Terrain } from '../core/terrain';
import type { View } from '../render/view';

export interface CurveEditHost {
  a: Vec2;
  b: Vec2;
  design(): Design;
  selected(): number | null;
  result(): Result | null;
  /** set the radius of bend i (null = auto); `commit` = one undo step now, otherwise call commit() later */
  setRadius(i: number, r: number | null, commit: boolean): void;
  commit(): void;
}

const R_MIN = 20, R_MAX = 30000;
const num = (v: number) => Math.round(v).toLocaleString('en-US');
const snap = (r: number) => Math.min(R_MAX, Math.max(R_MIN, r >= 400 ? Math.round(r / 5) * 5 : Math.round(r)));

/**
 * Largest radius for bend i that adds no horizontal violation (none involving the bend, and no more in
 * total than with its automatic radius); null if even the automatic radius does not fit.
 */
export function maxRadiusThatFits(a: Vec2, b: Vec2, pis: PI[], i: number, speed: number): number | null {
  const rules = horizontalRules(speed);
  const viol = (r: number | null) => {
    const al = buildAlignment(a, b, pis.map((p, k) => (k === i ? { ...p, r } : p)), rules);
    return { al, v: horizontalViolations(al, speed) };
  };
  const base = viol(null);
  const c0 = base.al.curves[i];
  if (!c0 || c0.unit < 0 || base.v.some((x) => x.pis?.includes(i))) return null;
  const fits = (r: number) => { const { v } = viol(r); return v.length <= base.v.length && !v.some((x) => x.pis?.includes(i)); };
  let lo = Math.max(c0.rEff, rules.minRadius);
  if (!fits(lo)) return null;
  let hi = lo;
  while (hi < R_MAX) {
    hi = Math.min(R_MAX, hi * 1.12);
    if (!fits(hi)) break;
    lo = hi;
  }
  if (lo >= R_MAX) return R_MAX;
  for (let it = 0; it < 24 && hi - lo > 0.5; it++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
  const r = lo >= 400 ? Math.floor(lo / 5) * 5 : Math.floor(lo);
  return fits(r) ? r : Math.floor(lo);
}

export class CurveEditor {
  private grips: HTMLElement[] = [];
  private label: HTMLElement;
  private text: HTMLElement;
  private sub: HTMLElement;
  private maxBtn: HTMLButtonElement;
  private autoBtn: HTMLButtonElement;
  private al: Alignment | null = null;
  /** world anchors of the two grips and the label, and the screen direction helper for the label */
  private anchors: { x: number; y: number; z: number }[] = [];
  private inward: { x: number; y: number } = { x: 0, y: 1 };
  private shown = false;
  private dragging = false;
  private commitTimer: number | null = null;

  constructor(private view: View, overlay: HTMLElement, private terrain: Terrain, private host: CurveEditHost) {
    for (const side of [0, 1]) {
      const g = document.createElement('div');
      g.className = 'rgrip';
      g.title = 'Drag along the leg to change the radius (mouse wheel and + / − work too)';
      g.style.display = 'none';
      overlay.appendChild(g);
      this.grips.push(g);
      g.addEventListener('pointerdown', (e) => this.startDrag(e, side as 0 | 1));
    }
    this.label = document.createElement('div');
    this.label.className = 'rlabel';
    this.label.style.display = 'none';
    this.label.innerHTML = '<b></b><small></small><button class="rmax" title="Largest radius that fits between the neighbouring bends">max</button><button class="rauto" title="Back to the automatic radius (the smallest the rules allow)">auto</button>';
    overlay.appendChild(this.label);
    this.text = this.label.querySelector('b')!;
    this.sub = this.label.querySelector('small')!;
    this.maxBtn = this.label.querySelector('.rmax')!;
    this.autoBtn = this.label.querySelector('.rauto')!;
    this.maxBtn.onclick = () => this.toMax();
    this.autoBtn.onclick = () => this.toAuto();
    // wheel over the selected bend, a grip or the label changes the radius instead of zooming the map
    overlay.addEventListener('wheel', (e) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.pi.sel, .rgrip, .rlabel') || !this.curve()) return;
      e.preventDefault();
      this.scale(Math.exp(-Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) * 0.0005));
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey || !this.curve()) return;
      if (e.key === '+' || e.key === '=') this.scale(1.05);
      else if (e.key === '-' || e.key === '_') this.scale(1 / 1.05);
      else return;
      e.preventDefault();
    });
    const prev = view.onRender;
    view.onRender = () => { prev?.(); this.place(); };
  }

  /** the selected bend's curve, if it has an arc */
  private curve() {
    const i = this.host.selected();
    const c = i === null || !this.al ? undefined : this.al.curves[i];
    return c && c.unit >= 0 && c.arcLen > 0 ? c : undefined;
  }

  /** elevation to draw a handle at: the grade line if the current result matches, else the ground */
  private zAt(x: number, y: number, s: number) {
    const r = this.host.result();
    if (r && this.al && Math.abs(r.length - this.al.length) < 0.5) {
      const k = Math.max(0, Math.min(r.n - 1, Math.round(s / r.ds)));
      return Math.max(r.grade[k], r.ground[k]) + 1.5;
    }
    return this.terrain.heightAt(x, y);
  }

  /** call whenever the design, the selection or the result changed */
  refresh() {
    const d = this.host.design(), i = this.host.selected();
    this.al = i === null ? null : buildAlignment(this.host.a, this.host.b, d.pis, horizontalRules(d.speed));
    const info = i === null || !this.al ? undefined : this.al.curves[i];
    this.shown = !!info;
    if (!info || !this.al || i === null) { this.place(); return; }
    const c = this.curve();
    const at = (s: number) => { const p = pointAt(this.al!, s); return { x: p.x, y: p.y, z: this.zAt(p.x, p.y, s) }; };
    if (c) {
      const mid = pointAt(this.al, (c.sStart + c.sEnd) / 2);
      this.inward = { x: -mid.ty * c.dir, y: mid.tx * c.dir };
      this.anchors = [at(c.sStart), at(c.sEnd), at((c.sStart + c.sEnd) / 2)];
      const u = this.al.units[c.unit];
      const manual = d.pis[i].r !== null;
      this.text.textContent = `R ${num(c.rEff)} m`;
      const parts: string[] = [];
      if (c.rEff < c.r - 0.5) parts.push(`wanted ${num(c.r)} m — no room`);
      if (u.last > u.first) parts.push(`one curve with bend${u.last - u.first > 1 ? 's' : ''} ${listOthers(u.first, u.last, i)}`);
      if (u.maxOffset > 0.5) parts.push(`up to ${u.maxOffset.toFixed(1)} m off the dashed polygon`);
      this.sub.textContent = [manual ? 'set by you' : 'auto', ...parts].join(' · ');
      this.autoBtn.disabled = !manual;
      this.maxBtn.style.display = this.autoBtn.style.display = '';
    } else {
      // no arc of its own: say why
      this.anchors = [{ x: info.x, y: info.y, z: this.terrain.heightAt(info.x, info.y) }];
      this.inward = { x: 0, y: 1 };
      this.text.textContent = info.tooSharp ? 'U-turn' : info.ignored ? 'left out' : 'no bend';
      this.sub.textContent = info.tooSharp ? 'no curve fits a turn this sharp'
        : info.ignored ? `it only wiggles against its neighbours and no S-curve fits here: the road passes ${info.offset.toFixed(1)} m beside it`
          : 'the point lies on a straight line';
      this.maxBtn.style.display = this.autoBtn.style.display = 'none';
    }
    this.place();
    this.view.requestRender();
  }

  /** position the DOM handles (after every render) */
  private place() {
    const c = this.shown ? this.curve() : undefined;
    const i = this.host.selected();
    const piAt = this.shown && i !== null && this.al ? this.al.curves[i] : null;
    const pi = piAt ? this.view.project(piAt.x, piAt.y, this.terrain.heightAt(piAt.x, piAt.y)) : null;
    this.grips.forEach((g, k) => {
      const a = c ? this.anchors[k] : null;
      const s = a ? this.view.project(a.x, a.y, a.z) : null;
      // too close to the bend's own marker they would only get in the way of dragging it
      const show = !!s && s.vis && (this.dragging || !pi || Math.hypot(s.sx - pi.sx, s.sy - pi.sy) > 17);
      g.style.display = show ? '' : 'none';
      if (show && s) g.style.transform = `translate(${s.sx.toFixed(1)}px, ${s.sy.toFixed(1)}px) rotate(45deg)`;
    });
    const a = this.shown ? this.anchors[this.anchors.length - 1] : null;
    const s = a ? this.view.project(a.x, a.y, a.z) : null;
    if (!a || !s || !s.vis) { this.label.style.display = 'none'; return; }
    // towards the inside of the curve, away from the bend's marker
    const t = this.view.project(a.x + this.inward.x * 40, a.y + this.inward.y * 40, a.z);
    let dx = t.sx - s.sx, dy = t.sy - s.sy;
    const L = Math.hypot(dx, dy);
    if (L > 1e-3) { dx /= L; dy /= L; } else { dx = 0; dy = 1; }
    const h = this.label.offsetHeight || 40, w = this.label.offsetWidth || 160;
    const off = 16 + Math.abs(dx) * (w / 2) + Math.abs(dy) * (h / 2);
    this.label.style.display = '';
    this.label.style.transform = `translate(${(s.sx + dx * off).toFixed(1)}px, ${(s.sy + dy * off).toFixed(1)}px) translate(-50%, -50%)`;
  }

  private startDrag(e: PointerEvent, side: 0 | 1) {
    const c = this.curve(), i = this.host.selected();
    if (!c || i === null || !this.al || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const g = this.grips[side];
    // direction of the polygon leg the grip slides on, pointing away from the bend
    const p = pointAt(this.al, side === 0 ? c.sStart : c.sEnd);
    const ux = side === 0 ? -p.tx : p.tx, uy = side === 0 ? -p.ty : p.ty;
    const tan = Math.tan(c.delta / 2);
    const t0 = c.rEff * tan;
    const along = (ev: PointerEvent) => { const q = this.view.pick(ev.clientX, ev.clientY); return q ? (q.x - c.x) * ux + (q.y - c.y) * uy : null; };
    const a0 = along(e);
    if (a0 === null) return;
    this.flushCommit();
    this.dragging = true;
    g.classList.add('drag');
    this.view.controls.enabled = false;
    g.setPointerCapture(e.pointerId);
    let moved = false;
    const move = (ev: PointerEvent) => {
      const a1 = along(ev);
      if (a1 === null) return;
      const r = snap(Math.max(1, t0 + a1 - a0) / tan);
      if (r === this.host.design().pis[i]?.r) return;
      moved = true;
      this.host.setRadius(i, r, false);
    };
    const up = () => {
      g.removeEventListener('pointermove', move);
      g.removeEventListener('pointerup', up);
      g.removeEventListener('pointercancel', up);
      g.classList.remove('drag');
      this.view.controls.enabled = true;
      this.dragging = false;
      if (moved) this.host.commit();
      this.place();
    };
    g.addEventListener('pointermove', move);
    g.addEventListener('pointerup', up);
    g.addEventListener('pointercancel', up);
  }

  /** wheel / keys: scale the radius; a burst of steps becomes one undo step */
  private scale(f: number) {
    const c = this.curve(), i = this.host.selected();
    if (!c || i === null) return;
    let r = snap(c.rEff * f);
    if (r === snap(c.rEff)) r = snap(c.rEff + (f > 1 ? 5 : -5));
    this.host.setRadius(i, r, false);
    if (this.commitTimer !== null) clearTimeout(this.commitTimer);
    this.commitTimer = window.setTimeout(() => this.flushCommit(), 500);
  }

  private flushCommit() {
    if (this.commitTimer === null) return;
    clearTimeout(this.commitTimer);
    this.commitTimer = null;
    this.host.commit();
  }

  /** largest radius that fits, for the selected bend (also on the debug API) */
  maxRadius(i = this.host.selected()): number | null {
    const d = this.host.design();
    return i === null || !d.pis[i] ? null : maxRadiusThatFits(this.host.a, this.host.b, d.pis, i, d.speed);
  }

  private toMax() {
    const i = this.host.selected();
    if (i === null || !this.curve()) return;
    this.flushCommit();
    const r = this.maxRadius(i);
    if (r === null) { this.sub.textContent = 'no radius fits here — see the violations'; return; }
    this.host.setRadius(i, r, true);
  }

  private toAuto() {
    const i = this.host.selected();
    if (i === null || this.host.design().pis[i]?.r === null) return;
    this.flushCommit();
    this.host.setRadius(i, null, true);
  }
}

function listOthers(first: number, last: number, self: number): string {
  const others: number[] = [];
  for (let k = first; k <= last; k++) if (k !== self) others.push(k + 1);
  if (others.length <= 2) return others.join(' and ');
  // runs of three or more consecutive numbers as ranges
  const out: string[] = [];
  for (let k = 0; k < others.length; k++) {
    let j = k;
    while (j + 1 < others.length && others[j + 1] === others[j] + 1) j++;
    if (j - k >= 2) { out.push(`${others[k]}–${others[j]}`); k = j; } else out.push(String(others[k]));
  }
  return out.join(', ');
}
