import { describe, expect, it } from 'vitest';
import { bridgeLayout, bridgeModel, bridgeRunCost } from '../src/core/bridge';
import { costParts } from '../src/core/cost';
import { CATEGORIES } from '../src/core/data/categories';
import { RoadNet } from '../src/core/roadnet';
import { remedyBridgeSupports, type SupportRoute } from '../src/core/support-layout';
import { KIND } from '../src/core/structures';
import { LC, RAIL_CROSSING_BIT, syntheticTerrain, Terrain } from '../src/core/terrain';

function route(n = 41): SupportRoute {
  const array = (v: number) => new Float64Array(n).fill(v);
  const kind = new Uint8Array(n); kind.fill(KIND.bridge, 10, 22);
  return { n, ds: 10, s: Float64Array.from({ length: n }, (_, i) => i * 10),
    x: Float64Array.from({ length: n }, (_, i) => 100 + i * 10), y: array(100), tx: array(1), ty: array(0),
    grade: array(115), ground: array(100), crownWidth: 9.5, kind,
    runs: [{ kind: KIND.bridge, i0: 10, i1: 21, s0: 95, s1: 215, length: 120 }] };
}
const terrain = () => syntheticTerrain(150, 60, 5, () => 100);
const roadAt = (x: number, cls = 'service') => new RoadNet({ cls: [cls], ways: [[0, x, 50, x, 150]] });

describe('automatic bridge support remedies', () => {
  it('extends an obstructed abutment by paid whole cells without mutating the selected input', () => {
    const r = route(), result = remedyBridgeSupports(r, terrain(), roadAt(195));
    expect(result.runs[0].s0).toBe(85);
    expect(result.runs[0].length).toBe(130);
    expect(result.kind[9]).toBe(KIND.bridge);
    expect(r.kind[9]).toBe(KIND.earth);
    expect(r.runs[0].s0).toBe(95);
    expect(result.diagnostics).toEqual([]);
    expect(result.violations).toEqual([]);
  });

  it('preserves manual runs and earth paint, with a measured clear-endpoint proposal', () => {
    const r = route(), mask = new Int8Array(r.n).fill(-1);
    mask[12] = KIND.bridge;
    const manual = remedyBridgeSupports(r, terrain(), roadAt(195), mask);
    expect(manual.runs).toEqual(r.runs);
    expect(manual.kind).toEqual(r.kind);
    expect(manual.diagnostics[0]).toMatchObject({ reason: 'manual', extensionM: 10, targetS: 85 });
    mask.fill(-1); mask[9] = KIND.earth;
    expect(remedyBridgeSupports(r, terrain(), roadAt(195), mask).runs).toEqual(r.runs);
  });

  it('does not erase a neighbouring manual run’s endpoint when filling the last intervening earth cell', () => {
    for (const structure of [KIND.bridge, KIND.tunnel]) {
      const r = route(61), mask = new Int8Array(r.n).fill(-1);
      const i1 = structure === KIND.tunnel ? 29 : 21;
      (r.kind as Uint8Array).fill(KIND.earth); (r.kind as Uint8Array).fill(structure, 10, i1 + 1);
      (r.kind as Uint8Array).fill(structure, i1 + 2, i1 + 20);
      r.runs = [{ kind: structure, i0: 10, i1, s0: 95, s1: (i1 + .5) * 10, length: (i1 - 9) * 10 },
        { kind: structure, i0: i1 + 2, i1: i1 + 19, s0: (i1 + 1.5) * 10, s1: (i1 + 19.5) * 10, length: 180 }];
      mask[i1 + 3] = structure;
      if (structure === KIND.tunnel) { (r.grade as Float64Array).fill(80); r.runs[0].forced = true; }
      const result = remedyBridgeSupports(r, terrain(), roadAt(100 + r.runs[0].s1), mask);
      expect(result.runs).toEqual(r.runs);
      expect(result.kind).toEqual(r.kind);
      expect(result.diagnostics.some(d => d.reason === 'manual')).toBe(true);
    }
  });

  it('checks depth only under the actual local span, not a longer span elsewhere on the bridge', () => {
    const r = route(); (r.grade as Float64Array).fill(106.4, 10, 14);
    const roads = new RoadNet({ cls: ['service'], ways: [[0, 210, 50, 210, 150], [0, 285, 50, 285, 150]] });
    const result = remedyBridgeSupports(r, terrain(), roads);
    expect(result.runs[0].layout!.span).toBe(34);
    expect(result.violations).toEqual([]);
  });

  it('stops at low terrain or tunnel and computes required extension and elevation', () => {
    const r = route(); (r.grade as Float64Array)[9] = 102;
    const result = remedyBridgeSupports(r, terrain(), roadAt(195));
    expect(result.runs).toEqual(r.runs);
    expect(result.diagnostics[0]).toMatchObject({ reason: 'terrain', extensionM: 10, raiseM: 2 });
    (r.kind as Uint8Array)[9] = KIND.tunnel;
    expect(remedyBridgeSupports(r, terrain(), roadAt(195)).diagnostics[0].reason).toBe('tunnel');
  });

  it('moves a road-obstructed pier, retains real supports and bills the exact selected span allowance', () => {
    const r = route(), result = remedyBridgeSupports(r, terrain(), roadAt(255));
    const run = result.runs[0];
    expect(run.pierStations).toHaveLength(3);
    expect(run.pierStations).not.toContain(155);
    expect(run.layout!.span).toBeGreaterThan(bridgeLayout(run.length).span);
    const n = r.n, zero = new Float64Array(n), h = new Float64Array(n).fill(15), model = bridgeModel(CATEGORIES['S9.5']);
    const parts = costParts({ category: 'S9.5', terrainClass: 'hilly', n, ds: r.ds, kind: result.kind, h,
      width: new Float64Array(n).fill(r.crownWidth), runs: result.runs, cutI: zero, cutII: zero, cutIII: zero,
      fill: zero, usable: .85, haul: { moment: 0, reused: 0, surplus: 0, deficit: 0 } });
    let billed = 0;
    for (let i = run.i0; i <= run.i1; i++) {
      billed += parts.bridges[i];
      const supports = [run.s0, ...run.pierStations!, run.s1];
      let variable = 0;
      for (let k = 0; k + 1 < supports.length; k++) {
        const overlap = Math.max(0, Math.min((i + .5) * r.ds, supports[k + 1]) - Math.max((i - .5) * r.ds, supports[k]));
        variable += overlap * model.perM(h[i], { span: supports[k + 1] - supports[k], pierDensity: run.layout!.pierDensity });
      }
      expect(parts.bridges[i]).toBeCloseTo(variable + (i === run.i0 || i === run.i1 ? model.abutments / 2 : 0), 5);
    }
    expect(billed).toBeCloseTo(bridgeRunCost(model, h, r.ds, () => 0, () => 0)(run.i0, run.i1, run.length, run.layout, run.pierStations), 5);
    expect(billed).toBeLessThan(model.total(run.length, 15, run.layout)); // no whole-viaduct longest-span penalty
  });

  it('clears independently flagged rail and water pixels, not just vector roads', () => {
    for (const feature of [LC.road | RAIL_CROSSING_BIT, LC.water]) {
      const t = terrain();
      for (let row = 37; row <= 42; row++) t.lc[row * t.nx + 51] = feature;
      const result = remedyBridgeSupports(route(), t);
      expect(result.runs[0].pierStations).toBeDefined();
      expect(result.runs[0].pierStations).not.toContain(155);
    }
  });

  it('bounds extension work and retains colliding supports instead of inventing an unlimited clear span', () => {
    const r = route(101), roads = new RoadNet({ cls: ['service'], ways: [[0, 0, 100, 1200, 100]] });
    const limited = remedyBridgeSupports(r, terrain(), roads);
    expect(limited.diagnostics.some(d => d.reason === 'limit' && d.extensionM === 300)).toBe(true);
    expect(limited.kind).toEqual(r.kind);
    (r.kind as Uint8Array).fill(KIND.bridge, 10, 39);
    r.runs = [{ kind: KIND.bridge, i0: 10, i1: 38, s0: 95, s1: 385, length: 290 }];
    const wide = remedyBridgeSupports(r, terrain(), roads);
    expect(wide.runs[0].pierStations).toBeUndefined();
    expect(wide.runs[0].layout).toBeUndefined();
    expect(wide.diagnostics.some(d => d.reason === 'span-limit' && d.requiredSpanM === 290)).toBe(true);
  });

  it('moves automatic portals only with sufficient cover or a still-viable non-forced tunnel', () => {
    const r = route(); (r.kind as Uint8Array).fill(KIND.earth); (r.kind as Uint8Array).fill(KIND.tunnel, 10, 30);
    (r.grade as Float64Array).fill(80);
    r.runs = [{ kind: KIND.tunnel, i0: 10, i1: 29, s0: 95, s1: 295, length: 200 }];
    expect(remedyBridgeSupports(r, terrain(), roadAt(195)).runs[0].s0).toBe(85);
    (r.grade as Float64Array)[9] = 95;
    const shortened = remedyBridgeSupports(r, terrain(), roadAt(195));
    expect(shortened.runs[0].s0).toBe(105);
    expect(shortened.kind[10]).toBe(KIND.earth);
    expect(shortened.runs[0].length).toBe(190);
    r.runs[0].forced = true;
    const forced = remedyBridgeSupports(r, terrain(), roadAt(195));
    expect(forced.runs).toEqual(r.runs);
    expect(forced.diagnostics[0]).toMatchObject({ structure: 'portal', reason: 'terrain', extensionM: 10, lowerM: 9 });
  });

  it('spans a broad watercourse with explicit fewer piers and reports insufficient long-span clearance', () => {
    const t = new Terrain({ nx: 150, ny: 60, cell: 5, base: 100, scale: 1,
      q: new Uint16Array(9000), lc: new Uint8Array(9000), watercourses: { version: 1, method: 'test', reaches: [
        { id: 1, kind: 'river', width: 50, points: [[255, 50], [255, 150]], catchmentKm2: [10, 10], truncated: [false, false] },
      ] } });
    const r = route(); (r.grade as Float64Array).fill(103);
    const result = remedyBridgeSupports(r, t), run = result.runs[0];
    expect(run.pierStations!.length).toBeLessThan(3);
    expect(run.layout!.pierDensity).toBe(run.pierStations!.length / run.length);
    expect(run.layout!.span).toBeGreaterThan(50);
    expect(result.diagnostics.some(d => d.reason === 'span-depth' && d.raiseM > 0)).toBe(true);
    expect(result.violations[0].fix).toMatch(/Raise.*m/);
  });
});
