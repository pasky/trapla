// Tunnels as Czech ones are built (M2, research/49 portals, /51 methods): mined where the cover allows, cut
// and cover out to the portals, where the ground is a structure height above the grade; the player's
// method; escape provision; the grade search's tunnel mode.
import { describe, expect, it } from 'vitest';
import { autoProfile, PROFILE_KIND } from '../src/core/autoprofile';
import { costParts, cutCoverPitPerM, sumParts, tunnelLengthFactor, tunnelPerKm, tunnelTubeFactor } from '../src/core/cost';
import { CATEGORIES } from '../src/core/data/categories';
import { PRICES, STRUCTURE_RULES, TUNNEL_RULES } from '../src/core/data/prices';
import { cutMethodMask, normalizeOverrides, overrideMask, paintOverride } from '../src/core/overrides';
import { chooseStructures, cutCoverMask, KIND } from '../src/core/structures';
import { elevations, buildProfile } from '../src/core/vertical';

/** a hill across the route: depth (ground − grade) rising linearly to `peak` in the middle */
const hill = (n: number, peak: number) => Float64Array.from({ length: n }, (_, i) => -Math.max(0, peak * (1 - Math.abs(i - (n - 1) / 2) / ((n - 1) / 2)) - 0));
/** earthworks dearer than a tunnel only deep down */
const earthOf = (h: Float64Array, perDepth: number) => Float64Array.from(h, v => 1000 + perDepth * Math.max(0, -v) ** 2);

describe('a tunnel goes on as cut and cover out to its portals', () => {
  it('ends where the ground is a structure height above the grade, cut and cover where too thin to mine and at each portal', () => {
    const n = 81, ds = 10, h = hill(n, 60);
    const input = { ds, h, earthPerM: earthOf(h, 100), bridgePerM: 1e9, tunnelPerM: 100_000, cutCoverPerM: 107_500 };
    const { runs, kind } = chooseStructures(input);
    expect(runs).toHaveLength(1);
    const r = runs[0];
    // per station a tunnel only where deeper than ≈ 31 m; the run goes on to the 9 m points
    expect(-h[r.i0]).toBeGreaterThanOrEqual(STRUCTURE_RULES.portalDepth);
    expect(-h[r.i0 - 1]).toBeLessThan(STRUCTURE_RULES.portalDepth);
    expect(-h[r.i1]).toBeGreaterThanOrEqual(STRUCTURE_RULES.portalDepth);
    expect(-h[r.i1 + 1]).toBeLessThan(STRUCTURE_RULES.portalDepth);
    const cc = cutCoverMask(kind, runs, h, ds);
    for (let i = r.i0; i <= r.i1; i++) {
      const portal = i - r.i0 < 2 || r.i1 - i < 2; // ≥ 12 m per portal: two 10 m stations
      expect(cc[i]).toBe(portal || -h[i] < STRUCTURE_RULES.tunnelMinDepth ? 1 : 0);
    }
  });

  it('a tunnel not worth its ends is an open cut (a gentle hill)', () => {
    const n = 161, ds = 10, h = hill(n, 40);
    // per station the tunnel wins only at the very top; with its long, shallow ends it does not
    const earth = earthOf(h, 60);
    const tunnel = 95_000;
    expect(Math.max(...earth)).toBeGreaterThan(tunnel);
    expect(chooseStructures({ ds, h, earthPerM: earth, bridgePerM: 1e9, tunnelPerM: tunnel }).runs).toEqual([]);
  });

  it('a stream above a grade a structure height below its bed keeps a tunnel, which goes on to its portals', () => {
    const n = 81, ds = 10, h = hill(n, 30), forcedTunnel = new Uint8Array(n);
    forcedTunnel[40] = 1;
    const { runs } = chooseStructures({ ds, h, earthPerM: new Float64Array(n).fill(1), bridgePerM: 1e9, tunnelPerM: 1e6, forcedTunnel });
    expect(runs).toHaveLength(1);
    expect(runs[0].forced).toBe(true);
    expect(-h[runs[0].i0 - 1]).toBeLessThan(STRUCTURE_RULES.portalDepth);
    expect(-h[runs[0].i1 + 1]).toBeLessThan(STRUCTURE_RULES.portalDepth);
  });
});

describe('tunnel prices', () => {
  const tunnelBill = (h: Float64Array, cutCover: Uint8Array, tubes = 1) => {
    const n = h.length, zero = new Float64Array(n), kind = new Uint8Array(n).fill(KIND.tunnel);
    kind[0] = kind[n - 1] = KIND.earth;
    return costParts({ category: 'S9.5', terrainClass: 'hilly', n, ds: 10, kind, h, width: zero, cutI: zero, cutII: zero, cutIII: zero, fill: zero,
      usable: 0.85, haul: { moment: 0, reused: 0, surplus: 0, deficit: 0 }, cutCover,
      runs: [{ kind: KIND.tunnel, i0: 1, i1: n - 2, s0: 5, s1: (n - 1.5) * 10, length: (n - 2) * 10, tubes }] });
  };
  it('cut and cover at the SPK A.3.H rows, its pit beyond 5 m of cover as earthworks', () => {
    const n = 22, h = new Float64Array(n).fill(-12), cc = new Uint8Array(n).fill(1);
    const parts = tunnelBill(h, cc);
    expect(sumParts(parts).tunnels).toBeCloseTo(0.2 * PRICES.cutCoverShortPerKm, 0);
    expect(sumParts(parts).earthworks).toBe(0); // 3 m of cover: in the row
    const deep = tunnelBill(new Float64Array(n).fill(-16), cc);
    expect(sumParts(deep).earthworks).toBeCloseTo(20 * 10 * cutCoverPitPerM(16, CATEGORIES['S9.5'].crownWidth), 0);
    expect(cutCoverPitPerM(16, 9.5)).toBeGreaterThan(0);
    expect(cutCoverPitPerM(TUNNEL_RULES.structureHeight + TUNNEL_RULES.cutCoverPricedCover, 9.5)).toBe(0);
    expect(sumParts(tunnelBill(h, new Uint8Array(n))).tunnels).toBeCloseTo(0.2 * PRICES.tunnelShortPerKm, 0);
  });

  it('one two-lane tube over 500 m: an escape tunnel above 2,000 vehicles a day per lane, two tubes above 10,000', () => {
    const road = CATEGORIES['S9.5'];
    expect(tunnelTubeFactor(road, 500, 9000)).toBe(1);
    expect(tunnelTubeFactor(road, 600, 3000)).toBe(1);
    expect(tunnelTubeFactor(road, 600, 9000)).toBe(TUNNEL_RULES.escapeGalleryFactor);
    expect(tunnelTubeFactor(road, 600, 25_000)).toBe(2);
    expect(tunnelTubeFactor(CATEGORIES['D27.5'], 2000, 30_000)).toBe(1); // two tubes already
    expect(tunnelTubeFactor(CATEGORIES['R1'], 2000, 30_000)).toBe(1); // railway: its own price book
    const n = 62, h = new Float64Array(n).fill(-30);
    expect(sumParts(tunnelBill(h, new Uint8Array(n), 1.3)).tunnels).toBeCloseTo(1.3 * 0.6 * PRICES.tunnelLongPerKm * tunnelLengthFactor(600), 0);
  });

  it("a long mined tube is cheaper per metre (Hessen's curve), cut and cover and short tubes are not", () => {
    expect(tunnelLengthFactor(500)).toBe(1);
    expect(tunnelLengthFactor(1000)).toBeCloseTo(0.957, 3);
    expect(tunnelLengthFactor(2000)).toBeCloseTo(0.935, 3);
    expect(tunnelLengthFactor(10_000)).toBe(TUNNEL_RULES.lengthFactor.min);
    expect(tunnelPerKm(2000)).toBeCloseTo(PRICES.tunnelLongPerKm * tunnelLengthFactor(2000), 0);
    expect(tunnelPerKm(2000, 0, true)).toBe(PRICES.cutCoverLongPerKm);
    expect(tunnelPerKm(400)).toBe(PRICES.tunnelShortPerKm);
    // the structure choice weighs the bill's rows for the run's length, not the ≤ 500 m row it seeds with: a 600 m
    // mined tube is 2.7 % dearer than that row, so an earthwork 1 % dearer than it stays an earthwork
    const n = 62, h = new Float64Array(n).fill(-40), runs = (rate?: (L: number, cut: boolean) => number) => chooseStructures({ ds: 10, h,
      earthPerM: new Float64Array(n).fill(1010), bridgePerM: 1e12, tunnelPerM: 1000, tunnelRate: rate }).runs.length;
    expect(tunnelPerKm(600) / tunnelPerKm(0)).toBeGreaterThan(1.02);
    expect(runs()).toBe(1);
    expect(runs((L, cut) => tunnelPerKm(L, 0, cut) / tunnelPerKm(0, 0, cut))).toBe(0);
  });
});

describe("the player's tunnel method", () => {
  it('is kept by painting, merging and loading, and marks its stations', () => {
    let o = paintOverride([], 100, 300, KIND.tunnel, 'cut');
    o = paintOverride(o, 300, 400, KIND.tunnel);
    expect(o).toEqual([{ s0: 100, s1: 300, kind: 2, method: 'cut' }, { s0: 300, s1: 400, kind: 2 }]);
    expect(paintOverride(o, 300, 400, KIND.tunnel, 'cut')).toEqual([{ s0: 100, s1: 400, kind: 2, method: 'cut' }]);
    expect(paintOverride([], 0, 100, KIND.bridge, 'cut')).toEqual([{ s0: 0, s1: 100, kind: 1 }]);
    expect(normalizeOverrides(JSON.parse(JSON.stringify(o)))).toEqual(o);
    const s = Float64Array.from({ length: 50 }, (_, i) => i * 10);
    expect(Array.from(cutMethodMask(s, o).slice(9, 32))).toEqual([0, ...Array(20).fill(1), 0, 0]);
  });

  it("chosen for Auto's tunnel (or a style for Auto's bridge), it leaves the stretch Auto's", () => {
    const o = paintOverride([], 100, 300, KIND.tunnel, 'cut', true);
    expect(o).toEqual([{ s0: 100, s1: 300, kind: 2, method: 'cut', auto: true }]);
    const s = Float64Array.from({ length: 50 }, (_, i) => i * 10);
    expect(Array.from(overrideMask(s, o)).every(k => k === -1)).toBe(true);
    expect(cutMethodMask(s, o)[15]).toBe(1);
    expect(normalizeOverrides(JSON.parse(JSON.stringify(o)))).toEqual(o);
    // Mined again: back to Auto, nothing painted
    expect(paintOverride(o, 100, 300, KIND.tunnel, undefined, true)).toEqual([]);
    expect(paintOverride([], 100, 300, KIND.bridge, 'arch', true)).toEqual([{ s0: 100, s1: 300, kind: 1, style: 'arch', auto: true }]);
    // where the player painted the bridge, it stays theirs (with the style); the rest of Auto's bridge only gets the style
    expect(paintOverride([{ s0: 150, s1: 200, kind: KIND.bridge }], 100, 300, KIND.bridge, 'long', true)).toEqual([
      { s0: 100, s1: 150, kind: 1, style: 'long', auto: true }, { s0: 150, s1: 200, kind: 1, style: 'long' }, { s0: 200, s1: 300, kind: 1, style: 'long', auto: true }]);
    expect(paintOverride([{ s0: 150, s1: 200, kind: KIND.tunnel, method: 'cut' }], 100, 300, KIND.tunnel, undefined, true)).toEqual([{ s0: 150, s1: 200, kind: 2 }]);
    // too deep to dig from above, Auto's tunnel as the player's
    const n = 41, h = new Float64Array(n).fill(-25), ranges = paintOverride([], 95, 305, KIND.tunnel, 'cut', true);
    const r = chooseStructures({ ds: 10, h, earthPerM: new Float64Array(n).fill(1e6), bridgePerM: 1e9, tunnelPerM: 100, cutMethod: cutMethodMask(s.subarray(0, n), ranges) });
    expect(r.runs).toHaveLength(1);
    expect(r.violations.map(v => v.title)).toEqual(['Too deep to dig from above']);
  });

  it('cut and cover where chosen, and too deep to dig from above beyond 13 m of cover', () => {
    const n = 41, ds = 10, h = new Float64Array(n).fill(-25);
    const s = Float64Array.from({ length: n }, (_, i) => i * ds);
    const ranges = [{ s0: 95, s1: 305, kind: KIND.tunnel as 2, method: 'cut' as const }];
    const input = { ds, h, earthPerM: new Float64Array(n).fill(1), bridgePerM: 1e9, tunnelPerM: 100, overrides: overrideMask(s, ranges), cutMethod: cutMethodMask(s, ranges) };
    const r = chooseStructures(input);
    expect(Array.from(cutCoverMask(r.kind, r.runs, h, ds, input.cutMethod).slice(10, 31)).every(Boolean)).toBe(true);
    expect(r.violations.map(v => v.title)).toEqual(['Too deep to dig from above']);
    const shallow = chooseStructures({ ...input, h: new Float64Array(n).fill(-20) });
    expect(shallow.violations).toEqual([]);
    // part of a tunnel: cut and cover there, mined (but for its portal blocks) on
    const part = [{ s0: 95, s1: 205, kind: KIND.tunnel as 2, method: 'cut' as const }, { s0: 205, s1: 305, kind: KIND.tunnel as 2 }];
    const mixed = chooseStructures({ ...input, h: shallow.kind.map(() => -20) as unknown as Float64Array, overrides: overrideMask(s, part), cutMethod: cutMethodMask(s, part) });
    expect(Array.from(cutCoverMask(mixed.kind, mixed.runs, new Float64Array(n).fill(-20), ds, cutMethodMask(s, part)).slice(10, 31)))
      .toEqual([...Array(11).fill(1), ...Array(8).fill(0), 1, 1]);
  });

  it("a long tunnel's escape provision multiplies its tubes, not its pit", () => {
    // cut and cover throughout: tubes 100 a metre, two of them, its pit 50: 250 a metre against an earthwork's 275
    const n = 81, ds = 10, h = new Float64Array(n).fill(-30);
    const runs = (extra: number) => chooseStructures({ ds, h, earthPerM: new Float64Array(n).fill(275), bridgePerM: 1e9, tunnelPerM: 100,
      cutCoverPerM: 100, cutCoverExtraPerM: new Float64Array(n).fill(extra), tunnelFactor: () => 2, cutMethod: new Uint8Array(n).fill(1) }).runs;
    expect(runs(50)).toHaveLength(1);
    expect(runs(80)).toEqual([]); // 280 a metre
  });

  it('a tunnel the player chose may start in a deep cut, but not deeper than any Czech portal', () => {
    const n = 81, ds = 10, h = hill(n, 80), s = Float64Array.from({ length: n }, (_, i) => i * ds);
    const paint = (s0: number, s1: number) => chooseStructures({ ds, h, earthPerM: new Float64Array(n).fill(1), bridgePerM: 1e9, tunnelPerM: 100,
      overrides: overrideMask(s, [{ s0, s1, kind: KIND.tunnel }]) }).violations.map(v => v.title + ' ' + v.fix);
    expect(paint(145, 655)).toEqual([]); // its ends 30 m deep
    const deep = paint(255, 545); // 52 m
    expect(deep).toEqual(['km 0.05', 'km 0.75'].map(km => `A tunnel entrance stands in a very deep cut Extend the tunnel to ${km}, where the ground is 9 m above the road, or set it back to Automatic`));
  });
});

describe("the grade search's tunnel mode", () => {
  // a ridge 1.4 km wide, 150 m high: earthworks by depth², a tunnel per metre; with a tunnel mode the search never
  // ends a tunnel in a deep cut, so it prices its line as the portal rule builds it
  const n = 321, ds = 10, s = Float64Array.from({ length: n }, (_, i) => i * ds);
  const g = Float64Array.from(s, x => 300 + 150 * Math.max(0, 1 - Math.abs(x - 1600) / 700));
  const earth = (h: number) => 2000 + (h < 0 ? 120 * h * h : 400 * h * h);
  const tunnel = 150_000;
  const cost = (h: number, kind = -1): number => {
    if (kind === KIND.tunnel) return tunnel;
    if (kind === PROFILE_KIND.inTunnel) return -h >= STRUCTURE_RULES.portalDepth ? tunnel * (-h >= STRUCTURE_RULES.tunnelMinDepth ? 1 : 1.075) : earth(h);
    if (kind === PROFILE_KIND.open) return earth(h);
    return -h >= STRUCTURE_RULES.tunnelMinDepth ? Math.min(earth(h), tunnel) : earth(h);
  };
  /** the line's price as built: each stretch deeper than a portal all tunnel (cut and cover where shallow) or all open */
  const built = (vpis: Parameters<typeof buildProfile>[0]) => {
    const z = elevations(buildProfile(vpis, 6000, 4000), s);
    let total = 0;
    for (let i = 0; i < n;) {
      const deep = g[i] - z[i] >= STRUCTURE_RULES.portalDepth;
      let j = i, open = 0, inside = 0;
      while (j < n && (g[j] - z[j] >= STRUCTURE_RULES.portalDepth) === deep) {
        open += earth(z[j] - g[j]) * ds; inside += cost(z[j] - g[j], PROFILE_KIND.inTunnel) * ds; j++;
      }
      total += deep ? Math.min(open, inside) : open;
      i = j;
    }
    return total;
  };
  it('prices a line as it will be built, where the station-by-station search misjudges it', () => {
    const opt = { maxGradient: 0.06, minCrest: 6000, minSag: 4000, costPerM: cost, pad: 120 };
    const plain = autoProfile(s, g, opt), mode = autoProfile(s, g, { ...opt, portalDepth: STRUCTURE_RULES.portalDepth });
    expect(plain.feasible && mode.feasible).toBe(true);
    // (the search's objective also has 1 M per grade change)
    const penalties = (v: { length: number }) => 1e6 * (v.length - 2);
    expect(Math.abs(mode.cost - built(mode.vpis) - penalties(mode.vpis)) / built(mode.vpis)).toBeLessThan(0.03);
    expect(plain.cost).toBeLessThan(0.9 * built(plain.vpis)); // a tunnel between deep cuts it thought it could build
    expect(built(mode.vpis)).toBeLessThan(1.01 * built(plain.vpis));
  });
});
