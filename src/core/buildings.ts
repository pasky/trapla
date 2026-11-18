// Buildings from the OSM overlay: valuation (floor area × (price × 1.5 + demolition)), oriented
// footprint rectangles for hit tests, and a spatial hash for footprint / noise queries.

import { BUILDING_KIND, BUILDING_KINDS, BUILDING_RULES, URBAN_LAND } from './data/urban';
import * as dm from './detmath';

/** pack row `binfo[j]`: [footprint m², tagged levels (0 = none), kind, bbox centre x, y, half-length,
 * half-width, angle of the long axis in degrees] */
export type BuildingInfo = [number, number, number, number, number, number, number, number];

/** storeys used for the valuation: the OSM tag when sane, otherwise the kind's default */
export function buildingLevels(levels: number, kind: number): number {
  const row = BUILDING_KINDS[kind] ?? BUILDING_KINDS[BUILDING_KIND.house];
  return levels >= 1 ? Math.min(levels, row.maxLevels) : row.defaultLevels;
}

/** Building-only replacement-value estimate × statutory purchase multiple, plus demolition, CZK. */
export function buildingCost(area: number, levels: number, kind: number): number {
  const row = BUILDING_KINDS[kind] ?? BUILDING_KINDS[BUILDING_KIND.house];
  const floor = area * buildingLevels(levels, kind);
  return floor * (row.pricePerM2 * BUILDING_RULES.purchaseMultiplier + row.demolitionPerM2);
}

/** Noise acquisition includes a separate PROVISIONAL plot. Footprint takes pay only corridor land,
 * not a whole plot (working-strip removals / partial takes remain approximate). No cadastral parcels:
 * the noise allowance is additional to corridor land, with no parcel-overlap calculation. */
export function noiseBuyoutCost(building: number, footprint: number): number {
  const plot = Math.max(BUILDING_RULES.buyoutPlotMinimum, footprint * BUILDING_RULES.buyoutPlotMultiple);
  return building + plot * URBAN_LAND.buildingLandPerM2 * URBAN_LAND.multiplier;
}

export class BuildingIndex {
  private readonly cell = 50;
  private readonly map = new Map<number, number[]>();
  private grid?: { stamp: Int32Array; near: Int32Array; dist: Float64Array; gen: number };
  readonly n: number;
  /** building-only purchase + demolition, excl. land, CZK */
  readonly cost: Float64Array;
  readonly kind: Uint8Array;
  readonly area: Float64Array;
  /** 1 where people live (noise rule) */
  readonly dwelling: Uint8Array;
  /** occupied storeys (tagged levels, otherwise the kind's default) */
  readonly levels: Float64Array;
  // oriented bounding rectangle: centre, unit long axis, half extents
  private readonly ox: Float64Array;
  private readonly oy: Float64Array;
  private readonly ux: Float64Array;
  private readonly uy: Float64Array;
  private readonly hl: Float64Array;
  private readonly hw: Float64Array;

  /**
   * `items`: [x, y, radius] per building (centroid, max vertex distance); each is registered in every
   * cell its circle (or footprint rectangle) touches. `info` (parallel, optional): attributes from the pack; without it a
   * building is a house on a square inscribed in its circle.
   */
  constructor(readonly items: [number, number, number][], info?: (BuildingInfo | null)[]) {
    const n = (this.n = items.length);
    this.cost = new Float64Array(n); this.kind = new Uint8Array(n); this.area = new Float64Array(n);
    this.dwelling = new Uint8Array(n); this.levels = new Float64Array(n);
    this.ox = new Float64Array(n); this.oy = new Float64Array(n); this.ux = new Float64Array(n);
    this.uy = new Float64Array(n); this.hl = new Float64Array(n); this.hw = new Float64Array(n);
    items.forEach((b, i) => {
      const f = info?.[i];
      let levels = 0;
      if (f) {
        this.area[i] = f[0]; levels = f[1]; this.kind[i] = f[2];
        this.ox[i] = f[3]; this.oy[i] = f[4]; this.hl[i] = f[5]; this.hw[i] = f[6];
        const a = (f[7] * Math.PI) / 180;
        this.ux[i] = dm.cos(a); this.uy[i] = dm.sin(a);
      } else {
        const h = b[2] / Math.SQRT2;
        this.area[i] = b[2] * b[2]; this.kind[i] = BUILDING_KIND.house;
        this.ox[i] = b[0]; this.oy[i] = b[1]; this.hl[i] = h; this.hw[i] = h; this.ux[i] = 1; this.uy[i] = 0;
      }
      this.cost[i] = buildingCost(this.area[i], levels, this.kind[i]);
      this.levels[i] = buildingLevels(levels, this.kind[i]);
      this.dwelling[i] = BUILDING_KINDS[this.kind[i]]?.dwelling ? 1 : 0;
      // reach of the rectangle's corners from the centroid (they may lie outside the vertex circle)
      const reach = Math.max(b[2], Math.hypot(this.ox[i] - b[0], this.oy[i] - b[1]) + Math.hypot(this.hl[i], this.hw[i]));
      const c0 = Math.floor((b[0] - reach) / this.cell), c1 = Math.floor((b[0] + reach) / this.cell);
      const r0 = Math.floor((b[1] - reach) / this.cell), r1 = Math.floor((b[1] + reach) / this.cell);
      for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
        const k = this.key(cx, cy);
        let a = this.map.get(k);
        if (!a) this.map.set(k, (a = []));
        a.push(i);
      }
    });
  }

  private key(cx: number, cy: number) { return cx * 100003 + cy; }

  /** call fn(index) (possibly repeatedly) for buildings whose circle may come within r of (x,y) */
  near(x: number, y: number, r: number, fn: (i: number) => void) {
    const c0 = Math.floor((x - r) / this.cell), c1 = Math.floor((x + r) / this.cell);
    const r0 = Math.floor((y - r) / this.cell), r1 = Math.floor((y + r) / this.cell);
    for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
      const a = this.map.get(this.key(cx, cy));
      if (a) for (const i of a) fn(i);
    }
  }

  /** Every hash cell within `r` of any of the points that holds buildings, in the order the points reach
   * them: its buildings
   * (each may be registered in several cells), the index of the point nearest the cell's centre, and the
   * cell's centre and half size. */
  alongCells(x: ArrayLike<number>, y: ArrayLike<number>, n: number, r: number,
    fn: (items: readonly number[], near: number, cx: number, cy: number, half: number) => void) {
    if (!n) return;
    // every `step`-th point (about r/4 apart), reaching the ones between too (and the last one)
    const ds = n > 1 ? Math.hypot(x[1] - x[0], y[1] - y[0]) : 0;
    const step = Math.max(2, Math.floor(r / 4 / Math.max(1e-6, ds))), rr = r + step * ds / 2 + ds;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) { x0 = Math.min(x0, x[i]); x1 = Math.max(x1, x[i]); y0 = Math.min(y0, y[i]); y1 = Math.max(y1, y[i]); }
    const c0 = Math.floor((x0 - rr) / this.cell), r0 = Math.floor((y0 - rr) / this.cell);
    const nc = Math.floor((x1 + rr) / this.cell) - c0 + 1, nr = Math.floor((y1 + rr) / this.cell) - r0 + 1;
    // scratch grids reused across calls (a stamp marks this call's cells: no clearing)
    let g = this.grid;
    if (!g || g.stamp.length < nc * nr) this.grid = g = { stamp: new Int32Array(nc * nr), near: new Int32Array(nc * nr), dist: new Float64Array(nc * nr), gen: 0 };
    if (++g.gen === 0x7fffffff) { g.stamp.fill(0); g.gen = 1; }
    const { stamp, near, dist } = g, gen = g.gen, marked: number[] = [];
    for (let i = 0; i < n; i = i + step < n || i === n - 1 ? i + step : n - 1) {
      const a0 = Math.floor((x[i] - rr) / this.cell) - c0, a1 = Math.floor((x[i] + rr) / this.cell) - c0;
      const b0 = Math.floor((y[i] - rr) / this.cell) - r0, b1 = Math.floor((y[i] + rr) / this.cell) - r0;
      for (let cx = a0; cx <= a1; cx++) for (let cy = b0; cy <= b1; cy++) {
        const k = cy * nc + cx, ex = (cx + c0 + 0.5) * this.cell - x[i], ey = (cy + r0 + 0.5) * this.cell - y[i], d = ex * ex + ey * ey;
        if (stamp[k] !== gen) { stamp[k] = gen; marked.push(k); near[k] = i; dist[k] = d; }
        else if (d < dist[k]) { near[k] = i; dist[k] = d; }
      }
    }
    // in the order the cells were first reached along the route
    const half = this.cell / 2;
    for (const k of marked) {
      const cx = k % nc, cy = (k - cx) / nc, a = this.map.get(this.key(cx + c0, cy + r0));
      if (a) fn(a, near[k], (cx + c0) * this.cell + half, (cy + r0) * this.cell + half, half);
    }
  }

  /** Radius about `items[j]` (x, y) enclosing the vertex circle AND the oriented façade rectangle. */
  extent(j: number): number {
    const b = this.items[j];
    return Math.max(b[2], Math.hypot(this.ox[j] - b[0], this.oy[j] - b[1]) + Math.hypot(this.hl[j], this.hw[j]));
  }

  /** Whether `f` holds at any point of building j's oriented rectangle, sampled on a grid of at most `step` m
   * (its edges included). */
  anyPoint(j: number, step: number, f: (x: number, y: number) => boolean): boolean {
    const na = Math.max(1, Math.ceil(2 * this.hl[j] / step)), nb = Math.max(1, Math.ceil(2 * this.hw[j] / step));
    for (let a = 0; a <= na; a++) for (let b = 0; b <= nb; b++) {
      const p = -this.hl[j] + 2 * this.hl[j] * a / na, q = -this.hw[j] + 2 * this.hw[j] * b / nb;
      if (f(this.ox[j] + this.ux[j] * p - this.uy[j] * q, this.oy[j] + this.uy[j] * p + this.ux[j] * q)) return true;
    }
    return false;
  }

  /** Horizontal distance to the nearest façade of the oriented rectangle (zero inside it). */
  facadeDistance(j: number, x: number, y: number): number {
    const dx = x - this.ox[j], dy = y - this.oy[j];
    const along = Math.max(0, Math.abs(dx * this.ux[j] + dy * this.uy[j]) - this.hl[j]);
    const across = Math.max(0, Math.abs(-dx * this.uy[j] + dy * this.ux[j]) - this.hw[j]);
    return Math.hypot(along, across);
  }

  /** facadeDistance squared (cheaper; for comparisons) */
  facadeDistanceSq(j: number, x: number, y: number): number {
    const dx = x - this.ox[j], dy = y - this.oy[j];
    const along = Math.max(0, Math.abs(dx * this.ux[j] + dy * this.uy[j]) - this.hl[j]);
    const across = Math.max(0, Math.abs(-dx * this.uy[j] + dy * this.ux[j]) - this.hw[j]);
    return along * along + across * across;
  }

  /** The façade point of the oriented rectangle nearest to (x, y) (the point itself when inside). */
  facadePoint(j: number, x: number, y: number): [number, number] {
    const dx = x - this.ox[j], dy = y - this.oy[j], ux = this.ux[j], uy = this.uy[j];
    const p = Math.max(-this.hl[j], Math.min(this.hl[j], dx * ux + dy * uy));
    const q = Math.max(-this.hw[j], Math.min(this.hw[j], -dx * uy + dy * ux));
    return [this.ox[j] + ux * p - uy * q, this.oy[j] + uy * p + ux * q];
  }

  /** Does small building k stand wholly within big building j's outline (its footprint rectangle, less
   * `margin` m)? A chimney, silo or tower inside a hall, for example. */
  within(k: number, j: number, margin = 1): boolean {
    for (const [p, q] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = this.ox[k] + this.ux[k] * this.hl[k] * p - this.uy[k] * this.hw[k] * q, y = this.oy[k] + this.uy[k] * this.hl[k] * p + this.ux[k] * this.hw[k] * q;
      const dx = x - this.ox[j], dy = y - this.oy[j];
      if (Math.abs(dx * this.ux[j] + dy * this.uy[j]) > this.hl[j] - margin || Math.abs(-dx * this.uy[j] + dy * this.ux[j]) > this.hw[j] - margin) return false;
    }
    return true;
  }

  /** Offsets across the line through (x, y) with unit direction (tx, ty) (positive to its left) that
   * building j's footprint rectangle takes within `ha` along it either way: [nearest-right, farthest-left]
   * as [min, max], or null where it stays clear of that band. */
  across(j: number, x: number, y: number, tx: number, ty: number, ha: number): [number, number] | null {
    let poly: [number, number][] = [];
    for (const [p, q] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
      const cx = this.ox[j] + this.ux[j] * this.hl[j] * p - this.uy[j] * this.hw[j] * q - x;
      const cy = this.oy[j] + this.uy[j] * this.hl[j] * p + this.ux[j] * this.hw[j] * q - y;
      poly.push([cx * tx + cy * ty, -cx * ty + cy * tx]);
    }
    // clip to -ha <= along <= ha (Sutherland–Hodgman on the two edges of the band)
    for (const sign of [1, -1]) {
      const out: [number, number][] = [];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k], b = poly[(k + 1) % poly.length], da = ha - sign * a[0], db = ha - sign * b[0];
        if (da >= 0) out.push(a);
        if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      }
      poly = out;
      if (!poly.length) return null;
    }
    let lo = Infinity, hi = -Infinity;
    for (const p of poly) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }
    return [lo, hi];
  }

  /**
   * Does building j's footprint rectangle intersect the rectangle centred at (cx,cy) with unit axis
   * (tx,ty), half-length `ha` along it and half-width `hb` across it? (separating-axis test)
   */
  hits(j: number, cx: number, cy: number, tx: number, ty: number, ha: number, hb: number): boolean {
    const dx = this.ox[j] - cx, dy = this.oy[j] - cy;
    const ux = this.ux[j], uy = this.uy[j], hl = this.hl[j], hw = this.hw[j];
    // |cos|, |sin| of the angle between the two long axes
    const c = Math.abs(tx * ux + ty * uy), s = Math.abs(tx * uy - ty * ux);
    // axes of the query rectangle: t and n = (-ty, tx)
    if (Math.abs(dx * tx + dy * ty) > ha + hl * c + hw * s) return false;
    if (Math.abs(-dx * ty + dy * tx) > hb + hl * s + hw * c) return false;
    // axes of the building: u and v = (-uy, ux)
    if (Math.abs(dx * ux + dy * uy) > hl + ha * c + hb * s) return false;
    if (Math.abs(-dx * uy + dy * ux) > hw + ha * s + hb * c) return false;
    return true;
  }
}
