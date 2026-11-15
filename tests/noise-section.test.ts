import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/core/evaluate';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { CATEGORIES } from '../src/core/data/categories';
import { syntheticTerrain } from '../src/core/terrain';
import { BuildingIndex } from '../src/core/buildings';
import { createNoiseModel } from '../src/core/road-noise';
import { startDesign } from '../src/state';
import { floorLevels } from '../src/ui/noise-section';

// The house card's cross-section must show the level the game decided on: its top floor equals the
// receiver's reported level, with or without walls, near and far, low and tall.
describe('noise cross-section', () => {
  const terrain = syntheticTerrain(500, 80, 5, () => 400);
  const ctx = { terrain, scenario: D11_SCENARIO, a: { x: 100, y: 200 }, b: { x: 2100, y: 200 } };
  const houses: [number, number, number][] = [], info: [number, number, number, number, number, number, number, number][] = [];
  for (const [k, d, levels] of [[0, 25, 1], [1, 40, 2], [2, 60, 4], [3, 90, 12], [4, 140, 6], [5, 60, 2]] as const) {
    const x = 500 + 200 * k, y = 200 + d;
    houses.push([x, y, 7]); info.push([100, levels, 0, x, y, 5, 5, 0]);
  }
  const model = createNoiseModel(D11_SCENARIO.traffic, 90, { heavyShare: D11_SCENARIO.heavyShare });
  for (const walls of [undefined, [{ s0: 0, s1: 2000, side: 'L' as const, height: 6 }]]) {
    it(`top floor = reported level (${walls ? '6 m walls' : 'automatic'})`, () => {
      const r = evaluate({ ...ctx, buildings: new BuildingIndex(houses, info) }, { ...startDesign(), wallOverrides: walls });
      const shown = r.noise.receivers.filter((p) => p.status !== 'bought');
      expect(shown.length).toBeGreaterThan(3);
      for (const p of shown) {
        const floors = floorLevels(p, Math.max(1, info[p.j][1]), model, CATEGORIES['S9.5'].crownWidth);
        expect(floors[floors.length - 1].after).toBeCloseTo(p.mitigated, 6);
      }
    });
  }
});
