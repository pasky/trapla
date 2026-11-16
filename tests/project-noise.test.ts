import { describe, expect, it } from 'vitest';
import { BuildingIndex } from '../src/core/buildings';
import { NOISE } from '../src/core/data/urban';
import { combineNoise, type NoiseDecider, type SourceAtHouse } from '../src/core/project-noise';

const e = (db: number) => 10 ** (db / 10);
/** one storey at `db` by day and `db − 10` at night (both exactly `over` dB over 60/50 when db = 60 + over) */
const at = (routeId: string, db: number, limits = { dayLimit: 60, nightLimit: 50 }): SourceAtHouse =>
  ({ routeId, sourceId: `physical-${routeId}`, ...limits, storeys: [{ height: 1.5, rawDay: e(db), rawNight: e(db - 10), day: e(db), night: e(db - 10) }] });

/** Houses 0..3; road A's wall (any height ≥ 3 m) takes 6 dB off A at houses 0 and 1, nothing at house 2. */
function decider(levels: Record<number, [number, number]>) {
  let wall = 0;
  const reachable = (j: number) => j !== 2;
  const a = (j: number) => levels[j][0] - (wall && reachable(j) ? 6 : 0);
  const d: NoiseDecider = {
    sources: j => [at('A', a(j)), at('B', levels[j][1])],
    tryWall: (routeId, j, height) => routeId !== 'A' || !reachable(j) || height < 3 ? null
      : { storeys: at('A', levels[j][0] - 6).storeys, area: wall ? 0 : height * 100, length: 100, commit: () => { wall = height; } },
  };
  return d;
}
const buildings = new BuildingIndex([[0, 0, 5], [20, 0, 5], [40, 0, 5], [60, 0, 5]]);

describe('noise of several roads at one house', () => {
  it('adds energies: two roads each 2 dB under the limit are 1 dB over together', () => {
    const [h] = combineNoise([2], decider({ 2: [58, 58] }), buildings, new Set()); // no wall can stand here
    expect(h.dayDb).toBeCloseTo(61.01, 2);
    expect(h.decision).not.toBe('none');
  });

  it('builds the cheapest wall on the road that prevails, once; the next house counts it', () => {
    const out = combineNoise([1, 0], decider({ 0: [59, 57], 1: [58.5, 57] }), buildings, new Set());
    expect(out.map(h => [h.buildingIndex, h.decision])).toEqual([[0, 'wall'], [1, 'none']]);
    expect(out[0].wall).toMatchObject({ routeId: 'A', height: 3, area: 300, cost: 300 * NOISE.wallPerM2 });
    expect(out[1].dayDb).toBeLessThan(60);
  });

  it('buys a house out once when no wall can help, owned by the road that prevails', () => {
    const [h] = combineNoise([2, 2], decider({ 2: [57, 59] }), buildings, new Set());
    expect(h.decision).toBe('buy'); expect(h.buyout!.routeId).toBe('B');
    expect(h.buyout!.cost).toBeGreaterThan(buildings.cost[2]);
  });

  it('leaves alone a house a road already bought or demolished', () => {
    expect(combineNoise([2], decider({ 2: [70, 70] }), buildings, new Set([2]))).toEqual([]);
  });

  it('takes the limit of the road whose noise prevails (NV 272/2011 annex 3 A)', () => {
    const old = { dayLimit: 68, nightLimit: 58 };
    const d: NoiseDecider = { sources: () => [at('A', 59), at('B', 62, old)], tryWall: () => null };
    const [h] = combineNoise([0], d, buildings, new Set());
    expect([h.prevailing, h.dayLimit, h.decision]).toEqual(['B', 68, 'none']);
  });
});
