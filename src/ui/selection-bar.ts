// Floating action bar over the profile, right where the player just picked something:
// - a selected stretch: what to build there (Bridge / Tunnel / Earthwork / Automatic), noise walls, deselect;
// - a picked spot on the road line (Automatic road height): pin the road's height there.

import type { StructureKind, StructureOverride } from '../core/overrides';
import type { StationRange } from '../state';
import type { ProfilePanel } from './profile';
import { activeStructure, structureButtons } from './structure-bar';

export interface SelectionBarEvents {
  structure?: (kind: StructureKind | null) => void;
  /** close the bar: deselect the stretch / spot */
  close?: (what: 'range' | 'station' | 'bend') => void;
  /** show the noise-wall tools for the selected stretch */
  walls?: () => void;
  pin?: (s: number, z: number | null) => void;
  /** pin the road height (Automatic) / add a height point (By hand) at station s, at a bend */
  heightAt?: (s: number) => void;
  /** the height field lost focus: redraw with the current design (updates are held while typing) */
  refresh?: () => void;
}

const km = (s: number) => (s / 1000).toFixed(2);

export class SelectionBar {
  ev: SelectionBarEvents = {};
  private el: HTMLElement;
  private what: { kind: 'range'; range: StationRange } | { kind: 'station'; s: number } | { kind: 'bend'; s: number } | null = null;

  constructor(host: HTMLElement, private canvas: HTMLCanvasElement, private profile: ProfilePanel) {
    this.el = document.createElement('div');
    this.el.className = 'sel-bar';
    this.el.hidden = true;
    host.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b || !this.what) return;
      if (b.dataset.structure !== undefined) this.ev.structure?.(b.dataset.structure === 'clear' ? null : Number(b.dataset.structure) as StructureKind);
      else if (b.classList.contains('close')) this.ev.close?.(this.what.kind);
      else if (b.classList.contains('walls')) this.ev.walls?.();
      else if (b.classList.contains('bend-height')) this.ev.heightAt?.(this.what.kind === 'range' ? this.what.range.s0 : this.what.s);
      else if (this.what.kind === 'station' && (b.classList.contains('pin-set') || b.classList.contains('pin-clear'))) {
        const z = this.el.querySelector<HTMLInputElement>('input')!.valueAsNumber;
        if (b.classList.contains('pin-clear')) this.ev.pin?.(this.what.s, null);
        else if (Number.isFinite(z)) this.ev.pin?.(this.what.s, z);
      }
      b.blur();
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !(e.target as HTMLElement).matches('input')) return;
      const set = this.el.querySelector<HTMLButtonElement>('.pin-set');
      (e.target as HTMLInputElement).blur(); // before the click, so the result redraws the bar
      set?.click();
    });
    // leaving the height field redraws the bar with the design, unless the focus moves to one of the bar's
    // buttons ("Pin this height" right after typing must still read the typed value)
    this.el.addEventListener('focusout', (e) => {
      if (!(e.target as HTMLElement).matches('input') || this.el.contains(e.relatedTarget as Node | null)) return;
      queueMicrotask(() => this.ev.refresh?.());
    });
  }

  showRange(range: StationRange, overrides: readonly StructureOverride[] = []) {
    this.what = { kind: 'range', range };
    this.el.className = 'sel-bar range';
    this.el.innerHTML = `<span class="where">km ${km(range.s0)}–${km(range.s1)} <small>${((range.s1 - range.s0) / 1000).toFixed(2)} km</small></span>
      <span class="lbl">Build here:</span>${structureButtons(activeStructure(range, overrides))}
      <button class="walls" title="Add or remove a noise wall along this stretch (Build tools on the right)">Noise wall…</button>
      <button class="close" title="Deselect (Esc)">✕</button>`;
    this.el.hidden = false;
    this.place();
  }

  /** a spot on the road line: pin its height (only Automatic uses pins) */
  showStation(s: number, z: number, pinned: boolean, auto: boolean) {
    this.what = { kind: 'station', s };
    this.el.className = 'sel-bar station';
    const focused = this.el.contains(document.activeElement) && document.activeElement?.matches('input');
    if (focused) { this.place(); return; } // do not overwrite what the player is typing
    this.el.innerHTML = `<span class="where">km ${km(s)}</span>
      <label title="Automatic will choose the cheapest legal heights that pass through this one">Road height here <input type="number" step="0.1" value="${z.toFixed(1)}"> m</label>
      <button class="pin-set"${auto ? '' : ' disabled'}>${pinned ? 'Update pin' : 'Pin this height'}</button>
      ${pinned ? '<button class="pin-clear" title="Let Automatic choose the height here again">Unpin</button>' : ''}
      ${auto ? '' : '<span class="note">Pins only work with Automatic road height.</span>'}
      <button class="close" title="Close (Esc)">✕</button>`;
    this.el.hidden = false;
    this.place();
  }

  /** a bend picked in the profile: change the road height right there */
  showBend(i: number, s: number, auto: boolean) {
    this.what = { kind: 'bend', s };
    this.el.className = 'sel-bar bend';
    this.el.innerHTML = `<span class="where">Bend ${i + 1} <small>km ${km(s)}</small></span>
      <button class="bend-height" title="${auto ? 'Automatic will keep the road at its current height here; then drag the pin up or down' : 'A height point at the bend; then drag it up or down'}">${auto ? 'Pin road height here' : 'Add height point here'}</button>
      <button class="close" title="Close (Esc)">✕</button>`;
    this.el.hidden = false;
    this.place();
  }

  get showing() { return this.what?.kind ?? null; }

  hide(what?: 'range' | 'station' | 'bend') {
    if (what && this.what?.kind !== what) return;
    this.what = null;
    this.el.hidden = true;
  }

  /** over the middle of the selection (or the spot), along the bottom of the chart (over the ground, where
   * it hides the least), inside the plot */
  place() {
    // a pending profile paint places the bar when it runs (onDraw): reading the profile's scales
    // now would force that paint synchronously, once per update during a drag
    if (!this.what || this.el.hidden || this.profile.drawPending) return;
    const p = this.profile;
    const mid = this.what.kind === 'range' ? (this.what.range.s0 + this.what.range.s1) / 2 : this.what.s;
    const w = this.el.offsetWidth;
    const lo = this.canvas.offsetLeft + p.plotLeft, hi = this.canvas.offsetLeft + p.plotRight - w;
    const x = Math.max(lo, Math.min(hi, this.canvas.offsetLeft + p.stationX(mid) - w / 2));
    this.el.style.left = `${x}px`;
    this.el.style.top = `${this.canvas.offsetTop + p.chartBottom - this.el.offsetHeight - 4}px`;
  }
}
