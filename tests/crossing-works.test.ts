import { describe, expect, it } from 'vitest';
import { buildCrossingGeometry, type CrossingResult } from '../src/core/crossings';
import { RoadNet } from '../src/core/roadnet';
import { ROAD_CLASSES } from '../src/core/data/urban';
import { retainingAssembly } from '../src/core/data/remedies';
import { crossingSurfaces } from '../src/render/crossing-surface';
import { crossingOutcome } from '../src/core/terms';

// Our road runs along y = 0 at 106 m over flat 100 m ground; its earthworks reach 20 m either side.
// A street crosses it at x = 100 and meets it in a junction: its approach is raised 6 m and runs
// back down to the ground at 8 % (research/20), from y ≈ ±23 to ≈ ±98.
const route = { s: [0, 100, 200], x: [0, 100, 200], y: [0, 0, 0], tx: [1, 1, 1], ty: [0, 0, 0], grade: [106, 106, 106], width: [40, 40, 40] };
const ground = () => 100;
const junction = (): CrossingResult => ({ s: 100, i: 1, x: 100, y: 0, roadId: 0, cls: 'residential', h: 6, cost: 25e6, type: 'junction' });
const street = [0, 100, -500, 100, 500];
const build = (...others: number[][]) => {
  const c = junction(), roads = new RoadNet({ cls: ['residential', 'track'], ways: [street, ...others] });
  buildCrossingGeometry([c], route, ground, roads);
  return c;
};

describe('earthworks of a raised crossing approach leave other roads usable', () => {
  it('regrades a side road joining the raised approach down to its own ground, and bills it', () => {
    const plain = build();
    const c = build([0, 100, 50, 400, 50]); // a street joining at y = 50, about 3.8 m up the ramp
    const tie = c.geometry!.ties!;
    expect(tie).toHaveLength(1);
    const path = tie[0].path, raise = path[0].z - path[0].ground;
    expect(raise).toBeGreaterThan(3); expect(raise).toBeLessThan(4.5);
    expect(c.tieLength).toBeCloseTo(raise / ROAD_CLASSES.residential.rampGradient, 0); // 8 % for a street
    expect(path.at(-1)!.z).toBe(path.at(-1)!.ground);
    expect(c.worksCost).toBeCloseTo(c.tieLength! * ROAD_CLASSES.residential.roadPerKm[0] / 1000, 0);
    expect(c.cost - plain.cost).toBeCloseTo(c.worksCost!, 0);
    expect(c.geometry!.diagnostics).toBeUndefined();
    // drawn as a road surface of its own class, with its own slopes
    const surfaces = crossingSurfaces([c], ground);
    expect(surfaces.find(s => s.tie)?.tie).toEqual({ cls: 'residential', width: ROAD_CLASSES.residential.width });
    expect(crossingOutcome(c).explain).toMatch(/Roads joining it there are raised or lowered to meet it \(\d+ m\)/);
  });

  it('holds the slope back from a track beside it with a priced retaining wall, drawn where it is billed', () => {
    const c = build([1, 110, 30, 110, 90]); // a separate track 10 m beside the street, not joined to it
    expect(c.geometry!.diagnostics).toBeUndefined();
    expect(c.wallLength).toBeGreaterThan(30); // where the slope would still be over 2 m high at the wall line
    const walled = c.geometry!.road!.filter(p => p.wall?.[1] !== undefined || p.wall?.[0] !== undefined);
    expect(walled.length).toBeGreaterThan(3);
    // 1.5 m clear of the track's 2 m half-width edge: the wall stands 6.5 m from the street's centreline
    for (const p of walled) expect(Math.max(...p.wall!.filter((o): o is number => o !== undefined))).toBeCloseTo(6.5, 6);
    expect(c.worksCost).toBeGreaterThan(c.wallLength! * retainingAssembly(0.25).perM);
    const sections = crossingSurfaces([c], ground)[0].sections.filter(s => s.wallTop);
    expect(sections.length).toBeGreaterThan(0);
    for (const s of sections) for (const k of [0, 1] as const) if (s.wallTop![k]) {
      expect(Math.hypot(s.toe[k].x - s.p.x, s.toe[k].y - s.p.y)).toBeCloseTo(6.5, 1); // the slope stops at the wall
      expect(s.toe[k].z).toBe(100); // its foot on the ground
      expect(s.wallTop![k]!.z).toBeGreaterThan(100); // its top on the slope
    }
    expect(crossingOutcome(c).explain).toMatch(/A retaining wall \(\d+ m\) keeps its slope off a road beside it/);
  });

  it('reports a road lying under the raised road itself, and leaves distant roads alone', () => {
    const c = build([1, 104, 30, 104, 90]); // its pavement overlaps the street's: no wall fits between
    expect(c.geometry!.diagnostics).toContain('Approach earthworks would cover another road');
    expect(c.issues?.some(v => v.title === "The junction's approach would bury another road" && v.fix && v.rule)).toBe(true);
    const far = build([1, 160, 30, 160, 90]);
    expect(far.geometry!.diagnostics).toBeUndefined(); expect(far.worksCost).toBeUndefined(); expect(far.cost).toBe(25e6);
  });

  it('remeasures the works on every build without accumulating them', () => {
    const c = build([0, 100, 50, 400, 50]), once = c.cost;
    const roads = new RoadNet({ cls: ['residential', 'track'], ways: [street, [0, 100, 50, 400, 50]] });
    buildCrossingGeometry([c], route, ground, roads);
    expect(c.cost).toBeCloseTo(once, 6);
  });
});
