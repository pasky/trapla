// Shaping a reroute on the map: drag the new road to add a bend point there (the same gesture as
// bending our road), drag a bend point to move it, click it for a Remove button. The shape is the
// crossing override's `via` (persisted, undoable); the engine rebuilds and checks the link. While a
// drag runs, a light line through the bend points follows the mouse at once (no evaluation needed);
// the built road catches up when the drag pauses.
// The end of each new piece, where it joins its road, has a handle of its own: dragged onto another mapped road it
// leads the piece there (the crossing override's `ends`, set on release; the road it would join is lit up while the
// drag runs, nothing is evaluated before the release).
import './link-edit.css';
import type { Design, Result } from '../core/evaluate';
import { crossingVia, MAX_LINK_VIA, type LinkEnd, type LinkVia } from '../core/crossings';
import { ROAD_CLASSES } from '../core/data/urban';
import type { RoadNet } from '../core/roadnet';
import type { CrossingHit } from '../render/crossing-pick';
import { insertViaPoint, shapeable, simplifyLink } from './link-shape';
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
  /** store the shape (null: back to the automatic path); `commit`: one undo step now; `to`: the
   * crossing the reroute leads to, kept with a new shape */
  setVia(roadId: number, via: LinkVia | null, commit: boolean, to?: number): void;
  commit(): void;
  heightAt(x: number, y: number): number;
  /** lead side `side`'s new piece onto this road (one undo step) */
  setEnd(roadId: number, side: 0 | 1, end: LinkEnd): void;
  /** the mapped roads (the pack's network), or null without one */
  roads(): RoadNet | null;
}
/** A drag of a piece's end snaps onto a mapped road this many screen pixels away (at least END_SNAP_MIN m). */
const END_SNAP_PX = 18, END_SNAP_MIN = 6;
/** How much of the road it would join is lit up either side of the snap point, m. */
const END_LIT = 150;

export class LinkEditor {
  private handles: HTMLElement[] = [];
  private svg: SVGSVGElement;
  private line: SVGPolylineElement[];
  private remove: HTMLButtonElement;
  /** the clicked bend point (its Remove button shows) */
  private picked: { roadId: number; side: 0 | 1; i: number } | null = null;
  private dragging: { roadId: number; side: 0 | 1; i: number } | null = null;
  /** the ends of the selected reroute's new pieces (one handle per side that has one) */
  private endHandles: HTMLElement[] = [];
  /** a drag of an end: the side, where the pointer is and the road it would join */
  private ending: { roadId: number; side: 0 | 1; at: XY; snap: (LinkEnd & { path: XY[] }) | null } | null = null;
  private snapLine: SVGPolylineElement;
  private endLine: SVGPolylineElement;

  constructor(private view: View, private overlay: HTMLElement, private host: LinkEditHost) {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('link-preview');
    this.line = [0, 1].map(() => {
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      this.svg.appendChild(l); return l;
    });
    this.snapLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline'); this.snapLine.classList.add('end-snap');
    this.endLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    this.svg.appendChild(this.snapLine); this.svg.appendChild(this.endLine);
    overlay.appendChild(this.svg);
    for (const side of [0, 1] as const) {
      const h = document.createElement('div');
      h.className = 'via via-end'; h.dataset.side = String(side); h.style.display = 'none';
      h.title = 'End of the new road: drag it onto another road to lead it there';
      h.addEventListener('pointerdown', (e) => this.startEnd(e, side, h));
      overlay.appendChild(h); this.endHandles.push(h);
    }
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
    const all = this.host.result()?.crossings.filter(c => c.roadId === roadId && (c.type === 'reconnection' || c.type === 'diversion') && !c.moved && c.geometry?.links) ?? [];
    return all.find(c => c.via || c.ends) ?? all[0] ?? null;
  }
  private via(roadId: number): LinkVia {
    const v = crossingVia(roadId, this.host.design().crossingOverrides ?? []);
    return v ? [v[0].map(p => ({ ...p })), v[1].map(p => ({ ...p }))] : [[], []];
  }

  /** a press on a reroute link: dragging it adds a bend point there and moves it */
  grab(hit: CrossingHit): MapGrab | null {
    const c = hit.crossing, side = hit.link, roadId = c.roadId;
    if (side === undefined || roadId === undefined || (c.type !== 'reconnection' && c.type !== 'diversion') || c.moved) return null;
    const path = c.geometry?.links?.[side];
    if (!path || path.length < 2 || !shapeable(this.host.result(), this.host.design(), roadId)) return null;
    const to = c.targetRoadId ?? (c.targetS === 0 ? -1 : -2);
    return {
      start: (x, y) => {
        const via = this.via(roadId);
        // the first shape of this side starts from the automatic path's own bends
        if (!via[side].length) via[side] = simplifyLink(path);
        if (via[side].length >= MAX_LINK_VIA) return false;
        const { via: next, index } = insertViaPoint(path, via[side], { x, y });
        via[side] = next;
        this.host.select(roadId);
        this.dragging = { roadId, side, i: index }; this.picked = null;
        this.host.setVia(roadId, via, false, to); this.refresh();
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

  /** the selected reroute's pieces whose end can be dragged elsewhere (not one led under our bridge) */
  private endPaths() {
    const c = this.crossing();
    if (!c || c.under !== undefined || c.roadId === undefined || !shapeable(this.host.result(), this.host.design(), c.roadId)) return [undefined, undefined];
    return [0, 1].map(k => {
      const p = c.geometry?.links?.[k];
      if (p && p.length >= 2) return p;
      // (a part that just ends at our earthworks: its end, where a new piece would start, led on from there)
      const end = c.closure?.connected[k] ? c.closure.reach?.[k]?.path[0] : undefined;
      return end ? [end, end] : undefined;
    });
  }
  /** after a selection, design or result change */
  refresh() {
    const ends = this.endPaths(), cut = this.crossing(), piece = cut?.cls === 'track' ? 'track' : 'road';
    this.endHandles.forEach((h, k) => {
      h.style.display = ends[k] ? '' : 'none';
      h.title = cut?.closure?.connected[k] && !cut.geometry?.links?.[k]?.length ? `Where this part of the ${piece === 'track' ? 'track' : ROAD_CLASSES[cut.cls]?.label ?? 'road'} now ends: drag it onto another road to lead it there by a new ${piece}`
        : `End of the new ${piece}: drag it onto another road to lead it there`;
    });
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
    const side = Number(h.dataset.side) as 0 | 1, i = Number(h.dataset.i), x0 = e.clientX, y0 = e.clientY, id = e.pointerId;
    h.setPointerCapture(id);
    let moved = false, done = false;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      if (!moved) { moved = true; this.dragging = { roadId, side, i }; this.picked = null; h.classList.add('drag'); }
      const p = this.view.pick(ev.clientX, ev.clientY);
      if (p) this.moveTo(p.x, p.y);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id || done) return;
      done = true;
      for (const [type, fn] of [['pointermove', move], ['pointerup', up], ['pointercancel', up], ['lostpointercapture', up]] as const) h.removeEventListener(type, fn);
      h.classList.remove('drag');
      if (moved) this.endDrag();
      else if (ev.type === 'pointerup') { this.picked = this.picked?.side === side && this.picked.i === i ? null : { roadId, side, i }; this.refresh(); }
    };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up); h.addEventListener('lostpointercapture', up);
  }

  /** the mapped road a dropped end would join: the nearest within reach of the pointer (not the cut way itself, nor
   * a motorway or a railway), the point of it nearest the pointer, and a stretch of it either side to light up */
  private snapAt(p: XY, roadId: number): (LinkEnd & { path: XY[] }) | null {
    const net = this.host.roads();
    if (!net) return null;
    const reach = Math.max(END_SNAP_MIN, END_SNAP_PX * this.view.metresPerPixel);
    let best: { way: number; x: number; y: number; d: number } | null = null;
    net.nearSegments([p.x - reach, p.y - reach, p.x + reach, p.y + reach], (q) => {
      if (q.way === roadId || ROAD_CLASSES[q.cls]?.noAtGrade) return;
      const dx = q.bx - q.ax, dy = q.by - q.ay, t = Math.max(0, Math.min(1, ((p.x - q.ax) * dx + (p.y - q.ay) * dy) / (dx * dx + dy * dy || 1)));
      const x = q.ax + t * dx, y = q.ay + t * dy, d = Math.hypot(p.x - x, p.y - y);
      if (d <= reach && (!best || d < best.d)) best = { way: q.way, x, y, d };
    });
    const b = best as { way: number; x: number; y: number; d: number } | null;
    return b ? { way: b.way, x: b.x, y: b.y, path: net.crossingPath(b.way, b.x, b.y, END_LIT) } : null;
  }
  private startEnd(e: PointerEvent, side: 0 | 1, h: HTMLElement) {
    const roadId = this.crossing()?.roadId;
    if (roadId === undefined || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, y0 = e.clientY, id = e.pointerId;
    h.setPointerCapture(id);
    let moved = false, done = false;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      const p = this.view.pick(ev.clientX, ev.clientY);
      if (!moved) { moved = true; h.classList.add('drag'); this.svg.classList.add('ending'); }
      // (off the ground, e.g. over the sky: nothing to snap to)
      const at = p ?? this.ending?.at ?? this.endPaths()[side]?.at(-1);
      if (!at) return;
      this.ending = { roadId, side, at: { x: at.x, y: at.y }, snap: p ? this.snapAt(p, roadId) : null };
      h.classList.toggle('snap', !!this.ending.snap);
      this.place();
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id || done) return;
      done = true;
      for (const [type, fn] of [['pointermove', move], ['pointerup', up], ['pointercancel', up], ['lostpointercapture', up]] as const) h.removeEventListener(type, fn);
      h.classList.remove('drag', 'snap'); this.svg.classList.remove('ending');
      // (where it is let go: the road under the pointer then, if any)
      const p = ev.type === 'pointerup' ? this.view.pick(ev.clientX, ev.clientY) : null, snap = p ? this.snapAt(p, roadId) : null;
      this.ending = null;
      // (dropped on a road: it leads there; anywhere else it goes back)
      if (moved && snap) this.host.setEnd(roadId, side, { way: snap.way, x: snap.x, y: snap.y });
      this.refresh();
    };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up); h.addEventListener('lostpointercapture', up);
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
    const ends = this.endPaths();
    this.endHandles.forEach((h, k) => {
      const path = ends[k];
      if (!path) return;
      // (while dragged: under the pointer, or on the road it snaps to)
      const e = this.ending?.side === k ? this.ending.snap ?? this.ending.at : path[path.length - 1], s = at(e);
      h.style.visibility = s.vis ? '' : 'hidden';
      h.style.transform = `translate(${s.sx.toFixed(1)}px, ${s.sy.toFixed(1)}px)`;
    });
    const line = (l: SVGPolylineElement, pts: XY[]) => {
      const p = pts.map(at);
      l.setAttribute('points', p.length > 1 && p.every(q => q.vis) ? p.map(q => `${q.sx.toFixed(1)},${q.sy.toFixed(1)}`).join(' ') : '');
    };
    const drag = this.ending, from = drag ? ends[drag.side]?.[0] : undefined;
    line(this.snapLine, drag?.snap?.path ?? []);
    line(this.endLine, drag && from ? [from, drag.snap ?? drag.at] : []);
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
