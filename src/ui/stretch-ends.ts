// A rebuilt stretch's two ends, drawn as handles while that road is active: drag one along the old road
// to rebuild more or less of it. The old road is highlighted while dragging; releasing applies one edit.
import type { RouteDesign, SourceInterval } from '../core/project';
import type { ProjectTransportIndex } from '../core/project-network';
import type { View } from '../render/view';
import { followSource, freeSpan } from './source-editor';
import { MIN_STRETCH } from './road-edit';

export class StretchEnds {
  private handles: HTMLButtonElement[] = [];
  private route: RouteDesign | null = null;
  /** the stretch while a handle is dragged (null: not dragging) */
  private moving: SourceInterval | null = null;
  onMove?: (routeId: string, s0: number, s1: number) => void;
  constructor(private overlay: HTMLElement, private view: View, private base: ProjectTransportIndex,
    private claimed: () => readonly { routeId: string; interval: SourceInterval }[]) {
    view.addRenderListener(() => this.position());
  }
  get dragging() { return !!this.moving; }
  /** Show the handles for this road if it is a rebuilt stretch, else none. */
  sync(route: RouteDesign | null) {
    const interval = route?.source?.intervals.length === 1 ? route.source.intervals[0] : null;
    if (this.moving) return;
    this.route = interval ? route : null;
    if (!this.route) { for (const h of this.handles) h.remove(); this.handles = []; return; }
    if (!this.handles.length) this.make();
    this.position();
  }
  private interval() { return this.moving ?? this.route?.source?.intervals[0] ?? null; }
  private make() {
    for (const [i, label] of ['Start', 'End'].entries()) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.className = 'source-endpoint stretch-end'; button.dataset.end = String(i);
      button.title = 'Drag along the old road to rebuild more or less of it';
      button.onpointerdown = event => {
        const route = this.route, start = route?.source?.intervals[0];
        if (event.button !== 0 || !route || !start) return;
        event.preventDefault(); event.stopPropagation(); button.setPointerCapture(event.pointerId);
        const enabled = this.view.controls.enabled; this.view.controls.enabled = false;
        const source = this.base.source(start.sourceId)!, length = source.stations[source.stations.length - 1];
        // never into a stretch another road rebuilds, nor off the map
        const others = this.claimed().filter(c => c.routeId !== route.id).map(c => c.interval);
        const span = freeSpan(others, this.base.transportData, start.sourceId, (start.s0 + start.s1) / 2, length) ?? { lo: start.s0, hi: start.s1 };
        for (const node of source.stations) if (!this.base.position(source.id, node)) {
          if (node < start.s0) span.lo = Math.max(span.lo, Math.min(start.s0, ...source.stations.filter(t => t > node && t <= start.s0)));
          else if (node > start.s1) span.hi = Math.min(span.hi, Math.max(start.s1, ...source.stations.filter(t => t < node && t >= start.s1)));
        }
        this.moving = { ...start };
        const move = (e: PointerEvent) => {
          const p = this.view.pick(e.clientX, e.clientY); if (!p || !this.moving) return;
          const s = followSource(source, span, p.x, p.y, i ? this.moving.s1 : this.moving.s0);
          if (i === 0) this.moving.s0 = Math.min(s, this.moving.s1 - MIN_STRETCH);
          else this.moving.s1 = Math.max(s, this.moving.s0 + MIN_STRETCH);
          try { this.view.setSourceSelection(this.base.path(this.moving)); } catch { /* off the map: keep the last */ }
          this.position(); this.view.requestRender();
        };
        const end = () => {
          button.removeEventListener('pointermove', move); button.removeEventListener('pointerup', end); button.removeEventListener('pointercancel', end);
          this.view.controls.enabled = enabled;
          const moved = this.moving; this.moving = null; this.view.setSourceSelection(null);
          if (moved && (Math.abs(moved.s0 - start.s0) > 0.5 || Math.abs(moved.s1 - start.s1) > 0.5)) this.onMove?.(route.id, moved.s0, moved.s1);
          else this.position();
        };
        button.addEventListener('pointermove', move); button.addEventListener('pointerup', end); button.addEventListener('pointercancel', end);
      };
      this.overlay.append(button); this.handles.push(button);
    }
  }
  private position() {
    const interval = this.interval(); if (!interval) return;
    for (const [i, button] of this.handles.entries()) {
      const p = this.base.position(interval.sourceId, i ? interval.s1 : interval.s0);
      if (!p) { button.hidden = true; continue; }
      const screen = this.view.project(p.x, p.y, p.z + 3); button.hidden = !screen.vis;
      button.style.left = `${screen.sx}px`; button.style.top = `${screen.sy}px`;
    }
  }
}
