import { describe, expect, it } from 'vitest';
import { autoProfile } from '../src/core/autoprofile';
import { UNKNOWN_GROUND, type GroundData } from '../src/core/ground';
import { computeSections, flatCutBands } from '../src/core/sections';
import { Terrain } from '../src/core/terrain';
import { buildProfile, elevations } from '../src/core/vertical';

const soil = { name: 'Loose deposits', classIto: 20, classIIto: 30 };
const rock = { name: 'Competent rock', classIto: 0, classIIto: 0 };
function terrain(ground?: GroundData) {
  return new Terrain({ nx: 8, ny: 8, cell: 25, base: 0, scale: 1,
    q: new Uint16Array(64).fill(100), lc: new Uint8Array(64), ground });
}

const grid: GroundData = { nx: 4, ny: 4, cell: 50, profiles: [UNKNOWN_GROUND, soil, rock],
  ids: Uint8Array.from({ length: 16 }, (_, i) => i < 8 ? 1 : 2) };

describe('ground grid', () => {
  it('uses north-first cells and samples both sides of a geological boundary in sections', () => {
    const t = terrain(grid);
    expect(t.groundAt(100, 125)).toBe(soil);
    expect(t.groundAt(100, 75)).toBe(rock);
    expect(t.groundAt(-1, 125).normMix).toBe(true);
    expect(t.groundAt(100, 201).normMix).toBe(true);
    const tpl = { crownWidth: 10, cutSlope: 1.75, fillSlope: 2 };
    const s = computeSections(t, 1, [100], [100], [1], [0], [90], tpl);
    const total = 10 * 10 + 1.75 * 100;
    expect(s.cut[0]).toBeCloseTo(total, 8);
    expect(s.cutI[0]).toBeCloseTo(total / 2, 8);
    expect(s.cutII[0]).toBe(0);
    expect(s.cutIII[0]).toBeCloseTo(total / 2, 8);
    const unmapped = computeSections(terrain(), 1, [100], [100], [1], [0], [90], tpl);
    const expected = flatCutBands(10, 10, 1.75);
    for (const [j, actual] of [unmapped.cutI[0], unmapped.cutII[0], unmapped.cutIII[0]].entries()) {
      expect(actual).toBeCloseTo(expected[j], 8);
    }
  });

  it('rejects misaligned or corrupt packs instead of silently mispricing ground', () => {
    expect(() => terrain({ ...grid, cell: 25 })).toThrow('Invalid ground grid');
    expect(() => terrain({ ...grid, ids: new Uint8Array(16).fill(255) })).toThrow('Invalid ground grid');
    expect(() => terrain({ ...grid, profiles: [UNKNOWN_GROUND, { ...soil, classIIto: 1 }, rock] }))
      .toThrow('Invalid ground grid');
  });
});

it('auto-profile applies the local cost category, not a route-wide average', () => {
  const s = Float64Array.from({ length: 401 }, (_, i) => i * 10);
  const g = new Float64Array(401).fill(300);
  const solve = (reverse: boolean) => {
    const r = autoProfile(s, g, {
      maxGradient: 0.06, minCrest: 6000, minSag: 3400, vpiPenalty: 0,
      costClasses: Uint8Array.from(s, (v) => Number((v > 2000) !== reverse)),
      costPerM: (h, cls) => 10000 * (h - (cls ? 6 : -6)) ** 2,
    });
    expect(r.feasible).toBe(true);
    return elevations(buildProfile(r.vpis, 6000, 3400), s);
  };
  const a = solve(false), b = solve(true);
  expect(a[100]).toBeLessThan(b[100] - 1);
  expect(a[300]).toBeGreaterThan(b[300] + 1);
});
