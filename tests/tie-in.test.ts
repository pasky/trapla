import { describe, expect, it } from 'vitest';
import { finiteSegmentDecider } from '../src/core/project-noise';
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

describe('a side road joined to our road', () => {
  const joinOurs = (x: number) => {
    const f = fixture();
    const mission = f.snapshot.design.routes[0], side = f.snapshot.design.routes[1];
    side.endpoints.a = { position: { x, y: 250, z: 100 }, binding: 'resolved', anchor: { kind: 'route', routeId: mission.id, s: x - 100 } };
    return { ...f, mission };
  };
  it('builds and bills its junction with our road and is priced together with it', () => {
    const { ctx, snapshot, mission } = joinOurs(600);
    const project = evaluateProject(ctx, snapshot);
    expect(project.issues.filter(i => i.blocking === 'incomplete').map(i => [i.code, i.violation.title])).toEqual([]);
    expect(project.cost.unpriced).toEqual([]);
    const junction = project.works.items.find(w => w.owner.id === 'side' && w.label === 'Junction with our road')!;
    expect(junction.cost).toBe(JUNCTION); // our road is a class I road
    // its first metres inside our road's earthworks are not built (or bought) twice
    const credit = project.works.items.find(w => w.owner.id === 'side' && w.cost < 0)!;
    expect(credit.label).toMatch(/^Its first \d+ m are inside our road’s earthworks: not built twice$/);
    const own = project.routes.side.legacy!.cost.total;
    expect(-credit.cost).toBeLessThan(own / 10);
    // a road's own price is its bill with its own works (junction, credit); the project adds the roads up
    expect(project.cost.alone.side).toBeCloseTo(own + junction.cost + credit.cost, 3);
    expect(project.cost.total).toBeCloseTo(project.cost.alone[mission.id] + project.cost.alone.side, 3);
    expect(project.issues.some(i => i.code === 'roads-cross' || i.code === 'roads-overlap' || i.code === 'connection-pending')).toBe(false);
  });
  it('keeps 1.5 km from our road\'s ends and other junctions, and follows our road when it moves', () => {
    const { ctx, snapshot, mission } = joinOurs(300);
    const side = evaluateProject(ctx, snapshot).routes.side.legacy!;
    expect(side.violations.find(v => v.title === 'Too close to another junction')?.fix).toMatch(/our road .* \(now 200 m\)/);
    // our road is bent 30 m north at x = 600: the side road's end stays on it
    const m = snapshot.design.routes.find(r => r.id === mission.id)!;
    if (m.alignment.kind !== 'pi') throw new Error('fixture');
    m.alignment.pis = [{ x: 300, y: 300, r: null }];
    const moved = evaluateProject(ctx, snapshot).routes.side.legacy!;
    const ours = evaluateProject(ctx, snapshot).routes[mission.id].legacy!;
    const d = Math.min(...Array.from({ length: ours.n }, (_, k) => Math.hypot(ours.x[k] - moved.x[0], ours.y[k] - moved.y[0])));
    expect(d).toBeLessThan(1e-6);
    expect(moved.grade[0]).toBeCloseTo(ours.grade[Math.round(Math.hypot(moved.x[0] - 100, moved.y[0] - 250) / ours.ds)], 0);
  });
});

describe('a roundabout where the player chooses it', () => {
  const choose = (f: ReturnType<typeof fixture>, end: 'a' | 'b') => {
    const side = f.snapshot.design.routes[1];
    if (side.alignment.kind !== 'pi') throw new Error('fixture');
    side.alignment.controls.junctionForms = { [end]: 'roundabout' };
    return f;
  };
  it('prices the roundabout and its ring (land, a house on it removed) instead of a T', () => {
    const f = choose(fixture('secondary', [], new BuildingIndex([[292, 866, 4]])), 'a'); // a house on the ring, west of the joined road
    const project = evaluateProject(f.ctx, f.snapshot), side = project.routes.side.legacy!;
    expect(side.footprintConflicts.filter(c => c.action === 'junction').map(c => c.cost)).toEqual([ENDPOINT_JUNCTIONS.roundabout.cost, ENDPOINT_JUNCTIONS['tie-in-minor'].cost]);
    const ring = project.works.items.find(w => w.owner.id === 'side' && /^Roundabout's ring/.test(w.label ?? ''))!;
    expect(ring.label).toMatch(/1 building removed/);
    expect(ring.cost).toBeGreaterThan(new BuildingIndex([[292, 866, 4]]).cost[0]);
    // (the removed house is also within our road's noise reach: the ring takes it, so nobody decides its noise again)
    expect(project.cost.unpriced).toEqual([]);
    expect(project.works.items.filter(w => /both roads/.test(w.label ?? ''))).toEqual([]);
    // no T-junction sight triangle at a roundabout
    expect(side.violations.some(v => /No clear view/.test(v.title))).toBe(false);
  });
  it('refuses a roundabout on a track', () => {
    const f = choose(fixture('track'), 'a');
    expect(evaluateProject(f.ctx, f.snapshot).routes.side.legacy!.violations.some(v => /A roundabout cannot be built on a track/.test(v.title))).toBe(true);
  });
});

describe('houses heard by both roads', () => {
  const at = (routeId: string, db: number) => ({ routeId, sourceId: `physical-${routeId}`, dayLimit: 60, nightLimit: 50,
    storeys: [{ height: 1.5, rawDay: 10 ** (db / 10), rawNight: 10 ** ((db - 10) / 10), day: 10 ** (db / 10), night: 10 ** ((db - 10) / 10) }] });
  it('are decided once, from both roads\' own finite-segment noise (or a given calculator)', () => {
    const house = new BuildingIndex([[650, 550, 5]]); // between our road (y = 250) and the side road (y = 850)
    const { ctx, snapshot } = fixture('tertiary', [], house);
    const both = evaluateProject(ctx, snapshot);
    expect(both.cost.unpriced).toEqual([]);
    const heard = both.receivers.find(r => r.buildingIndex === 0)!;
    expect(heard.contributions.map(c => c.routeId).sort()).toEqual([snapshot.design.routes[0].id, 'side'].sort());
    // a trial wall on the side road in front of a house 50 m from it: quieter there, at least twice its distance long
    const f = fixture('tertiary', [], new BuildingIndex([[650, 800, 5]])), p = evaluateProject(f.ctx, f.snapshot);
    const decider = finiteSegmentDecider(['side', snapshot.design.routes[0].id].map(id => ({ routeId: id, result: p.routes[id].legacy! })), f.ctx.legacy.buildings!, (x, y) => f.ctx.legacy.terrain.heightAt(x, y));
    const open = decider.sources(0).find(q => q.routeId === 'side')!, trial = decider.tryWall('side', 0, 4)!;
    expect(trial.length).toBeGreaterThanOrEqual(2 * 45);
    expect(trial.area).toBeCloseTo(4 * trial.length, 6);
    trial.storeys.forEach((st, k) => { expect(st.day).toBeLessThan(open.storeys[k].day * 0.5); expect(st.rawDay).toBeCloseTo(open.storeys[k].rawDay, 6); });
    trial.commit();
    expect(decider.walls().get('side')!.stretches).toEqual([expect.objectContaining({ side: expect.any(String), height: 4 })]);
    expect(decider.sources(0).find(q => q.routeId === 'side')!.storeys[0].day).toBeCloseTo(trial.storeys[0].day, 3);
    const mission = snapshot.design.routes[0].id;
    const decided = evaluateProject({ ...ctx, combinedNoise: routes => {
      expect(routes.map(r => r.route.id).sort()).toEqual([mission, 'side'].sort());
      return { sources: () => [at(mission, 58), at('side', 57)], tryWall: () => null };
    } }, snapshot);
    expect(decided.cost.unpriced).toEqual([]);
    const buy = decided.works.items.find(w => w.kind === 'property')!;
    expect(buy).toMatchObject({ owner: { id: mission }, accepted: true, label: 'House bought out: too loud with both roads together' });
    expect(decided.cost.total).toBeCloseTo(decided.cost.routes[mission] + decided.cost.routes.side, 3);
    expect(decided.cost.routes[mission]).toBeCloseTo(decided.cost.alone[mission] + buy.cost, 3);
    expect(decided.receivers.find(r => r.buildingIndex === 0)).toMatchObject({ action: 'buy', dayLimit: 60 });
    expect(decided.buildings.filter(b => b.buildingIndex === 0 && b.action === 'buy')).toHaveLength(1);
  });
});
