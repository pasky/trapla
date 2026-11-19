import { describe, expect, it } from 'vitest';
import { footprintConflicts, type FootprintJunction, type FootprintRoute } from '../src/core/footprint';
import { RoadNet } from '../src/core/roadnet';
import { syntheticTerrain } from '../src/core/terrain';
import { ENDPOINT_JUNCTIONS } from '../src/core/data/urban';
import { evaluate, type Design } from '../src/core/evaluate';
import { D11_SCENARIO } from '../src/core/data/scenario';

// A 1 km route ending at x=1100 in a 25 m fill-like footprint; a joined road runs across its end.
const n = 101, array = (v: number) => new Float64Array(n).fill(v);
const route = (junctions?: FootprintJunction[]): FootprintRoute => ({ n, ds: 10, s: Float64Array.from({ length: n }, (_, i) => i * 10),
  x: Float64Array.from({ length: n }, (_, i) => 100 + i * 10), y: array(250), tx: array(1), ty: array(0),
  grade: array(100), kind: new Uint8Array(n), dayL: array(20), dayR: array(20), zDayL: array(100), zDayR: array(100),
  crownWidth: 10, runs: [], ...(junctions ? { junctions } : {}) });
const terrain = syntheticTerrain(300, 100, 5, () => 100);
// way 0: joined road crossing just before the end; way 1: another road inside the zone;
// way 2: the joined class beyond the zone (also declared joined).
const roads = new RoadNet({ cls: ['primary', 'tertiary'], ways: [[0, 1092, 200, 1092, 300], [1, 1080, 200, 1080, 300], [0, 1000, 200, 1000, 300]] });
const arm = (ways: number[]): FootprintJunction => ({ end: 'b', kind: 'roundabout-arm', ways: new Set(ways), ...ENDPOINT_JUNCTIONS['roundabout-arm'] });

describe('scenario-declared endpoint junctions', () => {
  it('without a declared junction, covering the joined road at the end is a violation', () => {
    const r = footprintConflicts(route(), terrain, roads, [], []);
    expect(r.conflicts.some(c => c.roadId === 0 && c.action === 'blocked')).toBe(true);
  });
  it('prices the joined road inside the sourced zone once and keeps every other conflict', () => {
    const r = footprintConflicts(route([arm([0, 2])]), terrain, roads, [], []);
    const junctions = r.conflicts.filter(c => c.action === 'junction');
    expect(junctions).toHaveLength(1);
    expect(junctions[0].cost).toBe(ENDPOINT_JUNCTIONS['roundabout-arm'].cost);
    expect(junctions[0].lumpCost).toBe(junctions[0].cost);
    expect(junctions[0].length).toBeGreaterThan(0);
    expect(junctions[0].s0).toBeCloseTo(1000 - ENDPOINT_JUNCTIONS['roundabout-arm'].zone);
    // Joined road inside the zone: no conflict or violation of its own.
    expect(r.conflicts.some(c => c.roadId === 0 && c.action !== 'junction')).toBe(false);
    // Another road inside the zone, and the joined class outside the zone, stay as before.
    expect(r.conflicts.some(c => c.roadId === 1 && c.action !== 'junction')).toBe(true);
    expect(r.conflicts.some(c => c.roadId === 2 && c.action !== 'junction')).toBe(true);
  });
  // Šternberk A (bend 1 dragged): the I/46 our road leaves forks off at a small angle and stays under our earthworks
  // a few metres past the merge's zone; that mouth is rebuilt with the junction. A road running along us further
  // past it stays a conflict.
  it('the joined road forking off just past the zone is the junction\'s mouth, a longer stretch is not', () => {
    const merge: FootprintJunction = { end: 'b', kind: 'merge', ways: new Set([0]), ...ENDPOINT_JUNCTIONS.merge };
    const fork = (dy: number) => footprintConflicts(route([merge]), terrain,
      new RoadNet({ cls: ['primary'], ways: [[0, 1100, 250, 900, 250 + dy]] }), [], []).conflicts.filter(c => c.roadId === 0);
    // leaves our 20 m slopes (+ its half width) ≈ 105 m before the end: ≈ 15 m past the 90 m zone
    const mouth = fork(47.1);
    expect(mouth.map(c => c.action)).toEqual(['junction']);
    expect(mouth[0].length).toBeGreaterThan(90);
    // ≈ 250 m along our slopes: 160 m past the zone, a road to move aside
    expect(fork(20).some(c => c.action !== 'junction')).toBe(true);
  });
  it('bills the junction even when its edge stays clear of the joined road', () => {
    const far = new RoadNet({ cls: ['primary'], ways: [[0, 1150, 200, 1150, 300]] });
    const r = footprintConflicts(route([{ ...arm([0]), end: 'b' }]), terrain, far, [], []);
    const junction = r.conflicts.find(c => c.action === 'junction');
    expect(junction?.length).toBe(0);
    expect(junction?.cost).toBe(ENDPOINT_JUNCTIONS['roundabout-arm'].cost);
  });
  it('is applied by evaluate only at the declared end and booked once, without surcharge', () => {
    const design: Design = { category: 'S9.5', speed: 80, pis: [], profileMode: 'auto', vpis: [] };
    const base = { terrain: syntheticTerrain(300, 100, 5, () => 100), scenario: D11_SCENARIO, a: { x: 100, y: 250 }, b: { x: 1100, y: 250 },
      roads: new RoadNet({ cls: ['primary'], ways: [[0, 1100, 200, 1100, 300]] }) };
    const plain = evaluate(base, design);
    const joined = evaluate({ ...base, junctions: [{ x: 1100, y: 250, kind: 'roundabout-arm', ways: [0] }] }, design);
    const elsewhere = evaluate({ ...base, junctions: [{ x: 1100, y: 260, kind: 'roundabout-arm', ways: [0] }] }, design);
    expect(elsewhere.cost.total).toBe(plain.cost.total);
    expect(joined.footprintConflicts.filter(c => c.action === 'junction')).toHaveLength(1);
    const sum = (r: typeof plain) => r.parts.crossings.reduce((a, b) => a + b, 0);
    expect(sum(joined) - sum(plain)).toBeCloseTo(ENDPOINT_JUNCTIONS['roundabout-arm'].cost, 0);
  });
  // any-road-scene (D11): a new road placed on Jičínská 1 m beside its mapped line met it again 1.5 m on
  // and cut it as a crossing ("reconnection", the old road drawn removed, a turnaround)
  it('the joined road met again inside the junction is the junction, not a crossing', () => {
    const design: Design = { category: 'S7.5', speed: 70, pis: [], profileMode: 'auto', vpis: [] };
    // the end 1 m south of the joined road, the new road leaving north-east across it
    const base = { terrain: syntheticTerrain(300, 100, 5, () => 100), scenario: D11_SCENARIO, a: { x: 100, y: 249 }, b: { x: 500, y: 500 },
      roads: new RoadNet({ cls: ['primary', 'tertiary'], ways: [[0, 0, 250, 1400, 250], [1, 0, 400, 1400, 400]] }) };
    const plain = evaluate(base, design);
    expect(plain.crossings.map(c => c.roadId).sort()).toEqual([0, 1]);
    const joined = evaluate({ ...base, junctions: [{ x: 100, y: 249, kind: 'tie-in', ways: [0] }] }, design);
    expect(joined.crossings.map(c => c.roadId)).toEqual([1]); // the other road is still crossed
  });
});
