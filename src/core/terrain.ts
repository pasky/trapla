// Terrain grid: 5 m heights (quantised Uint16) + land-cover byte, local metric coordinates
// (x east, y north, origin = SW corner of the play area in EPSG:5514).

export const LC = { none: 0, forest: 1, water: 2, building: 3, road: 4, urban: 5, rail: 6, stream: 7 } as const;
export const OOB_BIT = 128;
export const RIVER_CROSSING_BIT = 32;
export const RAIL_CROSSING_BIT = 64;
const CLASS_MASK = 7;

export interface TerrainData {
  nx: number;
  ny: number;
  cell: number;
  base: number;
  scale: number;
  /** row 0 = north edge */
  q: Uint16Array;
  /** land-cover class | OOB_BIT */
  lc: Uint8Array;
}

export class Terrain {
  readonly nx: number;
  readonly ny: number;
  readonly cell: number;
  readonly width: number;
  readonly height: number;
  private readonly base: number;
  private readonly scale: number;
  private readonly q: Uint16Array;
  readonly lc: Uint8Array;

  constructor(d: TerrainData) {
    this.nx = d.nx;
    this.ny = d.ny;
    this.cell = d.cell;
    this.base = d.base;
    this.scale = d.scale;
    this.q = d.q;
    this.lc = d.lc;
    this.width = d.nx * d.cell;
    this.height = d.ny * d.cell;
  }

  /** height of grid sample (col,row), display-filled even out of bounds */
  sample(col: number, row: number): number {
    if (col < 0) col = 0; else if (col >= this.nx) col = this.nx - 1;
    if (row < 0) row = 0; else if (row >= this.ny) row = this.ny - 1;
    return this.base + this.q[row * this.nx + col] * this.scale;
  }

  /** bilinear height at local (x,y); display-filled outside data (use isOob to test) */
  heightAt(x: number, y: number): number {
    const fc = x / this.cell - 0.5;
    const fr = (this.height - y) / this.cell - 0.5;
    let c0 = Math.floor(fc), r0 = Math.floor(fr);
    let tx = fc - c0, ty = fr - r0;
    const nx = this.nx;
    if (c0 < 0) { c0 = 0; tx = 0; } else if (c0 >= nx - 1) { c0 = nx - 2; tx = 1; }
    if (r0 < 0) { r0 = 0; ty = 0; } else if (r0 >= this.ny - 1) { r0 = this.ny - 2; ty = 1; }
    const i = r0 * nx + c0;
    const q = this.q;
    const a = q[i], b = q[i + 1], c = q[i + nx], d = q[i + nx + 1];
    const top = a + (b - a) * tx;
    const bot = c + (d - c) * tx;
    return this.base + (top + (bot - top) * ty) * this.scale;
  }

  private cellIndex(x: number, y: number): number {
    const c = Math.floor(x / this.cell);
    const r = Math.floor((this.height - y) / this.cell);
    if (c < 0 || r < 0 || c >= this.nx || r >= this.ny) return -1;
    return r * this.nx + c;
  }

  /** true outside the play area or where DMR 5G has no data (Poland) */
  isOob(x: number, y: number): boolean {
    const i = this.cellIndex(x, y);
    return i < 0 || (this.lc[i] & OOB_BIT) !== 0;
  }

  /** land-cover class at (x,y), or -1 outside the grid */
  landcover(x: number, y: number): number {
    const i = this.cellIndex(x, y);
    return i < 0 ? -1 : this.lc[i] & CLASS_MASK;
  }

  /** must-bridge crossing at (x,y): 0 none, 1 river / water area, 2 railway */
  crossing(x: number, y: number): 0 | 1 | 2 {
    const i = this.cellIndex(x, y);
    if (i < 0) return 0;
    const v = this.lc[i];
    return v & RAIL_CROSSING_BIT ? 2 : v & RIVER_CROSSING_BIT ? 1 : 0;
  }
}

/** Decode the pack's height file (int16 row-wise deltas) into Uint16 quantised heights. */
export function decodeHeights(delta: Int16Array, nx: number, ny: number): Uint16Array {
  const q = new Uint16Array(nx * ny);
  for (let r = 0; r < ny; r++) {
    let acc = 0;
    const o = r * nx;
    for (let c = 0; c < nx; c++) {
      acc = (acc + delta[o + c]) & 0xffff;
      q[o + c] = acc;
    }
  }
  return q;
}

/** Build a synthetic terrain from a height function (tests). */
export function syntheticTerrain(nx: number, ny: number, cell: number, f: (x: number, y: number) => number,
  scale = 0.01, base = 0): Terrain {
  const q = new Uint16Array(nx * ny);
  const H = ny * cell;
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
    const v = Math.round((f((c + 0.5) * cell, H - (r + 0.5) * cell) - base) / scale);
    q[r * nx + c] = Math.max(0, Math.min(65534, v));
  }
  return new Terrain({ nx, ny, cell, base, scale, q, lc: new Uint8Array(nx * ny) });
}
