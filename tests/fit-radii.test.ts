import { describe, expect, it } from 'vitest';
import { fitSetRadii } from '../src/core/fit-radii';
import { buildAlignment, type PI } from '../src/core/horizontal';
import { horizontalRules } from '../src/core/data/norms';

const a = { x: 0, y: 0 }, b = { x: 3000, y: 0 };
const pair = (gap: number, r0: number | null = 600, r1: number | null = 600): PI[] => [{ x: 1000, y: 150, r: r0 }, { x: 1000 + gap, y: -150, r: r1 }];
const spare = (pis: PI[]) => { const j = buildAlignment(a, b, pis, horizontalRules(70, 'S11.5')).joints[1]; return j.length - j.tFrom - j.needFrom - j.tTo - j.needTo; };

describe('the editor lowers a set radius a bend drag leaves too large (core/fit-radii.ts)', () => {
  it('keeps set radii where they fit and leaves Auto radii alone', () => {
    expect(fitSetRadii(a, b, pair(500), 1, [600, 600], 70, 'S11.5').lowered).toEqual([]);
    expect(fitSetRadii(a, b, pair(300, null, null), 1, [null, null], 70, 'S11.5').lowered).toEqual([]);
  });
  it('lowers the dragged bend just enough, to the editing step, and gives the set radius back as room returns', () => {
    const { pis, lowered } = fitSetRadii(a, b, pair(400), 1, [600, 600], 70, 'S11.5');
    expect(lowered).toEqual([{ i: 1, from: 600, to: pis[1].r }]);
    expect(pis[0].r).toBe(600);
    expect(spare(pis)).toBeGreaterThanOrEqual(-1e-6);
    expect(pis[1].r! % 5).toBe(0);
    expect(spare(pair(400, 600, pis[1].r! + 5))).toBeLessThan(0);
    expect(fitSetRadii(a, b, pair(700, 600, pis[1].r), 1, [600, 600], 70, 'S11.5').pis[1].r).toBe(600);
  });
  it('lowers both bends of a leg in proportion where one alone cannot make room', () => {
    const { pis, lowered } = fitSetRadii(a, b, pair(300), 1, [600, 600], 70, 'S11.5');
    expect(lowered.map(l => l.i)).toEqual([0, 1]);
    expect(Math.abs(pis[0].r! - pis[1].r!)).toBeLessThanOrEqual(5);
    expect(spare(pis)).toBeGreaterThanOrEqual(-1e-6);
  });
});
