import { describe, expect, it } from 'vitest';
import { footprintConflicts, structureFootprints, type FootprintRoute } from '../src/core/footprint';
import { RoadNet } from '../src/core/roadnet';
import { syntheticTerrain, Terrain, LC, RAIL_CROSSING_BIT, BUILTUP_BIT } from '../src/core/terrain';
import { KIND } from '../src/core/structures';
import { ROAD_CLASSES } from '../src/core/data/urban';
import type { CrossingResult } from '../src/core/crossings';
import { waterSize, type WaterCrossing, type WaterData } from '../src/core/watercourses';

function route(): FootprintRoute {
  const n = 101, array = (v: number) => new Float64Array(n).fill(v);
  return { n, ds: 10, s: Float64Array.from({ length: n }, (_, i) => i * 10),
    x: Float64Array.from({ length: n }, (_, i) => 100 + i * 10), y: array(250), tx: array(1), ty: array(0),
    kind: new Uint8Array(n), grade: array(105), dayL: array(20), dayR: array(20), zDayL: array(100), zDayR: array(100), crownWidth: 10, runs: [] };
}
const terrain = () => syntheticTerrain(260, 100, 5, () => 100);
const road = (cls = 'service', y = 260) => new RoadNet({ cls: [cls], ways: [[0, 0, y, 1250, y]] });
const check = (r = route(), roads = road(), t = terrain(), crossings: CrossingResult[] = []) => footprintConflicts(r, t, roads, crossings, [], []);

describe('constructed footprint conflicts', () => {
  it('relocates a lengthwise road with real tie-ins outside the toe, using its SPK class row', () => {
    const { conflicts, violations } = check();
    expect(violations).toEqual([]);
    expect(conflicts).toHaveLength(1);
    const c = conflicts[0];
    expect(c.action).toBe('relocation');
    expect(c.affectedLength).toBeCloseTo(1004, 4); // endpoints plus road half-width
    expect(c.length).toBeGreaterThan(c.affectedLength!);
    expect(c.cost).toBeCloseTo(c.length * ROAD_CLASSES.service.roadPerKm[0] / 1000, 4);
    expect(c.geometry!.road![0].y).toBe(260);
    expect(c.geometry!.road!.at(-1)!.y).toBe(260);
    expect(c.geometry!.road!.filter(p => p.x > 100 && p.x < 1100).every(p => p.y >= 275)).toBe(true);
  });
  it('checks cuts too, ignores roads outside the footprint, and prices urban paved tracks correctly', () => {
    const r = route(); r.grade = new Float64Array(r.n).fill(95);
    expect(check(r, road('service', 290)).conflicts).toEqual([]);
    const t = terrain(); t.lc.fill(BUILTUP_BIT);
    const c = check(r, road('residential'), t).conflicts[0];
    expect(c.cost).toBeCloseTo(c.length * ROAD_CLASSES.residential.roadPerKm[1] / 1000, 4);
    const track = check(r, road('track'), t).conflicts[0];
    expect(track.cost).toBeCloseTo(track.length * ROAD_CLASSES.track.roadPerKm[1] / 1000, 4);
  });
  it('subtracts a crossing’s handled original-road interval, not its entire way', () => {
    const crossings: CrossingResult[] = [{ s: 500, i: 50, x: 600, y: 260, cls: 'service', roadId: 0, h: 0, type: 'junction', cost: 25e6,
      geometry: { width: 4, schematic: false, road: [300, 900].map(x => ({ x, y: 260, z: 100, ground: 100, surface: 'terrain' })) } }];
    const result = check(route(), road(), terrain(), crossings);
    expect(result.conflicts.reduce((sum, c) => sum + c.affectedLength!, 0)).toBeCloseTo(394, 4); // half-station geometric tolerance
    expect(result.conflicts.every(c => c.original!.every(p => p.x <= 300 || p.x >= 900))).toBe(true);
    // A spacing-invalid manual choice still pays its approaches; don't charge them again.
    crossings[0].issues = [{ kind: 'crossing', basis: 'game', s0: 500, s1: 500, title: 'spacing', fix: 'move', rule: 'spacing', crossing: { requested: 'junction', code: 'spacing' } }];
    expect(check(route(), road(), terrain(), crossings).conflicts.reduce((sum, c) => sum + c.affectedLength!, 0)).toBeCloseTo(394, 4);
    // A one-sided reconnection already removes the old-way stub beyond its sole turnaround.
    crossings[0].type = 'reconnection'; crossings[0].geometry!.turnarounds = [crossings[0].geometry!.road![0]];
    expect(check(route(), road(), terrain(), crossings).conflicts.reduce((sum, c) => sum + c.affectedLength!, 0)).toBeCloseTo(197, 4);
    crossings[0].issues![0].crossing.code = 'geometry'; // second required branch has no anchor
    expect(check(route(), road(), terrain(), crossings).conflicts.reduce((sum, c) => sum + c.affectedLength!, 0)).toBeCloseTo(694, 4);
  });
  it('motorways cannot use the cheap road-reconnection fallback', () => {
    const r = check(route(), road('motorway'));
    expect(r.conflicts[0].action).toBe('blocked');
    expect(r.conflicts[0].cost).toBe(0);
    expect(r.violations[0].fix).toMatch(/bridge/);
    // OSM motorway ways are one carriageway, not two overlapping full-width D27.5 roads.
    expect(check(route(), road('motorway', 280)).conflicts).toEqual([]);
  });
  it('retains roads and rail beneath free spans but screens abutments, piers and portals', () => {
    const r = route(); r.kind = new Uint8Array(r.n).fill(KIND.bridge);
    r.runs = [{ kind: KIND.bridge, i0: 1, i1: 99, s0: 5, s1: 995, length: 990 }];
    // A road beside the supports remains intact under the deck, not relocated as if it were fill.
    expect(check(r, road('service', 260)).conflicts).toEqual([]);
    const supports = structureFootprints(r);
    expect(supports.filter(c => c.structure === 'pier')).toHaveLength(32);
    const abutment = supports[0], t = terrain();
    const row = Math.floor((t.height - abutment.y) / t.cell), col = Math.floor(abutment.x / t.cell);
    t.lc[row * t.nx + col] = LC.road | RAIL_CROSSING_BIT;
    const blocked = footprintConflicts(r, t, undefined, [], [], []);
    expect(blocked.conflicts.some(c => c.feature === 'railway' && c.detail.includes('abutment'))).toBe(true);
    r.runs[0].kind = KIND.tunnel; r.kind = new Uint8Array(r.n).fill(KIND.tunnel);
    expect(structureFootprints(r).every(c => c.structure === 'portal')).toBe(true);
    expect(footprintConflicts(r, t, undefined, [], [], []).violations[0].title).toContain('portal');
  });
  it('detects side-footprint ponds and railway cells that never intersect the centreline', () => {
    const t = terrain();
    for (let col = 80; col < 90; col++) t.lc[47 * t.nx + col] = LC.water;
    for (let col = 110; col < 120; col++) t.lc[52 * t.nx + col] = LC.road | RAIL_CROSSING_BIT;
    const r = footprintConflicts(route(), t, undefined, [], [], []);
    expect(r.conflicts.map(c => c.feature)).toEqual(['water', 'railway']);
    expect(r.conflicts.every(c => c.action === 'blocked' && c.cost === 0)).toBe(true);
  });
  it('extends a compatible crossing barrel without paying for another pair of heads or leaving an unpriced gap', () => {
    const watercourses: WaterData = { version: 1, method: 'synthetic', reaches: [{ id: 1, kind: 'ditch', width: 0.5,
      points: [[500, 150], [500, 400]], catchmentKm2: [0.1, 0.1], truncated: [false, false] }] };
    const t = new Terrain({ nx: 260, ny: 100, cell: 5, base: 100, scale: 1, q: new Uint16Array(26000), lc: new Uint8Array(26000), watercourses });
    const r = route();
    // A straight channel through asymmetric fill is already paid by the 40 m barrel: its
    // corridor must be offset toward the wider toe, not spuriously extended about the axis.
    r.dayL = new Float64Array(r.n).fill(30); r.dayR = new Float64Array(r.n).fill(10);
    const c: WaterCrossing = { s: 400, x: 500, y: 250, id: 1, waterKind: 'ditch', width: 0.5, catchmentKm2: 0.1, truncated: false, sine: 1, channelTx: 0, channelTy: 1 };
    expect(footprintConflicts(r, t, undefined, [], [], [c]).conflicts).toEqual([]);

    // A skew channel genuinely needs more barrel where the footprint grows beyond the
    // crossing station. This uses a real vector intersection, not a contradictory sine value.
    watercourses.reaches[0].points = [[400, 150], [650, 400]];
    const skewTerrain = new Terrain({ nx: 260, ny: 100, cell: 5, base: 100, scale: 1, q: new Uint16Array(26000), lc: new Uint8Array(26000), watercourses });
    r.dayL = Float64Array.from(r.x, x => x > 510 ? 35 : 20); r.dayR = new Float64Array(r.n).fill(20);
    r.grade = new Float64Array(r.n).fill(130);
    const water = skewTerrain.watercourses!.intersections(r.n, r.s, r.x, r.y);
    const result = footprintConflicts(r, skewTerrain, undefined, [], [], water);
    expect(result.violations).toEqual([]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].length).toBeCloseTo(15 * Math.SQRT2, 5);
    expect(result.conflicts[0].cost).toBeCloseTo(15 * Math.SQRT2 * waterSize(water[0], 40).perM, 4);
  });
  it('checks vector water under displaced realignment chords, not untouched existing-road tails', () => {
    const withChannel = (points: number[][]) => new Terrain({ nx: 260, ny: 100, cell: 5, base: 100, scale: 1,
      q: new Uint16Array(26000), lc: new Uint8Array(26000), watercourses: { version: 1, method: 'synthetic', reaches: [{ id: 1, kind: 'ditch', width: 0.5,
        points, catchmentKm2: [0.1, 0.1], truncated: [false, false] }] } });
    const displaced = check(route(), road(), withChannel([[600, 272], [600, 290]]));
    expect(displaced.conflicts.some(c => c.feature === 'road' && c.action === 'blocked' && c.detail.includes('water/rail'))).toBe(true);
    const tail = check(route(), road(), withChannel([[50, 250], [50, 270]]));
    expect(tail.conflicts.find(c => c.feature === 'road')!.action).toBe('relocation');
    expect(tail.violations).toEqual([]);
  });
  it('does not hide a buried dog-leg inside a crossing’s circular neighbourhood', () => {
    const watercourses: WaterData = { version: 1, method: 'synthetic', reaches: [{ id: 1, kind: 'ditch', width: 0.5,
      points: [[600, 150], [600, 255], [620, 255], [620, 400]], catchmentKm2: [0.1, 0.1, 0.1, 0.1], truncated: [false, false, false, false] }] };
    const t = new Terrain({ nx: 260, ny: 100, cell: 5, base: 100, scale: 1, q: new Uint16Array(26000), lc: new Uint8Array(26000), watercourses });
    const r = route(), water = t.watercourses!.intersections(r.n, r.s, r.x, r.y);
    expect(water).toHaveLength(1);
    const result = footprintConflicts(r, t, undefined, [], [], water);
    expect(result.conflicts.reduce((sum, c) => sum + c.affectedLength!, 0)).toBeGreaterThanOrEqual(25);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.conflicts.some(c => c.detail.includes('no clear outlet'))).toBe(true);
  });
  it('prices a short lengthwise stream barrel once and rejects long channels or insufficient cover', () => {
    const run = (end: number, grade = 105) => {
      const watercourses: WaterData = { version: 1, method: 'synthetic', reaches: [{ id: 1, kind: 'ditch', width: 0.5,
        points: [[400, 252], [1000, 252]], catchmentKm2: [0.1, 0.1], truncated: [false, false] }] };
      const t = new Terrain({ nx: 260, ny: 100, cell: 5, base: 100, scale: 1, q: new Uint16Array(26000), lc: new Uint8Array(26000), watercourses });
      const r = route(); r.grade = new Float64Array(r.n).fill(grade);
      // A finite fill block, with open channels under free spans on either side.
      r.kind = Uint8Array.from({ length: r.n }, (_, i) => i >= 40 && i < (end - 100) / 10 ? KIND.earth : KIND.bridge);
      return footprintConflicts(r, t, undefined, [], [], []);
    };
    const short = run(530);
    expect(short.conflicts).toHaveLength(1);
    expect(short.conflicts[0].action).toBe('culvert');
    expect(short.conflicts[0].length).toBeCloseTo(30, 5);
    expect(short.conflicts[0].cost).toBeGreaterThan(0);
    expect(run(900).conflicts[0].action).toBe('blocked');
    expect(run(530, 100).violations).toHaveLength(1);
  });
});
