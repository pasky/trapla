import { describe, expect, it } from 'vitest';
import { planRoadRealignment, roadRealignmentCrossingIntervals, type RoadRealignmentInput } from '../src/core/road-realignment';
import { FootprintGrid, clipFootprint, type FootprintCell } from '../src/core/footprint-geometry';
import type { FootprintRoute } from '../src/core/footprint';
import { RoadNet } from '../src/core/roadnet';
import { syntheticTerrain, Terrain, BUILTUP_BIT, LC, RAIL_CROSSING_BIT } from '../src/core/terrain';
import { ROAD_CLASSES } from '../src/core/data/urban';
import type { CrossingResult } from '../src/core/crossings';

function setup(ways = [[0, 20, 260, 1250, 260]], cls = ['service']): RoadRealignmentInput & { cells: FootprintCell[] } {
  const n = 101, array = (v: number) => new Float64Array(n).fill(v);
  const route: FootprintRoute = { n, ds: 10, s: Float64Array.from({ length: n }, (_, i) => i * 10),
    x: Float64Array.from({ length: n }, (_, i) => 100 + i * 10), y: array(250), tx: array(1), ty: array(0),
    kind: new Uint8Array(n), grade: array(105), dayL: array(20), dayR: array(20), zDayL: array(100), zDayR: array(100), crownWidth: 10, runs: [] };
  const cells: FootprintCell[] = Array.from({ length: n }, (_, i) => ({ x: route.x[i], y: 250, i, s: route.s[i], tx: 1, ty: 0, along: 5, left: 20, right: 20 }));
  return { route, cells, grid: new FootprintGrid(cells), terrain: syntheticTerrain(260, 100, 5, () => 100), roads: new RoadNet({ cls, ways }),
    way: 0, cls: cls[ways[0][0]], hit: { a: 73, b: 1087, i: 0, j: 100 } };
}
function assertClear(plan: ReturnType<typeof planRoadRealignment>, cells: FootprintCell[], terrainEnds = true) {
  expect(plan.problems).toEqual([]);
  for (const path of plan.geometry.links ?? [plan.geometry.road!]) {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], length = Math.hypot(b.x - a.x, b.y - a.y);
    for (const cell of cells) expect(clipFootprint({ ax: a.x, ay: a.y, bx: b.x, by: b.y, d: 0, length }, cell, plan.geometry.width / 2)).toBeUndefined();
    expect(Math.abs(a.z - b.z)).toBeLessThanOrEqual(length * 0.06 + 1e-7);
    expect(Math.abs(b.z - b.ground)).toBeLessThanOrEqual(10 + 1e-7);
  }
  if (terrainEnds) {
    expect(path[0].z).toBe(path[0].ground);
    expect(path.at(-1)!.z).toBe(path.at(-1)!.ground);
  }
  }
}
function crossing(roadId: number): CrossingResult {
  return { s: 400, i: 40, x: 500, y: 250, cls: 'service', roadId, h: 0, type: 'overbridge', cost: 1,
    geometry: { width: 4, schematic: false, road: [100, 200, 230, 250, 280, 320, 400].map(y => ({ x: 500, y,
      z: y === 280 ? 105 : 100, ground: 100, surface: y === 250 ? 'deck' : y === 280 ? 'ramp' : 'terrain' })) } };
}

describe('bounded real road relocation', () => {
  // Existing footprint tests exercise basic parallel relocation and SPK class/urban prices.
  // These tests target graph continuation, source ownership, adaptive grades and turnarounds.
  it('continues across tag boundaries, retaining absolute same-way stations and real bends', () => {
    const input = setup([[0, 500, 260, 800, 260], [1, 500, 260, 200, 260, 20, 290], [1, 800, 260, 1250, 260]], ['service', 'track']);
    input.hit = { a: 0, b: 300, i: 40, j: 70 };
    const plan = planRoadRealignment(input);
    assertClear(plan, input.cells);
    expect(plan.sourceIntervals.map(s => s.way).sort()).toEqual([0, 1, 2]);
    expect(plan.geometry.road!.some(p => p.d === 0 && p.x === 500)).toBe(true);
    expect(plan.geometry.road!.some(p => p.d === 300 && p.x === 800)).toBe(true);
    expect(plan.geometry.road![0].x).toBeLessThan(95);
    expect(plan.geometry.road!.at(-1)!.x).toBeGreaterThan(1105);
    expect(plan.geometry.turnarounds).toBeUndefined();
    for (const interval of plan.sourceIntervals) expect(interval.a).toBeGreaterThanOrEqual(0);
  });

  it('removes only a true acquired dead-end stub and prices its outside turning apron by area', () => {
    const input = setup([[0, 500, 260, 1250, 260]]);
    input.hit = { a: 0, b: 607, i: 40, j: 100 };
    input.terrain.lc.fill(BUILTUP_BIT);
    const plan = planRoadRealignment(input);
    assertClear(plan, input.cells);
    expect(plan.geometry.turnarounds).toHaveLength(1);
    const p = plan.geometry.turnarounds![0], radius = plan.turnaroundRadius!;
    expect(input.grid.hits(p, radius)).toBe(false);
    expect(p.y).toBe(260); // actual surviving branch, not an invented lateral anchor
    expect(plan.sourceIntervals[0].a).toBe(0); // the acquired stub is explicitly owned
    expect(plan.geometry.road![0].x).toBe(p.x);
    expect(plan.turnaroundArea).toBeGreaterThan(0);
    expect(plan.turnaroundArea).toBeLessThan(Math.PI * radius ** 2);
    expect(plan.cost).toBeCloseTo((plan.length + plan.turnaroundArea / ROAD_CLASSES.service.width) * ROAD_CLASSES.service.roadPerKm[1] / 1000, 5);
    // Reverse the way: the same true end can be at either side of its source chainage.
    const reversed = setup([[0, 1250, 260, 500, 260]]);
    reversed.hit = { a: 143, b: 750, i: 40, j: 100 };
    assertClear(planRoadRealignment(reversed), reversed.cells);
  });

  it('does not mistake a sharp junction, unsplit T-junction or class-restricted continuation for a dead end', () => {
    for (const ways of [
      [[0, 500, 260, 1250, 260], [0, 500, 260, 700, 300]], // traversal rejects this U-turn
      [[0, 500, 260, 1250, 260], [0, 500, 200, 500, 350]], // interior of another segment
      [[0, 500, 260, 1250, 260], [1, 500, 260, 20, 260]], // motorway cannot become cheap service relocation
    ]) {
      const input = setup(ways, ['service', 'motorway']);
      input.hit = { a: 0, b: 607, i: 40, j: 100 };
      expect(input.roads.isDeadEnd({ x: 500, y: 260 })).toBe(false);
      const plan = planRoadRealignment(input);
      expect(plan.problems.length).toBeGreaterThan(0);
      expect(plan.geometry.turnarounds).toBeUndefined();
    }
  });

  it('respects covered intervals on a reversed connected way and adjacent-group bounds', () => {
    const input = setup([[0, 500, 260, 800, 260], [0, 500, 260, 20, 260], [0, 1250, 260, 800, 260]]);
    input.hit = { a: 0, b: 300, i: 40, j: 70 };
    input.covered = new Map([[1, [[450, 480]]], [2, [[0, 80]]]]);
    const plan = planRoadRealignment(input);
    assertClear(plan, input.cells);
    expect(plan.sourceIntervals.find(s => s.way === 1)!.b).toBeLessThanOrEqual(450);
    expect(plan.sourceIntervals.find(s => s.way === 2)!.a).toBeGreaterThanOrEqual(80);
    const blocked = planRoadRealignment({ ...input, bounds: [-100, 500] });
    expect(blocked.problems).toContain('tie-in inside the footprint');
    expect(blocked.sourceIntervals.find(s => s.way === 1)!.b).toBeLessThanOrEqual(100);
    expect(planRoadRealignment({ ...input, covered: new Map([[0, [[100, 200]]]]) }).problems).toContain('affected source interval is already covered');
  });

  it('grows real-way collars to solve a 6% profile and uses retaining support on fills as well as cuts', () => {
    const input = setup();
    input.cells = [{ x: 500, y: 250, i: 40, s: 400, tx: 1, ty: 0, along: 20, left: 20, right: 20 }];
    input.grid = new FootprintGrid(input.cells);
    input.hit = { a: 458, b: 502, i: 40, j: 40 };
    input.terrain = syntheticTerrain(260, 100, 5, (x) => 100 + Math.max(0, Math.min(12, (x - 480) * 0.6)));
    const plan = planRoadRealignment(input);
    assertClear(plan, input.cells);
    expect(plan.geometry.road![0].x).toBeLessThan(415); // first 65 m collar was too short
    expect(plan.geometry.road!.filter(p => p.surface === 'ramp').length).toBeGreaterThan(0);
    expect(plan.geometry.road!.filter(p => p.surface === 'ramp').every(p => p.support === 'retaining')).toBe(true);
  });

  it('prices a distinct T-arm into a complete outside-grid crossing ramp and preserves its engineered elevation', () => {
    const input = setup([[0, 500, 260, 700, 310], [0, 500, 100, 500, 400]]);
    input.hit = { a: 0, b: 50, i: 40, j: 42 };
    const c = crossing(1); input.crossings = [c];
    const owned = roadRealignmentCrossingIntervals([c], input.roads);
    expect(owned).toEqual([{ way: 1, a: 0, b: 300 }]); // the different T-arm is NOT free
    input.covered = new Map([[1, owned.map(s => [s.a, s.b] as const)]]);
    const plan = planRoadRealignment(input);
    assertClear(plan, input.cells, false);
    expect(plan.geometry.road![0]).toMatchObject({ x: 500, y: 280, z: 105, ground: 100, support: 'retaining' });
    expect(plan.cost).toBeGreaterThan(0);
    expect(plan.sourceIntervals.every(s => s.way === 0)).toBe(true);
    c.issues = [{ kind: 'crossing', basis: 'game', s0: 400, s1: 400, title: 'spacing', fix: '', rule: '', crossing: { code: 'spacing', requested: 'overbridge' } }];
    expect(planRoadRealignment(input).problems).toEqual([]); // physical geometry remains usable
    c.issues[0].crossing.code = 'geometry';
    expect(planRoadRealignment(input).problems.length).toBeGreaterThan(0);
    c.issues = []; c.geometry!.clipped = true;
    expect(planRoadRealignment(input).problems.length).toBeGreaterThan(0);
  });

  it('preserves both surviving branches of a second crossing using separate compatible side links', () => {
    const input = setup([[0, 700, 100, 700, 400], [0, 700, 100, 500, 100], [0, 500, 100, 500, 400]]);
    input.hit = { a: 128, b: 172, i: 60, j: 60 };
    input.crossings = [crossing(2)];
    const plan = planRoadRealignment(input);
    assertClear(plan, input.cells, false);
    expect(plan.geometry.links).toHaveLength(2);
    expect(plan.geometry.road).toBeUndefined();
    const [a, b] = plan.geometry.links!;
    expect(a[0].x).toBe(700); expect(b.at(-1)!.x).toBe(700);
    expect(a.every(p => p.y < 230)).toBe(true); expect(b.every(p => p.y > 270)).toBe(true);
    const length = [a, b].reduce((sum, path) => sum + path.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - path[i].x, p.y - path[i].y), 0), 0);
    expect(plan.length).toBeCloseTo(length, 8); // no imaginary billed segment between the links
  });

  it('protects ribbon edges and turning aprons, while leaving old drainage on unchanged tails alone', () => {
    const input = setup([[0, 500, 260, 1250, 260]]);
    input.hit = { a: 0, b: 607, i: 40, j: 100 };
    const valid = planRoadRealignment(input), turn = valid.geometry.turnarounds![0];
    const col = Math.floor(turn.x / input.terrain.cell), row = Math.floor((input.terrain.height - turn.y - 5) / input.terrain.cell);
    input.terrain.lc[row * input.terrain.nx + col] = LC.road | RAIL_CROSSING_BIT;
    expect(planRoadRealignment(input).problems.join(';')).toContain('water/rail');
    // Existing crossing on an untouched collar is not a new bridge bill.
    const tail = setup();
    tail.terrain = new Terrain({ nx: 260, ny: 100, cell: 5, base: 100, scale: 1, q: new Uint16Array(26000), lc: new Uint8Array(26000),
      watercourses: { version: 1, method: 'test', reaches: [{ id: 1, kind: 'ditch', width: 0.5, points: [[40, 240], [40, 280]], catchmentKm2: [0.1, 0.1], truncated: [false, false] }] } });
    expect(planRoadRealignment(tail).problems).toEqual([]);
  });
});
