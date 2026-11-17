// On-map editing of the selected bend's curve: two grips at the arc ends (drag along the leg), a live
// radius label with "max" (largest radius that fits) and "auto", and the + / − keys (the mouse wheel always
// zooms the map). Works on a main-thread copy of the alignment (cheap) so it is in step with the drag;
// all changes go through the store, so the HUD radius field, undo/redo and persistence stay in sync.

import './curve-edit.css';
import { bendRules, horizontalRules } from '../core/data/norms';
import type { Design, Result } from '../core/evaluate';
import { buildAlignment, pointAt, type Alignment, type Vec2 } from '../core/horizontal';
import { geometryPis } from '../core/design-speed';
import type { Terrain } from '../core/terrain';
import type { View } from '../render/view';
import { maxRadiusThatFits, snapRadius as snap } from './curve-fit';
import { bendNo } from './chainage';
import { stationIndex } from '../core/range';

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

const num = (v: number) => Math.round(v).toLocaleString('en-US');

export class CurveEditor {
  private grips: HTMLElement[] = [];
  private label: HTMLElement;
  private text: HTMLElement;
  private sub: HTMLElement;
  private warn: HTMLElement;
  private maxBtn: HTMLButtonElement;
  private autoBtn: HTMLButtonElement;
  private al: Alignment | null = null;
  /** world anchors of the two grips and the label, and the screen direction helper for the label */
  private anchors: { x: number; y: number; z: number }[] = [];
  private inward: { x: number; y: number } = { x: 0, y: 1 };
  private shown = false;
  /** grip drag in progress: its bend, the design as the drag last left it, and how to call it off */
  private drag: { i: number; design: string; abort: (restore: boolean) => void } | null = null;
  /** + / − key steps not yet committed as an undo step: the design they left behind */
  private pending: { timer: number; design: string } | null = null;
  /** true while this editor itself is changing the design */
  private own = false;

  constructor(private view: View, overlay: HTMLElement, private terrain: Terrain, private host: CurveEditHost) {
    for (const side of [0, 1]) {
      const g = document.createElement('div');
      g.className = 'rgrip';
      g.title = 'Drag along the leg to change the radius (+ / − work too)';
      g.style.display = 'none';
      overlay.appendChild(g);
      this.grips.push(g);
      g.addEventListener('pointerdown', (e) => this.startDrag(e, side as 0 | 1));
    }
    this.label = document.createElement('div');
    this.label.className = 'rlabel';
    this.label.style.display = 'none';
    this.label.innerHTML = '<b></b><small></small><em class="rviol"></em><button class="rmax" title="Largest radius that fits between the neighbouring bends">max</button><button class="rauto" title="Back to the automatic radius (the smallest the rules allow)">auto</button>';
    overlay.appendChild(this.label);
    this.text = this.label.querySelector('b')!;
    this.sub = this.label.querySelector('small')!;
    this.warn = this.label.querySelector('em')!;
    this.maxBtn = this.label.querySelector('.rmax')!;
    this.autoBtn = this.label.querySelector('.rauto')!;
    this.maxBtn.onclick = () => this.toMax();
    this.autoBtn.onclick = () => this.toAuto();
    const radiusKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey || !this.curve()) return 0;
      return e.key === '+' || e.key === '=' ? 1.05 : e.key === '-' || e.key === '_' ? 1 / 1.05 : 0;
    };
    window.addEventListener('keydown', (e) => {
      const f = radiusKey(e);
      if (!f) return;
      this.scale(f);
      e.preventDefault();
    });
    // anything else the player does (undo, a click, another key) first turns the pending steps into
    // their undo step, so that history is never rewritten behind an uncommitted change
    window.addEventListener('keydown', (e) => {
      // Esc while a grip is held cancels that drag and nothing else (not the selected range or bend)
      if (e.key === 'Escape' && this.drag) { this.drag.abort(true); e.stopImmediatePropagation(); e.preventDefault(); return; }
      if (!radiusKey(e) && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) this.flushCommit();
    }, true);
    window.addEventListener('pointerdown', () => this.flushCommit(), true);
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
      const k = stationIndex(r, s);
      return Math.max(r.grade[k], r.ground[k]) + 1.5;
    }
    return this.terrain.heightAt(x, y);
  }

  /** call whenever the design, the selection or the result changed */
  hide() { this.shown = false; this.al = null; this.anchors = []; this.place(); }

  refresh() {
    const d = this.host.design(), i = this.host.selected();
    // changes from elsewhere (undo, another edit, a replaced design) end what was in progress here
    if (!this.own && (this.pending || this.drag)) {
      const now = JSON.stringify(d);
      if (this.pending && now !== this.pending.design) { clearTimeout(this.pending.timer); this.pending = null; }
      // a replaced design is someone else's now; a mere change of selection (Esc) cancels the drag
      if (this.drag && now !== this.drag.design) this.drag.abort(false);
      else if (this.drag && i !== this.drag.i) this.drag.abort(true);
    }
    // (as built: a slowed stretch may keep a faster one's curves, core/evaluate.ts)
    const gpis = geometryPis(d.pis, this.host.result()?.geometrySpeeds?.length === d.pis.length ? this.host.result()!.geometrySpeeds : undefined);
    this.al = i === null ? null : buildAlignment(this.host.a, this.host.b, gpis, horizontalRules(d.speed, d.category), bendRules(gpis, d.speed, d.category));
    const info = i === null || !this.al ? undefined : this.al.curves[i];
    this.shown = !!info;
    if (!info || !this.al || i === null) { this.place(); return; }
    // the headline of the first violation the bend is involved in (as in the HUD list)
    const v = this.host.result()?.violations.find((x) => !x.goal && x.pis?.includes(i));
    this.warn.textContent = v ? `⚠ ${v.title}` : '';
    this.warn.title = v ? `${v.fix}${v.detail ? `\n\n${v.detail}` : ''}` : '';
    this.warn.style.display = v ? '' : 'none';
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
      if (u.maxOffset > 0.5) parts.push(`up to ${u.maxOffset.toFixed(1)} m off the straights between bends`);
      this.sub.textContent = [manual ? 'set by you' : 'auto', ...parts].join(' · ');
      this.autoBtn.disabled = !manual;
      this.maxBtn.style.display = this.autoBtn.style.display = '';
    } else {
      // no arc of its own: say why
      this.anchors = [{ x: info.x, y: info.y, z: this.terrain.heightAt(info.x, info.y) }];
      this.inward = { x: 0, y: 1 };
      this.text.textContent = info.tooSharp ? 'U-turn' : info.ignored ? 'left out' : 'no bend';
      this.sub.textContent = info.tooSharp ? 'no curve fits a turn this sharp'
        : info.ignored ? `it turns against its neighbour where no S-curve fits, and is only ${info.offset.toFixed(1)} m off the straight line between its neighbours: the road skips it`
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
      const show = !!s && s.vis && (!!this.drag || !pi || Math.hypot(s.sx - pi.sx, s.sy - pi.sy) > 17);
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
    // kept wholly in view (a bend near the map's edge must not cut its warning off), clear of the map's
    // bars along its top and its legend and credits along its bottom (drawn over the overlay)
    const box = this.label.parentElement, W = box?.clientWidth || Infinity, H = box?.clientHeight || Infinity, m = 4;
    const { top, bottom } = this.insets(box);
    const fit = (side: number) => {
      const x = s.sx + side * dx * off, y = s.sy + side * dy * off;
      const cx = Math.min(Math.max(x, w / 2 + m), Math.max(w / 2 + m, W - w / 2 - m));
      const cy = Math.min(Math.max(y, top + h / 2 + m), Math.max(top + h / 2 + m, H - bottom - h / 2 - m));
      return { cx, cy, moved: Math.hypot(cx - x, cy - y) };
    };
    // pushed back by an edge it would cover the bend's own marker: then on the bend's other side
    const inside = fit(1), outside = inside.moved > 1 ? fit(-1) : inside;
    const { cx, cy } = outside.moved < inside.moved ? outside : inside;
    this.label.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px) translate(-50%, -50%)`;
  }

  private bars: { at: number; top: number; bottom: number } | null = null;
  /** How far the map's own bars reach into the overlay from its top and bottom edge, px (measured at
   * most once a second: they change only with the window size and the active road's bar). */
  private insets(box: HTMLElement | null): { top: number; bottom: number } {
    const now = performance.now();
    if (this.bars && now - this.bars.at < 1000) return this.bars;
    const r = box?.getBoundingClientRect();
    let top = 0, bottom = 0;
    if (r) for (const el of box!.parentElement?.querySelectorAll<HTMLElement>(':scope > #brand, :scope > #editbar, :scope > #viewbar, :scope > .route-bar, :scope > #legend, :scope > #attrib, :scope > #noise-legend, :scope > #photo-note') ?? []) {
      const b = el.getBoundingClientRect();
      if (!b.height || b.height > r.height / 3) continue;
      if (b.top - r.top < r.height / 2) top = Math.max(top, b.bottom - r.top);
      else bottom = Math.max(bottom, r.bottom - b.top);
    }
    this.bars = { at: now, top, bottom };
    return this.bars;
  }

  private startDrag(e: PointerEvent, side: 0 | 1) {
    const c = this.curve(), i = this.host.selected();
    if (!c || i === null || !this.al || e.button !== 0 || this.drag) return;
    e.preventDefault();
    e.stopPropagation();
    const g = this.grips[side];
    const r0 = this.host.design().pis[i].r;
    // direction of the polygon leg the grip slides on, pointing away from the bend
    const p = pointAt(this.al, side === 0 ? c.sStart : c.sEnd);
    const ux = side === 0 ? -p.tx : p.tx, uy = side === 0 ? -p.ty : p.ty;
    const tan = Math.tan(c.delta / 2);
    const t0 = c.rEff * tan;
    const along = (ev: PointerEvent) => { const q = this.view.pick(ev.clientX, ev.clientY); return q ? (q.x - c.x) * ux + (q.y - c.y) * uy : null; };
    const a0 = along(e);
    if (a0 === null) return;
    this.flushCommit();
    g.classList.add('drag');
    this.view.controls.enabled = false;
    g.setPointerCapture(e.pointerId);
    let moved = false, active = true;
    const move = (ev: PointerEvent) => {
      if (!active || ev.pointerId !== e.pointerId) return;
      const a1 = along(ev);
      if (a1 === null) return;
      const r = snap(Math.max(1, t0 + a1 - a0) / tan);
      if (r === this.host.design().pis[i]?.r) return;
      moved = true;
      this.setRadius(i, r);
      mine.design = JSON.stringify(this.host.design());
    };
    /** how: commit the change as one undo step, restore the radius the drag started from, or just let go */
    const end = (how: 'commit' | 'restore' | 'drop') => {
      if (!active) return;
      active = false;
      if (this.drag === mine) this.drag = null;
      g.removeEventListener('pointermove', move);
      g.removeEventListener('pointerup', up);
      g.removeEventListener('pointercancel', up);
      if (g.hasPointerCapture(e.pointerId)) g.releasePointerCapture(e.pointerId);
      g.classList.remove('drag');
      this.view.controls.enabled = true;
      if (moved && how === 'commit') this.host.commit();
      else if (moved && how === 'restore') this.setRadius(i, r0);
      this.place();
    };
    const up = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) end('commit'); };
    // (refresh() calls abort when the selection or the design changes from elsewhere while the grip is held)
    const mine = { i, design: JSON.stringify(this.host.design()), abort: (restore: boolean) => end(restore ? 'restore' : 'drop') };
    this.drag = mine;
    g.addEventListener('pointermove', move);
    g.addEventListener('pointerup', up);
    g.addEventListener('pointercancel', up);
  }

  /** a transient (not yet committed) radius change made by this editor */
  private setRadius(i: number, r: number | null) {
    this.own = true;
    try { this.host.setRadius(i, r, false); } finally { this.own = false; }
  }

  /** + / − keys: scale the radius; a burst of steps becomes one undo step */
  private scale(f: number) {
    const c = this.curve(), i = this.host.selected();
    if (!c || i === null || this.drag) return;
    let r = snap(c.rEff * f);
    if (r === snap(c.rEff)) r = snap(c.rEff + (f > 1 ? 5 : -5));
    this.setRadius(i, r);
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = { timer: window.setTimeout(() => this.flushCommit(), 500), design: JSON.stringify(this.host.design()) };
  }

  /** commit the pending key steps now — unless the design has since been changed from elsewhere */
  private flushCommit() {
    const p = this.pending;
    if (!p) return;
    clearTimeout(p.timer);
    this.pending = null;
    if (JSON.stringify(this.host.design()) === p.design) this.host.commit();
  }

  /** largest radius that fits, for the selected bend (also on the debug API) */
  maxRadius(i = this.host.selected()): number | null {
    const d = this.host.design();
    return i === null || !d.pis[i] ? null : maxRadiusThatFits(this.host.a, this.host.b, d.pis, i, d.speed, d.category);
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
  for (let k = first; k <= last; k++) if (k !== self) others.push(bendNo(k));
  others.sort((a, b) => a - b);
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
