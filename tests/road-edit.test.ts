import { describe, expect, it } from 'vitest';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { ProjectTransportIndex } from '../src/core/project-network';
import type { ProjectDesign } from '../src/core/project';
import type { TransportGraphData } from '../src/core/project-transport';
import { evaluateProjectRoad } from '../src/core/project-road';
import { assertProjectDesign } from '../src/core/project-validation';
import { RoadNet } from '../src/core/roadnet';
import { syntheticTerrain } from '../src/core/terrain';
import { derivedStretch, fitBends, moveStretchEnds, rebuildable, rebuildCommand, strayDistance } from '../src/ui/road-edit';

// A 2 km class III road along y = 1000 with a gentle kink at x = 1000, side roads joining at x = 500 and x = 1550.
function fixture() {
  const xy = [0, 1000, 500, 1000, 1000, 1030, 1550, 1000, 2000, 1000];
  const stations = [0];
  for (let i = 2; i < xy.length; i += 2) stations.push(stations.at(-1)! + Math.hypot(xy[i] - xy[i - 2], xy[i + 1] - xy[i - 1]));
  const graph: TransportGraphData = { version: 1, vectorData: 'vectors', renderFeatures: [], nodes: [
    { id: 'w', xy: [0, 1000] }, { id: 'j1', xy: [500, 1000] }, { id: 'k', xy: [1000, 1030] }, { id: 'j2', xy: [1550, 1000] }, { id: 'e', xy: [2000, 1000] },
    { id: 's1', xy: [500, 1400] }, { id: 's2', xy: [1550, 600] }], sources: [
    { id: 'main', osmWayId: '1', kind: 'road', nodes: ['w', 'j1', 'k', 'j2', 'e'], xy, stations, layer: 0, bridge: false, tunnel: false,
      elevation: 'terrain', tags: { highway: 'tertiary', ref: '123' }, render: [], legacyNetIndex: 0 },
    { id: 'side1', osmWayId: '2', kind: 'road', nodes: ['j1', 's1'], xy: [500, 1000, 500, 1400], stations: [0, 400], layer: 0, bridge: false, tunnel: false,
      elevation: 'terrain', tags: { highway: 'track' }, render: [], legacyNetIndex: 1 },
    { id: 'side2', osmWayId: '3', kind: 'road', nodes: ['j2', 's2'], xy: [1550, 1000, 1550, 600], stations: [0, 400], layer: 0, bridge: false, tunnel: false,
      elevation: 'terrain', tags: { highway: 'track' }, render: [], legacyNetIndex: 2 }] };
  const terrain = syntheticTerrain(500, 500, 5, () => 300);
  const base = new ProjectTransportIndex(graph, 'transport', 'vectors', terrain);
  const net = { cls: ['tertiary', 'track'], ways: [[0, ...xy], [1, 500, 1000, 500, 1400], [1, 1550, 1000, 1550, 600]] };
  const project: ProjectDesign = { schemaVersion: 1, scenarioId: 'test', presetId: 'edit', packId: 'test', objectData: 'objects', transportData: 'transport',
    routes: [], corridors: [], connections: [], buildingOverrides: [], mission: { id: 'test', revision: 0, ports: [], connections: [] } };
  return { graph, base, terrain, net, project, stations };
}

describe('rebuilding a mapped road', () => {
  it('rebuilds class I–III ground roads only, with a class-appropriate cross-section', () => {
    const { base, graph, terrain } = fixture();
    expect(rebuildable(base, 'main')).toMatchObject({ ok: true, spec: { legalClass: 'III', crossSection: 'S7.5' } });
    expect(rebuildable(base, 'side1').ok).toBe(false); // a track: no design rules yet
    graph.sources[0].tags.highway = 'trunk';
    expect(rebuildable(new ProjectTransportIndex(graph, 'transport', 'vectors', terrain), 'main').ok).toBe(false);
  });

  it('derives the stretch between the junctions around the grab point, passing a junction right next to it', () => {
    const { base, stations } = fixture();
    expect(derivedStretch(base, 'main', 900, [])).toMatchObject({ s0: stations[1], s1: stations[3] });
    // grabbed 100 m past the first junction: the stretch reaches back to the road's start
    expect(derivedStretch(base, 'main', stations[1] + 100, [])).toMatchObject({ s0: 0, s1: stations[3] });
    // never into another project road's stretch
    const claim = { transportData: 'transport', sourceId: 'main', s0: 0, s1: 800 };
    expect(derivedStretch(base, 'main', 900, [claim])).toMatchObject({ s0: 800, s1: stations[3] });
  });

  it('converts the old line once into bends that follow it, and says how far it strays', () => {
    const { base, stations } = fixture();
    const path = base.path({ transportData: 'transport', sourceId: 'main', s0: 0, s1: stations.at(-1)! });
    const pis = fitBends(path);
    expect(pis).toEqual([{ x: 500, y: 1000, r: null }, { x: 1000, y: 1030, r: null }, { x: 1550, y: 1000, r: null }]);
    expect(fitBends(path, 50)).toEqual([]); // a 30 m kink within tolerance: straight
    expect(strayDistance([{ x: 1000, y: 1000 }], path)).toBeCloseTo(30 * 500 / Math.hypot(500, 30), 6);
  });

  it('engineers the rebuilt stretch without its own old road; Undo is the untouched project', () => {
    const { base, terrain, net, project, stations } = fixture();
    const interval = derivedStretch(base, 'main', 900, [])!;
    const command = rebuildCommand(base, interval, { routeId: 'r', acousticSourceId: 'a' });
    const before = structuredClone(project);
    const p = structuredClone(project); p.routes.push(...command.routes); p.connections.push(...command.connections);
    assertProjectDesign(p);
    const route = p.routes[0];
    expect(route.alignment.kind).toBe('pi');
    expect(route.specification).toMatchObject({ policy: 'legacy-road', legalClass: 'III', crossSection: 'S7.5', operations: { trafficUnknown: true, aadt: 0 } });
    // both ends and both side roads stay joined
    expect(p.connections.map(c => c.ports[1].kind === 'source' && c.ports[1].location.sourceId).sort()).toEqual(['main', 'main', 'side1', 'side2']);
    const roads = new RoadNet(net), ctx = { terrain, scenario: D11_SCENARIO, a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, roads };
    const withLinks = evaluateProjectRoad(ctx, p, 'r', 'objects', { sourceWays: new Map([['main', 0], ['side1', 1], ['side2', 2]]) });
    expect(withLinks.status).toBe('evaluated');
    if (withLinks.status !== 'evaluated') return;
    expect(withLinks.unpriced).toEqual(['source-needs-network', 'traffic-unknown']);
    // its own old road is no crossing of its own, nor a conflict along it
    expect(withLinks.result.crossings.filter(c => c.roadId === 0)).toEqual([]);
    expect(withLinks.result.violations.some(v => /class III road/.test(v.title) && v.s0 > 50 && v.s1 < withLinks.result.length - 50)).toBe(false);
    // without the road links the old stretch cannot be left out: honestly incomplete
    expect(evaluateProjectRoad(ctx, p, 'r', 'objects')).toEqual({ status: 'incomplete', reason: 'source-needs-network' });
    expect(project).toEqual(before);
    expect(stations.length).toBe(5);
  });

  it('moves the stretch ends along the old road, keeping bends inside and the side roads joined', () => {
    const { base, project, stations } = fixture();
    const command = rebuildCommand(base, { transportData: 'transport', sourceId: 'main', s0: 200, s1: 1300 }, { routeId: 'r', acousticSourceId: 'a' });
    const p = structuredClone(project); p.routes.push(...command.routes); p.connections.push(...command.connections);
    const r0 = p.routes[0]; if (r0.alignment.kind !== 'pi' || r0.alignment.vertical.kind !== 'auto') throw new Error('fixture');
    r0.alignment.vertical.pins = [{ s: 500, z: 301 }];
    const longer = moveStretchEnds(base, p, 'r', 100, stations[3] + 200);
    assertProjectDesign(longer);
    const r = longer.routes[0];
    expect(r.source!.intervals[0]).toMatchObject({ s0: 100, s1: stations[3] + 200 });
    expect(r.endpoints.a.position.x).toBeCloseTo(100, 6);
    expect(longer.connections.filter(c => c.id.includes(':branch:')).map(c => (c.ports[1] as { location: { sourceId: string } }).location.sourceId).sort()).toEqual(['side1', 'side2']);
    if (r.alignment.kind !== 'pi' || r.alignment.vertical.kind !== 'auto') throw new Error('kept');
    expect(r.alignment.vertical.pins).toEqual([{ s: 600, z: 301 }]); // shifted with the start
    // the old start lies on straight road (no bend); the old end now turns slightly towards the kept old line
    expect(r.alignment.pis.map(q => Math.round(q.x))).toEqual([500, 1000, 1299]);
    expect(() => moveStretchEnds(base, p, 'r', 500, 520)).toThrow();
  });
});

it('a road net without a stretch keeps every other way index and the rest of the cut way', () => {
  const net = new RoadNet({ cls: ['tertiary'], ways: [[0, 0, 0, 1000, 0], [0, 500, -100, 500, 100]] });
  const cut = net.without([{ way: 0, d0: 300, d1: 700 }]);
  expect(cut.wayClass(1)).toBe('tertiary');
  expect(cut.nearestWay(500, 0, 5)).toBe(1); // only the crossing way remains at x = 500
  expect(cut.nearestWay(100, 0, 5)).toBe(0); // the part before the cut keeps its index
  expect(cut.nearestWay(900, 0, 5)).toBe(2); // the part after is a new way
});
