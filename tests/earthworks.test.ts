import { describe, expect, it } from 'vitest';
import { autoProfile } from '../src/core/autoprofile';
import { ROAD_CHECKS } from '../src/core/checks';
import { allowanceValuePerKm, rollup } from '../src/core/cost';
import { CATEGORIES } from '../src/core/data/categories';
import { speedNorms } from '../src/core/data/norms';
import { NORM_EARTHWORK_ALLOWANCE, PRICES } from '../src/core/data/prices';
import { massHaul, volumes } from '../src/core/earthworks';
import { buildAlignment, station } from '../src/core/horizontal';
import { computeSections, sideSection } from '../src/core/sections';
import { syntheticTerrain } from '../src/core/terrain';
import { buildProfile, elevations } from '../src/core/vertical';

const tpl = { crownWidth: 10, fillSlope: 2, cutSlope: 1.75 };

describe('cross-sections', () => {
  it('flat ground: fill b·h + n·h², cut b·c + n·c²', () => {
    const L = sideSection(2, 5, tpl, () => 0), R = sideSection(2, 5, tpl, () => 0);
    expect(L.fill + R.fill).toBeCloseTo(10 * 2 + 2 * 4, 6);
    expect(L.cut + R.cut).toBe(0);
    expect(L.day).toBeCloseTo(5 + 4, 6);
    const C = sideSection(-3, 5, tpl, () => 0);
    expect(2 * C.cut).toBeCloseTo(10 * 3 + 1.75 * 9, 6);
    expect(C.day).toBeCloseTo(5 + 3 * 1.75, 6);
  });

  it('sidehill: ground sloping across gives mixed cut and fill that balance at the centre', () => {
    // ground rises 0.1 per m to the left; crown at the centreline ground level
    const L = sideSection(0, 5, tpl, (o) => 0.1 * o);
    const R = sideSection(0, 5, tpl, (o) => -0.1 * o);
    expect(L.fill).toBe(0);
    expect(R.cut).toBe(0);
    // symmetric template-vs-plane up to the different slopes: crown triangles equal
    expect(L.cut).toBeGreaterThan(1.25);
    expect(R.fill).toBeGreaterThan(1.25);
  });
});

describe('volumes on synthetic terrain', () => {
  it('road at constant elevation through a ridge: analytic cut volume', () => {
    const H = 20, k = 0.2, x0 = 1000;
    // ridge running north-south; road runs west-east at z = 0 through the ridge
    const ter = syntheticTerrain(400, 100, 5, (x) => Math.max(0, H - k * Math.abs(x - x0)));
    const al = buildAlignment({ x: 500, y: 250 }, { x: 1500, y: 250 }, [], 100, 50);
    const st = station(al, 10);
    const z = new Float64Array(st.n); // grade at 0
    const sec = computeSections(ter, st.n, st.x, st.y, st.tx, st.ty, z, tpl);
    const v = volumes(st.ds, sec.cut, sec.fill);
    const exact = 2 * ((tpl.crownWidth * H * H) / (2 * k) + (tpl.cutSlope * H ** 3) / (3 * k));
    expect(v.fill).toBeLessThan(1);
    expect(Math.abs(v.cut - exact) / exact).toBeLessThan(0.01);
  });

  it('road on a uniformly inclined plane with a parallel grade line 3 m above it: A·L', () => {
    const ter = syntheticTerrain(300, 300, 5, (_x, y) => 400 + 0.04 * y);
    const al = buildAlignment({ x: 750, y: 100 }, { x: 750, y: 1400 }, [], 100, 50);
    const st = station(al, 10);
    const z = Float64Array.from(st.y, (y) => 403 + 0.04 * y);
    const sec = computeSections(ter, st.n, st.x, st.y, st.tx, st.ty, z, tpl);
    const v = volumes(st.ds, sec.cut, sec.fill);
    expect(v.fill).toBeCloseTo((10 * 3 + 2 * 9) * 1300, -1);
    expect(v.cut).toBeCloseTo(0, 6);
  });
});

describe('mass haul', () => {
  it('cut at one end, fill at the other: moment ≈ volume × centroid distance', () => {
    const ds = 10, n = 121; // 1200 m
    const cut = new Float64Array(n), fill = new Float64Array(n);
    for (let i = 0; i <= 10; i++) cut[i] = 100; // first 100 m: 100 m²
    for (let i = 110; i < n; i++) fill[i] = 100; // last 100 m
    const v = volumes(ds, cut, fill);
    const m = massHaul(ds, v.mass, v.cut, v.fill);
    expect(m.surplus).toBeLessThan(1);
    expect(m.deficit).toBeLessThan(1);
    expect(Math.abs(m.reused - v.cut)).toBeLessThan(1);
    expect(m.avgHaul).toBeGreaterThan(1050);
    expect(m.avgHaul).toBeLessThan(1150);
  });

  it('hauls a surplus away rather than pretending it is reused', () => {
    const ds = 10, n = 101;
    const cut = new Float64Array(n).fill(50), fill = new Float64Array(n).fill(20);
    const v = volumes(ds, cut, fill);
    const m = massHaul(ds, v.mass, v.cut, v.fill);
    expect(m.surplus).toBeCloseTo(v.cut - v.fill, 3);
    expect(m.deficit).toBeCloseTo(0, 3);
    expect(m.reused).toBeCloseTo(v.fill, 3);
  });
});

describe('cost roll-up', () => {
  it('earthworks exactly at the norm allowance reproduce the SFDI norm price (+ surcharge, + land)', () => {
    const cat = 'S9.5' as const;
    const c = CATEGORIES[cat];
    const km = 3;
    const cutKm = NORM_EARTHWORK_ALLOWANCE.cutPerKm.I;
    const footprint = km * 1000 * (c.crownWidth + NORM_EARTHWORK_ALLOWANCE.topsoilExtraWidth);
    const r = rollup({
      category: cat, terrainClass: 'hilly', atGradeLength: km * 1000,
      earth: { cut: km * cutKm, fill: km * cutKm * 0.85, unsuitable: km * cutKm * NORM_EARTHWORK_ALLOWANCE.unsuitableShare, haulMoment: 0, reused: km * cutKm * 0.85, surplus: 0, deficit: 0, footprint },
      bridges: [], tunnels: [], bridgeLand: 0, forestArea: 0, buildingsHit: 0,
    });
    expect(r.construction).toBeCloseTo(km * c.normPerKm.hilly, 0);
    expect(r.surcharge).toBeCloseTo(r.construction * PRICES.otherObjectsSurcharge, 3);
    expect(r.total).toBeCloseTo(r.construction + r.surcharge + r.land, 3);
    expect(allowanceValuePerKm(cat)).toBeGreaterThan(0);
  });

  it('long tunnels use the long-tunnel rate, short ones the short rate', () => {
    const base = {
      category: 'S9.5' as const, terrainClass: 'hilly' as const, atGradeLength: 0,
      earth: { cut: 0, fill: 0, unsuitable: 0, haulMoment: 0, reused: 0, surplus: 0, deficit: 0, footprint: 0 },
      bridges: [], bridgeLand: 0, forestArea: 0, buildingsHit: 0,
    };
    expect(rollup({ ...base, tunnels: [400] }).tunnels).toBeCloseTo(0.4 * PRICES.tunnelShortPerKm, 0);
    expect(rollup({ ...base, tunnels: [600] }).tunnels).toBeCloseTo(0.6 * PRICES.tunnelLongPerKm, 0);
  });
});

describe('auto-profile', () => {
  const norms = speedNorms(90);
  const opt = {
    maxGradient: 0.06, minCrest: norms.minCrestRadius, minSag: norms.minSagRadius,
    costPerM: (h: number) => 1e4 * h * h + 100 * Math.abs(h),
  };

  it('follows a gently inclined plane', () => {
    const s = Float64Array.from({ length: 401 }, (_, i) => i * 10);
    const g = Float64Array.from(s, (v) => 300 + 0.03 * v);
    const r = autoProfile(s, g, opt);
    const z = elevations(buildProfile(r.vpis, norms.minCrestRadius, norms.minSagRadius), s);
    let maxDev = 0;
    for (let i = 0; i < s.length; i++) maxDev = Math.max(maxDev, Math.abs(z[i] - g[i]));
    expect(maxDev).toBeLessThan(1.5);
  });

  it('crosses a steep hill within the gradient and vertical-curve limits', () => {
    const s = Float64Array.from({ length: 601 }, (_, i) => i * 10);
    const g = Float64Array.from(s, (v) => 400 + 150 * Math.exp(-(((v - 3000) / 700) ** 2)));
    const r = autoProfile(s, g, opt);
    expect(r.feasible).toBe(true);
    const p = buildProfile(r.vpis, norms.minCrestRadius, norms.minSagRadius);
    expect(ROAD_CHECKS.vertical(p, norms, 0.06)).toEqual([]);
  });
});
