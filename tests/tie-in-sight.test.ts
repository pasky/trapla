// A new junction's view along the road it joins (core/tie-in.ts sightField): the whole sight triangle checked, ground
// beside the road dug clear where it is only a little in the way, the road's own crest and deeper ground a problem
// (owner report: a slip road's T junction across open fields "no clear view" whatever the player did).
import { describe, expect, it } from 'vitest';
import type { Result } from '../src/core/evaluate';
import type { Terrain } from '../src/core/terrain';
import { resultLine, sightField, TIE_IN_RULES } from '../src/core/tie-in';

/** a straight road along x through (0, 0), heights `z(x)`, stations every `ds` m from x = −400; `day`: its slopes' reach
 * from its line, to the ground `zDay` */
const host = (z: (x: number) => number, ds = 5, day = 3.75, zDay = z) => {
  const n = 800 / ds + 1, s = Array.from({ length: n }, (_, i) => i * ds), x = s.map(v => v - 400);
  return { n, ds, length: (n - 1) * ds, s, x, y: x.map(() => 0), tx: x.map(() => 1), ty: x.map(() => 0), grade: x.map(z),
    dayL: x.map(() => day), dayR: x.map(() => day), zDayL: x.map(zDay), zDayR: x.map(zDay) } as unknown as Result;
};
/** a road bending round the junction at (0, 0) on a circle of radius R (its centre to the south), level at 300 */
const bend = (R: number) => {
  const n = 161, ds = 5, s = Array.from({ length: n }, (_, i) => i * ds), a = s.map(v => (v - 400) / R);
  return { n, ds, length: (n - 1) * ds, s, x: a.map(t => R * Math.sin(t)), y: a.map(t => R * Math.cos(t) - R), tx: a.map(t => Math.cos(t)), ty: a.map(t => -Math.sin(t)),
    grade: a.map(() => 300), dayL: a.map(() => 3.75), dayR: a.map(() => 3.75), zDayL: a.map(() => 300), zDayR: a.map(() => 300) } as unknown as Result;
};
/** our road coming up from the south square to it, ending at (0, 0) on the ground `z` there */
const ours = (z0: number) => {
  const n = 13, ds = 5, s = Array.from({ length: n }, (_, i) => i * ds), y = s.map(v => v - 60);
  const f = (v: number) => Float64Array.from({ length: n }, () => v);
  return { n, ds, length: 60, s, x: y.map(() => 0), y, tx: f(0), ty: f(1), grade: f(z0), dayL: f(4), dayR: f(4), zDayL: f(z0), zDayR: f(z0),
    cell: { urban: f(0), width: f(7.5) }, demolished: [], boughtOut: [] } as unknown as Result;
};
const ground = (z: (x: number, y: number) => number) => ({ heightAt: z, isOob: () => false }) as unknown as Terrain;
const end = { end: 'b' as const, x: 0, y: 0 };

describe('the view along the road a new junction joins', () => {
  it('across open level ground: clear, nothing dug', () => {
    const f = sightField(end, ours(300), 3.75, resultLine(host(() => 300), 3.75), ground(() => 300));
    expect(f).toEqual({ blocked: null, dig: null });
  });
  it('a low bank beside the road in the triangle is dug down under the sight lines, a high one is a problem', () => {
    const bank = (h: number) => ground((x, y) => 300 + (y < -4 && y > -6.5 && Math.abs(x) > 5 ? h : 0));
    const low = sightField(end, ours(300), 3.75, resultLine(host(() => 300), 3.75), bank(0.9));
    expect(low.blocked).toBeNull();
    // (the lines 1 m over the road, the ground kept 0.25 m under them: 0.15 m off the bank's top)
    expect(Math.max(...low.dig!.cells.map(c => c.depth))).toBeCloseTo(0.9 - (1 - TIE_IN_RULES.clearance), 1);
    expect(low.dig!.volume).toBeGreaterThan(0);
    expect(sightField(end, ours(300), 3.75, resultLine(host(() => 300), 3.75), bank(1 + TIE_IN_RULES.graded)).blocked).not.toBeNull();
  });
  it('on a bend the sight lines go to the road itself: a bank on the inside of the bend is in the way', () => {
    // (the bend curves away south of the junction; the bank south of the chord, between the eye and the car 160 m on)
    const R = 200, bank = ground((x, y) => 300 + (Math.hypot(x, y + R) < R - 8 && y < -10 && x > 20 && x < 120 ? 5 : 0));
    expect(sightField(end, ours(300), 3.75, resultLine(bend(R), 3.75), bank).blocked).not.toBeNull();
    expect(sightField(end, ours(300), 3.75, resultLine(bend(R), 3.75), ground(() => 300)).blocked).toBeNull();
  });
  it('a designed road joined in a cutting: read as built (its pavement, then its slopes), whatever its stations\' spacing', () => {
    // (the road 1 m under the ground, its slopes out to 5.25 m; the waiting eye at the ground's level: the slopes' tops by
    // the junction cut back a little, nothing under the pavement)
    const cut = ground((_, y) => Math.abs(y) < 5.25 ? 299 + Math.max(0, Math.abs(y) - 3.75) / 1.5 : 300);
    const at = (ds: number) => sightField(end, ours(299), 3.75, resultLine(host(() => 299, ds, 5.25, () => 300), 3.75), cut);
    const fine = at(1), coarse = at(10);
    expect(fine.blocked).toBeNull();
    expect(fine.dig!.cells.every(c => Math.abs(c.y) > 3.75 && c.depth < 0.3)).toBe(true);
    expect(coarse.dig!.volume).toBeCloseTo(fine.dig!.volume, 6);
  });
  it('the road\'s own crest hides a car only where it rises over the sight line by more than the ground model\'s error', () => {
    // a crest at the junction falling away both ways, its vertical radius R
    const crest = (R: number) => (x: number) => 300 - x * x / (2 * R);
    const at = (R: number) => sightField(end, ours(300), 3.75, resultLine(host(crest(R)), 3.75), ground(x => crest(R)(x)));
    expect(at(1500).blocked).not.toBeNull();
    expect(at(6000).blocked).toBeNull();
  });
});
