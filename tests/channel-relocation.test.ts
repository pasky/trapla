import { describe, expect, it } from 'vitest';
import { evaluate, type Design } from '../src/core/evaluate';
import { Terrain } from '../src/core/terrain';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { channelAssembly } from '../src/core/data/remedies';

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
  it('uses trapezoidal bank quantities and includes extra hillside excavation rather than a flat per-m tariff', () => {
    const a = channelAssembly(2, 4.76), hillside = channelAssembly(2, 4.76, [1, 0, 0], 2);
    expect(a.depth).toBeCloseTo(1);
    expect(a.excavation).toBeCloseTo((a.bottom + a.topWidth) / 2 * a.depth);
    expect(hillside.excavation).toBeCloseTo((hillside.bottom + hillside.topWidth) / 2 * (hillside.depth + 2));
    expect(hillside.perM).toBeGreaterThan(a.perM);
  });
});
