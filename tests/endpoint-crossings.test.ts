import { describe, expect, it } from 'vitest';
import { evaluate, type Design } from '../src/core/evaluate';
import { footprintConflicts, type FootprintRoute } from '../src/core/footprint';
import { RoadNet } from '../src/core/roadnet';
import { syntheticTerrain } from '../src/core/terrain';
import { D11_SCENARIO } from '../src/core/data/scenario';

describe('project-boundary road ownership', () => {
  it('engineers an unrelated crossing 100 m from the endpoint instead of burying it for free', () => {
    const terrain = syntheticTerrain(260, 100, 5, () => 100);
    const roads = new RoadNet({ cls: ['service'], ways: [[0, 200, 100, 200, 400]] });
    const design: Design = { category: 'S9.5', speed: 80, pis: [], profileMode: 'manual',
      vpis: [{ s: 0, z: 100, r: null }, { s: 500, z: 108, r: null }, { s: 1000, z: 100, r: null }] };
    const r = evaluate({ terrain, roads, scenario: D11_SCENARIO, a: { x: 100, y: 250 }, b: { x: 1100, y: 250 } }, design);
    const crossing = r.crossings.find(c => Math.abs(c.s - 100) < 0.01);
    expect(crossing).toBeDefined();
    expect(crossing!.h).toBeCloseTo(1.6);
    expect(crossing!.cost > 0 || r.violations.length > 0).toBe(true);
    if (r.valid) expect(crossing!.geometry).toBeDefined();
  });
  it('does not give a true endpoint way ownership of a later bend back into the earthwork', () => {
    const n = 101, array = (v: number) => new Float64Array(n).fill(v);
    const grade = array(108), dayL = array(25), dayR = array(25);
    grade[0] = 100; dayL[0] = dayR[0] = 5;
    const r: FootprintRoute = { n, ds: 10, s: Float64Array.from({ length: n }, (_, i) => i * 10),
      x: Float64Array.from({ length: n }, (_, i) => 100 + i * 10), y: array(250), tx: array(1), ty: array(0),
      grade, kind: new Uint8Array(n), dayL, dayR, zDayL: array(100), zDayR: array(100), crownWidth: 10, runs: [] };
    const roads = new RoadNet({ cls: ['service'], ways: [[0, 100, 250, 100, 290, 180, 260, 220, 290]] });
    const result = footprintConflicts(r, syntheticTerrain(260, 100, 5, () => 100), roads, [], []);
    expect(result.conflicts.some(c => c.roadId === 0 && c.s0 > 20)).toBe(true);
  });
});
