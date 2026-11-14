// Small, pickable annotations for explicit player decisions, separate from the route meshes.
import type { Design, Result } from '../core/evaluate';
import type { View } from './view';

export class BuildAnnotations {
  private points: { el: HTMLButtonElement; x: number; y: number; z: number }[] = [];
  onPin?: (s: number) => void;
  constructor(private view: View, private overlay: HTMLElement) {
    const prev = view.onRender;
    view.onRender = () => { prev?.(); this.position(); };
  }
  setResult(r: Result, d: Design) {
    for (const p of this.points) p.el.remove();
    this.points = [];
    for (const pin of d.gradePins ?? []) {
      if (pin.s > r.length) continue;
      const i = Math.min(r.n - 2, Math.max(0, Math.floor(pin.s / r.ds)));
      const t = (pin.s - r.s[i]) / r.ds;
      const x = r.x[i] + t * (r.x[i + 1] - r.x[i]), y = r.y[i] + t * (r.y[i + 1] - r.y[i]);
      this.add(x, y, Math.max(pin.z, r.ground[i]) + 5, '●', 'grade-pin',
        `Pinned grade ${pin.z.toFixed(1)} m at km ${(pin.s / 1000).toFixed(3)}${d.profileMode === 'manual' ? ' (inactive in Manual)' : ''}`,
        () => this.onPin?.(pin.s));
    }
    this.position();
  }
  private add(x: number, y: number, z: number, text: string, cls: string, title: string, click: () => void) {
    const el = document.createElement('button');
    el.className = `build-annotation ${cls}`; el.textContent = text; el.title = title;
    el.onpointerdown = (e) => e.stopPropagation();
    el.onclick = (e) => { e.stopPropagation(); click(); };
    this.overlay.appendChild(el); this.points.push({ el, x, y, z });
  }
  private position() {
    for (const p of this.points) {
      const q = this.view.project(p.x, p.y, p.z);
      p.el.hidden = !q.vis;
      p.el.style.left = `${q.sx}px`; p.el.style.top = `${q.sy}px`;
    }
  }
}
