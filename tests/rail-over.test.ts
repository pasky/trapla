import { describe, expect, it } from 'vitest';
import { passesUnder, railCrossingRuns, railCrossingsBuilt, railUnderDepth } from '../src/core/rail-over';
import { CATEGORIES } from '../src/core/data/categories';
import { syntheticTerrain, RAIL_CROSSING_BIT } from '../src/core/terrain';

// a straight line along x (y 100), stations 10 m apart; a railway raster band across it (x 250–260, 2 px of 5 m)
function setup(cols = [50, 51], rail = 100) {
  const terrain = syntheticTerrain(200, 40, 5, () => rail);
  for (const col of cols) for (let j = 0; j < terrain.ny; j++) (terrain.lc as Uint8Array)[j * terrain.nx + col] |= RAIL_CROSSING_BIT;
  const n = 61, st = { n, s: Float64Array.from({ length: n }, (_, i) => i * 10), tx: new Float64Array(n).fill(1), ty: new Float64Array(n).fill(0) };
  const samples = [];
  for (let at = 0; at <= 600; at += 2.5) if (terrain.crossing(at, 100) === 2) samples.push({ x: at, y: 100, at, stations: [Math.floor(at / 10)], g: rail });
  return { terrain, st, samples };
}
const cat = CATEGORIES['S9.5'];

describe('a railway carried over our road', () => {
  it('one mapped line (10 m wide in the raster) is one track; a choice holds for the crossing nearest it only', () => {
    const { terrain, st, samples } = setup();
    const [run] = railCrossingRuns(samples, st, terrain, cat, [], 5, 2.5);
    expect(run.tracks).toBe(1);
    expect(run.mode).toBe('auto');
    // two railways 80 m apart: a choice near one leaves the other Auto's
    const two = setup([50, 51, 66, 67]);
    const runs = railCrossingRuns(two.samples, two.st, two.terrain, cat, [{ x: 255, y: 100, choice: 'overbridge' }], 5, 2.5);
    expect(runs.map(r => r.mode)).toEqual(['under', 'auto']);
  });
  it('passes under only where every sample of it is the depth under the rails; a tunnel under it bills no bridge', () => {
    const { terrain, st, samples } = setup();
    const [run] = railCrossingRuns(samples, st, terrain, cat, [], 5, 2.5), below = railUnderDepth(cat)!;
    const grade = (z: number) => new Float64Array(st.n).fill(z);
    expect(passesUnder(run, grade(100 - below), st)).toBe(true);
    expect(passesUnder(run, grade(100 - below + 0.01), st)).toBe(false);
    // (sloping: low enough at the run's middle, not at its far side)
    const slope = Float64Array.from(st.s, s => 100 - below - 0.01 + (s - 255) * 0.01);
    expect(passesUnder(run, slope, st)).toBe(false);
    const open = railCrossingsBuilt([run], grade(60), st, () => 0, 7.5, () => cat.crownWidth);
    expect(open[0].how).toBe('railway'); expect(open[0].cost).toBeGreaterThan(0);
    const tunnel = railCrossingsBuilt([run], grade(60), st, () => 2, 7.5, () => cat.crownWidth);
    expect(tunnel[0].how).toBe('ours'); expect(tunnel[0].cost).toBe(0);
    // (the bridge spans the cutting between its walls, as built)
    expect(railCrossingsBuilt([run], grade(60), st, () => 0, 7.5, () => 14)[0].price!.span).toBeCloseTo(14, 6);
  });
  it('a railway of ours passes under none', () => {
    expect(railUnderDepth(CATEGORIES.R1)).toBeUndefined();
  });
});
