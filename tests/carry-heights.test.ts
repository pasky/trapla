import { describe, expect, it } from 'vitest';
import { carryVpis } from '../src/core/carry-heights';
import { buildAlignment, pointAt } from '../src/core/horizontal';
import { horizontalRules } from '../src/core/data/norms';

describe('by-hand heights follow a change of plan', () => {
  const a = { x: 0, y: 0 }, b = { x: 6000, y: 0 }, rules = horizontalRules(90, 'S9.5');
  const pis = [{ x: 1500, y: 0, r: null }, { x: 3000, y: 400, r: null }, { x: 4500, y: 0, r: null }];
  const before = buildAlignment(a, b, pis, rules);
  const moved = buildAlignment(a, b, pis.map((p, k) => k === 1 ? { ...p, y: 700 } : p), rules);
  const vpis = [0, 500, 2900, 5600, before.length].map(s => ({ s, z: s / 100, r: null }));
  const carried = carryVpis(before, moved, vpis);
  it('keeps points on unchanged ground where they were', () => {
    expect(moved.length).toBeGreaterThan(before.length + 50);
    for (const k of [1, 3]) {
      const p = pointAt(before, vpis[k].s), q = pointAt(moved, carried[k].s);
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(0.1);
    }
    expect(carried[0].s).toBe(0);
    expect(carried[4].s).toBe(moved.length);
  });
  it('stretches points on the changed stretch, keeping their order and heights', () => {
    expect(carried[2].s).toBeGreaterThan(carried[1].s);
    expect(carried[2].s).toBeLessThan(carried[3].s);
    expect(carried.map(v => v.z)).toEqual(vpis.map(v => v.z));
  });
});
