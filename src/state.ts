// Design store: current design, undo/redo history, localStorage persistence, best valid design.

import type { Design } from './core/evaluate';
import type { Vec2 } from './core/horizontal';
import type { VPI } from './core/vertical';

export interface Best { cost: number; design: Design; at: string }

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export class Store {
  design: Design;
  /** true while the profile shown is the naive terrain-hugging start profile */
  private history: Design[] = [];
  private idx = -1;
  private listeners: ((d: Design, committed: boolean) => void)[] = [];
  best: Best | null = null;

  constructor(private key: string, private initial: () => Design) {
    let d: Design | null = null;
    try {
      const raw = localStorage.getItem(key + '.design');
      if (raw) d = JSON.parse(raw);
      const b = localStorage.getItem(key + '.best');
      if (b) this.best = JSON.parse(b);
    } catch { d = null; }
    this.design = d && Array.isArray(d.pis) ? d : initial();
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

  replace(d: Design) { this.design = clone(d); this.push(); this.emit(true); }

  canUndo() { return this.idx > 0; }
  canRedo() { return this.idx < this.history.length - 1; }
  undo() { if (this.canUndo()) { this.idx--; this.design = clone(this.history[this.idx]); this.persist(); this.emit(true); } }
  redo() { if (this.canRedo()) { this.idx++; this.design = clone(this.history[this.idx]); this.persist(); this.emit(true); } }
  reset() { this.replace(this.initial()); }

  private persist() { try { localStorage.setItem(this.key + '.design', JSON.stringify(this.design)); } catch { /* */ } }

  offerBest(cost: number, d: Design) {
    if (this.best && this.best.cost <= cost) return false;
    this.best = { cost, design: clone(d), at: new Date().toISOString() };
    try { localStorage.setItem(this.key + '.best', JSON.stringify(this.best)); } catch { /* */ }
    return true;
  }
}

/** The deliberately naive start: straight A→B, grade line drawn on the terrain every 250 m. */
export function naiveDesign(a: Vec2, b: Vec2, groundAt: (x: number, y: number) => number): Design {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(2, Math.round(L / 250));
  const vpis: VPI[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    vpis.push({ s: t * L, z: Math.round(groundAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t) * 10) / 10, r: null });
  }
  return { category: 'S9.5', speed: 90, pis: [], profileMode: 'manual', vpis, naive: true } as Design;
}
