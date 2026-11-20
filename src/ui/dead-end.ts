// A selected mapped road's open dead end (owner, I/35 Turnov: a cul-de-sac at our earthworks could not be cut back):
// a handle there, dragged back along the road, shortens it. The piece beyond the new end is taken up (core/taken-up.ts:
// gone from the map, billed as taken up, nothing regraded); dragged out again to where the road ended, the road is
// whole again. The handle goes back no further than DEAD_END_CLEAR short of the last junction before the dead end (no
// other way loses its road) nor into a stretch a project road rebuilds. Nothing is evaluated during the drag; the
// release is one undo step ("shortening …").
import type { SourceInterval, TakenUpPiece } from '../core/project';
import type { ProjectTransportIndex } from '../core/project-network';
import { ROAD_CLASSES } from '../core/data/urban';
import type { View } from '../render/view';
import { followSource } from './source-editor';

/** A shortened road ends this far short of its last junction at the most, m (as a rebuilt stretch stops short of a
 * joining bridge: road-edit.ts KEEP_CLEAR). */
export const DEAD_END_CLEAR = 5;
/** A drag that leaves the road's end within this of where it ended on the map makes it whole again, m. */
const WHOLE = 1;

export interface DeadEnd { sourceId: string; end: 'a' | 'b';
  /** the station of its dead end on the map, of its end now (shortened: the piece's inner end), and the furthest back
   * it may go */
  mapped: number; now: number; limit: number }

/** The open dead ends of a mapped road (an end no other way meets, on the map): none for a motorway, a bridge or
 * tunnel, a way that meets nothing at all, or an end a project road rebuilds. */
export function deadEnds(base: ProjectTransportIndex, sourceId: string, claimed: readonly SourceInterval[], taken: readonly TakenUpPiece[]): DeadEnd[] {
  const source = base.source(sourceId);
  const row = source?.kind === 'road' ? ROAD_CLASSES[source.tags.highway ?? ''] : undefined;
  if (!source || !row || row.noAtGrade || source.bridge || source.tunnel || source.elevation !== 'terrain') return [];
  const length = source.stations[source.stations.length - 1];
  const junctions = base.branches({ transportData: base.transportData, sourceId, s0: 0, s1: length }).map(b => b.s);
  if (!junctions.length) return [];
  const mine = claimed.filter(c => c.sourceId === sourceId && c.transportData === base.transportData);
  const out: DeadEnd[] = [];
  for (const end of ['a', 'b'] as const) {
    const mapped = end === 'a' ? 0 : length;
    if (junctions.some(s => Math.abs(s - mapped) < 0.01) || !base.position(sourceId, mapped)) continue;
    const piece = taken.find(t => t.interval.sourceId === sourceId && t.end === end);
    const now = piece ? (end === 'a' ? piece.interval.s1 : piece.interval.s0) : mapped;
    // (nor into another road's rebuilt stretch: claimed between the junction and the end; one over the end: no handle)
    const others = mine.filter(c => !(piece && c.s0 === piece.interval.s0 && c.s1 === piece.interval.s1));
    if (others.some(c => c.s0 <= now + 0.01 && c.s1 >= now - 0.01)) continue;
    let limit = end === 'a' ? Math.min(...junctions) - DEAD_END_CLEAR : Math.max(...junctions) + DEAD_END_CLEAR;
    for (const c of others) {
      if (end === 'a' && c.s1 <= now) limit = Math.max(limit, c.s1 + DEAD_END_CLEAR);
      if (end === 'b' && c.s0 >= now) limit = Math.min(limit, c.s0 - DEAD_END_CLEAR);
    }
    if (end === 'a' ? limit <= 0.5 : limit >= length - 0.5) continue;
    out.push({ sourceId, end, mapped, now, limit });
  }
  return out;
}

export const DEAD_END_TEXT = {
  handle: 'End',
  hover: 'drag to shorten',
  /** the card's line once shortened */
  shortened: (m: number) => `Shortened: ${m} m taken up.`,
  /** the undo step */
  undo: (name: string) => `shortening ${name}`,
};

export interface DeadEndHost {
  /** the piece taken up at this end from now (null: the road whole again), as one undo step labelled `label` */
  shorten(sourceId: string, end: 'a' | 'b', piece: TakenUpPiece | null, label: string): void;
}
export class DeadEndHandles {
  private handles: { el: HTMLButtonElement; d: DeadEnd }[] = [];
  /** while dragged: the end's station now */
  private moving: { k: number; s: number } | null = null;
  private name = 'the road';
  constructor(private overlay: HTMLElement, private view: View, private base: ProjectTransportIndex, private host: DeadEndHost) {
    view.addRenderListener(() => this.place());
  }
  get dragging() { return !!this.moving; }
  show(ends: readonly DeadEnd[], name: string) {
    if (this.moving) return;
    this.hide(); this.name = name;
    for (const d of ends) {
      const el = document.createElement('button'); el.type = 'button'; el.className = 'source-endpoint dead-end';
      el.textContent = DEAD_END_TEXT.handle; el.title = DEAD_END_TEXT.hover; el.dataset.end = d.end;
      // (after the map's own hover has let go of the pointer leaving it for the handle: ui/map-hover.ts, next frame)
      let over = false;
      el.onpointerenter = () => { over = true; requestAnimationFrame(() => requestAnimationFrame(() => { const p = this.at(d.now); if (over && p) this.view.setHover(p, DEAD_END_TEXT.hover); })); };
      el.onpointerleave = () => { over = false; if (!this.moving) this.view.setHover(null); };
      el.onpointerdown = e => this.press(e, this.handles.findIndex(h => h.el === el));
      this.overlay.append(el); this.handles.push({ el, d });
    }
    this.place();
  }
  hide() { for (const h of this.handles) h.el.remove(); this.handles = []; }
  private at(s: number) { return this.base.position(this.handles[0]?.d.sourceId ?? '', s); }
  private press(e: PointerEvent, k: number) {
    const h = this.handles[k];
    if (!h || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation(); h.el.setPointerCapture(e.pointerId);
    const enabled = this.view.controls.enabled; this.view.controls.enabled = false;
    const d = h.d, source = this.base.source(d.sourceId)!;
    const span = d.end === 'a' ? { lo: 0, hi: d.limit } : { lo: d.limit, hi: d.mapped };
    this.moving = { k, s: d.now };
    const piece = (s: number) => d.end === 'a' ? { s0: 0, s1: s } : { s0: s, s1: d.mapped };
    const move = (ev: PointerEvent) => {
      const p = this.view.pick(ev.clientX, ev.clientY); if (!p || !this.moving) return;
      this.moving.s = followSource(source, span, p.x, p.y, this.moving.s);
      const cut = piece(this.moving.s), m = Math.round(cut.s1 - cut.s0);
      h.el.textContent = m >= WHOLE ? `−${m} m` : DEAD_END_TEXT.handle;
      try { this.view.setSourceSelection(m >= WHOLE ? this.base.path({ transportData: this.base.transportData, sourceId: d.sourceId, ...cut }) : null); } catch { /* off the map */ }
      this.place(); this.view.requestRender();
    };
    const end = () => {
      h.el.removeEventListener('pointermove', move); h.el.removeEventListener('pointerup', end); h.el.removeEventListener('pointercancel', end);
      this.view.controls.enabled = enabled; this.view.setHover(null);
      const moved = this.moving; this.moving = null; h.el.textContent = DEAD_END_TEXT.handle;
      if (!moved || Math.abs(moved.s - d.now) < 0.5) { this.place(); return; }
      const whole = Math.abs(moved.s - d.mapped) < WHOLE, at = this.base.position(d.sourceId, moved.s);
      const taken: TakenUpPiece | null = whole || !at ? null
        : { interval: { transportData: this.base.transportData, sourceId: d.sourceId, ...piece(moved.s) }, end: d.end, at: { x: at.x, y: at.y, z: at.z } };
      this.host.shorten(d.sourceId, d.end, taken, DEAD_END_TEXT.undo(this.name));
    };
    h.el.addEventListener('pointermove', move); h.el.addEventListener('pointerup', end); h.el.addEventListener('pointercancel', end);
  }
  private place() {
    for (const [k, h] of this.handles.entries()) {
      const s = this.moving?.k === k ? this.moving.s : h.d.now, p = this.at(s);
      if (!p) { h.el.hidden = true; continue; }
      const q = this.view.project(p.x, p.y, p.z + 3); h.el.hidden = !q.vis;
      h.el.style.left = `${q.sx}px`; h.el.style.top = `${q.sy}px`;
    }
  }
}
