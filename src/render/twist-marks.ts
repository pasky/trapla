// The twists on the map (ui/twists.ts): each listed monument with its ring, each heritage area (filled, named on hover),
// each curveball's place, drawn on the ground over everything else (an SVG over the 3D view, placed every frame); red
// where our line breaks it, pulsing while it is news.
import './twist-marks.css';
import type { View } from './view';
import { inside, shapeRings, type Shape } from '../core/twists';

export interface TwistMark {
  id: string;
  shape: Shape;
  /** the label: a landmark's name, a place's few words */
  label: string;
  /** landmark: a monument and its ring; heritage: a heritage area (a protection zone, a reserve); zone: a curveball's place */
  kind: 'landmark' | 'heritage' | 'zone';
  /** broken: our line breaks its rule; fresh: news that just came in */
  state: 'ok' | 'broken';
  fresh?: boolean;
  /** where the label and the dot stand (a landmark itself; a place's middle) */
  at: { x: number; y: number };
}

/** an outline is cut this far in front of the camera, as a share of its distance to what it looks at (nearer, a point
 * projects far off the screen: a huge shape to fill) */
const NEAR_SHARE = 0.25;
const rank = (m: TwistMark) => (m.fresh ? 2 : 0) + (m.state === 'broken' ? 1 : 0);
/** the outlines every ≤ 15 m, so they follow the ground */
function outline(shape: Shape): { x: number; y: number }[][] {
  if (shape.kind === 'circle') {
    const n = Math.max(24, Math.min(160, Math.ceil(2 * Math.PI * shape.r / 15)));
    return [Array.from({ length: n + 1 }, (_, k) => ({ x: shape.x + shape.r * Math.cos(2 * Math.PI * k / n), y: shape.y + shape.r * Math.sin(2 * Math.PI * k / n) }))];
  }
  return shapeRings(shape).map(p => {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i <= p.length; i++) {
      const [x1, y1] = p[i % p.length];
      if (i > 0) {
        const [x0, y0] = p[i - 1], m = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 15);
        for (let k = 1; k < m; k++) out.push({ x: x0 + (x1 - x0) * k / m, y: y0 + (y1 - y0) * k / m });
      }
      out.push({ x: x1, y: y1 });
    }
    return out;
  });
}

export class TwistMarks {
  private svg: SVGSVGElement;
  private items: { mark: TwistMark; rings: { x: number; y: number; z: number }[][]; path: SVGPathElement; dot: SVGCircleElement; label: HTMLElement; z: number }[] = [];
  onClick?: (id: string) => void;
  /** the name of what is under the pointer (a heritage area's, a ring's) */
  private tip: HTMLElement;
  private pending: { x: number; y: number } | null = null;

  constructor(private view: View, private overlay: HTMLElement, private heightAt: (x: number, y: number) => number) {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('twist-marks');
    overlay.prepend(this.svg);
    view.addRenderListener(() => { this.place(); if (this.tip.style.display !== 'none' && this.tipView !== this.placedFor) this.hideTip(); });
    this.tip = document.createElement('div');
    this.tip.className = 'map-tip twist-tip';
    this.tip.style.display = 'none';
    document.body.append(this.tip);
    const canvas = view.renderer.domElement;
    canvas.addEventListener('pointermove', (e) => {
      if (e.buttons || !this.items.length) { this.hideTip(); return; }
      if (!this.pending) requestAnimationFrame(() => this.hover());
      this.pending = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerleave', () => { this.pending = null; this.hideTip(); });
    canvas.addEventListener('pointerdown', () => this.hideTip());
  }

  /** the camera the shown tip was shown for: it goes when the view moves */
  private tipView = '';
  private hideTip() { this.tip.style.display = 'none'; }
  private hover() {
    const p = this.pending;
    this.pending = null;
    if (!p) return;
    const g = this.view.pick(p.x, p.y);
    // (the smallest place under the pointer: a ring inside a zone names the ring)
    const under = g ? this.items.filter(it => inside(it.mark.shape, g.x, g.y)).sort((a, b) => size(a.mark.shape) - size(b.mark.shape))[0] : undefined;
    if (!under) { this.hideTip(); return; }
    this.tip.textContent = under.mark.label;
    this.tip.style.display = '';
    this.tip.style.left = `${Math.min(window.innerWidth - this.tip.offsetWidth - 8, p.x + 14)}px`;
    this.tip.style.top = `${Math.min(window.innerHeight - this.tip.offsetHeight - 8, p.y + 16)}px`;
    this.tipView = this.placedFor;
  }

  /** the camera the marks were last placed for: a frame with the same one (a drag's preview redrawing the road) skips them */
  private placedFor = '';

  set(marks: readonly TwistMark[]) {
    for (const it of this.items) { it.path.remove(); it.dot.remove(); it.label.remove(); }
    this.items = marks.map(mark => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      path.setAttribute('class', `${mark.kind} ${mark.state}${mark.fresh ? ' fresh' : ''}`);
      dot.setAttribute('class', `${mark.kind} ${mark.state}`);
      this.svg.append(path, dot);
      const label = document.createElement('div');
      label.className = `twist-label ${mark.kind} ${mark.state}${mark.fresh ? ' fresh' : ''}`;
      label.textContent = mark.label;
      label.addEventListener('click', () => this.onClick?.(mark.id));
      this.overlay.append(label);
      const rings = outline(mark.shape).map(r => r.map(p => ({ ...p, z: this.heightAt(p.x, p.y) + 1 })));
      return { mark, rings, path, dot, label, z: this.heightAt(mark.at.x, mark.at.y) + 1 };
    });
    this.placedFor = '';
    this.place();
  }

  private place() {
    const c0 = this.view.camera, key = `${c0.matrixWorld.elements.join(',')}|${c0.projectionMatrix.elements[0]}|${this.view.world.scale.y}|${this.overlay.clientWidth}x${this.overlay.clientHeight}`;
    if (key === this.placedFor) return;
    this.placedFor = key;
    const mpp = this.view.metresPerPixel, taken: number[][] = [];
    // broken and new first: they keep their names when labels crowd
    const order = [...this.items].sort((a, b) => rank(b.mark) - rank(a.mark));
    for (const it of order) {
      let d = '';
      const NEAR = NEAR_SHARE * this.view.cameraDistance;
      for (const ring of it.rings) {
        // the outline clipped to what lies in front of the camera (also past its far plane: a zone reaching off the
        // view still fills), so it stays one closed shape
        const q = ring.map(p => this.view.project(p.x, p.y, p.z)), out: string[] = [];
        for (let i = 0; i < ring.length; i++) {
          const a = q[i], b = q[(i + 1) % ring.length];
          if (a.depth > NEAR) out.push(`${a.sx.toFixed(1)},${a.sy.toFixed(1)}`);
          if ((a.depth > NEAR) !== (b.depth > NEAR)) {
            const t = (NEAR - a.depth) / (b.depth - a.depth), p0 = ring[i], p1 = ring[(i + 1) % ring.length];
            const c = this.view.project(p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t, p0.z + (p1.z - p0.z) * t);
            out.push(`${c.sx.toFixed(1)},${c.sy.toFixed(1)}`);
          }
        }
        if (out.length > 1) d += `M${out.join('L')}Z`;
      }
      it.path.setAttribute('d', d);
      const c = this.view.project(it.mark.at.x, it.mark.at.y, it.z);
      // a monument's name only close up (its ring and dot from afar), a heritage area's on hover (and while broken), a
      // curveball's place always; never over another name
      const w = 6.2 * it.mark.label.length + 10, box = [c.sx, c.sy, c.sx + w, c.sy + 18];
      const show = c.vis && (rank(it.mark) > 0 || it.mark.kind === 'zone' || (it.mark.kind === 'landmark' && mpp < 6))
        && !taken.some(t => box[0] < t[2] && t[0] < box[2] && box[1] < t[3] && t[1] < box[3]);
      if (show) taken.push(box);
      it.dot.setAttribute('r', c.vis && it.mark.kind === 'landmark' ? '4' : '0');
      if (c.vis) { it.dot.setAttribute('cx', c.sx.toFixed(1)); it.dot.setAttribute('cy', c.sy.toFixed(1)); }
      it.label.style.display = show ? '' : 'none';
      if (show) it.label.style.transform = `translate(${c.sx.toFixed(1)}px, ${c.sy.toFixed(1)}px)`;
    }
  }
}

/** a shape's extent (to name the smallest of several under the pointer), m² */
function size(shape: Shape): number {
  if (shape.kind === 'circle') return Math.PI * shape.r * shape.r;
  return shapeRings(shape).reduce((a, p) => a + Math.abs(p.reduce((s, q, i) => { const o = p[(i + p.length - 1) % p.length]; return s + o[0] * q[1] - q[0] * o[1]; }, 0) / 2), 0);
}
