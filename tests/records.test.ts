// A record line only where the player made the structure (ui/records.ts, research/97): the starter's own tunnel says
// nothing, a bend moved over it or a pin on it does; a bend moved far off, where our line over it stays, does not.
import { describe, expect, it } from 'vitest';
import { earnedRecord } from '../src/ui/records';
import { recordLine } from '../src/core/data/records';
import type { Design, Result } from '../src/core/evaluate';
import type { Run } from '../src/core/structures';

const n = 101, ds = 100;
// a straight line A (0, 0) → B (10 km, 0) through a bend at (5 km, 0) … the result as evaluated, a 3 km tunnel in the middle
const r = { x: Float64Array.from({ length: n }, (_, i) => i * ds), y: new Float64Array(n), grade: new Float64Array(n), ground: new Float64Array(n), ds } as unknown as Result;
const run = { kind: 2, i0: 35, i1: 65, s0: 3500, s1: 6500, length: 3000 } as Run;
const start: Design = { category: 'D27.5', speed: 110, profileMode: 'auto', vpis: [], pis: [{ x: 5000, y: 0, r: null }, { x: 9000, y: 0, r: null }] };
const ends = { a: { x: 0, y: 0 }, b: { x: 10000, y: 0 } };
const say = (d: Design) => earnedRecord(r, d, 'motorway', run, ends, () => [{ design: start, ...ends }]);

describe('records', () => {
  it('fire above the larger published figure only', () => {
    expect(recordLine('tunnel', 'motorway', 2168, 0)).toBeNull();
    expect(recordLine('tunnel', 'motorway', 2169, 0)).toMatch(/Panenská/);
    expect(recordLine('tunnel', 'railway', 3000, 0)).toBeNull();
    expect(recordLine('bridge', 'road', 300, 91)).toMatch(/Žďákov/);
  });
  it('are said only on a structure the player touched', () => {
    expect(say(start)).toBeNull();
    expect(say({ ...start, pis: [{ x: 5000, y: 30, r: null }, start.pis[1]] })).toMatch(/Panenská/);
    expect(say({ ...start, gradePins: [{ s: 5000, z: 10 }] })).toMatch(/Panenská/);
    expect(say({ ...start, gradePins: [{ s: 9000, z: 10 }] })).toBeNull();
    // the far bend moved along the line: the bends' lines over the tunnel are the same
    expect(say({ ...start, pis: [start.pis[0], { x: 8000, y: 0, r: null }] })).toBeNull();
    // a road the player added: nothing to start from
    expect(earnedRecord(r, start, 'motorway', run, ends, () => [])).toMatch(/Panenská/);
  });
});
