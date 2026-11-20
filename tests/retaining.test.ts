import { describe, expect, it } from 'vitest';
import { computeSections, type SectionCache } from '../src/core/sections';
import { planRetainingWalls, retainingConflicts } from '../src/core/retaining';
import { footprintConflicts } from '../src/core/footprint';
import { RoadNet } from '../src/core/roadnet';
import { syntheticTerrain, Terrain, LC, RAIL_CROSSING_BIT } from '../src/core/terrain';
import { waterSize, type WaterData } from '../src/core/watercourses';

function setup(grade = 108, watercourses?: WaterData) {
  const n = 81, arr = (v: number) => new Float64Array(n).fill(v);
  const terrain = watercourses ? new Terrain({ nx: 200, ny: 40, cell: 5, base: 100, scale: 1,
    q: new Uint16Array(8000), lc: new Uint8Array(8000), watercourses }) : syntheticTerrain(200, 40, 5, () => 100);
  const st = { n, ds: 10, s: Float64Array.from({ length: n }, (_, i) => i * 10), x: Float64Array.from({ length: n }, (_, i) => 100 + i * 10),
    y: arr(100), tx: arr(1), ty: arr(0), grade: arr(grade), crownWidth: 10 };
  const sec = computeSections(terrain, n, st.x, st.y, st.tx, st.ty, st.grade, { crownWidth: 10 });
  const roads = new RoadNet({ cls: ['service'], ways: [[0, 130, 119, 870, 119]] });
  return { terrain, roads, route: { ...st, ...sec } };
}
describe('automatic slope retention', () => {
  it('preserves a parallel road by truncating the actual fill, not suppressing its collision', () => {
    const { terrain, roads, route } = setup(), before = route.fill[40];
    const result = planRetainingWalls(route, terrain, roads);
    expect(result.walls.length).toBeGreaterThan(0);
    expect(route.fill[40]).toBeLessThan(before);
    expect(route.dayL[40]).toBeLessThan(17);
    expect(result.wallSurfaceL[40]).toBeGreaterThan(route.zDayL[40]);
    const checked = footprintConflicts({ ...route, kind: new Uint8Array(route.n), runs: [] }, terrain, roads, [], []);
    expect(checked.violations).toEqual([]);
    const facts = retainingConflicts(result.walls);
    expect(facts).toHaveLength(1);
    expect(facts[0].cost).toBeCloseTo(result.perCell.reduce((a, b) => a + b, 0), 5);
  });
  it('retains a cut with the wall toe below natural ground and reduces excavation bands consistently', () => {
    const { terrain, roads, route } = setup(92), before = route.cut[40];
    const result = planRetainingWalls(route, terrain, roads);
    expect(result.wallSurfaceL[40]).toBeLessThan(route.zDayL[40]);
    expect(route.cut[40]).toBeLessThan(before);
    expect(route.cutI[40] + route.cutII[40] + route.cutIII[40]).toBeCloseTo(route.cut[40], 8);
    expect(route.fill[40]).toBe(0);
    expect(footprintConflicts({ ...route, kind: new Uint8Array(route.n), runs: [] }, terrain, roads, [], []).violations).toEqual([]);
  });
  it('pulls the toe off independent rail pixels even when road paint hides their class', () => {
    const { terrain, route } = setup();
    for (let col = 50; col < 80; col++) terrain.lc[17 * terrain.nx + col] = LC.road | RAIL_CROSSING_BIT;
    const result = planRetainingWalls(route, terrain);
    expect(result.walls.some(w => w.feature === 'railway')).toBe(true);
    expect(footprintConflicts({ ...route, kind: new Uint8Array(route.n), runs: [] }, terrain, undefined, [], []).violations).toEqual([]);
  });
  it('uses a constrained crown-edge face for a slope sliver without narrowing the crown', () => {
    const { terrain, route } = setup(); route.y.fill(104);
    for (let col = 50; col < 80; col++) terrain.lc[17 * terrain.nx + col] = LC.rail;
    const plan = planRetainingWalls(route, terrain);
    expect(plan.walls.some(w => w.constrained)).toBe(true);
    expect(plan.walls.every(w => w.offset >= route.crownWidth / 2)).toBe(true);
    expect(footprintConflicts({ ...route, kind: new Uint8Array(route.n), runs: [] }, terrain, undefined, [], []).violations).toEqual([]);
  });
  it('uses a stronger watertight bank wall rather than draining a pond into an adjacent cut', () => {
    const wet = setup(92), dry = setup(92); wet.route.y.fill(104); dry.route.y.fill(104);
    for (let col = 50; col < 80; col++) { wet.terrain.lc[17 * wet.terrain.nx + col] = LC.water; dry.terrain.lc[17 * dry.terrain.nx + col] = LC.rail; }
    const bank = planRetainingWalls(wet.route, wet.terrain), ordinary = planRetainingWalls(dry.route, dry.terrain);
    expect(bank.walls.every(w => w.watertight)).toBe(true);
    expect(bank.perCell.reduce((a, b) => a + b, 0)).toBeGreaterThan(ordinary.perCell.reduce((a, b) => a + b, 0));
    expect(footprintConflicts({ ...wet.route, kind: new Uint8Array(wet.route.n), runs: [] }, wet.terrain, undefined, [], []).violations).toEqual([]);
  });
  it('reuses local candidates without changing retained geometry or protection checks', () => {
    const a = setup(), b = setup(), cache = new Map();
    const first = planRetainingWalls(a.route, a.terrain, a.roads, undefined, [], cache);
    const second = planRetainingWalls(b.route, a.terrain, a.roads, undefined, [], cache);
    expect(second.walls).toEqual(first.walls);
    const checked = footprintConflicts({ ...b.route, kind: new Uint8Array(b.route.n), runs: [], featureCache: cache }, a.terrain, a.roads, [], []);
    expect(checked).toEqual(footprintConflicts({ ...b.route, kind: new Uint8Array(b.route.n), runs: [] }, a.terrain, a.roads, [], []));
  });
  it('reuses raw sections across local grade repairs without reusing wall-truncated quantities', () => {
    const { terrain, roads, route } = setup(), cache: SectionCache = [];
    const template = { crownWidth: route.crownWidth };
    for (const grade of [108, 108, 109, 108]) {
      route.grade[40] = grade;
      const cached = computeSections(terrain, route.n, route.x, route.y, route.tx, route.ty, route.grade, template, true, cache);
      const fresh = computeSections(terrain, route.n, route.x, route.y, route.tx, route.ty, route.grade, template, true);
      expect(cached).toEqual(fresh);
      const rawLeft = cached.sideL![40], unchanged = cache[20];
      const plan = planRetainingWalls({ ...route, ...cached }, terrain, roads);
      expect(plan.walls.length).toBeGreaterThan(0);
      expect(cached.sideL![40]).not.toBe(rawLeft);
      expect(cache[40].left).toBe(rawLeft);
      expect(plan).toEqual(planRetainingWalls({ ...route, ...fresh }, terrain, roads));
      expect(cached).toEqual(fresh);
      const again = computeSections(terrain, route.n, route.x, route.y, route.tx, route.ty, route.grade, template, true, cache);
      expect(again.sideL![40]).toBe(rawLeft);
      expect(cache[20]).toBe(unchanged);
    }
  });
  it('prices a wall for a river-bank corner beyond every station-normal probe', () => {
    const { terrain, route } = setup(108, { version: 1, method: 'synthetic', reaches: [{ id: 1, kind: 'river', width: 30,
      points: [[518, 130], [522, 130]], catchmentKm2: [10, 10], truncated: [false, false] }] });
    const check = () => footprintConflicts({ ...route, kind: new Uint8Array(route.n), runs: [] }, terrain, undefined, [], []);
    // At x500 the ±5 m normals miss this segment; its 15 m bank still touches
    // the footprint corner. Even a one-cell extension of x520's wall misses x500.
    expect(check().conflicts.some(c => c.i === 40)).toBe(true);
    const before = route.fill[40], plan = planRetainingWalls(route, terrain);
    expect(plan.walls.some(w => w.i === 40 && w.feature === 'water' && w.cost > 0)).toBe(true);
    expect(route.fill[40]).toBeLessThan(before);
    expect(plan.forcedBridge.some(Boolean)).toBe(false);
    expect(check().violations).toEqual([]);
    expect(plan.perCell.reduce((a, b) => a + b, 0)).toBeCloseTo(plan.walls.reduce((sum, w) => sum + w.cost, 0), 5);
  });
  it('never exempts a bridge-required crossing as a culvert barrel', () => {
    const run = (river: boolean) => {
      const { terrain, route } = setup(108, { version: 1, method: 'synthetic', reaches: [{ id: 1, kind: river ? 'river' : 'ditch', width: river ? 5 : 0.5,
        points: [[400, 0], [600, 200]], catchmentKm2: [0.1, 0.1], truncated: [false, false] }] });
      const water = terrain.watercourses!.intersections(route.n, route.s, route.x, route.y);
      const plan = planRetainingWalls(route, terrain, undefined, undefined, water);
      const check = footprintConflicts({ ...route, kind: new Uint8Array(route.n), runs: [] }, terrain, undefined, [], water);
      return { plan, check };
    };
    const river = run(true);
    expect(river.plan.forcedBridge[40]).toBe(1);
    // An explicit earthwork route still reports the collision; the raw crossing is not ownership.
    expect(river.check.violations.length).toBeGreaterThan(0);
    const ditch = run(false);
    expect(ditch.plan.forcedBridge.some(Boolean)).toBe(false);
    expect(ditch.check.violations).toEqual([]);
  });
  it('uses exact crossing elevations rather than station chords at the barrel-cover threshold', () => {
    const run = (exact: boolean) => {
      const { terrain, route } = setup(101.8, { version: 1, method: 'synthetic', reaches: [{ id: 1, kind: 'ditch', width: 0.5,
        points: [[505, 0], [505, 200]], catchmentKm2: [0.1, 0.1], truncated: [false, false] }] });
      const water = terrain.watercourses!.intersections(route.n, route.s, route.x, route.y), c = water[0];
      const i = Math.round(c.s / route.ds), minHeight = waterSize(c, route.dayL[i] + route.dayR[i]).minHeight;
      // A crest between x500/x510 can clear the minimum while its station chord does not.
      route.grade.fill(100 + minHeight - 0.002);
      const elevations = exact ? new Map([[c, 100 + minHeight + 0.002]]) : undefined;
      const plan = planRetainingWalls(route, terrain, undefined, undefined, water, undefined, elevations);
      const check = footprintConflicts({ ...route, kind: new Uint8Array(route.n), runs: [] }, terrain, undefined, [], water, elevations);
      return { plan, check };
    };
    expect(run(false).plan.clearanceRequirements.length).toBeGreaterThan(0);
    const exact = run(true);
    expect(exact.plan.clearanceRequirements).toEqual([]);
    expect(exact.check.violations).toEqual([]);
  });
  it('retains the unowned part of a partly barrel-owned dog-leg independently of OSM splits', () => {
    const run = (split: boolean) => {
      const first = { id: 1, kind: 'ditch' as const, width: 0.5,
        points: split ? [[500, 0], [500, 110], [510, 110]] : [[500, 0], [500, 110], [550, 110], [550, 200]],
        catchmentKm2: [0.1, 0.1, 0.1, 0.1], truncated: [false, false, false, false] };
      const { terrain, route } = setup(108, { version: 1, method: 'synthetic', reaches: [first,
        ...(split ? [{ ...first, id: 2, points: [[510, 110], [550, 110], [550, 200]] }] : [])] });
      const water = terrain.watercourses!.intersections(route.n, route.s, route.x, route.y);
      const plan = planRetainingWalls(route, terrain, undefined, undefined, water);
      return { plan, route };
    };
    const whole = run(false), split = run(true);
    expect(whole.plan.walls.some(w => w.i === 43 && w.feature === 'stream' && w.cost > 0)).toBe(true);
    expect(split.plan.forcedBridge).toEqual(whole.plan.forcedBridge);
    expect(split.route.dayL).toEqual(whole.route.dayL);
    expect(split.plan.perCell.reduce((a, b) => a + b, 0)).toBeCloseTo(whole.plan.perCell.reduce((a, b) => a + b, 0), 5);
  });
  it('a cache that has seen other grade lines, barrels and crossing ways plans as a fresh one does', () => {
    // A ditch crossing with a dog-leg (barrels), a road beside us that shortens its barrel (two screening
    // passes), a second ditch of its own, a track crossing us (a crossing way's own stretch) and a railway
    // under the crown (a bridge asked for by the grade alone). Each plan is made with one shared cache and
    // with a fresh one.
    const base = setup(108, { version: 1, method: 'synthetic', reaches: [{ id: 1, kind: 'ditch', width: 0.5,
      points: [[400, 0], [520, 120], [550, 120], [550, 200]], catchmentKm2: [0.1, 0.1, 0.1, 0.1], truncated: [false, false, false, false] },
    { id: 2, kind: 'ditch', width: 0.5, points: [[150, 0], [270, 120], [300, 120], [300, 200]], catchmentKm2: [0.1, 0.1, 0.1, 0.1], truncated: [false, false, false, false] }] });
    const { terrain } = base, n = base.route.n;
    for (let col = 150; col < 156; col++) terrain.lc[19 * terrain.nx + col] = LC.rail;
    const roads = new RoadNet({ cls: ['service', 'track'], ways: [[0, 450, 118, 490, 118], [1, 600, 80, 800, 120]] });
    const water = terrain.watercourses!.intersections(n, base.route.s, base.route.x, base.route.y), at = roads.wayStation(1, 700, 100);
    type Variant = { grade?: (i: number) => number; ways?: Map<number, number[]>; cover?: number; bare?: (i: number) => number; twice?: boolean; dead?: boolean };
    const variants: Variant[] = [
      {}, {},
      { grade: i => i >= 30 && i <= 50 ? 109 : 108 }, // a lift over the ditch and the wall beside the road
      {},
      { ways: new Map([[1, [at + 300]]]) }, // the track crosses elsewhere: its stretch here is an obstacle
      { ways: new Map() },
      {},
      { cover: 0.4 }, // less cover over the first ditch: another barrel there, the same sections
      {},
      { twice: true }, // planned again on the sections its walls have narrowed
      {},
      { bare: i => i >= 63 && i <= 69 ? 104 : 108 }, // lower over the railway, the sections as they were
      {},
      { ways: new Map(), dead: true }, // the track an obstacle, but a dead end serving nothing (dead-ends.ts): no structure for it
      {},
    ];
    const fields = ['cut', 'cutI', 'cutII', 'cutIII', 'fill', 'dayL', 'dayR', 'zDayL', 'zDayR', 'open', 'rockFace', 'subgrade', 'sideL', 'sideR'] as const;
    const shared = new Map(), seen = new Set<string>();
    for (const v of variants) {
      const plans = [shared, undefined].map(cache => {
        const { route } = setup(108);
        if (v.grade) route.grade.forEach((_, i) => { route.grade[i] = v.grade!(i); });
        Object.assign(route, computeSections(terrain, n, route.x, route.y, route.tx, route.ty, route.grade, { crownWidth: route.crownWidth }, true));
        if (v.bare) route.grade.forEach((_, i) => { route.grade[i] = v.bare!(i); });
        if (v.dead) Object.assign(route, { deadEnds: new Map([[1, [[0, 300]]]]) });
        const elevations = v.cover === undefined ? undefined : new Map(water.filter(c => c.id === 1).map(c => [c, 100 + v.cover!]));
        const make = () => planRetainingWalls(route, terrain, roads, undefined, water, cache ?? new Map(), elevations, v.ways ?? new Map([[1, [at]]]));
        const plan = make();
        return { plan: v.twice ? make() : plan, route };
      });
      expect(plans[0].plan).toEqual(plans[1].plan);
      for (const key of fields) expect(plans[0].route[key]).toEqual(plans[1].route[key]);
      seen.add(JSON.stringify([plans[1].plan.walls, [...plans[1].plan.forcedBridge]]));
    }
    // (the variants are different plans: the base, the lift, the track as an obstacle (both ways), the other
    // barrel, the narrowed sections, no bridge over the railway, the track a dead end)
    expect(seen.size).toBe(7);
  });
  it('rescreens culvert ownership after a road wall shortens the crossing barrel', () => {
    const { terrain, route } = setup(108, { version: 1, method: 'synthetic', reaches: [{ id: 1, kind: 'ditch', width: 0.5,
      points: [[400, 0], [520, 120], [550, 120], [550, 200]], catchmentKm2: [0.1, 0.1, 0.1, 0.1], truncated: [false, false, false, false] }] });
    Object.assign(route, computeSections(terrain, route.n, route.x, route.y, route.tx, route.ty, route.grade,
      { crownWidth: route.crownWidth }, true));
    const roads = new RoadNet({ cls: ['service'], ways: [[0, 450, 118, 490, 118]] });
    const water = terrain.watercourses!.intersections(route.n, route.s, route.x, route.y), cache = new Map();
    // The road wall ends at x490 but extends to the x500 crossing cell. Its shorter
    // barrel no longer owns the whole diagonal leading into the dog-leg at x520.
    const plan = planRetainingWalls(route, terrain, roads, undefined, water, cache);
    expect(plan.walls.some(w => w.i === 40 && w.feature === 'road')).toBe(true);
    expect(plan.walls.some(w => w.i === 41 && w.feature === 'stream')).toBe(true);
    expect(footprintConflicts({ ...route, kind: new Uint8Array(route.n), runs: [], featureCache: cache }, terrain, undefined, [], water).violations).toEqual([]);
    expect(plan.perCell.reduce((a, b) => a + b, 0)).toBeCloseTo(plan.walls.reduce((sum, w) => sum + w.cost, 0), 5);
    for (let i = 38; i < 46; i++) {
      expect(route.fill[i]).toBeCloseTo(route.sideL![i].fill + route.sideR![i].fill, 8);
      expect(route.cut[i]).toBeCloseTo(route.sideL![i].cut + route.sideR![i].cut, 8);
    }
  });
  it('leaves a crossing track to its crossing remedy: no forced bridge/tunnel and no wall dearer than relocation', () => {
    // A field track crossing the route at a shallow angle lies inside the crown/slopes of the
    // neighbouring cells. As an ordinary obstacle it forces structures; as the crossing's own
    // stretch it is severed/diverted (crossing remedy) and screened afterwards.
    for (const grade of [140, 70]) {
      const track = () => new RoadNet({ cls: ['track'], ways: [[0, 300, 80, 700, 120]] });
      const plain = setup(grade), crossing = setup(grade);
      const ordinary = planRetainingWalls(plain.route, plain.terrain, track());
      expect([...ordinary.forcedBridge, ...ordinary.forcedTunnel].some(Boolean)).toBe(true);
      const owned = planRetainingWalls(crossing.route, crossing.terrain, track(), undefined, [], undefined, undefined, new Map([[0, [Math.hypot(200, 20)]]]));
      expect([...owned.forcedBridge, ...owned.forcedTunnel].some(Boolean)).toBe(false);
      expect(owned.walls.every(w => w.cost / (w.s1 - w.s0) <= 2 * 13_985_684.5 / 1000)).toBe(true);
    }
  });
  it('a dead end serving nothing beyond our works is never bridged or tunnelled for (the footprint screen takes it up)', () => {
    // (a track under our crown at a shallow angle: as an ordinary road it forces structures, road-realignment.ts)
    for (const grade of [140, 70]) {
      const track = () => new RoadNet({ cls: ['track'], ways: [[0, 300, 80, 700, 120]] });
      const plain = setup(grade), dead = setup(grade);
      const ordinary = planRetainingWalls(plain.route, plain.terrain, track());
      expect([...ordinary.forcedBridge, ...ordinary.forcedTunnel].some(Boolean)).toBe(true);
      const ended = planRetainingWalls({ ...dead.route, deadEnds: new Map([[0, [[0, 410]]]]) }, dead.terrain, track());
      expect([...ended.forcedBridge, ...ended.forcedTunnel].some(Boolean)).toBe(false);
    }
  });
  it('a rejected crossing-track wall falls back to the independent railway constraint on that side', () => {
    const { terrain, route } = setup(115);
    for (let col = 50; col < 80; col++) terrain.lc[17 * terrain.nx + col] = LC.rail;
    // The track runs nearer than the rail (lateral ≈10.5 m over km 0.16–0.24) and crosses at x≈480.
    const track = new RoadNet({ cls: ['track'], ways: [[0, 100, 111, 340, 110.5, 500, 99, 700, 90]] });
    const plan = planRetainingWalls(route, terrain, track, undefined, [], undefined, undefined, new Map([[0, [track.wayStation(0, 480, 100)]]]));
    expect(plan.walls.some(w => w.feature === 'railway' && w.i >= 16 && w.i <= 24)).toBe(true);
    expect(plan.walls.every(w => w.feature === 'railway')).toBe(true);
  });
  it('requests a bridge instead of inventing an unlimited wall, while preserving explicit earthwork', () => {
    const auto = setup(140), manual = setup(140);
    expect(planRetainingWalls(auto.route, auto.terrain, auto.roads).forcedBridge.some(Boolean)).toBe(true);
    const result = planRetainingWalls(manual.route, manual.terrain, manual.roads, new Int8Array(manual.route.n));
    expect(result.forcedBridge.some(Boolean)).toBe(false);
    expect(result.walls).toEqual([]);
  });
  it('a bank above a pond in a ravine: the wall stands nearer the road where it is low enough, else a short bridge', () => {
    // ground falls away beside the road towards a pond 17.5–22.5 m to its left; the road runs just above ground
    const ravine = (edge: number, drop: number) => {
      const terrain = syntheticTerrain(200, 40, 5, (_x, y) => (y <= 100 + edge ? 100 : 100 - (y - 100 - edge) * drop));
      for (const row of [15, 16]) for (let col = 60; col < 120; col++) terrain.lc[row * terrain.nx + col] = LC.water;
      const n = 81, arr = (v: number) => new Float64Array(n).fill(v);
      const st = { n, ds: 10, s: Float64Array.from({ length: n }, (_, i) => i * 10), x: Float64Array.from({ length: n }, (_, i) => 100 + i * 10),
        y: arr(100), tx: arr(1), ty: arr(0), grade: arr(100.5), crownWidth: 10 };
      const route = { ...st, ...computeSections(terrain, n, st.x, st.y, st.tx, st.ty, st.grade, { crownWidth: 10 }) };
      return { terrain, route, plan: planRetainingWalls(route, terrain) };
    };
    const near = ravine(6, 4);
    expect(near.plan.walls.some(w => w.feature === 'water' && w.i === 40)).toBe(true);
    expect(near.plan.walls.every(w => w.height <= 15)).toBe(true);
    expect(near.plan.forcedBridge[40]).toBe(0);
    expect(footprintConflicts({ ...near.route, kind: new Uint8Array(near.route.n), runs: [] }, near.terrain, undefined, [], []).violations).toEqual([]);
    // falling at once from the crown's edge: no wall fits anywhere, the road is carried past on a bridge
    const sheer = ravine(5, 12);
    expect(sheer.plan.forcedBridge[40]).toBe(1);
  });
});

