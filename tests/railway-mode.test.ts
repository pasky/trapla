import { describe, expect, it } from 'vitest';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { evaluateProject, type ProjectEvalContext } from '../src/core/project-evaluate';
import { legacyDesignForRoute, makeLegacyProjectContext, projectFromLegacyDesign, replaceRouteFromLegacy } from '../src/core/project-legacy';
import { createRailwayRoute } from '../src/core/project-railway';
import { assertProjectDesign } from '../src/core/project-validation';
import { railRouteBasePerKm } from '../src/core/data/railway';
import { speedNorms } from '../src/core/data/norms';
import { syntheticTerrain } from '../src/core/terrain';

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
  it('is engineered and billed with track rules, but never priced into the project while noise is unchecked', () => {
    const { ctx, design } = fixture();
    assertProjectDesign(design);
    const result = evaluateProject(ctx, { epoch: 'e', revision: 1, design });
    const rail = result.routes['route:rail'].legacy!;
    expect(rail.cost.total).toBeGreaterThan(0);
    expect(result.cost.total).toBeNull();
    expect(result.cost.unpriced.some(u => u.routeId === 'route:rail' && u.reason === 'railway-checks-pending')).toBe(true);
    expect(result.issues.filter(i => i.check === 'not-checked' && i.scope.routeIds.includes('route:rail')).map(i => i.code)).toEqual(['rail-noise']);
    expect(rail.noise.receivers).toEqual([]);
    // track geometry: minimum radius from the cant envelope at 160 km/h, never a road row
    expect(speedNorms(160, 'R2').minRadius).toBe(Math.ceil(11.8 * 160 * 160 / 230));
    // base: SPOŽES items per route km, double track roughly twice single
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
