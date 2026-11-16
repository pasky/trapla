import { describe, expect, it } from 'vitest';
import { engineerLink, routeAlong, LINK_MAX_SUPPORT, type LinkEnv } from '../src/core/link-route';
import { buildCrossingGeometry, resolveCrossings, type CrossingResult, type CrossingRoute } from '../src/core/crossings';
import { RoadNet } from '../src/core/roadnet';
import { waterSize, type WaterCrossing } from '../src/core/watercourses';

// Our road's earthworks fill y < 10; a reroute runs beside them along y = 20 (x from 0 to 400).
const env = (height: (x: number, y: number) => number, extra: Partial<LinkEnv> = {}): LinkEnv =>
  ({ heightAt: height, margin: (q, e) => q.y - 10 - e, ...extra });
const line = [{ x: 0, y: 20 }, { x: 400, y: 20 }];

describe('a reroute built as a designer builds it', () => {
  it('cuts and fills its profile within the gradient, at most 10 m deep, ending on the roads it joins', () => {
    const bump = (x: number) => 100 + Math.max(0, 12 - Math.abs(x - 200) / 5); // a 12 m hump, 60 m each way
    const plan = engineerLink(line, 4, env(bump), 0.08);
    expect(plan.problems).toEqual([]);
    expect(plan.points[0].z).toBe(100); expect(plan.points.at(-1)!.z).toBe(100);
    for (let i = 1; i < plan.points.length; i++) {
      const a = plan.points[i - 1], b = plan.points[i];
      expect(Math.abs(b.z - a.z)).toBeLessThanOrEqual((b.d! - a.d!) * 0.08 + 1e-9);
      expect(Math.abs(b.z - b.ground)).toBeLessThanOrEqual(LINK_MAX_SUPPORT + 1e-9);
    }
    expect(plan.points.some(p => p.surface === 'ramp' && p.support === 'retaining')).toBe(true); // the cut through the hump
    // a 40 m hump cannot be taken within 10 m of earthworks at 8 %
    expect(engineerLink(line, 4, env(x => 100 + Math.max(0, 40 - Math.abs(x - 200) / 2)), 0.08).problems).toEqual(['steep']);
  });

  it('takes the houses and obstacles its own earth slopes reach, not only those under its pavement', () => {
    // the 12 m hump of the first test, cut through: a house 10 m off the line beside the cut
    const bump = (x: number) => 100 + Math.max(0, 12 - Math.abs(x - 200) / 5);
    const house = { x: 200, y: 30 };
    const near = (a: { x: number; y: number }, b: { x: number; y: number }, half: number) => {
      const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((house.x - a.x) * dx + (house.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(house.x - a.x - t * dx, house.y - a.y - t * dy) <= half;
    };
    const plan = engineerLink(line, 4, env(bump, { houses: (a, b, half) => near(a, b, half) ? [9] : [], houseCost: () => 3e6 }), 0.08);
    expect(plan.houses).toEqual([9]); expect(plan.houseCost).toBe(3e6);
    // on flat ground the same house beside the pavement is left standing; a railway beside a cut stops it
    expect(engineerLink(line, 4, env(() => 100, { houses: (a, b, half) => near(a, b, half) ? [9] : [] }), 0.08).houses).toEqual([]);
    expect(engineerLink(line, 4, env(bump, { obstacle: (a, b, half) => near(a, b, half) ? 'railway' : null }), 0.08).problems).toContain('railway');
  });

  it('carries a stream on a culvert sized like ours, with its earth cover built up, and buys out houses in its way', () => {
    const crossing: WaterCrossing = { s: 0, x: 200, y: 20, id: 7, waterKind: 'stream', width: 0.5, catchmentKm2: 0.4, truncated: false, sine: 1 };
    const plan = engineerLink(line, 4, env(() => 100, {
      streams: (a, b) => (Math.min(a.x, b.x) <= 200 && Math.max(a.x, b.x) > 200 ? [{ x: 200, y: 20, crossing }] : []),
      houses: (a, b) => (Math.min(a.x, b.x) <= 300 && Math.max(a.x, b.x) >= 300 ? [5] : []), houseCost: () => 4e6,
    }), 0.08);
    expect(plan.problems).toEqual([]);
    const size = waterSize(crossing, 4 + 2 * 1.5 * waterSize(crossing, 7).minHeight);
    expect(plan.culverts).toHaveLength(1); expect(plan.culvertCost).toBeGreaterThan(2 * size.head);
    const top = plan.points.reduce((a, p) => Math.abs(p.x - 200) < Math.abs(a.x - 200) ? p : a);
    expect(top.z - 100).toBeGreaterThanOrEqual(size.minHeight - 1e-9);
    expect(plan.houses).toEqual([5]); expect(plan.houseCost).toBe(4e6);
  });

  it('profiles the ground between its samples, gives a stream its cover where it crosses (once), and meets motorways at any point', () => {
    // a 1 m hump only 5 m wide: the drawn road must not climb over it at 40 % between profile samples
    const hump = (x: number) => 100 + Math.max(0, 1 - Math.abs(x - 202.5) / 2.5);
    const over = engineerLink(line, 4, env(hump), 0.08);
    expect(over.problems).toEqual([]);
    for (let i = 1; i < over.points.length; i++) {
      const a = over.points[i - 1], b = over.points[i];
      expect(Math.abs(b.z - a.z)).toBeLessThanOrEqual((b.d! - a.d!) * 0.08 + 1e-9);
      for (const t of [0.25, 0.5, 0.75]) if (a.surface === 'terrain' && b.surface === 'terrain')
        expect(Math.abs(a.z + (b.z - a.z) * t - hump(a.x + (b.x - a.x) * t))).toBeLessThanOrEqual(0.2 + 1e-9);
    }
    // a stream between samples, and one exactly where two survey pieces meet: one culvert each, its cover there
    for (const at of [202, 200]) {
      const crossing: WaterCrossing = { s: 0, x: at, y: 20, id: 7, waterKind: 'stream', width: 0.5, catchmentKm2: 0.4, truncated: false, sine: 1 };
      const plan = engineerLink(line, 4, env(() => 100, { streams: (a, b) => (Math.min(a.x, b.x) <= at && Math.max(a.x, b.x) >= at ? [{ x: at, y: 20, crossing }] : []) }), 0.08);
      expect(plan.culverts).toHaveLength(1);
      const size = waterSize(crossing, 4 + 2 * 1.5 * waterSize(crossing, 7).minHeight);
      expect(plan.points.find(p => Math.abs(p.x - at) < 1e-6)!.z - 100).toBeGreaterThanOrEqual(size.minHeight - 1e-9);
    }
    // a motorway across the line exactly where two survey pieces meet
    expect(engineerLink(line, 4, env(() => 100, { roads: new RoadNet({ cls: ['motorway'], ways: [[0, 150, 0, 150, 40]] }) }), 0.08).problems).toEqual(['motorway']);
  });

  it('never runs on the ground across a railway or a pond', () => {
    const rail = env(() => 100, { obstacle: (a, b) => (Math.min(a.x, b.x) <= 150 && Math.max(a.x, b.x) >= 150 ? 'railway' : null) });
    expect(engineerLink(line, 4, rail, 0.08).problems).toEqual(['railway']);
  });

  it('finds a gentler line further out from our earthworks where the ground beside them is too steep', () => {
    // a steep ridge along our earthworks (y < 60), gentle ground beyond it
    const ground = (x: number, y: number) => 100 + (y < 60 ? Math.max(0, 40 - Math.abs(x - 200) / 3) : 0);
    expect(engineerLink(line, 4, env(ground), 0.08).problems).toEqual(['steep']);
    const place = (s: number, offset: number) => ({ x: s, y: 10 + offset });
    const found = routeAlong({ x: 0, y: 20 }, { x: 400, y: 20 }, 0, 400, place, 4, env(ground), 3, 0.08, 30_000)!;
    expect(found).not.toBeNull();
    expect(Math.max(...found.map(p => p.y))).toBeGreaterThanOrEqual(60);
    expect(engineerLink(found, 4, env(ground), 0.08).problems).toEqual([]);
  });

  it('Auto chooses another treatment when no reroute can be built', () => {
    // a street crossing our road on a high embankment, a railway beside us between it and the next crossing
    const s = Float64Array.from({ length: 901 }, (_, i) => i * 10);
    const route: CrossingRoute = { s, x: s, y: new Float64Array(s.length), tx: new Float64Array(s.length).fill(1),
      ty: new Float64Array(s.length), grade: new Float64Array(s.length).fill(410), width: new Float64Array(s.length).fill(40),
      kind: new Uint8Array(s.length), obstacle: (a, b) => (Math.min(a.x, b.x) <= 3400 && Math.max(a.x, b.x) >= 3400 ? 'railway' : null) };
    const roads = new RoadNet({ cls: ['primary', 'residential'], ways: [[0, 3000, -300, 3000, 300], [1, 3800, -300, 3800, 300]] });
    const cross = (roadId: number, x: number, cls: string, h: number): CrossingResult => ({ roadId, s: x, cls, h, i: Math.round(x / 10), x, y: 0, type: 'atGrade', cost: 0 });
    const cs = [cross(0, 3000, 'primary', 10), cross(1, 3800, 'residential', 10)];
    resolveCrossings(cs, 9000, route.kind!, route.width, new Float64Array(s.length), new Float64Array(s.length), [{ roadId: 0, type: 'junction' }]);
    buildCrossingGeometry(cs, route, () => 400, roads);
    expect(cs[1].type).toBe('underpass'); expect(cs[1].issues ?? []).toEqual([]);
  });
});
