import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { auditCrossingGeometry, buildCrossingGeometry, crossingCache, crossingPlanLength, crossingBridgeMask, normalizeCrossingOverrides, resolveCrossings,
  type CrossingOverride, type CrossingResult, type CrossingRoute } from '../src/core/crossings';
import { RoadNet, mergeCrossings, type RoadCrossing } from '../src/core/roadnet';
import { bridgeModel } from '../src/core/bridge';
import { ENDPOINT_JUNCTIONS, JUNCTION, MINOR_CROSSROADS, ROAD_CLASSES } from '../src/core/data/urban';
import { sideJunctionCost } from '../src/core/project-replacement';
import { LOWERING_RULES, underpassAssembly, underpassOpenCost } from '../src/core/data/remedies';
import { chooseStructures, KIND } from '../src/core/structures';
import { CrossingRenderer } from '../src/render/crossings';
import type { View } from '../src/render/view';
import { crossingSurfaces } from '../src/render/crossing-surface';

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

  // A rebuilt street (M 7.5) or track (P 4.0) meets the minor roads it crosses in a crossroads, priced as such
  // (research/43-minor-crossroads.md); before, Auto cut each one and rerouted it to the next crossing (D11 Za Vápenkou: 30 M CZK).
  it('a local road or track meets the minor roads it crosses in a crossroads, without junction spacing', () => {
    const ours = (minor: 'local' | 'track', cs: CrossingResult[]) => resolveCrossings(cs, 9000, [KIND.earth], [30, 30, 30], [0], [0], [], false, undefined, 0, minor);
    const street = [cross(1, 3000, 'residential'), cross(2, 3010, 'track'), cross(3, 3020, 'living_street'), cross(4, 3030, 'primary'), cross(5, 3040, 'trunk')];
    expect(ours('local', street)).toEqual([]);
    expect(street.map(c => [c.type, c.cost])).toEqual([['junction', MINOR_CROSSROADS.local], ['junction', MINOR_CROSSROADS.mixed],
      ['junction', MINOR_CROSSROADS.local], ['junction', JUNCTION], [expect.not.stringMatching(/junction/), expect.any(Number)]]);
    const track = [cross(1, 3000, 'service'), cross(2, 3100, 'unclassified')];
    ours('track', track);
    expect(track.map(c => [c.type, c.cost])).toEqual([['junction', MINOR_CROSSROADS.track], ['junction', MINOR_CROSSROADS.mixed]]);
    // deep below the crossed road there is no crossroads; a road of a higher class keeps its reroutes
    const deep = [cross(1, 3000, 'residential', -8)];
    ours('local', deep); expect(deep[0].type).not.toBe('junction');
    const main = [cross(1, 3000, 'residential')];
    resolve(main); expect(main[0].type).not.toBe('junction');
    // a side street's junction on a rebuilt street is such a crossroads too (a class road's stays a T)
    expect([sideJunctionCost('residential', 'local'), sideJunctionCost('track', 'local'), sideJunctionCost('residential')])
      .toEqual([MINOR_CROSSROADS.local, MINOR_CROSSROADS.mixed, ENDPOINT_JUNCTIONS['tie-in-minor'].cost]);
  });

  // A rebuilt road's side road crossed by its new line keeps its access there (EvalOptions.sideWays): Auto's and the
  // player's junction alike, at the access's price and without junction spacing; never on a motorway.
  it("a rebuilt road's side road keeps its access, chosen or not", () => {
    const access = (c: CrossingResult) => [1, 2].includes(c.roadId!) ? sideJunctionCost(c.cls) : undefined;
    const side = (overrides: CrossingOverride[]) => {
      const cs = [cross(1, 120, 'track'), cross(2, 200, 'motorway')];
      return { cs, issues: resolveCrossings(cs, 300, [KIND.earth], [30, 30, 30], [0], [0], overrides, false, undefined, undefined, undefined, access) };
    };
    const auto = side([]), chosen = side([{ roadId: 1, type: 'junction' }]);
    expect([auto.cs[0].type, auto.cs[0].cost, chosen.cs[0].type, chosen.cs[0].cost]).toEqual(['junction', sideJunctionCost('track'), 'junction', sideJunctionCost('track')]);
    expect(chosen.issues).toEqual([]);
    expect(auto.cs[1].type).not.toBe('junction');
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
    expect(issues[0].crossing).toMatchObject({ code: 'reach', actual: 4000, required: 2000 });
    expect(far.linkLength).toBe(8000); expect(far.type).toBe('reconnection');
    for (const [station, allowed] of [[5000, true], [5001, false]] as const) {
      const boundary = [cross(1, 3000), cross(2, station, 'residential')];
      const issues = resolve(boundary, [{ roadId: 2, type: 'reconnection' }]);
      expect(issues.some(v => v.crossing.code === 'reach')).toBe(!allowed);
    }
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

  it('preserves radial endpoint tolerance and first-candidate ties across repeated network traversals', () => {
    const net = new RoadNet({ cls: ['residential'], ways: [
      [0, 0, -20, 0, 0],
      [0, 0.019, 0.019, 0, 20], // within the endpoint box, but outside the 2 cm radius
      [0, 0.02, 0, 0, 30], // exactly at the radius; first equally straight continuation
      [0, 0, 0, 0, 40],
    ] });
    const expected = [
      { x: 0, y: -20, d: -10 }, { x: 0, y: -10, d: 0 },
      { x: 0, y: 0, d: 10 }, { x: 0, y: 30, d: 40 },
    ];
    expect(net.connectedCrossingPath(0, 0, -10, 60)).toEqual(expected);
    const other = net.connectedCrossingPath(0, 0, -5, 15);
    expect(other.at(-1)).toEqual({ x: 0, y: 10, d: 15 });
    other[0].y = 999; // returned paths must remain independent of future calls
    expect(net.connectedCrossingPath(0, 0, -10, 60)).toEqual(expected);
  });

  it('reuses a reroute across evaluation passes only where our footprint it consulted is unchanged', () => {
    // a shaped reroute bulging out to x = 4500, well beyond its anchors' chainages (3000–3800)
    const net = new RoadNet({ cls: ['primary', 'residential'], ways: [[0, 3000, -300, 3000, 300], [1, 3800, -300, 3800, 300]] });
    const via: CrossingOverride['via'] = [[{ x: 4500, y: -30 }], []];
    const run = (r: CrossingRoute, cache: ReturnType<typeof crossingCache>) => {
      const cs = [cross(0, 3000), cross(1, 3800, 'residential')];
      resolveCrossings(cs, 9000, new Uint8Array(s.length), r.width, new Float64Array(s.length), undefined,
        [{ roadId: 0, type: 'junction' }, { roadId: 1, type: 'reconnection', via, to: 0 }]);
      buildCrossingGeometry(cs, r, () => 400, net, cache);
      return cs[1].issues?.map(v => v.title) ?? [];
    };
    const cache = crossingCache();
    expect(run(route, cache)).toEqual([]);
    // our earthworks widen under the bulge in the second pass: the reroute is rebuilt and now runs onto them
    const wide = { ...route, width: Float64Array.from(route.width, (w, i) => i >= 420 && i < 460 ? 100 : w) };
    expect(run(wide, cache)).toEqual(run(wide, crossingCache()));
    expect(run(wide, cache).length).toBeGreaterThan(0);
  });

  it('shares candidate alignments within a build but refreshes mutable route and terrain inputs on the next build', () => {
    const net = new RoadNet({ cls: ['primary', 'residential'], ways: [
      [0, 3000, -300, 3000, 300], [1, 3800, -300, 3800, 2],
    ] });
    const path = vi.spyOn(net, 'connectedCrossingPath');
    const edited = { ...route, grade: Float64Array.from(route.grade), width: Float64Array.from(route.width) };
    let height = 400;
    const run = () => {
      const cs = [cross(0, 3000), cross(1, 3800, 'residential')];
      resolve(cs); buildCrossingGeometry(cs, edited, () => height, net);
      return cs;
    };
    const first = run(), saved = structuredClone(first);
    expect(first[1].type).toBe('reconnection'); // candidate trial and final rebuild both run
    expect(path).toHaveBeenCalledTimes(2); // each source alignment is traversed only once
    edited.grade.fill(402); edited.width.fill(24); height = 401;
    const second = run();
    expect(path).toHaveBeenCalledTimes(4);
    expect(second).not.toEqual(first);
    expect(first).toEqual(saved); // no mutable geometry shared with subsequent builds
    expect(run()).toEqual(second);
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
    expect(over.cost).toBeCloseTo(bridgeModel(ROAD_CLASSES.residential).total(over.span!, 0, { span: over.span!, pierDensity: 0 }) + approaches * over.roadPerKm! / 1000, 5);
    expect(auditCrossingGeometry(cs, route, () => 400, roads)).toEqual([]);
  });

  it('carries a track through a measured underpass box, and rejects low fills and unsupported classes', () => {
    const box = underpassAssembly('track', ROAD_CLASSES.track.roadPerKm[0] / 1000);
    const high = [cross(2, 3200, 'track', 7)];
    expect(resolve(high, [{ roadId: 2, type: 'underpass' }])).toEqual([]);
    buildCrossingGeometry(high, { ...route, kind: new Uint8Array(s.length) }, () => 393, roads);
    const c = high[0], g = c.geometry!, u = g.underpass!;
    expect(c.type).toBe('underpass'); expect(g.diagnostics).toBeUndefined();
    // The way's toes across the 20 m footprint; the box ends where our slope comes down to its roof, from
    // there to the toes the way runs between wing walls as high as the slope beside it.
    expect(crossingPlanLength(g.road!.slice(u.start, u.end + 1))).toBeCloseTo(20, 4);
    expect(c.underpassLength).toBeCloseTo(u.portals![1] - u.portals![0], 6);
    expect(c.underpassLength).toBeGreaterThan(5); expect(c.underpassLength).toBeLessThan(15);
    for (const wing of u.wings!) expect(Math.max(...wing.map(w => w.h))).toBeCloseTo(box.height + box.roof, 2);
    expect(g.road!.every(p => p.z === 393 && p.surface === 'terrain')).toBe(true); // the way keeps its level
    const open = (w: NonNullable<typeof u.wings>) => w.reduce((sum, wing) => sum + underpassOpenCost(wing, ROAD_CLASSES.track.roadPerKm[0] / 1000), 0);
    expect(open(u.wings!)).toBeGreaterThan(0);
    expect(c.cost).toBeCloseTo(c.underpassLength! * box.perM + 2 * box.head + open(u.wings!), 6);
    expect(auditCrossingGeometry(high, route, () => 393, roads)).toEqual([]);
    // A low embankment: the track is lowered into a cut on ramps at its class gradient, its low point drained.
    const low = [cross(2, 3200, 'track', 4)];
    expect(resolve(low, [{ roadId: 2, type: 'underpass' }])).toEqual([]);
    buildCrossingGeometry(low, route, () => 396, roads);
    const l = low[0], lg = l.geometry!;
    expect(lg.diagnostics).toBeUndefined();
    expect(l.lowered).toBeCloseTo(box.minHeight - 4, 6);
    const ideal = 2 * l.lowered! / ROAD_CLASSES.track.rampGradient;
    expect(l.approachLength).toBeGreaterThanOrEqual(ideal - 1e-6); expect(l.approachLength).toBeLessThanOrEqual(ideal + 20); // feet on 10 m way samples
    expect(lg.road!.slice(lg.underpass!.start, lg.underpass!.end + 1).every(p => Math.abs(p.z - (396 - l.lowered!)) < 1e-6)).toBe(true);
    expect(l.drainage).toBe('pump'); // flat ground: no lower ground for a gravity pipe
    expect(l.cost).toBeCloseTo(l.underpassLength! * box.perM + 2 * box.head + open(lg.underpass!.wings!) + l.approachLength! * ROAD_CLASSES.track.roadPerKm[0] / 1000 + l.drainCost!, 6);
    expect(auditCrossingGeometry(low, route, () => 396, roads)).toEqual([]);
    // Lower than the deepest allowed lowering: the box does not fit.
    const lowest = box.minHeight - LOWERING_RULES.maxDepth, tooLow = [cross(2, 3200, 'track', lowest - 1)];
    const tooLowIssue = resolve(tooLow, [{ roadId: 2, type: 'underpass' }])[0];
    expect(tooLowIssue.crossing).toMatchObject({ code: 'underpass', actual: lowest - 1, required: lowest });
    // (the level our road must reach lies below the crossed road: said so, not as a negative height above it)
    expect(lowest).toBeLessThan(0);
    expect(tooLowIssue.fix).toContain(`Raise our road here by 1.0 m, to ${(-lowest).toFixed(2)} m below the crossed road`);
    buildCrossingGeometry(tooLow, route, () => 401 - lowest, roads);
    expect(tooLow[0].geometry!.diagnostics).toContain('Embankment is too low over the underpass box');
    const primary = [cross(0, 3000, 'primary', 9)];
    expect(resolve(primary, [{ roadId: 0, type: 'underpass' }])[0].crossing.code).toBe('underpass');
    // Drawn as a concrete box between the portals over the terrain-level way, with a dark opening.
    const mock = { world: new THREE.Group(), local: (x: number, y: number, z: number, v = new THREE.Vector3()) => v.set(x, z, -y),
      crossingSurfaces: crossingSurfaces(high, () => 393), groundHeight: () => 393, drape: () => 394, replacementHeight: () => 393,
      crossingEarthMaterial: () => new THREE.MeshBasicMaterial(), crossingGroundMaterial: () => new THREE.MeshBasicMaterial(),
      requestRender: vi.fn(), retire: vi.fn() };
    new CrossingRenderer(mock as unknown as View).setResult({ crossings: high, grade: Float64Array.of(400), ground: Float64Array.of(393) });
    const decks = mock.world.getObjectsByProperty('name', 'crossing-decks') as THREE.Mesh[];
    const heights = decks.flatMap(m => Array.from((m.geometry.getAttribute('position') as THREE.BufferAttribute).array).filter((_, i) => i % 3 === 1));
    expect(Math.max(...heights)).toBeCloseTo(393 + u.height + u.roof + .2, 3); // Float32 vertices
    expect(Math.min(...heights)).toBeLessThan(393);
    // Auto prefers the box to a long link or an overbridge when it is cheaper; never under a bridge.
    const auto = [cross(2, 3200, 'track', 7)];
    resolve(auto); expect(auto[0].type).toBe('underpass');
    resolve(auto, [], [KIND.bridge]); expect(auto[0].type).toBe('bridge');
  });

  it('probes the box under the crown between the way samples (a ridge there lowers the track) and lets a measured skewed box lose to a link', () => {
    const t = Float64Array.from({ length: 301 }, (_, i) => i * 10), kind = new Uint8Array(t.length); kind[100] = KIND.bridge;
    const flat: CrossingRoute = { s: t, x: t, y: new Float64Array(t.length), tx: new Float64Array(t.length).fill(1), ty: new Float64Array(t.length),
      grade: new Float64Array(t.length).fill(7), width: new Float64Array(t.length).fill(40), crownWidth: 9.5, kind };
    // A 3 m ridge between the initial way samples, right under the carriageway.
    const ridge = [cross(0, 1500, 'track', 7, 150)];
    const net = new RoadNet({ cls: ['track'], ways: [[0, 1500, -200, 1500, 200]] });
    resolveCrossings(ridge, 3000, kind, flat.width, new Uint8Array(t.length), undefined, [{ roadId: 0, type: 'underpass' }]);
    const bump = (_x: number, y: number) => Math.max(0, 3 * (1 - Math.abs(y - 3) / 2.5));
    buildCrossingGeometry(ridge, flat, bump, net);
    // (seen between the samples, the ridge leaves 4 m of fill: the track is lowered under the box)
    expect(ridge[0].geometry!.diagnostics).toBeUndefined();
    expect(ridge[0].lowered).toBeGreaterThan(0.5); expect(ridge[0].lowered).toBeLessThan(2);
    expect(auditCrossingGeometry(ridge, flat, bump, net)).toEqual([]);
    // A 30° track under a 12 m fill: a ≈ 60 m box between its portals (wings to the toes 90 m apart along
    // it), dearer than its measured link to a junction.
    const high: CrossingRoute = { ...flat, grade: new Float64Array(t.length).fill(12), width: new Float64Array(t.length).fill(46) };
    const skew = new RoadNet({ cls: ['primary', 'track'], ways: [[0, 1000, -300, 1000, 300], [1, 1500 - 300 * Math.sqrt(3), -300, 1500 + 300 * Math.sqrt(3), 300]] });
    const cs = [cross(0, 1000, 'primary', 7, 100), cross(1, 1500, 'track', 7, 150)];
    resolveCrossings(cs, 3000, kind, high.width, new Uint8Array(t.length), undefined, []);
    expect(cs[1].type).toBe('underpass'); // the footprint-width estimate
    buildCrossingGeometry(cs, high, () => 0, skew);
    expect(cs[1].type).toBe('diversion'); expect(cs[1].geometry!.diagnostics).toBeUndefined();
    const box = underpassAssembly('track', ROAD_CLASSES.track.roadPerKm[0] / 1000);
    expect(cs[1].cost).toBeLessThan(60 * box.perM + 2 * box.head);
  });

  it('builds a straightened line like a reroute: up a slope too steep for a road on the ground, on its own earthworks', () => {
    const t = Float64Array.from({ length: 301 }, (_, i) => i * 10), kind = new Uint8Array(t.length);
    const route: CrossingRoute = { s: t, x: t, y: new Float64Array(t.length), tx: new Float64Array(t.length).fill(1), ty: new Float64Array(t.length),
      grade: new Float64Array(t.length).fill(7), width: new Float64Array(t.length).fill(40), crownWidth: 9.5, kind };
    // our road in a valley: 25–40 m out the ground climbs 6 m (40 %, steeper than a track's 15 %), then lies level
    const valley = (_x: number, y: number) => 6 * Math.max(0, Math.min(1, (Math.abs(y) - 25) / 15));
    const k = Math.tan(Math.PI * 20 / 180), net = new RoadNet({ cls: ['track'], ways: [[0, 1500 - 300 / k, -300, 1500 + 300 / k, 300]] });
    const cs = [cross(0, 1500, 'track', 7, 150)];
    resolveCrossings(cs, 3000, kind, route.width, new Uint8Array(t.length), undefined, [{ roadId: 0, type: 'underpass', square: true }]);
    buildCrossingGeometry(cs, route, valley, net);
    const c = cs[0], g = c.geometry!;
    expect(c.squared).toBeCloseTo(20, 0); expect(g.diagnostics).toBeUndefined(); expect(c.issues ?? []).toEqual([]);
    // beyond the box the new line is raised and cut where the ground is steep, no steeper than the class allows
    const out = g.road!.filter((_q, i) => i < g.underpass!.start || i > g.underpass!.end);
    expect(out.some(q => q.surface === 'ramp')).toBe(true);
    for (let i = 1; i < out.length; i++) if (out[i].d! - out[i - 1].d! > 1)
      expect(Math.abs(out[i].z - out[i - 1].z) / (out[i].d! - out[i - 1].d!)).toBeLessThanOrEqual(ROAD_CLASSES.track.rampSteepest + 1e-6);
    expect(auditCrossingGeometry(cs, route, valley, net)).toEqual([]);
  });

  it('straightens a skewed track whose box would be too long, and moves a track that comes back out on its own side', () => {
    const t = Float64Array.from({ length: 301 }, (_, i) => i * 10), kind = new Uint8Array(t.length);
    const flat: CrossingRoute = { s: t, x: t, y: new Float64Array(t.length), tx: new Float64Array(t.length).fill(1), ty: new Float64Array(t.length),
      grade: new Float64Array(t.length).fill(7), width: new Float64Array(t.length).fill(40), crownWidth: 9.5, kind };
    // A 20° track under a 7 m embankment: on its own line a 117 m box (over the 100 m limit), nothing to reroute to.
    const k = Math.tan(Math.PI * 20 / 180), net = new RoadNet({ cls: ['track'], ways: [[0, 1500 - 300 / k, -300, 1500 + 300 / k, 300]] });
    const cs = [cross(0, 1500, 'track', 7, 150)];
    resolveCrossings(cs, 3000, kind, flat.width, new Uint8Array(t.length), undefined, []);
    buildCrossingGeometry(cs, flat, () => 0, net);
    const c = cs[0], g = c.geometry!, u = g.underpass!;
    expect(c.type).toBe('underpass'); expect(g.diagnostics).toBeUndefined();
    expect(c.squared).toBeCloseTo(20, 0);
    expect(crossingPlanLength(g.road!.slice(u.start, u.end + 1))).toBeCloseTo(40, 0); // toes square across the 40 m footprint
    expect(c.underpassLength).toBeCloseTo(u.portals![1] - u.portals![0], 6);
    const a = g.road![u.start], b = g.road![u.end];
    expect(Math.abs(b.x - a.x)).toBeLessThan(0.5); // at a right angle to our road (along x)
    const box = underpassAssembly('track', ROAD_CLASSES.track.roadPerKm[0] / 1000);
    expect(c.realignLength).toBeGreaterThan(0);
    const open = u.wings!.reduce((sum, wing) => sum + underpassOpenCost(wing, ROAD_CLASSES.track.roadPerKm[0] / 1000), 0);
    expect(c.cost).toBeCloseTo(c.underpassLength! * box.perM + 2 * box.head + open + c.realignCost!, 6);
    expect(c.realignCost).toBeCloseTo(c.realignLength! * ROAD_CLASSES.track.roadPerKm[0] / 1000, 6);
    // bends no sharper than the class's smallest radius (three-point circles along the new line)
    for (let i = 1; i + 1 < g.road!.length; i++) {
      const [p, q, r] = [g.road![i - 1], g.road![i], g.road![i + 1]];
      const cross2 = Math.abs((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
      if (cross2 > 1e-6) expect(Math.hypot(q.x - p.x, q.y - p.y) * Math.hypot(r.x - q.x, r.y - q.y) * Math.hypot(r.x - p.x, r.y - p.y) / (2 * cross2)).toBeGreaterThan(ROAD_CLASSES.track.minRadius * 0.9);
    }
    expect(auditCrossingGeometry(cs, flat, () => 0, net)).toEqual([]);
    // The player keeps it on its line: the long box stays, with its problem.
    resolveCrossings(cs, 3000, kind, flat.width, new Uint8Array(t.length), undefined, [{ roadId: 0, type: 'underpass', square: false }]);
    buildCrossingGeometry(cs, flat, () => 0, net);
    expect(cs[0].squared).toBeUndefined(); expect(cs[0].geometry!.diagnostics).toContain('Underpass would exceed the 100 m box limit');
    // A track that runs into our earthworks and back out on the side it came from needs no crossing.
    const weave = new RoadNet({ cls: ['track'], ways: [[0, 700, 200, 1000, -5, 1300, -5, 1600, 200]] });
    const w = [cross(0, 1000 - 5 * 300 / 205, 'track', 7, 99)];
    w[0].x = w[0].s;
    resolveCrossings(w, 3000, kind, flat.width, new Uint8Array(t.length), undefined, []);
    buildCrossingGeometry(w, flat, () => 0, weave);
    expect(w[0].moved).toBe(true); expect(w[0].type).toBe('diversion'); expect(w[0].targetS).toBeUndefined();
    expect(w[0].geometry!.links![0]).toEqual([]); expect(w[0].geometry!.links![1].every(p => p.y >= 20 + 2 + 3 - 1e-6)).toBe(true);
    expect(w[0].cost).toBeCloseTo(w[0].linkLength! * ROAD_CLASSES.track.roadPerKm[0] / 1000, 6);
  });

  it('draws two opposite side links to the resolved real-road anchors, every reroute to a crossing that carries it', () => {
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
    // the track beside it leads to the same junction, not to the cut street
    expect(cs[2].targetS).toBe(3000);
    expect(cs[2].geometry!.links![0].at(-1)).toEqual(links[0].at(-1));
    expect(cs[2].geometry!.links![1].at(-1)).toEqual(links[1].at(-1));
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
    cs[0].square = false; // kept on its skewed line (the player's choice), not straightened
    buildCrossingGeometry(cs, graded, terrain, net);
    const g = cs[0].geometry!, road = g.road!, links = cs[1].geometry!.links!, deck = g.deck!;
    expect(cs[0].span!).toBeGreaterThan(38 / Math.sin(Math.PI / 6));
    for (const p of [road[0], road.at(-1)!]) expect(p.z).toBeCloseTo(terrain(p.x, p.y), 6);
    for (let i = deck.start; i <= deck.end; i++) expect(road[i].z - deck.depth).toBeGreaterThanOrEqual(400 + 0.01 * (road[i].x - 3000) + 4.8 - 1e-6);
    for (const link of links) {
      expect(link.every(p => p.z === terrain(p.x, p.y) && p.surface === 'terrain')).toBe(true);
      // (it joins the crossed road on the ground beyond its ramps, where it comes nearest)
      const end = link.at(-1)!;
      expect(net.nearestWay(end.x, end.y, 0.3)).toBe(0);
      expect(end.surface).toBe('terrain');
      expect(Math.abs(end.y)).toBeGreaterThan(30);
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
    expect(cs[1].issues?.length ?? 0).toBe(0); // consumed opposite stub is not an inaccessible through-road
    expect(auditCrossingGeometry(cs, route, () => 400, net)).toEqual([]);
  });

  it('connects a real terminating T-junction to main-road grade instead of dropping its end to removed terrain', () => {
    const net = new RoadNet({ cls: ['primary'], ways: [[0, 3000, -200, 3000, 0]] });
    const c = cross(0, 3000, 'primary', 2);
    resolve([c], [{ roadId: 0, type: 'junction' }]);
    const raised = { ...route, grade: new Float64Array(s.length).fill(402) };
    expect(buildCrossingGeometry([c], raised, () => 400, net)).toEqual([]);
    const end = c.geometry!.road!.at(-1)!;
    expect(end).toMatchObject({ x: 3000, y: 0, z: 402, connection: 'main-road', support: 'embankment' });
    expect(auditCrossingGeometry([c], raised, () => 400, net)).toEqual([]);
  });

  it('replaces an infeasible Auto dead-end overbridge by a feasible measured one-sided real-road link', () => {
    const net = new RoadNet({ cls: ['primary', 'residential'], ways: [
      [0, 3000, -300, 3000, 300], [1, 3800, -300, 3800, 2],
    ] });
    // (our road 1 m below the street: too deep for a box even with the street lowered by 6 m)
    const cs = [cross(0, 3000), cross(1, 3800, 'residential', -1)];
    resolve(cs); expect(cs[1].type).toBe('overbridge');
    expect(buildCrossingGeometry(cs, route, () => 400, net)).toEqual([]);
    const c = cs[1]; expect(c.type).toBe('reconnection'); expect(c.targetRoadId).toBe(0);
    expect(c.geometry!.links![0].length).toBeGreaterThan(1); expect(c.geometry!.links![1]).toEqual([]);
    expect(c.cost).toBeCloseTo(crossingPlanLength(c.geometry!.links![0]) * c.roadPerKm! / 1000, 6);
    expect(auditCrossingGeometry(cs, route, () => 400, net)).toEqual([]);
    const manual = [cross(0, 3000), cross(1, 3800, 'residential', -1)];
    expect(resolve(manual, [{ roadId: 1, type: 'reconnection' }])).toEqual([]);
    expect(buildCrossingGeometry(manual, route, () => 400, net)).toEqual([]);
    expect(manual[1].cost).toBeCloseTo(c.cost, 6); // choosing the same >750 m link explicitly stays valid
  });

  it('swaps a feasible bridge over our road for a reroute beyond the 750 m shortlist only when that costs at most half', () => {
    const net = new RoadNet({ cls: ['primary', 'residential'], ways: [
      [0,3000,-600,3000,600], [1,3800,-600,3800,600],
    ] });
    const build = (width: number, overrides: CrossingOverride[] = []) => {
      const cs = [cross(0,3000), cross(1,3800,'residential',-1)];
      resolve(cs, overrides); expect(buildCrossingGeometry(cs, { ...route, width: new Float64Array(s.length).fill(width) }, ()=>400, net)).toEqual([]);
      return cs[1];
    };
    // A 500 m span over a huge cutting: the 800 m reroute is far cheaper and replaces it.
    const huge = build(500), hugeBridge = build(500, [{ roadId: 1, type: 'overbridge' }]);
    expect(huge.type).toBe('reconnection');
    expect(huge.cost).toBeLessThan(hugeBridge.cost / 2);
    // An ordinary 40 m span stays: the long reroute could never cost less than half of it.
    const ordinary = build(40), link = build(40, [{ roadId: 1, type: 'reconnection' }]);
    expect(ordinary.type).toBe('overbridge');
    expect(link.cost).toBeGreaterThan(ordinary.cost / 2);
  });

  it('consumes tiny dead-end remnants in connection works but still requires anchors for surviving branches', () => {
    const run = (lo: number, hi: number, cls = 'residential') => {
      const net = new RoadNet({ cls: ['primary', cls], ways: [[0, 3000, -200, 3000, 0], [1, 3100, lo, 3100, hi]] });
      const cs = [cross(0, 3000), cross(1, 3100, cls)];
      resolve(cs, [{ roadId: 1, type: 'reconnection' }]);
      const issues = buildCrossingGeometry(cs, route, () => 400, net);
      return { c: cs[1], issues };
    };
    const stub = run(-200, 14); // toe is y=10; 4 m dead-end lies in the connection working strip
    expect(stub.issues).toEqual([]);
    expect(stub.c.geometry!.links![0].length).toBeGreaterThan(1); expect(stub.c.geometry!.links![1]).toEqual([]);
    const surviving = run(-200, 30); // real positive-side road survives, but the target T has no such branch
    expect(surviving.issues.some(v => v.title.startsWith('No place to reconnect'))).toBe(true);
    const consumed = run(-14, 14, 'service');
    expect(consumed.issues).toEqual([]); expect(consumed.c.geometry!.links).toEqual([[], []]);
    expect(consumed.c.linkLength).toBe(0); expect(consumed.c.cost).toBe(0); // no phantom service ACCESS lump
  });

  it('ramps up to a bridge over our road at the crossed road class gradient, following the road\'s own slope', () => {
    const rampOf = (cls: string, terrain: (x: number, y: number) => number) => {
      const net = new RoadNet({ cls: [cls], ways: [[0, 3000, -900, 3000, 900]] });
      const c = cross(0, 3000, cls); resolve([c], [{ roadId: 0, type: 'overbridge' }]);
      const issues = buildCrossingGeometry([c], route, terrain, net);
      const g = c.geometry!, deck = g.road![g.deck!.start].z;
      return { c, issues, rise: deck - terrain(3000, 0) };
    };
    // Flat ground: each ramp is the deck height over the class gradient (research/20), not 6 % for all.
    for (const cls of ['track', 'service', 'residential', 'primary']) {
      const { c, issues, rise } = rampOf(cls, () => 400);
      expect(issues).toEqual([]);
      const ideal = 2 * rise / ROAD_CLASSES[cls].rampGradient;
      expect(c.approachLength!).toBeGreaterThanOrEqual(ideal - 1);
      expect(c.approachLength!).toBeLessThanOrEqual(ideal + 20); // ramp feet sit on 10 m way samples
    }
    expect(rampOf('track', () => 400).c.approachLength!).toBeLessThan(150); // was ≈ 220 m at 6 %
    // The old track falls 8 % away on both sides: the ramp follows it, 5 % steeper (13 %, within the
    // 15 % track maximum), and closes the height in ≈ 2 × 150 m instead of ≈ 2 × 350 m at a flat 10 %.
    // At 20 % no ramp within 15 % ever meets it again: rejected.
    const fall = (_x: number, y: number) => 400 - 0.08 * Math.abs(y), falling = rampOf('track', fall);
    expect(falling.issues).toEqual([]);
    expect(falling.c.approachLength!).toBeLessThan(2 * 170);
    expect(auditCrossingGeometry([falling.c], route, fall, undefined).filter(v => v.severity === 'error')).toEqual([]);
    expect(rampOf('track', (_x, y) => 400 - 0.2 * Math.abs(y)).issues.map(v => v.title)).toContain('Ramps up to the bridge over our road would be longer than 250 m');
  });

  it('does not treat viaduct-scale approach fill as ordinary priced road embankment', () => {
    const net = new RoadNet({ cls: ['residential'], ways: [[0, 3000, -800, 3000, 800]] });
    const terrain = (_x: number, y: number) => 400 - 55 * Math.exp(-(((Math.abs(y) - 250) / 100) ** 2));
    const c = cross(0, 3000, 'residential'); resolve([c], [{ roadId: 0, type: 'overbridge' }]);
    const issues = buildCrossingGeometry([c], route, terrain, net);
    expect(issues.some(v => v.title.includes('more than 10 m high') || v.title.includes('longer than 250 m'))).toBe(true);
    expect(c.type).toBe('overbridge'); // explicit choice retained, unlike Auto fallback
    expect(auditCrossingGeometry([c], route, terrain, net).filter(v => v.severity === 'error')).toEqual([]);
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

  it('builds depth-tested physical geometry without lifting roads or rebuilding per frame, and retires resources', () => {
    const cs = [cross(0, 3000), cross(1, 4000, 'residential', -8)];
    resolve(cs); buildCrossingGeometry(cs, route, () => 400, roads);
    const prev = vi.fn(), retired: THREE.Material[] = [];
    const mock = { world: new THREE.Group(), metresPerPixel: 2, onRender: prev as (() => void) | null,
      local: (x: number, y: number, z: number, v = new THREE.Vector3()) => v.set(x, z, -y),
      crossingSurfaces: crossingSurfaces(cs, () => 400), groundHeight: () => 400,
      crossingEarthMaterial: () => new THREE.MeshBasicMaterial(), crossingGroundMaterial: () => new THREE.MeshBasicMaterial(),
      drape: () => 401, replacementHeight: () => 400, requestRender: vi.fn(), retire: (m: THREE.Material) => { retired.push(m); } };
    const renderer = new CrossingRenderer(mock as unknown as View);
    renderer.setResult({ crossings: cs, grade: Float64Array.of(400), ground: Float64Array.of(400) });
    const group = mock.world.getObjectByName('crossing-roads')!;
    expect(group.children.length).toBeGreaterThan(0);
    expect(group.children.every(c => ((c as THREE.Mesh).material as THREE.Material).depthTest)).toBe(true);
    const mesh = group.getObjectByName('crossing-earthworks') as THREE.Mesh;
    const positions = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(Array.from({ length: positions.count }, (_, i) => positions.getY(i)).some(z => z >= 400 && z <= 400.3)).toBe(true);
    expect(mock.world.getObjectByName('crossing-symbols')).toBeUndefined();
    expect(mock.onRender).toBe(prev); mock.onRender!(); expect(prev).toHaveBeenCalled();
    const count = group.children.length; mock.onRender!(); expect(group.children).toHaveLength(count);
    mock.crossingSurfaces = [];
    renderer.setResult({ crossings: [], grade: Float64Array.of(400), ground: Float64Array.of(400) });
    expect(group.children).toHaveLength(0); expect(retired.length).toBeGreaterThan(0);
    renderer.dispose(); expect(mock.world.children).toHaveLength(0); expect(mock.onRender).toBe(prev);
  });
});
