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

  /** Every building registered in a hash cell within `r` of any of the points, once per cell it is
   * registered in (dedupe by index), with the index of the point nearest that cell's centre. */
  alongPoints(x: ArrayLike<number>, y: ArrayLike<number>, n: number, r: number, fn: (j: number, near: number) => void) {
    if (!n) return;
    // every other point, reaching the one between too (and the last one)
    const reach = n > 1 ? Math.hypot(x[1] - x[0], y[1] - y[0]) : 0, rr = r + reach;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) { x0 = Math.min(x0, x[i]); x1 = Math.max(x1, x[i]); y0 = Math.min(y0, y[i]); y1 = Math.max(y1, y[i]); }
    const c0 = Math.floor((x0 - rr) / this.cell), r0 = Math.floor((y0 - rr) / this.cell);
    const nc = Math.floor((x1 + rr) / this.cell) - c0 + 1, nr = Math.floor((y1 + rr) / this.cell) - r0 + 1;
    const near = new Int32Array(nc * nr).fill(-1), dist = new Float64Array(nc * nr);
    for (let i = 0; i < n; i = i + 2 < n || i === n - 1 ? i + 2 : n - 1) {
      const a0 = Math.floor((x[i] - rr) / this.cell) - c0, a1 = Math.floor((x[i] + rr) / this.cell) - c0;
      const b0 = Math.floor((y[i] - rr) / this.cell) - r0, b1 = Math.floor((y[i] + rr) / this.cell) - r0;
      for (let cx = a0; cx <= a1; cx++) for (let cy = b0; cy <= b1; cy++) {
        const k = cy * nc + cx, d = ((cx + c0 + 0.5) * this.cell - x[i]) ** 2 + ((cy + r0 + 0.5) * this.cell - y[i]) ** 2;
        if (near[k] < 0 || d < dist[k]) { near[k] = i; dist[k] = d; }
      }
    }
    for (let cy = 0; cy < nr; cy++) for (let cx = 0; cx < nc; cx++) {
      const i = near[cy * nc + cx];
      if (i < 0) continue;
      const a = this.map.get(this.key(cx + c0, cy + r0));
      if (a) for (const j of a) fn(j, i);
    }
  }

  /** Radius about `items[j]` (x, y) enclosing the vertex circle AND the oriented façade rectangle. */
  extent(j: number): number {
    const b = this.items[j];
    return Math.max(b[2], Math.hypot(this.ox[j] - b[0], this.oy[j] - b[1]) + Math.hypot(this.hl[j], this.hw[j]));
  }

  /** Horizontal distance to the nearest façade of the oriented rectangle (zero inside it). */
  facadeDistance(j: number, x: number, y: number): number {
    const dx = x - this.ox[j], dy = y - this.oy[j];
    const along = Math.max(0, Math.abs(dx * this.ux[j] + dy * this.uy[j]) - this.hl[j]);
    const across = Math.max(0, Math.abs(-dx * this.uy[j] + dy * this.ux[j]) - this.hw[j]);
    return Math.hypot(along, across);
  }

  /** The façade point of the oriented rectangle nearest to (x, y) (the point itself when inside). */
  facadePoint(j: number, x: number, y: number): [number, number] {
    const dx = x - this.ox[j], dy = y - this.oy[j], ux = this.ux[j], uy = this.uy[j];
    const p = Math.max(-this.hl[j], Math.min(this.hl[j], dx * ux + dy * uy));
    const q = Math.max(-this.hw[j], Math.min(this.hw[j], -dx * uy + dy * ux));
    return [this.ox[j] + ux * p - uy * q, this.oy[j] + uy * p + ux * q];
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
