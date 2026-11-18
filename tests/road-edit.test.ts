import { describe, expect, it } from 'vitest';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { ProjectTransportIndex } from '../src/core/project-network';
import type { ProjectDesign } from '../src/core/project';
import type { TransportGraphData } from '../src/core/project-transport';
import { evaluateProjectRoad } from '../src/core/project-road';
import { assertProjectDesign } from '../src/core/project-validation';
import { BuildingIndex } from '../src/core/buildings';
import { RoadNet } from '../src/core/roadnet';
import { syntheticTerrain } from '../src/core/terrain';
import { bendAt, coveredStretches, derivedStretch, fitBends, isTraffic, moveStretchEnds, newRoad, rebuildable, rebuildCommand, strayDistance } from '../src/ui/road-edit';
import { CLASS_TRAFFIC, UNCOUNTED_TRAFFIC } from '../src/core/data/traffic';
import { basePerKm } from '../src/core/cost';
import type { TrafficCensus } from '../src/core/traffic-census';
import { coveredText, mappedRoadName } from '../src/core/terms';
import { evaluate, MINOR_CROSSROADS_BAND } from '../src/core/evaluate';
import { MINOR_CROSSROADS } from '../src/core/data/urban';
import { startDesign } from '../src/state';

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
  it('rebuilds every ground road with a cross-section for its class; motorways and slip roads say they cannot be changed', () => {
    const { base, graph, terrain } = fixture();
    expect(rebuildable(base, 'main')).toMatchObject({ ok: true, spec: { legalClass: 'III', crossSection: 'S7.5' } });
    expect(rebuildable(base, 'side1')).toMatchObject({ ok: true, spec: { legalClass: 'track', crossSection: 'P4' } });
    const as = (highway: string) => { graph.sources[0].tags.highway = highway; return rebuildable(new ProjectTransportIndex(graph, 'transport', 'vectors', terrain), 'main'); };
    expect(as('residential')).toMatchObject({ ok: true, spec: { legalClass: 'local', crossSection: 'M7.5' } });
    expect(as('service')).toMatchObject({ ok: true, spec: { legalClass: 'service', crossSection: 'P4' } });
    expect(as('trunk')).toEqual({ ok: false, why: 'Motorways and expressways cannot be changed yet.' });
    expect(as('primary_link')).toEqual({ ok: false, why: 'Slip roads cannot be changed yet.' });
  });

  it('a rebuilt track is designed and priced as a paved one-lane track (ČSN 73 6109, SPK P4), not as a class road', () => {
    const { base, terrain, net, project } = fixture();
    const command = rebuildCommand(base, { transportData: 'transport', sourceId: 'side1', s0: 0, s1: 400 }, { routeId: 'r', acousticSourceId: 'a' });
    const p = structuredClone(project); p.routes.push(...command.routes); p.connections.push(...command.connections);
    assertProjectDesign(p);
    const route = p.routes[0];
    // the lowest speed its norm allows (a secondary track), the player can raise it
    expect(route.specification).toMatchObject({ policy: 'legacy-road', legalClass: 'track', crossSection: 'P4', designSpeed: 20 });
    // the census counts no tracks: a field track's low guess, not the average class III road (QA f9f5d9d: 736 a day)
    expect(route.specification.kind === 'road' && route.specification.operations).toMatchObject({ aadt: UNCOUNTED_TRAFFIC.track.aadt, heavyShare: UNCOUNTED_TRAFFIC.track.heavyShare });
    if (route.alignment.kind !== 'pi') throw new Error('converted');
    // dragged 40 m off its line: a new part, under the track's own rules and price
    route.alignment.pis = [{ x: 540, y: 1200, r: null }];
    const roads = new RoadNet(net), ctx = { terrain, scenario: D11_SCENARIO, a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, roads };
    const e = evaluateProjectRoad(ctx, p, 'r', 'objects', { sourceWays: new Map([['main', 0], ['side1', 1], ['side2', 2]]) });
    expect(e.status).toBe('evaluated');
    if (e.status !== 'evaluated') return;
    expect(e.result.violations.filter(v => v.basis === 'norm')).toEqual([]);
    // where built anew: the SPK P4 row per km less its 6,000 m³/km earthworks, never a class road's price
    const perKm = Math.max(...e.result.parts.roadBase) / e.result.ds * 1000;
    expect(perKm).toBeCloseTo(basePerKm('P4', 'hilly'), 0);
    expect(basePerKm('P4', 'hilly')).toBeGreaterThan(0.8 * 13_985_684.5);
    expect(basePerKm('P4', 'hilly')).toBeLessThan(13_985_684.5);
  });

  it('a local road meets a street it crosses in a crossroads at that street\'s level, not cut through the hump it lies on', () => {
    const terrain = syntheticTerrain(260, 120, 5, x => 100 + 4 * Math.max(0, 1 - Math.abs(x - 600) / 40));
    const roads = new RoadNet({ cls: ['residential'], ways: [[0, 600, 20, 600, 480]] });
    const r = evaluate({ terrain, scenario: D11_SCENARIO, a: { x: 100, y: 250 }, b: { x: 1100, y: 250 }, roads }, { ...startDesign(), category: 'M7.5', speed: 30 });
    const [c] = r.crossings;
    expect(c).toMatchObject({ type: 'junction', cost: MINOR_CROSSROADS.local });
    expect(Math.abs(c.h)).toBeLessThanOrEqual(MINOR_CROSSROADS_BAND + 0.5); // Auto alone cut 3.75 m into it
    expect(c.issues ?? []).toEqual([]);
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

  it('stops short of where another road\'s earthworks cover the old road; a grab there says so', () => {
    const { base, stations } = fixture();
    // our road crosses the class III road at x = 1250 on earthworks 12 m to either side (a bridge covers nothing)
    const n = 81, ours = { name: 'our road', n, x: Array.from({ length: n }, () => 1250), y: Array.from({ length: n }, (_, i) => 800 + 5 * i),
      tx: Array(n).fill(0), ty: Array(n).fill(1), kind: Array(n).fill(0), dayL: Array(n).fill(12), dayR: Array(n).fill(-12) };
    const covered = coveredStretches(base, 'main', [ours]);
    expect(covered).toHaveLength(1);
    const at = stations[2] + Math.hypot(550, 30) * 250 / 550; // where the old road meets x = 1250
    const reach = (12 + 10) * Math.hypot(550, 30) / 550; // earthworks + 10 m clearance, measured along the oblique road
    expect(covered[0].s0).toBeCloseTo(at - reach, -1); expect(covered[0].s1).toBeCloseTo(at + reach, -1);
    expect(covered[0].by).toBe('our road');
    // the stretch around x = 900 ends before them; one grabbed on them does not exist
    expect(derivedStretch(base, 'main', 900, covered)).toMatchObject({ s0: stations[1], s1: covered[0].s0 });
    expect(derivedStretch(base, 'main', at, covered)).toBeNull();
    expect(coveredStretches(base, 'main', [{ ...ours, kind: Array(n).fill(1) }])).toEqual([]);
    // carried over our cutting on a bridge, it is not gone; cut and rerouted, it is
    const crossing = (type: string) => [{ ...ours, crossings: [{ x: 1250, y: 1030 - 30 * 250 / 550, roadId: 0, type }] }];
    expect(coveredStretches(base, 'main', crossing('overbridge'))).toEqual([]);
    expect(coveredStretches(base, 'main', crossing('diversion'))).toEqual(covered);
    // another road's bridge there does not uncover what our earthworks bury
    const other = { ...ours, name: 'other road', x: Array(n).fill(5000), crossings: crossing('overbridge')[0].crossings };
    expect(coveredStretches(base, 'main', [ours, other])).toEqual(covered);
    expect(coveredText('our road')).toBe('Our road covers it here: pick it further away.');
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
    // no census with this map: the average class III road, never "not set"
    expect(route.specification).toMatchObject({ policy: 'legacy-road', legalClass: 'III', crossSection: 'S7.5', operations: CLASS_TRAFFIC.III });
    expect(route.name).toBe('Road III/123');
    // both ends and both side roads stay joined
    expect(p.connections.map(c => c.ports[1].kind === 'source' && c.ports[1].location.sourceId).sort()).toEqual(['main', 'main', 'side1', 'side2']);
    const roads = new RoadNet(net), ctx = { terrain, scenario: D11_SCENARIO, a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, roads };
    const withLinks = evaluateProjectRoad(ctx, p, 'r', 'objects', { sourceWays: new Map([['main', 0], ['side1', 1], ['side2', 2]]) });
    expect(withLinks.status).toBe('evaluated');
    if (withLinks.status !== 'evaluated') return;
    // the replacement itself is priced (C1 b), traffic included
    expect(withLinks.unpriced).toBeUndefined();
    expect(withLinks.replacement).toBeDefined();
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

  it('starts with the traffic counted on that stretch, else the average of its class; never asks for it', () => {
    const { graph, terrain, project } = fixture();
    // the census counted road 123 west of x = 1000 (2 400 vehicles, 180 heavy), left its east uncounted,
    // and counted another road number right beside it
    const census: TrafficCensus = { version: 1, source: 'test', year: 2025, sections: [
      { id: '1-0010', road: '123', vehicles: 2400, heavy: 180, lines: [[0, 1004, 500, 1004, 1000, 1034]] },
      { id: '1-0011', road: '123', vehicles: 0, heavy: 0, lines: [[1000, 1034, 1550, 1004, 2000, 1004]] },
      { id: '1-0020', road: '45', vehicles: 9000, heavy: 900, lines: [[0, 1001, 2000, 1001]] }] };
    const base = new ProjectTransportIndex(graph, 'transport', 'vectors', terrain, census);
    const west = { transportData: 'transport', sourceId: 'main', s0: 100, s1: 900 }, east = { ...west, s0: 1100, s1: 1900 };
    expect(base.traffic(west, 'III')).toEqual({ aadt: 2400, heavyShare: 0.075, basis: 'census', year: 2025, section: '1-0010' });
    expect(base.traffic(east, 'III')).toEqual({ ...CLASS_TRAFFIC.III, basis: 'class' }); // not counted is not "no traffic"
    const command = rebuildCommand(base, west, { routeId: 'r', acousticSourceId: 'a' });
    const route = command.routes[0]; if (route.kind !== 'road') throw new Error('fixture');
    expect(route.specification.operations).toMatchObject({ aadt: 2400, heavyShare: 0.075 });
    expect(isTraffic(route.specification.operations, base.traffic(west, 'III'))).toBe(true);
    // moved into the uncounted part: the filled-in number follows; the player's own number stays
    const p = structuredClone(project); p.routes.push(route); p.connections.push(...command.connections);
    const moved = moveStretchEnds(base, p, 'r', 1100, 1900).routes[0];
    expect(moved.kind === 'road' && moved.specification.operations).toMatchObject(CLASS_TRAFFIC.III);
    route.specification.operations.aadt = 5000;
    const own = structuredClone(project); own.routes.push(route); own.connections.push(...command.connections);
    const kept = moveStretchEnds(base, own, 'r', 1100, 1900).routes[0];
    expect(kept.kind === 'road' && kept.specification.operations.aadt).toBe(5000);
    // Build → Road: the average class II road
    const end = (x: number) => ({ position: { x, y: 500, z: 300 }, anchor: { kind: 'free' as const } });
    expect(newRoad(project, end(100), end(900), { routeId: 'n', acousticSourceId: 'b' }).specification).toMatchObject({ legalClass: 'II', operations: CLASS_TRAFFIC.II });
  });

  it('a drag that starts on a bend\'s curve moves that bend; on a straight it adds one', () => {
    // 700 m east, a 90° corner with a 60 m radius, 700 m north
    const a = { x: 300, y: 300 }, b = { x: 1000, y: 1000 }, pis = [{ x: 1000, y: 300, r: 60 }];
    // on the arc (its middle lies 60·(√2 − 1) ≈ 25 m inside the corner point): the corner itself is moved
    const onArc = { x: 1000 - 60 + 60 * Math.SQRT1_2, y: 300 + 60 - 60 * Math.SQRT1_2 };
    expect(bendAt(a, b, pis, 70, 'S7.5', onArc)).toBe(0);
    expect(bendAt(a, b, pis, 70, 'S7.5', { x: 600, y: 300 })).toBeNull(); // the straight: a new bend
    expect(bendAt(a, b, pis, 70, 'S7.5', { x: 600, y: 400 })).toBeNull(); // off the road
    expect(bendAt(a, b, [], 70, 'S7.5', { x: 600, y: 300 })).toBeNull();
    // within a margin of its curve along the road: that bend (a new bend there would crowd it)
    expect(bendAt(a, b, pis, 70, 'S7.5', { x: 600, y: 300 }, 15, 1e4)).toBe(0);
  });

  it('is not kept where another road\'s crossing lifts it onto a bridge or lowers it: there it is rebuilt with its ramps', async () => {
    const { releaseHeld, HELD_APPROACH } = await import('../src/core/project-kept');
    const s = Float64Array.from({ length: 101 }, (_, i) => i * 10), flat = () => 100;
    const all = () => new Uint8Array(101).fill(1), count = (k: Uint8Array) => k.reduce((t, v) => t + v, 0);
    // under the other road's bridge with room to spare: the old road stays as it lies
    const under = all(); releaseHeld(under, s, flat, [{ s: 500, min: -Infinity, max: 104 }], 0.06, 0.5);
    expect(count(under)).toBe(101);
    // on its own bridge over the other road, deck 6 m up: the 40 m deck, 100 m of ramp at 6 % and the curves' room
    const over = all(); releaseHeld(over, s, flat, [{ s: 500, min: 105.5, max: 106.5, bridge: [480, 520] }], 0.06, 0.5);
    const reach = 20 + 5.5 / 0.06 + HELD_APPROACH;
    for (let i = 0; i < 101; i++) expect(over[i]).toBe(Math.abs(s[i] - 500) <= reach ? 0 : 1);
    // lowered 3 m to pass under: rebuilt as far as the ramps reach
    const lowered = all(); releaseHeld(lowered, s, flat, [{ s: 500, min: -Infinity, max: 97 }], 0.06, 0.5);
    expect(lowered[50]).toBe(0); expect(lowered[50 + Math.ceil((3 / 0.06 + HELD_APPROACH) / 10) + 1]).toBe(1);
  });

  it('is rebuilt there on the old road\'s line the other road crossed, without a jump where it meets a piece kept', async () => {
    const { heldOnOldLine, releaseHeld, TIE_LENGTH } = await import('../src/core/project-kept');
    // the kernel's line 8 m north of the old road, all of it on the old road (kept) but its first 100 m (built anew)
    const s = Float64Array.from({ length: 101 }, (_, i) => i * 10), old = [[{ x: -10, y: 0 }, { x: 1010, y: 0 }]];
    const planned = Uint8Array.from(s, v => v >= 100 ? 1 : 0), kept = planned.slice();
    releaseHeld(kept, s, () => 100, [{ s: 700, min: 105.5, max: 106.5, bridge: [680, 720] }], 0.06, 0.5);
    expect(kept[70]).toBe(0); expect(kept[30]).toBe(1);
    const line = heldOnOldLine(planned, kept, 10, old)!;
    const at = (x: number) => { const p = { x, y: 8, tx: 1, ty: 0 }; line(x, p); return p; };
    // on the old road where it is lifted, and where it is kept on either side of that: no step between them
    for (const x of [300, 450, 455, 700, 950]) expect(at(x).y).toBeCloseTo(0, 9);
    // fading into its own line only beside the part built anew
    const fade = [100, 120, 140].map(x => at(x).y);
    expect(fade[0]).toBeLessThan(8); expect(fade[1]).toBeLessThan(fade[0]); expect(fade[2]).toBeLessThan(fade[1]); expect(at(100 + TIE_LENGTH).y).toBe(0);
    expect(at(50).y).toBe(8);
    // nothing lifted: the kernel's own line
    expect(heldOnOldLine(planned, planned, 10, old)).toBeUndefined();
  });

  it('never puts a bend far off the old road where close bends are merged (a jog between almost parallel legs)', () => {
    // east, a 30 m jog to the north within 60 m, east again; the outer legs are almost parallel and
    // would meet 1.5 km away
    const pts = [[0, 0], [400, 0], [430, 15], [460, 30], [900, 39]];
    let s = 0;
    const path = pts.map(([x, y], i) => { if (i) s += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]); return { x, y, s }; });
    const pis = fitBends(path);
    expect(pis.length).toBeGreaterThan(0);
    expect(strayDistance(pis, path)).toBeLessThan(1);
    // a rounded right-angle corner is still one bend at the corner point itself
    const corner = [[0, 0], [400, 0], [420, 5], [435, 20], [440, 40], [440, 500]];
    s = 0;
    const round = corner.map(([x, y], i) => { if (i) s += Math.hypot(x - corner[i - 1][0], y - corner[i - 1][1]); return { x, y, s }; });
    const one = fitBends(round, 3);
    expect(one).toHaveLength(1); expect(one[0].x).toBeCloseTo(440, 6); expect(one[0].y).toBeCloseTo(0, 6);
  });

  it('names mapped roads as Czech maps do', () => {
    expect(mappedRoadName({ highway: 'tertiary', ref: '1057' })).toBe('road III/1057');
    expect(mappedRoadName({ highway: 'primary', ref: '14;16' })).toBe('road I/14 and I/16');
    expect(mappedRoadName({ highway: 'secondary', ref: '104', name: 'Pražská' })).toBe('Pražská');
    expect(mappedRoadName({ highway: 'residential' })).toBe('street');
    expect(mappedRoadName({ highway: 'motorway', ref: 'D3' })).toBe('motorway D3');
    expect(mappedRoadName(undefined, 'a road')).toBe('a road');
  });
});

// Owner's D3 case (III/1057): right after the first drag the card showed "wanted 205 m, no room" and
// "Bend 1 is too close to its start" for bends the player had not touched.
describe('a rebuilt stretch inherits no violations from its old road', () => {
  // An old class III road: 700 m east, a sharp 90° corner (as old roads have), 700 m north; ends on side roads.
  // `beyond`: at b the same road goes on north as another mapped way, and a track leaves east
  function corner(ground: (x: number, y: number) => number = () => 300, s1 = 1400, beyond = false) {
    const xy = [300, 300, 1000, 300, 1000, 1000], stations = [0, 700, 1400];
    const graph: TransportGraphData = { version: 1, vectorData: 'vectors', renderFeatures: [], nodes: [
      { id: 'a', xy: [300, 300] }, { id: 'c', xy: [1000, 300] }, { id: 'b', xy: [1000, 1000] }, { id: 'n', xy: [1000, 1600] }, { id: 'e', xy: [1600, 1000] }], sources: [
      { id: 'old', osmWayId: '1', kind: 'road', nodes: ['a', 'c', 'b'], xy, stations, layer: 0, bridge: false, tunnel: false,
        elevation: 'terrain', tags: { highway: 'tertiary', ref: '1057', maxspeed: '90' }, render: [], legacyNetIndex: 0 },
      ...(beyond ? [
        { id: 'next', osmWayId: '2', kind: 'road' as const, nodes: ['b', 'n'], xy: [1000, 1000, 1000, 1600], stations: [0, 600], layer: 0, bridge: false, tunnel: false,
          elevation: 'terrain' as const, tags: { highway: 'tertiary', ref: '1057' }, render: [], legacyNetIndex: 1 },
        { id: 'lane', osmWayId: '3', kind: 'road' as const, nodes: ['b', 'e'], xy: [1000, 1000, 1600, 1000], stations: [0, 600], layer: 0, bridge: false, tunnel: false,
          elevation: 'terrain' as const, tags: { highway: 'track' }, render: [], legacyNetIndex: 2 }] : [])] };
    const terrain = syntheticTerrain(500, 500, 5, ground);
    const base = new ProjectTransportIndex(graph, 'transport', 'vectors', terrain);
    const project: ProjectDesign = { schemaVersion: 1, scenarioId: 'test', presetId: 'edit', packId: 'test', objectData: 'objects', transportData: 'transport',
      routes: [], corridors: [], connections: [], buildingOverrides: [], mission: { id: 'test', revision: 0, ports: [], connections: [] } };
    const ctx = { legacy: { terrain, scenario: D11_SCENARIO, a: { x: 0, y: 0 }, b: { x: 1, y: 1 },
      roads: new RoadNet({ cls: ['tertiary', 'track'], ways: [[0, ...xy], ...(beyond ? [[0, 1000, 1000, 1000, 1600], [1, 1000, 1000, 1600, 1000]] : [])] }),
      buildings: new BuildingIndex([[640, 312, 6]]) },
      environment: { objectData: 'objects', transportData: 'transport', terrainData: 't', pricingData: 'p', waterData: 'w', terrainClass: 'hilly' as const },
      sourceWays: new Map([['old', 0], ['next', 1], ['lane', 2]]) };
    const interval = { transportData: 'transport', sourceId: 'old', s0: 0, s1 };
    const command = rebuildCommand(base, interval, { routeId: 'r', acousticSourceId: 'a' });
    const route = command.routes[0];
    if (route.kind !== 'road' || route.alignment.kind !== 'pi') throw new Error('fixture');
    route.specification.operations = { ...route.specification.operations, aadt: 1500, heavyShare: 0.1 };
    const p = structuredClone(project); p.routes.push(route); p.connections.push(...command.connections);
    return { base, ctx, p, route, interval };
  }
  it('the conversion keeps a sharp old corner on the old road instead of cutting it with a norm-sized curve', async () => {
    const { route, base, interval } = corner();
    if (route.alignment.kind !== 'pi') throw new Error('fixture');
    // a 90° corner at the norm's R 205 m would run 85 m off the old road; the fit keeps the old corner's own curve
    expect(route.alignment.pis).toHaveLength(1);
    expect(route.alignment.pis[0].r).toBeGreaterThan(10); expect(route.alignment.pis[0].r).toBeLessThan(60);
    const { buildAlignment, station } = await import('../src/core/horizontal');
    const { horizontalRules } = await import('../src/core/data/norms');
    const st = station(buildAlignment(route.endpoints.a.position, route.endpoints.b.position, route.alignment.pis, horizontalRules(70, 'S7.5')), 5);
    expect(strayDistance(Array.from({ length: st.n }, (_, i) => ({ x: st.x[i], y: st.y[i] })), base.path(interval))).toBeLessThanOrEqual(8.5);
    // designed for 70 km/h (the lowest the norm allows); noise and travel time at the signed 90 km/h
    expect(route.specification).toMatchObject({ designSpeed: 70, operations: { speed: 90, speedPolicy: 'independent' } });
  });
  it('untouched, it is the old road kept as it is: valid, a note instead of violations, nothing billed, no house lost', async () => {
    const { evaluateProject } = await import('../src/core/project-evaluate');
    const { ctx, p } = corner();
    const result = evaluateProject(ctx, { epoch: 'e', revision: 1, design: p });
    const own = result.routes.r.legacy!;
    expect(own.violations.map(v => v.title)).toEqual([]);
    expect(own.valid).toBe(true); expect(result.valid).toBe(true); expect(result.cost.unpriced).toEqual([]);
    // what a new road would have to meet at the corner is a note about the old road, not the player's problem
    expect(own.inherited!.map(v => v.kind)).toContain('radius');
    expect(own.inherited!.every(v => v.pis?.includes(0) || v.pi === 0)).toBe(true);
    // every metre stays on the old road: nothing is billed, nothing is removed, the house beside it stays
    expect(own.keptCells!.every(k => k === 1)).toBe(true);
    expect(own.cost.total).toBe(0); expect(result.cost.total).toBe(0);
    expect(result.works.items.map(w => w.id.split(':')[1])).toEqual(['kept']);
    expect(result.buildings.filter(b => b.action !== 'retain')).toEqual([]);
  });
  // D3 III/11431: its End handle moved past a village corner gave "Bends 5 and 6 merge into one curve that is
  // too sharp" and houses under the new curve: the old end, now inside, became a bend with a norm-sized curve.
  it('lengthening into a sharp old corner keeps it as the old road has it; the player\'s own bend stays', async () => {
    const { evaluateProject } = await import('../src/core/project-evaluate');
    // the stretch ends exactly at the corner, so it starts as a straight
    const { ctx, p, base } = corner(undefined, 700);
    const whole = { transportData: 'transport', sourceId: 'old', s0: 0, s1: 1400 };
    const lengthened = (design: ProjectDesign) => {
      const next = moveStretchEnds(base, design, 'r', 0, 1400), route = next.routes[0];
      if (route.alignment.kind !== 'pi') throw new Error('pi');
      const result = evaluateProject(ctx, { epoch: 'e', revision: 1, design: next }).routes.r.legacy!;
      return { pis: route.alignment.pis, result };
    };
    const untouched = lengthened(p);
    expect(untouched.pis).toHaveLength(1);
    expect(untouched.pis[0].r).toBeGreaterThan(10); expect(untouched.pis[0].r).toBeLessThan(60);
    expect(untouched.result.keptCells!.every(k => k === 1)).toBe(true);
    expect(untouched.result.violations).toEqual([]);
    // a bend the player pulled 40 m off the old road stays where it is; the corner is still the old road's
    const own = p.routes[0];
    if (own.alignment.kind !== 'pi') throw new Error('pi');
    own.alignment.pis = [{ x: 500, y: 340, r: null }];
    const moved = lengthened(p);
    expect(moved.pis[0]).toEqual({ x: 500, y: 340, r: null });
    expect(moved.pis.at(-1)!.r).toBeLessThan(60);
    const { result } = moved, corner700 = result.s.findIndex(s => s > 650);
    for (let i = corner700; i < result.n; i++) expect(result.keptCells![i]).toBe(1);
    expect(result.violations.every(v => v.s1 < 650)).toBe(true);
    expect(base.path(whole).length).toBe(3);
  });
  // QA (D11 class I Novorokytnická, a 45 px drag): "321 m stay on the old road: kept as it is", 0 CZK, while
  // the map drew it up to 11 m off its old line
  it('what is kept is drawn on the old road\'s own line, however far within the tolerance the bends went', async () => {
    const { evaluateProject } = await import('../src/core/project-evaluate');
    const { KEPT_TOLERANCE } = await import('../src/core/project-kept');
    const { ctx, p, route, base, interval } = corner();
    const moved = p.routes[0];
    if (moved.alignment.kind !== 'pi' || route.alignment.kind !== 'pi') throw new Error('fixture');
    // its corner pulled 7 m outwards: still within the tolerance everywhere
    moved.alignment.pis = route.alignment.pis.map(q => ({ ...q, x: q.x + 5, y: q.y - 5 }));
    const own = evaluateProject(ctx, { epoch: 'e', revision: 1, design: p }).routes.r.legacy!;
    expect(own.keptCells!.every(k => k === 1), String(own.keptCells)).toBe(true);
    expect(own.cost.total).toBe(0);
    const old = base.path(interval), line = Array.from({ length: own.n }, (_, i) => ({ x: own.x[i], y: own.y[i] }));
    expect(strayDistance(line, old)).toBeLessThan(0.01);
    for (let i = 0; i < own.n; i++) expect(own.ground[i]).toBe(ctx.legacy.terrain.heightAt(own.x[i], own.y[i]));
    expect(KEPT_TOLERANCE).toBeGreaterThan(10);
  });
  // QA (D11 Novorokytnická dragged near its end): "Junction with the class I road at km 0.00 · 25 M CZK"
  // where that class I road was the edited road itself, going on as another mapped way
  it('where it is built anew up to its end, the old road going on there is no junction; a track there is', async () => {
    const { evaluateProject } = await import('../src/core/project-evaluate');
    const { ctx, p, route } = corner(undefined, 1400, true);
    const moved = p.routes[0];
    if (moved.alignment.kind !== 'pi' || route.alignment.kind !== 'pi') throw new Error('fixture');
    moved.alignment.pis = [...route.alignment.pis, { x: 950, y: 930, r: null }];
    const result = evaluateProject(ctx, { epoch: 'e', revision: 1, design: p });
    expect(result.routes.r.legacy!.keptCells!.at(-1)).toBe(0);
    const labels = result.works.items.map(w => w.label);
    expect(labels.filter(l => /class III road/.test(l ?? ''))).toEqual([]);
    expect(labels.some(l => /Junction with the track/.test(l ?? ''))).toBe(true);
  });
  it('a bend moved off the old road is a new road there: the norm applies and it is billed', async () => {
    const { evaluateProject } = await import('../src/core/project-evaluate');
    const { ctx, p, route } = corner();
    const moved = p.routes[0];
    if (moved.alignment.kind !== 'pi' || route.alignment.kind !== 'pi') throw new Error('fixture');
    // the corner pulled 80 m inwards, still with the old corner's tight radius
    moved.alignment.pis = [{ x: 920, y: 380, r: route.alignment.pis[0].r }];
    const result = evaluateProject(ctx, { epoch: 'e', revision: 1, design: p });
    const own = result.routes.r.legacy!;
    expect(own.violations.map(v => v.kind)).toContain('radius');
    expect(own.inherited ?? []).toEqual([]);
    expect(own.valid).toBe(false);
    // its ends still lie on the old road (kept, not billed); the part in between is built and billed
    const kept = result.works.items.find(w => w.id.includes(':kept:'))!;
    expect(kept.cost).toBe(0); expect(own.cost.total).toBeGreaterThan(1e6);
    for (let i = 0; i < own.n; i++) if (own.keptCells![i]) expect(Object.values(own.parts).every(part => (part as Float64Array)[i] === 0)).toBe(true);
    expect(result.works.items.some(w => w.id.includes(':removal:'))).toBe(true);
    expect(result.cost.alone.r).toBeGreaterThan(1e6);
  });
  // Owner's D11 case (Jičínská): the rebuilt road sat flat in a 6 m cut for 0.85 km, and climbed onto a
  // 6 m embankment further on: Auto designed the kept old road too, as a new road.
  it('is drawn on the ground where the old road is kept; a new part starts and ends at the old road\'s height', async () => {
    const { evaluateProject } = await import('../src/core/project-evaluate');
    const { OLD_ROAD_TIE } = await import('../src/core/evaluate');
    const { CLEARANCE_MARGIN } = await import('../src/core/autoprofile');
    const { TIE_LENGTH } = await import('../src/core/project-kept');
    // a rough surface (as a surveyed road is), rising 12 m along the stretch, and a 9 m mound inside the corner
    const rough = (x: number, y: number) => 300 + (x + y) * 0.006 + 1.2 * Math.sin(x / 37) + 0.8 * Math.cos(y / 29)
      + 9 * Math.exp(-((x - 900) ** 2 + (y - 400) ** 2) / 60 ** 2);
    const untouched = corner(rough);
    const own = evaluateProject(untouched.ctx, { epoch: 'e', revision: 1, design: untouched.p }).routes.r.legacy!;
    expect(own.keptCells!.every(k => k === 1)).toBe(true);
    for (let i = 0; i < own.n; i++) {
      expect(own.grade[i]).toBe(own.ground[i]); expect(own.cut[i]).toBe(0); expect(own.fill[i]).toBe(0);
      expect(own.dayL[i]).toBe(3.75); expect(own.zDayR[i]).toBe(own.ground[i]);
    }
    // the corner pulled inwards, onto the mound
    const { ctx, p, route } = corner(rough);
    const moved = p.routes[0];
    if (moved.alignment.kind !== 'pi' || route.alignment.kind !== 'pi') throw new Error('fixture');
    moved.alignment.pis = [{ x: 920, y: 380, r: 60 }];
    const r = evaluateProject(ctx, { epoch: 'e', revision: 1, design: p }).routes.r.legacy!, kept = r.keptCells!;
    const anew = Array.from({ length: r.n }, (_, i) => i).filter(i => !kept[i]);
    expect(anew.length).toBeGreaterThan(5); expect(anew.length).toBeLessThan(r.n - 10);
    const far = (i: number) => Math.min(...anew.map(k => Math.abs(k - i))) * r.ds;
    for (let i = 0; i < r.n; i++) if (kept[i]) {
      // on the ground beyond the run-out; within it never further off than Auto's tie allows
      if (far(i) >= TIE_LENGTH) expect(r.grade[i]).toBe(r.ground[i]);
      else expect(Math.abs(r.grade[i] - r.ground[i])).toBeLessThanOrEqual(OLD_ROAD_TIE + CLEARANCE_MARGIN + 0.5);
    }
    // the new part itself is engineered: it goes through the mound, not over the old road's level
    expect(Math.max(...anew.map(i => Math.abs(r.grade[i] - r.ground[i])))).toBeGreaterThan(1);
    for (const i of [anew[0], anew[anew.length - 1]]) expect(Math.abs(r.grade[i] - r.ground[i])).toBeLessThanOrEqual(OLD_ROAD_TIE + CLEARANCE_MARGIN + 1.5);
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

describe('pricing a rebuilt stretch (C1 b)', () => {
  it('adds removing the old road where the new line leaves it and keeps every side road joined; the stretch is accepted', async () => {
    const { evaluateProject } = await import('../src/core/project-evaluate');
    const { REMOVAL } = await import('../src/core/project-replacement');
    const { ROAD_CLASSES } = await import('../src/core/data/urban');
    const { base, terrain, net, project, stations } = fixture();
    // from the road's start to the second side road: the first side road joins in the middle of the stretch
    const interval = derivedStretch(base, 'main', stations[1] + 100, [])!;
    const command = rebuildCommand(base, interval, { routeId: 'r', acousticSourceId: 'a' });
    const route = command.routes[0];
    if (route.kind !== 'road' || route.alignment.kind !== 'pi') throw new Error('fixture');
    route.specification.operations = { aadt: 2000, heavyShare: 0.05, speed: 70, speedPolicy: 'design' };
    route.alignment.pis = [{ x: 1000, y: 1090, r: null }]; // pulled 60 m off the old road's kink
    const p = structuredClone(project); p.routes.push(route); p.connections.push(...command.connections);
    const ctx = { legacy: { terrain, scenario: D11_SCENARIO, a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, roads: new RoadNet(net) },
      environment: { objectData: 'objects', transportData: 'transport', terrainData: 't', pricingData: 'p', waterData: 'w', terrainClass: 'hilly' as const },
      sourceWays: new Map([['main', 0], ['side1', 1], ['side2', 2]]) };
    const result = evaluateProject(ctx, { epoch: 'e', revision: 1, design: p });
    expect(result.cost.unpriced).toEqual([]);
    const works = result.works.items;
    const removal = works.find(w => w.id.includes(':removal:'))!;
    const removed = removal.geometry.measurements[0].quantity;
    expect(removed).toBeGreaterThan(100);
    expect(removal.cost).toBeCloseTo(removed * ROAD_CLASSES.tertiary.width * (REMOVAL.coverDepth * REMOVAL.coverPerM3 + REMOVAL.baseDepth * REMOVAL.basePerM3 + REMOVAL.restorePerM2), 3);
    const own = result.routes.r.legacy!;
    // where the new road covers the old one without keeping it, the old road's land (its pavement width) is
    // not bought again (here: nowhere on this flat ground; the works alone, with nothing kept and land
    // bought at 100 CZK/m² along the whole line, show the credit)
    const landLength = works.find(w => w.id.includes(':land:'))?.geometry.measurements[0].quantity ?? 0;
    const { replacementWorks } = await import('../src/core/project-replacement');
    const bought = { ...own, parts: { ...own.parts, land: Float64Array.from(own.cell.width, w => w * own.ds * 100) } };
    const land = replacementWorks(route, bought, new RoadNet(net), 0, [], () => undefined).works.find(w => w.kind === 'land')!;
    expect(land.cost).toBeLessThan(0);
    expect(-land.cost).toBeLessThan(bought.parts.land.reduce((t, v) => t + v, 0));
    // the removed old road is this road's work on the ground too: its pieces go into the land screen, so no
    // other road is priced as if that ground were free
    const gone = replacementWorks(route, own, new RoadNet(net), 0, [], () => undefined, own.keptCells);
    expect(gone.removed.reduce((t, l) => t + Math.hypot(l.bx - l.ax, l.by - l.ay), 0)).toBeCloseTo(removed, 3);
    expect(gone.removedWidth).toBe(ROAD_CLASSES.tertiary.width);
    // (and without anything kept, the side road at the stretch's end would get a junction with the new road)
    expect(replacementWorks(route, own, new RoadNet(net), 0, p.connections, id => ctx.sourceWays.get(id)).works.filter(w => w.kind === 'reconnection').map(w => w.label)).toEqual([expect.stringMatching(/^Junction with the track at km \d\.\d\d$/)]);
    // near its ends the new line is still on the old road: kept as it is there, and the road's own bill
    // charges nothing for those metres (what is billed is what is built)
    const kept = works.find(w => w.id.includes(':kept:'))!, keptLength = kept.geometry.measurements[0].quantity;
    expect(keptLength).toBeGreaterThan(50); expect(kept.label).toMatch(/^\d+ m stay on the old road: kept as it is, not built anew$/);
    expect(kept.cost).toBe(0);
    expect(Object.values(own.parts).reduce((t, part) => t + (part as Float64Array).reduce((u, v, i) => u + (own.keptCells![i] ? v : 0), 0), 0)).toBe(0);
    expect(own.cost.total).toBeCloseTo(Object.values(own.parts).reduce((t, part) => t + (part as Float64Array).reduce((u, v) => u + v, 0), 0), 3);
    expect(landLength + removed + keptLength).toBeCloseTo(interval.s1 - interval.s0, -2);
    // the side road in the middle now crosses the new road: the road's own crossing work keeps it joined;
    // the one at the stretch's end, where the old road is kept, keeps its junction as it is (nothing billed)
    expect(own.crossings.some(c => c.roadId === 1)).toBe(true);
    expect(works.filter(w => w.id.includes(':reconnection:'))).toEqual([]);
    expect(result.cost.alone.r).toBeCloseTo(own.cost.total + works.reduce((t, w) => t + w.cost, 0), 3);
    expect(result.cost.total).toBeCloseTo(result.cost.alone.r, 3);
    expect(result.cost.routes.r).toBe(result.cost.total);
    // (it joins the new road where it crosses it, an access; its piece beyond, which led only to the old road, is taken up)
    expect(own.crossings.find(c => c.roadId === 1)!.type).toBe('junction');
    expect(result.acceptedReplacements).toEqual([interval, { transportData: 'transport', sourceId: 'side1', s0: expect.any(Number), s1: expect.any(Number) }]);
    const stub = result.acceptedReplacements[1];
    expect(stub.s1 - stub.s0).toBeGreaterThan(20); expect(stub.s1 - stub.s0).toBeLessThan(70);
  });
});

it('takes a traffic census only with real numbers; anything else falls back to class averages', async () => {
  const { validTrafficCensus } = await import('../src/core/traffic-census');
  const section = { id: '1-0010', road: '123', vehicles: 2400, heavy: 180, lines: [[0, 0, 10, 0]] };
  expect(validTrafficCensus({ version: 1, source: 'test', year: 2025, sections: [section] })).toBe(true);
  for (const bad of [{ vehicles: '2400' }, { heavy: null }, { vehicles: Infinity }, { lines: [[0, 0, '10', 0]] }, { lines: [[0, 0]] }])
    expect(validTrafficCensus({ version: 1, source: 'test', year: 2025, sections: [{ ...section, ...bad }] })).toBe(false);
  expect(validTrafficCensus({ version: 2, year: 2025, sections: [] })).toBe(false);
});
