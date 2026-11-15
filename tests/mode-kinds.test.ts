import { describe, expect, it } from 'vitest';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { ProjectTransportIndex } from '../src/core/project-network';
import type { ProjectDesign } from '../src/core/project';
import type { TransportGraphData } from '../src/core/project-transport';
import { evaluateProject, type ProjectEvalContext } from '../src/core/project-evaluate';
import { assertProjectDesign } from '../src/core/project-validation';
import { RAIL_CROSSING_BIT, syntheticTerrain } from '../src/core/terrain';
import { buildInProject } from '../src/ui/route-kinds';
import { MOTORWAY_BUILD, RAIL_BUILD, RAIL_LINE } from '../src/ui/mode-kinds';

// A 3 km mapped railway along y = 1000 (a gentle bend at x = 1500) with a yard track, and a road.
function fixture() {
  const xy = [0, 1000, 1500, 1060, 3000, 1000], stations = [0, Math.hypot(1500, 60), 2 * Math.hypot(1500, 60)];
  const graph: TransportGraphData = { version: 1, vectorData: 'vectors', renderFeatures: [], nodes: [
    { id: 'w', xy: [0, 1000] }, { id: 'm', xy: [1500, 1060] }, { id: 'e', xy: [3000, 1000] }, { id: 'y1', xy: [200, 1020] }, { id: 'y2', xy: [600, 1020] },
    { id: 'r1', xy: [0, 400] }, { id: 'r2', xy: [3000, 400] }], sources: [
    { id: 'line', osmWayId: '1', kind: 'railway', nodes: ['w', 'm', 'e'], xy, stations, layer: 0, bridge: false, tunnel: false, elevation: 'terrain', tags: { railway: 'rail', ref: '043' }, render: [] },
    { id: 'yard', osmWayId: '2', kind: 'railway', nodes: ['y1', 'y2'], xy: [200, 1020, 600, 1020], stations: [0, 400], layer: 0, bridge: false, tunnel: false, elevation: 'terrain', tags: { railway: 'rail', service: 'yard' }, render: [] },
    { id: 'road', osmWayId: '3', kind: 'road', nodes: ['r1', 'r2'], xy: [0, 400, 3000, 400], stations: [0, 3000], layer: 0, bridge: false, tunnel: false, elevation: 'terrain', tags: { highway: 'tertiary' }, render: [] }] };
  const terrain = syntheticTerrain(700, 400, 5, () => 300), H = terrain.ny * terrain.cell, lc = terrain.lc as Uint8Array;
  for (let k = 0; k + 3 < xy.length; k += 2) for (let t = 0; t <= 1; t += 0.001) {
    const x = xy[k] + (xy[k + 2] - xy[k]) * t, y = xy[k + 1] + (xy[k + 3] - xy[k + 1]) * t;
    lc[Math.floor((H - y) / 5) * terrain.nx + Math.floor(x / 5)] |= RAIL_CROSSING_BIT;
  }
  const base = new ProjectTransportIndex(graph, 'transport', 'vectors', terrain);
  const project: ProjectDesign = { schemaVersion: 1, scenarioId: 'test', presetId: 'edit', packId: 'test', objectData: 'objects', transportData: 'transport',
    routes: [], corridors: [], connections: [], buildingOverrides: [], mission: { id: 'test', revision: 0, ports: [], connections: [] } };
  const ctx: ProjectEvalContext = { legacy: { terrain, scenario: D11_SCENARIO, a: { x: 0, y: 0 }, b: { x: 1, y: 1 } },
    environment: { objectData: 'objects', transportData: 'transport', terrainData: 't', pricingData: 'p', waterData: 'w', terrainClass: 'hilly' },
    railPaths: new Map(graph.sources.filter(s => s.kind === 'railway').map(s => [s.id, { xy: s.xy, stations: s.stations }])) };
  return { base, project, ctx, stations };
}
let n = 0;
const newId = (prefix: string) => `${prefix}:${++n}`;
const free = (x: number, y: number) => ({ position: { x, y, z: 300 }, anchor: { kind: 'free' as const } });

describe('Build → Motorway / Railway', () => {
  it('a motorway is one corridor with its two directions, engineered and shown, unpriced without interchanges', () => {
    const { project, ctx } = fixture();
    const made = buildInProject(MOTORWAY_BUILD, project, free(300, 1800), free(2700, 1800), newId);
    assertProjectDesign(made.project);
    expect(made.project.corridors).toHaveLength(1);
    expect(made.project.routes.map(r => r.kind)).toEqual(['motorway', 'motorway']);
    const result = evaluateProject(ctx, { epoch: 'e', revision: 1, design: made.project });
    expect(result.routes[made.activeRouteId].legacy?.length).toBeGreaterThan(2000);
    expect(result.cost.unpriced.map(u => u.reason)).toContain('motorway-needs-interchange');
    expect(MOTORWAY_BUILD.onSource(fixture().base, 'road', 100).ok).toBe(false);
  });
  it('a railway ends on a mapped railway or open ground, never on a road', () => {
    const { base, project } = fixture();
    expect(RAIL_BUILD.onSource(base, 'road', 100).ok).toBe(false);
    const a = RAIL_BUILD.onSource(base, 'line', 100);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const made = buildInProject(RAIL_BUILD, project, a.end, free(2000, 1800), newId);
    assertProjectDesign(made.project);
    expect(made.project.routes[0]).toMatchObject({ kind: 'railway', role: 'auxiliary', specification: { tracks: 1, designSpeed: 120 } });
  });
});

describe('rebuilding a mapped railway (drag-to-rebuild with the railway kind)', () => {
  it('rebuilds running lines only, as an editable railway that takes up its old track', () => {
    const { base, project, ctx, stations } = fixture();
    expect(RAIL_LINE.rebuildable(base, 'road')).toBeNull();
    expect(RAIL_LINE.rebuildable(base, 'yard')?.ok).toBe(false);
    expect(RAIL_LINE.rebuildable(base, 'line')).toMatchObject({ ok: true });
    const interval = { transportData: 'transport', sourceId: 'line', s0: 0, s1: stations[2] };
    const command = RAIL_LINE.rebuild(base, interval, { routeId: 'route:rail', acousticSourceId: 'acoustic:rail' });
    const design = { ...project, routes: command.routes, connections: command.connections };
    assertProjectDesign(design);
    const result = evaluateProject(ctx, { epoch: 'e', revision: 1, design }), r = result.routes['route:rail'].legacy!;
    // its old track is no obstacle (the new line's curves leave it), but taking it up is not priced yet
    expect(r.violations.filter(v => /railway/i.test(v.title))).toEqual([]);
    expect(result.cost.unpriced.map(u => u.reason)).toEqual(['track-removal-unpriced']);
    // its ends move along the old line in one edit
    const moved = RAIL_LINE.moveEnds(base, design, 'route:rail', 300, stations[2]);
    assertProjectDesign(moved);
    expect(moved.routes[0].source!.intervals[0].s0).toBe(300);
  });
});
