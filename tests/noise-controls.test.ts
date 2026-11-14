import { describe, expect, it } from 'vitest';
import { BuildingIndex } from '../src/core/buildings';
import { BUILDING_KIND, NOISE } from '../src/core/data/urban';
import {
  dwellingExposure, noiseBarrier, noiseFootprint, noiseReceivers, resolveNoiseWalls,
  wallAttenuation, wallFlags, wallStretches, type NoisePolicy,
} from '../src/core/noise';
import { createNoiseModel } from '../src/core/road-noise';

const barrier = noiseBarrier(9.5);
const house = (x = 100, y = 20, levels = 1) => new BuildingIndex([[x, y, 8]], [
  [100, levels, BUILDING_KIND.house, x, y, 5, 5, 0],
]);
const loud = createNoiseModel(90_000, 90);
const normal = createNoiseModel(9000, 90);
const exposure = (policy?: NoisePolicy, x = [20, 100, 180], shield = x.map(() => 0)) => {
  const zeros = x.map(() => 0);
  return dwellingExposure(x.length, x, zeros, x.map(() => 1), zeros, house(), loud, [0], zeros, () => 0,
    shield, shield, barrier, undefined, policy);
};
const finish = (ex: ReturnType<typeof dwellingExposure>) => resolveNoiseWalls(ex, 80, (ex.L.length - 1) * 80,
  new Uint8Array(ex.L.length), new Uint8Array(ex.L.length), barrier);

// Existing town tests cover the automatic choice heights, buyout prices, station-order independence,
// shielding and margins. These tests exercise the manual-policy branches and final-wall composition.
describe('manual noise policy', () => {
  it('retains an explicitly kept failing dwelling and its useful automatic walls at other stations', () => {
    const ex = exposure({ keptBuildingIds: new Set([0]) });
    expect(ex.boughtOut).toEqual([]);
    expect([...ex.L]).toEqual([4, 0, 4]);
    const result = finish(ex);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0]).toMatchObject({ j: 0, i: 1, side: 'L' });
    expect(result.unresolved[0].excess).toBeGreaterThan(0);
    expect(result.receivers[0].unresolved).toEqual(result.unresolved[0]);
    expect(result.receivers[0].status).not.toBe('bought');
    expect(result.L[0]).toBe(4);
    expect(result.L[2]).toBe(4);
  });

  it('blocks fallback buyout when manual paint affects another exposing station, before OR after the failure', () => {
    for (const i of [0, 2]) {
      const wallL = [NaN, NaN, NaN]; wallL[i] = 0;
      const ex = exposure({ wallL });
      expect(ex.boughtOut).toEqual([]);
      expect([...ex.L]).toEqual([4, 0, 4]);
      const result = finish(ex);
      expect(result.L[i]).toBe(0); // no padding or automatic promotion can reinstate the removed cell
      expect(result.L[2 - i]).toBe(4);
      expect(result.unresolved).toHaveLength(1);
      expect(result.receivers[0].mitigated).toBeGreaterThan(0);
    }
  });

  it('allows automatic buyout when manual walls are on the wrong side, remote or tunnel-shielded', () => {
    const baseline = exposure().boughtOut;
    expect(exposure({ wallR: [0, 6, 2] }).boughtOut).toEqual(baseline);
    expect(exposure({ wallL: [NaN, NaN, NaN, 6] }, [20, 100, 180, 2000]).boughtOut).toEqual(baseline);
    expect(exposure({ wallL: [6, NaN, NaN] }, undefined, [1, 0, 0]).boughtOut).toEqual(baseline);
    expect(exposure({ wallL: [NaN, NaN, NaN], keptBuildingIds: new Set([99]) }).boughtOut).toEqual(baseline);
  });

  it('honours actual 2 m and fractional heights in receiver residuals and the footprint, even when insufficient', () => {
    const b = house(0, 37), d = b.facadeDistance(0, 0, 0) - NOISE.facadeOffset;
    for (const height of [0, 2, 2.5, 6]) {
      const ex = dwellingExposure(1, [0], [0], [1], [0], b, normal, [0], [0], () => 0,
        [0], [0], barrier, undefined, { wallL: [height] });
      const result = resolveNoiseWalls(ex, 10, 10, [0], [0], barrier);
      const rec = result.receivers[0];
      const loss = wallAttenuation(d, NOISE.receiverHeight, height, barrier);
      expect(result.boughtOut).toEqual([]);
      expect(result.L[0]).toBe(height);
      expect(rec.mitigated).toBeCloseTo(rec.raw - loss, 12);
      if (height > 0) expect(loss).toBeGreaterThan(0);
      if (height === 0) expect(result.unresolved).toHaveLength(1);
      const map = noiseFootprint(1, [0], [0], [1], [0], [0], () => 0, normal, [0], [0],
        result.L, result.R, () => d, barrier, undefined, 1, 2);
      expect(map.excess[0]).toBeCloseTo(rec.mitigated, 5);
      expect(map.excess[2]).toBeCloseTo(rec.raw, 5); // opposite side is still unscreened
      expect(result.walls.map(w => w.height)).toEqual(height ? [height] : []);
    }
  });

  it('allows a manual 6 m wall to save an upper-floor receiver that the automatic 5 m maximum cannot', () => {
    const b = house(0, 22, 4);
    const run = (policy?: NoisePolicy) => dwellingExposure(1, [0], [0], [1], [0], b, normal, [0], [0], () => 0,
      [0], [0], barrier, undefined, policy);
    expect(run().boughtOut).toHaveLength(1);
    const result = resolveNoiseWalls(run({ wallL: [6] }), 10, 10, [0], [0], barrier);
    expect(result.boughtOut).toEqual([]);
    expect(result.unresolved).toEqual([]);
    expect(result.receivers[0].mitigated).toBeLessThan(0);
    expect(result.receivers[0]).toMatchObject({ status: 'wall', wall: 6 });
    // Ground-floor map at the same absolute receiver height must agree with the upper-floor result.
    const d = b.facadeDistance(0, 0, 0) - NOISE.facadeOffset;
    const map = noiseFootprint(1, [0], [0], [1], [0], [0], () => 9, normal, [0], [0],
      result.L, result.R, () => d, barrier, undefined, 1, 2);
    expect(map.excess[0]).toBeCloseTo(result.receivers[0].mitigated, 5);
  });

  it('paints exact, unpadded independent walls without receivers, but never inside tunnels', () => {
    const empty = new BuildingIndex([], []);
    const zero = [0, 0, 0, 0], shieldL = [0, 0, 1, 0], shieldR = [0, 0, 0, 1];
    const ex = dwellingExposure(4, zero, zero, [1, 1, 1, 1], zero, empty, normal, [], zero, () => 0,
      shieldL, shieldR, barrier, undefined, { wallL: [NaN, 2.5, 6, 0], wallR: [6, NaN, 2, 6] });
    const result = resolveNoiseWalls(ex, 10, 30, shieldL, shieldR, barrier);
    expect([...result.L]).toEqual([0, 2.5, 0, 0]);
    expect([...result.R]).toEqual([6, 0, 2, 0]);
    expect(result.receivers).toEqual([]);
    expect(result.unresolved).toEqual([]);
    expect(result.walls).toEqual([
      { side: 'L', i0: 1, i1: 1, s0: 5, s1: 15, height: 2.5 },
      { side: 'R', i0: 0, i1: 0, s0: 0, s1: 5, height: 6 },
      { side: 'R', i0: 2, i1: 2, s0: 15, s1: 25, height: 2 },
    ]);
  });

  it('leaves the legacy automatic orchestration and billable geometry exactly unchanged', () => {
    for (const shield of [[0, 0, 0], [0, 1, 0]]) {
      const ex = exposure(undefined, undefined, shield);
      const L = wallFlags(80, ex.L, shield), R = wallFlags(80, ex.R, shield);
      const result = resolveNoiseWalls(ex, 80, 160, shield, shield, barrier);
      expect([...result.L]).toEqual([...L]);
      expect([...result.R]).toEqual([...R]);
      expect(result.walls).toEqual([...wallStretches(80, 160, L, 'L'), ...wallStretches(80, 160, R, 'R')]);
      expect(result.receivers).toEqual(noiseReceivers(ex.scratch, L, R, barrier));
      expect(result.boughtOut).toEqual(ex.boughtOut);
      expect(result.unresolved).toEqual([]);
    }
  });
});
