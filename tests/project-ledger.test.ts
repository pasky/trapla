import { expect, it } from 'vitest';
import { BuildingIndex } from '../src/core/buildings';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { BUILDING_KIND } from '../src/core/data/urban';
import { evaluate } from '../src/core/evaluate';
import { evaluateProject, type ProjectEvalContext } from '../src/core/project-evaluate';
import { makeLegacyProjectContext, projectFromLegacyDesign } from '../src/core/project-legacy';
import { isScorableProject } from '../src/core/project-protocol';
import { screenIndependence } from '../src/core/project-ledger';
import { jargonIn } from '../src/core/terms';
import { syntheticTerrain } from '../src/core/terrain';

const design = { category: 'S9.5' as const, speed: 90, pis: [], profileMode: 'auto' as const, vpis: [] };
const op = { aadt: D11_SCENARIO.traffic, speed: 90, heavyShare: 0.15, halfWidth: 4.75 };
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

it('does not price a road that ends nowhere, but keeps both roads\' own bills and problems visible', () => {
  const { ctx, snapshot, side } = fixture();
  snapshot.design.routes.push(side);
  const project = evaluateProject(ctx, snapshot), [main] = snapshot.design.routes;
  expect(project.cost.total).toBeNull(); expect(project.valid).toBe(false); expect(isScorableProject(project)).toBe(false);
  expect(project.cost.unpriced).toEqual([{ routeId: 'side', reason: 'road-ends-nowhere' }]);
  expect(project.cost.alone).toEqual({ [main.id]: project.routes[main.id].legacy!.cost.total, side: project.routes.side.legacy!.cost.total });
  const nowhere = project.issues.find(i => i.code === 'road-ends-nowhere')!;
  expect(nowhere.scope.routeIds).toEqual(['side']);
  for (const text of [nowhere.violation.title, nowhere.violation.fix]) expect(jargonIn(text, true)).toEqual([]);
  expect(jargonIn(nowhere.violation.rule, false)).toEqual([]);
});

it('reports every crossing or overlap between new roads as not checked, located on both roads', () => {
  const { ctx, snapshot, side } = fixture();
  side.endpoints.a.position = { x: 600, y: 100, z: 100 }; side.endpoints.b.position = { x: 600, y: 450, z: 100 };
  snapshot.design.routes.push(side);
  const project = evaluateProject(ctx, snapshot), main = snapshot.design.routes[0];
  const cross = project.issues.filter(i => i.code === 'roads-cross');
  expect(cross).toHaveLength(1);
  expect(cross[0]).toMatchObject({ check: 'not-checked', blocking: 'incomplete', scope: { routeIds: [main.id, 'side'] },
    violation: { basis: 'engine', title: 'Roads cross here' } });
  expect(cross[0].at!.x).toBeCloseTo(600, 6); expect(cross[0].at!.y).toBeCloseTo(250, 6);
  const [onMain, onSide] = cross[0].locations;
  expect(onMain.routeId).toBe(main.id); expect(onSide.routeId).toBe('side');
  expect(onMain.s0).toBeCloseTo(500, 0); expect(onSide.s0).toBeCloseTo(150, 0);
  for (const text of [cross[0].violation.title, cross[0].violation.fix]) expect(jargonIn(text, true)).toEqual([]);
  expect(jargonIn(cross[0].violation.rule, false)).toEqual([]);
  // Reported alongside, not instead of, the road's other problems; real violations stay distinguishable.
  expect(project.issues.find(i => i.code === 'road-ends-nowhere')?.check).toBe('violation');
  expect(project.issues.filter(i => i.blocking === 'invalid').every(i => i.check === 'violation')).toBe(true);
  expect(project.cost.total).toBeNull();
  side.endpoints.a.position = { x: 300, y: 255, z: 100 }; side.endpoints.b.position = { x: 900, y: 255, z: 100 };
  const overlap = evaluateProject(ctx, snapshot).issues.filter(i => i.code === 'roads-overlap' || i.code === 'roads-cross');
  expect(overlap.map(i => i.code)).toEqual(['roads-overlap']);
  expect(overlap[0].locations[0].s0).toBeLessThan(overlap[0].locations[0].s1);
});

it('screens separate roads as independent, and overlapping land as shared', () => {
  const { ctx } = fixture();
  const own = (y: number) => evaluate({ ...ctx.legacy, a: { x: 100, y }, b: { x: 1100, y } }, design);
  const screen = (y: number) => screenIndependence([{ routeId: 'main', result: own(250), ...op }, { routeId: 'side', result: own(y), ...op }], undefined);
  expect(screen(450).independent).toBe(true);
  expect(screen(262).interactions.map(i => i.reason)).toEqual(['shared-land']);
});

it('never prices a road tied into an existing road or a mission port as if its ends were free', () => {
  const { ctx, snapshot, side } = fixture();
  snapshot.design.routes.push(side);
  for (const anchor of [{ kind: 'source' as const, location: { transportData: 'transport', sourceId: 'way:1', s: 0 } },
    { kind: 'mission' as const, portId: 'a' }]) {
    side.endpoints.a.anchor = anchor;
    if (anchor.kind === 'source') snapshot.design.transportData = 'transport';
    else side.endpoints.a.position = { ...snapshot.design.mission.ports[0].position };
    const project = evaluateProject(ctx, snapshot);
    expect(project.cost.total).toBeNull(); expect(isScorableProject(project)).toBe(false);
    expect(project.cost.unpriced.map(u => u.routeId)).toContain('side');
    expect(project.issues.some(i => i.code === 'connection-pending' && i.scope.routeIds.includes('side'))).toBe(true);
    expect(Object.keys(project.cost.alone)).toHaveLength(2); // own bills stay visible
  }
});

it('treats a house that one road walls and the other can reach as shared', () => {
  const house = new BuildingIndex([[600, 350, 5]], [[100, 2, BUILDING_KIND.house, 600, 350, 4, 4, 0]]);
  const { ctx } = fixture(house);
  const own = (y: number) => evaluate({ ...ctx.legacy, a: { x: 100, y }, b: { x: 1100, y } }, design);
  const screen = screenIndependence([{ routeId: 'main', result: own(250), ...op }, { routeId: 'side', result: own(450), ...op }], house);
  expect(screen.interactions).toEqual([{ routeIds: ['main', 'side'], reason: 'shared-noise', buildingIndex: 0 }]);
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
