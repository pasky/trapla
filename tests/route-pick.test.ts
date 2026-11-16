import { describe, expect, it } from 'vitest';
import { footprintHit } from '../src/render/route-pick';

describe('a road end placed on a road\'s earthworks', () => {
  // a road east along y = 0, earthworks 20 m to the left (north) and 8 m to the right
  const n = 21, f = (v: (i: number) => number) => Float64Array.from({ length: n }, (_, i) => v(i));
  const road = { id: 'r', result: { n, ds: 10, s: f(i => i * 10), x: f(i => i * 10), y: f(() => 0), tx: f(() => 1), ty: f(() => 0), dayL: f(() => 20), dayR: f(() => 8) } };
  it('is on that road, as far as its slope edges reach on either side', () => {
    expect(footprintHit([road], 101, 18)).toEqual({ routeId: 'r', s: 100 });
    expect(footprintHit([road], 101, -7)).toEqual({ routeId: 'r', s: 100 });
    expect(footprintHit([road], 101, -10)).toBeNull();
    expect(footprintHit([road], 101, 22)).toBeNull();
    expect(footprintHit([road], 260, 0)).toBeNull(); // beyond its end
  });
});
