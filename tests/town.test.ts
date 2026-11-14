// Built-up areas: crossings of existing roads, buildings, noise walls, per-station cost attribution.
import { describe, expect, it } from 'vitest';
import { autoProfile } from '../src/core/autoprofile';
import { BuildingIndex, type BuildingInfo } from '../src/core/buildings';
import { PART_KEYS } from '../src/core/cost';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { BUILDING_KIND, NOISE, ROAD_CLASSES } from '../src/core/data/urban';
import { evaluate, type Design } from '../src/core/evaluate';
import { noiseDistance, wallFlags } from '../src/core/noise';
import { rangeSummary } from '../src/core/range';
import { mergeCrossings, RoadNet } from '../src/core/roadnet';
import { KIND } from '../src/core/structures';
import { BUILTUP_BIT, syntheticTerrain } from '../src/core/terrain';
import { buildProfile, elevations, type VPI } from '../src/core/vertical';

describe('road network crossings', () => {
  const net = new RoadNet({
    cls: ['residential', 'primary', 'track'],
    ways: [
      [0, 200, -50, 200, 0, 200, 50], // vertex exactly on the route
      [1, 300, -50, 300, 50], [1, 315, -50, 315, 50], // dual carriageway
      [2, 480, -50, 520, 50], // diagonal track
      [0, 30, -50, 30, 50], // inside the end margin
      [0, 700, -20, 800, -20], // parallel, never crossed
    ],
  });
  const n = 101;
  const s = Float64Array.from({ length: n }, (_, i) => i * 10), y = new Float64Array(n);

  it('finds each intersection once, in station order', () => {
    const raw = net.intersections(n, s, s, y);
    expect(raw.map((c) => [Math.round(c.s), c.cls])).toEqual([[30, 'residential'], [200, 'residential'], [300, 'primary'], [315, 'primary'], [500, 'track']]);
  });

  it('does not depend on the direction in which a way was drawn', () => {
    // two ways of one road meeting on the route, both drawn towards it / both away from it
    const towards = new RoadNet({ cls: ['primary'], ways: [[0, 500, -50, 500, 0], [0, 500, 50, 500, 0]] });
    const away = new RoadNet({ cls: ['primary'], ways: [[0, 500, 0, 500, -50], [0, 500, 0, 500, 50]] });
    for (const net2 of [towards, away]) {
      const m = mergeCrossings(net2.intersections(n, s, s, y), 1000);
      expect(m.map((c) => Math.round(c.s))).toEqual([500]);
    }
    // the same on a skew route, where round-off puts the end point a hair outside the segment
    const sk = Float64Array.from([485, 495, 505, 515]);
    const sx = Float64Array.from(sk, (v) => 500 + (v - 500) * 0.42), sy = Float64Array.from(sk, (v) => 500 + (v - 500) * 0.84);
    for (const ways of [[[0, 510, 530, 500, 500], [0, 520, 510, 500, 500]], [[0, 500, 500, 510, 530], [0, 500, 500, 520, 510]]]) {
      const m = mergeCrossings(new RoadNet({ cls: ['primary'], ways }).intersections(4, sk, sx, sy), 1000, { endMargin: 0, mergeDistance: 30, sameWayMergeDistance: 150 });
      expect(m.length).toBe(1);
      expect(m[0].s).toBeCloseTo(500, 6);
    }
  });

  it('merges close crossings and drops those at the route ends', () => {
    const m = mergeCrossings(net.intersections(n, s, s, y), 1000);
    expect(m.map((c) => [Math.round(c.s), c.cls])).toEqual([[200, 'residential'], [300, 'primary'], [500, 'track']]);
  });
});

describe('noise rule', () => {
  it('screening distance shrinks with design speed and grows with traffic', () => {
    expect(noiseDistance(NOISE.refTraffic, NOISE.refSpeed)).toBeCloseTo(NOISE.refDistance, 9);
    expect(noiseDistance(NOISE.refTraffic, 70)).toBeLessThan(NOISE.refDistance * 0.75);
    expect(noiseDistance(2 * NOISE.refTraffic, NOISE.refSpeed)).toBeGreaterThan(NOISE.refDistance * 1.4);
  });

  it('walls cover the exposed stations plus the margin, except where shielded', () => {
    const exposed = new Uint8Array(40), shield = new Uint8Array(40);
    exposed[10] = exposed[11] = 1; exposed[30] = 1;
    shield[14] = 1; shield[30] = 1;
    const f = wallFlags(10, exposed, shield, 50);
    const on = [...f].map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    expect(on).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 25, 26, 27, 28, 29, 31, 32, 33, 34, 35]);
  });
});

describe('building footprints', () => {
  it('uses the oriented rectangle, not the bounding circle', () => {
    // a 40 × 6 m hall at 45°, centred 20 m left of an eastbound road strip that is 5 m wide each side
    const info: BuildingInfo = [240, 0, BUILDING_KIND.industrial, 0, 20, 20, 3, 45];
    const b = new BuildingIndex([[0, 20, 20.3]], [info]);
    // the circle (r = 20.3) reaches the strip at x = 0, the rectangle does not: its nearest corner is
    // at (−12.0, 3.7)
    expect(b.hits(0, 0, 0, 1, 0, 5, 5)).toBe(false);
    expect(b.hits(0, -14, 0, 1, 0, 5, 3)).toBe(false);
    expect(b.hits(0, -14, 0, 1, 0, 5, 5)).toBe(true);
  });
});

describe('evaluate on a synthetic town', () => {
  // plane at 400 m with a 12 m deep valley at x = 2000 and a 12 m high ridge at x = 4000 (both N–S)
  const bump = (x: number, x0: number) => 12 * Math.max(0, Math.min(1, (200 - Math.abs(x - x0)) / 100));
  const terrain = syntheticTerrain(1400, 400, 5, (x) => 400 - bump(x, 2000) + bump(x, 4000));
  // built-up strip x ∈ [2400, 2800]
  for (let r = 0; r < terrain.ny; r++) for (let c = 480; c < 560; c++) terrain.lc[r * terrain.nx + c] |= BUILTUP_BIT;
  const roads = new RoadNet({
    cls: ['residential', 'track', 'primary'],
    ways: [
      [0, 2000, 500, 2000, 1500], // street in the valley floor → passes under a forced bridge
      [0, 4000, 500, 4000, 1500], // street on the ridge → overbridge across the cut
      [0, 3000, 500, 3000, 1500], // street on the plain → reconnection
      [1, 3200, 500, 3200, 1500], // track → diversion
      [2, 5000, 500, 5000, 1500], [2, 5015, 500, 5015, 1500], // dual carriageway → one junction
    ],
  });
  const sq = (x: number, y: number, half: number, kind: number): BuildingInfo => [4 * half * half, 1, kind, x, y, half, half, 0];
  const info = [
    sq(1000, 1000, 5, BUILDING_KIND.house), // on the centreline → demolished
    sq(1000, 1040, 5, BUILDING_KIND.house), // 40 m to the left → noise wall
    sq(4000, 1045, 5, BUILDING_KIND.house), // beside the 12 m cut → screened by it
    sq(2000, 1000, 3, BUILDING_KIND.minor), // under the bridge deck → demolished
    sq(2000, 1012, 3, BUILDING_KIND.minor), // beside the deck, where an embankment would have buried it
  ];
  const buildings = new BuildingIndex(info.map((f) => [f[3], f[4], f[5] * Math.SQRT2]), info);
  const ctx = { terrain, scenario: D11_SCENARIO, a: { x: 500, y: 1000 }, b: { x: 6500, y: 1000 }, buildings, roads };
  const design: Design = {
    category: 'S9.5', speed: 90, pis: [], profileMode: 'manual',
    vpis: [{ s: 0, z: 400, r: null }, { s: 6000, z: 400, r: null }],
  };
  const r = evaluate(ctx, design);

  it('resolves each crossing by the height of the grade above the crossed road', () => {
    expect(r.crossings.map((c) => [Math.round(c.s), c.cls, c.type])).toEqual([
      [1500, 'residential', 'bridge'], [2500, 'residential', 'atGrade'], [2700, 'track', 'atGrade'],
      [3500, 'residential', 'overbridge'], [4500, 'primary', 'atGrade'],
    ]);
    // the valley street forces a short bridge into what would otherwise be an embankment
    expect(r.kind[150]).toBe(KIND.bridge);
    expect(r.runs.length).toBe(1);
    expect(r.runs[0].length).toBeGreaterThanOrEqual(30);
    expect(r.runs[0].length).toBeLessThan(100);
    // the overbridge spans the cut from edge to edge: crown + two 1:1.75 slopes 12 m high
    const span = 9.5 + 2 * 1.75 * 12;
    const over = r.crossings[3];
    expect(over.cost).toBeCloseTo((span / 1000) * ROAD_CLASSES.residential.bridgePerKm, -4);
    expect(r.cost.crossings).toBeCloseTo(over.cost + ROAD_CLASSES.residential.atGrade + ROAD_CLASSES.track.atGrade + ROAD_CLASSES.primary.atGrade, 0);
  });

  it('demolishes what is in the footprint or under a bridge deck, and nothing else', () => {
    expect(r.demolished.map((b) => b.j)).toEqual([0, 3]);
    expect(r.cost.landDetail.buildings).toBeCloseTo(buildings.cost[0] + buildings.cost[3], 3);
    expect(r.demolished[0].i).toBe(50);
  });

  it('walls off dwellings within the screening distance unless a cut screens them', () => {
    expect(r.walls.length).toBe(1);
    const w = r.walls[0];
    expect(w.side).toBe('L');
    // chord of the 100 m circle around a house 40 m away (±91.7 m) plus 50 m margins
    expect(w.s0).toBeGreaterThan(500 - 92 - 50 - 10);
    expect(w.s1).toBeLessThan(500 + 92 + 50 + 10);
    expect(r.quantities.wallLength).toBeCloseTo(w.s1 - w.s0, 6);
    expect(r.cost.noiseWalls).toBeCloseTo(r.quantities.wallLength * NOISE.wallHeight * NOISE.wallPerM2, 3);
  });

  it('built-up cells get the urban norm row, surcharge and land price', () => {
    const perM = (i: number, k: 'roadBase' | 'land' | 'surcharge') => r.parts[k][i] / r.ds;
    expect(r.cell.urban[210]).toBe(1);
    expect(r.cell.urban[100]).toBe(0);
    // same flat cross-section in both places
    expect(perM(210, 'roadBase') - perM(100, 'roadBase')).toBeCloseTo((67_852_000 - 56_912_000) / 1000, 3);
    expect(perM(210, 'land') / perM(100, 'land')).toBeCloseTo((1500 * 1.5) / 400, 6);
    expect(perM(210, 'surcharge') / perM(210, 'roadBase')).toBeGreaterThan(0.493 - 1e-9);
    expect(r.quantities.urbanLength).toBeCloseTo(400, -1);
  });

  it('per-station arrays sum to the bill, component by component, and ranges add up', () => {
    const sum = (k: (typeof PART_KEYS)[number]) => r.parts[k].reduce((a, v) => a + v, 0);
    const c = r.cost;
    expect(sum('roadBase')).toBeCloseTo(c.roadBase, 3);
    expect(sum('bridges')).toBeCloseTo(c.bridges, 3);
    expect(sum('crossings')).toBeCloseTo(c.crossings, 3);
    expect(sum('noiseWalls')).toBeCloseTo(c.noiseWalls, 3);
    expect(sum('surcharge')).toBeCloseTo(c.surcharge, 3);
    expect(sum('land') + sum('forest') + sum('buildings')).toBeCloseTo(c.land, 3);
    for (const k of ['excavation', 'fillPlacing', 'haul', 'surplusHaul', 'unsuitable', 'borrow', 'topsoil'] as const) {
      expect(sum(k)).toBeCloseTo(c.earthDetail[k], 3);
    }
    let all = 0;
    for (const k of PART_KEYS) all += sum(k);
    expect(all).toBeCloseTo(c.total, 2);
    expect(c.total).toBeGreaterThan(0);
    // the bill agrees with the independently computed quantities
    expect(c.earthDetail.borrow).toBeCloseTo(r.quantities.deficit * 636, 0);
    expect(c.bridges).toBeCloseTo((r.quantities.bridgeLength / 1000) * 579_911_000, 0);
    // two halves of the route
    const whole = rangeSummary(r), a = rangeSummary(r, 0, 2995), b = rangeSummary(r, 3000, r.length);
    expect(whole.cost.total).toBeCloseTo(c.total, 3);
    expect(a.cost.total + b.cost.total).toBeCloseTo(c.total, 2);
    expect(a.length + b.length).toBeCloseTo(r.length, 6);
    expect(a.quantities.cut + b.quantities.cut).toBeCloseTo(r.quantities.cut, 3);
    expect(a.quantities.crossings).toBe(3);
    expect(b.quantities.buildings).toBe(0);
  });
});

describe('structures and the play-area boundary', () => {
  it('a bridge is not out of bounds because the embankment it replaces would have been', () => {
    // 200 m wide strip of terrain with a 50 m deep valley across it; the route runs down the middle
    const ter = syntheticTerrain(400, 40, 5, (x) => 400 - 50 * Math.max(0, Math.min(1, (300 - Math.abs(x - 1000)) / 100)));
    const r2 = evaluate({ terrain: ter, scenario: D11_SCENARIO, a: { x: 100, y: 100 }, b: { x: 1900, y: 100 } }, {
      category: 'S9.5', speed: 90, pis: [], profileMode: 'manual', vpis: [{ s: 0, z: 400, r: null }, { s: 1800, z: 400, r: null }],
    });
    // 50 m of fill would spread 4.75 + 100 m to each side — beyond the terrain — so it must be a bridge
    expect(r2.kind[90]).toBe(KIND.bridge);
    expect(r2.dayL[90]).toBeGreaterThan(100);
    expect(r2.violations.filter((v) => v.kind === 'oob')).toEqual([]);
  });
});

describe('structure choice', () => {
  it('prices a bridge at the rates of its own deck strip, not of the embankment it replaces', () => {
    // 23 m deep valley; built-up land on both sides of a 20 m wide open strip along the route: the
    // embankment (≈ 100 m wide) would take mostly building land, the 9.5 m deck none
    const ter = syntheticTerrain(600, 80, 5, (x) => 400 - 23 * Math.max(0, Math.min(1, (400 - Math.abs(x - 1500)) / 100)));
    for (let r = 0; r < ter.ny; r++) {
      const y = ter.height - (r + 0.5) * ter.cell;
      if (Math.abs(y - 200) > 10) for (let c = 0; c < ter.nx; c++) ter.lc[r * ter.nx + c] |= BUILTUP_BIT;
    }
    const r2 = evaluate({ terrain: ter, scenario: D11_SCENARIO, a: { x: 100, y: 200 }, b: { x: 2900, y: 200 } }, {
      category: 'S9.5', speed: 90, pis: [], profileMode: 'manual', vpis: [{ s: 0, z: 400, r: null }, { s: 2800, z: 400, r: null }],
    });
    // on the valley side, 10 m of fill: an embankment whose slopes reach into the building land
    expect(r2.kind[104]).toBe(KIND.earth);
    expect(r2.cell.urban[104]).toBeGreaterThan(0.4);
    expect(r2.kind[140]).toBe(KIND.bridge);
    expect(r2.cell.urban[140]).toBe(0);
    expect(r2.parts.land[140]).toBeCloseTo(r2.ds * 9.5 * 400, 6);
  });
});

describe('auto-profile mass-balance search', () => {
  it('finds the material value at which the grade line balances', () => {
    const s = Float64Array.from({ length: 401 }, (_, i) => i * 10);
    const g = Float64Array.from(s, (v) => 300 + 0.02 * v + 3 * Math.sin(v / 300));
    // the cheapest grade sits (300 − v) / 50 m above the ground; the balance is measured on the
    // returned grade line: minus its mean height above the ground (per metre of route)
    const balanceOf = (vpis: VPI[]) => {
      const z = elevations(buildProfile(vpis, 6000, 3400), s);
      let sum = 0;
      for (let i = 0; i < s.length; i++) sum += z[i] - g[i];
      return (-1e5 * sum) / s.length;
    };
    const balance = { costFor: (v: number) => (h: number) => 1e4 * (h - (300 - v) / 50) ** 2, balanceOf, start: 200, lo: -150, hi: 600, tolerance: 2e4 };
    const opt = { maxGradient: 0.06, minCrest: 6000, minSag: 3400, costPerM: balance.costFor(200) };
    const fixed = autoProfile(s, g, opt), r = autoProfile(s, g, { ...opt, balance });
    expect(r.feasible).toBe(true);
    // at the start value the line sits ≈ 2 m above the ground; the search brings it down to it
    expect(Math.abs(balanceOf(fixed.vpis))).toBeGreaterThan(1.5e5);
    expect(Math.abs(balanceOf(r.vpis))).toBeLessThan(4e4);
    expect(Math.abs(r.materialValue! - 300)).toBeLessThan(30);
  });
});
