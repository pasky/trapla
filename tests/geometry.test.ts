import { describe, expect, it } from 'vitest';
import { buildAlignment, pointAt, station, transitionTangent } from '../src/core/horizontal';
import { buildProfile, elevations } from '../src/core/vertical';

describe('horizontal alignment', () => {
  it('right-angle bend: tangent length, arc length, external distance', () => {
    const R = 400;
    const al = buildAlignment({ x: 0, y: 0 }, { x: 1000, y: 1000 }, [{ x: 0, y: 1000, r: R }], 100, 50);
    const c = al.curves[0];
    expect(c.delta).toBeCloseTo(Math.PI / 2, 9);
    expect(c.t).toBeCloseTo(R, 6);
    expect(c.arcLen).toBeCloseTo((Math.PI / 2) * R, 6);
    expect(al.length).toBeCloseTo(2000 - 2 * R + (Math.PI / 2) * R, 6);
    // arc midpoint is E = R(sec(Δ/2) − 1) from the PI
    const mid = pointAt(al, (c.sStart + c.sEnd) / 2);
    expect(Math.hypot(mid.x - 0, mid.y - 1000)).toBeCloseTo(R * (1 / Math.cos(Math.PI / 4) - 1), 6);
    // turning right (north then east)
    expect(c.dir).toBe(-1);
    const end = pointAt(al, al.length);
    expect(end.x).toBeCloseTo(1000, 6);
    expect(end.y).toBeCloseTo(1000, 6);
    expect(end.tx).toBeCloseTo(1, 9);
  });

  it('stationing is continuous with unit-speed parameterisation', () => {
    const al = buildAlignment({ x: 0, y: 0 }, { x: 3000, y: 0 },
      [{ x: 800, y: 600, r: 500 }, { x: 2000, y: -300, r: 700 }], 100, 90);
    const st = station(al, 10);
    for (let i = 1; i < st.n; i++) {
      const chord = Math.hypot(st.x[i] - st.x[i - 1], st.y[i] - st.y[i - 1]);
      expect(chord).toBeLessThanOrEqual(st.ds + 1e-6);
      expect(chord).toBeGreaterThan(st.ds * 0.999);
    }
  });

  it('overlapping arcs are reduced so the geometry stays continuous, and the legs report the overlap', () => {
    const al = buildAlignment({ x: 0, y: 0 }, { x: 600, y: 0 },
      [{ x: 200, y: 200, r: 2000 }, { x: 400, y: 0, r: 2000 }], 100, 90);
    expect(al.legs[1].used).toBeGreaterThan(al.legs[1].length);
    const st = station(al, 5);
    for (let i = 1; i < st.n; i++) {
      expect(Math.hypot(st.x[i] - st.x[i - 1], st.y[i] - st.y[i - 1])).toBeLessThanOrEqual(st.ds + 1e-6);
    }
    expect(st.x[st.n - 1]).toBeCloseTo(600, 6);
  });

  it('transition tangent reduces to R·tan(Δ/2) without a transition and grows by ≈ L/2 with one', () => {
    expect(transitionTangent(500, 0.6, 0)).toBeCloseTo(500 * Math.tan(0.3), 9);
    expect(transitionTangent(500, 0.6, 90) - 500 * Math.tan(0.3)).toBeGreaterThan(44);
    expect(transitionTangent(500, 0.6, 90) - 500 * Math.tan(0.3)).toBeLessThan(47);
  });
});

describe('vertical alignment', () => {
  it('symmetric crest: middle ordinate L·Δg/8 and tangency at both ends', () => {
    const R = 5000;
    const p = buildProfile([{ s: 0, z: 100, r: null }, { s: 500, z: 110, r: R }, { s: 1000, z: 100, r: null }], 6000, 3400);
    const c = p.curves[0];
    expect(c.type).toBe('crest');
    expect(c.len).toBeCloseTo(R * 0.04, 9);
    const L = c.len;
    const z = [500 - L / 2, 500, 500 + L / 2, 500 - L / 2 - 1, 500 + L / 2 + 1].map((s) => elevations(p, [s])[0]);
    expect(z[1]).toBeCloseTo(110 - (L * 0.04) / 8, 9);
    expect(z[0]).toBeCloseTo(110 - 0.02 * L / 2, 9);
    expect(z[2]).toBeCloseTo(110 - 0.02 * L / 2, 9);
    expect(z[0] - z[3]).toBeCloseTo(0.02, 6);
    expect(z[2] - z[4]).toBeCloseTo(0.02, 6);
  });

  it('default radius is the norm minimum for the curve type', () => {
    const p = buildProfile([{ s: 0, z: 0, r: null }, { s: 500, z: -10, r: null }, { s: 1000, z: 0, r: null }], 6000, 3400);
    expect(p.curves[0].type).toBe('sag');
    expect(p.curves[0].r).toBe(3400);
  });
});
