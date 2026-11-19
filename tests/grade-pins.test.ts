import { describe, expect, it } from 'vitest';
import { autoProfile, pinClearanceBlame, profileOk, STEEP_MAX, type AutoProfileOptions } from '../src/core/autoprofile';
import { GRADE_PIN_TOLERANCE, gradePinViolations, normalizeGradePins, reachableSuggestions, type GradePin } from '../src/core/grade-pins';
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

  // 20 m up in 100 m: 20 %, beyond STEEP_MAX times the 6 % limit: out of any reach Auto builds to (else honoured, below)
  it('reports computed gradient reach bounds and a height edit for a pin out of any reach', () => {
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

  // The owner (2026-11-19): a pin the player set is honoured. Out of the slopes' reach within the norm (here two pins
  // 25 m apart in height 300 m apart: 8.3 % of a 6 % limit), the line is steeper next to them, never beyond STEEP_MAX
  // times the norm, and Auto's own line outside the stretch it re-solves around them (the far line unchanged).
  it('honours pins out of the slopes\' reach by a steep stretch next to them, the far line Auto\'s own', () => {
    const ss = Float64Array.from({ length: 601 }, (_, i) => i * 10), gg = Float64Array.from(ss, x => 30 * Math.sin(x / 900));
    const own = autoProfile(ss, gg, opt), ownP = buildProfile(own.vpis, opt.minCrest, opt.minSag);
    const z0 = elevationAt(ownP, 3000), pins = [{ s: 3000, z: z0 }, { s: 3300, z: z0 + 25 }];
    const r = autoProfile(ss, gg, { ...opt, pins }), p = buildProfile(r.vpis, opt.minCrest, opt.minSag);
    expect(r.pinViolations).toEqual([]);
    for (const pin of pins) expect(Math.abs(elevationAt(p, pin.s) - pin.z)).toBeLessThanOrEqual(GRADE_PIN_TOLERANCE + 1e-9);
    expect(r.steep!.every(w => w.left.pin.reason === 'gradient-envelope')).toBe(true);
    const spans = r.honoured!.spans, within = (a: number, b: number) => spans.some(([x, y]) => a >= x - 260 && b <= y + 260);
    expect(spans[0][0]).toBeGreaterThan(500);
    expect(spans[spans.length - 1][1]).toBeLessThan(5500);
    const steep = p.grades.map((x, i) => ({ x: Math.abs(x), s0: p.pts[i].s, s1: p.pts[i + 1].s })).filter(q => q.x > opt.maxGradient + 1e-9);
    expect(steep.some(q => q.s0 < 3300 && q.s1 > 3000)).toBe(true);
    for (const q of steep) { expect(q.x).toBeLessThanOrEqual(STEEP_MAX * opt.maxGradient + 1e-9); expect(within(q.s0, q.s1)).toBe(true); }
    for (let x = 0; x <= 6000; x += 10) if (!within(x, x)) expect(elevationAt(p, x)).toBeCloseTo(elevationAt(ownP, x), 6);
  });

  it('suggests a height the search meets within the norm, not the slopes\' bound it cannot reach', () => {
    // 36 m in the first 600 m is the slopes' bound; the changes of slope from A (6 % takes room) leave it out of reach.
    // The suggestion's check is the line within the norm (`pinStrict`: left out, as before the owner's rule).
    const run = (pins: GradePin[]) => autoProfile(s, g, { ...opt, pins, pinStrict: true });
    for (const z of [50, -50]) {
      const v0 = run([{ s: 600, z }]).pinViolations![0];
      expect(Math.abs(v0.pin.suggested!.z)).toBe(36);
      expect(run([{ s: 600, z: v0.pin.suggested!.z }]).pinViolations![0].pin.reason).toBe('search');
      const [v] = reachableSuggestions([v0], [{ s: 600, z }], run);
      const set = v.pin.suggested!.z;
      expect(Math.abs(set)).toBeLessThan(36);
      expect(Math.abs(set)).toBeGreaterThan(30);
      expect(run([{ s: 600, z: set }]).pinViolations).toEqual([]);
      expect(v.fix).toBe(`Set it to ${set.toFixed(1)} m, or unpin`);
    }
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

// A pin met only by missing a crossing's clearance Auto's own line keeps: honoured (the owner, 2026-11-19; cost model
// 51 left it out), the line Auto's own from 500 m either side of it, and the crossing it misses put down to it
// (pinClearanceBlame: the nearest pin). A suggestion's check (`pinStrict`) still leaves it out, the old rule, judged on
// the finished (rounded) line; the nearest of several pins is not blamed when another is the one in the way.
describe('a pin against a crossing', () => {
  // flat ground, a crossing over km 0.80–1.20 our line must clear 6 m above
  const floor = Float64Array.from(s, (x) => x >= 800 && x <= 1200 ? 6 : NaN);
  const at = (penalty: number) => Float64Array.from(s, () => penalty);
  const ask = { minH: floor, clearancePenaltyAt: at(1e11) };
  it('honours a pin that holds the line under it, the line Auto\'s own beyond 500 m of it', () => {
    const own = autoProfile(s, g, { ...opt, ...ask });
    const ownP = buildProfile(own.vpis, opt.minCrest, opt.minSag);
    for (let x = 800; x <= 1200; x += 10) expect(elevationAt(ownP, x)).toBeGreaterThanOrEqual(6 - 0.05);
    const pins = [{ s: 900, z: 0 }], pinned = autoProfile(s, g, { ...opt, ...ask, pins });
    const p = buildProfile(pinned.vpis, opt.minCrest, opt.minSag);
    expect(pinned.pinViolations).toEqual([]);
    expect(Math.abs(elevationAt(p, 900))).toBeLessThanOrEqual(GRADE_PIN_TOLERANCE + 1e-9);
    expect(pinned.honoured!.pins).toEqual(pins);
    for (let x = 0; x <= 2000; x += 10) if (x < 900 - 760 || x > 900 + 760) expect(elevationAt(p, x)).toBeCloseTo(elevationAt(ownP, x), 9);
    // the crossing it misses, put down to it
    const blame = pinClearanceBlame(s, g, { ...opt, ...ask, pins }, pinned.vpis, () => own.vpis);
    expect([...blame.keys()]).toEqual([0]);
    expect(blame.get(0)).toBeGreaterThanOrEqual(800);
    // a suggestion's check: within the norm, left out
    expect(autoProfile(s, g, { ...opt, minH: floor, pinStrict: true, pins }).pinViolations![0].pin.reason).toBe('clearance');
  });
  it('a suggestion\'s check keeps a pin out of the way although nearer the crossing, and a saved pin off the route costs nothing', () => {
    // the pin at km 1.00 holds the line down through the whole crossing; the misses at its start lie nearer the pin at
    // km 0.70, which a line clearing the crossing meets
    const r = autoProfile(s, g, { ...opt, ...ask, pinStrict: true, pins: [{ s: 700, z: 3 }, { s: 1000, z: 0 }, { s: 3000, z: 0 }] });
    expect(r.pinViolations!.map(v => v.pin.index)).toEqual([1]);
    const lone = autoProfile(s, g, { ...opt, ...ask, pins: [{ s: 3000, z: 0 }] });
    expect(lone.vpis).toEqual(autoProfile(s, g, { ...opt, ...ask }).vpis);
  });
});
