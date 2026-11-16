import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/core/evaluate';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { syntheticTerrain } from '../src/core/terrain';
import { BuildingIndex } from '../src/core/buildings';
import { startDesign } from '../src/state';
import { floorLevels, noiseSectionSvg } from '../src/ui/noise-section';
import { noiseBreakdown, noiseField } from '../src/core/noise';

// The house card must show the level the game decided on: its loudest floor equals the receiver's
// reported level, with or without walls, near and far, low and tall; the plan's pieces add up to it.
describe('noise cross-section', () => {
  const terrain = syntheticTerrain(500, 80, 5, () => 400);
  const ctx = { terrain, scenario: D11_SCENARIO, a: { x: 100, y: 200 }, b: { x: 2100, y: 200 } };
  const houses: [number, number, number][] = [], info: [number, number, number, number, number, number, number, number][] = [];
  for (const [k, d, levels] of [[0, 25, 1], [1, 40, 2], [2, 60, 4], [3, 90, 12], [4, 140, 6], [5, 60, 2]] as const) {
    const x = 500 + 200 * k, y = 200 + d;
    houses.push([x, y, 7]); info.push([100, levels, 0, x, y, 5, 5, 0]);
  }
  for (const walls of [undefined, [{ s0: 0, s1: 2000, side: 'L' as const, height: 6 }]]) {
    it(`loudest floor = reported level (${walls ? '6 m walls' : 'automatic'})`, () => {
      const r = evaluate({ ...ctx, buildings: new BuildingIndex(houses, info) }, { ...startDesign(), wallOverrides: walls });
      const shown = r.noise.receivers.filter((p) => p.status !== 'bought');
      expect(shown.length).toBeGreaterThan(3);
      const field = noiseField(r.noise.source!);
      for (const p of shown) {
        const floors = floorLevels(field, p, r.noise.L, r.noise.R);
        expect(floors).toHaveLength(p.storeys);
        expect(Math.max(...floors.map((f) => f.after))).toBeCloseTo(p.mitigated, 6);
        expect(floors[p.floor].after).toBeCloseTo(p.mitigated, 6);
        // the plan's pieces add up to that floor's level (near pieces; far ones fold into the total)
        const z = p.ground + 1.5 + 3 * p.floor, b = noiseBreakdown(field, p.x, p.y, z, r.noise.L, r.noise.R);
        const sum = 10 * Math.log10(b.rays.reduce((a, q) => a + 10 ** (q.level / 10), 0));
        expect(sum).toBeLessThanOrEqual(b.level + 1e-6);
        expect(sum).toBeGreaterThan(b.level - 0.5);
        expect(noiseSectionSvg(r, p, floors, 9.5, r.noise.limit, r.noise.L[p.i])).toContain('<svg');
      }
    });
  }
});
