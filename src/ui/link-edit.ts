// Shaping a reroute on the map: drag the new road to add a bend point there (the same gesture as
// bending our road), drag a bend point to move it, click it for a Remove button. The shape is the
// crossing override's `via` (persisted, undoable); the engine rebuilds and checks the link. While a
// drag runs, a light line through the bend points follows the mouse at once (no evaluation needed);
// the built road catches up when the drag pauses.
import './link-edit.css';
import type { Design, Result } from '../core/evaluate';
import { crossingVia, MAX_LINK_VIA, type LinkVia } from '../core/crossings';
import type { CrossingHit } from '../render/crossing-pick';
import type { MapGrab, View } from '../render/view';

type XY = { x: number; y: number };
export interface LinkEditHost {
  /** the selected crossed road (its card is open), or null */
  selected(): number | null;
  /** the last full result (crossing geometry is built only there) */
  result(): Result | null;
  design(): Design;
  /** select this crossed road (its card), without moving the camera */
  select(roadId: number): void;
  /** store the shape (null: back to the automatic path); `commit`: one undo step now */
  setVia(roadId: number, via: LinkVia | null, commit: boolean): void;
  commit(): void;
  heightAt(x: number, y: number): number;
}

/** Distance along `path` to the point of it nearest to `p`. */
export function arcPosition(path: readonly XY[], p: XY): number {
  let best = Infinity, at = 0, run = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len))) : 0;
    const d = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    if (d < best) { best = d; at = run + t * len; }
    run += len;
  }
  return at;
}
/** Insert a bend point at `p` (a point on the drawn link `path`) between the existing bend points it
 * lies between along the path; returns the new list and the new point's index. */
export function insertViaPoint(path: readonly XY[], via: readonly XY[], p: XY): { via: XY[]; index: number } {
  const s = arcPosition(path, p);
  let index = 0;
  while (index < via.length && arcPosition(path, via[index]) <= s) index++;
  const next = via.map(q => ({ ...q }));
  next.splice(index, 0, { x: p.x, y: p.y });
  return { via: next, index };
}

export class LinkEditor {
  private handles: HTMLElement[] = [];
  private svg: SVGSVGElement;
  private line: SVGPolylineElement[];
  private remove: HTMLButtonElement;
  /** the clicked bend point (its Remove button shows) */
  private picked: { roadId: number; side: 0 | 1; i: number } | null = null;
  private dragging: { roadId: number; side: 0 | 1; i: number } | null = null;

  constructor(private view: View, private overlay: HTMLElement, private host: LinkEditHost) {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('link-preview');
    this.line = [0, 1].map(() => {
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      this.svg.appendChild(l); return l;
    });
    overlay.appendChild(this.svg);
    this.remove = document.createElement('button');
    this.remove.type = 'button'; this.remove.className = 'via-remove'; this.remove.textContent = 'Remove bend point';
    this.remove.style.display = 'none';
    this.remove.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.remove.onclick = () => this.removePicked();
    overlay.appendChild(this.remove);
    view.addRenderListener(() => this.place());
  }

  /** the selected crossing's reroute, if it has one to shape */
  private crossing(roadId = this.host.selected()) {
    if (roadId === null) return null;
    const c = this.host.result()?.crossings.find(c => c.roadId === roadId && (c.type === 'reconnection' || c.type === 'diversion') && c.geometry?.links);
    return c ?? null;
  }
  private via(roadId: number): LinkVia {
    const v = crossingVia(roadId, this.host.design().crossingOverrides ?? []);
    return v ? [v[0].map(p => ({ ...p })), v[1].map(p => ({ ...p }))] : [[], []];
  }

  /** a press on a reroute link: dragging it adds a bend point there and moves it */
  grab(hit: CrossingHit): MapGrab | null {
    const c = hit.crossing, side = hit.link, roadId = c.roadId;
    if (side === undefined || roadId === undefined || (c.type !== 'reconnection' && c.type !== 'diversion')) return null;
    const path = c.geometry?.links?.[side];
    if (!path || path.length < 2) return null;
    return {
      start: (x, y) => {
        const via = this.via(roadId);
        if (via[side].length >= MAX_LINK_VIA) return false;
        const { via: next, index } = insertViaPoint(path, via[side], { x, y });
        via[side] = next;
        this.host.select(roadId);
        this.dragging = { roadId, side, i: index }; this.picked = null;
        this.host.setVia(roadId, via, false); this.refresh();
        return true;
      },
      move: (x, y) => this.moveTo(x, y),
      end: () => this.endDrag(),
    };
  }
  private moveTo(x: number, y: number) {
    const d = this.dragging;
    if (!d) return;
    const via = this.via(d.roadId);
    if (!via[d.side][d.i]) return;
    via[d.side][d.i] = { x, y };
    this.host.setVia(d.roadId, via, false);
    this.place();
  }
  private endDrag() {
    if (!this.dragging) return;
    this.dragging = null; this.host.commit(); this.refresh();
  }
  private removePicked() {
    const p = this.picked;
    if (!p) return;
    const via = this.via(p.roadId);
    via[p.side].splice(p.i, 1);
    this.picked = null;
    this.host.setVia(p.roadId, via[0].length || via[1].length ? via : null, true);
    this.refresh();
  }

  /** after a selection, design or result change */
  refresh() {
    const c = this.crossing(), roadId = c?.roadId;
    const via = roadId !== undefined ? this.via(roadId) : [[], []];
    if (this.picked && (this.picked.roadId !== roadId || !via[this.picked.side][this.picked.i])) this.picked = null;
    const points = via.flatMap((side, k) => side.map((_, i) => ({ side: k as 0 | 1, i })));
    while (this.handles.length < points.length) {
      const h = document.createElement('div');
      h.className = 'via'; h.title = 'Bend point of the new road: drag to move it, click to remove it';
      h.addEventListener('pointerdown', (e) => this.startHandle(e, h));
      this.overlay.appendChild(h); this.handles.push(h);
    }
    this.handles.forEach((h, k) => {
      const p = points[k];
      h.style.display = p ? '' : 'none';
      if (p) { h.dataset.side = String(p.side); h.dataset.i = String(p.i); }
      h.classList.toggle('sel', !!p && !!this.picked && this.picked.side === p.side && this.picked.i === p.i);
    });
    this.place();
  }
  private startHandle(e: PointerEvent, h: HTMLElement) {
    const roadId = this.crossing()?.roadId;
    if (roadId === undefined || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const side = Number(h.dataset.side) as 0 | 1, i = Number(h.dataset.i), x0 = e.clientX, y0 = e.clientY;
    h.setPointerCapture(e.pointerId);
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      if (!moved) { moved = true; this.dragging = { roadId, side, i }; this.picked = null; h.classList.add('drag'); }
      const p = this.view.pick(ev.clientX, ev.clientY);
      if (p) this.moveTo(p.x, p.y);
    };
    const up = () => {
      h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
      h.classList.remove('drag');
      if (moved) this.endDrag();
      else { this.picked = this.picked?.side === side && this.picked.i === i ? null : { roadId, side, i }; this.refresh(); }
    };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
  }

  /** position the handles, the Remove button and the shape line (after every render) */
  private place() {
    const c = this.crossing(), roadId = c?.roadId;
    const via = roadId !== undefined ? this.via(roadId) : [[], []];
    const at = (p: XY) => this.view.project(p.x, p.y, this.host.heightAt(p.x, p.y));
    let k = 0;
    for (const [side, list] of via.entries()) for (const [i, p] of list.entries()) {
      const h = this.handles[k++], s = at(p);
      if (!h) continue;
      h.style.visibility = s.vis ? '' : 'hidden';
      h.style.transform = `translate(${s.sx.toFixed(1)}px, ${s.sy.toFixed(1)}px)`;
      if (this.picked && this.picked.side === side && this.picked.i === i) {
        this.remove.style.display = s.vis ? '' : 'none';
        this.remove.style.transform = `translate(${(s.sx + 14).toFixed(1)}px, ${(s.sy - 30).toFixed(1)}px)`;
      }
    }
    if (!this.picked) this.remove.style.display = 'none';
    // The shape line: until the built road matches the shape (during a drag, and until the result is in).
    const built = JSON.stringify(c?.via ?? null) === JSON.stringify(roadId !== undefined ? crossingVia(roadId, this.host.design().crossingOverrides ?? []) ?? null : null);
    this.line.forEach((l, side) => {
      const path = c?.geometry?.links?.[side];
      if (!c || built || !path || path.length < 2) { l.setAttribute('points', ''); return; }
      const pts = [path[0], ...via[side], path[path.length - 1]].map(at);
      l.setAttribute('points', pts.every(p => p.vis) ? pts.map(p => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' ') : '');
    });
  }
}
