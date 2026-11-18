// Leading a reroute's new piece to another road (CrossingOverride.ends): dragging the end of the new road onto a
// road of the player's choosing builds it there, engineered and billed like Auto's own; a road that cannot take it
// leaves Auto's line standing and says why; the choice survives a save.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCrossingGeometry, crossingPlanLength, normalizeCrossingOverrides, resolveCrossings,
  type CrossingOverride, type CrossingResult, type CrossingRoute } from '../src/core/crossings';
import { RoadNet } from '../src/core/roadnet';
import { ROAD_CLASSES } from '../src/core/data/urban';
import { crossingOutcome } from '../src/core/terms';
import { legacyDesignForRoute, makeLegacyProjectContext, projectFromLegacyDesign } from '../src/core/project-legacy';
import { assertProjectDesign } from '../src/core/project-validation';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { syntheticTerrain } from '../src/core/terrain';
import { startDesign } from '../src/state';

// Our road along y = 0 (earthworks 10 m each side); a class I road crosses at x = 3000 (a junction), a street at
// x = 3800 is cut; north of us a street runs along y = 200 (it does not cross us), south a track along y = −200.
const s = Float64Array.from({ length: 901 }, (_, i) => i * 10);
const route: CrossingRoute = { s, x: s, y: new Float64Array(s.length), tx: new Float64Array(s.length).fill(1),
  ty: new Float64Array(s.length), grade: new Float64Array(s.length).fill(400), width: new Float64Array(s.length).fill(20) };
const roads = new RoadNet({ cls: ['primary', 'residential', 'track'], ways: [[0, 3000, -300, 3000, 300], [1, 3800, -300, 3800, 300],
  [1, 3900, 200, 4600, 200], [2, 3900, -200, 4600, -200]] });
const cross = (roadId: number, x: number, cls: string): CrossingResult => ({ roadId, s: x, cls, h: 0, i: 0, x, y: 0, type: 'atGrade', cost: 0 });
const build = (overrides: CrossingOverride[]) => {
  const cs = [cross(0, 3000, 'primary'), cross(1, 3800, 'residential')];
  resolveCrossings(cs, 9000, [0], [30], [0], [0], [{ roadId: 0, type: 'junction' }, ...overrides]);
  buildCrossingGeometry(cs, route, () => 400, roads);
  return cs[1];
};
const auto = build([{ roadId: 1, type: 'reconnection' }]);

describe('a reroute led to a road the player chose', () => {
  it('joins that road where it was dropped, on its side; the other side keeps Auto\'s line', () => {
    const led = build([{ roadId: 1, type: 'reconnection', ends: [null, { way: 2, x: 4000, y: 210 }] }]);
    const [south, north] = led.geometry!.links!, [autoSouth, autoNorth] = auto.geometry!.links!;
    expect(north[0]).toEqual(autoNorth[0]);
    expect(north.at(-1)!.x).toBeCloseTo(4000, 0); expect(north.at(-1)!.y).toBeCloseTo(200, 6);
    expect(south).toEqual(autoSouth);
    expect(led.endTo).toEqual([undefined, { cls: 'residential', toward: 'north', built: true }]);
    expect(led.issues ?? []).toEqual([]);
    // billed on what is drawn, at the street's rate
    expect(led.linkLength).toBeCloseTo(crossingPlanLength(south) + crossingPlanLength(north), 6);
    expect(led.cost - auto.cost).toBeCloseTo((led.linkLength! - auto.linkLength!) * ROAD_CLASSES.residential.roadPerKm[0] / 1000, 0);
    expect(crossingOutcome(led).label).toMatch(/^The north part led to a street \(\+[\d,]+ m of new road\)$/);
  });
  it('a road that crosses ours, dropped on beyond our road: its part on this side is joined', () => {
    const led = build([{ roadId: 1, type: 'reconnection', ends: [null, { way: 0, x: 3000, y: -250 }] }]);
    const north = led.geometry!.links![1];
    expect(north.at(-1)!.x).toBeCloseTo(3000, 6); expect(north.at(-1)!.y).toBeGreaterThan(10);
    expect(led.endTo![1]).toEqual({ cls: 'primary', s: 3000, toward: 'north', built: true });
    expect(led.issues ?? []).toEqual([]);
  });
  it('a road that cannot take it: Auto\'s line stands and the card says why', () => {
    const cases: [CrossingOverride['ends'], RegExp][] = [
      [[{ way: 2, x: 4000, y: 200 }, null], /across our road/], // the street north of us, for the south part
      [[null, { way: 1, x: 3800, y: 250 }], /led back onto itself/], // its own line
      [[{ way: 3, x: 4000, y: -200 }, null], /cannot be led onto a track/], // a street onto a track
    ];
    for (const [ends, title] of cases) {
      const led = build([{ roadId: 1, type: 'reconnection', ends }]);
      expect(led.geometry!.links).toEqual(auto.geometry!.links);
      expect(led.cost).toBeCloseTo(auto.cost, 6);
      expect(led.issues?.map(v => [v.crossing.code, v.title])).toEqual([['end', expect.stringMatching(title)]]);
      expect(led.endTo!.find(Boolean)!.built).toBe(false);
    }
  });
  it('is stored with the choice and survives a save; garbage is dropped', () => {
    expect(normalizeCrossingOverrides([{ roadId: 1, type: 'reconnection', ends: [null, { way: 2, x: 4000, y: 200 }] },
      { roadId: 2, type: 'reconnection', ends: [{ way: -1, x: 0, y: 0 }, { way: 2, x: 'a', y: 0 }] }, { roadId: 3, type: 'underpass', ends: [null, { way: 2, x: 1, y: 1 }] }]))
      .toEqual([{ roadId: 1, type: 'reconnection', ends: [null, { way: 2, x: 4000, y: 200 }] }, { roadId: 2, type: 'reconnection' }, { roadId: 3, type: 'underpass' }]);
    const terrain = syntheticTerrain(260, 120, 5, () => 100), context = makeLegacyProjectContext({ terrain, scenario: D11_SCENARIO, a: { x: 100, y: 250 }, b: { x: 1100, y: 250 } },
      { presetId: 'legacy-road', packId: 'd11', objectData: 'objects', transportData: null });
    const design = { ...startDesign(), crossingOverrides: [{ roadId: 2, type: 'reconnection' as const, ends: [null, { way: 5, x: 1, y: 2 }] as CrossingOverride['ends'] }] };
    const project = projectFromLegacyDesign(design, context);
    expect(() => assertProjectDesign(project)).not.toThrow();
    expect(legacyDesignForRoute(project, project.routes[0].id).crossingOverrides).toEqual(design.crossingOverrides);
    const bad = structuredClone(project), crossing = (bad.routes[0].alignment as { controls: { crossings: { choice: string }[] } }).controls.crossings[0];
    crossing.choice = 'underpass';
    expect(() => assertProjectDesign(bad)).toThrow(/Invalid project/);
  });
});

// The owner's case (D35 full): a track cut at km 2.51 whose north part Auto leads to the track under our bridge at
// km 2.70; the player drags its end onto the class III road that crosses over us at km 2.29.
describe.skipIf(!existsSync('public/scenarios/d35-full/meta.json'))('D35 full: the track at km 2.51 led to the road at km 2.29', () => {
  it('is built there, billed and valid; a drop across our road says so and keeps Auto\'s', async () => {
    const { loadPack, evalContext } = await import('../scripts/loadpack');
    const { PRESETS } = await import('../src/core/data/scenario');
    const { evaluate } = await import('../src/core/evaluate');
    const scenario = PRESETS.find(p => p.presetId === 'd35-full-motorway')!;
    const ctx = evalContext(loadPack('public/scenarios/d35-full'), scenario);
    const base = { ...startDesign(), ...structuredClone(scenario.initial ?? {}) };
    // the starter with a bend on the planned line at its km 2.5 (our road in a shallow cut there)
    base.pis = [base.pis[0], { x: 4551, y: 9449, r: null }, ...base.pis.slice(1)];
    const track = (ends?: CrossingOverride['ends'], via?: CrossingOverride['via']) => {
      const r = evaluate(ctx, { ...structuredClone(base), crossingOverrides: [{ roadId: 1327, type: 'reconnection', ...(ends ? { ends } : {}), ...(via ? { via } : {}) }] });
      return { r, c: r.crossings.find(c => c.roadId === 1327)! };
    };
    const a = track();
    expect(a.c.type).toBe('diversion'); expect(a.c.targetRoadId).toBe(1505); expect(a.c.closure?.connected).toEqual([true, false]);
    const b = track([null, { way: 1129, x: 4200, y: 9462 }]);
    expect(b.c.endTo?.[1]).toMatchObject({ cls: 'tertiary', toward: 'north', built: true }); expect(b.c.endTo![1]!.s).toBeCloseTo(2289, 0);
    const north = b.c.geometry!.links![1];
    expect(Math.hypot(north.at(-1)!.x - 4200, north.at(-1)!.y - 9462)).toBeLessThan(30);
    expect(b.r.violations).toEqual([]);
    expect(b.c.linkLength!).toBeGreaterThan(a.c.linkLength! + 100);
    // billed on what is drawn (here dearer than Auto's line only by its length: Auto's needs a culvert, this one none)
    expect(b.c.cost).toBeCloseTo(b.c.linkLength! * b.c.roadPerKm! / 1000 + (b.c.culvertCost ?? 0) + (b.c.houseCost ?? 0), 0);
    expect(b.c.culverts).toBeUndefined(); expect(a.c.culverts).toBe(1);
    // only this crossing's bill moves: our road's own works stay as they were
    const ours = (r: typeof a.r) => r.cost.total - r.cost.crossings - r.cost.surcharge;
    expect(ours(b.r)).toBeCloseTo(ours(a.r), -3);
    expect(b.r.cost.crossings - a.r.cost.crossings).toBeCloseTo(b.c.cost - a.c.cost, -3);
    expect(crossingOutcome(b.c, 'motorway').label).toMatch(/^The north part led to the class III road that crosses at km 2\.29 \(\+[\d,]+ m of new track\)$/);
    // bent in its middle as well: still led there; the south part still just ends (it reaches other roads)
    const bent = track([null, { way: 1129, x: 4200, y: 9462 }], [[], [{ x: 4382, y: 9499 }]]);
    expect(bent.c.geometry!.links![0]).toEqual([]); expect(bent.c.endTo?.[1]?.built).toBe(true);
    expect(bent.c.geometry!.links![1].some(p => p.x === 4382 && p.y === 9499)).toBe(true);
    const c = track([null, { way: 1129, x: 4500, y: 9300 }]);
    expect(c.r.violations.map(v => v.title)).toEqual(['The road you chose is across our road']);
    expect(c.c.geometry!.links).toEqual(a.c.geometry!.links);
  }, 60_000);
});
