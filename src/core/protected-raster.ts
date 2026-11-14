// Scan only raster centres inside a rotated footprint, not the potentially huge empty AABB
// corners of a long diagonal cross-section. The half-pixel screen matches collision geometry.
import { cellBounds, insideFootprint, type FootprintCell } from './footprint-geometry';
import { CLASS_BITS, LC, RAIL_CROSSING_BIT, RIVER_CROSSING_BIT, type Terrain } from './terrain';
export type ProtectedFeature = 'railway' | 'water' | 'stream';
export function protectedRasterCells(terrain: Terrain, c: FootprintCell,
  visit: (cell: { x: number; y: number; index: number; feature: ProtectedFeature }) => void): void {
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
    for (let col = col0; col <= col1; col++) {
      const index = row * terrain.nx + col, v = terrain.lc[index], cls = v & CLASS_BITS;
      const feature = (v & RAIL_CROSSING_BIT) || cls === LC.rail ? 'railway'
        : (v & RIVER_CROSSING_BIT) || cls === LC.water ? 'water' : cls === LC.stream && !terrain.watercourses ? 'stream' : undefined;
      if (!feature) continue;
      const x = (col + 0.5) * step;
      if (insideFootprint({ x, y }, c, pad)) visit({ x, y, index, feature });
    }
  }
}
