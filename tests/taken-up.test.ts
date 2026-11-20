// A mapped road's dead end cut back (core/taken-up.ts): gone from every road's network, billed as taken up with our
// road, and a house it was the only road to is a problem until it is bought out.
import { describe, expect, it } from 'vitest';
import { BuildingIndex } from '../src/core/buildings';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { ROAD_CLASSES } from '../src/core/data/urban';
import { evaluateProject, type ProjectEvalContext } from '../src/core/project-evaluate';
import { makeLegacyProjectContext, projectFromLegacyDesign } from '../src/core/project-legacy';
import { removalPerMetre } from '../src/core/project-replacement';
import { RoadNet } from '../src/core/roadnet';
import { syntheticTerrain } from '../src/core/terrain';

it('a trim takes a way\'s end off and leaves the rest its number (no slot, other cuts numbered as before)', () => {
  const base = new RoadNet({ cls: ['tertiary'], ways: [[0, 0, 0, 1000, 0], [0, 500, -100, 500, 100]] });
  const head = base.edited([{ way: 0, d0: 0, d1: 300, trim: true }], []);
  // (probes across way 0 at x = 200 and 600)
  const across = (net: RoadNet, x: number) => net.intersections(2, [0, 20], [x, x], [-10, 10]).map(h => h.way);
  expect(across(head, 200)).toEqual([]);
  expect(across(head, 600)).toEqual([0]);
  // (each segment left once in the index)
  let found = 0; head.nearSegments([595, -5, 605, 5], s => { if (s.way === 0) found++; });
  expect(found).toBe(1);
  const tail = base.edited([{ way: 0, d0: 700, d1: 1000, trim: true }, { way: 1, d0: 50, d1: 150 }], []);
  expect(across(tail, 800)).toEqual([]);
  expect(across(tail, 600)).toEqual([0]);
  // (what is left of way 1 after its cut has the first slot after the pack's ways, as without the trim)
  expect(tail.intersections(2, [0, 200], [400, 600], [80, 80]).map(h => h.way)).toEqual([2]);
});

describe('a dead end taken up', () => {
  // our road west–east at y 250; a local road from the north ending 100 m short of it, a house 20 m beyond its end
  function fixture(buy = false, links = true) {
    const buildings = new BuildingIndex([[400, 330, 6]]);
    const legacy = { terrain: syntheticTerrain(260, 120, 5, () => 100), scenario: D11_SCENARIO, a: { x: 100, y: 250 }, b: { x: 1100, y: 250 },
      roads: new RoadNet({ cls: ['unclassified'], ways: [[0, 400, 560, 400, 350]] }), buildings };
    const context = makeLegacyProjectContext(legacy, { presetId: 'legacy-road', packId: 'd11', objectData: 'objects', transportData: 't' });
    const design = projectFromLegacyDesign({ category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] }, context);
    if (buy) design.buildingOverrides = [{ j: 0, action: 'buy' }];
    const ctx: ProjectEvalContext = { legacy, environment: { objectData: 'objects', transportData: 't', terrainData: 't', pricingData: 'p', waterData: 'w', terrainClass: 'hilly' },
      ...(links ? { sourceWays: new Map([['osm:way:1', 0]]) } : {}) };
    const whole = evaluateProject(ctx, { epoch: 'e', revision: 1, design });
    design.takenUp = [{ interval: { transportData: 't', sourceId: 'osm:way:1', s0: 130, s1: 210 }, end: 'b', at: { x: 400, y: 430, z: 100 } }];
    return { whole, cut: evaluateProject(ctx, { epoch: 'e', revision: 2, design }) };
  }
  it('is billed with our road at the rate of an old road removed, and gone from the map', () => {
    const { whole, cut } = fixture(true);
    const work = cut.works.items.find(w => w.label?.includes('taken up'));
    expect(work?.label).toBe('Local road taken up: 80 m');
    expect(work!.cost).toBeCloseTo(80 * removalPerMetre(ROAD_CLASSES.unclassified.width), 3);
    expect(cut.cost.total! - whole.cost.total!).toBeCloseTo(work!.cost, 3);
    expect(cut.acceptedReplacements).toEqual([{ transportData: 't', sourceId: 'osm:way:1', s0: 130, s1: 210 }]);
    expect(cut.valid).toBe(whole.valid);
  });
  it('the house it was the only road to is a problem, until it is bought out', () => {
    const { cut } = fixture();
    const issue = cut.issues.find(i => i.code === 'taken-up-access');
    expect(issue?.violation.title).toBe('A home loses its road');
    expect(issue?.violation.detail).toMatch(/nearest road left is \d+ m away/);
    expect(cut.valid).toBe(false);
    expect(fixture(true).cut.issues.some(i => i.code === 'taken-up-access')).toBe(false);
  });
  it('without the road links it is not priced (never left out of the bill unsaid)', () => {
    const { cut } = fixture(true, false);
    expect(cut.cost.total).toBeNull();
    expect(cut.issues.map(i => i.code)).toContain('taken-up-unresolved');
    expect(cut.acceptedReplacements).toEqual([]);
  });
});
