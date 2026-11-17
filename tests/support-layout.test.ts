import { describe, expect, it } from 'vitest';
import { bridgeLayout, bridgeModel, bridgeRunCost, supportBridgeLayout } from '../src/core/bridge';
import { costParts } from '../src/core/cost';
import { CATEGORIES } from '../src/core/data/categories';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { STRUCTURE_RULES } from '../src/core/data/prices';
import { evaluate, type Design } from '../src/core/evaluate';
import { RoadNet } from '../src/core/roadnet';
import { remedyBridgeSupports, type SupportRoute } from '../src/core/support-layout';
import { KIND } from '../src/core/structures';
import { CONE } from '../src/core/abutment-cone';
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

  it('an end whose cone would cover a road goes on (Auto) or is a wall (the player’s bridge); no pier on a cone', () => {
    const reach = CONE.berm + CONE.slope * 13, r = { ...route(), coneReachAt: () => reach };
    const auto = remedyBridgeSupports(r, terrain(), roadAt(207)), run = auto.runs[0];
    expect(run.s0).toBeLessThan(95);
    expect(run.closedEnds).toBeUndefined();
    expect(run.coneReach).toEqual([reach, reach]);
    for (const p of run.pierStations ?? []) expect(p > run.s0 + reach && p < run.s1 - reach).toBe(true);
    expect(auto.diagnostics).toEqual([]);
    const mask = new Int8Array(r.n).fill(-1);
    mask[12] = KIND.bridge;
    const mine = remedyBridgeSupports(r, terrain(), roadAt(207), mask);
    expect(mine.runs[0].s0).toBe(95);
    expect(mine.runs[0].closedEnds).toEqual([true, false]);
    expect(mine.runs[0].coneReach).toEqual([0, reach]);
    expect(mine.diagnostics).toEqual([]);
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

  it('sets a clear abutment into a shallow cut with priced regrading, not a grade lift', () => {
    const r = route(); (r.grade as Float64Array)[9] = 97;
    const result = remedyBridgeSupports(r, terrain(), roadAt(195));
    expect(result.runs[0]).toMatchObject({ s0: 85, length: 130 });
    expect(result.diagnostics.some(d => d.reason === 'terrain')).toBe(false); // the moved-past road still needs its own clearance
    // 130 m in five 26 m spans: soffit 1.3 m below the deck in a 3 m cut → 4.3 m deep wedge.
    expect(result.runs[0].regradeM3![0]).toBeCloseTo(4.3 / 2 * 9.5 * 10, 6);
  });

  it('stops at a deep cut or tunnel and computes required extension and elevation', () => {
    const r = route(); (r.grade as Float64Array)[9] = 94;
    const result = remedyBridgeSupports(r, terrain(), roadAt(195));
    expect(result.runs).toEqual(r.runs);
    expect(result.diagnostics[0]).toMatchObject({ reason: 'terrain', extensionM: 10, raiseM: 1 });
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
    (r.grade as Float64Array).fill(106.1);
    const wide = remedyBridgeSupports(r, terrain(), roads);
    expect(wide.runs[0].pierStations).toBeUndefined();
    expect(wide.runs[0].layout).toBeUndefined();
    expect(wide.diagnostics.some(d => d.reason === 'span-limit' && d.requiredSpanM === 290)).toBe(true);
    // The rejected 290 m span must not hide the retained ordinary 29 m spans' shortfall.
    expect(wide.diagnostics.find(d => d.reason === 'span-depth')!.raiseM).toBeCloseTo(0.15);
    expect(wide.clearanceRequirements).toContainEqual({ s: 100, z: 106.25 });
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
    // (the portal needs the ground a structure height above the grade: lowered by 9 − 5 m)
    expect(forced.diagnostics[0]).toMatchObject({ structure: 'portal', reason: 'terrain', extensionM: 10, lowerM: STRUCTURE_RULES.portalDepth - 5 });
  });

  it('uses separated-road clearance before adding local span depth, without changing the supplied profile', () => {
    const r = route(); (r.grade as Float64Array).fill(107);
    const before = Float64Array.from(r.grade);
    expect(remedyBridgeSupports(r, terrain(), roadAt(255)).clearanceRequirements).toEqual([]);
    const result = remedyBridgeSupports(r, terrain(), roadAt(255, 'motorway'));
    expect(result.clearanceRequirements.length).toBeGreaterThan(0);
    expect(result.clearanceRequirements.every(c => c.z > 107.5)).toBe(true);
    expect(r.grade).toEqual(before);
    const manual = new Int8Array(r.n).fill(-1); manual[15] = KIND.bridge;
    // The player chose the bridge, not its piers: the pier at km 0.155 still moves off the motorway.
    const fixed = remedyBridgeSupports(r, terrain(), roadAt(255, 'motorway'), manual);
    expect(fixed.runs[0]).toMatchObject({ s0: 95, s1: 215, pierStations: [125, 146, 185] });
    expect(fixed.kind).toEqual(r.kind);
    // its longer 39 m span needs a deeper deck: the clearance is still checked, not hidden
    expect(fixed.clearanceRequirements).toContainEqual({ s: 150, z: 108.25 });
    expect(fixed.diagnostics.find(d => d.reason === 'span-depth')!.raiseM).toBeCloseTo(1.25);
    expect(fixed.violations).toHaveLength(1);
    expect(r.grade).toEqual(before);
  });

  it('validates an explicit manual support arrangement without replacing it with ordinary spans', () => {
    const r = route(), mask = new Int8Array(r.n).fill(-1);
    mask[15] = KIND.bridge;
    (r.grade as Float64Array).fill(106.6);
    r.runs[0].pierStations = [125, 165, 185];
    r.runs[0].layout = supportBridgeLayout(95, 215, r.runs[0].pierStations);
    const result = remedyBridgeSupports(r, terrain(), roadAt(255), mask);
    expect(result.runs).toEqual(r.runs);
    expect(result.kind).toEqual(r.kind);
    expect(result.clearanceRequirements).toContainEqual({ s: 150, z: 106.8 });
    expect(result.diagnostics.find(d => d.reason === 'span-depth')!.raiseM).toBeCloseTo(0.2);
    expect(result.violations).toHaveLength(1);
  });

  it('does not make an under-clearance bridge valid by painting the same structure manually', () => {
    const ctx = { terrain: syntheticTerrain(260, 100, 5, () => 100), scenario: D11_SCENARIO,
      a: { x: 100, y: 250 }, b: { x: 1100, y: 250 },
      roads: new RoadNet({ cls: ['secondary'], ways: [[0, 600, 100, 600, 400]] }) };
    const design: Design = { category: 'S9.5', speed: 80, pis: [], profileMode: 'manual',
      vpis: [{ s: 0, z: 100, r: null }, { s: 400, z: 106.1, r: null },
        { s: 600, z: 106.1, r: null }, { s: 1000, z: 100, r: null }] };
    const automatic = evaluate(ctx, design);
    const painted = evaluate(ctx, { ...design, structureOverrides: [{ s0: 490, s1: 520, kind: KIND.bridge }] });
    expect(automatic.runs).toHaveLength(1);
    expect(automatic.runs[0]).toMatchObject({ s0: 485, s1: 515, length: 30 });
    expect(painted.runs).toEqual(automatic.runs);
    expect(painted.kind).toEqual(automatic.kind);
    expect(painted.grade).toEqual(automatic.grade);
    expect(painted.vpis).toEqual(automatic.vpis);
    for (const result of [automatic, painted]) {
      expect(result.valid).toBe(false);
      expect(result.violations).toContainEqual(expect.objectContaining({ kind: 'structure',
        title: 'A long bridge span is too low over what it crosses', fix: expect.stringContaining('by at least 0.2 m') }));
    }
    const autoProfile = evaluate(ctx, { ...design, profileMode: 'auto',
      structureOverrides: [{ s0: 490, s1: 520, kind: KIND.bridge }] });
    // (each style's price and the cones in front of the abutments follow the lifted grade)
    const bare = (runs: typeof painted.runs) => runs.map(({ styles: _, coneReach: _c, ...run }) => run);
    expect(bare(autoProfile.runs)).toEqual(bare(painted.runs));
    expect(autoProfile.kind).toEqual(painted.kind);
    expect(autoProfile.grade[50]).toBeGreaterThanOrEqual(106.3);
    expect(autoProfile.valid).toBe(true);
  });

  it('prices a provisional >120 m clear span locally instead of retaining blocked intermediate piers', () => {
    const t = new Terrain({ nx: 150, ny: 60, cell: 5, base: 100, scale: 1,
      q: new Uint16Array(9000), lc: new Uint8Array(9000), watercourses: { version: 1, method: 'test', reaches: [
        { id: 1, kind: 'river', width: 130, points: [[285, 50], [285, 150]], catchmentKm2: [10, 10], truncated: [false, false] },
      ] } });
    const r = route(); (r.kind as Uint8Array).fill(KIND.bridge, 10, 28);
    r.runs = [{ kind: KIND.bridge, i0: 10, i1: 27, s0: 95, s1: 275, length: 180 }];
    const result = remedyBridgeSupports(r, t), run = result.runs[0];
    expect(run.layout!.span).toBeGreaterThan(120);
    expect(run.pierStations).toHaveLength(2);
    expect(result.diagnostics).toEqual([]);
    const model = bridgeModel(CATEGORIES['S9.5']), h = Float64Array.from(r.grade, (z, i) => z - r.ground[i]);
    const bill = bridgeRunCost(model, h, r.ds, () => 0, () => 0);
    const price = bill(run.i0, run.i1, run.length, run.layout, run.pierStations);
    expect(Number.isFinite(price)).toBe(true);
    expect(price).toBeGreaterThan(bill(run.i0, run.i1, run.length));
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
    const failure = result.diagnostics.find(d => d.reason === 'span-depth')!;
    expect(failure.raiseM).toBeGreaterThan(0);
    expect(result.clearanceRequirements.length).toBeGreaterThan(0);
    expect(result.clearanceRequirements).toContainEqual({ s: failure.s, z: failure.requiredZ });
    expect(new Set(result.clearanceRequirements.map(c => c.s)).size).toBe(result.clearanceRequirements.length);
    expect(failure.requiredZ! - r.grade[Math.round(failure.s / r.ds)]).toBeCloseTo(failure.raiseM);
    for (const { s, z } of result.clearanceRequirements) {
      const i = Math.round(s / r.ds);
      expect(z).toBeGreaterThan(r.grade[i] + .01);
      (r.grade as Float64Array)[i] = z;
    }
    expect(remedyBridgeSupports(r, t).clearanceRequirements).toEqual([]);
    expect(result.violations[0].fix).toMatch(/Raise.*m/);
  });
});
