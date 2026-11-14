import { describe, expect, it } from 'vitest';
import { autoProfile } from '../src/core/autoprofile';
import { ROAD_CHECKS } from '../src/core/checks';
import { allowanceValuePerKm, costParts, PART_KEYS, sumParts } from '../src/core/cost';
import { CATEGORIES } from '../src/core/data/categories';
import { speedNorms } from '../src/core/data/norms';
import { EXCAVATION_MIX, NORM_EARTHWORK_ALLOWANCE, PRICES } from '../src/core/data/prices';
import { URBAN_RATES } from '../src/core/data/urban';
import { massHaul, volumes } from '../src/core/earthworks';
import { buildAlignment, station } from '../src/core/horizontal';
import { computeSections, flatCutBands, sideSection } from '../src/core/sections';
import { KIND } from '../src/core/structures';
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
  /** n stations of uniform at-grade road with the given section areas */
  const uniform = (n: number, ds: number, cut: number, fill: number, width: number) => ({
    category: 'S9.5' as const, terrainClass: 'hilly' as const, n, ds, kind: new Uint8Array(n),
    cutI: new Float64Array(n).fill(cut * EXCAVATION_MIX.I), cutII: new Float64Array(n).fill(cut * EXCAVATION_MIX.II),
    cutIII: new Float64Array(n).fill(cut * EXCAVATION_MIX.III), fill: new Float64Array(n).fill(fill),
    usable: 1 - NORM_EARTHWORK_ALLOWANCE.unsuitableShare, width: new Float64Array(n).fill(width), runs: [],
    haul: { moment: 0, reused: 0, surplus: 0, deficit: 0 },
  });

  it('earthworks exactly at the norm allowance reproduce the SFDI norm price (+ surcharge, + land)', () => {
    const c = CATEGORIES['S9.5'];
    const km = 3, n = 301, ds = 10;
    const cut = NORM_EARTHWORK_ALLOWANCE.cutPerKm.I / 1000; // m² of cut = m³ per m
    const inp = uniform(n, ds, cut, cut * NORM_EARTHWORK_ALLOWANCE.fillShareOfCut, c.crownWidth + NORM_EARTHWORK_ALLOWANCE.topsoilExtraWidth);
    const r = sumParts(costParts(inp));
    expect(r.construction).toBeCloseTo(km * c.normPerKm.hilly, 0);
    expect(r.surcharge).toBeCloseTo(r.construction * PRICES.otherObjectsSurcharge, 3);
    expect(r.total).toBeCloseTo(r.construction + r.surcharge + r.land, 3);
    expect(allowanceValuePerKm('S9.5')).toBeGreaterThan(0);
  });

  it('long tunnels use the long-tunnel rate, short ones the short rate; built-up ones the urban rows', () => {
    const tunnel = (len: number, urban = 0) => {
      const n = len / 10 + 21, i0 = 10, i1 = i0 + len / 10 - 1;
      const inp = uniform(n, 10, 0, 0, 0);
      inp.kind.fill(KIND.tunnel, i0, i1 + 1);
      return sumParts(costParts({
        ...inp, urban: new Float64Array(n).fill(urban),
        runs: [{ kind: KIND.tunnel, i0, i1, s0: (i0 - 0.5) * 10, s1: (i1 + 0.5) * 10, length: len }],
      }));
    };
    expect(tunnel(400).tunnels).toBeCloseTo(0.4 * PRICES.tunnelShortPerKm, 0);
    expect(tunnel(600).tunnels).toBeCloseTo(0.6 * PRICES.tunnelLongPerKm, 0);
    expect(tunnel(600, 1).tunnels).toBeCloseTo(0.6 * URBAN_RATES.tunnelLongPerKm, 0);
  });

  it('global mass-balance items are spread over the cells that cause them and add up exactly', () => {
    const n = 101, ds = 10;
    const inp = uniform(n, ds, 0, 0, 20);
    // cut in the first third, fill in the last third, a bridge in the middle
    for (let i = 0; i < 33; i++) inp.cutI[i] = 60;
    for (let i = 67; i < n; i++) inp.fill[i] = 80;
    inp.kind.fill(KIND.bridge, 45, 55);
    const haul = { moment: 4e7, reused: 15_000, surplus: 1_000, deficit: 12_000 };
    const parts = costParts({ ...inp, haul, runs: [{ kind: KIND.bridge, i0: 45, i1: 54, s0: 445, s1: 545, length: 100 }] });
    const t = sumParts(parts);
    expect(t.earthDetail.borrow).toBeCloseTo(haul.deficit * PRICES.borrowFill, 3);
    // bought fill (OTSKP 17180) includes its placing: only the rest of the fill pays 17110
    const fill = parts.fillPlacing.reduce((a, _, i) => a + inp.fill[i] * (i === n - 1 ? ds / 2 : ds), 0);
    expect(t.earthDetail.fillPlacing).toBeCloseTo((fill - haul.deficit) * PRICES.fillPlacing, 3);
    expect(t.earthDetail.surplusHaul).toBeCloseTo(haul.surplus * PRICES.surplusHaulKm * PRICES.haulPerM3Km, 3);
    expect(t.earthDetail.haul).toBeCloseTo(((haul.moment - haul.reused * PRICES.freeHaul) / 1000) * PRICES.haulPerM3Km, 3);
    // bought fill is billed only where there is fill, surplus haul only where there is cut
    expect(parts.borrow.slice(0, 67).reduce((a, v) => a + v, 0)).toBe(0);
    expect(parts.surplusHaul.slice(33).reduce((a, v) => a + v, 0)).toBe(0);
    // ranges add up to the whole, and the whole to the sum of all components
    const a = sumParts(parts, 0, 49), b = sumParts(parts, 50, n - 1);
    expect(a.total + b.total).toBeCloseTo(t.total, 3);
    let all = 0;
    for (const k of PART_KEYS) for (const v of parts[k]) all += v;
    expect(all).toBeCloseTo(t.total, 3);
  });
});

describe('excavation depth classes', () => {
  it('a section in a flat-ground cut splits into depth bands that add up to the cut', () => {
    for (const c of [2, 5, 12]) {
      const s = sideSection(-c, 5, tpl, () => 0);
      const [a1, a2, a3] = flatCutBands(c, 10, tpl.cutSlope);
      expect(2 * s.cutI).toBeCloseTo(a1, 6);
      expect(2 * s.cutII).toBeCloseTo(a2, 6);
      expect(2 * (s.cut - s.cutI - s.cutII)).toBeCloseTo(a3, 6);
      expect(a1 + a2 + a3).toBeCloseTo(10 * c + tpl.cutSlope * c * c, 6);
    }
    // 12 m deep: 3 m of class I over the whole top width minus the slope wedges, class III only below 8 m
    const [a1, , a3] = flatCutBands(12, 10, 1.75);
    expect(a1).toBeCloseTo(10 * 3 + 2 * 1.75 * 3 * (12 - 1.5), 6);
    expect(a3).toBeCloseTo(10 * 4 + 1.75 * 16, 6);
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
