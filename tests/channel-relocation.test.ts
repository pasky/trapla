import { describe, expect, it, vi } from 'vitest';
import { evaluate, type Design } from '../src/core/evaluate';
import { Terrain, LC, OOB_BIT, RAIL_CROSSING_BIT, RIVER_CROSSING_BIT } from '../src/core/terrain';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { channelAssembly } from '../src/core/data/remedies';
import { planChannelRelocations, type ChannelRoute } from '../src/core/channel-relocation';

function context(otherWater?: 'tributary' | 'crossing') {
  const nx = 260, ny = 100, q = new Uint16Array(nx * ny);
  for (let row = 0; row < ny; row++) for (let col = 0; col < nx; col++) q[row * nx + col] = Math.round((10 - (col + 0.5) * 5 * 0.001) / 0.001);
  const terrain = new Terrain({ nx, ny, cell: 5, base: 90, scale: 0.001, q, lc: new Uint8Array(q.length),
    watercourses: { version: 1, method: 'synthetic', reaches: [{ id: 1, kind: 'ditch', width: 0.5,
      points: [[0, 260], [1250, 260]], catchmentKm2: [0.1, 0.1], truncated: [false, false] },
      ...(otherWater ? [{ id: 2, kind: 'ditch' as const, width: 0.5,
        points: otherWater === 'tributary' ? [[602.3, 150], [602.3, 260]] : [[602.3, 275], [602.3, 400]],
        catchmentKm2: [0.05, 0.05], truncated: [false, false] }] : [])] } });
  return { terrain, scenario: D11_SCENARIO, a: { x: 100, y: 250 }, b: { x: 1100, y: 250 } };
}
const design: Design = { category: 'S9.5', speed: 80, pis: [], profileMode: 'manual',
  vpis: [{ s: 0, z: 99.9, r: null }, { s: 500, z: 107.4, r: null }, { s: 1000, z: 98.9, r: null }] };

// Fixed earthwork envelope isolates bank checks from the grade/wall optimizer.
function trialChannel(terrain: Terrain) {
  const n = 101, array = (v: number) => new Float64Array(n).fill(v);
  const route: ChannelRoute = { n, ds: 10, s: Float64Array.from({ length: n }, (_, i) => i * 10),
    x: Float64Array.from({ length: n }, (_, i) => 100 + i * 10), y: array(250), tx: array(1), ty: array(0), dayL: array(20), dayR: array(20) };
  return planChannelRelocations(route, terrain, undefined,
    [{ reach: terrain.watercourses!.data.reaches[0], a: 0, b: 1250, i0: 0, i1: 100 }], []);
}

describe('priced automatic channel relocation', () => {
  it('diverts a parallel ditch rather than burying it, forcing a viaduct or billing duplicate culverts', () => {
    const r = evaluate(context(), design), channels = r.footprintConflicts.filter(c => c.action === 'channel-relocation');
    expect(channels).toHaveLength(1);
    const c = channels[0];
    expect(c.cost).toBeGreaterThan(0);
    expect(c.landCost).toBeGreaterThan(0);
    expect(c.length).toBeGreaterThan(c.affectedLength!);
    expect(c.geometry!.road![0].y).toBe(260);
    expect(c.geometry!.road!.at(-1)!.y).toBe(260);
    expect(c.geometry!.road!.some(p => p.y > 280)).toBe(true);
    expect(r.waterCrossings).toEqual([]);
    expect(r.cost.earthDetail.culverts).toBe(0);
    expect(r.violations).toEqual([]);
    expect(Object.values(r.parts).reduce((sum, values) => sum + values.reduce((a, b) => a + b, 0), 0)).toBeCloseTo(r.cost.total, 3);
  });
  it('does not backfill a confluence and strand a tributary ending inside the old channel', () => {
    const r = evaluate(context('tributary'), design); // junction lies BETWEEN the old 5 m samples
    expect(r.waterCrossings.some(c => c.id === 2)).toBe(true);
    expect(r.footprintConflicts.filter(c => c.action === 'channel-relocation')).toEqual([]);
    expect(r.footprintConflicts.some(c => c.feature === 'stream' && c.action === 'retaining-wall')).toBe(true);
  });
  it('does not invent an unpriced confluence where the shifted channel crosses another stream', () => {
    const r = evaluate(context('crossing'), design);
    expect(r.footprintConflicts.filter(c => c.action === 'channel-relocation')).toEqual([]);
    expect(r.footprintConflicts.some(c => c.feature === 'stream' && c.action === 'retaining-wall')).toBe(true);
  });
  it.each([LC.rail, LC.water, LC.road | RAIL_CROSSING_BIT, LC.road | RIVER_CROSSING_BIT, OOB_BIT])(
    'rejects a bank overlapping protected/no-data pixel %i while its centreline stays clear', cover => {
      const ctx = context();
      // Pixel x600..605/y280..285: the proposed axis near (602.497, 285.648)
      // misses it, but its 2.9 m excavation bank enters it. Keep the priced wall instead.
      ctx.terrain.lc[43 * ctx.terrain.nx + 120] = cover;
      const r = evaluate(ctx, design);
      expect(r.footprintConflicts.filter(c => c.action === 'channel-relocation')).toEqual([]);
      expect(r.footprintConflicts.some(c => c.feature === 'stream' && c.action === 'retaining-wall')).toBe(true);
    });
  it('checks the wider upstream bank throughout a descending-cut chord', () => {
    const ctx = context(), reach = ctx.terrain.watercourses!.data.reaches[0];
    const makeTerrain = (crossing: boolean) => new Terrain({ nx: 260, ny: 100, cell: 5, base: 100, scale: 1,
      q: new Uint16Array(26000), lc: new Uint8Array(26000), watercourses: { version: 1, method: 'synthetic', reaches: [reach,
        ...(crossing ? [{ ...reach, id: 2, points: [[603, 291], [603, 320]] }] : [])] } });
    const raiseBank = (t: Terrain) => vi.spyOn(t, 'heightAt').mockImplementation((x, y) => 100 + (y > 280 && Math.abs(x - 600) < 1 ? 4 : 0));
    const clear = makeTerrain(false); raiseBank(clear);
    expect(trialChannel(clear)).toHaveLength(1); // extra cut itself is feasible
    const crossed = makeTerrain(true);
    expect(trialChannel(crossed)).toHaveLength(1); // the ordinary shallow bank misses the water
    raiseBank(crossed);
    // x600 has the high bank; x605 is low. Water at x603 only intersects the
    // outgoing chord's excavation, so testing that chord's downstream width misses it.
    expect(trialChannel(crossed)).toEqual([]);
  });
  it('rejects an excavation bank leaving the map while the entire channel axis remains inside', () => {
    const source = context().terrain.watercourses!.data;
    const t = new Terrain({ nx: 260, ny: 57, cell: 5, base: 100, scale: 1,
      q: new Uint16Array(260 * 57), lc: new Uint8Array(260 * 57), watercourses: source });
    // The forced axis is y283.7 < 285; its 1.45 m half-bank crosses the north edge.
    expect(trialChannel(t)).toEqual([]);
    const taller = new Terrain({ nx: 260, ny: 60, cell: 5, base: 100, scale: 1,
      q: new Uint16Array(260 * 60), lc: new Uint8Array(260 * 60), watercourses: source });
    expect(trialChannel(taller)).toHaveLength(1);
  });
  it('uses trapezoidal bank quantities and includes extra hillside excavation rather than a flat per-m tariff', () => {
    const a = channelAssembly(2, 4.76), hillside = channelAssembly(2, 4.76, [1, 0, 0], 2);
    expect(a.depth).toBeCloseTo(1);
    expect(a.excavation).toBeCloseTo((a.bottom + a.topWidth) / 2 * a.depth);
    expect(hillside.excavation).toBeCloseTo((hillside.bottom + hillside.topWidth) / 2 * (hillside.depth + 2));
    expect(hillside.perM).toBeGreaterThan(a.perM);
  });
});
