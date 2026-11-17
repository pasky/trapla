// Cost and quantities of a stretch of the route (whole station cells), from the per-cell arrays of
// an evaluation result. The whole route is just the range 0 … length.

import { cellLength, sumParts, type CostBreakdown } from './cost';
import type { Result } from './evaluate';
import { KIND } from './structures';

/** The station cell of chainage `s` on a stationed line (n stations every ds metres), kept inside it. */
export const stationIndex = (r: { n: number; ds: number }, s: number): number => Math.max(0, Math.min(r.n - 1, Math.round(s / r.ds)));

export interface RangeSummary {
  /** first and last station cell */
  i0: number;
  i1: number;
  /** the cells' extent, m */
  s0: number;
  s1: number;
  length: number;
  cost: CostBreakdown;
  quantities: {
    cut: number; fill: number;
    footprint: number; forestArea: number;
    bridgeLength: number; tunnelLength: number;
    /** length inside built-up areas (not in tunnel), m */
    urbanLength: number;
    /** buildings removed for the footprint, excluding noise buyouts */
    buildings: number;
    noiseBuyouts: number;
    wallLength: number;
    wallArea: number;
    /** crossings of existing roads in the range / those that cost something */
    crossings: number;
    crossingsPaid: number;
  };
}

/** station cells whose station lies in [s0, s1] (at least one) */
export function cellsInRange(r: { n: number; ds: number }, s0: number, s1: number): [number, number] {
  let i0 = Math.max(0, Math.ceil(s0 / r.ds - 1e-9)), i1 = Math.min(r.n - 1, Math.floor(s1 / r.ds + 1e-9));
  if (i1 < i0) i0 = i1 = stationIndex(r, (s0 + s1) / 2);
  return [i0, i1];
}

export function rangeSummary(r: Result, s0 = 0, s1 = r.length): RangeSummary {
  const [i0, i1] = cellsInRange(r, s0, s1);
  const start = Math.max(0, (i0 - 0.5) * r.ds), end = Math.min(r.length, (i1 + 0.5) * r.ds);
  const q = { cut: 0, fill: 0, footprint: 0, forestArea: 0, bridgeLength: 0, tunnelLength: 0, urbanLength: 0, buildings: 0, noiseBuyouts: 0, wallLength: 0, wallArea: 0, crossings: 0, crossingsPaid: 0 };
  let length = 0;
  for (let i = i0; i <= i1; i++) {
    const len = cellLength(i, r.n, r.ds);
    length += len;
    const k = r.kind[i];
    if (k === KIND.bridge) q.bridgeLength += len;
    else if (k === KIND.tunnel) q.tunnelLength += len;
    else {
      q.cut += r.cut[i] * len; q.fill += r.fill[i] * len;
      q.footprint += r.cell.width[i] * len;
      q.forestArea += r.cell.width[i] * r.cell.forest[i] * len;
    }
    if (k !== KIND.tunnel) q.urbanLength += r.cell.urban[i] * len;
    // as billed: along the walls' own lines (a cut-top wall beside a bend is longer or shorter than the axis)
    q.wallLength += r.cell.wallLength[i]; q.wallArea += r.cell.wallArea[i];
  }
  for (const b of r.demolished) if (b.i >= i0 && b.i <= i1) q.buildings++;
  for (const b of r.boughtOut) if (b.i >= i0 && b.i <= i1) q.noiseBuyouts++;
  for (const c of r.crossings) if (c.i >= i0 && c.i <= i1) { q.crossings++; if (c.cost > 0) q.crossingsPaid++; }
  return {
    i0, i1, s0: start, s1: end, length,
    cost: sumParts(r.parts, i0, i1), quantities: q,
  };
}
