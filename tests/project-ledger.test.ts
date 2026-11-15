import { expect, it } from 'vitest';
import { BuildingIndex } from '../src/core/buildings';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { BUILDING_KIND } from '../src/core/data/urban';
import { evaluate } from '../src/core/evaluate';
import { evaluateProject, type ProjectEvalContext } from '../src/core/project-evaluate';
import { makeLegacyProjectContext, projectFromLegacyDesign } from '../src/core/project-legacy';
import { isScorableProject } from '../src/core/project-protocol';
import { jargonIn } from '../src/core/terms';
import { syntheticTerrain } from '../src/core/terrain';

const design = { category: 'S9.5' as const, speed: 90, pis: [], profileMode: 'auto' as const, vpis: [] };
function fixture(buildings?: BuildingIndex) {
  const legacy = { terrain: syntheticTerrain(260, 120, 5, () => 100), scenario: D11_SCENARIO,
    a: { x: 100, y: 250 }, b: { x: 1100, y: 250 }, ...(buildings ? { buildings } : {}) };
  const context = makeLegacyProjectContext(legacy, { presetId: 'legacy-road', packId: 'd11', objectData: 'objects', transportData: null });
  const snapshot = { epoch: 'test', revision: 1, design: projectFromLegacyDesign(design, context) };
  const ctx: ProjectEvalContext = { legacy, environment: { objectData: 'objects', transportData: null,
    terrainData: 'terrain', pricingData: 'pricing', waterData: 'water', terrainClass: 'hilly' } };
  // A second, separate new road 200 m away; same specification, free ends.
  const side = structuredClone(snapshot.design.routes[0]);
  side.id = 'side'; side.role = 'auxiliary'; side.acousticSourceId = 'physical-side';
  side.endpoints = { a: { position: { x: 100, y: 450, z: 100 }, binding: 'resolved', anchor: { kind: 'free' } },
    b: { position: { x: 1100, y: 450, z: 100 }, binding: 'resolved', anchor: { kind: 'free' } } };
  return { ctx, snapshot, side };
}

it('prices separate roads together only as one coherent project bill', () => {
  const { ctx, snapshot, side } = fixture();
  snapshot.design.routes.push(side);
  const project = evaluateProject(ctx, snapshot), [main] = snapshot.design.routes;
  const alone = [project.routes[main.id].legacy!.cost.total, project.routes.side.legacy!.cost.total];
  expect(project.cost.unpriced).toEqual([]);
  expect(project.cost.total).toBe(alone[0] + alone[1]);
  expect(project.cost.alone).toEqual({ [main.id]: alone[0], side: alone[1] });
  expect(project.complete).toBe(true);
  expect(isScorableProject(project)).toBe(project.routes[main.id].legacy!.valid && project.routes.side.legacy!.valid);
  // Moving the second road onto the first: shared land, nothing added up.
  side.endpoints.a.position.y = side.endpoints.b.position.y = 262;
  const overlapping = evaluateProject(ctx, snapshot);
  expect(overlapping.cost.total).toBeNull(); expect(isScorableProject(overlapping)).toBe(false);
  expect(overlapping.cost.unpriced.map(u => u.reason)).toEqual(['shared-land', 'shared-land']);
});

it('leaves roads unpriced when one house hears both, while keeping each road\'s own bill visible', () => {
  const house = new BuildingIndex([[600, 350, 5]], [[100, 2, BUILDING_KIND.house, 600, 350, 4, 4, 0]]);
  const { ctx, snapshot, side } = fixture(house);
  snapshot.design.routes.push(side);
  const project = evaluateProject(ctx, snapshot);
  expect(project.cost.total).toBeNull(); expect(project.valid).toBe(false); expect(isScorableProject(project)).toBe(false);
  expect(Object.keys(project.cost.alone)).toHaveLength(2);
  const shared = project.issues.find(i => i.scope.buildingIndex === 0)!;
  expect(shared.code).toBe('shared-noise'); expect(shared.scope.routeIds).toHaveLength(2);
  for (const text of [shared.violation.title, shared.violation.fix]) expect(jargonIn(text, true)).toEqual([]);
  expect(jargonIn(shared.violation.rule, false)).toEqual([]);
});

it('keeps the mission road\'s own result while a road change is unpriced; removing it restores the score', () => {
  const { ctx, snapshot, side } = fixture();
  side.source = { binding: 'resolved', transferredWorkIds: [], intervals: [{ transportData: 'transport', sourceId: 'road', s0: 0, s1: 1000 }] };
  snapshot.design.transportData = 'transport';
  snapshot.design.routes.push(side);
  const project = evaluateProject(ctx, snapshot), main = snapshot.design.routes[0], legacy = evaluate(ctx.legacy, design);
  expect(project.cost.alone).toEqual({ [main.id]: legacy.cost.total });
  expect(project.cost.unpriced).toEqual([{ routeId: 'side', reason: 'source-needs-network' }]);
  expect(project.cost.total).toBeNull(); expect(project.complete).toBe(false); expect(isScorableProject(project)).toBe(false);
  expect(project.issues.filter(i => i.blocking === 'invalid')).toHaveLength(legacy.violations.length);
  snapshot.design.routes.pop();
  const restored = evaluateProject(ctx, snapshot);
  expect(restored.cost.total).toBe(legacy.cost.total); expect(isScorableProject(restored)).toBe(legacy.valid);
});

it('lets a house near the limit belong to one road only; a second road must stay 20 dB below there', async () => {
  const { INDEPENDENCE_SCREEN, screenIndependence } = await import('../src/core/project-ledger');
  const { hardGroundLoss, noiseSource } = await import('../src/core/road-noise');
  const { NOISE } = await import('../src/core/data/urban');
  const house = new BuildingIndex([[500, 100, 5]], [[100, 2, BUILDING_KIND.house, 500, 100, 3, 3, 0]]);
  const road = (y: number, receivers: { j: number; status: 'ok'; mitigated: number }[]) => {
    const n = 101, x = Float64Array.from({ length: n }, (_, i) => i * 10);
    return { n, x, y: new Float64Array(n).fill(y), dayL: new Float64Array(n).fill(8), dayR: new Float64Array(n).fill(8),
      cell: { width: new Float64Array(n).fill(16) }, crossings: [], footprintConflicts: [], demolished: [], boughtOut: [], kept: [],
      noise: { receivers } } as unknown as import('../src/core/evaluate').Result;
  };
  const op = { aadt: D11_SCENARIO.traffic, speed: 90, heavyShare: 0.15, halfWidth: 4.75 };
  const near = { routeId: 'near', result: road(0, [{ j: 0, status: 'ok', mitigated: -0.001 }]), ...op };
  const screen = (y: number) => screenIndependence([near, { routeId: 'other', result: road(y, []), ...op }], house);
  expect(screen(150).interactions.map(i => i.reason)).toEqual(['shared-noise']);
  expect(screen(50000).independent).toBe(true);
  let lo = 150, hi = 50000;
  while (hi - lo > 0.01) { const mid = (lo + hi) / 2; if (screen(mid).independent) hi = mid; else lo = mid; }
  // Boundary: the other road's all-height upper bound at the house's nearest façade is the margin below the limit.
  const excess = noiseSource(op.aadt, op.speed, { heavyShare: op.heavyShare }).excessDb;
  const other = excess - hardGroundLoss(hi - 100 - house.extent(0) - NOISE.facadeOffset - NOISE.sourceOffset);
  expect(other).toBeCloseTo(-INDEPENDENCE_SCREEN.noiseMargin - INDEPENDENCE_SCREEN.noiseTolerance, 2);
  // What the rule neglects is reported, never hidden: N roads × margin below each limit.
  expect(screen(50000).omittedDayEnergy).toBeCloseTo(2 * 10 ** ((NOISE.limitDayDb - 20) / 10), 6);
});
