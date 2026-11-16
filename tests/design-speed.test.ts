// Design speed by stretch (docs/design-realism-plan.md M4): a bend's own speed sets its curve rules, its
// stretch's travel time; the vertical radii take the fastest stretch's until the grade line takes each stretch's.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROAD_CHECKS } from '../src/core/checks';
import { bendRules, horizontalRules, speedNorms } from '../src/core/data/norms';
import { speedStretches, travelMinutes } from '../src/core/design-speed';
import { buildAlignment, type PI } from '../src/core/horizontal';

const a = { x: 0, y: 0 }, b = { x: 6000, y: 0 };
const pis = (speed?: number, r: number | null = 210): PI[] => [
  { x: 1500, y: 400, r: null }, { x: 3000, y: 0, r, ...(speed ? { speed } : {}) }, { x: 4500, y: 400, r: null }];
const build = (p: PI[]) => buildAlignment(a, b, p, horizontalRules(90, 'S9.5'), bendRules(p, 90, 'S9.5'));
const radiusIssues = (p: PI[]) => ROAD_CHECKS.horizontal(build(p), speedNorms(90, 'S9.5'), { a, b, pis: p, category: 'S9.5' })
  .filter(v => v.kind === 'radius');

describe('design speed by stretch', () => {
  it('a bend on a 70 km/h stretch of a 90 km/h road may be as sharp as 70 km/h allows', () => {
    expect(radiusIssues(pis()).map(v => v.pis)).toEqual([[1]]); // R 210 < 355 at 90 km/h
    expect(radiusIssues(pis(70))).toEqual([]); // ≥ 205 at 70 km/h
    expect(build(pis(70, null)).curves[1].r).toBeGreaterThanOrEqual(205);
    expect(build(pis(70, null)).curves[1].r).toBeLessThan(build(pis(undefined, null)).curves[1].r);
    // a speed the category does not have is ignored
    expect(radiusIssues(pis(60)).map(v => v.pis)).toEqual([[1]]);
  });

  it('travel time adds each stretch at its own speed; the speed changes halfway between the curves', () => {
    const p = pis(70), al = build(p), st = speedStretches(al, p, 90, 'S9.5');
    expect(st.map(x => x.speed)).toEqual([90, 70, 90]);
    const c = al.curves;
    expect(st[1].s0).toBeCloseTo((c[0].sEnd + c[1].sStart) / 2, 6);
    expect(st[1].s1).toBeCloseTo((c[1].sEnd + c[2].sStart) / 2, 6);
    expect(travelMinutes(st)).toBeCloseTo((al.length - (st[1].s1 - st[1].s0)) / 25 / 60 + (st[1].s1 - st[1].s0) / (70 / 3.6) / 60, 9);
    expect(speedStretches(build(pis()), pis(), 90, 'S9.5')).toEqual([{ s0: 0, s1: build(pis()).length, speed: 90 }]);
  });

  it('each stretch rounds hilltops and dips with its own speed\'s radii', async () => {
    const { stretchRadii } = await import('../src/core/design-speed');
    const p = pis(70), al = build(p), st = speedStretches(al, p, 90, 'S9.5'), r = stretchRadii(al, p, 90, 'S9.5');
    const crest = r.crest as (s: number) => number;
    expect(crest(10)).toBe(speedNorms(90, 'S9.5').minCrestRadius);
    expect(crest((st[1].s0 + st[1].s1) / 2)).toBe(speedNorms(70, 'S9.5').minCrestRadius);
    expect(r.crestMin).toBe(speedNorms(70, 'S9.5').minCrestRadius);
    expect(stretchRadii(build(pis()), pis(), 90, 'S9.5').crest).toBe(speedNorms(90, 'S9.5').minCrestRadius);
  });
});

describe('hairpins (research/47 §3)', () => {
  // up a slope and back: the bend turns 158°
  const zig: PI[] = [{ x: 1000, y: 200, r: null, hairpin: true }];
  const A = { x: 0, y: 200 }, B = { x: 0, y: 600 };
  const al = (p: PI[]) => buildAlignment(A, B, p, horizontalRules(70, 'S9.5'), bendRules(p, 70, 'S9.5'));
  it('a hairpin is a plain 30 m arc (ČSN 73 6101:2000 table 12), driven at its table speed, its lanes widened', async () => {
    const { hairpinSpeed, hairpinWidening } = await import('../src/core/design-speed');
    const { hairpinLaneWidening } = await import('../src/core/data/norms');
    const c = al(zig).curves[0];
    expect(c.r).toBeCloseTo(30, 6);
    expect(al(zig).units.find(u => u.first === 0)?.transitions).toBe(0);
    expect(hairpinSpeed(30)).toBe(30);
    expect(hairpinSpeed(45)).toBeCloseTo(37.5, 9);
    const st = speedStretches(al(zig), zig, 70, 'S9.5');
    expect(st.some(x => x.speed === 30 && Math.abs(x.s1 - x.s0 - c.arcLen) < 1e-6)).toBe(true);
    // S 9.5, class I: a 16.5 m lorry at R 30 sweeps 4.0 m + 0.75 m margin; lanes are 3.5 m
    expect(hairpinLaneWidening(30, 'S9.5')).toBeCloseTo(4.0 + 0.75 - 3.5, 6);
    const s = Float64Array.from({ length: 220 }, (_, i) => i * 10);
    const w = hairpinWidening(al(zig), zig, 'S9.5', s)!;
    expect(Math.max(...w)).toBeCloseTo(1.25, 6);
    expect(w[0]).toBe(0);
  });
  it('is allowed only in the mountains on a stretch at the lowest speed', async () => {
    const { hairpinViolations, mountainousAlong } = await import('../src/core/design-speed');
    const { syntheticTerrain } = await import('../src/core/terrain');
    const { station } = await import('../src/core/horizontal');
    const steepGround = syntheticTerrain(400, 400, 5, (_x, y) => 300 + 0.25 * y), flatGround = syntheticTerrain(400, 400, 5, () => 300);
    const steep = mountainousAlong(steepGround, station(al(zig), 10)), flat = mountainousAlong(flatGround, station(al(zig), 10));
    expect(hairpinViolations(al(zig), zig, 70, 'S9.5', steep)).toEqual([]);
    expect(hairpinViolations(al(zig), zig, 70, 'S9.5', flat).map(v => v.title)).toEqual(['Hairpin at bend 1 outside the mountains']);
    expect(hairpinViolations(al(zig), zig, 90, 'S9.5', steep).map(v => v.title)).toEqual(['Hairpin at bend 1 on a 90 km/h stretch']);
    // a hairpin turns the road almost back on itself; a 40° bend is a case for a lower design speed instead
    const gentle: PI[] = [{ x: 1000, y: 200, r: null, hairpin: true }];
    const g = buildAlignment(A, { x: 2000, y: 1040 }, gentle, horizontalRules(70, 'S9.5'), bendRules(gentle, 70, 'S9.5'));
    expect(hairpinViolations(g, gentle, 90, 'S9.5', steep).map(v => v.fix)).toEqual(['Make bend 1 an ordinary curve; for a tighter one set its stretch to 70 km/h']);
  });
});

describe('grade limits along the road (M4-2)', () => {
  it('the steepest grade follows the terrain class of the ground; a hairpin is flatter', async () => {
    const { verticalLimits } = await import('../src/core/design-speed');
    const { HAIRPIN } = await import('../src/core/data/norms');
    const { syntheticTerrain } = await import('../src/core/terrain');
    // steep ground (25 %) all along the road
    const t = syntheticTerrain(400, 250, 5, (_x, y) => 300 + 0.25 * y);
    const p: PI[] = [{ x: 1500, y: 500, r: null, hairpin: true }];
    const al = buildAlignment({ x: 100, y: 500 }, { x: 100, y: 1000 }, p, horizontalRules(70, 'S9.5'), bendRules(p, 70, 'S9.5'));
    const { station } = await import('../src/core/horizontal');
    const st = station(al, 10);
    const v = verticalLimits(st, al, p, 70, 'S9.5', t);
    expect(v.maxGradient).toBe(0.08); // S 9.5, mountainous
    expect(v.gradeAt!(0, 100)).toBe(0.08);
    const c = al.curves[0];
    expect(v.gradeAt!(c.sStart, c.sEnd)).toBeCloseTo(HAIRPIN.maxGrade, 9);
    expect(HAIRPIN.maxGrade).toBeCloseTo(0.06, 9);
    // on hilly ground the hilly limit is below a hairpin's: nothing varies
    expect(verticalLimits(st, al, p, 70, 'S9.5', syntheticTerrain(400, 250, 5, () => 300)).gradeAt).toBeUndefined();
    // a rebuilt railway's own fixed grade stays
    expect(verticalLimits(st, al, [], 70, 'S9.5', t, 0.012).gradeAt).toBeUndefined();
  });
});

// research/54 §2: ŘSD classed every section our packs cover as hilly (D11 1109's EIA: "pahorkovitého typu",
// not the mountainous class environmental groups asked for), so along the mapped lines nothing is mountainous.
describe.skipIf(!['d11', 'd35-full'].every(p => existsSync(`public/scenarios/${p}/meta.json`)))('terrain class along documented sections', () => {
  it.each(['d11', 'd35-full'])('%s: the mapped line runs through hilly ground only', async (pack) => {
    const { loadPack } = await import('../scripts/loadpack');
    const { routeMountainous } = await import('../src/core/terrain-class');
    const { meta, terrain } = loadPack(`public/scenarios/${pack}`);
    // the mapped line as stations every 10 m
    const xy = meta.official.xy as [number, number][], s: number[] = [], x: number[] = [], y: number[] = [];
    let at = 0;
    for (let k = 1; k < xy.length; k++) {
      const L = Math.hypot(xy[k][0] - xy[k - 1][0], xy[k][1] - xy[k - 1][1]);
      for (let t = 0; t < L; t += 10) { s.push(at + t); x.push(xy[k - 1][0] + (xy[k][0] - xy[k - 1][0]) * t / L); y.push(xy[k - 1][1] + (xy[k][1] - xy[k - 1][1]) * t / L); }
      at += L;
    }
    const cls = routeMountainous(terrain, { s, x, y, n: s.length });
    expect(cls.reduce((a, b) => a + b, 0)).toBe(0);
  }, 60_000);
});
