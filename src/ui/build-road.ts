// Build → <kind>: click where the new route starts and where it ends. A click on a road joins it there; a
// click on open ground leaves a free end. It is then created straight and bent like any road. What an
// end may join is the kind's (ui/route-kinds.ts BuildKind); this tool only collects the two clicks.
import type { View } from '../render/view';
import type { PlacedEnd } from './road-edit';

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
  private note = '';
  active = false;
  onDone?: (a: PlacedEnd, b: PlacedEnd) => void;
  onClose?: () => void;
  constructor(private root: () => HTMLElement, private overlay: HTMLElement, private view: View) {
    view.addRenderListener(() => this.position());
  }
  begin(label = 'Road') { this.cancel(false); this.label = label; this.active = true; this.render(); this.view.renderer.domElement.classList.add('placing'); }
  cancel(notify = true) {
    const was = this.active;
    this.active = false; this.start = null; this.note = '';
    this.marker?.remove(); this.marker = null;
    this.view.renderer.domElement.classList.remove('placing');
    if (was && notify) this.onClose?.();
  }
  place(p: Placement) {
    if (!this.active) return;
    if (!p.ok) { this.note = p.why; this.render(); return; }
    if (!this.start) {
      this.start = { ...p.end, label: p.label }; this.note = '';
      this.marker = el('div', 'Start'); this.marker.className = 'build-end'; this.overlay.append(this.marker); this.position();
      this.render(); return;
    }
    const a = this.start.position, b = p.end.position;
    if (Math.hypot(a.x - b.x, a.y - b.y) < MIN_NEW_ROAD) { this.note = `Put the end at least ${MIN_NEW_ROAD} m from the start.`; this.render(); return; }
    const start = this.start;
    this.cancel(false);
    this.onDone?.({ position: start.position, anchor: start.anchor }, p.end);
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
    const hint = el('div', 'A click on a road joins it there.'); hint.className = 'sub';
    root.append(header, step);
    if (this.start) root.append(el('div', `Start: ${this.start.label}`));
    root.append(hint);
    if (this.note) { const n = el('p', this.note); n.className = 'source-error'; root.append(n); }
    const cancel = el('button', 'Cancel'); cancel.type = 'button'; cancel.id = 'cancel-build'; cancel.onclick = () => this.cancel();
    root.append(cancel);
  }
  private position() {
    if (!this.marker || !this.start) return;
    const p = this.start.position, screen = this.view.project(p.x, p.y, p.z + 3);
    this.marker.hidden = !screen.vis; this.marker.style.left = `${screen.sx}px`; this.marker.style.top = `${screen.sy}px`;
  }
}
