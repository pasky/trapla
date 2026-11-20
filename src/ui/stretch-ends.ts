// A rebuilt stretch's two ends, drawn as handles while that road is active: drag one along the old road to rebuild more
// or less of it. A road's handle goes on through junctions and over bridges onto the way the road goes on as (OSM
// splits a road into ways there; core/stretch-chain.ts), until the road ends or something else holds it (the hover
// says what). While dragging, the stretch is highlighted and the old road the handle can still go along is lit ahead
// of it; releasing applies one edit, undone as "rebuilding more of …" / "rebuilding less of …".
import type { RouteDesign, SourceInterval } from '../core/project';
import type { ProjectTransportIndex } from '../core/project-network';
import { CHAIN_KEEP_CLEAR, ChainLine, chainLength, chainParts, structureOf, towardsA, walkOn, type ChainPart, type ChainStop } from '../core/stretch-chain';
import type { View } from '../render/view';
import { followSource, freeSpan } from './source-editor';
import { MIN_STRETCH } from './road-edit';

/** How far along the old road a handle can be pulled in one drag, m (a UI choice: the walk ahead is worked out once,
 * at the press). */
const REACH = 3000;
/** An end this close to where two ways meet is put there (no sliver of the next way), m. */
const SNAP = 1;
/** The pointer this far past where the handle stops (in screen pixels) shows why it stops. */
const PAST_PX = 24;

export const STRETCH_END_TEXT = {
  title: 'Drag along the old road to rebuild more or less of it',
  /** why a handle goes no further (null: nothing to say) */
  stop: (s: ChainStop): string | null => {
    switch (s.reason) {
      case 'end': case 'taken': return 'The road ends here';
      case 'claimed': return 'Another rebuilt stretch starts here';
      case 'map': return 'The map ends here';
      case 'railway': return 'A railway crosses it here';
      case 'bridge': return 'Another road’s bridge joins it here';
      case 'tunnel': return 'A tunnel starts here: it cannot be rebuilt yet';
      case 'joined': return 'A road you built joins it here';
      case 'covered': return `${s.by.charAt(0).toUpperCase()}${s.by.slice(1)} covers it here`;
      default: return null;
    }
  },
  /** the undo step */
  undo: (name: string, longer: boolean) => `rebuilding ${longer ? 'more' : 'less'} of ${name}`,
};

export interface StretchEndsHost {
  /** stretches the project's roads rebuild (by route), and pieces taken up (routeId '') */
  claimed(): readonly { routeId: string; interval: SourceInterval }[];
  /** where other roads' earthworks cover a mapped road (road-edit.ts coveredStretches) */
  covered(sourceId: string): readonly (SourceInterval & { by: string })[];
  /** where roads of the project end on mapped roads */
  joins(): readonly { routeId: string; sourceId: string; s: number }[];
  /** does this rebuilt road's stretch go on past junctions (a road), or stay on its one way (a railway)? */
  chains(route: RouteDesign): boolean;
}

export class StretchEnds {
  private handles: HTMLButtonElement[] = [];
  private route: RouteDesign | null = null;
  /** while a handle is dragged: which end, the line it follows and where that end is on it */
  private moving: { end: 0 | 1; line: ChainLine; t: number } | null = null;
  onMove?: (routeId: string, next: SourceInterval[], label: string) => void;
  constructor(private overlay: HTMLElement, private view: View, private base: ProjectTransportIndex, private host: StretchEndsHost) {
    view.addRenderListener(() => this.position());
  }
  get dragging() { return !!this.moving; }
  /** Show the handles for this road if it is a rebuilt stretch, else none. */
  sync(route: RouteDesign | null) {
    if (this.moving) return;
    this.route = route?.source?.intervals.length ? route : null;
    if (!this.route) { for (const h of this.handles) h.remove(); this.handles = []; return; }
    if (!this.handles.length) this.make();
    this.position();
  }
  /** The line a handle follows: the stretch and the old road beyond the dragged end, with why it stops there. */
  private lineFor(route: RouteDesign, end: 0 | 1): { line: ChainLine; stop: ChainStop | null } {
    const intervals = route.source!.intervals, parts = chainParts(this.base, intervals);
    const others = this.host.claimed().filter(c => c.routeId !== route.id);
    if (!this.host.chains(route)) {
      if (intervals.length !== 1) return { line: new ChainLine(this.base, parts), stop: null };
      // (one way only: as far as it is free and on the map)
      const start = intervals[0], source = this.base.source(start.sourceId)!, length = source.stations[source.stations.length - 1];
      const span = freeSpan(others.map(c => c.interval), this.base.transportData, start.sourceId, (start.s0 + start.s1) / 2, length) ?? { lo: start.s0, hi: start.s1 };
      for (const node of source.stations) if (!this.base.position(source.id, node)) {
        if (node < start.s0) span.lo = Math.max(span.lo, Math.min(start.s0, ...source.stations.filter(t => t > node && t <= start.s0)));
        else if (node > start.s1) span.hi = Math.min(span.hi, Math.max(start.s1, ...source.stations.filter(t => t < node && t >= start.s1)));
      }
      return { line: new ChainLine(this.base, [{ interval: { ...start, s0: span.lo, s1: span.hi }, reversed: false }]), stop: null };
    }
    const limits = { claimed: others.map(c => ({ ...c.interval, ...(c.routeId === '' ? { taken: true } : {}) })), covered: (id: string) => this.host.covered(id),
      joins: this.host.joins().filter(j => j.routeId !== route.id), seen: new Set(intervals.map(i => i.sourceId)), reach: REACH };
    const p = end ? parts[parts.length - 1] : parts[0];
    // (walking away from the other end: from b onward in its direction, from a back against it)
    const from = (end === 1) === !p.reversed ? p.interval.s1 : p.interval.s0, dir = ((end === 1) === !p.reversed ? 1 : -1) as 1 | -1;
    const walk = walkOn(this.base, p.interval.sourceId, from, dir, limits);
    return { line: new ChainLine(this.base, end ? [...parts, ...walk.parts] : [...towardsA(walk.parts), ...parts]), stop: walk.stop };
  }
  private make() {
    for (const [i, label] of ['Start', 'End'].entries()) {
      const end = i as 0 | 1;
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.className = 'source-endpoint stretch-end'; button.dataset.end = String(i);
      button.title = STRETCH_END_TEXT.title;
      button.onpointerdown = event => {
        const route = this.route;
        if (event.button !== 0 || !route?.source) return;
        event.preventDefault(); event.stopPropagation(); button.setPointerCapture(event.pointerId);
        const enabled = this.view.controls.enabled; this.view.controls.enabled = false;
        const intervals = route.source.intervals, parts = chainParts(this.base, intervals);
        let line: ChainLine, stop: ChainStop | null;
        try { ({ line, stop } = this.lineFor(route, end)); } catch { this.view.controls.enabled = enabled; return; }
        const at = (q: ChainPart, entry: boolean) => line.t(q.interval.sourceId, entry === !q.reversed ? q.interval.s0 : q.interval.s1)!;
        const tA = at(parts[0], true), tB = at(parts[parts.length - 1], false), start = end ? tB : tA;
        const span = end ? { lo: tA + MIN_STRETCH, hi: line.t1 } : { lo: line.t0, hi: tB - MIN_STRETCH };
        // the line as one polyline with its chainage (what the handle follows), its bridges, where its ways meet
        let path: { x: number; y: number; z: number; s: number }[];
        try { path = line.path(line.t0, line.t1); } catch { this.view.controls.enabled = enabled; return; }
        const virtual = { xy: path.flatMap(q => [q.x, q.y]), stations: path.map(q => q.s) };
        const spans = line.spans(), decks = spans.filter(q => structureOf(this.base.source(q.part.interval.sourceId)) !== 'ground');
        const joints = spans.slice(1).map(q => q.t0);
        /** where the end may stand: never on a bridge nor within CHAIN_KEEP_CLEAR of one, at a joint when that close */
        const place = (t: number) => {
          for (const d of decks) if (t > d.t0 - CHAIN_KEEP_CLEAR && t < d.t1 + CHAIN_KEEP_CLEAR) {
            const before = d.t0 - CHAIN_KEEP_CLEAR, after = d.t1 + CHAIN_KEEP_CLEAR, ok = (u: number) => u >= span.lo && u <= span.hi;
            t = ok(before) && (!ok(after) || t - before <= after - t) ? before : ok(after) ? after : start;
          }
          for (const j of joints) if (Math.abs(t - j) < SNAP) t = j;
          return t;
        };
        this.moving = { end, line, t: start };
        const far = end ? span.hi : span.lo, farPoint = line.point(far);
        const move = (e: PointerEvent) => {
          const p = this.view.pick(e.clientX, e.clientY); if (!p || !this.moving) return;
          const t = place(followSource(virtual, span, p.x, p.y, this.moving.t));
          this.moving.t = t;
          const lo = end ? tA : t, hi = end ? t : tB;
          try {
            this.view.setSourceSelection(line.path(lo, hi), end ? line.path(t, line.t1) : line.path(line.t0, t));
          } catch { /* off the map: keep the last */ }
          // held at the far end with the pointer well past it: why it goes no further
          const why = stop && Math.abs(t - far) < 1 && farPoint ? STRETCH_END_TEXT.stop(stop) : null;
          const past = farPoint ? Math.hypot(p.x - farPoint.x, p.y - farPoint.y) / Math.max(1e-6, this.view.metresPerPixel) : 0;
          this.view.setHover(why && past > PAST_PX && farPoint ? farPoint : null, why ?? '');
          this.position(); this.view.requestRender();
        };
        const done = () => {
          button.removeEventListener('pointermove', move); button.removeEventListener('pointerup', done); button.removeEventListener('pointercancel', done);
          this.view.controls.enabled = enabled; this.view.setHover(null);
          const moved = this.moving; this.moving = null; this.view.setSourceSelection(null);
          if (!moved || Math.abs(moved.t - start) <= 0.5) { this.position(); return; }
          const next = end ? line.intervals(tA, moved.t) : line.intervals(moved.t, tB);
          this.onMove?.(route.id, next, STRETCH_END_TEXT.undo(route.name, chainLength(next) > chainLength(intervals)));
        };
        button.addEventListener('pointermove', move); button.addEventListener('pointerup', done); button.addEventListener('pointercancel', done);
      };
      this.overlay.append(button); this.handles.push(button);
    }
  }
  private position() {
    const route = this.route; if (!route) return;
    for (const [i, button] of this.handles.entries()) {
      const p = this.moving?.end === i ? this.moving.line.point(this.moving.t) : (i ? route.endpoints.b.position : route.endpoints.a.position);
      if (!p) { button.hidden = true; continue; }
      const screen = this.view.project(p.x, p.y, p.z + 3); button.hidden = !screen.vis;
      button.style.left = `${screen.sx}px`; button.style.top = `${screen.sy}px`;
    }
  }
}
