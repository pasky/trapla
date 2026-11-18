// Every road is checked against the map as the player edited it: rebuilt stretches gone (priced or not),
// new and rebuilt roads crossed through the same crossing engine as mapped roads.
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { D11_SCENARIO, D3_MOTORWAY } from '../src/core/data/scenario';
import { evaluateProject, previewProjectRoute, type ProjectEvalContext } from '../src/core/project-evaluate';
import { crossingOverridesOf, crossingTargetsOf, editedNetwork } from '../src/core/project-roadnet';
import { legacyDesignForRoute, makeLegacyProjectContext, projectFromLegacyDesign, replaceRouteFromLegacy } from '../src/core/project-legacy';
import { BuildingIndex } from '../src/core/buildings';
import { RoadNet } from '../src/core/roadnet';
import { syntheticTerrain } from '../src/core/terrain';
import type { RouteDesign } from '../src/core/project';
import type { CrossingResult } from '../src/core/crossings';
import { CLASS_TRAFFIC } from '../src/core/data/traffic';

it('an edited network cuts every rebuilt stretch (several on one way) and adds designed roads at stable slots', () => {
  const base = new RoadNet({ cls: ['tertiary'], ways: [[0, 0, 0, 1000, 0], [0, 500, -100, 500, 100]] });
  const net = base.edited([{ way: 0, d0: 600, d1: 800 }, { way: 0, d0: 100, d1: 200 }], [{ cls: 'secondary', xy: [0, 50, 1000, 50] }]);
  expect(net.wayStation(0, 50, 0)).toBeCloseTo(50, 6); // the part before the first cut keeps its index
  expect(net.wayClass(2)).toBe('secondary'); expect(net.isDesigned(2)).toBe(true); expect(net.isDesigned(1)).toBe(false);
  // what is left of way 0: 0–100, 200–600 and 800–1000; nothing of the cut stretches
  const hits = net.intersections(2, [0, 1000], [150, 150], [-10, 10]).concat(net.intersections(2, [0, 1000], [700, 700], [-10, 10]));
  expect(hits).toEqual([]);
  // what follows each cut is numbered by that cut, whatever else is edited (a stored choice cannot shift)
  expect(net.intersections(2, [0, 1000], [900, 900], [-10, 10]).map(h => h.way)).toEqual([3]);
  expect(net.intersections(2, [0, 1000], [400, 400], [-10, 10]).map(h => h.way)).toEqual([4]);
  expect(base.edited([{ way: 0, d0: 100, d1: 200, slot: 1 }], []).intersections(2, [0, 1000], [400, 400], [-10, 10]).map(h => h.way)).toEqual([3]);
  expect(base.edited([{ way: 0, d0: 100, d1: 200, slot: 1 }], [{ cls: 'secondary', xy: [] }]).intersections(2, [0, 1000], [400, 400], [-10, 10]).map(h => h.way)).toEqual([4]);
  // earthworks and relocations see the network without designed roads
  expect(net.ground.intersections(2, [0, 90], [300, 300], [10, 100]).map(h => h.way)).toEqual([]);
  expect(net.intersections(2, [0, 90], [300, 300], [10, 100]).map(h => h.way)).toEqual([2]);
});

it('a rebuilt railway is checked against the edited network too (its old track is taken up by the railway kernel)', () => {
  const base = new RoadNet({ cls: ['tertiary'], ways: [[0, 0, 0, 1000, 0]] });
  const rail = { id: 'rail', kind: 'railway', role: 'auxiliary', source: { intervals: [{ transportData: 't', sourceId: 'osm:way:1', s0: 0, s1: 500 }] },
    alignment: { kind: 'pi', pis: [] }, endpoints: { a: { position: { x: 0, y: 0, z: 0 } }, b: { position: { x: 500, y: 0, z: 0 } } } } as unknown as RouteDesign;
  const design = { routes: [rail], corridors: [], connections: [] } as unknown as Parameters<typeof editedNetwork>[1];
  expect(editedNetwork(base, design, [rail], new Map())?.roads).toBe(base);
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
    const credit = r.works.items.find(w => w.owner.id === 'side' && /pays for its bridge over/.test(w.label!))!;
    expect(credit.cost).toBeLessThan(0);
  });
  // D11 Nový Rokytník: a street over our road's cutting rides the owner's deck at ground level. That deck is
  // our road's bridge: not the player's own bridge (no 4 m rule, no span checks) and the street is held on it
  // from end to end (it used to be lifted 4 m and then missed the deck by 5 m).
  it('over our cutting it rides our deck at ground level from end to end, which is not its own bridge', () => {
    const ridge = (x: number) => 100 + 15 * Math.exp(-(((x - 600) / 150) ** 2));
    const { ctx, project, mission } = fixture();
    ctx.legacy = { ...ctx.legacy, terrain: syntheticTerrain(260, 120, 5, x => ridge(x)) };
    for (const e of Object.values(project.routes[1].endpoints)) e.position.z = ridge(600);
    const r = evaluateProject(ctx, { epoch: 'e', revision: 1, design: project });
    const own = r.routes[mission].legacy!, [c] = own.crossings, side = r.routes.side.legacy!;
    expect(c.type).toBe('overbridge');
    expect(own.ground[c.i] - own.grade[c.i]).toBeGreaterThan(6); // our road in a cutting
    const road = c.geometry!.road!, deck = c.geometry!.deck!;
    for (const p of [road[deck.start], road.reduce((p, q) => Math.abs(q.d!) < Math.abs(p.d!) ? q : p), road[deck.end]]) {
      const k = Math.round((p.y - side.y[0]) / side.ds);
      expect(Math.abs(side.grade[k] - p.z)).toBeLessThanOrEqual(1);
      expect(p.z - p.ground).toBeLessThan(1); // the deck lies at ground level
    }
    expect(side.kind[Math.round((250 - side.y[0]) / side.ds)]).toBe(1);
    expect(side.violations).toEqual([]);
    expect(r.works.items.some(w => w.owner.id === 'side' && /pays for its bridge over/.test(w.label!))).toBe(true);
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

describe('the edited network follows the project as it is now', () => {
  const flat = () => ({ terrain: syntheticTerrain(260, 120, 5, () => 100), scenario: D11_SCENARIO, a: { x: 100, y: 250 }, b: { x: 1100, y: 250 },
    roads: new RoadNet({ cls: ['track'], ways: [[0, 50, 20, 60, 30]] }) });
  const road = (id: string, a: [number, number], b: [number, number]): RouteDesign => ({ id, name: `Road ${id}`, role: 'auxiliary', revision: 0, kind: 'road', acousticSourceId: `acoustic:${id}`,
    endpoints: { a: { position: { x: a[0], y: a[1], z: 100 }, anchor: { kind: 'free' }, binding: 'resolved' },
      b: { position: { x: b[0], y: b[1], z: 100 }, anchor: { kind: 'free' }, binding: 'resolved' } },
    alignment: { kind: 'pi', pis: [], vertical: { kind: 'auto', pins: [] }, controls: {} },
    specification: { kind: 'road', policy: 'legacy-road', legalClass: 'III', crossSection: 'S7.5', designSpeed: 70,
      operations: { aadt: 1000, heavyShare: 0.1, speed: 70, speedPolicy: 'design' } } });
  const setup = () => {
    const legacy = flat();
    const project = projectFromLegacyDesign({ category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] },
      makeLegacyProjectContext(legacy, { presetId: 'legacy-road', packId: 'd11', objectData: 'objects', transportData: null }));
    const ctx: ProjectEvalContext = { legacy, environment: { objectData: 'objects', transportData: null, terrainData: 't', pricingData: 'p', waterData: 'w', terrainClass: 'hilly' } };
    return { ctx, project, mission: project.routes[0].id };
  };
  it('a crossed road whose start follows a moved road is held where it really crosses us', () => {
    const { ctx, project, mission } = setup();
    // the side road was attached when `host` ran along y = 60; host now runs along y = 20
    const host = road('host', [100, 20], [1100, 20]), side = road('side', [600, 60], [600, 480]);
    side.endpoints.a.anchor = { kind: 'route', routeId: 'host', s: 500 };
    project.routes.push(side, host);
    const r = evaluateProject(ctx, { epoch: 'e', revision: 1, design: project });
    const [c] = r.routes[mission].legacy!.crossings, own = r.routes.side.legacy!;
    expect(c).toMatchObject({ type: 'overbridge', crossedRoute: { id: 'side' } });
    expect(own.y[0]).toBeCloseTo(20, 6);
    // its deck is 230 m from its real start (y 20 → 250), not 190 m from the stored one
    const deck = c.geometry!.road!.reduce((p, q) => Math.abs(q.d!) < Math.abs(p.d!) ? q : p).z;
    expect(own.kind[23]).toBe(1);
    expect(Math.abs(own.grade[23] - deck)).toBeLessThan(1);
    expect(own.violations.filter(v => v.kind === 'crossing')).toEqual([]);
  });
  it('a dragged road stays on its deck over us in the preview', () => {
    const { ctx, project, mission } = setup();
    project.routes.push(road('side', [600, 20], [600, 480]));
    const full = evaluateProject(ctx, { epoch: 'e', revision: 1, design: project });
    const dragged = structuredClone(project), side = dragged.routes[1];
    side.endpoints.b.position.x = 660; // its far end pulled 60 m along our road
    const preview = previewProjectRoute(ctx, { epoch: 'e', revision: 2, design: dragged }, 'side', undefined, full).legacy!;
    const deck = full.routes[mission].legacy!.crossings[0].geometry!.road!.reduce((p, q) => Math.abs(q.d!) < Math.abs(p.d!) ? q : p).z;
    const k = preview.s.findIndex((_, q) => preview.y[q] >= 250);
    expect(preview.kind[k]).toBe(1);
    expect(Math.abs(preview.grade[k] - deck)).toBeLessThan(1.5);
    // without the last result it drops to the ground (what every drag used to show)
    expect(previewProjectRoute(ctx, { epoch: 'e', revision: 2, design: dragged }, 'side').legacy!.kind[k]).toBe(0);
  });
  // Owner's D3 bug: with road changes not priced yet, houses under our motorway stayed standing on it and
  // their card only said the project's noise check was not finished.
  it('a house under a road is demolished whether or not the project can be priced', () => {
    const { ctx, project, mission } = setup();
    ctx.legacy = { ...ctx.legacy, buildings: new BuildingIndex([[600, 250, 7], [600, 420, 7], [100, 560, 7]]) };
    const alone = evaluateProject(ctx, { epoch: 'e', revision: 1, design: project });
    expect(alone.complete).toBe(true);
    expect(alone.buildings.filter(b => b.action === 'demolish')).toMatchObject([{ buildingIndex: 0, routeId: mission }]);
    // a new road on a house, and another too close to it (the engine does not design two roads that close
    // together yet: not priced)
    project.routes.push(road('side', [300, 420], [900, 420]), road('other', [300, 436], [900, 436]));
    const r = evaluateProject(ctx, { epoch: 'e', revision: 2, design: project });
    expect(r.complete).toBe(false); expect(r.cost.total).toBeNull();
    const gone = r.buildings.filter(b => b.action === 'demolish');
    expect(gone).toMatchObject([{ buildingIndex: 0, routeId: mission }, { buildingIndex: 1, routeId: 'side' }]);
    expect(gone.every(b => b.cost > 0)).toBe(true);
    // each road's own result says the same (what the map hides and the house card shows)
    expect(r.routes[mission].legacy!.demolished.map(b => b.j)).toEqual([0]);
    expect(r.routes.side.legacy!.demolished.map(b => b.j)).toEqual([1]);
  });
  it('a choice on what is left of a cut road is stored with the stretch that cut it, not a number that shifts', () => {
    const { ctx, project, mission } = setup();
    evaluateProject(ctx, { epoch: 'e', revision: 1, design: project }); // learns the map's size (1 way)
    const rebuilt = { ...road('rebuilt', [50, 20], [60, 30]), source: { intervals: [{ transportData: 't', sourceId: 's', s0: 0, s1: 10 }] } } as RouteDesign;
    const p1 = { ...project, routes: [...project.routes, rebuilt] };
    // way 1 = the rebuilt road's own line; way 2 = what is left of its old road after the stretch
    const stored = crossingTargetsOf(p1, [{ roadId: 2, type: 'overbridge' }]);
    expect(stored).toEqual([{ choice: 'overbridge', target: { kind: 'legacy-way', objectData: 'objects', roadId: 2, after: 'rebuilt' } }]);
    // another road added before it (way 1; the rebuilt line is now way 2): the same choice maps to way 3
    const p2 = { ...project, routes: [project.routes[0], road('new', [300, 20], [300, 480]), rebuilt] };
    expect(crossingOverridesOf(p2, stored)).toEqual([{ roadId: 3, type: 'overbridge' }]);
    expect(crossingOverridesOf(p1, stored)).toEqual([{ roadId: 2, type: 'overbridge' }]);
    // the rebuilt stretch removed: the choice is dropped
    expect(crossingOverridesOf(project, stored)).toEqual([]);
    // a save from before (what was left was way `size + q`) still reaches it
    expect(crossingOverridesOf(p2, [{ choice: 'overbridge', target: { kind: 'legacy-way', objectData: 'objects', roadId: 1 } }])).toEqual([{ roadId: 3, type: 'overbridge' }]);
    expect(mission).toBeTruthy();
  });
});

// The owner's D3 case: the motorway bridges III/1057 at km 11.8; that stretch is rebuilt: the old road must
// be gone from the motorway's checks, the new line crossed by the crossing engine. Nobody is asked for its
// traffic: the census did not count III/1057, so it starts as the average class III road.
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
    const index = new ProjectTransportIndex(graph, fingerprint, graph.vectorData, pack.terrain, pack.census);
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
    expect(command.routes[0]).toMatchObject({ name: 'Road III/1057', specification: { operations: CLASS_TRAFFIC.III } });
    // the old road is off the map and out of the motorway's checks; untouched, the change is priced at once
    expect(after.issues.map(i => i.code)).toEqual([]);
    expect(after.cost.total).not.toBeNull();
    expect(after.acceptedReplacements).toEqual([interval]);
    expect(motorway.crossings.some(c => c.roadId === 1515)).toBe(false);
    // the same road in the same place: our abutments keep clear of it as they did of the old road (walls,
    // bridge length); the motorway's bill does not move (it fell 15 M when they ignored it)
    expect(Math.abs(motorway.cost.total - before.routes[forward].legacy!.cost.total)).toBeLessThan(1e6);
    expect(motorway.violations.map(v => v.title).filter(t => /pier|class III/i.test(t))).toEqual([]);
    // the rebuilt road is crossed by the motorway's crossing engine, not left as an unchecked crossing
    const crossing = motorway.crossings.find(c => c.crossedRoute?.id === 'route:r1')!;
    expect(crossing.type).toBe('bridge');
    expect(after.issues.map(i => i.code)).not.toContain('roads-cross');
    const r1 = after.routes['route:r1'].legacy!, s = r1.s.findIndex((_, q) => Math.hypot(r1.x[q] - crossing.x, r1.y[q] - crossing.y) < r1.ds);
    expect(r1.grade[s]).toBeLessThanOrEqual(motorway.grade[crossing.i] - 6 + 0.5 + 1e-9);
    // QA (main f9f5d9d): bent 30 m aside 25 m from our bridge, it passes under the bridge and beside its
    // abutment; that is the crossing's own works, and its old road removed there is land given back
    const { fitPlacedBend } = await import('../src/core/bend-fit');
    const { nearestLeg } = await import('../src/core/horizontal');
    let sx = 0, best = Infinity;
    for (let q = 0; q < old.stations.at(-1); q += 2) { const g = index.position(old.id, q)!, d = Math.hypot(g.x - crossing.x, g.y - crossing.y); if (d < best) { best = d; sx = q; } }
    const north = [sx + 25, sx - 25].map(q => ({ q, g: index.position(old.id, q)! })).sort((u, w) => w.g.y - u.g.y)[0];
    const g2 = index.position(old.id, north.q + 5)!, tl = Math.hypot(g2.x - north.g.x, g2.y - north.g.y);
    const bent = structuredClone(edited), route = bent.routes.at(-1)!; if (route.alignment.kind !== 'pi' || route.specification.kind !== 'road') throw new Error('converted');
    const k = nearestLeg(route.endpoints.a.position, route.endpoints.b.position, route.alignment.pis, north.g);
    route.alignment.pis.splice(k, 0, { x: north.g.x - (g2.y - north.g.y) / tl * 30, y: north.g.y + (g2.x - north.g.x) / tl * 30, r: null });
    route.alignment.pis = fitPlacedBend(route.endpoints.a.position, route.endpoints.b.position, route.alignment.pis, k,
      route.specification.crossSection as 'S7.5', route.specification.designSpeed) ?? route.alignment.pis;
    const moved = evaluateProject(ctx, { epoch: 'e', revision: 3, design: bent });
    expect(moved.issues.filter(i => i.code.startsWith('shared')).map(i => i.violation.title)).toEqual([]);
    expect(moved.cost.total).not.toBeNull();
  }, 120_000);
});

// D11 km 4.1: our road runs 270 m over a track and reroutes it to the bridge at km 4.01. The player drags
// the rest of the track north of us: the stretch stops where our earthworks end (the track is gone under
// them), joins what is left of it, and our reroute of that remnant stays ours: one total, no "two roads".
const D11 = 'public/scenarios/d11';
describe.skipIf(!['meta.json', 'transport.json.gz', 'overlays.json', 'height.i16.gz'].every(f => existsSync(`${D11}/${f}`)))('D11: a track our road covers, rebuilt beyond it', () => {
  it('stops short of our earthworks and is priced with our reroute of what is left', async () => {
    const { loadPack } = await import('../scripts/loadpack');
    const { objectDataKey } = await import('../src/core/build-controls');
    const { ProjectTransportIndex } = await import('../src/core/project-network');
    const { startDesign } = await import('../src/state');
    const { coveredStretches, derivedStretch, rebuildCommand } = await import('../src/ui/road-edit');
    const pack = loadPack(D11), scenario = D11_SCENARIO;
    const graph = JSON.parse(gunzipSync(readFileSync(`${D11}/transport.json.gz`)).toString());
    const fingerprint = JSON.parse(readFileSync(`${D11}/transport-meta.json`, 'utf8')).fingerprint;
    const objectData = objectDataKey(pack.overlays.buildings, pack.overlays.binfo, pack.overlays.net);
    const A = { x: pack.meta.A.xy[0], y: pack.meta.A.xy[1] }, B = { x: pack.meta.B.xy[0], y: pack.meta.B.xy[1] };
    const lc = makeLegacyProjectContext({ terrain: pack.terrain, scenario, a: A, b: B }, { presetId: 'd11', packId: pack.meta.id, objectData, transportData: fingerprint });
    // (since cost model 39 Auto's line runs ≈ 12 m higher here, over the track on a bridge; two pins at model 38's
    // heights keep the setting of these cases: our road 2 m over the track, which it reroutes; since model 52 that
    // reroute passes within the working strip of the house at km 4.07, which the player buys out to keep it so)
    const design = projectFromLegacyDesign({ ...startDesign(), ...structuredClone(scenario.initial ?? {}), gradePins: [{ s: 4100, z: 441.1 }, { s: 4300, z: 432 }],
      buildingOverrides: [{ j: 11400, action: 'buy' }] }, lc);
    const index = new ProjectTransportIndex(graph, fingerprint, graph.vectorData, pack.terrain, pack.census);
    const ctx: ProjectEvalContext = { legacy: { terrain: pack.terrain, scenario, a: A, b: B, buildings: pack.buildings, roads: pack.roads },
      environment: { objectData, transportData: fingerprint, terrainData: 't', pricingData: 'p', waterData: 'w', terrainClass: 'hilly' },
      sourceWays: new Map(graph.sources.flatMap((s: { id: string; legacyNetIndex?: number }) => s.legacyNetIndex === undefined ? [] : [[s.id, s.legacyNetIndex]])) };
    const track = graph.sources.find((s: { id: string }) => s.id === 'osm:way:1315656940');
    const before = evaluateProject(ctx, { epoch: 'e', revision: 1, design }), ours = before.routes[design.routes[0].id].legacy!;
    const reroute = ours.crossings.find(c => c.roadId === track.legacyNetIndex)!;
    expect(reroute).toMatchObject({ cls: 'track', type: 'diversion' });
    const covered = coveredStretches(index, track.id, [{ ...ours, name: 'our road' }]);
    const grab = 0.85 * track.stations.at(-1);
    // without our earthworks the stretch would run 190 m along and under our road
    expect(derivedStretch(index, track.id, grab, [])!.s0).toBeLessThan(100);
    const interval = derivedStretch(index, track.id, grab, covered)!;
    expect(interval.s0).toBeGreaterThan(250);
    expect(derivedStretch(index, track.id, 150, covered)).toBeNull(); // under our road: nothing to rebuild there
    const command = rebuildCommand(index, interval, { routeId: 'route:r1', acousticSourceId: 'acoustic:r1' });
    const edited = structuredClone(design); edited.routes.push(...command.routes); edited.connections.push(...command.connections);
    const r1 = edited.routes[1]; if (r1.alignment.kind !== 'pi') throw new Error('converted');
    const p = index.position(track.id, grab)!; r1.alignment.pis.push({ x: p.x + 20, y: p.y, r: null });
    r1.alignment.pis.sort((a, b) => Math.hypot(a.x - r1.endpoints.a.position.x, a.y - r1.endpoints.a.position.y) - Math.hypot(b.x - r1.endpoints.a.position.x, b.y - r1.endpoints.a.position.y));
    const after = evaluateProject(ctx, { epoch: 'e', revision: 2, design: edited });
    expect(after.issues.map(i => i.code)).toEqual([]);
    expect(after.cost.total).not.toBeNull();
    expect(after.routes[design.routes[0].id].legacy!.crossings.find(c => c.roadId === track.legacyNetIndex)?.type).toBe('diversion');
    // QA (main f9f5d9d): bent right at its start, where our reroute of the rest of the track begins and
    // another track meets it: the two roads' works meet at that end as at a junction, and what our road does
    // to the rest of its old track is ours alone (no "two roads change the same old road")
    // ... and a quarter along, bent 60 m away from our road: it now crosses another track at a junction whose
    // drawn ends are that track as it is (not works beside our reroute). Bent 60 m towards our road it runs
    // 1 m from our embankment (a real conflict, with its concrete fix; 3 m before cost model 39); 45 m towards it, it keeps clear.
    const { nearestLeg } = await import('../src/core/horizontal');
    const quarter = (interval.s1 - interval.s0) / 4;
    for (const [at, off, shared] of [[10, -60, []], [21, -60, []], [quarter, -60, []], [quarter, 45, []],
      [quarter, 60, ['Move one of them about 9 m away here']]] as [number, number, string[]][]) {
      const near = structuredClone(edited), q = near.routes[1]; if (q.alignment.kind !== 'pi') throw new Error('converted');
      const g = index.position(track.id, interval.s0 + at)!, g2 = index.position(track.id, interval.s0 + at + 5)!, tl = Math.hypot(g2.x - g.x, g2.y - g.y);
      q.alignment.pis.splice(nearestLeg(q.endpoints.a.position, q.endpoints.b.position, q.alignment.pis, g), 0, { x: g.x - (g2.y - g.y) / tl * off, y: g.y + (g2.x - g.x) / tl * off, r: null });
      const res = evaluateProject(ctx, { epoch: 'e', revision: 3, design: near });
      expect(res.issues.filter(i => i.code.startsWith('shared')).map(i => i.violation.fix)).toEqual(shared);
      if (!shared.length) expect(res.cost.total).not.toBeNull();
    }
  }, 120_000);
});

// The player's road takes over where Auto's reroutes of our road would meet it (QA final sweep, main e24df59).
describe.skipIf(!['meta.json', 'transport.json.gz', 'overlays.json', 'height.i16.gz'].every(f => existsSync(`${D11}/${f}`)))('D11: roads rebuilt beside our automatic reroutes', () => {
  it('are priced: our reroute is planned again around them, their ends meet what is left of the roads we change', async () => {
    const { loadPack } = await import('../scripts/loadpack');
    const { objectDataKey } = await import('../src/core/build-controls');
    const { ProjectTransportIndex } = await import('../src/core/project-network');
    const { startDesign } = await import('../src/state');
    const { coveredStretches, derivedStretch, rebuildCommand } = await import('../src/ui/road-edit');
    const { nearestLeg } = await import('../src/core/horizontal');
    const pack = loadPack(D11), scenario = D11_SCENARIO;
    const graph = JSON.parse(gunzipSync(readFileSync(`${D11}/transport.json.gz`)).toString());
    const fingerprint = JSON.parse(readFileSync(`${D11}/transport-meta.json`, 'utf8')).fingerprint;
    const objectData = objectDataKey(pack.overlays.buildings, pack.overlays.binfo, pack.overlays.net);
    const A = { x: pack.meta.A.xy[0], y: pack.meta.A.xy[1] }, B = { x: pack.meta.B.xy[0], y: pack.meta.B.xy[1] };
    const lc = makeLegacyProjectContext({ terrain: pack.terrain, scenario, a: A, b: B }, { presetId: 'd11', packId: pack.meta.id, objectData, transportData: fingerprint });
    // (since cost model 39 Auto's line runs ≈ 12 m higher here, over the track on a bridge; two pins at model 38's
    // heights keep the setting of these cases: our road 2 m over the track, which it reroutes; since model 52 that
    // reroute passes within the working strip of the house at km 4.07, which the player buys out to keep it so)
    const design = projectFromLegacyDesign({ ...startDesign(), ...structuredClone(scenario.initial ?? {}), gradePins: [{ s: 4100, z: 441.1 }, { s: 4300, z: 432 }],
      buildingOverrides: [{ j: 11400, action: 'buy' }] }, lc);
    const index = new ProjectTransportIndex(graph, fingerprint, graph.vectorData, pack.terrain, pack.census);
    const ctx: ProjectEvalContext = { legacy: { terrain: pack.terrain, scenario, a: A, b: B, buildings: pack.buildings, roads: pack.roads },
      environment: { objectData, transportData: fingerprint, terrainData: 't', pricingData: 'p', waterData: 'w', terrainClass: 'hilly' },
      sourceWays: new Map(graph.sources.flatMap((s: { id: string; legacyNetIndex?: number }) => s.legacyNetIndex === undefined ? [] : [[s.id, s.legacyNetIndex]])) };
    const ours = evaluateProject(ctx, { epoch: 'e', revision: 1, design }).routes[design.routes[0].id].legacy!;
    const wayOf = (id: string) => graph.sources.find((s: { id: string }) => s.id === id).legacyNetIndex as number;
    const rebuilt = (id: string, bend: (q: RouteDesign & { alignment: { kind: 'pi' } }, at: (s: number) => { x: number; y: number; nx: number; ny: number }, s0: number, s1: number) => void, grab = 0.5) => {
      const interval = derivedStretch(index, id, grab * index.source(id)!.stations.at(-1)!, coveredStretches(index, id, [{ ...ours, name: 'our road' }]))!;
      const command = rebuildCommand(index, interval, { routeId: 'route:r1', acousticSourceId: 'acoustic:r1' });
      const edited = structuredClone(design); edited.routes.push(...command.routes); edited.connections.push(...command.connections);
      const q = edited.routes[1]; if (q.alignment.kind !== 'pi') throw new Error('converted');
      bend(q as RouteDesign & { alignment: { kind: 'pi' } }, s => {
        const g = index.position(id, s)!, g2 = index.position(id, s + 5)!, l = Math.hypot(g2.x - g.x, g2.y - g.y);
        return { x: g.x, y: g.y, nx: -(g2.y - g.y) / l, ny: (g2.x - g.x) / l };
      }, interval.s0, interval.s1);
      return evaluateProject(ctx, { epoch: 'e', revision: 2, design: edited });
    };
    const insert = (off: number) => (q: RouteDesign & { alignment: { kind: 'pi' } }, at: (s: number) => { x: number; y: number; nx: number; ny: number }, s0: number, s1: number) => {
      const p = at((s0 + s1) / 2), pis = q.alignment.pis;
      pis.splice(nearestLeg(q.endpoints.a.position, q.endpoints.b.position, pis, p), 0, { x: p.x + p.nx * off, y: p.y + p.ny * off, r: null });
    };
    // QA: the track that branches off the one we reroute at km 4.1, dragged 40 px up (its bends as dragged).
    // It starts on what is left of that track, beside our embankment: the two roads meet there as at a junction.
    const qa = rebuilt('osm:way:506629976', q => { q.alignment.pis = [{ x: 8342.3, y: 7345.85, r: null }, { x: 8378.0, y: 7302.78, r: null },
      { x: 8337.99, y: 7265.13, r: null }, { x: 8431.1, y: 7069.1, r: null }]; });
    expect(qa.issues.filter(i => i.check === 'not-checked').map(i => i.violation.title)).toEqual([]);
    expect(qa.cost.total).not.toBeNull();
    // A street bent 60 m towards our reroute of the km 4.1 track (to the street under our bridge at km 4.01):
    // that reroute is planned again around it, and the project is priced.
    const street = rebuilt('osm:way:37855288', insert(-60));
    expect(street.issues.map(i => i.violation.title)).toEqual([]);
    // (the reroute to the bridge at km 4.01: the track's stretch at km 4.1 is moved beside our road)
    const rerouted = (c: CrossingResult) => c.roadId === wayOf('osm:way:1315656940') && c.targetS !== undefined;
    const before = ours.crossings.find(rerouted)!;
    const after = street.routes[design.routes[0].id].legacy!.crossings.find(rerouted)!;
    expect([after.type, after.targetRoadId]).toEqual([before.type, before.targetRoadId]);
    // (since model 42 the track's west part still reaches other tracks and just ends at our earthworks: only its east
    // part is led to the bridge, on the side away from the street, so the street leaves that reroute as it was)
    expect(before.closure?.connected).toEqual([false, true]);
    expect(after.geometry!.links!.map(l => l.length > 0)).toEqual([true, false]);
    expect(after.cost).toBe(before.cost);
    // Rebuilt roads that end beside our embankment, where they stop short of it: their ends meet our works as
    // at a junction (reroute-takeover-audit): a street whose rest our road reroutes (a way of its own beyond
    // the stretch), a street whose closure's detour lies nowhere near the roads our road changes.
    // (the dead-end track 251829053 at km 6.4 no longer reaches our slope: its end is 11 m from our axis, our
    // 1.8 m fill's toe at 10 m, closer than two roads' works may be: a real conflict, cost model 31)
    for (const [id, off, grab] of [['osm:way:209632923', 30, 0.25], ['osm:way:314107194', -30, 0.5]] as const)
      expect(rebuilt(id, insert(off), grab).issues.filter(i => i.check === 'not-checked').map(i => i.code)).toEqual([]);
    // A service road that ends under our bridge at km 4.03 keeps its own crossing there (passes under it: our
    // bridge, or a box where it now runs under our embankment beyond the bridge's end).
    const service = rebuilt('osm:way:36347941', insert(30));
    expect(service.issues.map(i => i.violation.title)).toEqual([]);
    expect(service.routes[design.routes[0].id].legacy!.crossings.find(c => c.crossedRoute?.id === 'route:r1')?.type).toMatch(/^(bridge|underpass)$/);
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

it('what the kernel says about a side road reads "this road": "our road" there is the mission road', async () => {
  const { thisRoadWords } = await import('../src/core/terms');
  expect(thisRoadWords('Ramps up to the bridge over our road would be longer than 250 m')).toBe('Ramps up to the bridge over this road would be longer than 250 m');
  expect(thisRoadWords('Lower our road here (a cutting makes the ramps shorter), or choose "Our bridge over it", an underpass or "Cut and reroute"'))
    .toBe('Lower this road here (a cutting makes the ramps shorter), or choose "This road’s bridge over it", an underpass or "Cut and reroute"');
  expect(thisRoadWords('Our earthworks cover 14 m of a track')).toBe('This road’s earthworks cover 14 m of a track');
  expect(thisRoadWords('Its bridge over us')).toBe('Its bridge over this road');
  expect(thisRoadWords('The crossed road meets ours at the same level; four hours of your time')).toBe('The crossed road meets this road at the same level; four hours of your time');
  expect(thisRoadWords(thisRoadWords('Our road crosses over the crossed road'))).toBe('This road crosses over the crossed road');
  // a new or rebuilt railway: its own words
  expect(thisRoadWords('Our earthworks cover 3 m of a service road | Put our railway on a bridge', 'railway'))
    .toBe('This railway’s earthworks cover 3 m of a service road | Put this railway on a bridge');
});
