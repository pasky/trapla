import { describe, expect, it } from 'vitest';
import {
  normalizeBuildingOverrides, normalizeWallOverrides, paintWallOverride, setBuildingOverride,
  wallOverrideMasks, type WallOverride,
} from '../src/core/build-controls';

describe('saved building decisions', () => {
  it('keeps the last valid action per building, discards malformed/stale ids, and restores auto individually', () => {
    const saved = [null, { j: 0, action: 'keep' }, { j: 2, action: 'buy' }, { j: 0, action: 'buy' },
      { j: 1, action: 'auto' }, { j: -1, action: 'keep' }, { j: 0.5, action: 'buy' }, { j: '1', action: 'buy' },
      { j: Infinity, action: 'keep' }, { j: 99, action: 'keep' }];
    const valid = normalizeBuildingOverrides(saved, 3);
    expect(valid).toEqual([{ j: 0, action: 'buy' }, { j: 2, action: 'buy' }]);
    const changed = setBuildingOverride(valid, 2, 'keep');
    expect(changed).toEqual([{ j: 0, action: 'buy' }, { j: 2, action: 'keep' }]);
    expect(setBuildingOverride(changed, 0, null)).toEqual([{ j: 2, action: 'keep' }]);
    expect(valid[1].action).toBe('buy');
    expect(normalizeBuildingOverrides(undefined)).toEqual([]);
    expect(normalizeBuildingOverrides({})).toEqual([]);
  });
});

describe('manual wall paint', () => {
  it('splits only the painted side, merges matching neighbours, and clears auto subranges without mutating history', () => {
    const original: WallOverride[] = [{ s0: 0, s1: 100, side: 'L', height: 6 }, { s0: 0, s1: 100, side: 'R', height: 2 }];
    const painted = paintWallOverride(original, 20, 80, 'L', 0);
    expect(painted).toEqual([
      { s0: 0, s1: 20, side: 'L', height: 6 }, { s0: 20, s1: 80, side: 'L', height: 0 },
      { s0: 80, s1: 100, side: 'L', height: 6 }, original[1],
    ]);
    expect(paintWallOverride(painted, 20, 80, 'L', 6)).toEqual(original);
    expect(paintWallOverride(painted, 30, 60, 'L', null)).toEqual([
      { s0: 0, s1: 20, side: 'L', height: 6 }, { s0: 20, s1: 30, side: 'L', height: 0 },
      { s0: 60, s1: 80, side: 'L', height: 0 }, { s0: 80, s1: 100, side: 'L', height: 6 }, original[1],
    ]);
    expect(original[0]).toEqual({ s0: 0, s1: 100, side: 'L', height: 6 });
  });

  it('rejects malformed saves and lets later valid paint win without rounding actual wall heights', () => {
    const base: WallOverride = { s0: 0, s1: 100, side: 'L', height: 2.5 };
    const bad = [null, false, {}, ...[-1, 1, 6.1, Infinity, NaN, '3', null].map(height => ({ ...base, height })),
      { ...base, s0: -1 }, { ...base, s1: 0 }, { ...base, s0: NaN }, { ...base, s1: Infinity },
      { ...base, side: 'both' }];
    expect(normalizeWallOverrides(bad)).toEqual([]);
    expect(normalizeWallOverrides([...bad, base, { s0: 40, s1: 60, side: 'L', height: 6 }])).toEqual([
      { ...base, s1: 40 }, { s0: 40, s1: 60, side: 'L', height: 6 }, { ...base, s0: 60 },
    ]);
    expect(normalizeWallOverrides(undefined)).toEqual([]);
  });

  it('resamples half-open chainage ranges on independent sides and includes the route endpoint', () => {
    const paint: WallOverride[] = [
      { s0: 10, s1: 30, side: 'L', height: 0 }, { s0: 30, s1: 50, side: 'L', height: 2.5 },
      { s0: 0, s1: 20, side: 'R', height: 6 },
    ];
    const mask = wallOverrideMasks([0, 10, 20, 30, 40, 50], paint);
    expect([...mask.L]).toEqual([NaN, 0, 0, 2.5, 2.5, 2.5]);
    expect([...mask.R]).toEqual([6, 6, NaN, NaN, NaN, NaN]);
    expect([...wallOverrideMasks([0, 20, 40, 60], paint).L]).toEqual([NaN, 0, 2.5, NaN]);
    expect([...wallOverrideMasks([0, 10]).L]).toEqual([NaN, NaN]);
  });
});
