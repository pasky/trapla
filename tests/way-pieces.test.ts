// A cut way's pieces (way-pieces.ts): the way each still reaches the network, what its own stretch serves, and how
// far round its traffic goes and along which road (the crossing card's words, research/86).
import { describe, expect, it } from 'vitest';
import { RoadNet } from '../src/core/roadnet';
import { pieceAccess } from '../src/core/way-pieces';

// Our road runs along y = 0 on earthworks for x < 250 (a bridge beyond). A service road crosses it at x = 0 between
// two class III roads (y = ±100) that meet a local road at x = 300, which passes under our bridge.
const net = new RoadNet({ cls: ['service', 'tertiary', 'unclassified'], ways: [
  [0, 0, -100, 0, -10, 0, 10, 0, 100],
  [1, 0, 100, 150, 100, 300, 100],
  [1, 0, -100, 150, -100, 300, -100],
  [2, 300, -100, 300, 0, 300, 100],
] });
const severed = (a: { x: number; y: number }, b: { x: number; y: number }) => (a.y > 0) !== (b.y > 0) && Math.min(a.x, b.x) < 250;
const ends: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 0, y: -10 }, { x: 0, y: 10 }];

describe('a cut way\'s pieces', () => {
  it('each piece is traced to the road it still reaches, and the way round is measured along the network', () => {
    const a = pieceAccess({ net, severed, round: 2000 }, 0, ends);
    expect(a.connected).toEqual([true, true]);
    expect(a.reach?.map(r => r && [r.cls, r.path[0], r.path.at(-1)])).toEqual([['tertiary', ends[0], { x: 0, y: -100 }], ['tertiary', ends[1], { x: 0, y: 100 }]]);
    // 90 + 300 + 200 + 300 + 90 m, along a class III road furthest
    expect(a.round).toBeCloseTo(980, 6);
    expect(a.via?.cls).toBe('tertiary');
    // (not measured beyond the limit)
    expect(pieceAccess({ net, severed, round: 900 }, 0, ends).round).toBe(Infinity);
  });
  it('says which buildings a piece\'s own stretch serves', () => {
    const house = { x: 5, y: 60 };
    const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((house.x - a.x) * dx + (house.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(house.x - a.x - t * dx, house.y - a.y - t * dy) < 30;
    };
    expect(pieceAccess({ net, severed, serves: s => s.some(([a, b]) => near(a, b)) ? [7] : [] }, 0, ends).serves).toEqual([[], [7]]);
  });
});
describe('a cut inside one mapped segment', () => {
  it('is measured round as any other', () => {
    // (the service road a single segment across our road)
    const one = new RoadNet({ cls: ['service', 'tertiary', 'unclassified'], ways: [[0, 0, -100, 0, 100], [1, 0, 100, 300, 100], [1, 0, -100, 300, -100], [2, 300, -100, 300, 0, 300, 100]] });
    expect(pieceAccess({ net: one, severed, round: 2000 }, 0, ends).round).toBeCloseTo(980, 6);
  });
});
