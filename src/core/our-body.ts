// Our road's own earth body as drawn (render/earthwork-surface.ts, render/view.ts's cones): one reading for the crossing
// engine's slope screen (crossing-geometry.ts: a bridge over us and a reroute keep their slopes out of it) and for the
// works-clash screen (works-clash.ts), so that what Auto builds is what the screen passes.
import { type AbutmentCone, coneSurface } from './abutment-cone';
import { KIND } from './structures';

export interface BodyRoute {
  n: number; x: ArrayLike<number>; y: ArrayLike<number>; s: ArrayLike<number>; grade: ArrayLike<number>; kind: ArrayLike<number>;
  /** daylight reach either side of the axis (positive to the left / right), m */
  dayL: ArrayLike<number>; dayR: ArrayLike<number>;
  /** stations kept as the old road (a rebuilt stretch's kept part): no earth of ours there */
  keptCells?: ArrayLike<number>;
}
export type BodyPart = 'formation' | 'cut' | 'fill';
export interface OurBody {
  /** what of our body (x, y) lies in, `inset` m inside its edge (else null) */
  at(x: number, y: number, inset?: number): BodyPart | null;
  /** a lower bound on how far (x, y) lies outside our body, m (0 or less: in it or at its edge) */
  gap(x: number, y: number): number;
}

/**
 * The body: between two earth stations, the formation and its slopes out to the daylight points (linear between them, as
 * drawn); at a station where earth meets a structure, the earth station's section out to half way (its cell, as billed);
 * and the cones of fill in front of the abutments from the last earth station into the bridge (abutment-cone.ts), where
 * their surface stands over the ground.
 */
// (each station's segment in the grid cells its body can reach and PAD beyond: a point in a cell without it lies more
// than PAD off it, a gap's lower bound)
const CELL = 50, PAD = 30, cellOf = (cx: number, cy: number) => cx * 1_000_003 + cy;
/** The grid of a route's stations, kept while its line and daylight stay the same (the crossing engine reads the body
 * once per build, and builds a route's crossings many times over: a copy of what it was built from is checked). */
const grids = new WeakMap<object, { from: Float64Array; crown: number; grid: Map<number, number[]> }>();
function gridOf(r: BodyRoute, crownWidth: number) {
  const n = r.n, from = new Float64Array(4 * n);
  for (let i = 0; i < n; i++) { from[4 * i] = r.x[i]; from[4 * i + 1] = r.y[i]; from[4 * i + 2] = r.dayL[i]; from[4 * i + 3] = r.dayR[i]; }
  const kept = grids.get(r.dayL);
  if (kept && kept.crown === crownWidth && kept.from.length === from.length && kept.from.every((v, i) => Object.is(v, from[i]))) return kept.grid;
  const grid = new Map<number, number[]>();
  for (let i = 0; i + 1 < n; i++) {
    const reach = Math.max(r.dayL[i], r.dayR[i], r.dayL[i + 1], r.dayR[i + 1], crownWidth) + PAD;
    for (let cx = Math.floor((Math.min(r.x[i], r.x[i + 1]) - reach) / CELL); cx <= Math.floor((Math.max(r.x[i], r.x[i + 1]) + reach) / CELL); cx++)
      for (let cy = Math.floor((Math.min(r.y[i], r.y[i + 1]) - reach) / CELL); cy <= Math.floor((Math.max(r.y[i], r.y[i + 1]) + reach) / CELL); cy++) {
        const key = cellOf(cx, cy), list = grid.get(key);
        if (list) list.push(i); else grid.set(key, [i]);
      }
  }
  if (typeof r.dayL === 'object') grids.set(r.dayL, { from, crown: crownWidth, grid });
  return grid;
}

export function ourBody(r: BodyRoute, crownWidth: number, cones: readonly AbutmentCone[] | undefined,
  heightAt: (x: number, y: number) => number): OurBody {
  const grid = gridOf(r, crownWidth);
  // (each cone in the frame of its abutment: u into the bridge from where its fill starts, the last earth station)
  const frames = (cones ?? []).filter(c => !c.end).map(c => ({ c, u0: -Math.abs(r.s[c.earthCell] - c.s) }));
  const inCone = (x: number, y: number, inset: number) => {
    for (const { c, u0 } of frames) {
      const dx = x - c.x, dy = y - c.y, u = dx * c.tx + dy * c.ty, v = -dx * c.ty + dy * c.tx;
      if (u < u0 || u > c.length || Math.abs(v) > c.side) continue;
      if (coneSurface(c, Math.max(0, u) + (u > 0 ? inset : 0), Math.abs(v) + inset) > heightAt(x, y)) return u <= 0 && Math.abs(v) <= crownWidth / 2 + 1 ? 'formation' : 'fill';
    }
    return null;
  };
  /** the earth section the point lies across: its lateral offset and reach, the station pair (else undefined) */
  const section = (x: number, y: number, visit: (i: number, t: number, lat: number, reach: number) => boolean | void) => {
    for (const i of grid.get(cellOf(Math.floor(x / CELL), Math.floor(y / CELL))) ?? []) {
      const dx = r.x[i + 1] - r.x[i], dy = r.y[i + 1] - r.y[i], len2 = dx * dx + dy * dy;
      const raw = ((x - r.x[i]) * dx + (y - r.y[i]) * dy) / (len2 || 1), t = Math.max(0, Math.min(1, raw));
      // (past a station between two segments, on the outside of a bend: round that station, as its section's quads
      // fan out to its daylight points; not past the route's own ends)
      if (raw !== t && (raw < 0 ? i === 0 : i + 1 === r.n - 1)) continue;
      const side = ((y - r.y[i]) * dx - (x - r.x[i]) * dy) / Math.sqrt(len2 || 1), k = t < 0.5 ? i : i + 1;
      const lat = raw === t ? side : Math.sign(side || 1) * Math.hypot(x - r.x[k], y - r.y[k]);
      // (over a tunnel or under a bridge is no earth of ours but a cone: piers are checked on their own)
      if (r.kind[k] !== KIND.earth || r.keptCells?.[k]) continue;
      const day = lat >= 0 ? r.dayL : r.dayR, reach = r.kind[i] === r.kind[i + 1] ? day[i] + (day[i + 1] - day[i]) * t : day[k];
      if (visit(i, t, lat, reach)) return;
    }
  };
  return {
    at(x, y, inset = 0) {
      let out: BodyPart | null = null;
      section(x, y, (i, t, lat, reach) => {
        if (Math.abs(lat) > reach - inset) return;
        // (dug away where the natural ground stands above our grade there)
        out = Math.abs(lat) <= crownWidth / 2 + 1 ? 'formation' : heightAt(x, y) > r.grade[i] + (r.grade[i + 1] - r.grade[i]) * t ? 'cut' : 'fill';
        return true;
      });
      return out ?? inCone(x, y, inset);
    },
    gap(x, y) {
      let gap = PAD;
      section(x, y, (_i, _t, lat, reach) => { gap = Math.min(gap, Math.abs(lat) - reach); });
      // (a cone: the rectangle its fill can cover)
      for (const { c, u0 } of frames) {
        const dx = x - c.x, dy = y - c.y, u = dx * c.tx + dy * c.ty, v = -dx * c.ty + dy * c.tx;
        gap = Math.min(gap, Math.hypot(Math.max(0, u0 - u, u - c.length), Math.max(0, Math.abs(v) - c.side)));
      }
      return gap;
    },
  };
}
