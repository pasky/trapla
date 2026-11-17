// Scan only raster centres inside a rotated footprint, not the potentially huge empty AABB
// corners of a long diagonal cross-section. The half-pixel screen matches collision geometry.
import { cellBounds, insideFootprint, type FootprintCell } from './footprint-geometry';
import { BUILTUP_BIT, CLASS_BITS, LC, RAIL_CROSSING_BIT, RIVER_CROSSING_BIT, type Terrain } from './terrain';
import type { ProtectedLevel } from './data/protected';
export type ProtectedFeature = 'railway' | 'water' | 'stream';

/** Each grid row whose cell centres the rotated footprint (padded by half a cell) may reach: its row index,
 * the centre line's y and the columns between the footprint's edges on that line. */
function footprintRows(terrain: Terrain, c: FootprintCell, visit: (row: number, y: number, col0: number, col1: number) => void): void {
  const step = terrain.cell, pad = step / 2, along = c.along + pad;
  const corners = [
    { x: c.x - c.tx * along - c.ty * (c.left + pad), y: c.y - c.ty * along + c.tx * (c.left + pad) },
    { x: c.x + c.tx * along - c.ty * (c.left + pad), y: c.y + c.ty * along + c.tx * (c.left + pad) },
    { x: c.x + c.tx * along + c.ty * (c.right + pad), y: c.y + c.ty * along - c.tx * (c.right + pad) },
    { x: c.x - c.tx * along + c.ty * (c.right + pad), y: c.y - c.ty * along - c.tx * (c.right + pad) },
  ];
  const [, y0, , y1] = cellBounds(c, pad);
  const row0 = Math.max(0, Math.floor((terrain.height - y1) / step)), row1 = Math.min(terrain.ny - 1, Math.floor((terrain.height - y0) / step));
  for (let row = row0; row <= row1; row++) {
    const y = terrain.height - (row + 0.5) * step;
    let min = Infinity, max = -Infinity;
    for (let k = 0; k < 4; k++) {
      const a = corners[k], b = corners[(k + 1) % 4], dy = b.y - a.y;
      if (Math.abs(dy) < 1e-10) {
        if (Math.abs(y - a.y) < 1e-8) { min = Math.min(min, a.x, b.x); max = Math.max(max, a.x, b.x); }
      } else {
        const t = (y - a.y) / dy;
        if (t >= -1e-9 && t <= 1 + 1e-9) { const x = a.x + t * (b.x - a.x); min = Math.min(min, x); max = Math.max(max, x); }
      }
    }
    const col0 = Math.max(0, Math.ceil(min / step - 0.5 - 1e-9)), col1 = Math.min(terrain.nx - 1, Math.floor(max / step - 0.5 + 1e-9));
    if (col1 >= col0) visit(row, y, col0, col1);
  }
}

export function protectedRasterCells(terrain: Terrain, c: FootprintCell,
  visit: (cell: { x: number; y: number; index: number; feature: ProtectedFeature }) => void): void {
  const step = terrain.cell;
  footprintRows(terrain, c, (row, y, col0, col1) => {
    for (let col = col0; col <= col1; col++) {
      const index = row * terrain.nx + col, v = terrain.lc[index], cls = v & CLASS_BITS;
      const feature = (v & RAIL_CROSSING_BIT) || cls === LC.rail ? 'railway'
        : (v & RIVER_CROSSING_BIT) || cls === LC.water ? 'water' : cls === LC.stream && !terrain.watercourses ? 'stream' : undefined;
      if (!feature) continue;
      const x = (col + 0.5) * step;
      if (insideFootprint({ x, y }, c, step / 2)) visit({ x, y, index, feature });
    }
  });
}

/** A cell of a nature protection area (protected-areas.ts) inside a footprint: the area that rules works there
 * (index into terrain.protectedAreas.sites) and whether it takes no works (`ban`), needs the nature authority's
 * consent (`consent`) or only a note (`info`). */
export interface NatureCell { x: number; y: number; index: number; site: number; level: ProtectedLevel; builtUp: boolean }
/** The protection-area cells inside a footprint, for a road of this kind (a motorway is barred from a whole
 * protected landscape area); a national park's ban stops at its built-up areas. */
export function natureCells(terrain: Terrain, c: FootprintCell, motorway: boolean, visit: (cell: NatureCell) => void): void {
  const areas = terrain.protectedAreas, step = terrain.cell;
  if (!areas) return;
  const [x0, y0, x1, y1] = cellBounds(c, step);
  if (!areas.mayCover(x0, y0, x1, y1)) return;
  footprintRows(terrain, c, (row, y, col0, col1) => areas.rowRuns(row, col0, col1, (c0, c1, combo) => {
    for (let col = c0; col <= c1; col++) {
      const x = (col + 0.5) * step;
      if (!insideFootprint({ x, y }, c, step / 2)) continue;
      const index = row * terrain.nx + col, builtUp = (terrain.lc[index] & BUILTUP_BIT) !== 0;
      const site = areas.rulingSite(combo, motorway, builtUp, true);
      if (site >= 0) visit({ x, y, index, site, level: areas.rule(site, motorway, builtUp).level, builtUp });
    }
  }));
}

/** A coarse index of where mapped railway cells are (blocks of COARSE × COARSE cells), built once per
 * terrain: a screen before a cell-exact scan (crossing-works' slopes beside a crossed way). */
const COARSE = 16;
const railBlocks = new WeakMap<Terrain, Int8Array>();
export function railwayNear(terrain: Terrain, x0: number, y0: number, x1: number, y1: number): boolean {
  const bx = Math.ceil(terrain.nx / COARSE), by = Math.ceil(terrain.ny / COARSE);
  let blocks = railBlocks.get(terrain);
  if (!blocks) railBlocks.set(terrain, blocks = new Int8Array(bx * by).fill(-1));
  const step = terrain.cell * COARSE;
  const c0 = Math.max(0, Math.floor(x0 / step)), c1 = Math.min(bx - 1, Math.floor(x1 / step));
  const r0 = Math.max(0, Math.floor((terrain.height - y1) / step)), r1 = Math.min(by - 1, Math.floor((terrain.height - y0) / step));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const k = r * bx + c;
    if (blocks[k] < 0) {
      // (each block's cells looked at once, when first asked)
      let found = 0;
      for (let row = r * COARSE; row < Math.min(terrain.ny, (r + 1) * COARSE) && !found; row++)
        for (let col = c * COARSE; col < Math.min(terrain.nx, (c + 1) * COARSE); col++) {
          const v = terrain.lc[row * terrain.nx + col];
          if ((v & RAIL_CROSSING_BIT) || (v & CLASS_BITS) === LC.rail) { found = 1; break; }
        }
      blocks[k] = found;
    }
    if (blocks[k]) return true;
  }
  return false;
}
