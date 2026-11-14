// Regression tests for issues found in the deep review.
import { describe, expect, it } from 'vitest';
import { autoProfile, profileOk } from '../src/core/autoprofile';
import { crossingViolation, mergeNearby, ROAD_CHECKS } from '../src/core/checks';
import { speedNorms } from '../src/core/data/norms';
import { buildAlignment, station } from '../src/core/horizontal';
import { sideSection } from '../src/core/sections';
import { chooseStructures, KIND } from '../src/core/structures';
import { buildProfile } from '../src/core/vertical';

const opt = { maxGradient: 0.06, minCrest: 6000, minSag: 3400, costPerM: (h: number) => 1e4 * h * h };

describe('review regressions', () => {
  it('near U-turn: geometry stays continuous and the PI is flagged', () => {
    const al = buildAlignment({ x: 0, y: 0 }, { x: 0, y: 1 }, [{ x: 1000, y: 0, r: 355 }], 355, 90);
    const st = station(al, 5);
    for (let i = 1; i < st.n; i++) expect(Math.hypot(st.x[i] - st.x[i - 1], st.y[i] - st.y[i - 1])).toBeLessThanOrEqual(st.ds + 1e-6);
    expect(ROAD_CHECKS.horizontal(al, speedNorms(90)).some((v) => v.title.includes('turns back almost on itself'))).toBe(true);
  });

  it('auto-profile keeps the tie-in elevations exactly and reports feasibility honestly', () => {
    const s = Float64Array.from({ length: 111 }, (_, i) => i * 10);
    const g = Float64Array.from(s, (v) => 301 + (65 * v) / 1100);
    const r = autoProfile(s, g, opt);
    expect(r.vpis[0].z).toBe(301);
    expect(r.vpis[r.vpis.length - 1].z).toBeCloseTo(366, 9);
    expect(r.feasible).toBe(true);
    expect(profileOk(r.vpis, 0.06, 6000, 3400)).toBe(true);
    // 20 m rising 2 m cannot be built at 6 %
    const s2 = Float64Array.from([0, 10, 20]), g2 = Float64Array.from([300, 301, 302]);
    expect(autoProfile(s2, g2, opt).feasible).toBe(false);
  });

  it('a grade near the limit that the coarse 2 m grid cannot follow still gets a fine-grid search', () => {
    // 5.5 % average over 900 m: a knot interval (225 m) may rise 13 m on the 1 m grid but only 12 m on
    // the 2 m grid, which is not enough
    const s = Float64Array.from({ length: 91 }, (_, i) => i * 10);
    const g = Float64Array.from(s, (v) => 300 + 0.055 * v + 1.5 * Math.sin((Math.PI * v) / 900));
    const r = autoProfile(s, g, { maxGradient: 0.06, minCrest: 6000, minSag: 3400, costPerM: (h: number) => 1e5 * h * h });
    expect(r.feasible).toBe(true);
    expect(r.vpis.length).toBeGreaterThan(2);
    expect(r.cost).toBeLessThan(2e7);
  });

  it('a slightly shrunk vertical curve (effective radius below minimum) is a violation', () => {
    // crest Δg = 0.02 needs 120 m at R = 6000 but only ~119.6 m fit between the VPIs
    const p = buildProfile([{ s: 0, z: 0, r: null }, { s: 59.8, z: 0.598, r: null }, { s: 119.6, z: 0, r: null }], 6000, 3400);
    expect(ROAD_CHECKS.vertical(p, speedNorms(90), 0.06).some((v) => v.kind === 'vcOverlap')).toBe(true);
  });

  it('a too steep grade says which profile point to move and by how much, and that is enough', () => {
    const pts = [{ s: 0, z: 0, r: null }, { s: 500, z: 40, r: null }, { s: 1000, z: 45, r: null }];
    const grades = (q: typeof pts) => ROAD_CHECKS.vertical(buildProfile(q, 6000, 3400), speedNorms(90), 0.06).filter((v) => v.kind === 'gradient');
    const [v] = grades(pts);
    expect(v).toMatchObject({ vpi: 1, basis: 'norm', fix: 'Lower profile point 1 (km 0.50) by 10.0 m' });
    pts[1].z -= 10;
    expect(grades(pts)).toEqual([]);
  });

  it('nearby violations of the same cause become one entry with the largest fix', () => {
    const v = mergeNearby([
      crossingViolation(7310, 'railway', 3.2, 7.5), crossingViolation(7380, 'railway', 0.6, 7.5),
      crossingViolation(7430, 'railway', 3.8, 7.5), crossingViolation(7800, 'railway', 3, 7.5),
      crossingViolation(7850, 'river', 1, 3),
    ]);
    expect(v.map((x) => [x.s0, x.s1, x.fix])).toEqual([
      [7310, 7430, 'Raise the grade line here by 6.9 m'],
      [7800, 7800, 'Raise the grade line here by 4.5 m'],
      [7850, 7850, 'Raise the grade line here by 2.0 m'],
    ]);
  });

  it('section whose slope lies exactly on the ground has finite areas', () => {
    const r = sideSection(0, 5, { crownWidth: 10, fillSlope: 2, cutSlope: 1.75 }, (o) => (o <= 5 ? 0 : -(o - 5) / 2));
    expect(Number.isFinite(r.fill) && Number.isFinite(r.day)).toBe(true);
    expect(r.day).toBeCloseTo(5, 6);
  });

  it('a forced crossing is bridged over at least the minimum bridge length', () => {
    const n = 50, ds = 10;
    const h = new Float64Array(n).fill(5);
    const forced = new Uint8Array(n); forced[25] = 1;
    const { runs } = chooseStructures({ ds, h, earthPerM: new Float64Array(n).fill(1), bridgePerM: 1e9, tunnelPerM: 1e9, forced });
    expect(runs.length).toBe(1);
    expect(runs[0].kind).toBe(KIND.bridge);
    expect(runs[0].length).toBeGreaterThanOrEqual(30);
  });
});
