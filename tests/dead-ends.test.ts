import { describe, expect, it } from 'vitest';
import { deadEndPieces, deadEndsNear } from '../src/core/dead-ends';
import { BuildingIndex } from '../src/core/buildings';
import { RoadNet } from '../src/core/roadnet';

// our line along y = 0, x 0 … 1000
const line = { n: 11, x: Array.from({ length: 11 }, (_, i) => i * 100), y: new Array(11).fill(0) };

describe('dead ends beside our road', () => {
  it('takes up to the first junction (short of it) or STUB_LENGTH from a dead end near our line, nothing of a through way', () => {
    // way 0: a dead end at (200, 10) running away from us 300 m; way 1 joins it 60 m from that end; way 2 ends far
    // away; way 3 runs through (both ends on other ways)
    const roads = new RoadNet({ cls: ['unclassified'], ways: [[0, 200, 10, 200, 310], [0, 200, 70, 400, 70], [0, 700, 500, 900, 500],
      [0, 400, 70, 400, 310, 200, 310]] });
    const ends = deadEndsNear(roads, undefined, line, 30);
    expect(ends.map(e => [e.way, e.forward])).toEqual([[0, true]]);
    expect(ends[0].limit).toBeCloseTo(60 - 5, 6);
    expect(deadEndPieces(ends, () => false).get(0)).toEqual([[0, 55]]);
    // without the junction: STUB_LENGTH
    const alone = deadEndsNear(new RoadNet({ cls: ['track'], ways: [[0, 200, 310, 200, 10]] }), undefined, line, 30);
    expect(alone.map(e => [e.way, e.forward, e.limit])).toEqual([[0, false, 100]]);
    expect(deadEndPieces(alone, () => false).get(0)).toEqual([[200, 300]]);
  });

  it('stops where it serves a house left standing; one our works take, or a shed, is none', () => {
    const roads = new RoadNet({ cls: ['track'], ways: [[0, 200, 10, 200, 310]] });
    // a house 20 m beside the track 40 m from its dead end, a shed beside it nearer
    const bld = new BuildingIndex([[225, 50, 4], [220, 20, 3]], [[50, 1, 0, 225, 50, 4, 4, 0], [20, 1, 4, 220, 20, 3, 3, 0]]);
    const ends = deadEndsNear(roads, bld, line, 30);
    expect(ends[0].houses.map(h => h.j)).toEqual([0]);
    const [[, keep]] = deadEndPieces(ends, () => false).get(0)!;
    expect(keep).toBeGreaterThan(10);
    expect(keep).toBeLessThan(40);
    expect(deadEndPieces(ends, j => j === 0).get(0)).toEqual([[0, 100]]);
  });
});
