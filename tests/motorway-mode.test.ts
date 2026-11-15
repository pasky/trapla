import { describe, expect, it } from 'vitest';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { evaluate, type Design } from '../src/core/evaluate';
import { evaluateProject, previewProjectRoute, type ProjectEvalContext } from '../src/core/project-evaluate';
import { legacyDesignForRoute, makeLegacyProjectContext, projectFromLegacyDesign, replaceRouteFromLegacy } from '../src/core/project-legacy';
import { createMotorwayProject } from '../src/core/project-motorway';
import { isScorableProject } from '../src/core/project-protocol';
import { assertProjectDesign } from '../src/core/project-validation';
import { resolveCrossings, type CrossingResult } from '../src/core/crossings';
import { noiseSource } from '../src/core/road-noise';
import { KIND } from '../src/core/structures';
import { syntheticTerrain } from '../src/core/terrain';

const motorway: Design = { category: 'D27.5', speed: 130, pis: [], profileMode: 'auto', vpis: [] };
function fixture(aadt = 30000) {
  const legacy = { terrain: syntheticTerrain(500, 120, 5, (x) => 100 + x * 0.01), scenario: D11_SCENARIO,
    a: { x: 100, y: 250 }, b: { x: 2300, y: 250 } };
  const context = makeLegacyProjectContext(legacy, { presetId: 'motorway', packId: 'd11', objectData: 'objects', transportData: null });
  const road = projectFromLegacyDesign({ category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] }, context);
  const design = createMotorwayProject(road, motorway, { aadt, heavyShare: 0.2256 });
  const ctx: ProjectEvalContext = { legacy, environment: { objectData: 'objects', transportData: null,
    terrainData: 'terrain', pricingData: 'pricing', waterData: 'water', terrainClass: 'hilly' } };
  return { ctx, snapshot: { epoch: 'test', revision: 1, design }, legacy };
}

describe('paired motorway corridor', () => {
  it('is one corridor with two directional children sharing one spine evaluation and bill', () => {
    const { ctx, snapshot, legacy } = fixture();
    assertProjectDesign(snapshot.design);
    expect(snapshot.design.corridors).toHaveLength(1);
    expect(snapshot.design.routes.map(r => r.kind)).toEqual(['motorway', 'motorway']);
    // Directional demand halves; the corridor uses their sum, never a doubled AADT.
    expect(snapshot.design.routes.map(r => r.kind === 'motorway' && r.specification.operations.aadt)).toEqual([15000, 15000]);
    const project = evaluateProject(ctx, snapshot);
    const direct = evaluate({ ...legacy, scenario: { ...legacy.scenario, traffic: 30000, heavyShare: 0.2256 } }, motorway, { operatingSpeed: 130,
      endpointElevations: {}, goals: { time: true, capacity: true } });
    const [f, r] = snapshot.design.routes.map(x => project.routes[x.id]);
    expect(f.legacy).toBe(r.legacy);
    expect(project.cost.total).toBeCloseTo(direct.cost.total, 3);
    expect(project.cost.shared).toBe(project.cost.total);
    expect(project.cost.routes).toEqual({});
    expect(project.complete).toBe(true);
    expect(isScorableProject(project)).toBe(direct.valid);
    expect(project.issues.every(i => i.locations.every(l => l.routeId === f.routeId))).toBe(true);
    expect(previewProjectRoute(ctx, snapshot, r.routeId).legacy?.preview).toBe(true);
  });
  it('edits both directions through the common spine', () => {
    const { snapshot } = fixture();
    const [f, r] = snapshot.design.routes;
    const d = legacyDesignForRoute(snapshot.design, r.id);
    expect(d.category).toBe('D27.5');
    d.pis.push({ x: 1200, y: 400, r: null }); d.speed = 120;
    const next = replaceRouteFromLegacy(snapshot.design, r.id, d);
    expect(legacyDesignForRoute(next, f.id).pis).toEqual([{ x: 1200, y: 400, r: null }]);
    expect(next.routes.every(x => x.kind === 'motorway' && x.specification.designSpeed === 120)).toBe(true);
  });
  it('uses motorway radii, never the 90 km/h road rows', () => {
    const { legacy } = fixture();
    const tight = evaluate(legacy, { ...motorway, pis: [{ x: 1200, y: 600, r: 700 }] });
    expect(tight.violations.some(v => v.kind === 'radius' && v.rule?.includes('840'))).toBe(true);
    const ok = evaluate(legacy, { ...motorway, speed: 120, pis: [{ x: 1200, y: 600, r: 700 }] });
    expect(ok.violations.some(v => v.kind === 'radius')).toBe(false);
  });
});

describe('motorway junction rule', () => {
  const crossing = (s: number, cls: string, h = 0): CrossingResult => ({ s, i: 0, x: 0, y: 0, cls, roadId: s, h, type: 'atGrade', cost: 0 });
  it('never builds a level junction or sends local traffic to the motorway ends', () => {
    const cs = [crossing(3000, 'primary'), crossing(4500, 'tertiary')];
    resolveCrossings(cs, 9000, [KIND.earth], [40], [0], [0], [], true);
    expect(cs.some(c => c.type === 'junction' || c.type === 'atGrade')).toBe(false);
    expect(cs.filter(c => c.type === 'reconnection').every(c => c.targetS !== 0 && c.targetS !== 9000)).toBe(true);
    const asked = [crossing(3000, 'primary')];
    const issues = resolveCrossings(asked, 9000, [KIND.earth], [40], [0], [0], [{ roadId: 3000, type: 'junction' }], true);
    expect(issues.map(i => i.crossing.code)).toEqual(['ours']);
  });
});

describe('motorway noise source', () => {
  it('uses the manual motorway emission row, night shares and lane speeds', () => {
    const road = noiseSource(30000, 130, { heavyShare: 0.2256 });
    const mw = noiseSource(30000, 130, { heavyShare: 0.2256, profile: 'motorway' });
    // LNA 80.5 vs 81.1 and lane speeds below the 130 design speed: quieter per vehicle by day.
    expect(mw.dayDb).toBeLessThan(road.dayDb);
    expect(mw.nightDb - mw.dayDb).toBeGreaterThan(-6);
  });
});
