// Radii the editor lowered to fit during a bend drag (core/fit-radii.ts), per route: what was set before, for the
// bend card ("Your radius, lowered from 400 m to 340 m to fit"). A note holds while the bend keeps that radius.
import type { LoweredRadius } from '../core/fit-radii';

const notes = new Map<string, Map<number, { from: number; to: number }>>();

export const radiusNotes = {
  /** bend i's note, while its radius is still the lowered one */
  get(route: string | null, i: number, r: number | null): { from: number; to: number } | null {
    const n = notes.get(route ?? '')?.get(i);
    return n && r !== null && Math.abs(n.to - r) < 1e-6 ? n : null;
  },
  /** the radius bend i had been set to before any lowering (its own radius without a note) */
  wanted(route: string | null, i: number, r: number | null): number | null {
    return this.get(route, i, r)?.from ?? r;
  },
  /** bend `from` is now bend `to` (dragged past its neighbours, core/bend-order.ts): the notes go with the bends */
  move(route: string | null, from: number, to: number) {
    const m = notes.get(route ?? ''); if (!m || from === to) return;
    const moved = new Map<number, { from: number; to: number }>();
    for (const [k, n] of m) moved.set(k === from ? to : from < to && k > from && k <= to ? k - 1 : to < from && k >= to && k < from ? k + 1 : k, n);
    notes.set(route ?? '', moved);
  },
  /** bend `i` is gone (left straight by a drag, core/bend-order.ts): its note with it, the later ones one down */
  drop(route: string | null, i: number) {
    const m = notes.get(route ?? ''); if (!m) return;
    const kept = new Map<number, { from: number; to: number }>();
    for (const [k, n] of m) if (k !== i) kept.set(k > i ? k - 1 : k, n);
    notes.set(route ?? '', kept);
  },
  /** a drag of bend `dragged`: its and its neighbours' notes are now `lowered` */
  record(route: string | null, dragged: number, lowered: readonly LoweredRadius[]) {
    let m = notes.get(route ?? '');
    if (!m) notes.set(route ?? '', m = new Map());
    for (let k = dragged - 1; k <= dragged + 1; k++) m.delete(k);
    for (const l of lowered) m.set(l.i, { from: l.from, to: l.to });
  },
};
