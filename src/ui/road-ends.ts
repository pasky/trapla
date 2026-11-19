// A built road's two ends (Start, End), drawn as handles while that road is selected: drag one along the road
// it joins (it stays on it), off it onto open ground, or onto another road to join that one instead. The road
// follows live; letting go applies one undoable edit ("moving the start"). Where an end cannot go the handle
// says why, and letting go there leaves the end where it was. A rebuilt stretch's ends are stretch-ends.ts's.
import type { Anchor, RouteDesign } from '../core/project';
import type { View } from '../render/view';
import type { Placement } from './build-road';
import { MIN_NEW_ROAD } from './build-road';
import type { PlacedEnd } from './road-edit';

export interface RoadEndsContext {
  /** where this end would go with the pointer at the client point (it keeps to the road it joined when the drag
   * began, `held`, while near it); null: the pointer is off the map */
  place(route: RouteDesign, end: 'a' | 'b', clientX: number, clientY: number, held: Anchor): Placement | null;
  /** the end as drawn now (an end on another road follows that road as built) */
  drawnAt(route: RouteDesign, end: 'a' | 'b'): { x: number; y: number; z: number };
  /** a drag starts / the end moves (a live, uncommitted change) / it ends (`keep`: commit, else take it back) */
  begin(): void;
  move(routeId: string, end: 'a' | 'b', placed: PlacedEnd): void;
  finish(keep: boolean): void;
  /** a refusal said when the end is let go where it cannot go */
  refuse(why: string): void;
}

/** Built roads whose ends these handles move: a road or railway the player built (not the mission's line, a
 * rebuilt stretch or a motorway, whose ends are their own). */
export const movableEnds = (route: RouteDesign | null): route is RouteDesign =>
  !!route && route.role !== 'mission' && !route.source && (route.kind === 'road' || route.kind === 'railway');

export class RoadEnds {
  private handles: HTMLButtonElement[] = [];
  private ghost: HTMLElement | null = null;
  private route: RouteDesign | null = null;
  /** while dragging: which end, where it is now and what the pointer would do */
  private moving: { end: 'a' | 'b'; at: { x: number; y: number; z: number }; placement: Placement | null } | null = null;
  constructor(private overlay: HTMLElement, private view: View, private ctx: RoadEndsContext) {
    view.addRenderListener(() => this.position());
  }
  get dragging() { return !!this.moving; }
  /** Show the handles for this road if its ends are the player's to move, else none. */
  sync(route: RouteDesign | null) {
    if (this.moving) { this.route = route && route.id === this.route?.id ? route : this.route; return; }
    this.route = movableEnds(route) ? route : null;
    if (!this.route) { for (const h of this.handles) h.remove(); this.handles = []; return; }
    if (!this.handles.length) this.make();
    this.position();
  }
  private make() {
    for (const end of ['a', 'b'] as const) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = end === 'a' ? 'Start' : 'End';
      button.className = 'source-endpoint road-end'; button.dataset.end = end;
      button.title = 'Drag along the road it joins, or onto another road or open ground';
      button.onpointerdown = event => this.press(event, end, button);
      this.overlay.append(button); this.handles.push(button);
    }
  }
  private press(event: PointerEvent, end: 'a' | 'b', button: HTMLButtonElement) {
    const route = this.route;
    if (event.button !== 0 || !route) return;
    event.preventDefault(); event.stopPropagation(); button.setPointerCapture(event.pointerId);
    const enabled = this.view.controls.enabled; this.view.controls.enabled = false;
    this.ctx.begin();
    let changed = false;
    const held = structuredClone(route.endpoints[end].anchor);
    this.moving = { end, at: this.ctx.drawnAt(route, end), placement: null };
    // the end itself follows the pointer: the handle is drawn above it, where it was grabbed stays with the pointer
    const box = this.view.renderer.domElement.getBoundingClientRect(), at = this.view.project(this.moving.at.x, this.moving.at.y, this.moving.at.z);
    const grab = { dx: event.clientX - box.left - at.sx, dy: event.clientY - box.top - at.sy };
    const move = (e: PointerEvent) => {
      const now = this.route, moving = this.moving; if (!now || !moving) return;
      let p = this.ctx.place(now, end, e.clientX - grab.dx, e.clientY - grab.dy, held);
      // (never closer to its other end than a new road may be)
      const other = this.ctx.drawnAt(now, end === 'a' ? 'b' : 'a');
      if (p?.ok) {
        const d = Math.hypot(p.end.position.x - other.x, p.end.position.y - other.y);
        if (d < MIN_NEW_ROAD) p = { ok: false, why: `Too short: ${Math.round(d)} m from its other end, at least ${MIN_NEW_ROAD} m` };
      }
      moving.placement = p;
      if (p?.ok) {
        const was = now.endpoints[end];
        if (Math.hypot(p.end.position.x - was.position.x, p.end.position.y - was.position.y) > 0.5 || JSON.stringify(p.end.anchor) !== JSON.stringify(was.anchor)) {
          this.ctx.move(now.id, end, p.end); changed = true;
        }
        moving.at = { ...p.end.position };
      }
      this.position(e); this.view.requestRender();
    };
    const up = () => {
      button.removeEventListener('pointermove', move); button.removeEventListener('pointerup', up); button.removeEventListener('pointercancel', up);
      this.view.controls.enabled = enabled;
      const last = this.moving?.placement; this.moving = null;
      this.ghost?.remove(); this.ghost = null;
      // let go where it cannot go: the end stays where it was
      const keep = changed && (!last || last.ok);
      this.ctx.finish(keep);
      if (changed && last && !last.ok) this.ctx.refuse(last.why);
      this.position();
    };
    button.addEventListener('pointermove', move); button.addEventListener('pointerup', up); button.addEventListener('pointercancel', up);
  }
  /** what a drag would do, under the pointer: what the end joins there, or why it cannot go there */
  get dragText() { return this.moving?.placement ? (this.moving.placement.ok ? this.moving.placement.label : this.moving.placement.why) : null; }
  private position(pointer?: PointerEvent) {
    const route = this.route; if (!route) return;
    for (const [k, button] of this.handles.entries()) {
      const end = k ? 'b' : 'a', p = this.moving?.end === end ? this.moving.at : this.ctx.drawnAt(route, end);
      const screen = this.view.project(p.x, p.y, p.z + 3); button.hidden = !screen.vis;
      button.style.left = `${screen.sx}px`; button.style.top = `${screen.sy}px`;
    }
    const placement = this.moving?.placement;
    if (!this.moving || !placement) { if (this.ghost) this.ghost.hidden = true; return; }
    if (!this.ghost) { this.ghost = document.createElement('div'); this.overlay.append(this.ghost); }
    this.ghost.className = `build-hover${placement.ok ? '' : ' bad'}`;
    this.ghost.textContent = placement.ok ? placement.label : placement.why;
    const at = this.view.project(this.moving.at.x, this.moving.at.y, this.moving.at.z + 3);
    const box = this.view.renderer.domElement.getBoundingClientRect();
    // (a refusal is said at the pointer, the end stays where it last could go)
    const sx = !placement.ok && pointer ? pointer.clientX - box.left : at.sx, sy = !placement.ok && pointer ? pointer.clientY - box.top : at.sy;
    this.ghost.hidden = false; this.ghost.style.left = `${sx}px`; this.ghost.style.top = `${sy - 26}px`;
  }
}
