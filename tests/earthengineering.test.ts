import { describe, expect, it } from 'vitest';
import { evaluate, type Design } from '../src/core/evaluate';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { flatEarthGeometry } from '../src/core/earthengineering';
import { sideSection } from '../src/core/sections';
import { LC, syntheticTerrain } from '../src/core/terrain';

const tpl = { crownWidth: 9.5, fillSlope: 2, cutSlope: 1.75 };
describe('high-earthwork engineering', () => {
  it('sampled stepped slopes match flat prisms through and between bench levels', () => {
    for (const h of [5.9, 6, 6.1, 11.9, 12, 12.1, 19.7, 30]) for (const fill of [true, false]) {
      const sign = fill ? 1 : -1;
      const s = sideSection(sign * h, tpl.crownWidth / 2, tpl, () => 0);
      const flat = flatEarthGeometry(h, tpl.crownWidth, fill ? tpl.fillSlope : tpl.cutSlope, fill);
      expect(2 * (fill ? s.fill : s.cut)).toBeCloseTo(flat.area, 6);
      expect(2 * s.day).toBeCloseTo(flat.width, 6);
      expect(s.open).toBe(false);
    }
  });

  const design: Design = { category: 'S9.5', speed: 80, pis: [], profileMode: 'manual',
    vpis: [{ s: 0, z: 400, r: null }, { s: 2000, z: 400, r: null }] };
  const valley = (depth: number) => syntheticTerrain(500, 100, 5,
    (x) => 400 - depth * Math.min(1, Math.max(0, Math.min(x - 250, 2250 - x)) / 300));
  const context = (terrain: ReturnType<typeof valley>) => ({ terrain, scenario: D11_SCENARIO,
    a: { x: 250, y: 250 }, b: { x: 2250, y: 250 } });

  it('prices a long stream culvert once per crossing, only on earthworks, and exposes the engineering reserve', () => {
    const terrain = valley(10), ctx = context(terrain);
    const dry = evaluate(ctx, design);
    // Stream occupies three adjacent pixels, crossing the route perpendicularly.
    const row = Math.floor((terrain.height - 250) / terrain.cell);
    for (let c = 249; c <= 251; c++) terrain.lc[row * terrain.nx + c] = LC.stream;
    const wet = evaluate(ctx, design);
    expect(wet.cost.earthDetail.culverts).toBeGreaterThan(100_000);
    expect(wet.parts.culverts.filter((v) => v > 0)).toHaveLength(1);
    expect(wet.cost.earthDetail.geotechnical).toBeGreaterThan(0);
    expect(wet.cost.total - dry.cost.total).toBeCloseTo(wet.cost.earthDetail.culverts * 1.306, 2);
    const tall = valley(30);
    tall.lc.set(terrain.lc);
    const bridge = evaluate(context(tall), design);
    expect(bridge.quantities.bridgeLength).toBeGreaterThan(500);
    expect(bridge.cost.earthDetail.culverts).toBe(0);
    for (let i = 0; i < bridge.n; i++) if (bridge.kind[i] !== 0) expect(bridge.parts.geotechnical[i]).toBe(0);
  });
});
