// A new junction's view along the road it joins (core/tie-in.ts sightField): the whole sight triangle checked, ground
// beside the road dug clear where it is only a little in the way, the road's own crest and deeper ground a problem
// (owner report: a slip road's T junction across open fields "no clear view" whatever the player did).
import { describe, expect, it } from 'vitest';
import type { Result } from '../src/core/evaluate';
import type { Terrain } from '../src/core/terrain';
import { resultLine, sightField, TIE_IN_RULES } from '../src/core/tie-in';

/** a straight road along x through (0, 0), heights `z(x)`, stations every 5 m from x = −400 */
const host = (z: (x: number) => number) => {
  const n = 161, ds = 5, s = Array.from({ length: n }, (_, i) => i * ds), x = s.map(v => v - 400);
  return { n, ds, length: (n - 1) * ds, s, x, y: x.map(() => 0), tx: x.map(() => 1), ty: x.map(() => 0), grade: x.map(z) } as unknown as Result;
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
    const f = sightField(end, ours(300), resultLine(host(() => 300), 3.75), ground(() => 300));
    expect(f).toEqual({ blocked: null, dig: null });
  });
  it('a low bank beside the road in the triangle is dug down under the sight lines, a high one is a problem', () => {
    const bank = (h: number) => ground((x, y) => 300 + (y < -4 && y > -6.5 && Math.abs(x) > 5 ? h : 0));
    const low = sightField(end, ours(300), resultLine(host(() => 300), 3.75), bank(0.9));
    expect(low.blocked).toBeNull();
    // (the lines 1 m over the road, the ground kept 0.25 m under them: 0.15 m off the bank's top)
    expect(Math.max(...low.dig!.cells.map(c => c.depth))).toBeCloseTo(0.9 - (1 - TIE_IN_RULES.clearance), 1);
    expect(low.dig!.volume).toBeGreaterThan(0);
    expect(sightField(end, ours(300), resultLine(host(() => 300), 3.75), bank(1 + TIE_IN_RULES.graded)).blocked).not.toBeNull();
  });
  it('the road\'s own crest hides a car only where it rises over the sight line by more than the ground model\'s error', () => {
    // a crest at the junction falling away both ways, its vertical radius R
    const crest = (R: number) => (x: number) => 300 - x * x / (2 * R);
    const at = (R: number) => sightField(end, ours(300), resultLine(host(crest(R)), 3.75), ground(x => crest(R)(x)));
    expect(at(1500).blocked).not.toBeNull();
    expect(at(6000).blocked).toBeNull();
  });
});
