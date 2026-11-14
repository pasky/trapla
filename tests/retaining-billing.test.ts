import { expect, it } from 'vitest';
import { evaluate, type Design } from '../src/core/evaluate';
import { surchargeRate } from '../src/core/cost';
import { RoadNet } from '../src/core/roadnet';
import { syntheticTerrain, BUILTUP_BIT } from '../src/core/terrain';
import { D11_SCENARIO } from '../src/core/data/scenario';

it('books a continuous rural/urban retaining wall at its actual cells, not its annotation start', () => {
  const terrain = syntheticTerrain(260, 100, 5, () => 100);
  for (let row = 0; row < terrain.ny; row++) for (let col = 120; col < terrain.nx; col++) terrain.lc[row * terrain.nx + col] |= BUILTUP_BIT;
  const roads = new RoadNet({ cls: ['service'], ways: [[0, 0, 265, 1250, 265]] });
  const design: Design = { category: 'S9.5', speed: 80, pis: [], profileMode: 'manual',
    vpis: [{ s: 0, z: 100, r: null }, { s: 500, z: 108, r: null }, { s: 1000, z: 100, r: null }] };
  const r = evaluate({ terrain, roads, scenario: D11_SCENARIO, a: { x: 100, y: 250 }, b: { x: 1100, y: 250 } }, design);
  expect(r.crossings).toEqual([]);
  expect(r.footprintConflicts.every(c => c.action === 'retaining-wall')).toBe(true);
  expect(r.retainingWalls.some(w => r.cell.urban[w.i] === 0)).toBe(true);
  expect(r.retainingWalls.some(w => r.cell.urban[w.i] === 1)).toBe(true);
  const expected = new Float64Array(r.n);
  for (const wall of r.retainingWalls) expected[wall.i] += wall.cost;
  for (let i = 0; i < r.n; i++) expect(r.parts.crossings[i]).toBeCloseTo(expected[i], 5);
  const surcharge = r.parts.crossings.reduce((sum, cost, i) => sum + cost * surchargeRate(r.cell.urban[i]), 0);
  expect(surcharge).toBeCloseTo(r.retainingWalls.reduce((sum, wall) => sum + wall.cost * surchargeRate(r.cell.urban[wall.i]), 0), 5);
  expect(r.footprintConflicts.reduce((sum, c) => sum + c.cost, 0)).toBeCloseTo(r.cost.crossings, 5);
});
