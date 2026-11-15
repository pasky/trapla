import { expect, it } from 'vitest';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { referenceRoadSurface } from '../src/core/project-evaluate';
import { EffectiveProjectNetwork, ProjectSurfaceIndex, ProjectTransportIndex, projectNetworkViews } from '../src/core/project-network';
import { assessReplacementConnections, promoteGroundRoad } from '../src/core/project-promotion';
import type { ProjectDesign, RoadSpec, SourceInterval } from '../src/core/project';
import type { TransportGraphData } from '../src/core/project-transport';
import { syntheticTerrain } from '../src/core/terrain';
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
  const base = new ProjectTransportIndex(graph, 'transport', 'vectors', (x, y) => terrain.heightAt(x, y));
  const ctx = { terrain, scenario: D11_SCENARIO, a: { x: 50, y: 100 }, b: { x: 250, y: 100 } };
  const interval: SourceInterval = { transportData: 'transport', sourceId: 'main', s0: 25, s1: 175 };
  const project: ProjectDesign = { schemaVersion: 1, scenarioId: 'test', presetId: 'network', packId: 'test', objectData: 'objects', transportData: 'transport',
    routes: [], corridors: [], connections: [], buildingOverrides: [], mission: { id: 'test', revision: 0, ports: [], connections: [] } };
  const command = () => promoteGroundRoad(base, { routeId: 'rebuilt', acousticSourceId: 'physical-main', interval, specification, name: 'Track' });
  return { graph, base, ctx, interval, project, command };
}
const bounds = { minX: 0, minY: 0, maxX: 300, maxY: 300 };
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
});
