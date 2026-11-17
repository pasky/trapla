// The footprint screens' primitives that exist in two forms (one that makes the clipped interval, one that
// only says whether there is one) and one that was rewritten to allocate nothing: they must agree.
import { describe, expect, it } from 'vitest';
import { clipFootprint, FootprintGrid, insideFootprint, touchesFootprint, type FootprintCell, type Segment2 } from '../src/core/footprint-geometry';
import { barrelIntervals, type BarrelEnvelope } from '../src/core/watercourses';

let seed = 11;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const cell = (): FootprintCell => { const a = rand() * Math.PI * 2; return { i: 0, s: 0, x: rand() * 100, y: rand() * 100, tx: Math.cos(a), ty: Math.sin(a), along: 5, left: 4 + rand() * 30, right: 4 + rand() * 30 }; };
const segment = (): Segment2 => {
  // every fourth one parallel to an axis, so the "runs along the edge" branches are met too
  const ax = rand() * 100, ay = rand() * 100, axis = Math.floor(rand() * 4), bx = axis === 0 ? ax : rand() * 100, by = axis === 1 ? ay : rand() * 100;
  return { ax, ay, bx, by, d: rand() * 50, length: Math.hypot(bx - ax, by - ay) };
};

describe('footprint geometry', () => {
  it('touchesFootprint says exactly whether clipFootprint finds an interval', () => {
    let hits = 0;
    for (let k = 0; k < 20000; k++) {
      const c = k % 4 ? cell() : { ...cell(), tx: 1, ty: 0 }, a = segment(), pad = k % 3 ? rand() * 6 : 0;
      const interval = clipFootprint(a, c, pad);
      expect(touchesFootprint(a, c, pad)).toBe(interval !== undefined);
      if (interval) hits++;
    }
    expect(hits).toBeGreaterThan(2000);
  });

  it('the grid answers hits() as a scan of its cells would', () => {
    const cells = Array.from({ length: 60 }, cell), grid = new FootprintGrid(cells);
    for (let k = 0; k < 5000; k++) {
      const p = { x: rand() * 140 - 20, y: rand() * 140 - 20 }, pad = rand() * 3;
      // (the grid registers a cell in every bucket within 20 m of it: a point further out than that is no hit)
      expect(grid.hits(p, pad)).toBe(cells.some(c => insideFootprint(p, c, pad)));
    }
  });

  it('barrelIntervals gives the intervals of the edge-by-edge clip it was written as', () => {
    // the earlier form, kept here as the reference: the four edges of each half as an array of [value, slope, max]
    const reference = (s: Segment2, b: BarrelEnvelope): [number, number][] => {
      const dx = s.ax - b.x, dy = s.ay - b.y;
      const u = dx * b.tx + dy * b.ty, v = -dx * b.ty + dy * b.tx;
      const du = (s.bx - s.ax) * b.tx + (s.by - s.ay) * b.ty, dv = -(s.bx - s.ax) * b.ty + (s.by - s.ay) * b.tx;
      const out: [number, number][] = [];
      for (const side of [-1, 1]) {
        let lo = 0, hi = 1;
        for (const [value, slope, max] of [[-side * u, -side * du, 0], [side * u, side * du, b.along],
          [v - side * u * b.flare, dv - side * du * b.flare, b.left], [-v - side * u * b.flare, -dv - side * du * b.flare, b.right]]) {
          if (Math.abs(slope) < 1e-10) { if (value > max) { hi = -1; break; } }
          else if (slope > 0) hi = Math.min(hi, (max - value) / slope);
          else lo = Math.max(lo, (max - value) / slope);
        }
        if (hi > lo + 1e-9) out.push([s.d + lo * s.length, s.d + hi * s.length]);
      }
      return out;
    };
    let pieces = 0;
    for (let k = 0; k < 20000; k++) {
      const a = rand() * Math.PI * 2, axis = k % 5 === 0;
      const b = { x: rand() * 100, y: rand() * 100, tx: axis ? 1 : Math.cos(a), ty: axis ? 0 : Math.sin(a), along: 5 + rand() * 40, left: 1 + rand() * 8, right: 1 + rand() * 8, flare: rand() * 0.5 } as BarrelEnvelope;
      const s = segment(), got = barrelIntervals(s, b);
      expect(got).toEqual(reference(s, b)); // toEqual on numbers is exact (Object.is)
      pieces += got.length;
    }
    expect(pieces).toBeGreaterThan(2000);
  });
});
