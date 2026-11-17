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

describe('a slowed stretch (playtest sweep 3, P1 #1)', () => {
  it('is never faster than its road, and covers the straights halfway to its neighbours (all of a one-bend road)', async () => {
    const { bendSpeed, bendSpeedChoices, bendStretch } = await import('../src/core/design-speed');
    // a 120 km/h railway: no curve faster than the line (the 160 km/h pilot was withdrawn)
    expect(bendSpeed({ x: 0, y: 0, r: null, speed: 160 }, 120, 'R1')).toBe(120);
    expect(bendSpeedChoices(120, 'R1')).toEqual([120, 100, 80, 60]);
    expect(bendSpeedChoices(90, 'S9.5')).toEqual([90, 80, 70]);
    const p = pis(), al = build(p), c = al.curves;
    expect(bendStretch(al, p, 1, 90)).toEqual({ s0: (c[0].sEnd + c[1].sStart) / 2, s1: (c[1].sEnd + c[2].sStart) / 2, speed: -1 });
    const one: PI[] = [{ x: 3000, y: 300, r: null }], al1 = build(one);
    expect(bendStretch(al1, one, 0, 90)).toMatchObject({ s0: 0, s1: al1.length });
  });
  it('a slowed stretch searches its heights as for the road\'s speed (hairpins keep theirs)', async () => {
    const { searchSpeeds } = await import('../src/core/design-speed');
    const p: PI[] = [{ x: 0, y: 0, r: null, speed: 70 }, { x: 1, y: 0, r: null }, { x: 2, y: 0, r: null, speed: 80 }, { x: 3, y: 0, r: null, speed: 70, hairpin: true }];
    expect(searchSpeeds(p, 90, 'S9.5')).toEqual([90, null, 90, null]);
    expect(searchSpeeds([{ x: 0, y: 0, r: null }], 90, 'S9.5')).toBeUndefined();
  });
  it('a slowed bend keeps the road speed\'s curve where it fits, its own tightest where not', async () => {
    const { planPis } = await import('../src/core/plan-speeds');
    // room for a 90 km/h curve: kept
    const roomy: PI[] = [{ x: 3000, y: 300, r: null, speed: 70 }];
    expect(planPis(a, b, roomy, 90, 'S9.5')[0].speed).toBe(90);
    // three bends 330 m apart, all slowed to 70: 90 km/h S-bends do not fit between them; the middle one takes its
    // own tightest, the outer ones keep 90 km/h curves
    const tight: PI[] = [{ x: 2670, y: 300, r: null, speed: 70 }, { x: 3000, y: 0, r: null, speed: 70 }, { x: 3330, y: 300, r: null, speed: 70 }];
    const plan = planPis(a, b, tight, 90, 'S9.5');
    expect(plan.map(p => p.speed)).toEqual([90, 70, 90]);
    expect(ROAD_CHECKS.horizontal(build(plan), speedNorms(90, 'S9.5'), { a, b, pis: plan, category: 'S9.5' })).toEqual([]);
    const at90 = tight.map(p => ({ ...p, speed: undefined }));
    expect(ROAD_CHECKS.horizontal(build(at90), speedNorms(90, 'S9.5'), { a, b, pis: at90, category: 'S9.5' }).map(v => v.title)).toContain('Bends 1 and 2 are too close for an S-bend');
  });
});

// QA3 P1 #1: a stretch slowed only relaxes its rules, so Auto's road may not cost more for it (the grade search
// prices an estimate; Auto keeps the faster geometry where the bill finds it cheaper).
describe.skipIf(!existsSync('public/scenarios/d11/meta.json'))('slowing a stretch on D11', () => {
  it('never makes Auto\'s road dearer: one 7° bend (the whole road) at 90 / 80 / 70 km/h', async () => {
    const { readFileSync } = await import('node:fs');
    const { evaluate } = await import('../src/core/evaluate');
    const { loadPack } = await import('../scripts/loadpack');
    const { meta, scenario, terrain, buildings, roads, junctions } = loadPack();
    const ctx = { terrain, scenario, a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] }, buildings, roads, junctions };
    const base = JSON.parse(readFileSync('qa3/designs/d11-one-bend-70.json', 'utf8'));
    const at = (v: number) => evaluate(ctx, { ...base, pis: base.pis.map((p: PI) => ({ ...p, speed: v })) });
    const [r90, r80, r70] = [at(90), at(80), at(70)];
    // (QA3: 70 billed 9,067 M against 8,782 M, an 800 m bridge at km 8.84–9.64; the weighing is before the retries:
    // a near-tie may end ≈ 1 M either way)
    expect(r80.cost.total).toBeLessThanOrEqual(r90.cost.total + 2e6);
    expect(r70.cost.total).toBeLessThanOrEqual(r90.cost.total + 2e6);
    // the 90 km/h curve fits: kept
    expect(r70.planSpeeds?.[0]).toBe(90);
    expect(r70.travelMin).toBeGreaterThan(r90.travelMin + 3);
  }, 60_000);
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
  it('a hairpin squeezed by the bends next to it is a problem with a fix (QA sweep 3 re-check: R 13 m, no word)', () => {
    // the sweep's lone hairpin between two bends 500 m away: its 30 m curve has no room and is drawn far sharper
    const p: PI[] = [{ x: 950, y: 200, r: null }, { x: 1000, y: 500, r: null, hairpin: true }, { x: 1050, y: 200, r: null }];
    const g = buildAlignment(A, { x: 2000, y: 200 }, p, horizontalRules(70, 'S9.5'), bendRules(p, 70, 'S9.5'));
    expect(g.curves[1].r).toBeCloseTo(30, 6);
    expect(g.curves[1].rEff).toBeLessThan(29);
    const squeezed = ROAD_CHECKS.horizontal(g, speedNorms(70, 'S9.5'), { a: A, b: { x: 2000, y: 200 }, pis: p, category: 'S9.5' })
      .filter(v => v.kind === 'radius' && v.pi === 1);
    expect(squeezed.map(v => v.title)).toEqual(['Hairpin at bend 2 has no room for its curve']);
    expect(squeezed[0].fix).toMatch(/^Move the bends next to bend 2 about \d+ m further from it/);
    // with room, none
    expect(ROAD_CHECKS.horizontal(al(zig), speedNorms(70, 'S9.5'), { a: A, b: B, pis: zig, category: 'S9.5' }).filter(v => v.kind === 'radius')).toEqual([]);
  });
  it('is allowed only in the mountains on a stretch at the lowest speed', async () => {
    const { hairpinViolations } = await import('../src/core/design-speed');
    const { syntheticTerrain } = await import('../src/core/terrain');
    // game rule: the ground around the hairpin itself is steep (the 10 km section may still be hilly)
    const steep = syntheticTerrain(400, 400, 5, (_x, y) => 300 + 0.25 * y), flat = syntheticTerrain(400, 400, 5, () => 300);
    expect(hairpinViolations(al(zig), zig, 70, 'S9.5', steep)).toEqual([]);
    expect(hairpinViolations(al(zig), zig, 70, 'S9.5', flat).map(v => v.title)).toEqual(['Hairpin at bend 1 on gentle ground']);
    expect(hairpinViolations(al(zig), zig, 90, 'S9.5', steep).map(v => v.title)).toEqual(['Hairpin at bend 1 on a 90 km/h stretch']);
    // a hairpin turns the road almost back on itself; a 40° bend is a case for a lower design speed instead
    const gentle: PI[] = [{ x: 1000, y: 200, r: null, hairpin: true }];
    const g = buildAlignment(A, { x: 2000, y: 1040 }, gentle, horizontalRules(70, 'S9.5'), bendRules(gentle, 70, 'S9.5'));
    expect(hairpinViolations(g, gentle, 90, 'S9.5', steep).map(v => v.fix)).toEqual(['Make bend 1 an ordinary curve; for a tighter one set its stretch to 70 km/h']);
  });
  it('a bend turning back almost on itself offers to be a hairpin where one may stand (QA3)', async () => {
    const { hairpinFixes } = await import('../src/core/design-speed');
    const { syntheticTerrain } = await import('../src/core/terrain');
    const steep = syntheticTerrain(400, 400, 5, (_x, y) => 300 + 0.25 * y), flat = syntheticTerrain(400, 400, 5, () => 300);
    const u: PI[] = [{ x: 1000, y: 200, r: null }], B2 = { x: 0, y: 300 };
    const ua = buildAlignment(A, B2, u, horizontalRules(90, 'S9.5'), bendRules(u, 90, 'S9.5'));
    const issues = () => ROAD_CHECKS.horizontal(ua, speedNorms(90, 'S9.5'), { a: A, b: B2, pis: u, category: 'S9.5' }).filter(v => v.title.endsWith('turns back almost on itself'));
    const onSteep = issues();
    hairpinFixes(ua, u, 'S9.5', steep, onSteep);
    expect(onSteep.map(v => v.target?.hairpin)).toEqual([{ pi: 0, speed: 70 }]);
    const onFlat = issues();
    hairpinFixes(ua, u, 'S9.5', flat, onFlat);
    expect(onFlat.map(v => v.target?.hairpin)).toEqual([undefined]);
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
