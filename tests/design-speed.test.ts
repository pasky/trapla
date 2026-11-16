// Design speed by stretch (docs/design-realism-plan.md M4): a bend's own speed sets its curve rules, its
// stretch's travel time; the vertical radii take the fastest stretch's until the grade line takes each stretch's.
import { describe, expect, it } from 'vitest';
import { ROAD_CHECKS } from '../src/core/checks';
import { bendRules, horizontalRules, roadNorms, speedNorms } from '../src/core/data/norms';
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

  it('the vertical radii are the fastest stretch\'s until the grade line takes each stretch\'s own', () => {
    expect(roadNorms(pis(70), 90, 'S9.5').minCrestRadius).toBe(speedNorms(90, 'S9.5').minCrestRadius);
    expect(roadNorms(pis(90), 70, 'S9.5').minCrestRadius).toBe(speedNorms(90, 'S9.5').minCrestRadius);
    expect(roadNorms(pis(90), 70, 'S9.5').minRadius).toBe(speedNorms(70, 'S9.5').minRadius);
  });
});

describe('hairpins (research/47 §3)', () => {
  // up a slope and back: the bend turns 158°
  const zig: PI[] = [{ x: 1000, y: 200, r: null, hairpin: true }];
  const A = { x: 0, y: 200 }, B = { x: 0, y: 600 };
  const al = (p: PI[]) => buildAlignment(A, B, p, horizontalRules(70, 'S9.5'), bendRules(p, 70, 'S9.5'));
  it('a hairpin is a plain 17.5 m arc, driven at the speed its radius allows, its lanes widened', async () => {
    const { hairpinSpeed, hairpinWidening } = await import('../src/core/design-speed');
    const { hairpinLaneWidening } = await import('../src/core/data/norms');
    const c = al(zig).curves[0];
    expect(c.r).toBeCloseTo(17.5, 6);
    expect(al(zig).units.find(u => u.first === 0)?.transitions).toBe(0);
    expect(hairpinSpeed(17.5)).toBeCloseTo(26.88, 2); // √(127 · 17.5 · 0.325)
    const st = speedStretches(al(zig), zig, 70, 'S9.5');
    expect(st.some(x => x.speed < 30 && Math.abs(x.s1 - x.s0 - c.arcLen) < 1e-6)).toBe(true);
    // S 9.5, class I: 16.5 m lorry at R 17.5 sweeps 5.0 m + 0.75 m margin; lanes are 3.5 m
    expect(hairpinLaneWidening(17.5, 'S9.5')).toBeCloseTo(5.0 + 0.75 - 3.5, 6);
    const s = Float64Array.from({ length: 220 }, (_, i) => i * 10);
    const w = hairpinWidening(al(zig), zig, 'S9.5', s)!;
    expect(Math.max(...w)).toBeCloseTo(2.25, 6);
    expect(w[0]).toBe(0);
  });
  it('is allowed only in the mountains on a stretch at the lowest speed', async () => {
    const { hairpinViolations } = await import('../src/core/design-speed');
    const { syntheticTerrain } = await import('../src/core/terrain');
    const steep = syntheticTerrain(400, 400, 5, (_x, y) => 300 + 0.25 * y), flat = syntheticTerrain(400, 400, 5, () => 300);
    expect(hairpinViolations(al(zig), zig, 70, 'S9.5', steep)).toEqual([]);
    expect(hairpinViolations(al(zig), zig, 70, 'S9.5', flat).map(v => v.title)).toEqual(['Hairpin at bend 1 outside the mountains']);
    expect(hairpinViolations(al(zig), zig, 90, 'S9.5', steep).map(v => v.title)).toEqual(['Hairpin at bend 1 on a 90 km/h stretch']);
  });
});
