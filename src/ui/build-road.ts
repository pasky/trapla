// Build → <kind>: click where the new route starts and where it ends. A click on a road joins it there; a
// click on open ground leaves a free end. It is then created straight and bent like any road. What an
// end may join is the kind's (ui/route-kinds.ts BuildKind); this tool only collects the two clicks.
import type { View } from '../render/view';
import type { PlacedEnd } from './road-edit';
import type { XYZ } from '../core/project';

/** Ends closer than this make no road, m. */
export const MIN_NEW_ROAD = 100;

export type Placement = { ok: true; end: PlacedEnd; label: string } | { ok: false; why: string };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => {
  const node = document.createElement(tag); node.textContent = text; return node;
};

export class BuildRoadTool {
  /** what is being built: its menu label, lower-case in the card ("New road") */
  label = 'Road';
  private start: (PlacedEnd & { label: string }) | null = null;
  private marker: HTMLElement | null = null;
  /** under the pointer while placing: where a click would put the end, what it would join, how far from the start */
  private ghost: HTMLElement | null = null;
  private band: HTMLElement | null = null;
  private hovered: { position: XYZ; text: string; bad: boolean } | null = null;
  private note = '';
  active = false;
  onDone?: (a: PlacedEnd, b: PlacedEnd) => void;
  onClose?: () => void;
  constructor(private root: () => HTMLElement, private overlay: HTMLElement, private view: View) {
    view.addRenderListener(() => this.position());
  }
  /** what the card says about where ends go (the kind's own words, else the default) */
  private hintText: string | undefined;
  begin(label = 'Road', hint?: string) { this.cancel(false); this.label = label; this.hintText = hint; this.active = true; this.render(); this.view.renderer.domElement.classList.add('placing'); }
  cancel(notify = true) {
    const was = this.active;
    this.active = false; this.start = null; this.note = '';
    this.marker?.remove(); this.marker = null;
    this.ghost?.remove(); this.ghost = null; this.band?.remove(); this.band = null; this.hovered = null;
    this.view.renderer.domElement.classList.remove('placing');
    if (was && notify) this.onClose?.();
  }
  /** The pointer moved while placing: show where a click would put the end (snapped onto a road it joins),
   * what it joins, and, once the start is placed, the line to it and its length. `ground`: the map point
   * under the pointer (for a spot where an end cannot go). Null: the pointer left the map. */
  hover(p: Placement | null, ground: XYZ | null) {
    if (!this.active) return;
    const position = p?.ok ? p.end.position : ground;
    if (!p || !position) { this.hovered = null; this.position(); return; }
    let text = p.ok ? p.label : this.start ? 'cannot end here' : 'cannot start here', bad = !p.ok;
    if (this.start && p.ok) {
      const d = Math.hypot(position.x - this.start.position.x, position.y - this.start.position.y);
      if (d < MIN_NEW_ROAD) { text = `${Math.round(d)} m: too short, at least ${MIN_NEW_ROAD} m`; bad = true; }
      else text = `${d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(2)} km`} · ${text}`;
    }
    this.hovered = { position, text, bad };
    if (!this.ghost) { this.ghost = el('div'); this.overlay.append(this.ghost); }
    if (this.start && !this.band) { this.band = el('div'); this.band.className = 'build-band'; this.overlay.append(this.band); }
    this.position();
  }
  /** what the hover marker says (scripted checks) */
  get hoverText() { return this.hovered?.text ?? null; }
  place(p: Placement) {
    if (!this.active) return;
    if (!p.ok) { this.note = p.why; this.render(); return; }
    if (!this.start) {
      this.start = { ...p.end, label: p.label }; this.note = '';
      this.marker = el('div', 'Start'); this.marker.className = 'build-end'; this.overlay.append(this.marker); this.position();
      this.render(); return;
    }
    const a = this.start.position, b = p.end.position;
    const apart = Math.hypot(a.x - b.x, a.y - b.y);
    if (apart < MIN_NEW_ROAD) { this.note = `Too short: that is ${Math.round(apart)} m from the start. Put the end at least ${MIN_NEW_ROAD} m away.`; this.render(); return; }
    const start = this.start;
    this.cancel(false);
    this.onDone?.({ position: start.position, anchor: start.anchor, ...(start.travel ? { travel: start.travel } : {}) }, p.end);
  }
  private render() {
    if (!this.active) return;
    const root = this.root();
    root.replaceChildren(); root.className = 'card ctx inspector k-build';
    const header = el('div'); header.className = 'ctx-h';
    const close = el('button', '✕'); close.className = 'x'; close.title = 'Cancel (Esc)'; close.type = 'button';
    close.onclick = () => this.cancel();
    header.append(el('b', `New ${this.label.toLowerCase()}`), close);
    const step = el('p', this.start ? 'Click where it ends.' : 'Click where it starts.'); step.className = 'build-step';
    const hint = el('div', this.hintText ?? (this.label === 'Railway' ? 'A click on a railway joins it there.'
      : this.label === 'Motorway' ? 'Its ends go on open ground. Roads join it by slip roads (Build → Slip road).' : 'A click on a road joins it there.')); hint.className = 'sub';
    root.append(header, step);
    if (this.start) root.append(el('div', `Start: ${this.start.label}`));
    root.append(hint);
    if (this.note) { const n = el('p', this.note); n.className = 'source-error'; root.append(n); }
    const cancel = el('button', 'Cancel'); cancel.type = 'button'; cancel.id = 'cancel-build'; cancel.onclick = () => this.cancel();
    root.append(cancel);
  }
  private position() {
    const start = this.start ? this.view.project(this.start.position.x, this.start.position.y, this.start.position.z + 3) : null;
    if (this.marker && start) { this.marker.hidden = !start.vis; this.marker.style.left = `${start.sx}px`; this.marker.style.top = `${start.sy}px`; }
    const h = this.hovered, at = h ? this.view.project(h.position.x, h.position.y, h.position.z + 3) : null;
    if (this.ghost) {
      this.ghost.hidden = !h || !at!.vis;
      if (h && at!.vis) {
        this.ghost.className = `build-hover${h.bad ? ' bad' : ''}`; this.ghost.textContent = h.text;
        this.ghost.style.left = `${at!.sx}px`; this.ghost.style.top = `${at!.sy}px`;
      }
    }
    if (this.band) {
      const show = !!h && !!start && start.vis && at!.vis;
      this.band.hidden = !show;
      if (show) {
        const dx = at!.sx - start!.sx, dy = at!.sy - start!.sy;
        this.band.className = `build-band${h!.bad ? ' bad' : ''}`;
        this.band.style.left = `${start!.sx}px`; this.band.style.top = `${start!.sy}px`;
        this.band.style.width = `${Math.hypot(dx, dy)}px`; this.band.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      }
    }
  }
}
