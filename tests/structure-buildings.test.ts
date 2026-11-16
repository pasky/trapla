// The structure choice weighs the buildings each option would demolish.
import { describe, expect, it } from 'vitest';
import { BuildingIndex } from '../src/core/buildings';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { evaluate, type Design } from '../src/core/evaluate';
import { KIND } from '../src/core/structures';
import { syntheticTerrain } from '../src/core/terrain';

describe('buildings in the structure choice', () => {
  // flat ground at 400 m; By hand, the road runs 9 m up over km 0.45–0.75
  const ctx = { terrain: syntheticTerrain(500, 80, 5, () => 400), scenario: D11_SCENARIO, a: { x: 100, y: 200 }, b: { x: 1300, y: 200 } };
  const design: Design = { category: 'S9.5', speed: 80, pis: [], profileMode: 'manual',
    vpis: [{ s: 0, z: 400, r: null }, { s: 300, z: 400, r: null }, { s: 450, z: 409, r: null }, { s: 750, z: 409, r: null }, { s: 900, z: 400, r: null }, { s: 1200, z: 400, r: null }] };
  const at = (r: ReturnType<typeof evaluate>, s: number) => r.kind[Math.round(s / r.ds)];

  it('bridges over a large building the embankment slopes would bury, but not over open fields', () => {
    const open = evaluate(ctx, design);
    expect(at(open, 600)).toBe(KIND.earth);
    // a 4-storey block 15 m beside the axis: under the 9 m embankment's slopes, clear of the deck
    const buildings = new BuildingIndex([[700, 215, 7]], [[3000, 4, 0, 700, 216, 30, 3, 0]]);
    const town = evaluate({ ...ctx, buildings }, design);
    expect(at(town, 600)).toBe(KIND.bridge);
    expect(town.demolished).toEqual([]);
    // what the embankment would have cost there, building and all
    const earth = evaluate({ ...ctx, buildings }, { ...design, structureOverrides: [{ s0: 0, s1: 1200, kind: KIND.earth }] });
    expect(earth.demolished.map(p => p.j)).toEqual([0]);
    expect(town.cost.total).toBeLessThan(earth.cost.total);
  });
});
