import { describe, expect, it } from 'vitest';
import { autoProfile, profileOk, type AutoProfileOptions } from '../src/core/autoprofile';
import { GRADE_PIN_TOLERANCE, gradePinViolations, normalizeGradePins, type GradePin } from '../src/core/grade-pins';
import { buildProfile, elevationAt } from '../src/core/vertical';

const opt: AutoProfileOptions = { maxGradient: 0.06, minCrest: 6000, minSag: 3400,
  costPerM: (h) => 1e4 * h * h, vpiPenalty: 0 };
const s = Float64Array.from({ length: 201 }, (_, i) => i * 10);
const g = new Float64Array(s.length);
function solve(pins: GradePin[], extra: Partial<AutoProfileOptions> = {}) {
  const r = autoProfile(s, g, { ...opt, ...extra, pins });
  const p = buildProfile(r.vpis, opt.minCrest, opt.minSag);
  expect(r.feasible).toBe(true);
  expect(r.pinViolations).toEqual([]);
  expect(profileOk(r.vpis, opt.maxGradient, opt.minCrest, opt.minSag)).toBe(true);
  for (const pin of pins) expect(Math.abs(elevationAt(p, pin.s) - pin.z)).toBeLessThanOrEqual(GRADE_PIN_TOLERANCE + 1e-9);
  return { r, p };
}

describe('pinned Auto DP heights', () => {
  it('normalizes untrusted saved pins without clipping absolute stations or mutating input', () => {
    const raw = [{ s: 12345.67, z: 90 }, null, { s: 7, z: 2 }, { s: -1, z: 3 },
      { s: 7, z: 5 }, { s: 1, z: NaN }, { s: '3', z: 2 }, { s: Infinity, z: 4 }, { s: 0, z: -2 }];
    const pins = normalizeGradePins(raw);
    expect(pins).toEqual([{ s: 0, z: -2 }, { s: 7, z: 5 }, { s: 12345.67, z: 90 }]);
    pins[2].z = 0;
    expect(raw[0]).toEqual({ s: 12345.67, z: 90 });
    expect(normalizeGradePins({ s: 7, z: 2 })).toEqual([]);
    expect(normalizeGradePins(undefined)).toEqual([]);
  });

  it('constrains the parabolic crest, not merely the VPI elevation', () => {
    const { r, p } = solve([{ s: 1000, z: 20.3 }]);
    const vpi = r.vpis.find((v) => v.s === 1000)!;
    expect(vpi).toBeDefined();
    expect(vpi.z - elevationAt(p, 1000)).toBeGreaterThan(0.5);
    expect(Math.abs(vpi.z - 20.3)).toBeGreaterThan(0.5);
  });

  it('constrains a sag and pins at arbitrary, unsampled absolute stations', () => {
    solve([{ s: 837.25, z: -16.37 }, { s: 1231.7, z: -12.12 }]);
  });

  it('handles multiple unsorted pins, matching duplicates and both fixed endpoints', () => {
    solve([{ s: 1300, z: 8.8 }, { s: 0, z: 0.2 }, { s: 600.1, z: 12.3 },
      { s: 2000, z: -0.2 }, { s: 600.1, z: 12.3 }]);
  });

  it('checks pins in the first/last half-cell and includes exact endpoint grid correction', () => {
    const ground = Float64Array.from(s, (x) => 300.13 + x * 0.01317);
    const pins = [{ s: 72.31, z: ground[0] + 72.31 * 0.01317 },
      { s: 1937.42, z: ground[0] + 1937.42 * 0.01317 }];
    const r = autoProfile(s, ground, { ...opt, pins });
    expect(r.feasible).toBe(true);
    const p = buildProfile(r.vpis, opt.minCrest, opt.minSag);
    for (const pin of pins) expect(Math.abs(elevationAt(p, pin.s) - pin.z)).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(r.vpis.at(-1)!.z).toBe(ground.at(-1));
  });

  it('reports computed gradient reach bounds and a height edit for an unreachable pin', () => {
    const r = autoProfile(s, g, { ...opt, pins: [{ s: 100, z: 20 }] });
    expect(r.feasible).toBe(false);
    expect(r.pinViolations).toHaveLength(1);
    expect(r.pinViolations![0].pin).toMatchObject({ reason: 'gradient-envelope', actualZ: 0,
      reachable: { min: -6, max: 6 }, suggested: { s: 100, z: 6 } });
    expect(r.pinViolations![0].fix).toContain('6.00 m');
    // reported, not obeyed by another line: Auto's own, engineered as such (QA sweep 3: the straight line from
    // A to B in its place moved the Královec railway 25 m at km 7)
    expect(r.lineOk).toBe(true);
    expect(r.vpis).toEqual(autoProfile(s, g, opt).vpis);
  });

  it('keeps meeting the reachable pins beside an unreachable one', () => {
    const r = autoProfile(s, g, { ...opt, pins: [{ s: 100, z: 20 }, { s: 1200, z: 8 }] });
    expect(r.lineOk).toBe(true);
    expect(r.pinViolations!.map((v) => v.pin.index)).toEqual([0]);
    expect(Math.abs(elevationAt(buildProfile(r.vpis, opt.minCrest, opt.minSag), 1200) - 8)).toBeLessThanOrEqual(GRADE_PIN_TOLERANCE + 1e-9);
  });

  it('does not replace ground tie-ins with conflicting endpoint pins', () => {
    for (const station of [0, 2000]) {
      const r = autoProfile(s, g, { ...opt, pins: [{ s: station, z: 1 }] });
      expect(r.feasible).toBe(false);
      expect(r.vpis[0].z).toBe(0);
      expect(r.vpis.at(-1)!.z).toBe(0);
      expect(r.pinViolations![0].pin.reachable).toEqual({ min: 0, max: 0 });
    }
  });

  it('rejects conflicting close/coincident pins without relaxing gradients', () => {
    for (const next of [1000, 1010]) {
      const r = autoProfile(s, g, { ...opt, pins: [{ s: 1000, z: 10 }, { s: next, z: 12 }] });
      expect(r.feasible).toBe(false);
      expect(r.pinViolations!.some((v) => v.pin.reason === 'gradient-envelope')).toBe(true);
      expect(profileOk(r.vpis, opt.maxGradient, opt.minCrest, opt.minSag)).toBe(true);
    }
  });

  it('reports bounded-search failure rather than shrinking a vertical curve to meet pins', () => {
    // A 6% pointed peak meets the gradient envelope but cannot accommodate the minimum crest.
    const ss = Float64Array.from({ length: 51 }, (_, i) => i * 10);
    const gg = new Float64Array(ss.length);
    const r = autoProfile(ss, gg, { ...opt, pins: [{ s: 250, z: 15 }] });
    expect(r.feasible).toBe(false);
    expect(r.pinViolations![0].pin).toMatchObject({ reason: 'search', suggested: { s: 250, z: 0 } });
    expect(r.pinViolations![0].basis).toBe('engine');
    expect(profileOk(r.vpis, opt.maxGradient, opt.minCrest, opt.minSag)).toBe(true);
  });

  it('checks short-route pins instead of bypassing them with the straight-line shortcut', () => {
    const ss = Float64Array.from([0, 10, 20]), gg = new Float64Array(3);
    expect(autoProfile(ss, gg, { ...opt, pins: [{ s: 10, z: 0.5 }] }).feasible).toBe(true);
    const r = autoProfile(ss, gg, { ...opt, pins: [{ s: 10, z: 1.2 }] });
    expect(r.feasible).toBe(false);
    expect(r.pinViolations!.length).toBeGreaterThan(0);
  });

  it('preserves no-pin results exactly for empty or entirely inactive saved pins', () => {
    const baseline = autoProfile(s, g, opt);
    expect(autoProfile(s, g, { ...opt, pins: [] })).toEqual(baseline);
    expect(autoProfile(s, g, { ...opt, pins: [{ s: 2000.01, z: 1000 }, { s: -1, z: 100 }] })).toEqual(baseline);
    expect(gradePinViolations([{ s: 2001, z: 100 }], buildProfile(baseline.vpis, 6000, 3400), 0.06)).toEqual([]);
  });

  it('rejects non-finite pins explicitly and leaves input pins untouched', () => {
    const pins = [{ s: NaN, z: 5 }, { s: 800, z: Infinity }];
    const r = autoProfile(s, g, { ...opt, pins });
    expect(r.feasible).toBe(false);
    expect(r.pinViolations!.map((v) => v.pin.reason)).toEqual(['invalid', 'invalid']);
    expect(pins).toEqual([{ s: NaN, z: 5 }, { s: 800, z: Infinity }]);
  });

  it('budgets dense final-half-cell pins before scanning them for every final segment', () => {
    // 749 possible final segments × 81,000 pins already exceed the 60 M work budget.
    // Keep the fixture itself small (~two MB of pin data), not a station × state tensor.
    const pins = Array.from({ length: 81_000 }, (_, i) => ({ s: 24999 + i / 100_000, z: 0 }));
    const r = autoProfile([0, 12500, 25000], [0, 0, 0], { ...opt, pins,
      knotSpacing: 12500, pad: 1000, minCrest: 1e8, minSag: 1e8 });
    // bounded search skipped: Auto's line without the pins, which here meets every one of them
    expect(r.lineOk).toBe(true);
    expect(r.feasible).toBe(true);
    expect(r.pinViolations).toEqual([]);
  });

  it('retains pin constraints in every material-balance pass', () => {
    let calls = 0;
    solve([{ s: 825.3, z: 12.17 }], { balance: {
      start: 200, lo: 0, hi: 500, tolerance: 1,
      costFor: (value) => (h) => 1e4 * (h + value / 100) ** 2,
      balanceOf: (vpis) => {
        calls++;
        expect(Math.abs(elevationAt(buildProfile(vpis, 6000, 3400), 825.3) - 12.17)).toBeLessThanOrEqual(0.5 + 1e-9);
        return -100;
      },
    } });
    expect(calls).toBeGreaterThan(1);
    expect(calls).toBeLessThanOrEqual(4);
  });
});
