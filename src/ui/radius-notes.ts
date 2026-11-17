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
  /** a drag of bend `dragged`: its and its neighbours' notes are now `lowered` */
  record(route: string | null, dragged: number, lowered: readonly LoweredRadius[]) {
    let m = notes.get(route ?? '');
    if (!m) notes.set(route ?? '', m = new Map());
    for (let k = dragged - 1; k <= dragged + 1; k++) m.delete(k);
    for (const l of lowered) m.set(l.i, { from: l.from, to: l.to });
  },
};
