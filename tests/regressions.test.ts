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

  it('deep tunnel costs stay finite below the profile lookup grid, including its zero-weight neighbour', () => {
    const s = Float64Array.from({ length: 201 }, (_, i) => i * 10);
    const g = Float64Array.from(s, s => s > 500 && s < 1500 ? 300 : s > 100 && s < 400 ? 20 : 0);
    const kinds = Int8Array.from(s, s => s >= 900 && s <= 1100 ? KIND.tunnel : -1);
    const r = autoProfile(s, g, { maxGradient: 0.06, minCrest: 3000, minSag: 2000, structureKind: kinds,
      costPerM: (h, k = -1) => k === KIND.tunnel ? 5e5 : 1e3 + h * h * 100 });
    // Result of the original eager, full-height lookup. Unfilled j+1 at clamped x=0 used to
    // turn a finite tunnel price into NaN and silently fall back to the straight profile.
    expect(r).toMatchObject({ feasible: true, cost: 892125720,
      vpis: [{ s: 0, z: 0, r: null }, { s: 250, z: 14, r: null }, { s: 2000, z: 0, r: null }] });
  });

  it('a slightly shrunk vertical curve (effective radius below minimum) is a violation', () => {
    // crest Δg = 0.02 needs 120 m at R = 6000 but only ~119.6 m fit between the VPIs
    const p = buildProfile([{ s: 0, z: 0, r: null }, { s: 59.8, z: 0.598, r: null }, { s: 119.6, z: 0, r: null }], 6000, 3400);
    expect(ROAD_CHECKS.vertical(p, speedNorms(90), 0.06).some((v) => v.kind === 'vcOverlap')).toBe(true);
  });

  it('two height pins too close By hand: named, and the move it offers (along the slope behind) fixes it', () => {
    const pts = [{ s: 0, z: 0, r: null }, { s: 1000, z: 20, r: null }, { s: 1030, z: 19.7, r: null }, { s: 2000, z: 30, r: null }];
    const overlap = (q: typeof pts) => ROAD_CHECKS.vertical(buildProfile(q, 6000, 3400), speedNorms(90), 0.06, false, undefined, true).filter((v) => v.kind === 'vcOverlap');
    const [v] = overlap(pts);
    expect(v).toMatchObject({ title: 'Two height pins too close', s0: 1000, s1: 1030, target: { heightPins: [1, 2] } });
    expect(v.fix).toMatch(/^Move your height pin at km 1\.0[03] at least \d+ m away from the one at km 1\.0[03], or delete one$/);
    const { k, s, z } = v.target!.movePin!;
    pts[k] = { s, z, r: null };
    expect(overlap(pts)).toEqual([]);
  });

  it('the move offered for two height pins too close leaves their curves whole, also where the slope between them changes', () => {
    // review case: grades 2 %, 4 %, 5 %, a 20,000 m radius at the second pin: the first move asked for is not enough
    const norms = speedNorms(90), pts = [{ s: 0, z: 0, r: null }, { s: 80, z: 1.6, r: null }, { s: 160, z: 4.8, r: 20000 as number | null }, { s: 1160, z: 54.8, r: null }];
    const overlap = (q: typeof pts) => ROAD_CHECKS.vertical(buildProfile(q, norms.minCrestRadius, norms.minSagRadius), norms, 0.06, false, undefined, true).filter((v) => v.kind === 'vcOverlap');
    const [v] = overlap(pts);
    expect(v).toBeDefined();
    const move = v.target?.movePin;
    if (move) {
      pts[move.k] = { ...pts[move.k], s: move.s, z: move.z };
      expect(overlap(pts)).toEqual([]);
    }
  });

  it('a too steep grade By hand says which height pin to move and by how much, and that is enough', () => {
    const pts = [{ s: 0, z: 0, r: null }, { s: 500, z: 40, r: null }, { s: 1000, z: 45, r: null }];
    const grades = (q: typeof pts) => ROAD_CHECKS.vertical(buildProfile(q, 6000, 3400), speedNorms(90), 0.06, false, undefined, true).filter((v) => v.kind === 'gradient');
    const [v] = grades(pts);
    expect(v).toMatchObject({ vpi: 1, basis: 'norm', fix: 'Lower your height pin at km 0.50 by 10.0 m' });
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
      [7310, 7430, 'Raise the road here by 6.9 m'],
      [7800, 7800, 'Raise the road here by 4.5 m'],
      [7850, 7850, 'Raise the road here by 2.0 m'],
    ]);
  });

  it('section whose slope lies exactly on the ground has finite areas', () => {
    const r = sideSection(0, 5, { crownWidth: 10 }, (o) => (o <= 5 ? 0 : -(o - 5) / 2.5));
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

describe('grade search shared solves', () => {
  it('two block boundaries whose corridors cover the same stretch each keep their own heights', () => {
    // 6.8 km, boundaries at 2.4 and 4.5 km, knots 500 m apart: both corridors (5 km either side) are the whole route,
    // so a memo keyed by the stretch alone handed the second boundary the first one's heights (cost 2.6 → 31 M)
    const n = 681, s = Float64Array.from({ length: n }, (_, i) => i * 10);
    const g = Float64Array.from(s, x => 300 + 40 * Math.sin(x / 900) + 25 * Math.sin(x / 270));
    const costFor = (v: number) => (h: number) => 2000 + (h < 0 ? 150 * h * h : 300 * h * h) + v * h;
    const balance = { costFor, balanceOf: () => 0, start: 200, lo: -200, hi: 500, tolerance: 1 };
    const o = { maxGradient: 0.06, minCrest: 6000, minSag: 3400, costPerM: costFor(200), blocks: [2400, 4500], balance, knotSpacing: 500 };
    const fresh = autoProfile(s, g, o), shared = autoProfile(s, g, { ...o, memo: new Map() });
    expect(fresh.feasible).toBe(true);
    expect(shared.vpis).toEqual(fresh.vpis);
    expect(shared.cost).toBe(fresh.cost);
  });
});
