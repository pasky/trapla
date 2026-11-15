import { expect, it } from 'vitest';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { evaluate } from '../src/core/evaluate';
import { evaluateProject, previewProjectRoute, type ProjectEvalContext } from '../src/core/project-evaluate';
import { makeLegacyProjectContext, projectFromLegacyDesign } from '../src/core/project-legacy';
import { isScorableProject } from '../src/core/project-protocol';
import { syntheticTerrain } from '../src/core/terrain';

function fixture() {
  const legacy = { terrain: syntheticTerrain(260, 120, 5, () => 100), scenario: D11_SCENARIO,
    a: { x: 100, y: 250 }, b: { x: 1100, y: 250 } };
  const context = makeLegacyProjectContext(legacy, { presetId: 'legacy-road', packId: 'd11', objectData: 'objects', transportData: null });
  const design = { category: 'S9.5' as const, speed: 90, pis: [], profileMode: 'auto' as const, vpis: [] };
  const snapshot = { epoch: 'test', revision: 3, design: projectFromLegacyDesign(design, context) };
  const ctx: ProjectEvalContext = { legacy, environment: { objectData: 'objects', transportData: null,
    terrainData: 'terrain', pricingData: 'pricing', waterData: 'water', terrainClass: 'hilly' } };
  return { ctx, snapshot, design };
}
it('publishes the unchanged one-road challenge as a complete coherent project, never a preview best', () => {
  const { ctx, snapshot, design } = fixture();
  const project = evaluateProject(ctx, snapshot), legacy = evaluate(ctx.legacy, design);
  expect(project.cost.total).toBe(legacy.cost.total);
  expect(project.complete).toBe(true); expect(isScorableProject(project)).toBe(legacy.valid);
  expect(project.epoch).toBe(snapshot.epoch); expect(project.revision).toBe(snapshot.revision);
  const route = project.routes[snapshot.design.routes[0].id];
  expect(route.legacy?.grade).toEqual(legacy.grade); expect(route.legacy?.parts).toEqual(legacy.parts);
  const preview = previewProjectRoute(ctx, snapshot, route.routeId);
  expect(preview.legacy?.preview).toBe(true); expect(preview.complete).toBe(false); expect(preview.accepted).toBe(false);
});
it('exposes multiple route proposals but never adds independent bills into a scored project', () => {
  const { ctx, snapshot } = fixture();
  const other = structuredClone(snapshot.design.routes[0]); other.id = 'side'; other.role = 'auxiliary';
  snapshot.design.routes.push(other);
  const project = evaluateProject(ctx, snapshot);
  expect(Object.keys(project.routes)).toHaveLength(2);
  expect(Object.values(project.routes).every(r => r.surface && r.legacy)).toBe(true);
  expect(project.cost.total).toBeNull(); expect(project.complete).toBe(false); expect(project.valid).toBe(false);
  expect(isScorableProject(project)).toBe(false); expect(project.acceptedReplacements).toEqual([]);
});
it('keeps reference paths explicit and source ownership unaccepted until network engineering completes', () => {
  const { ctx, snapshot } = fixture(), route = snapshot.design.routes[0];
  route.role = 'auxiliary'; route.source = { binding: 'resolved', transferredWorkIds: [],
    intervals: [{ transportData: 'transport', sourceId: 'road', s0: 0, s1: 1000 }] };
  snapshot.design.transportData = 'transport';
  route.alignment = { kind: 'reference', provenance: 'imported', vertical: { kind: 'reference' }, controls: {},
    path: [{ x: 100, y: 250, s: 0, elevation: { kind: 'ground' } }, { x: 500, y: 300, s: 403.113, elevation: { kind: 'ground' } },
      { x: 1100, y: 250, s: 1005.193, elevation: { kind: 'ground' } }] };
  const project = evaluateProject(ctx, snapshot), proposed = project.routes[route.id];
  expect(proposed.legacy).toBeUndefined(); expect(proposed.surface?.points.some(p => p.x === 500 && p.y === 300)).toBe(true);
  expect(project.cost.total).toBeNull(); expect(project.acceptedRenderReplacements).toEqual([]);
  expect(snapshot.design.routes[0].alignment.kind).toBe('reference');
});
