import { describe, expect, it } from 'vitest';
import { protectedRasterCells } from '../src/core/protected-raster';
import { insideFootprint, type FootprintCell } from '../src/core/footprint-geometry';
import { syntheticTerrain, LC } from '../src/core/terrain';

describe('local protected-raster row scan', () => {
  it('matches bounded brute-force footprint membership for thin, wide and rotated cells', () => {
    const terrain = syntheticTerrain(50, 50, 5, () => 100); terrain.lc.fill(LC.rail);
    for (const angle of [0, 0.13, 0.7, 1.2, Math.PI / 2, 2.5]) for (const width of [3, 80]) {
      const cell: FootprintCell = { x: 125, y: 140, tx: Math.cos(angle), ty: Math.sin(angle), along: 5.3,
        left: width, right: width / 3, i: 0, s: 0 };
      const expected: number[] = [], actual: number[] = [];
      for (let row = 0; row < terrain.ny; row++) for (let col = 0; col < terrain.nx; col++) {
        const p = { x: (col + 0.5) * 5, y: terrain.height - (row + 0.5) * 5 };
        if (insideFootprint(p, cell, 2.5)) expected.push(row * terrain.nx + col);
      }
      protectedRasterCells(terrain, cell, p => actual.push(p.index));
      expect(actual).toEqual(expected);
    }
  });
});
