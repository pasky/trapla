// Small, pickable annotations for explicit player decisions, separate from the route meshes.
import type { Design, Result } from '../core/evaluate';
import type { View } from './view';
import type { Pack } from '../scenario';
import { KIND } from '../core/structures';

export class BuildAnnotations {
  private points: { el: HTMLButtonElement; x: number; y: number; z: number }[] = [];
  onPin?: (s: number) => void;
  onBuilding?: (j: number) => void;
  onCulvert?: (s: number) => void;
  private selectedBuilding: number | null = null;
  private current: { r: Result; d: Design } | null = null;
  constructor(private view: View, private overlay: HTMLElement, private pack: Pack) {
    const prev = view.onRender;
    view.onRender = () => { prev?.(); this.position(); };
  }
  private selectedCrossing: number | null = null;
  /** ring around the crossed road whose card is open */
  selectCrossing(roadId: number | null) { if (roadId === this.selectedCrossing) return; this.selectedCrossing = roadId; if (this.current) this.setResult(this.current.r, this.current.d); }
  selectBuilding(j: number | null) { if (j === this.selectedBuilding) return; this.selectedBuilding = j; if (this.current) this.setResult(this.current.r, this.current.d); }
  clear() {
    for (const point of this.points) point.el.remove(); this.points = [];
    this.current = null; this.selectedCrossing = this.selectedBuilding = null;
  }
  setResult(r: Result, d: Design) {
    this.current = { r, d };
    for (const p of this.points) p.el.remove();
    this.points = [];
    for (const pin of d.gradePins ?? []) {
      if (pin.s > r.length) continue;
      const i = Math.min(r.n - 2, Math.max(0, Math.floor(pin.s / r.ds)));
      const t = (pin.s - r.s[i]) / r.ds;
      const x = r.x[i] + t * (r.x[i + 1] - r.x[i]), y = r.y[i] + t * (r.y[i + 1] - r.y[i]);
      const grade = r.grade[i] + t * (r.grade[i + 1] - r.grade[i]);
      const anchor = r.kind[i] === KIND.tunnel ? this.pack.terrain.heightAt(x, y) : grade;
      this.add(x, y, anchor + .15, '●', 'grade-pin',
        `Pinned height ${pin.z.toFixed(1)} m`,
        () => this.onPin?.(pin.s));
    }
    for (const c of r.waterCrossings) if (c.structure === 'pipe' || c.structure === 'box') {
      this.add(c.x, c.y, c.bed + Math.max(c.h, 0) + 3, '○', 'culvert',
        `Culvert ${c.opening}, ${c.length.toFixed(0)} m`, () => this.onCulvert?.(c.s));
    }
    const xing = this.selectedCrossing === null ? undefined : r.crossings.find((c) => c.roadId === this.selectedCrossing);
    // (a cut and rerouted road is gone at the crossing: the mark stands on our road, not in the air above a cutting)
    const removed = xing && (xing.type === 'reconnection' || xing.type === 'diversion');
    if (xing) this.add(xing.x, xing.y, (removed ? r.grade[xing.i] : Math.max(r.grade[xing.i], r.grade[xing.i] - xing.h)) + 2, '', 'selected-crossing', 'Selected', () => {});
    const buildings = new Map<number, 'buy' | 'keep' | undefined>((d.buildingOverrides ?? []).map((o) => [o.j, o.action]));
    if (this.selectedBuilding !== null && !buildings.has(this.selectedBuilding)) buildings.set(this.selectedBuilding, undefined);
    for (const [j, action] of buildings) {
      const b = this.pack.overlays.buildings[j];
      if (!b) continue;
      this.add(b[0], b[1], this.pack.terrain.heightAt(b[0], b[1]) + 12,
        action === 'keep' ? 'KEEP' : action === 'buy' ? 'BOUGHT OUT' : '',
        action === 'keep' ? 'kept-building' : action === 'buy' ? 'bought-building' : 'selected-building',
        action === 'keep' ? 'You keep it' : action === 'buy' ? 'You buy it out' : 'Selected', () => this.onBuilding?.(j));
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
