import { describe, expect, it } from 'vitest';
import { buildCrossingGeometry, crossingPlanLength, normalizeCrossingOverrides, resolveCrossings,
  type CrossingOverride, type CrossingResult, type CrossingRoute } from '../src/core/crossings';
import { RoadNet } from '../src/core/roadnet';
import { ROAD_CLASSES } from '../src/core/data/urban';
import { insertViaPoint } from '../src/ui/link-edit';
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
const build = (overrides: CrossingOverride[], height = (_x: number, _y: number) => 400) => {
  const cs = [cross(0, 3000, 'primary'), cross(1, 3800, 'residential')];
  resolveCrossings(cs, 9000, [0], [30], [0], [0], [{ roadId: 0, type: 'junction' }, ...overrides]);
  buildCrossingGeometry(cs, route, height, roads);
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
    // a 50 % slope beyond y = -40: the automatic path stays on the flat, the shaped one climbs it
    const slope = (_x: number, y: number) => 400 + Math.max(0, -40 - y) * .5;
    expect(build([{ roadId: 1, type: 'reconnection' }], slope).issues ?? []).toEqual([]);
    const steep = build([{ roadId: 1, type: 'reconnection', via: [[{ x: 3400, y: -150 }], []] }], slope);
    expect(steep.issues?.map(v => v.title)).toContain('Your path for the new street is too steep in places');
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
  it('a drag on the link inserts its bend point between the ones it lies between', () => {
    const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    const via = [{ x: 50, y: 0 }, { x: 100, y: 60 }];
    expect(insertViaPoint(path, via, { x: 100, y: 20 })).toEqual({ via: [via[0], { x: 100, y: 20 }, via[1]], index: 1 });
    expect(insertViaPoint(path, via, { x: 10, y: 0 }).index).toBe(0);
    expect(insertViaPoint(path, via, { x: 100, y: 90 }).index).toBe(2);
  });
});
