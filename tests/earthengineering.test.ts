import { describe, expect, it } from 'vitest';
import { evaluate, type Design } from '../src/core/evaluate';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { surchargeRate } from '../src/core/cost';
import { flatSection, sideSection } from '../src/core/sections';
import { LC, syntheticTerrain } from '../src/core/terrain';

const tpl = { crownWidth: 9.5 };
describe('side slopes (research/48)', () => {
  it('fills follow VL 1 (2022) up to 10 m: 1:2.5 up to 3 m, then 1:1.5, or 1:1.75 from 3 to 6 m on higher fills, no benches; higher fills 1:1.8 above 6 m', () => {
    // both slope wedges, without the crown core (research/48 §1.1 table; above 10 m research/52)
    for (const [h, wedges, run] of [[2, 10, 5], [4, 33, 9], [10, 165.75, 18.75], [20, 724.95, 37.95]]) {
      const f = flatSection(h, 9.5);
      expect(f.area - 9.5 * h).toBeCloseTo(wedges, 6);
      expect(f.width).toBeCloseTo(9.5 + 2 * run, 6);
    }
  });

  it('cuts: 1:2 up to 2 m, else 1:1.75 with a 1 m bench every 6 m; sound rock 4:1, benched every 5 m and netted', () => {
    expect(sideSection(-2, 4.75, tpl, () => 0).day).toBeCloseTo(4.75 + 4, 6);
    expect(sideSection(-10, 4.75, tpl, () => 0).day).toBeCloseTo(4.75 + 1.75 * 10 + 1, 6);
    // rock from 3 m down in a 15 m cut: 12 m of 4:1 face with benches at 5 and 10 m, then 3 m of soil slope
    const s = sideSection(-15, 4.75, tpl, () => 0, { classIto: 1, classIIto: 3 });
    expect(s.day).toBeCloseTo(4.75 + 0.25 * 12 + 2 + 1.75 * 3, 6);
    expect(s.rockFace).toBeCloseTo(12 * Math.hypot(1, 0.25), 6);
    expect(sideSection(-15, 4.75, tpl, () => 0).rockFace).toBe(0); // unmapped ground: no rock assumed
  });

  it('a slope stopped short (a wall) reports its own surface there', () => {
    const s = sideSection(10, 4.75, tpl, () => 0, undefined, 4.75 + 9);
    expect(s.zSlope).toBeCloseTo(10 - 4 - 3 / 1.75, 6); // a 10 m fill: 1:1.5 down to 6 m, then 1:1.75
  });

  const design: Design = { category: 'S9.5', speed: 80, pis: [], profileMode: 'manual',
    vpis: [{ s: 0, z: 400, r: null }, { s: 2000, z: 400, r: null }] };
  const valley = (depth: number) => syntheticTerrain(500, 100, 5,
    (x) => 400 - depth * Math.min(1, Math.max(0, Math.min(x - 250, 2250 - x)) / 300));
  const context = (terrain: ReturnType<typeof valley>) => ({ terrain, scenario: D11_SCENARIO,
    a: { x: 250, y: 250 }, b: { x: 2250, y: 250 } });

  it('prices a long stream culvert once per crossing, only on earthworks', () => {
    const terrain = valley(10), ctx = context(terrain);
    const dry = evaluate(ctx, design);
    // Stream occupies three adjacent pixels, crossing the route perpendicularly.
    const row = Math.floor((terrain.height - 250) / terrain.cell);
    for (let c = 249; c <= 251; c++) terrain.lc[row * terrain.nx + c] = LC.stream;
    const wet = evaluate(ctx, design);
    expect(wet.cost.earthDetail.culverts).toBeGreaterThan(100_000);
    expect(wet.parts.culverts.filter((v) => v > 0)).toHaveLength(1);
    expect(wet.cost.total - dry.cost.total).toBeCloseTo(wet.cost.earthDetail.culverts * (1 + surchargeRate(0)), 2);
    const tall = valley(30);
    tall.lc.set(terrain.lc);
    const bridge = evaluate(context(tall), design);
    expect(bridge.quantities.bridgeLength).toBeGreaterThan(500);
    expect(bridge.cost.earthDetail.culverts).toBe(0);
    for (let i = 0; i < bridge.n; i++) if (bridge.kind[i] !== 0) expect(bridge.parts.geotechnical[i]).toBe(0);
  });
});
