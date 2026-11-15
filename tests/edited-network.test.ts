// Every road is checked against the map as the player edited it: rebuilt stretches gone (priced or not),
// new and rebuilt roads crossed through the same crossing engine as mapped roads.
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { D11_SCENARIO, D3_MOTORWAY } from '../src/core/data/scenario';
import { evaluateProject, type ProjectEvalContext } from '../src/core/project-evaluate';
import { legacyDesignForRoute, makeLegacyProjectContext, projectFromLegacyDesign, replaceRouteFromLegacy } from '../src/core/project-legacy';
import { RoadNet } from '../src/core/roadnet';
import { syntheticTerrain } from '../src/core/terrain';
import type { RouteDesign } from '../src/core/project';

it('an edited network cuts every rebuilt stretch (several on one way) and adds designed roads at stable slots', () => {
  const base = new RoadNet({ cls: ['tertiary'], ways: [[0, 0, 0, 1000, 0], [0, 500, -100, 500, 100]] });
  const net = base.edited([{ way: 0, d0: 600, d1: 800 }, { way: 0, d0: 100, d1: 200 }], [{ cls: 'secondary', xy: [0, 50, 1000, 50] }]);
  expect(net.wayStation(0, 50, 0)).toBeCloseTo(50, 6); // the part before the first cut keeps its index
  expect(net.wayClass(2)).toBe('secondary'); expect(net.isDesigned(2)).toBe(true); expect(net.isDesigned(1)).toBe(false);
  // what is left of way 0: 0–100, 200–600 and 800–1000; nothing of the cut stretches
  const hits = net.intersections(2, [0, 1000], [150, 150], [-10, 10]).concat(net.intersections(2, [0, 1000], [700, 700], [-10, 10]));
  expect(hits).toEqual([]);
  expect(net.intersections(2, [0, 1000], [400, 400], [-10, 10]).map(h => h.way)).toEqual([3]);
  // earthworks and relocations see the network without designed roads
  expect(net.ground.intersections(2, [0, 90], [300, 300], [10, 100]).map(h => h.way)).toEqual([]);
  expect(net.intersections(2, [0, 90], [300, 300], [10, 100]).map(h => h.way)).toEqual([2]);
});

describe('a new road crossing ours goes through the crossing engine', () => {
  function fixture() {
    const legacy = { terrain: syntheticTerrain(260, 120, 5, () => 100), scenario: D11_SCENARIO, a: { x: 100, y: 250 }, b: { x: 1100, y: 250 },
      roads: new RoadNet({ cls: ['track'], ways: [[0, 50, 20, 60, 30]] }) };
    const context = makeLegacyProjectContext(legacy, { presetId: 'legacy-road', packId: 'd11', objectData: 'objects', transportData: null });
    const project = projectFromLegacyDesign({ category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] }, context);
    const side: RouteDesign = { id: 'side', name: 'Road III/123', role: 'auxiliary', revision: 0, kind: 'road', acousticSourceId: 'acoustic:side',
      endpoints: { a: { position: { x: 600, y: 20, z: 100 }, anchor: { kind: 'free' }, binding: 'resolved' },
        b: { position: { x: 600, y: 480, z: 100 }, anchor: { kind: 'free' }, binding: 'resolved' } },
      alignment: { kind: 'pi', pis: [], vertical: { kind: 'auto', pins: [] }, controls: {} },
      specification: { kind: 'road', policy: 'legacy-road', legalClass: 'III', crossSection: 'S7.5', designSpeed: 70,
        operations: { aadt: 1000, heavyShare: 0.1, speed: 70, speedPolicy: 'design' } } };
    project.routes.push(side);
    const ctx: ProjectEvalContext = { legacy, environment: { objectData: 'objects', transportData: null, terrainData: 't', pricingData: 'p', waterData: 'w', terrainClass: 'hilly' } };
    return { ctx, project, mission: project.routes[0].id };
  }
  it('Auto carries it over our road; it rides its deck, billed once', () => {
    const { ctx, project, mission } = fixture();
    const r = evaluateProject(ctx, { epoch: 'e', revision: 1, design: project });
    expect(r.issues.map(i => i.code)).not.toContain('roads-cross');
    const [c] = r.routes[mission].legacy!.crossings;
    // 500 m from both ends a level junction is too close to them: the class III road goes over us
    expect(c).toMatchObject({ type: 'overbridge', designed: true, crossedRoute: { id: 'side', name: 'Road III/123' } });
    const side = r.routes.side.legacy!, k = Math.round(230 / side.ds);
    const deck = c.geometry!.road!.reduce((p, q) => Math.abs(q.d!) < Math.abs(p.d!) ? q : p).z;
    expect(Math.abs(side.grade[k] - deck)).toBeLessThan(1);
    expect(side.kind[k]).toBe(1); // its own deck over our road
    expect(side.violations.filter(v => v.kind === 'crossing')).toEqual([]);
    // what the crossing builds (deck and ramps) is not billed again in the side road's own bill
    const credit = r.works.items.find(w => w.owner.id === 'side' && /built with that bridge/.test(w.label!))!;
    expect(credit.cost).toBeLessThan(0);
  });
  it('a crossing choice on it is stored on that road and our bridge keeps it low enough under us', () => {
    const { ctx, project, mission } = fixture();
    evaluateProject(ctx, { epoch: 'e', revision: 1, design: project }); // learns the map's size
    const d = legacyDesignForRoute(project, mission);
    d.crossingOverrides = [{ roadId: 1, type: 'bridge' }]; // way 1: the side road's slot after the one mapped way
    const next = replaceRouteFromLegacy(project, mission, d), route = next.routes[0];
    expect(route.alignment.kind === 'pi' && route.alignment.controls.crossings).toEqual([{ choice: 'bridge', target: { kind: 'route', routeId: 'side', s0: 0, s1: 0 } }]);
    const r = evaluateProject(ctx, { epoch: 'e', revision: 2, design: next });
    const own = r.routes[mission].legacy!, [c] = own.crossings, side = r.routes.side.legacy!;
    expect(c).toMatchObject({ type: 'bridge', requestedType: 'bridge', crossedRoute: { id: 'side' } });
    expect(side.grade[Math.round(230 / side.ds)]).toBeLessThanOrEqual(own.grade[c.i] - 6 + 0.5);
    // the side road gone: the choice is dropped, never applied to another way
    const alone = structuredClone(next); alone.routes.pop();
    expect(legacyDesignForRoute(alone, mission).crossingOverrides).toEqual([]);
  });
});

// The owner's D3 case: the motorway bridges III/1057 at km 11.8; that stretch is rebuilt (traffic not even
// set): the old road must be gone from the motorway's checks, the new line crossed by the crossing engine.
const PACK = 'public/scenarios/d3';
describe.skipIf(!['meta.json', 'transport.json.gz', 'overlays.json', 'height.i16.gz'].every(f => existsSync(`${PACK}/${f}`)))('D3: III/1057 rebuilt under the motorway', () => {
  it('our motorway is checked against the rebuilt road, not the old one', async () => {
    const { loadPack } = await import('../scripts/loadpack');
    const { objectDataKey } = await import('../src/core/build-controls');
    const { createMotorwayProject } = await import('../src/core/project-motorway');
    const { ProjectTransportIndex } = await import('../src/core/project-network');
    const { startDesign } = await import('../src/state');
    const { derivedStretch, rebuildCommand } = await import('../src/ui/road-edit');
    const pack = loadPack(PACK), scenario = D3_MOTORWAY;
    const graph = JSON.parse(gunzipSync(readFileSync(`${PACK}/transport.json.gz`)).toString());
    const fingerprint = JSON.parse(readFileSync(`${PACK}/transport-meta.json`, 'utf8')).fingerprint;
    const objectData = objectDataKey(pack.overlays.buildings, pack.overlays.binfo, pack.overlays.net);
    const A = { x: pack.meta.A.xy[0], y: pack.meta.A.xy[1] }, B = { x: pack.meta.B.xy[0], y: pack.meta.B.xy[1] };
    const lc = makeLegacyProjectContext({ terrain: pack.terrain, scenario, a: A, b: B }, { presetId: scenario.presetId!, packId: pack.meta.id, objectData, transportData: fingerprint });
    const design = createMotorwayProject(projectFromLegacyDesign({ ...startDesign(), category: 'S9.5', speed: 90 }, lc),
      { ...startDesign(), ...structuredClone(scenario.initial!) }, { aadt: scenario.traffic, heavyShare: scenario.heavyShare! });
    const index = new ProjectTransportIndex(graph, fingerprint, graph.vectorData, pack.terrain);
    const ctx: ProjectEvalContext = { legacy: { terrain: pack.terrain, scenario, a: A, b: B, buildings: pack.buildings, roads: pack.roads },
      environment: { objectData, transportData: fingerprint, terrainData: 't', pricingData: 'p', waterData: 'w', terrainClass: 'hilly' },
      sourceWays: new Map(graph.sources.flatMap((s: { id: string; legacyNetIndex?: number }) => s.legacyNetIndex === undefined ? [] : [[s.id, s.legacyNetIndex]])) };
    const old = graph.sources.find((s: { tags: { ref?: string }; legacyNetIndex?: number }) => s.tags.ref === '1057' && s.legacyNetIndex === 1515);
    const before = evaluateProject(ctx, { epoch: 'e', revision: 1, design });
    const forward = design.corridors[0].children.forward;
    expect(before.routes[forward].legacy!.crossings.some(c => c.roadId === 1515 && c.type === 'bridge')).toBe(true);
    const interval = derivedStretch(index, old.id, old.stations.at(-1) / 2, [])!;
    const command = rebuildCommand(index, interval, { routeId: 'route:r1', acousticSourceId: 'acoustic:r1' });
    const edited = structuredClone(design); edited.routes.push(...command.routes); edited.connections.push(...command.connections);
    const after = evaluateProject(ctx, { epoch: 'e', revision: 2, design: edited });
    const motorway = after.routes[forward].legacy!;
    // the old road is off the map and out of the motorway's checks, although the change is not priced yet
    expect(after.cost.total).toBeNull();
    expect(after.acceptedReplacements).toEqual([interval]);
    expect(motorway.crossings.some(c => c.roadId === 1515)).toBe(false);
    expect(motorway.violations.map(v => v.title).filter(t => /pier|class III/i.test(t))).toEqual([]);
    // the rebuilt road is crossed by the motorway's crossing engine, not left as an unchecked crossing
    const crossing = motorway.crossings.find(c => c.crossedRoute?.id === 'route:r1')!;
    expect(crossing.type).toBe('bridge');
    expect(after.issues.map(i => i.code)).not.toContain('roads-cross');
    const r1 = after.routes['route:r1'].legacy!, s = r1.s.findIndex((_, q) => Math.hypot(r1.x[q] - crossing.x, r1.y[q] - crossing.y) < r1.ds);
    expect(r1.grade[s]).toBeLessThanOrEqual(motorway.grade[crossing.i] - 6 + 0.5 + 1e-9);
  }, 120_000);
});

it('a side road\'s problems name its start and end, never the mission\'s A and B (card and map)', () => {
  const legacy = { terrain: syntheticTerrain(260, 120, 5, () => 100), scenario: D11_SCENARIO, a: { x: 100, y: 250 }, b: { x: 1100, y: 250 } };
  const context = makeLegacyProjectContext(legacy, { presetId: 'legacy-road', packId: 'd11', objectData: 'objects', transportData: null });
  const project = projectFromLegacyDesign({ category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] }, context);
  const side = structuredClone(project.routes[0]);
  Object.assign(side, { id: 'side', role: 'auxiliary', acousticSourceId: 'acoustic:side', name: 'Road III/123' });
  side.endpoints = { a: { position: { x: 100, y: 450, z: 100 }, anchor: { kind: 'free' }, binding: 'resolved' },
    b: { position: { x: 1100, y: 450, z: 100 }, anchor: { kind: 'free' }, binding: 'resolved' } };
  if (side.alignment.kind === 'pi') side.alignment.pis = [{ x: 140, y: 520, r: null }]; // a sharp bend right at its start
  project.routes.push(side);
  const ctx: ProjectEvalContext = { legacy, environment: { objectData: 'objects', transportData: null, terrainData: 't', pricingData: 'p', waterData: 'w', terrainClass: 'hilly' } };
  const r = evaluateProject(ctx, { epoch: 'e', revision: 1, design: project });
  const texts = r.routes.side.legacy!.violations.flatMap(v => [v.title, v.fix, v.detail ?? '']);
  expect(texts.some(t => /its start/.test(t))).toBe(true);
  expect(texts.filter(t => /\b(to|from|near|at|and|of|before|after) [AB]\b/.test(t))).toEqual([]);
});
