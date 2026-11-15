import { describe, expect, it } from 'vitest';
import { BuildingIndex } from '../src/core/buildings';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { ENDPOINT_JUNCTIONS, JUNCTION } from '../src/core/data/urban';
import { evaluateProject, type ProjectEvalContext } from '../src/core/project-evaluate';
import { makeLegacyProjectContext, projectFromLegacyDesign } from '../src/core/project-legacy';
import { isScorableProject } from '../src/core/project-protocol';
import { RoadNet, type RoadNetData } from '../src/core/roadnet';
import { footprintOutcome, jargonIn } from '../src/core/terms';
import { syntheticTerrain } from '../src/core/terrain';
import { newRoad } from '../src/ui/road-edit';

const design = { category: 'S9.5' as const, speed: 90, pis: [], profileMode: 'auto' as const, vpis: [] };
/** Our road along y = 250; two existing roads running north–south at x = 300 and x = 1000, far from it. */
function fixture(hostClass = 'tertiary', extra: number[][] = [], buildings?: BuildingIndex) {
  const net: RoadNetData = { cls: [hostClass, 'tertiary', 'unclassified'], ways: [[0, 300, 600, 300, 1100], [1, 1000, 600, 1000, 1100], ...extra] };
  const legacy = { terrain: syntheticTerrain(260, 240, 5, () => 100), scenario: D11_SCENARIO, roads: new RoadNet(net),
    a: { x: 100, y: 250 }, b: { x: 1100, y: 250 }, ...(buildings ? { buildings } : {}) };
  const context = makeLegacyProjectContext(legacy, { presetId: 'legacy-road', packId: 'd11', objectData: 'objects', transportData: 'transport' });
  const project = projectFromLegacyDesign(design, context);
  const end = (sourceId: string, x: number, y: number) => ({ position: { x, y, z: 100 },
    anchor: { kind: 'source' as const, location: { transportData: 'transport', sourceId, s: y - 600 } } });
  const side = newRoad(project, end('west', 300, 850), end('east', 1000, 850), { routeId: 'side', acousticSourceId: 'physical-side' });
  if (side.kind === 'road') side.specification.operations = { aadt: 1500, heavyShare: 0.05, speed: 70, speedPolicy: 'design' };
  project.routes.push(side);
  const ctx: ProjectEvalContext = { legacy, environment: { objectData: 'objects', transportData: 'transport',
    terrainData: 'terrain', pricingData: 'pricing', waterData: 'water', terrainClass: 'hilly' } };
  return { ctx, snapshot: { epoch: 'test', revision: 1, design: project } };
}

describe('a new road joined to existing roads at both ends (C1 a)', () => {
  it('builds and bills one junction at each end, and the project is priced with our road', () => {
    const { ctx, snapshot } = fixture();
    const project = evaluateProject(ctx, snapshot), mission = snapshot.design.routes[0].id;
    const side = project.routes.side.legacy!;
    const junctions = side.footprintConflicts.filter(f => f.action === 'junction');
    expect(junctions.map(j => [j.id, j.cost])).toEqual([['junction:a', ENDPOINT_JUNCTIONS['tie-in-minor'].cost], ['junction:b', ENDPOINT_JUNCTIONS['tie-in-minor'].cost]]);
    expect(project.cost.unpriced).toEqual([]);
    expect(project.cost.total).toBe(project.cost.alone[mission] + project.cost.alone.side);
    expect(project.issues.some(i => i.code === 'connection-pending')).toBe(false);
    expect(project.valid).toBe(project.routes.side.legacy!.valid && project.routes[mission].legacy!.valid);
    if (project.valid) expect(isScorableProject(project)).toBe(true);
  });

  it('prices a junction onto a class I or II road at the all-in junction allowance', () => {
    const { ctx, snapshot } = fixture('secondary');
    const side = evaluateProject(ctx, snapshot).routes.side.legacy!;
    expect(side.footprintConflicts.filter(f => f.action === 'junction').map(j => j.cost)).toEqual([JUNCTION, ENDPOINT_JUNCTIONS['tie-in-minor'].cost]);
  });

  it('keeps new junctions on a class I road 1.5 km apart, unless it rebuilds an existing junction in place', () => {
    // another road joins the class I road 200 m north of our end
    const near = fixture('primary', [[2, 300, 1050, 100, 1050]]);
    const issue = near.ctx && evaluateProject(near.ctx, near.snapshot).routes.side.legacy!.violations.find(v => v.title === 'Too close to another junction');
    expect(issue?.fix).toMatch(/at least 1500 m from the next one \(now 200 m\)/);
    for (const text of [issue!.title, issue!.fix]) expect(jargonIn(text, true)).toEqual([]);
    // the same road joining exactly at that junction rebuilds it: no new junction on the class I road
    const at = fixture('primary', [[2, 300, 850, 100, 850]]);
    expect(evaluateProject(at.ctx, at.snapshot).routes.side.legacy!.violations.some(v => v.title === 'Too close to another junction')).toBe(false);
  });

  it('needs a clear view along the joined road: a house in the sight triangle is named', () => {
    const buildings = new BuildingIndex([[306, 860, 3]]); // a small house just north-east of our west end, by the joined road
    const { ctx, snapshot } = fixture('tertiary', [], buildings);
    const side = evaluateProject(ctx, snapshot).routes.side.legacy!;
    const view = side.violations.find(v => /No clear view/.test(v.title));
    expect(view?.target?.buildings).toEqual([0]);
    expect(view!.s0).toBe(0);
  });

  it('refuses an at-grade end on a motorway', () => {
    const { ctx, snapshot } = fixture('motorway');
    const side = evaluateProject(ctx, snapshot).routes.side.legacy!;
    expect(side.violations.some(v => v.title === 'A motorway cannot be joined at the same level')).toBe(true);
  });
});

it('says every junction finding and outcome in plain words', () => {
  const found = [fixture('primary', [[2, 300, 1050, 100, 1050]]), fixture('motorway'), fixture('tertiary', [], new BuildingIndex([[306, 860, 3]]))]
    .flatMap(({ ctx, snapshot }) => evaluateProject(ctx, snapshot).routes.side.legacy!.violations);
  expect(found.length).toBeGreaterThanOrEqual(3);
  for (const v of found) {
    for (const text of [v.title, v.fix]) expect(jargonIn(text, true)).toEqual([]);
    expect(jargonIn(v.rule, false)).toEqual([]);
  }
  for (const continuation of [true, false]) {
    const o = footprintOutcome({ feature: 'road', action: 'junction', cls: 'tertiary', length: 12, continuation });
    for (const text of [o.tag, o.label, o.explain]) expect(jargonIn(text, true)).toEqual([]);
  }
});
