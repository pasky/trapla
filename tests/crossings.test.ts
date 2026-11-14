import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { auditCrossingGeometry, buildCrossingGeometry, crossingPlanLength, crossingBridgeMask, normalizeCrossingOverrides, resolveCrossings,
  type CrossingOverride, type CrossingResult, type CrossingRoute } from '../src/core/crossings';
import { RoadNet, mergeCrossings, type RoadCrossing } from '../src/core/roadnet';
import { ROAD_CLASSES } from '../src/core/data/urban';
import { chooseStructures, KIND } from '../src/core/structures';
import { CrossingRenderer } from '../src/render/crossings';
import type { View } from '../src/render/view';

const cross = (roadId: number, s: number, cls = 'primary', h = 0, i = 0): CrossingResult =>
  ({ roadId, s, cls, h, i, x: s, y: 0, type: 'atGrade', cost: 0 });
const resolve = (cs: CrossingResult[], overrides: CrossingOverride[] = [], kind = [KIND.earth] as number[], urban = [0]) =>
  resolveCrossings(cs, 9000, kind, [30, 30, 30], urban, urban, overrides);

describe('explicit crossing choices (automatic policy already covered in town.test)', () => {
  it('normalizes persisted choices by pack way, keeps the last edit, and rejects malformed entries', () => {
    expect(normalizeCrossingOverrides([{ roadId: 5, type: 'junction' }, { roadId: 1, type: 'bridge' },
      { roadId: 5, type: 'reconnection' }, { roadId: -1, type: 'bridge' }, { roadId: 0.5, type: 'bridge' },
      { roadId: 4, type: 'free' }, null])).toEqual([{ roadId: 1, type: 'bridge' }, { roadId: 5, type: 'reconnection' }]);
    expect(normalizeCrossingOverrides({})).toEqual([]);
  });

  it('preserves selected raw hits through billing merge, including a second hit and endpoint spacing', () => {
    const raw: RoadCrossing[] = [
      { way: 3, s: 100, x: 100, y: 0, cls: 'primary' },
      { way: 2, s: 3000, x: 3000, y: 0, cls: 'primary' },
      { way: 3, s: 3010, x: 3010, y: 0, cls: 'secondary' },
      { way: 3, s: 3050, x: 3050, y: 0, cls: 'secondary' },
    ];
    expect(mergeCrossings(raw, 9000).map(c => c.s)).toEqual([3000]);
    expect(mergeCrossings(raw, 9000, undefined, new Set([3])).map(c => [c.way, c.s]))
      .toEqual([[3, 100], [2, 3000], [3, 3010], [3, 3050]]);
  });

  it('reserves a chosen lower-class junction before automatic higher-class candidates and restores Auto', () => {
    const cs = [cross(1, 3000), cross(2, 4000, 'secondary')];
    expect(resolve(cs, [{ roadId: 2, type: 'junction' }])).toEqual([]);
    expect(cs[1].type).toBe('junction'); expect(cs[0].type).not.toBe('junction');
    resolve(cs);
    expect(cs[0].type).toBe('junction'); expect(cs[1].type).not.toBe('junction');
    expect(cs[1].requestedType).toBeUndefined(); expect(cs[1].issues).toBeUndefined();
  });

  it('keeps invalid choices priced with numeric spacing diagnostics at A, B and another manual junction', () => {
    const cs = [cross(1, 1499), cross(2, 7501), cross(3, 3500), cross(4, 4999)];
    const issues = resolve(cs, cs.map(c => ({ roadId: c.roadId!, type: 'junction' })));
    expect(issues.map(v => [v.crossing.code, v.crossing.actual, v.crossing.targetS]))
      .toEqual([['spacing', 1499, 0], ['spacing', 1499, 3500], ['spacing', 1499, 9000]]);
    expect(cs.every(c => c.type === 'junction' && c.cost > 0)).toBe(true);
    expect(issues.every(v => v.fix.includes('1500') && v.kind === 'crossing')).toBe(true);
  });

  it('allows explicit local junctions while rejecting motorway access, vertical gaps and conflicting structures', () => {
    for (const cls of ['residential', 'living_street', 'unclassified', 'service', 'track']) {
      const c = cross(1, 3000, cls);
      resolve([c]); expect(c.type).not.toBe('junction');
      expect(resolve([c], [{ roadId: 1, type: 'junction' }])).toEqual([]);
      expect(c.type).toBe('junction'); expect(c.cost).toBeGreaterThan(0);
    }
    for (const [cls, h, kind, code] of [
      ['motorway', 0, KIND.earth, 'class'],
      ['primary', 8, KIND.earth, 'clearance'], ['primary', -8, KIND.earth, 'depth'],
      ['primary', 0, KIND.bridge, 'structure'], ['primary', -20, KIND.tunnel, 'structure'],
    ] as const) {
      const c = cross(1, 3000, cls, h);
      expect(resolve([c], [{ roadId: 1, type: 'junction' }], [kind]).map(v => v.crossing.code)).toContain(code);
      expect(c.type).toBe('junction'); expect(c.cost).toBeGreaterThan(0);
    }
  });

  it('validates all requested bridge hits and motorway clearance, while the main-road bill owns their cost', () => {
    const cs = [cross(1, 3000, 'primary', 7), cross(1, 3050, 'primary', 4), cross(2, 5000, 'motorway', 7)];
    const issues = resolve(cs, [{ roadId: 1, type: 'bridge' }, { roadId: 2, type: 'bridge' }], [KIND.bridge]);
    expect(issues.map(v => [v.s0, v.crossing.required])).toEqual([[5000, 7.5], [3050, 6]]);
    expect(cs.every(c => c.type === 'bridge' && c.cost === 0)).toBe(true);
  });

  it('uses Auto overbridge approaches for ordinary roads but requires depth below fixed-level motorways', () => {
    const auto = cross(1, 4000, 'residential', -8), manual = { ...auto };
    resolve([auto]); expect(resolve([manual], [{ roadId: 1, type: 'overbridge' }])).toEqual([]);
    expect(manual.cost).toBe(auto.cost); expect(manual.span).toBe(auto.span);
    const shallow = cross(2, 4000, 'residential', -2);
    expect(resolve([shallow], [{ roadId: 2, type: 'overbridge' }])).toEqual([]);
    const motorway = cross(3, 4000, 'motorway', -2);
    expect(resolve([motorway], [{ roadId: 3, type: 'overbridge' }]).map(v => v.crossing.code)).toEqual(['depth']);
    expect(shallow.approachLength).toBeGreaterThan(0); expect(shallow.cost).toBeGreaterThan(manual.cost);
  });

  it('uses the same link price and service allowance as Auto, and never caps unreachable choices', () => {
    const cs = [cross(1, 3000), cross(2, 3100, 'service')];
    resolve(cs); const autoCost = cs[1].cost;
    expect(resolve(cs, [{ roadId: 2, type: 'reconnection' }])).toEqual([]);
    expect(cs[1].cost).toBe(autoCost); expect(cs[1].targetS).toBe(3000);
    const far = cross(3, 4000, 'residential');
    const issues = resolve([far], [{ roadId: 3, type: 'reconnection' }]);
    expect(issues[0].crossing).toMatchObject({ code: 'reach', actual: 4000, required: 750 });
    expect(far.linkLength).toBe(8000); expect(far.type).toBe('reconnection');
  });

  it('does not let another street anchor to an invalid motorway reconnection', () => {
    const cs = [cross(1, 3000), cross(2, 3200, 'motorway'), cross(3, 3250, 'residential')];
    resolve(cs, [{ roadId: 2, type: 'reconnection' }]);
    expect(cs[1].issues?.some(v => v.crossing.code === 'class')).toBe(true);
    expect(cs[2].targetS).toBe(3000);
  });

  it('paints only bridge spans, preserving other automatic structures and unrelated manual paint', () => {
    const s = Float64Array.from({ length: 101 }, (_, i) => i * 10);
    const raw = [{ way: 4, s: 250, x: 250, y: 0, cls: 'primary' }];
    const base = new Int8Array(101).fill(-1); base.fill(KIND.earth, 20, 31); base.fill(KIND.tunnel, 70, 100);
    const mask = crossingBridgeMask(s, raw, [{ roadId: 4, type: 'bridge' }], base);
    expect(base[25]).toBe(KIND.earth); expect(mask[25]).toBe(KIND.bridge);
    expect(mask[22]).toBe(KIND.earth); expect(mask[50]).toBe(-1); expect(mask[80]).toBe(KIND.tunnel);
    const h = Float64Array.from(s, (_, i) => i >= 70 ? -30 : 20);
    const earth = Float64Array.from(s, (_, i) => i >= 40 && i <= 60 ? 1000 : 1);
    const built = chooseStructures({ ds: 10, h, earthPerM: earth, bridgePerM: 100, tunnelPerM: 100, overrides: mask });
    expect(built.kind[25]).toBe(KIND.bridge); expect(built.kind[50]).toBe(KIND.bridge); expect(built.kind[80]).toBe(KIND.tunnel);
    expect(built.runs.filter(r => r.kind === KIND.bridge)).toHaveLength(2);
    const atEnd = crossingBridgeMask(s, [{ ...raw[0], s: 0 }], [{ roadId: 4, type: 'bridge' }]);
    expect(atEnd[0]).toBe(-1); expect(atEnd[1]).toBe(KIND.bridge);
  });
});

describe('crossing geometry and map overlay', () => {
  const s = Float64Array.from({ length: 901 }, (_, i) => i * 10);
  const route: CrossingRoute = { s, x: s, y: new Float64Array(s.length), tx: new Float64Array(s.length).fill(1),
    ty: new Float64Array(s.length), grade: new Float64Array(s.length).fill(400), width: new Float64Array(s.length).fill(20) };
  const roads = new RoadNet({ cls: ['primary', 'residential', 'track'], ways: [
    [0, 3000, -200, 3000, 0, 3020, 20, 3020, 200], [1, 3100, -200, 3100, 200], [2, 3200, -200, 3200, 200],
  ] });
  it('clips the actual bent way around a hit, with no invented extension', () => {
    const path = roads.crossingPath(0, 3000, 0, 40);
    expect(path.some(p => p.x === 3020 && p.y === 20)).toBe(true);
    expect(path[0]).toEqual({ x: 3000, y: -40, d: -40 });
    expect(path[path.length - 1].d).toBeCloseTo(40);
    expect(roads.crossingPath(99, 0, 0, 40)).toEqual([]);
    const split = new RoadNet({ cls: ['residential', 'unclassified'], ways: [
      [0, 100, -20, 100, 10], [1, 100, 10, 110, 20, 110, 200], [0, 100, -200, 100, -20],
    ] });
    const connected = split.connectedCrossingPath(0, 100, 0, 60);
    expect(connected[0].d).toBe(-60); expect(connected.at(-1)!.d).toBe(60);
    expect(connected).toContainEqual({ x: 110, y: 20, d: 10 + Math.sqrt(200) });
    expect(split.crossingPath(0, 100, 0, 60).at(-1)!.d).toBe(10); // original way stays intact
  });

  it('keeps roads at terrain under bridges and prices the actual overbridge deck and approaches', () => {
    const cs = [cross(0, 3000, 'primary', 8), cross(1, 3100, 'residential', -8, 1)];
    resolve(cs, [{ roadId: 1, type: 'overbridge' }], [KIND.bridge, KIND.earth], [0, 0]);
    buildCrossingGeometry(cs, route, () => 400, roads);
    expect(cs[0].geometry!.road!.some(p => p.x === 3020 && p.y === 20)).toBe(true);
    expect(cs[0].geometry!.road!.some(p => p.x === 3000 && p.y === 0 && p.z === 400)).toBe(true);
    expect(cs[1].type).toBe('overbridge');
    expect(cs[1].geometry!.road!.every(p => p.z >= 400)).toBe(true);
    expect(cs[0].cost).toBe(0);
    const over = cs[1], g = over.geometry!, deck = g.deck!;
    expect(over.span).toBeCloseTo(crossingPlanLength(g.road!.slice(deck.start, deck.end + 1)), 6);
    const approaches = g.approaches!.reduce((sum, range) => sum + crossingPlanLength(g.road!.slice(range.start, range.end + 1)), 0);
    expect(over.approachLength).toBeCloseTo(approaches, 6);
    expect(over.cost).toBeCloseTo((over.span! * ROAD_CLASSES.residential.bridgePerKm + approaches * over.roadPerKm!) / 1000, 5);
    expect(auditCrossingGeometry(cs, route, () => 400, roads)).toEqual([]);
  });

  it('draws two opposite side links to the resolved real-road anchors, including chained diversions', () => {
    const cs = [cross(0, 3000), cross(1, 3100, 'residential'), cross(2, 3200, 'track')];
    resolve(cs); buildCrossingGeometry(cs, route, () => 400, roads);
    const links = cs[1].geometry!.links!;
    expect(links).toHaveLength(2);
    expect(links[0].every(p => p.y <= -15)).toBe(true); expect(links[1].every(p => p.y >= 15)).toBe(true);
    expect(links[0][0].x).toBe(3100); expect(links[0].at(-1)!.x).toBe(3000);
    const end = links[1].at(-1)!;
    expect(end.x - 3000).toBeCloseTo(end.y, 6); // actual bent target way, not an invented normal
    expect(end.y).toBeGreaterThanOrEqual(10 + ROAD_CLASSES.residential.width / 2 + 3);
    expect(cs[1].linkLength).toBeCloseTo(links.reduce((sum, path) => sum + crossingPlanLength(path), 0), 6);
    expect(cs[2].targetS).toBe(3100);
    expect(cs[2].geometry!.links![0].at(-1)).toEqual(links[0][0]);
    expect(cs[2].geometry!.links![1].at(-1)).toEqual(links[1][0]);
  });

  it('clears the crown across a skewed footprint, grades approaches to sloping terrain and anchors links at their feet', () => {
    const dx = 400 * Math.cos(Math.PI / 6), dy = 400 * Math.sin(Math.PI / 6);
    const net = new RoadNet({ cls: ['residential'], ways: [
      [0, 3000 - dx, -dy, 3000 + dx, dy], [0, 3200, -300, 3200, 300],
    ] });
    const cs = [cross(0, 3000, 'residential', -2), cross(1, 3200, 'residential')];
    resolve(cs); expect(cs[0].type).toBe('overbridge'); expect(cs[1].targetS).toBe(3000);
    const terrain = (x: number, y: number) => 400 + 0.003 * (x - 3000) + 0.015 * y + Math.sin(y / 50);
    const graded = { ...route, grade: Float64Array.from(s, x => 400 + 0.01 * (x - 3000)),
      left: new Float64Array(s.length).fill(24), right: new Float64Array(s.length).fill(14) };
    buildCrossingGeometry(cs, graded, terrain, net);
    const g = cs[0].geometry!, road = g.road!, links = cs[1].geometry!.links!, deck = g.deck!;
    expect(cs[0].span!).toBeGreaterThan(38 / Math.sin(Math.PI / 6));
    for (const p of [road[0], road.at(-1)!]) expect(p.z).toBeCloseTo(terrain(p.x, p.y), 6);
    for (let i = deck.start; i <= deck.end; i++) expect(road[i].z - deck.depth).toBeGreaterThanOrEqual(400 + 0.01 * (road[i].x - 3000) + 4.8 - 1e-6);
    for (const link of links) {
      expect(link.every(p => p.z === terrain(p.x, p.y) && p.surface === 'terrain')).toBe(true);
      expect(road).toContainEqual(link.at(-1));
      expect(Math.abs(link.at(-1)!.y)).toBeGreaterThan(30);
    }
    expect(auditCrossingGeometry(cs, graded, terrain, net)).toEqual([]);
  });

  it('adjusts junctions through the footprint to our grade, supports fill/cut and ties back to terrain', () => {
    const c = cross(0, 3000, 'primary', 2);
    resolve([c], [{ roadId: 0, type: 'junction' }]);
    const graded = { ...route, grade: Float64Array.from(s, x => 402 + (x - 3000) * 0.01) };
    const terrain = (_x: number, y: number) => 400 + y * 0.005;
    buildCrossingGeometry([c], graded, terrain, roads);
    const road = c.geometry!.road!;
    for (const p of road.filter(p => Math.abs(p.y) <= 10)) expect(p.z).toBeCloseTo(402 + (p.x - 3000) * 0.01, 6);
    expect(road.some(p => p.surface === 'ramp' && p.support === 'embankment')).toBe(true);
    expect(auditCrossingGeometry([c], graded, terrain, roads)).toEqual([]);
    const ramp = road.find(p => p.support)!; delete ramp.support;
    expect(auditCrossingGeometry([c], graded, terrain, roads).some(v => v.message.includes('lacks earthwork support'))).toBe(true);
  });

  it('adaptively drapes terrain interiors and distinguishes flotation from endpoint failures', () => {
    const c = cross(1, 3100, 'residential', 8);
    resolve([c], [], [KIND.bridge]);
    const terrain = (_x: number, y: number) => 400 - 6 * Math.exp(-(((y - 5) / 2) ** 2));
    buildCrossingGeometry([c], route, terrain, roads);
    const road = c.geometry!.road!;
    expect(road.length).toBeLessThanOrEqual(500);
    expect(road.some(p => p.y > 0 && p.y < 10 && p.z < 399)).toBe(true);
    expect(auditCrossingGeometry([c], route, terrain, roads)).toEqual([]);
    // Deliberately remove the refinement: endpoints are still ground, but the road floats over the gully.
    c.geometry!.road = road.filter(p => p.y <= 0 || p.y >= 10);
    const issues = auditCrossingGeometry([c], route, terrain, roads);
    expect(issues.some(v => v.message.includes('Unsupported flotation'))).toBe(true);
    expect(issues.some(v => v.message === 'Dangling endpoint')).toBe(false);
  });

  it('omits impossible decks instead of dropping into our lanes and bills only available real link sides', () => {
    const net = new RoadNet({ cls: ['residential', 'primary'], ways: [
      [0, 3100, -200, 3100, 2], [1, 3000, -200, 3000, 200],
    ] });
    const deck = cross(0, 3100, 'residential');
    resolve([deck], [{ roadId: 0, type: 'overbridge' }]);
    const issues = buildCrossingGeometry([deck], route, () => 400, net);
    expect(issues.some(v => v.crossing.code === 'geometry')).toBe(true);
    expect(deck.geometry!.road).toBeUndefined(); expect(deck.geometry!.deck).toBeUndefined(); expect(deck.cost).toBe(0);
    const cs = [cross(1, 3000), cross(0, 3100, 'residential')];
    resolve(cs); buildCrossingGeometry(cs, route, () => 400, net);
    const links = cs[1].geometry!.links!;
    expect(links[0].length).toBeGreaterThan(1); expect(links[1]).toEqual([]);
    expect(cs[1].linkLength).toBeCloseTo(crossingPlanLength(links[0]), 6);
    expect(cs[1].cost).toBeCloseTo(cs[1].linkLength! * cs[1].roadPerKm! / 1000, 6);
    expect(cs[1].geometry!.turnarounds).toEqual([links[0][0]]);
    expect(auditCrossingGeometry(cs, route, () => 400, net).filter(v => v.severity === 'error')).toEqual([]);
  });

  it('bounds impossible profiles and long links without fabricating roads, and bills only constructed paths', () => {
    const missing = cross(99, 4000, 'residential', 1e20);
    resolve([missing], [{ roadId: 99, type: 'overbridge' }]);
    expect(buildCrossingGeometry([missing], route, () => 400, roads).some(v => v.crossing.code === 'geometry')).toBe(true);
    expect(missing.geometry!.road).toBeUndefined(); expect(missing.cost).toBe(0);
    const c = cross(1, 3100, 'residential', 1e20);
    resolve([c], [{ roadId: 1, type: 'overbridge' }]);
    const impossible = { ...route, grade: new Float64Array(s.length).fill(1e20) };
    buildCrossingGeometry([c], impossible, () => 400, roads);
    const road = c.geometry!.road!;
    expect(road.length).toBeLessThanOrEqual(500); expect(c.geometry!.clipped).toBe(true);
    expect(road[0].z).toBe(400); expect(road.at(-1)!.z).toBe(400);
    expect(auditCrossingGeometry([c], impossible, () => 400, roads).filter(v => v.severity === 'error')).toEqual([]);
    const bigS = Float64Array.from({ length: 9001 }, (_, i) => i * 10), zero = new Float64Array(bigS.length);
    const longRoute: CrossingRoute = { s: bigS, x: bigS, y: zero, tx: new Float64Array(bigS.length).fill(1), ty: zero,
      grade: new Float64Array(bigS.length).fill(400), width: new Float64Array(bigS.length).fill(20) };
    const net = new RoadNet({ cls: ['residential'], ways: [[0, 45000, -100, 45000, 100], [0, 0, -100, 0, 100]] });
    const far = cross(0, 45000, 'residential');
    resolveCrossings([far], 90000, [KIND.earth], [20], [0], [0], [{ roadId: 0, type: 'reconnection' }]);
    buildCrossingGeometry([far], longRoute, () => 400, net);
    expect(far.linkLength).toBeCloseTo(90000, 3);
    expect(far.geometry!.links!.every(link => link.length <= 500)).toBe(true);
    expect(far.geometry!.clipped).toBe(true);
  });

  it('creates depth-tested decks and visible symbols, then retires resources and restores the render hook', () => {
    const cs = [cross(0, 3000), cross(1, 4000, 'residential', -8)];
    resolve(cs); buildCrossingGeometry(cs, route, () => 400, roads);
    const prev = vi.fn(), retired: THREE.Material[] = [];
    const mock = { world: new THREE.Group(), metresPerPixel: 2, onRender: prev as (() => void) | null,
      local: (x: number, y: number, z: number, v: THREE.Vector3) => v.set(x, z, -y),
      drape: () => 401, requestRender: vi.fn(), retire: (m: THREE.Material) => { retired.push(m); } };
    const renderer = new CrossingRenderer(mock as unknown as View);
    renderer.setResult({ crossings: cs, grade: Float64Array.of(400), ground: Float64Array.of(400) });
    const group = mock.world.getObjectByName('crossing-roads')!;
    expect(group.children.length).toBeGreaterThan(0);
    expect(group.children.every(c => ((c as THREE.Mesh).material as THREE.Material).depthTest)).toBe(true);
    expect(((group.children[0] as THREE.Mesh).geometry.getAttribute('position') as THREE.BufferAttribute).getY(0)).toBeGreaterThan(401);
    expect(mock.world.getObjectByName('crossing-symbols')!.children).toHaveLength(1);
    mock.onRender!(); expect(prev).toHaveBeenCalled();
    renderer.setResult({ crossings: [], grade: Float64Array.of(400), ground: Float64Array.of(400) });
    expect(group.children).toHaveLength(0); expect(retired.length).toBeGreaterThan(0);
    renderer.dispose(); expect(mock.world.children).toHaveLength(0); expect(mock.onRender).toBe(prev);
  });
});
