import { describe, expect, it } from 'vitest';
import type { CrossingPoint, CrossingResult } from '../src/core/crossings';
import type { TransportGraphData } from '../src/core/project-transport';
import { CrossingPicker } from '../src/render/crossing-pick';
import { SourcePicker } from '../src/render/source-pick';
import { lineHalfWidth } from '../src/render/landcover';

const pt = (x: number, y: number, z = 0): CrossingPoint => ({ x, y, z, ground: 0, surface: z ? 'ramp' : 'terrain' });
const project = (x: number, y: number) => ({ sx: x, sy: y, vis: true }); // 1 px per metre, plan view
const base = (roadId: number, s: number, type: CrossingResult['type']): CrossingResult =>
  ({ s, i: 0, x: 0, y: 0, cls: 'service', roadId, h: 0, type, cost: 0 });

describe('crossing picking on the geometry it owns', () => {
  // A junction rebuilding the mapped road y = 0 from x = 0 to 100 (4 m wide, ramp up to 3 m);
  // a reroute: a link along y = 60 from x = 200 to 300 with a 9 m turning disk at its severed start.
  const junction = { ...base(7, 1000, 'junction'), geometry: { width: 4, schematic: false as const, road: [pt(0, 0), pt(50, 0, 3), pt(100, 0)] } };
  const reroute = { ...base(8, 1300, 'reconnection'), geometry: { width: 4, schematic: false as const,
    links: [[pt(200, 60), pt(300, 60)], []] as [CrossingPoint[], CrossingPoint[]], turnarounds: [pt(200, 60)], turnaroundRadius: 9 } };
  const picker = new CrossingPicker(); picker.set([junction, reroute]);
  const at = (x: number, y: number, slack = 3) => picker.at(x, y, x, y, 40, slack, project)?.crossing.roadId ?? null;

  it('hits the junction approach and the reroute link on the drawn width plus slack, not a generous radius', () => {
    expect(at(30, 0)).toBe(7);
    expect(at(30, 2 + 2.9)).toBe(7); // edge of the 4 m road + < 3 px
    expect(at(30, 2 + 3.2)).toBeNull(); // just beyond the slack: empty ground
    expect(at(250, 60)).toBe(8);
    expect(at(250, 66)).toBeNull();
  });
  it('hits the turning head by its disk, and the nearest drawn edge wins', () => {
    expect(at(200, 60 - 11)).toBe(8); // inside 9 m radius + slack, off the link line
    expect(at(200, 60 - 13)).toBeNull();
    const twin = { ...base(9, 1010, 'junction'), geometry: { width: 4, schematic: false as const, road: [pt(0, 8), pt(100, 8)] } };
    const both = new CrossingPicker(); both.set([junction, twin]);
    expect(both.at(50, 3, 50, 3, 40, 3, project)?.crossing.roadId).toBe(7);
    expect(both.at(50, 5, 50, 5, 40, 3, project)?.crossing.roadId).toBe(9);
  });
  it('measures the drawn width across the road in an oblique view, and turning disks on the ground', () => {
    // seen at a grazing angle: y is squeezed tenfold on screen, x is not
    const oblique = (x: number, y: number) => ({ sx: x, sy: y * 0.1, vis: true });
    const along = { ...base(10, 900, 'junction'), geometry: { width: 10, schematic: false as const, road: [pt(0, 0), pt(0, 100)] } };
    const p = new CrossingPicker(); p.set([along]);
    expect(p.at(4, 5, 4, 50, 40, 3, oblique)?.crossing.roadId).toBe(10); // 4 m off the centre of a 10 m road
    expect(p.at(9, 5, 9, 50, 40, 3, oblique)).toBeNull();
    const disk = new CrossingPicker(); disk.set([reroute]);
    expect(disk.at(200, 6.0, 200, 60 - 11, 40, 3, oblique)?.crossing.roadId).toBe(8); // on the disk on the ground
  });
  it('the rest of the mapped road stays the base road: crossing works first, base road beyond them', () => {
    // the same mapped road y = 0 runs on to x = 200 past the junction's rebuilt stretch
    const graph: TransportGraphData = { version: 1, vectorData: 'fixture', nodes: [], sources: [{ id: 'service-road', osmWayId: '1', kind: 'road',
      nodes: ['a', 'b'], xy: [0, 0, 200, 0], stations: [0, 200], layer: 0, bridge: false, tunnel: false, tags: {}, elevation: 'terrain',
      render: [{ sourceId: 'service-road', featureId: 'f', s0: 0, s1: 200, width: 4, correspondence: [{ sourceS: 0, renderS: 0 }, { sourceS: 200, renderS: 200 }] }] }],
      renderFeatures: [{ id: 'f', layer: 'service', polylineIndex: 0 }] };
    const sources = new SourcePicker(graph, { chunk: 2500, polys: [], lines: [{ name: 'service', verts: Float32Array.of(0, 0, 200, 0), starts: Uint32Array.of(0, 2) }], buildings: null },
      (layer, res) => lineHalfWidth(layer, res));
    const click = (x: number) => at(x, 1) !== null ? 'crossing' : sources.at(x, 1, x, 1, 40, 3, project) ? 'base road' : null;
    expect(click(60)).toBe('crossing');
    expect(click(150)).toBe('base road');
  });
  it('a mapped road is picked on its drawn width across it, however the view foreshortens it', () => {
    // a 10 m wide band (half 5 m) along y = 0, seen from an oblique camera: 1 px per metre along x, 0.4 across
    const graph: TransportGraphData = { version: 1, vectorData: 'fixture', nodes: [], sources: [{ id: 'road', osmWayId: '3', kind: 'road',
      nodes: ['a', 'b'], xy: [0, 0, 200, 0], stations: [0, 200], layer: 0, bridge: false, tunnel: false, tags: {}, elevation: 'terrain',
      render: [{ sourceId: 'road', featureId: 'f', s0: 0, s1: 200, width: 10, correspondence: [{ sourceS: 0, renderS: 0 }, { sourceS: 200, renderS: 200 }] }] }],
      renderFeatures: [{ id: 'f', layer: 'service', polylineIndex: 0 }] };
    const sources = new SourcePicker(graph, { chunk: 2500, polys: [], lines: [{ name: 'service', verts: Float32Array.of(0, 0, 200, 0), starts: Uint32Array.of(0, 2) }], buildings: null },
      () => 5);
    const flat = (x: number, y: number) => ({ sx: x, sy: 0.4 * y, vis: true });
    // the band is 2 px either side of the line on the screen; with 1 px of slack a click 2.9 px off picks, 3.1 px does not
    expect(sources.at(100, 2.9, 100, 7.25, 40, 1, flat)).not.toBeNull();
    expect(sources.at(100, 3.1, 100, 7.75, 40, 1, flat)).toBeNull();
  });
  it('a long mapped segment is picked where it is drawn, draped over the ground under it, not on its straight chord', () => {
    // a 400 m railway segment over a 6 m high spur: in an oblique view the drawn line bulges 30 px up
    const graph: TransportGraphData = { version: 1, vectorData: 'fixture', nodes: [], sources: [{ id: 'rail', osmWayId: '2', kind: 'railway',
      nodes: ['a', 'b'], xy: [0, 0, 400, 0], stations: [0, 400], layer: 0, bridge: false, tunnel: false, tags: {}, elevation: 'terrain',
      render: [{ sourceId: 'rail', featureId: 'r', s0: 0, s1: 400, width: 3, correspondence: [{ sourceS: 0, renderS: 0 }, { sourceS: 400, renderS: 400 }] }] }],
      renderFeatures: [{ id: 'r', layer: 'rail', polylineIndex: 0 }] } as unknown as TransportGraphData;
    const sources = new SourcePicker(graph, { chunk: 2500, polys: [], lines: [{ name: 'rail', verts: Float32Array.of(0, 0, 400, 0), starts: Uint32Array.of(0, 2) }], buildings: null });
    const ground = (x: number) => 6 * Math.sin(Math.PI * x / 400);
    const view = (x: number, y: number) => ({ sx: x, sy: -y - 5 * ground(x), vis: true });
    expect(sources.at(200, -30, 200, 0, 40, 3, view)?.sourceId).toBe('rail');
    expect(sources.at(200, 0, 200, 0, 40, 3, view)).toBeNull();
  });
});
