import { describe, expect, it } from 'vitest';
import { culvertCost, WaterNet, waterSize, waterSizer, type WaterCrossing, type WaterData } from '../src/core/watercourses';
import { evaluate, type Design } from '../src/core/evaluate';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { Terrain, syntheticTerrain, LC } from '../src/core/terrain';
import { PART_KEYS } from '../src/core/cost';

const crossing: WaterCrossing = { s: 1000, x: 1250, y: 250, id: 1, waterKind: 'stream', width: 0.5,
  catchmentKm2: 0.1, truncated: false, sine: 1 };
const data = (area: number, points = [[1250, 0], [1250, 250], [1250, 500]]): WaterData => ({ version: 1, method: 'synthetic',
  reaches: [{ id: 1, kind: 'stream', width: null, points,
    catchmentKm2: points.map(() => area), truncated: points.map(() => false) }] });
function context(area: number, depth = 7, watercourses = data(area)) {
  const source = syntheticTerrain(500, 100, 5,
    x => 400 - depth * Math.min(1, Math.max(0, Math.min(x - 250, 2250 - x)) / 300));
  const q = new Uint16Array(500 * 100);
  for (let r = 0; r < 100; r++) for (let c = 0; c < 500; c++) q[r * 500 + c] = Math.round(source.sample(c, r) * 100);
  // Road land-cover deliberately overwrites the stream. Vector hydrology must still see it.
  const terrain = new Terrain({ nx: 500, ny: 100, cell: 5, base: 0, scale: 0.01, q,
    lc: new Uint8Array(q.length).fill(LC.road), watercourses });
  return { terrain, scenario: D11_SCENARIO, a: { x: 250, y: 250 }, b: { x: 2250, y: 250 } };
}
const design: Design = { category: 'S9.5', speed: 80, pis: [], profileMode: 'manual',
  vpis: [{ s: 0, z: 400, r: null }, { s: 2000, z: 400, r: null }] };

describe('watercourse crossing assemblies', () => {
  it('deduplicates shared vertices but preserves distinct nearby streams and recrossings', () => {
    const d = data(1);
    d.reaches.push({ ...d.reaches[0], id: 2, points: [[1260, 0], [1260, 250], [1260, 500]] });
    const hits = new WaterNet(d).intersections(3, [0, 1000, 2000], [250, 1250, 2250], [250, 250, 250]);
    expect(hits.map(c => c.s)).toEqual([1000, 1010]);
    expect(hits[0].sine).toBe(1);
    const back = new WaterNet(data(1)).intersections(3, [0, 2000, 4000], [250, 2250, 250], [250, 250, 250]);
    expect(back.map(c => c.s)).toEqual([1000, 3000]);
  });
  it('OSM splits at or near a skew crossing do not invent a parallel channel or another structure', () => {
    const full = data(0.1, [[1000, 0], [1500, 500]]);
    const baseline = evaluate(context(0.1, 7, full), design);
    expect(baseline.waterCrossings[0].structure).toBe('pipe');
    for (const split of [[1250, 250], [1260, 260]]) {
      const divided = data(0.1, [[1000, 0], split]);
      divided.reaches.push({ ...divided.reaches[0], id: 2, points: [split, [1500, 500]] });
      const r = evaluate(context(0.1, 7, divided), design);
      expect(r.waterCrossings).toHaveLength(1);
      expect(r.waterCrossings[0].structure).toBe('pipe');
      expect(r.cost.total).toBeCloseTo(baseline.cost.total, 4);
      expect(r.violations.filter(v => v.kind === 'crossing' || v.kind === 'footprint')).toHaveLength(0);
    }
  });
  it('sizes up with runoff and width, reserves natural bed/bank, and rejects impractical length', () => {
    const small = waterSize(crossing, 40);
    const medium = waterSize({ ...crossing, catchmentKm2: 2 }, 40);
    const large = waterSize({ ...crossing, catchmentKm2: 30 }, 40);
    expect(small.type).toBe('pipe');
    expect(medium.type).toBe('box');
    expect(medium.naturalBed).toBe(true);
    expect(medium.capacity).toBeGreaterThanOrEqual(medium.q100);
    expect(large.type).toBe('bridge');
    expect(waterSize({ ...crossing, width: 8 }, 40).type).toBe('bridge');
    expect(waterSize(crossing, 101).type).toBe('bridge');
    expect(waterSize({ ...crossing, sine: 0.2 }, 40).type).toBe('bridge');
    const uncertain = waterSize({ ...crossing, truncated: true }, 40);
    expect(uncertain.q100).toBeGreaterThan(small.q100);
    // Endworks are charged once at each end, independent of barrel length.
    expect(culvertCost(crossing, 40) - culvertCost(crossing, 20)).toBeCloseTo(20 * small.perM, 6);
    expect(culvertCost(crossing, 40) - 40 * small.perM).toBeCloseTo(2 * small.head, 6);
  });
  it('cached sizing agrees through length thresholds in either direction, including skew', () => {
    for (const c of [crossing, { ...crossing, sine: 0.2 }, { ...crossing, catchmentKm2: 2 },
      { ...crossing, waterKind: 'river' as const, truncated: true }]) {
      const cached = waterSizer(c);
      const lengths = [0, 14.999, 15, 15.001, 79.999, 80, 80.001, 100, 100.001, 200];
      for (const length of [...lengths, ...lengths.slice().reverse()]) {
        const width = length * c.sine;
        expect(cached(width)).toEqual(waterSize(c, width));
      }
    }
  });
  it('bills a full culvert in 7 m fill despite road raster masking; larger basin forces a bridge', () => {
    const r = evaluate(context(0.1), design);
    expect(r.waterCrossings).toHaveLength(1);
    expect(r.waterCrossings[0].structure).toBe('pipe');
    expect(r.parts.culverts.filter(v => v > 0)).toHaveLength(1);
    expect(r.parts.culverts.reduce((a, b) => a + b, 0)).toBeCloseTo(r.waterCrossings[0].cost, 6);
    expect(PART_KEYS.reduce((sum, key) => sum + r.parts[key].reduce((a, b) => a + b, 0), 0)).toBeCloseTo(r.cost.total, 4);
    const big = evaluate(context(30), design);
    expect(big.waterCrossings[0].structure).toBe('bridge');
    expect(big.cost.earthDetail.culverts).toBe(0);
    const blocked = evaluate(context(30), { ...design, structureOverrides: [{ s0: 900, s1: 1100, kind: 0 }] });
    expect(blocked.waterCrossings[0].structure).toBe('blocked');
    expect(blocked.violations.some(v => v.kind === 'crossing')).toBe(true);
  });
  it('charges an incised between-station gully from the crossing elevation, not the higher station', () => {
    const d = data(0.1, [[1255, 0], [1255, 500]]);
    const q = new Uint16Array(500 * 100).fill(40000);
    for (let r = 0; r < 100; r++) {
      q[r * 500 + 249] = q[r * 500 + 252] = 41000;
      q[r * 500 + 250] = q[r * 500 + 251] = 39600;
    }
    const terrain = new Terrain({ nx: 500, ny: 100, cell: 5, base: 0, scale: 0.01, q, lc: new Uint8Array(q.length), watercourses: d });
    const r = evaluate({ ...context(0.1), terrain }, design), c = r.waterCrossings[0];
    expect(r.grade[c.i] - r.ground[c.i]).toBeLessThan(0);
    expect(c.structure).toBe('pipe');
    expect(r.parts.culverts[c.i]).toBeGreaterThan(0);
    expect(r.parts.culverts[c.i]).toBeCloseTo(c.cost, 6);
  });
  it('a stream above a tunnel does not destroy another stream clearance in Auto', () => {
    const nx = 800, ny = 100, q = new Uint16Array(nx * ny);
    for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
      const x = (c + 0.5) * 5;
      q[r * nx + c] = Math.round(100 * (400 + 100 * Math.max(0, Math.min(1, (x - 1200) / 200, (2400 - x) / 200))));
    }
    const water = data(0.1, [[600, 0], [600, 500]]);
    water.reaches.push({ ...water.reaches[0], id: 2, points: [[1800, 0], [1800, 500]] });
    const terrain = new Terrain({ nx, ny, cell: 5, base: 0, scale: 0.01, q, lc: new Uint8Array(q.length), watercourses: water });
    const r = evaluate({ ...context(0.1), terrain, b: { x: 3750, y: 250 } }, { ...design, profileMode: 'auto' });
    expect(['pipe', 'box', 'bridge']).toContain(r.waterCrossings[0].structure);
    expect(r.waterCrossings[1].structure).toBe('tunnel');
    expect(r.violations.filter(v => v.kind === 'crossing')).toHaveLength(0);
    // A narrow cover pocket cannot waive the minimum tunnel length just because water forces it.
    q.fill(40000);
    for (let row = 0; row < ny; row++) for (let col = 247; col <= 252; col++) q[row * nx + col] = 41800;
    const thin = new Terrain({ nx, ny, cell: 5, base: 0, scale: 0.01, q, lc: new Uint8Array(q.length), watercourses: data(0.1) });
    const short = evaluate({ ...context(0.1), terrain: thin }, design);
    expect(short.waterCrossings[0].structure).toBe('blocked');
    expect(short.violations.some(v => v.title === 'Watercourse tunnel is too short')).toBe(true);
  });
  it('detects a parallel channel in the earthwork footprint without a centreline crossing', () => {
    const water = data(0.1, [[750, 260], [1750, 260]]);
    expect(new WaterNet(water).intersections(2, [0, 2000], [250, 2250], [250, 250])).toHaveLength(0);
    expect(new WaterNet(water).section(1250, 250, 1, 0, 20, 20)).toHaveLength(1);
  });
  it('does not silently culvert a cut; Auto lifts the grade to pass the stream', () => {
    const cut = evaluate(context(0.1, -3), design);
    expect(cut.cost.earthDetail.culverts).toBe(0);
    expect(cut.waterCrossings[0].structure).toBe('blocked');
    expect(cut.violations.some(v => v.title === 'Cut intercepts a watercourse')).toBe(true);
    const auto = evaluate(context(0.1, 0), { ...design, profileMode: 'auto' });
    expect(auto.waterCrossings[0].structure).not.toBe('blocked');
    expect(auto.grade[auto.waterCrossings[0].i] - auto.ground[auto.waterCrossings[0].i]).toBeGreaterThan(1.7);
  });
});
