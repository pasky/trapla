import { describe, expect, it } from 'vitest';
import { buildCrossingGeometry, crossingPlanLength, normalizeCrossingOverrides, resolveCrossings,
  type CrossingOverride, type CrossingResult, type CrossingRoute } from '../src/core/crossings';
import { RoadNet } from '../src/core/roadnet';
import { ROAD_CLASSES } from '../src/core/data/urban';
import { insertViaPoint, simplifyLink } from '../src/ui/link-shape';
import { legacyDesignForRoute, makeLegacyProjectContext, projectFromLegacyDesign } from '../src/core/project-legacy';
import { assertProjectDesign } from '../src/core/project-validation';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { syntheticTerrain } from '../src/core/terrain';
import { startDesign } from '../src/state';

// Our road along y = 0 (earthworks 10 m each side); a class I road crosses at x = 3000 (a junction),
// a street at x = 3800 is cut and reconnected to it on both sides.
const s = Float64Array.from({ length: 901 }, (_, i) => i * 10);
const route: CrossingRoute = { s, x: s, y: new Float64Array(s.length), tx: new Float64Array(s.length).fill(1),
  ty: new Float64Array(s.length), grade: new Float64Array(s.length).fill(400), width: new Float64Array(s.length).fill(20) };
const roads = new RoadNet({ cls: ['primary', 'residential'], ways: [[0, 3000, -300, 3000, 300], [1, 3800, -300, 3800, 300]] });
const cross = (roadId: number, x: number, cls: string): CrossingResult => ({ roadId, s: x, cls, h: 0, i: 0, x, y: 0, type: 'atGrade', cost: 0 });
const build = (overrides: CrossingOverride[], height = (_x: number, _y: number) => 400, obstacle?: CrossingRoute['obstacle']) => {
  const cs = [cross(0, 3000, 'primary'), cross(1, 3800, 'residential')];
  resolveCrossings(cs, 9000, [0], [30], [0], [0], [{ roadId: 0, type: 'junction' }, ...overrides]);
  buildCrossingGeometry(cs, { ...route, obstacle }, height, roads);
  return cs[1];
};

describe('a reroute the player shaped', () => {
  it('runs through the bend points between the same real anchors, measured and billed on that path', () => {
    const auto = build([{ roadId: 1, type: 'reconnection' }]);
    expect(auto.type).toBe('reconnection');
    const shaped = build([{ roadId: 1, type: 'reconnection', via: [[{ x: 3400, y: -200 }], []] }]);
    const [link, other] = shaped.geometry!.links!, [autoLink, autoOther] = auto.geometry!.links!;
    expect(link.some(p => p.x === 3400 && p.y === -200)).toBe(true);
    expect(link[0]).toEqual(autoLink[0]); expect(link.at(-1)).toEqual(autoLink.at(-1));
    expect(other).toEqual(autoOther); // the other side keeps its automatic path
    expect(shaped.linkLength).toBeCloseTo(crossingPlanLength(link) + crossingPlanLength(other), 6);
    expect(shaped.linkLength!).toBeGreaterThan(auto.linkLength! + 60); // ≈ 2 × √(400² + 187²) − 800
    expect(shaped.cost - auto.cost).toBeCloseTo((shaped.linkLength! - auto.linkLength!) * ROAD_CLASSES.residential.roadPerKm[0] / 1000, 0);
    expect(shaped.issues ?? []).toEqual([]);
  });
  it('reports a path over our earthworks, or one steeper than its class allows', () => {
    const over = build([{ roadId: 1, type: 'reconnection', via: [[{ x: 3400, y: -4 }], []] }]);
    expect(over.issues?.map(v => v.title)).toContain("Your path for the new street runs onto our road's earthworks");
    // the player's shape to fix: the crossing still stands and owns its road (no knock-on violations)
    expect(over.issues?.every(v => v.crossing.code === 'shape')).toBe(true); expect(over.geometry!.clipped).toBeFalsy();
    // a 100 % slope beyond y = -40: the automatic path stays on the flat, the shaped one climbs it
    // (110 m up and down again over some 420 m: beyond 12 % even with 10 m of earthworks)
    const slope = (_x: number, y: number) => 400 + Math.max(0, -40 - y);
    expect(build([{ roadId: 1, type: 'reconnection' }], slope).issues ?? []).toEqual([]);
    const steep = build([{ roadId: 1, type: 'reconnection', via: [[{ x: 3400, y: -150 }], []] }], slope);
    expect(steep.issues?.map(v => v.title)).toContain('Your path for the new street is too steep in places');
  });
  it('keeps leading to the crossing it led to when shaped, and belongs to one crossing of its way', () => {
    // a second junction at x = 4550 is nearer to the street than the one at x = 3000
    const net = new RoadNet({ cls: ['primary', 'residential', 'secondary'], ways: [[0, 3000, -300, 3000, 300], [1, 3800, -300, 3800, 300], [2, 4550, -300, 4550, 300]] });
    const run = (o: CrossingOverride, extra: CrossingResult[] = []) => {
      const cs = [cross(0, 3000, 'primary'), cross(1, 3800, 'residential'), cross(2, 4550, 'secondary'), ...extra];
      resolveCrossings(cs, 9000, [0], [30], [0], [0], [{ roadId: 0, type: 'junction' }, { roadId: 2, type: 'junction' }, o]);
      buildCrossingGeometry(cs, route, () => 400, net);
      return cs;
    };
    expect(run({ roadId: 1, type: 'reconnection' })[1].targetS).toBe(4550);
    const kept = run({ roadId: 1, type: 'reconnection', via: [[{ x: 3400, y: -100 }], []], to: 0 })[1];
    expect(kept.targetS).toBe(3000); expect(kept.geometry!.links![0].some(p => p.x === 3400 && p.y === -100)).toBe(true);
    // the same way crossed again far away: only the crossing nearest to the shape gets it
    const twice = run({ roadId: 1, type: 'reconnection', via: [[{ x: 3400, y: -100 }], []], to: 0 }, [{ ...cross(1, 7000, 'residential') }]);
    expect(twice[1].via).toBeDefined(); expect(twice[3].via).toBeUndefined();
  });
  it('is checked against motorways, railways, water and buildings on its way, and bounded', () => {
    const motorway = new RoadNet({ cls: ['primary', 'residential', 'motorway'], ways: [[0, 3000, -300, 3000, 300], [1, 3800, -300, 3800, 300], [2, 3100, -100, 3700, -100]] });
    const cs = [cross(0, 3000, 'primary'), cross(1, 3800, 'residential')];
    resolveCrossings(cs, 9000, [0], [30], [0], [0], [{ roadId: 0, type: 'junction' }, { roadId: 1, type: 'reconnection', via: [[{ x: 3400, y: -200 }], []] }]);
    buildCrossingGeometry(cs, route, () => 400, motorway);
    expect(cs[1].issues?.map(v => v.title)).toContain('Your path for the new street runs across a motorway');
    const rail = build([{ roadId: 1, type: 'reconnection', via: [[{ x: 3400, y: -200 }], []] }], undefined,
      (a, b) => (Math.min(a.x, b.x) < 3500 && Math.max(a.x, b.x) > 3500 ? 'railway' : null));
    expect(rail.issues?.map(v => v.title)).toContain('Your path for the new street runs across a railway');
    // the automatic path is held to the same rules: no reroute can be built there
    expect(build([{ roadId: 1, type: 'reconnection' }], undefined, () => 'railway').issues?.map(v => v.title)).toEqual(['No buildable reroute for the street']);
    expect(normalizeCrossingOverrides([{ roadId: 1, type: 'reconnection', via: [[{ x: 1e12, y: 0 }], []] }])).toEqual([{ roadId: 1, type: 'reconnection' }]);
    const far = build([{ roadId: 1, type: 'reconnection', via: [[{ x: 3400, y: -20000 }], []] }]);
    expect(far.issues?.map(v => v.title)).toContain('Your path for the new street goes too far');
  });
  it('is kept only on a reroute, normalized, persisted through the project and validated', () => {
    expect(normalizeCrossingOverrides([{ roadId: 2, type: 'reconnection', via: [[{ x: 1, y: 2 }], []] },
      { roadId: 3, type: 'bridge', via: [[{ x: 1, y: 2 }], []] }, { roadId: 4, type: 'reconnection', via: [[{ x: NaN, y: 2 }], []] }]))
      .toEqual([{ roadId: 2, type: 'reconnection', via: [[{ x: 1, y: 2 }], []] }, { roadId: 3, type: 'bridge' }, { roadId: 4, type: 'reconnection' }]);
    const terrain = syntheticTerrain(260, 120, 5, () => 100), context = makeLegacyProjectContext({ terrain, scenario: D11_SCENARIO, a: { x: 100, y: 250 }, b: { x: 1100, y: 250 } },
      { presetId: 'legacy-road', packId: 'd11', objectData: 'objects', transportData: null });
    const design = { ...startDesign(), crossingOverrides: [{ roadId: 2, type: 'reconnection' as const, via: [[{ x: 1, y: 2 }], []] as [{ x: number; y: number }[], { x: number; y: number }[]] }] };
    const project = projectFromLegacyDesign(design, context);
    expect(() => assertProjectDesign(project)).not.toThrow();
    // a shape on anything but a reroute is not a valid save
    const bad = structuredClone(project), crossing = (bad.routes[0].alignment as { controls: { crossings: { choice: string }[] } }).controls.crossings[0];
    crossing.choice = 'bridge';
    expect(() => assertProjectDesign(bad)).toThrow(/Invalid project/);
    expect(legacyDesignForRoute(project, project.routes[0].id).crossingOverrides).toEqual(design.crossingOverrides);
  });
  it('keeps the straightening choice only on an underpass or a bridge over us, through the project', () => {
    expect(normalizeCrossingOverrides([{ roadId: 2, type: 'underpass', square: false }, { roadId: 3, type: 'junction', square: true },
      { roadId: 4, type: 'overbridge', square: 'yes' }])).toEqual([{ roadId: 2, type: 'underpass', square: false }, { roadId: 3, type: 'junction' }, { roadId: 4, type: 'overbridge' }]);
    const terrain = syntheticTerrain(260, 120, 5, () => 100), context = makeLegacyProjectContext({ terrain, scenario: D11_SCENARIO, a: { x: 100, y: 250 }, b: { x: 1100, y: 250 } },
      { presetId: 'legacy-road', packId: 'd11', objectData: 'objects', transportData: null });
    const design = { ...startDesign(), crossingOverrides: [{ roadId: 2, type: 'underpass' as const, square: false }] };
    const project = projectFromLegacyDesign(design, context);
    expect(() => assertProjectDesign(project)).not.toThrow();
    expect(legacyDesignForRoute(project, project.routes[0].id).crossingOverrides).toEqual(design.crossingOverrides);
    const bad = structuredClone(project), crossing = (bad.routes[0].alignment as { controls: { crossings: { choice: string }[] } }).controls.crossings[0];
    crossing.choice = 'junction';
    expect(() => assertProjectDesign(bad)).toThrow(/Invalid project/);
  });
  it('starting from the automatic path\'s own bends gives back the same road, with no new problems', () => {
    const slope = (x: number, y: number) => 400 + Math.sin(x / 90) * 4 + Math.max(0, -30 - y) * .05;
    const auto = build([{ roadId: 1, type: 'reconnection' }], slope);
    expect(auto.issues ?? []).toEqual([]);
    const via = auto.geometry!.links!.map(l => simplifyLink(l)) as [{ x: number; y: number }[], { x: number; y: number }[]];
    expect(via.every(v => v.length <= 20)).toBe(true);
    const seeded = build([{ roadId: 1, type: 'reconnection', via, to: 0 }], slope);
    expect(seeded.issues ?? []).toEqual([]);
    expect(Math.abs(seeded.linkLength! - auto.linkLength!) / auto.linkLength!).toBeLessThan(0.01);
  });
  it('a drag on the link inserts its bend point between the ones it lies between', () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    const via = [{ x: 50, y: 0 }, { x: 100, y: 60 }];
    expect(insertViaPoint(path, via, { x: 100, y: 20 })).toEqual({ via: [via[0], { x: 100, y: 20 }, via[1]], index: 1 });
    expect(insertViaPoint(path, via, { x: 10, y: 0 }).index).toBe(0);
    expect(insertViaPoint(path, via, { x: 100, y: 90 }).index).toBe(2);
  });
});
