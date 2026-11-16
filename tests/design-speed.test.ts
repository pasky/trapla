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
