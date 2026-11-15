import { expect, it } from 'vitest';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { referenceRoadSurface } from '../src/core/project-evaluate';
import { EffectiveProjectNetwork, ProjectSurfaceIndex, ProjectTransportIndex, projectNetworkViews } from '../src/core/project-network';
import { assessReplacementConnections, groundRoadSourceInfo, promoteGroundRoad } from '../src/core/project-promotion';
import type { ProjectDesign, RoadSpec, SourceInterval } from '../src/core/project';
import type { TransportGraphData } from '../src/core/project-transport';
import { syntheticTerrain } from '../src/core/terrain';
import { assertProjectDesign } from '../src/core/project-validation';
import { openProjectStore } from '../src/project-store';

const specification: RoadSpec = { kind: 'road', policy: 'existing-ground', legalClass: 'track', crossSection: 'existing', existingWidth: 4,
  designSpeed: 30, operations: { aadt: 20, heavyShare: 0, speed: 20, speedPolicy: 'independent' } };
function fixture() {
  const graph: TransportGraphData = { version: 1, vectorData: 'vectors', nodes: [
    { id: 'a', xy: [50, 100] }, { id: 'junction', xy: [150, 100] }, { id: 'b', xy: [250, 100] }, { id: 'branch-end', xy: [150, 200] },
    { id: 'cross-a', xy: [150, 50] }, { id: 'cross-middle', xy: [150, 100] }, { id: 'cross-b', xy: [150, 250] }],
    renderFeatures: [{ id: 'main-drawing', layer: 'track', polylineIndex: 0 }], sources: [
      { id: 'main', osmWayId: '1', kind: 'road', nodes: ['a', 'junction', 'b'], xy: [50, 100, 150, 100, 250, 100], stations: [0, 100, 200],
        layer: 0, bridge: false, tunnel: false, elevation: 'terrain', tags: { highway: 'track' }, render: [{ featureId: 'main-drawing', sourceId: 'main',
          s0: 0, s1: 200, width: 4, correspondence: [{ sourceS: 0, renderS: 200 }, { sourceS: 200, renderS: 0 }] }] },
      { id: 'branch', osmWayId: '2', kind: 'road', nodes: ['junction', 'branch-end'], xy: [150, 100, 150, 200], stations: [0, 100],
        layer: 0, bridge: false, tunnel: false, elevation: 'terrain', tags: { highway: 'track' }, render: [] },
      { id: 'cross', osmWayId: '3', kind: 'road', nodes: ['cross-a', 'cross-middle', 'cross-b'], xy: [150, 50, 150, 100, 150, 250], stations: [0, 50, 200],
        layer: 1, bridge: true, tunnel: false, elevation: 'unknown', tags: { highway: 'service' }, render: [] }],
    unresolvedSources: [{ id: 'conflict', osmWayId: '4', kind: 'road', reason: 'conflicting-snapshots', renderFeatureIds: ['main-drawing'] }] };
  const terrain = syntheticTerrain(100, 80, 5, () => 100);
  const base = new ProjectTransportIndex(graph, 'transport', 'vectors', terrain);
  const ctx = { terrain, scenario: D11_SCENARIO, a: { x: 50, y: 100 }, b: { x: 250, y: 100 } };
  const interval: SourceInterval = { transportData: 'transport', sourceId: 'main', s0: 25, s1: 175 };
  const project: ProjectDesign = { schemaVersion: 1, scenarioId: 'test', presetId: 'network', packId: 'test', objectData: 'objects', transportData: 'transport',
    routes: [], corridors: [], connections: [], buildingOverrides: [], mission: { id: 'test', revision: 0, ports: [], connections: [] } };
  const command = () => promoteGroundRoad(base, { routeId: 'rebuilt', acousticSourceId: 'physical-main', interval, specification, name: 'Track' });
  return { graph, base, ctx, interval, project, command };
}
const bounds = { minX: 0, minY: 0, maxX: 300, maxY: 300 };
it('reads numeric tagged speed without inventing a speed for symbolic or missing tags', () => {
  const { graph, ctx } = fixture();
  for (const [tag, expected] of [['70', 70], ['12.5', 12.5], [' CZ:urban ', null], ['30 mph', null], [undefined, null]] as const) {
    graph.sources[0].tags.maxspeed = tag;
    const base = new ProjectTransportIndex(graph, 'transport', 'vectors', ctx.terrain);
    expect(groundRoadSourceInfo(base, 'main').taggedSpeed).toBe(expected);
  }
});

it('promotes only the bounded source, preserves true branches and exact geometry, and undo/reload keeps identities', () => {
  const { base, ctx, interval, project, command } = fixture();
  expect(base.branches(interval).map(b => b.other.map(o => o.sourceId))).toEqual([['branch']]); // same XY is NOT a junction
  const values = new Map<string, string>();
  const options = { storage: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } },
    namespace: { scenarioId: 'test', presetId: 'network' }, objectData: 'objects', transportData: 'transport', pricingData: 'pricing',
    mission: project.mission, initial: () => project, epoch: 'first' };
  const store = openProjectStore(options).store!;
  store.dispatch(command());
  expect(store.snapshot.design.routes[0].alignment.kind).toBe('reference');
  expect(store.snapshot.design.connections).toHaveLength(3);
  const surfaces = store.snapshot.design.routes.map(r => referenceRoadSurface(ctx, r)!);
  expect(assessReplacementConnections(base, store.snapshot.design, surfaces).failures).toEqual([]);
  store.undo(); expect(store.snapshot.design.routes).toHaveLength(0); expect(store.snapshot.design.connections).toHaveLength(0);
  store.redo(); expect(store.snapshot.design.routes[0].acousticSourceId).toBe('physical-main');
  expect(openProjectStore({ ...options, epoch: 'reload' }).store!.snapshot.design).toEqual(store.snapshot.design);
});

it('keeps candidate exclusion separate from accepted ownership and preserves crossing sources on the same pixels', () => {
  const { base, ctx, interval, project, command } = fixture(), c = command();
  project.routes = c.routes; project.connections = c.connections;
  const surfaces = project.routes.map(r => referenceRoadSurface(ctx, r)!);
  const views = projectNetworkViews(base, project, surfaces, [], []);
  const candidate: string[] = [], accepted: string[] = [];
  views.candidate.nearSources(bounds, s => candidate.push(`${s.sourceId}:${s.s0}:${s.s1}`));
  views.accepted.nearSources(bounds, s => accepted.push(`${s.sourceId}:${s.s0}:${s.s1}`));
  expect(candidate.filter(s => s.startsWith('main:')).sort()).toEqual(['main:0:25', 'main:175:200']);
  expect(candidate.filter(s => s.startsWith('cross:'))).toHaveLength(2);
  expect(candidate.filter(s => s.startsWith('branch:'))).toHaveLength(1);
  expect(accepted.filter(s => s.startsWith('main:'))).toHaveLength(2);
  expect(base.renderIntervals(interval)[0].correspondence).toEqual([{ sourceS: 25, renderS: 175 }, { sourceS: 175, renderS: 25 }]);
  const unchanged: string[] = []; new EffectiveProjectNetwork(base, [], []).nearSources(bounds, s => unchanged.push(s.sourceId));
  expect(unchanged).toContain('main');
});

it('checks reconnection against the proposed designed elevation, not terrain or the old accepted counterpart', () => {
  const { base, ctx, project, command } = fixture(), c = command();
  project.routes = c.routes; project.connections = c.connections;
  const other = structuredClone(c.routes[0]); other.id = 'other'; other.source = undefined; other.acousticSourceId = 'physical-other';
  other.endpoints = { a: { position: { x: 225, y: 100, z: 100 }, binding: 'resolved', anchor: { kind: 'free' } },
    b: { position: { x: 225, y: 200, z: 100 }, binding: 'resolved', anchor: { kind: 'free' } } };
  other.alignment = { kind: 'reference', provenance: 'imported', vertical: { kind: 'reference' }, controls: {},
    path: [{ x: 225, y: 100, s: 0, elevation: { kind: 'ground' } }, { x: 225, y: 200, s: 100, elevation: { kind: 'ground' } }] };
  project.routes.push(other);
  project.routes[0].endpoints.b.anchor = { kind: 'route', routeId: 'other', s: 0 };
  project.connections.push({ id: 'join-designed', revision: 0, kind: 'junction', position: { x: 225, y: 100, z: 100 },
    ports: [{ kind: 'route', routeId: 'rebuilt', s: 150 }, { kind: 'route', routeId: 'other', s: 0 }] });
  const surfaces = project.routes.map(r => referenceRoadSurface(ctx, r)!);
  expect(assessReplacementConnections(base, project, surfaces).failures).toEqual([]);
  project.connections = project.connections.filter(c => c.id !== 'join-designed');
  other.revision++; // Endpoint anchor alone is still a dependency, even without an explicit join row.
  expect(assessReplacementConnections(base, project, surfaces).feasibleIntervals).toEqual([]);
  other.revision--;
  const raised = structuredClone(surfaces); raised[1].points.forEach(p => { p.z += 5; });
  const views = projectNetworkViews(base, project, raised, [], surfaces);
  expect(views.candidate.surfaces.position('other', 0)?.z).toBe(105);
  expect(views.accepted.surfaces.position('other', 0)?.z).toBe(100);
  expect(assessReplacementConnections(base, project, raised).failures.some(f => f.routeId === 'rebuilt' && f.reason.includes('meet'))).toBe(true);
  expect(ctx.terrain.heightAt(225, 100)).toBe(100);
  const byWidth: string[] = []; new ProjectSurfaceIndex(surfaces).near({ minX: 223, maxX: 223.5, minY: 150, maxY: 151 }, s => byWidth.push(s.routeId));
  expect(byWidth).toContain('other');
});

it('rejects lost branches, conflicting claims, unknown bridge heights and conflicted legacy snapshots', () => {
  const { base, ctx, interval, project, command } = fixture(), c = command();
  project.routes = c.routes; project.connections = c.connections.filter(c => !c.id.includes(':branch:'));
  expect(assessReplacementConnections(base, project, project.routes.map(r => referenceRoadSurface(ctx, r)!)).failures)
    .toEqual(expect.arrayContaining([expect.objectContaining({ reason: 'lost-source-connection' })]));
  const duplicate = structuredClone(c.routes[0]); duplicate.id = 'duplicate'; project.routes.push(duplicate);
  expect(assessReplacementConnections(base, project, project.routes.map(r => referenceRoadSurface(ctx, r)!)).feasibleIntervals).toEqual([]);
  expect(base.position('cross', 50)).toBeNull();
  expect(() => promoteGroundRoad(base, { routeId: 'bad', acousticSourceId: 'bad', specification, name: 'Road',
    interval: { ...interval, sourceId: 'cross' } })).toThrow('supported ground road');
  expect(() => promoteGroundRoad(base, { routeId: 'bad', acousticSourceId: 'bad', specification, name: 'Road',
    interval: { ...interval, sourceId: 'conflict' } })).toThrow('conflicting-snapshots');
  expect(() => base.path({ ...interval, s1: 201 })).toThrow('binding');
  const full = promoteGroundRoad(base, { routeId: 'full', acousticSourceId: 'physical', specification, name: 'Track',
    interval: { ...interval, s0: 0, s1: 200 } });
  project.routes = full.routes; project.connections = full.connections;
  for (const c of project.connections) for (const p of c.ports) if (p.kind === 'source' && p.location.sourceId === 'main') p.location.transportData = 'FOREIGN';
  const assessment = assessReplacementConnections(base, project, project.routes.map(r => referenceRoadSurface(ctx, r)!));
  expect(assessment.feasibleIntervals).toEqual([]);
  expect(assessment.failures.some(f => f.reason === 'connection-does-not-meet')).toBe(true);
});

it('retains different station occurrences of the same source node and gives closed-way contacts distinct identities', () => {
  const { graph, ctx, interval, project } = fixture(), main = graph.sources[0];
  graph.nodes.push({ id: 'c', xy: [150, 150] }, { id: 'd', xy: [200, 150] });
  main.nodes = ['a', 'junction', 'c', 'd', 'junction', 'b'];
  main.xy = [50, 100, 150, 100, 150, 150, 200, 150, 150, 100, 250, 100];
  main.stations = [0];
  for (let i = 2; i < main.xy.length; i += 2) main.stations.push(main.stations[main.stations.length - 1]
    + Math.hypot(main.xy[i] - main.xy[i - 2], main.xy[i + 1] - main.xy[i - 1]));
  main.render = [];
  let base = new ProjectTransportIndex(graph, 'transport', 'vectors', ctx.terrain);
  const branches = base.branches({ ...interval, s0: 90, s1: 110 });
  expect(branches[0].other).toContainEqual({ transportData: 'transport', sourceId: 'main', s: main.stations[4] });
  graph.sources = [main, graph.sources[1]];
  main.nodes = ['a', 'junction', 'c', 'd', 'a']; main.xy = [50, 100, 150, 100, 150, 150, 200, 150, 50, 100];
  main.stations = [0];
  for (let i = 2; i < main.xy.length; i += 2) main.stations.push(main.stations[main.stations.length - 1]
    + Math.hypot(main.xy[i] - main.xy[i - 2], main.xy[i + 1] - main.xy[i - 1]));
  graph.sources[1].nodes = ['a', 'branch-end']; graph.sources[1].xy = [50, 100, 150, 200]; graph.sources[1].stations = [0, Math.hypot(100, 100)];
  base = new ProjectTransportIndex(graph, 'transport', 'vectors', ctx.terrain);
  const command = promoteGroundRoad(base, { routeId: 'loop', acousticSourceId: 'physical-loop', specification, name: 'Track',
    interval: { ...interval, s0: 0, s1: main.stations[main.stations.length - 1] } });
  expect(new Set(command.connections.map(c => c.id)).size).toBe(command.connections.length);
  project.routes = command.routes; project.connections = command.connections;
  expect(() => assertProjectDesign(project)).not.toThrow();
});

it('finds inclusive corner contacts in either diagonal direction and rejects unsafe grid coordinates promptly', () => {
  for (const xy of [[50, 150, 150, 50], [150, 50, 50, 150], [50, 50, 150, 150], [150, 150, 50, 50]]) {
    const { graph } = fixture();
    graph.nodes = [{ id: 'a', xy: [xy[0], xy[1]] }, { id: 'b', xy: [xy[2], xy[3]] }];
    graph.sources = [{ ...graph.sources[0], nodes: ['a', 'b'], xy, stations: [0, Math.hypot(xy[2] - xy[0], xy[3] - xy[1])], render: [] }];
    const base = new ProjectTransportIndex(graph, 'transport', 'vectors', { heightAt: () => 100, isOob: () => false }), found: string[] = [];
    base.near({ minX: 100, maxX: 100, minY: 100, maxY: 100 }, s => found.push(s.sourceId));
    expect(found).toEqual(['main']);
    expect(() => base.near({ minX: 1e20, maxX: 1e20, minY: 0, maxY: 0 }, () => {})).toThrow('Unsafe');
  }
  expect(() => new ProjectSurfaceIndex([{ routeId: 'huge', revision: 0, points: [
    { s: 0, x: 1e20, y: 0, z: 100, halfWidth: 2, structure: 'ground' },
    { s: 100, x: 1e20, y: 100, z: 100, halfWidth: 2, structure: 'ground' },
  ] }])).toThrow('Unsafe');
});

it('treats a source anchor inside another replacement as stale, and never drapes source roads over unknown terrain', () => {
  const { base, ctx, project, command } = fixture(), c = command();
  project.routes = c.routes; project.connections = c.connections;
  const spur = structuredClone(c.routes[0]); spur.id = 'spur'; spur.source = undefined; spur.acousticSourceId = 'physical-spur';
  spur.endpoints = { a: { position: { x: 100, y: 100, z: 100 }, binding: 'resolved',
    anchor: { kind: 'source', location: { transportData: 'transport', sourceId: 'main', s: 50 } } },
  b: { position: { x: 100, y: 200, z: 100 }, binding: 'resolved', anchor: { kind: 'free' } } };
  spur.alignment = { kind: 'reference', provenance: 'imported', vertical: { kind: 'reference' }, controls: {},
    path: [{ x: 100, y: 100, s: 0, elevation: { kind: 'ground' } }, { x: 100, y: 200, s: 100, elevation: { kind: 'ground' } }] };
  project.routes.push(spur);
  const surfaces = () => project.routes.map(r => referenceRoadSurface(ctx, r)!);
  // The old ground road still lies at this XYZ, but route 'rebuilt' owns and replaces it here.
  const stale = assessReplacementConnections(base, project, surfaces());
  expect(stale.failures).toContainEqual(expect.objectContaining({ routeId: 'spur', reason: 'source-endpoint-replaced' }));
  expect(stale.feasibleIntervals).toEqual([]);
  spur.endpoints.a.anchor = { kind: 'source', location: { transportData: 'transport', sourceId: 'main', s: 10 } };
  spur.endpoints.a.position = { x: 60, y: 100, z: 100 }; spur.alignment.kind === 'reference' && (spur.alignment.path[0].x = 60);
  expect(assessReplacementConnections(base, project, surfaces()).failures).toEqual([]); // retained stretch is still authoritative

  const { graph } = fixture();
  const edge = new ProjectTransportIndex(graph, 'transport', 'vectors', { heightAt: () => 100, isOob: x => x > 200 });
  expect(edge.position('main', 100)?.z).toBe(100);
  expect(edge.position('main', 190)).toBeNull(); // display-filled height outside data is not ground
  expect(() => edge.path({ transportData: 'transport', sourceId: 'main', s0: 100, s1: 190 })).toThrow('unresolved');
});
