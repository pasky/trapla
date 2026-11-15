import { describe, expect, it } from 'vitest';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { evaluateProject, type ProjectEvalContext } from '../src/core/project-evaluate';
import { legacyDesignForRoute, makeLegacyProjectContext, projectFromLegacyDesign, replaceRouteFromLegacy } from '../src/core/project-legacy';
import { createRailwayRoute } from '../src/core/project-railway';
import { assertProjectDesign } from '../src/core/project-validation';
import { railRouteBasePerKm } from '../src/core/data/railway';
import { speedNorms } from '../src/core/data/norms';
import { syntheticTerrain } from '../src/core/terrain';
import { evaluate } from '../src/core/evaluate';
import { BuildingIndex } from '../src/core/buildings';
import { BUILDING_KIND } from '../src/core/data/urban';
import { createRailNoiseModel, FREIGHT_TRAIN, PASSENGER_EMU, vehiclePower } from '../src/core/rail-noise';

function fixture() {
  const legacy = { terrain: syntheticTerrain(500, 160, 5, (x, y) => 100 + 0.01 * x + 0.02 * y), scenario: D11_SCENARIO,
    a: { x: 100, y: 250 }, b: { x: 2300, y: 250 } };
  const context = makeLegacyProjectContext(legacy, { presetId: 'p', packId: 'd11', objectData: 'objects', transportData: null });
  const base = projectFromLegacyDesign({ category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] }, context);
  const z = (x: number, y: number) => legacy.terrain.heightAt(x, y);
  const rail = createRailwayRoute('route:rail', 'Railway', { a: { position: { x: 300, y: 600, z: z(300, 600) }, anchor: { kind: 'free' }, binding: 'resolved' },
    b: { position: { x: 2200, y: 650, z: z(2200, 650) }, anchor: { kind: 'free' }, binding: 'resolved' } });
  const design = { ...base, routes: [...base.routes, rail] };
  const ctx: ProjectEvalContext = { legacy, environment: { objectData: 'objects', transportData: null,
    terrainData: 't', pricingData: 'p', waterData: 'w', terrainClass: 'hilly' } };
  return { ctx, design, legacy };
}

describe('railway mode', () => {
  it('is engineered, billed and noise-checked with track rules and CNOSSOS train noise', () => {
    const { ctx, design } = fixture();
    assertProjectDesign(design);
    const result = evaluateProject(ctx, { epoch: 'e', revision: 1, design });
    const rail = result.routes['route:rail'].legacy!;
    expect(rail.cost.total).toBeGreaterThan(0);
    // no railway-specific blocker: only the free ends (a new line must join something) keep it unpriced
    expect(result.cost.unpriced.filter(u => u.routeId === 'route:rail').map(u => u.reason)).toEqual(['road-ends-nowhere']);
    // track geometry: minimum radius from the cant envelope at 160 km/h, never a road row
    expect(speedNorms(160, 'R2').minRadius).toBe(Math.ceil(11.8 * 160 * 160 / 230));
    expect(railRouteBasePerKm(2) / railRouteBasePerKm(1)).toBeGreaterThan(1.6);
  });
  it('edits through the ordinary bend widgets and switches single/double track', () => {
    const { design } = fixture();
    const d = legacyDesignForRoute(design, 'route:rail');
    expect(d.category).toBe('R2');
    const next = replaceRouteFromLegacy(design, 'route:rail', { ...d, category: 'R1', speed: 120, pis: [{ x: 1200, y: 900, r: null }] });
    const r = next.routes.find(x => x.id === 'route:rail')!;
    expect(r.kind === 'railway' && r.specification.tracks).toBe(1);
    expect(legacyDesignForRoute(next, 'route:rail').speed).toBe(120);
  });
});

describe('railway noise (CNOSSOS-EU)', () => {
  const traffic = [{ train: PASSENGER_EMU, speed: 160, day: 64, night: 16 }, { train: FREIGHT_TRAIN, speed: 100, day: 32, night: 16 }];
  it('is a line source judged against the new-line limits, quieter with composite than cast-iron blocks', () => {
    const m = createRailNoiseModel(traffic);
    expect(m.limits).toEqual({ dayDb: 60, nightDb: 55 });
    expect((m.dayDb - m.loss(25, 4)) - (m.dayDb - m.loss(50, 4))).toBeCloseTo(10 * Math.log10(2), 6);
    const castIron = { ...FREIGHT_TRAIN, vehicles: FREIGHT_TRAIN.vehicles.map(v => v.superstructure ? { ...v, brake: 'castIron' as const } : v) };
    expect(vehiclePower(castIron.vehicles[1], 100)).toBeGreaterThan(vehiclePower(FREIGHT_TRAIN.vehicles[1], 100) * 2);
    expect(vehiclePower(PASSENGER_EMU.vehicles[0], 160)).toBeGreaterThan(vehiclePower(PASSENGER_EMU.vehicles[0], 80) * 4);
  });
  it('protects or buys a house beside the line like a road does', () => {
    const { legacy } = fixture();
    const buildings = new BuildingIndex([[1200, 290, 8]], [[100, 2, BUILDING_KIND.house, 1200, 290, 5, 5, 0]]);
    const r = evaluate({ ...legacy, buildings }, { category: 'R2', speed: 160, pis: [], profileMode: 'auto', vpis: [] }, { railTraffic: traffic });
    const house = r.noise.receivers.find(p => p.j === 0)!;
    expect(house).toBeDefined();
    expect(house.raw).toBeGreaterThan(0);
    expect(house.status === 'bought' || house.mitigated <= 0 || r.violations.some(v => v.kind === 'noise')).toBe(true);
  });
});
