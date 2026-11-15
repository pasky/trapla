import type { RoadSpec, SourceInterval, XYZ } from '../core/project';
import type { ProjectCommand } from '../project-store-contract';
import { groundRoadSourceInfo, promoteGroundRoad } from '../core/project-promotion';
import type { ProjectTransportIndex } from '../core/project-network';
import type { TransportSource } from '../core/project-transport';
import type { SourceHit } from '../render/source-pick';
import type { View } from '../render/view';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => {
  const node = document.createElement(tag); node.textContent = text; return node;
};

/** The unclaimed stretch of a source around station s (null: s itself is claimed by a project road). */
export function freeSpan(claimed: readonly SourceInterval[], transportData: string, sourceId: string, s: number, length: number) {
  let lo = 0, hi = length;
  for (const c of claimed) if (c.sourceId === sourceId && c.transportData === transportData) {
    if (c.s1 <= s) lo = Math.max(lo, c.s1); else if (c.s0 >= s) hi = Math.min(hi, c.s0); else return null;
  }
  return { lo, hi };
}

/** Nearest point of a source within `span`, searched continuously from the handle's station `from`: on a
 * hairpin or loop the handle follows the road instead of jumping to another leg that passes nearby. */
export function followSource(source: Pick<TransportSource, 'xy' | 'stations'>, span: { lo: number; hi: number }, x: number, y: number, from: number) {
  const window = 400;
  let s = from;
  for (let round = 0; round < 8; round++) {
    const lo = Math.max(span.lo, s - window), hi = Math.min(span.hi, s + window);
    let best = Infinity, next = s;
    for (let i = 1; i < source.stations.length; i++) {
      if (source.stations[i] < lo || source.stations[i - 1] > hi) continue;
      const ax = source.xy[2 * i - 2], ay = source.xy[2 * i - 1], dx = source.xy[2 * i] - ax, dy = source.xy[2 * i + 1] - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      const at = Math.max(lo, Math.min(hi, source.stations[i - 1] + t * (source.stations[i] - source.stations[i - 1])));
      const distance = (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2;
      if (distance < best) { best = distance; next = at; }
    }
    const edge = next <= lo + 1e-6 && lo > span.lo || next >= hi - 1e-6 && hi < span.hi;
    s = next; if (!edge) break; // reached the window edge: keep following the road
  }
  return s;
}

/** One inspector, a bounded source stretch and two visible handles. No project mutation until Apply. */
export class SourceEditor {
  private hit: SourceHit | null = null;
  private interval: SourceInterval | null = null;
  private editing = false;
  private handles: HTMLButtonElement[] = [];
  private endDrag: (() => void) | null = null;
  private values = { speed: '', traffic: '', heavy: '' };
  private info: ReturnType<typeof groundRoadSourceInfo> | null = null;
  onApply?: (command: Extract<ProjectCommand, { type: 'promote' }>, routeId: string) => void;
  onClose?: () => void;
  /** the stretch the handles may cover: never into a stretch another project road already claims */
  private span = { lo: 0, hi: 0 };
  constructor(private root: () => HTMLElement, private overlay: HTMLElement, private view: View, private base: ProjectTransportIndex,
    private claimed: () => readonly SourceInterval[] = () => []) {
    view.addRenderListener(() => this.position());
  }
  get selected() { return this.hit; }
  get choosingEnds() { return this.editing; }
  get selection() { return this.interval && { kind: 'source' as const, interval: { ...this.interval } }; }
  clear() {
    this.endDrag?.(); this.endDrag = null;
    this.hit = null; this.interval = null; this.editing = false;
    for (const handle of this.handles) handle.remove(); this.handles = [];
  }
  show(hit: SourceHit) {
    this.clear(); this.hit = hit;
    const source = this.base.source(hit.sourceId);
    if (!source) return;
    const length = source.stations[source.stations.length - 1];
    const span = freeSpan(this.claimed(), this.base.transportData, source.id, hit.s, length);
    if (!span) return; // already claimed by a project road: that road is selected instead
    this.span = span; const { lo, hi } = span;
    // A visible initial selection only, not a design rule or source ownership claim.
    this.interval = { transportData: this.base.transportData, sourceId: source.id, s0: Math.max(lo, hit.s - 100), s1: Math.min(hi, hit.s + 100) };
    try { this.info = groundRoadSourceInfo(this.base, source.id); } catch { this.info = null; }
    this.values = { speed: this.info?.taggedSpeed?.toString() ?? '', traffic: '', heavy: '' };
    this.render();
  }
  render() {
    if (!this.hit || !this.interval) return;
    const source = this.base.source(this.hit.sourceId)!, root = this.root();
    root.replaceChildren(); root.className = 'card ctx inspector k-source';
    const header = el('div'); header.className = 'ctx-h';
    const title = this.info?.name ?? source.tags.name ?? source.tags.ref ?? (source.kind === 'railway' ? 'Railway' : 'Road');
    const close = el('button', '✕'); close.className = 'x'; close.title = 'Close';
    close.onclick = () => { this.clear(); this.onClose?.(); };
    header.append(el('b', title), close); root.append(header);
    if (!this.editing) {
      const change = el('button', source.kind === 'railway' ? 'Change railway' : 'Change road'); change.id = 'change-source';
      change.disabled = !this.info;
      change.onclick = () => { this.editing = true; this.makeHandles(); this.render(); };
      root.append(el('p', this.info ? `${this.info.width} m wide · estimated from road class` : 'The road height or design rules need checking.'), change);
      return;
    }
    root.append(el('p', 'Drag Start and End along the road.'));
    const length = el('div', `${Math.round(this.interval.s1 - this.interval.s0)} m`); length.id = 'source-length'; root.append(length);
    const form = el('form'); form.className = 'source-operations';
    // Unknown traffic is an explicit player input, never the mission demand copied to a side road.
    for (const [key, label, unit, min, max] of [
      ['speed', 'Speed', 'km/h', 1, 130], ['traffic', 'Traffic', 'vehicles/day', 0, 100000], ['heavy', 'Heavy vehicles', '%', 0, 100],
    ] as const) {
      const row = el('label', label), input = el('input'); input.type = 'number'; input.required = true; input.min = String(min); input.max = String(max);
      input.step = key === 'traffic' ? '1' : 'any'; input.value = this.values[key]; input.name = key;
      input.oninput = () => { this.values[key] = input.value; }; row.append(input, el('small', unit)); form.append(row);
    }
    const actions = el('div'); actions.className = 'ctx-row';
    const apply = el('button', 'Apply'); apply.type = 'submit'; apply.id = 'apply-source';
    const cancel = el('button', 'Cancel'); cancel.type = 'button'; cancel.id = 'cancel-source';
    cancel.onclick = () => { this.clear(); this.onClose?.(); };
    actions.append(apply, cancel); form.append(actions);
    form.onsubmit = event => {
      event.preventDefault(); if (!form.reportValidity() || !this.interval || !this.info) return;
      const id = `route:${crypto.randomUUID()}`;
      const specification: RoadSpec = { kind: 'road', policy: 'existing-ground', legalClass: this.info.legalClass,
        crossSection: 'existing', existingWidth: this.info.width, designSpeed: Number(this.values.speed),
        operations: { aadt: Number(this.values.traffic), heavyShare: Number(this.values.heavy) / 100, speed: Number(this.values.speed), speedPolicy: 'design' } };
      try {
        const command = promoteGroundRoad(this.base, { routeId: id, acousticSourceId: `acoustic:${crypto.randomUUID()}`,
          interval: this.interval, specification, name: this.info.name });
        this.onApply?.(command, id); this.clear();
      } catch (error) {
        console.warn('Source promotion was not applied', error);
        let note = root.querySelector<HTMLElement>('.source-error');
        if (!note) { note = el('p'); note.className = 'source-error'; root.append(note); }
        note.textContent = 'Keep the old road. Its connections need checking.';
      }
    };
    root.append(form);
  }
  private makeHandles() {
    for (const [i, label] of ['Start', 'End'].entries()) {
      const button = el('button', label); button.className = 'source-endpoint'; button.dataset.end = String(i); button.title = `Drag ${label.toLowerCase()} along the road`;
      button.onpointerdown = event => {
        if (event.button !== 0) return;
        event.preventDefault(); event.stopPropagation(); button.setPointerCapture(event.pointerId);
        const enabled = this.view.controls.enabled; this.view.controls.enabled = false;
        const move = (event: PointerEvent) => {
          const p = this.view.pick(event.clientX, event.clientY); if (!p || !this.interval) return;
          const s = followSource(this.base.source(this.interval.sourceId)!, this.span, p.x, p.y, i ? this.interval.s1 : this.interval.s0);
          if (i === 0 && s < this.interval.s1 - 1) this.interval.s0 = s;
          if (i === 1 && s > this.interval.s0 + 1) this.interval.s1 = s;
          const length = this.root().querySelector('#source-length'); if (length) length.textContent = `${Math.round(this.interval.s1 - this.interval.s0)} m`;
          this.position(); this.view.requestRender();
        };
        const end = () => {
          button.removeEventListener('pointermove', move); button.removeEventListener('pointerup', end); button.removeEventListener('pointercancel', end);
          this.view.controls.enabled = enabled; this.endDrag = null;
        };
        this.endDrag = end;
        button.addEventListener('pointermove', move); button.addEventListener('pointerup', end); button.addEventListener('pointercancel', end);
      };
      this.overlay.append(button); this.handles.push(button);
    }
    this.position();
  }
  private position() {
    if (!this.interval) return;
    for (const [i, button] of this.handles.entries()) {
      const p: XYZ | null = this.base.position(this.interval.sourceId, i ? this.interval.s1 : this.interval.s0); if (!p) { button.hidden = true; continue; }
      const screen = this.view.project(p.x, p.y, p.z + 3); button.hidden = !screen.vis;
      button.style.left = `${screen.sx}px`; button.style.top = `${screen.sy}px`;
    }
  }
}
