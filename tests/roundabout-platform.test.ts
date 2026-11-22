import { describe, expect, it } from 'vitest';
import { ringPlatform, ringTriangles } from '../src/render/roundabouts';
import type { RingMark } from '../src/core/tie-in';

// A ring at the end of a road in a cutting: the drawn surface is the road's body (2 m down, 8 m wide, from the north)
// cut into ground sloping 10 % down to the east; a mapped road crosses east–west on the ground.
const ring: RingMark = { x: 0, y: 0, r: 20, arms: [
  { x: 0, y: 1, half: 3.5, island: false, path: [{ x: 0, y: 0 }, { x: 0, y: 60 }] },
  { x: 1, y: 0, half: 3.25, island: true, path: [{ x: 0, y: 0 }, { x: 60, y: 0 }] },
  { x: -1, y: 0, half: 3.25, island: true, path: [{ x: 0, y: 0 }, { x: -60, y: 0 }] }] };
const ground = (x: number) => -0.1 * x;
const drawn = (x: number, y: number) => {
  const g = ground(x), body = -2 + 0.02 * y;
  if (y < 0 || Math.abs(x) > 4 + 2 * 1.5) return g;
  return Math.abs(x) <= 4 ? Math.min(g, body) : Math.min(g, body + (Math.abs(x) - 4) / 1.5);
};

describe('a roundabout drawn on its graded platform', () => {
  it('meets each arm at its road and rises or falls evenly between them', () => {
    const p = ringPlatform(ring, drawn);
    expect(p.height(0, 20)).toBeCloseTo(drawn(0, 22), 6);
    expect(p.height(20, 0)).toBeCloseTo(drawn(22, 0), 6);
    expect(p.height(-20, 0)).toBeCloseTo(drawn(-22, 0), 6);
    // (the south, between the east and the west arms: half way)
    expect(p.height(0, -20)).toBeCloseTo((drawn(22, 0) + drawn(-22, 0)) / 2, 6);
  });
  it('is drawn far enough towards the eye to cover all that is drawn inside it (none of the cut shows through)', () => {
    const t = ringTriangles(ring, drawn, 0.2), p = ringPlatform(ring, drawn);
    let over = 0;
    for (let x = -20; x <= 20; x += 0.5) for (let y = -20; y <= 20; y += 0.5)
      if (Math.hypot(x, y) <= 20) over = Math.max(over, drawn(x, y) - p.height(x, y));
    expect(over).toBeGreaterThan(1);
    expect(t.pull).toBeGreaterThan(over);
    expect(t.pulled).toBeGreaterThan(0);
    expect(t.pulled).toBeLessThanOrEqual(t.pos.length / 3);
  });
  it('stands on a fill face where what is drawn round it is lower, never floating', () => {
    // (the ground 3 m lower south of the ring's middle: its south edge, between the east and west arms, over it)
    const low = (x: number, y: number) => drawn(x, y) - (y < -5 ? 3 : 0);
    const t = ringTriangles(ring, low, 0.2);
    expect(t.pos.length / 3).toBeGreaterThan(t.pulled);
    // the faces over what is drawn under them, out past the ring's edge
    let reach = 0;
    for (let k = 3 * t.pulled; k < t.pos.length; k += 3) {
      const x = t.pos[k], y = t.pos[k + 1], z = t.pos[k + 2];
      expect(z).toBeGreaterThanOrEqual(low(x, y) + 0.2 - 1e-6);
      reach = Math.max(reach, Math.hypot(x, y));
    }
    expect(reach).toBeGreaterThan(22);
  });
});
