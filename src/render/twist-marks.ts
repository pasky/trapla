// The twists on the map (ui/twists.ts): each landmark with its ring, each curveball's place, drawn on the ground over
// everything else (an SVG over the 3D view, placed every frame); red where our line breaks it, pulsing while it is news.
import './twist-marks.css';
import type { View } from './view';
import type { Shape } from '../core/twists';

export interface TwistMark {
  id: string;
  shape: Shape;
  /** the label: a landmark's name, a place's few words */
  label: string;
  kind: 'landmark' | 'zone';
  /** broken: our line breaks its rule; fresh: news that just came in */
  state: 'ok' | 'broken';
  fresh?: boolean;
  /** where the label and the dot stand (a landmark itself; a place's middle) */
  at: { x: number; y: number };
}

const rank = (m: TwistMark) => (m.fresh ? 2 : 0) + (m.state === 'broken' ? 1 : 0);
/** the outline every ≤ 15 m, so it follows the ground */
function outline(shape: Shape): { x: number; y: number }[] {
  if (shape.kind === 'circle') {
    const n = Math.max(24, Math.min(160, Math.ceil(2 * Math.PI * shape.r / 15)));
    return Array.from({ length: n + 1 }, (_, k) => ({ x: shape.x + shape.r * Math.cos(2 * Math.PI * k / n), y: shape.y + shape.r * Math.sin(2 * Math.PI * k / n) }));
  }
  const out: { x: number; y: number }[] = [], p = shape.pts;
  for (let i = 0; i <= p.length; i++) {
    const [x1, y1] = p[i % p.length];
    if (i > 0) {
      const [x0, y0] = p[i - 1], m = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 15);
      for (let k = 1; k < m; k++) out.push({ x: x0 + (x1 - x0) * k / m, y: y0 + (y1 - y0) * k / m });
    }
    out.push({ x: x1, y: y1 });
  }
  return out;
}

export class TwistMarks {
  private svg: SVGSVGElement;
  private items: { mark: TwistMark; pts: { x: number; y: number; z: number }[]; path: SVGPathElement; dot: SVGCircleElement; label: HTMLElement; z: number }[] = [];
  onClick?: (id: string) => void;

  constructor(private view: View, private overlay: HTMLElement, private heightAt: (x: number, y: number) => number) {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('twist-marks');
    overlay.prepend(this.svg);
    view.addRenderListener(() => this.place());
  }

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
      const pts = outline(mark.shape).map(p => ({ ...p, z: this.heightAt(p.x, p.y) + 1 }));
      return { mark, pts, path, dot, label, z: this.heightAt(mark.at.x, mark.at.y) + 1 };
    });
    this.place();
  }

  private place() {
    const mpp = this.view.metresPerPixel, taken: number[][] = [];
    // broken and new first: they keep their names when labels crowd
    const order = [...this.items].sort((a, b) => rank(b.mark) - rank(a.mark));
    for (const it of order) {
      let d = '', open = false;
      for (const p of it.pts) {
        const q = this.view.project(p.x, p.y, p.z);
        if (!q.vis) { open = false; continue; }
        d += `${open ? 'L' : 'M'}${q.sx.toFixed(1)},${q.sy.toFixed(1)}`; open = true;
      }
      it.path.setAttribute('d', d);
      const c = this.view.project(it.mark.at.x, it.mark.at.y, it.z);
      // a landmark's name only close up (its ring and dot from afar), a place's always; never over another name
      const w = 6.2 * it.mark.label.length + 10, box = [c.sx, c.sy, c.sx + w, c.sy + 18];
      const show = c.vis && (rank(it.mark) > 0 || it.mark.kind === 'zone' || mpp < 6)
        && !taken.some(t => box[0] < t[2] && t[0] < box[2] && box[1] < t[3] && t[1] < box[3]);
      if (show) taken.push(box);
      it.dot.setAttribute('r', c.vis && it.mark.kind === 'landmark' ? '4' : '0');
      if (c.vis) { it.dot.setAttribute('cx', c.sx.toFixed(1)); it.dot.setAttribute('cy', c.sy.toFixed(1)); }
      it.label.style.display = show ? '' : 'none';
      if (show) it.label.style.transform = `translate(${c.sx.toFixed(1)}px, ${c.sy.toFixed(1)}px)`;
    }
  }
}
