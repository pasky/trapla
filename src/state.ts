// Design store: current design, undo/redo history, localStorage persistence, best valid design.

import { COST_MODEL_VERSION } from './core/data/prices';
import type { Design } from './core/evaluate';
import { normalizeOverrides } from './core/overrides';
import { normalizeGradePins } from './core/grade-pins';

/** Score compatibility includes both code rules and the ground pack used to price the design. */
export interface Best { cost: number; design: Design; at: string; model?: number; pricingData?: string }

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export class Store {
  design: Design;
  private history: Design[] = [];
  private idx = -1;
  private listeners: ((d: Design, committed: boolean) => void)[] = [];
  best: Best | null = null;

  constructor(private key: string, private initial: () => Design, private pricingData = 'unmapped') {
    let d: Design | null = null;
    try {
      const raw = localStorage.getItem(key + '.design');
      if (raw) d = JSON.parse(raw);
      const b = localStorage.getItem(key + '.best');
      if (b) this.best = JSON.parse(b);
      // a best score from an older cost model is not comparable with today's bills: forget it
      if (this.best && (this.best.model !== COST_MODEL_VERSION || this.best.pricingData !== pricingData)) this.best = null;
    } catch { d = null; }
    // designs saved by the first prototype started from a terrain-hugging (invalid) profile: drop those
    this.design = d && Array.isArray(d.pis) && !(d as { naive?: boolean }).naive ? d : initial();
    this.design.structureOverrides = normalizeOverrides(this.design.structureOverrides);
    this.design.gradePins = normalizeGradePins(this.design.gradePins);
    this.push();
  }

  on(fn: (d: Design, committed: boolean) => void) { this.listeners.push(fn); }

  private emit(committed: boolean) { for (const l of this.listeners) l(this.design, committed); }

  private push() {
    this.history = this.history.slice(0, this.idx + 1);
    this.history.push(clone(this.design));
    if (this.history.length > 200) this.history.shift();
    this.idx = this.history.length - 1;
    try { localStorage.setItem(this.key + '.design', JSON.stringify(this.design)); } catch { /* quota */ }
  }

  /** transient update (e.g. while dragging); call commit() at the end */
  update(fn: (d: Design) => void, commit = true) {
    fn(this.design);
    if (commit) this.push();
    this.emit(commit);
  }

  commit() { this.push(); this.emit(true); }

  replace(d: Design) {
    this.design = clone(d);
    this.design.structureOverrides = normalizeOverrides(this.design.structureOverrides);
    this.design.gradePins = normalizeGradePins(this.design.gradePins);
    this.push(); this.emit(true);
  }

  canUndo() { return this.idx > 0; }
  canRedo() { return this.idx < this.history.length - 1; }
  undo() { if (this.canUndo()) { this.idx--; this.design = clone(this.history[this.idx]); this.persist(); this.emit(true); } }
  redo() { if (this.canRedo()) { this.idx++; this.design = clone(this.history[this.idx]); this.persist(); this.emit(true); } }
  reset() { this.replace(this.initial()); }

  private persist() { try { localStorage.setItem(this.key + '.design', JSON.stringify(this.design)); } catch { /* */ } }

  offerBest(cost: number, d: Design) {
    if (this.best && this.best.cost <= cost) return false;
    this.best = { cost, design: clone(d), at: new Date().toISOString(), model: COST_MODEL_VERSION, pricingData: this.pricingData };
    try { localStorage.setItem(this.key + '.best', JSON.stringify(this.best)); } catch { /* */ }
    return true;
  }
}

/** The start: straight A→B with the automatic (norm-abiding) grade line — an honest, if expensive, bill. */
export function startDesign(): Design {
  return { category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [], structureOverrides: [] };
}

/** a stretch of the route picked for the cost breakdown (stations in metres), or null = whole route */
export interface StationRange { s0: number; s1: number }

/**
 * UI state shared between the profile panel, the HUD and the map: the selected station range.
 * The renderer only needs `range` and `on()` (see render/extras.ts).
 */
export class RangeSelection {
  range: StationRange | null = null;
  private listeners: ((r: StationRange | null) => void)[] = [];
  on(fn: (r: StationRange | null) => void) { this.listeners.push(fn); }
  set(r: StationRange | null) {
    this.range = r && r.s1 > r.s0 ? { s0: r.s0, s1: r.s1 } : null;
    for (const l of this.listeners) l(this.range);
  }
}
