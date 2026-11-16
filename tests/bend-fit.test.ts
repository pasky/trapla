import { expect, it } from 'vitest';
import { fitPlacedBend, BEND_FIT_MAX } from '../src/core/bend-fit';

it('moves a rebuild-drag bend, bounded, to where its track curve has room', () => {
  const a = { x: 0, y: 0 }, b = { x: 1200, y: 0 };
  const near = [{ x: 1000, y: 150, r: null }]; // R ≥ 740 m at 120 km/h: no room this close to B
  const fitted = fitPlacedBend(a, b, near, 0, 'R1', 120)!;
  expect(fitted).not.toBeNull();
  const moved = Math.hypot(fitted[0].x - near[0].x, fitted[0].y - near[0].y);
  expect(moved).toBeGreaterThan(0);
  expect(moved).toBeLessThanOrEqual(BEND_FIT_MAX);
  expect(fitted[0].x).toBeLessThan(near[0].x); // away from B
  expect(fitPlacedBend(a, b, [{ x: 600, y: 60, r: null }], 0, 'R1', 120)).toBeNull(); // fits already
});
