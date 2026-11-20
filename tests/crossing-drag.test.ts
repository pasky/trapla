// A selected crossing's ring slid along our road (ui/crossing-drag.ts): the crossed road's piece moves across its own
// direction so that it crosses ours under the pointer.
import { expect, it } from 'vitest';
import { buildAlignment, station } from '../src/core/horizontal';
import { bendRules, horizontalRules } from '../src/core/data/norms';
import { slideSection, slideTo } from '../src/ui/crossing-drag';

// our road: west–east along y = 0
const axis = { x: Array.from({ length: 161 }, (_, k) => -400 + 5 * k), y: Array.from({ length: 161 }, () => 0), s: Array.from({ length: 161 }, (_, k) => 5 * k) };
const crossesAt = (a: { x: number; y: number }, b: { x: number; y: number }, pis: ReturnType<typeof slideTo>) => {
  const st = station(buildAlignment(a, b, pis, horizontalRules(70, 'S7.5'), bendRules(pis, 70, 'S7.5')), 1);
  for (let k = 1; k < st.n; k++) if ((st.y[k - 1] <= 0) !== (st.y[k] <= 0)) return st.x[k - 1] + (st.x[k] - st.x[k - 1]) * (0 - st.y[k - 1]) / (st.y[k] - st.y[k - 1]);
  return NaN;
};
it('on a long straight: two bends either side carry the piece across, it crosses where the ring was dragged', () => {
  const a = { x: 0, y: -300 }, b = { x: 0, y: 300 };
  const sec = slideSection(a, b, [], 70, 'S7.5', { x: 0, y: 0 });
  expect(sec.pis.length).toBe(2);
  expect(crossesAt(a, b, slideTo(sec, axis, { x: 40, y: 0 }))).toBeCloseTo(40, 0);
});
it('near the road\'s end: one bend at the crossing, corrected where its curve cuts the corner; out of reach, as far as it goes', () => {
  const a = { x: 0, y: -40 }, b = { x: 0, y: 200 };
  const sec = slideSection(a, b, [], 70, 'S7.5', { x: 0, y: 0 });
  expect(sec.pis.length).toBe(1);
  expect(Math.abs(crossesAt(a, b, slideTo(sec, axis, { x: 15, y: 0 })) - 15)).toBeLessThan(1);
  // (10 m from its start the one bend's curve never lets it cross 60 m away: it goes as far as 1.5 × 60 + 10 m allows)
  const short = slideSection({ x: 0, y: -10 }, { x: 0, y: 100 }, [], 70, 'S7.5', { x: 0, y: 0 }), far = slideTo(short, axis, { x: 60, y: 0 });
  expect(Math.abs(far[0].x)).toBeLessThanOrEqual(100.01);
  expect(crossesAt({ x: 0, y: -10 }, { x: 0, y: 100 }, far)).toBeGreaterThan(20);
});
