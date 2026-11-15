// Design store: current design, undo/redo history, localStorage persistence, best valid design.

import { COST_MODEL_VERSION } from './core/data/prices';
import type { Design } from './core/evaluate';
import { normalizeOverrides } from './core/overrides';
import { normalizeGradePins } from './core/grade-pins';
import { normalizeCrossingOverrides } from './core/crossings';
import { normalizeBuildingOverrides, normalizeWallOverrides } from './core/build-controls';
import { readLegacyBytes } from './legacy-storage';

/** Score compatibility includes both code rules and the ground pack used to price the design. */
export interface Best { cost: number; design: Design; at: string; model?: number; pricingData?: string }

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const normalizeDesign = (d: Design) => {
  d.structureOverrides = normalizeOverrides(d.structureOverrides);
  d.gradePins = normalizeGradePins(d.gradePins);
  d.crossingOverrides = normalizeCrossingOverrides(d.crossingOverrides);
  d.buildingOverrides = normalizeBuildingOverrides(d.buildingOverrides);
  d.wallOverrides = normalizeWallOverrides(d.wallOverrides);
};

export class Store {
  design: Design;
  private history: Design[] = [];
  private idx = -1;
  private listeners: ((d: Design, committed: boolean) => void)[] = [];
  best: Best | null = null;
  objectDataChanged = false;
  /** Unknown/malformed bytes are recoverable, never overwritten by the constructor or later edits. */
  storageProblem: string | null = null;
  private persistAllowed = true;

  constructor(private key: string, private initial: () => Design, private pricingData = 'unmapped', private objectData = '') {
    let d: Design | null = null;
    try {
      const original = readLegacyBytes(localStorage, key);
      if (original.design !== null) {
        try {
          const parsed = JSON.parse(original.design);
          if (!parsed || typeof parsed !== 'object' || 'schemaVersion' in parsed || !Array.isArray(parsed.pis)
            || !Array.isArray(parsed.vpis) || !Number.isFinite(parsed.speed) || !['auto', 'manual'].includes(parsed.profileMode)
            || !['S7.5', 'S9.5', 'S11.5', 'D27.5'].includes(parsed.category)) throw new Error('Saved design needs recovery');
          d = parsed;
        } catch (error) { this.persistAllowed = false; this.storageProblem = String(error); }
      }
      // Read usable current work BEFORE a backup write can fail (quota/read-only storage).
      // Failure below keeps that design in memory, read-only, rather than displaying defaults.
      if ((original.design !== null || original.best !== null) && localStorage.getItem(key + '.legacy-original') === null)
        localStorage.setItem(key + '.legacy-original', JSON.stringify(original));
      if (original.best !== null) this.best = JSON.parse(original.best);
      // a best score from an older cost model is not comparable with today's bills: forget it
      if (this.best && (this.best.model !== COST_MODEL_VERSION || this.best.pricingData !== pricingData
        || (objectData && this.best.design.objectData && this.best.design.objectData !== objectData))) this.best = null;
      // Once accepted, legacy bests must acquire the SAME identity as the current design. Leaving
      // them unstamped would let Load best rebind old positional IDs after a later pack rebuild.
      if (this.persistAllowed && this.best && objectData && !this.best.design.objectData) {
        this.best.design.objectData = objectData;
        try { localStorage.setItem(key + '.best', JSON.stringify(this.best)); } catch { /* quota */ }
      }
    } catch (error) { this.best = null; this.persistAllowed = false; this.storageProblem = String(error); }
    // designs saved by the first prototype started from a terrain-hugging (invalid) profile: drop those
    this.design = d && Array.isArray(d.pis) && !(d as { naive?: boolean }).naive ? d : initial();
    this.prepare(this.design);
    this.push();
  }

  private prepare(d: Design) {
    normalizeDesign(d);
    if (!this.objectData) return;
    if (d.objectData && d.objectData !== this.objectData) {
      this.objectDataChanged = true;
      d.buildingOverrides = []; d.crossingOverrides = [];
    }
    d.objectData = this.objectData;
  }

  on(fn: (d: Design, committed: boolean) => void) { this.listeners.push(fn); }

  private emit(committed: boolean) { for (const l of this.listeners) l(this.design, committed); }

  private push() {
    this.history = this.history.slice(0, this.idx + 1);
    this.history.push(clone(this.design));
    if (this.history.length > 200) this.history.shift();
    this.idx = this.history.length - 1;
    this.persist();
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
    this.prepare(this.design);
    this.push(); this.emit(true);
  }

  canUndo() { return this.idx > 0; }
  canRedo() { return this.idx < this.history.length - 1; }
  /** what Undo / Redo would change, in plain words (for the buttons' tooltips) */
  undoLabel() { return this.canUndo() ? describeChange(this.history[this.idx - 1], this.history[this.idx]) : ''; }
  redoLabel() { return this.canRedo() ? describeChange(this.history[this.idx], this.history[this.idx + 1]) : ''; }
  undo() { if (this.canUndo()) { this.idx--; this.design = clone(this.history[this.idx]); this.persist(); this.emit(true); } }
  redo() { if (this.canRedo()) { this.idx++; this.design = clone(this.history[this.idx]); this.persist(); this.emit(true); } }
  reset() { this.replace(this.initial()); }

  private persist() { if (this.persistAllowed) try { localStorage.setItem(this.key + '.design', JSON.stringify(this.design)); } catch { /* */ } }

  offerBest(cost: number, d: Design) {
    if (!this.persistAllowed || this.best && this.best.cost <= cost) return false;
    this.best = { cost, design: clone(d), at: new Date().toISOString(), model: COST_MODEL_VERSION, pricingData: this.pricingData };
    try { localStorage.setItem(this.key + '.best', JSON.stringify(this.best)); } catch { /* */ }
    return true;
  }
}

/** a short plain-words description of the edit that turns design `a` into `b` */
export function describeChange(a: Design, b: Design): string {
  const same = (k: keyof Design) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null);
  const parts: string[] = [];
  if (a.pis.length < b.pis.length) parts.push('add a bend');
  else if (a.pis.length > b.pis.length) parts.push('delete a bend');
  else if (a.pis.some((p, i) => p.x !== b.pis[i].x || p.y !== b.pis[i].y)) parts.push('move a bend');
  else if (!same('pis')) parts.push('bend radius');
  if (a.profileMode !== b.profileMode) parts.push(b.profileMode === 'auto' ? 'road height back to Automatic' : 'road height by hand');
  else if (!same('vpis')) parts.push(a.vpis.length < b.vpis.length ? 'add a height point' : a.vpis.length > b.vpis.length ? 'delete a height point' : 'change a height point');
  if (!same('structureOverrides')) parts.push('bridge / tunnel / earthwork choice');
  if (!same('gradePins')) parts.push('pinned height');
  if (!same('crossingOverrides')) {
    const types = (d: Design) => JSON.stringify((d.crossingOverrides ?? []).map(o => [o.roadId, o.type]));
    parts.push(types(a) === types(b) ? 'reroute path' : 'road crossing choice');
  }
  if (!same('buildingOverrides')) parts.push('building decision');
  if (!same('wallOverrides')) parts.push('noise wall');
  if (a.category !== b.category) parts.push('road category');
  if (a.speed !== b.speed) parts.push('design speed');
  return parts.join(', ') || 'last change';
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
