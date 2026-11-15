import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluate } from '../src/core/evaluate';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { syntheticTerrain } from '../src/core/terrain';
import { startDesign, Store } from '../src/state';
import { RoadNet } from '../src/core/roadnet';
import { PART_KEYS } from '../src/core/cost';
import { BuildingIndex, noiseBuyoutCost } from '../src/core/buildings';

const terrain = syntheticTerrain(500, 80, 5, () => 400);
const ctx = { terrain, scenario: D11_SCENARIO, a: { x: 100, y: 200 }, b: { x: 2100, y: 200 } };
afterEach(() => vi.unstubAllGlobals());

describe('wall decisions through the full bill', () => {
  it('groups a street of retained noise failures after geometric/goal checks rather than flooding the HUD', () => {
    const buildings = new BuildingIndex(Array.from({ length: 20 }, (_, k) => [700 + 20 * k, 250, 7]));
    const r = evaluate({ ...ctx, buildings, scenario: { ...D11_SCENARIO, maxTravelMin: 0.1 } },
      { ...startDesign(), wallOverrides: [{ s0: 0, s1: 2000, side: 'L', height: 0 }] });
    expect(r.noise.receivers.filter((p) => p.unresolved)).toHaveLength(20);
    expect(r.boughtOut).toEqual([]);
    const issues = r.violations.filter((v) => v.kind === 'noise');
    expect(issues).toHaveLength(1);
    expect(issues[0].title).toContain('20 houses');
    expect(issues[0].target?.buildings).toHaveLength(20);
    expect(r.violations.findIndex((v) => v.kind === 'time')).toBeLessThan(r.violations.findIndex((v) => v.kind === 'noise'));
  });
  it('builds/prices player walls without a building layer and uses their actual fractional height', () => {
    const d = startDesign();
    d.wallOverrides = [{ s0: 800, s1: 1200, side: 'L', height: 2.5 }];
    const low = evaluate(ctx, d);
    expect(low.walls).toHaveLength(1);
    expect(low.walls[0].height).toBe(2.5);
    d.wallOverrides[0].height = 5;
    const high = evaluate(ctx, d);
    expect(high.quantities.wallLength).toBe(low.quantities.wallLength);
    expect(high.cost.noiseWalls).toBeCloseTo(2 * low.cost.noiseWalls);
    expect(high.quantities.wallArea).toBeCloseTo(2 * low.quantities.wallArea);
  });
  it('does not silently buy out after wall removal; clearing restores Auto and an explicit buyout resolves the failure', () => {
    const buildings = new BuildingIndex([[1100, 250, 7]], [[100, 2, 0, 1100, 250, 5, 5, 0]]);
    const context = { ...ctx, buildings }, d = startDesign(), base = evaluate(context, d);
    expect(base.walls.length).toBeGreaterThan(0);
    expect(base.boughtOut).toEqual([]);
    d.wallOverrides = [{ s0: 0, s1: 2000, side: 'L', height: 0 }];
    const removed = evaluate(context, d);
    expect(removed.boughtOut).toEqual([]);
    expect(removed.walls.filter((w) => w.side === 'L')).toEqual([]);
    expect(removed.violations.some((v) => v.kind === 'noise' && v.target?.wall?.sides.includes('L') && v.target.wall.height >= 3)).toBe(true);
    d.buildingOverrides = [{ j: 0, action: 'buy' }];
    const bought = evaluate(context, d);
    expect(bought.boughtOut[0].reason).toBe('manual');
    expect(bought.violations.some((v) => v.kind === 'noise')).toBe(false);
    d.buildingOverrides = []; d.wallOverrides = [];
    expect(evaluate(context, d).cost).toEqual(base.cost);
  });
});

describe('building decisions through the full bill', () => {
  const buildings = new BuildingIndex([[1100, 200, 7], [1200, 350, 7], [1100, 230, 7]],
    [[100, 2, 0, 1100, 200, 5, 5, 0], [100, 2, 0, 1200, 350, 5, 5, 0], [100, 12, 1, 1100, 230, 5, 5, 0]]);
  const context = { ...ctx, buildings };
  it('keeps footprint collisions invalid and unbilled, buys any off-corridor building once, and restores Auto', () => {
    const d = startDesign(), base = evaluate(context, d);
    expect(base.demolished.some((p) => p.j === 0)).toBe(true);
    d.buildingOverrides = [{ j: 0, action: 'keep' }, { j: 1, action: 'buy' }];
    const r = evaluate(context, d);
    expect(r.kept).toContainEqual({ j: 0, i: 100, hit: true });
    expect(r.demolished.some((p) => p.j === 0)).toBe(false);
    expect(r.boughtOut.some((p) => p.j === 0)).toBe(false);
    expect(r.violations.some((v) => v.kind === 'building')).toBe(true);
    expect(r.boughtOut.find((p) => p.j === 1)?.cost).toBe(noiseBuyoutCost(buildings.cost[1], buildings.area[1]));
    d.buildingOverrides = [{ j: 0, action: 'buy' }];
    const boughtHit = evaluate(context, d);
    expect(boughtHit.demolished.filter((p) => p.j === 0)).toHaveLength(1);
    expect(boughtHit.boughtOut.some((p) => p.j === 0)).toBe(false);
    d.buildingOverrides = [];
    expect(evaluate(context, d).cost).toEqual(base.cost);
  });
  it('turns a kept noise-infeasible apartment into a blocking dB violation instead of acquisition', () => {
    const base = evaluate(context, startDesign());
    expect(base.boughtOut.some((p) => p.j === 2)).toBe(true);
    const r = evaluate(context, { ...startDesign(), buildingOverrides: [{ j: 2, action: 'keep' }] });
    expect(r.boughtOut.some((p) => p.j === 2)).toBe(false);
    expect(r.noise.receivers.find((p) => p.j === 2)?.unresolved?.excess).toBeGreaterThan(0);
    expect(r.violations.some((v) => v.kind === 'noise' && v.title.includes('dB') && !!v.target?.buildings?.includes(2))).toBe(true);
    expect(r.valid).toBe(false);
  });
});

describe('crossing choices through the full bill', () => {
  const roadContext = (cls: string) => ({ ...ctx,
    terrain: syntheticTerrain(1000, 80, 5, () => 400), b: { x: 4100, y: 200 },
    roads: new RoadNet({ cls: [cls], ways: [[0, 2100, 0, 2100, 400]] }),
  });
  it('Auto searches below a requested motorway overbridge rather than repeatedly asking to go above', () => {
    const r = evaluate(roadContext('motorway'), { ...startDesign(), crossingOverrides: [{ roadId: 0, type: 'overbridge' }] });
    expect(r.crossings[0].type).toBe('overbridge');
    expect(r.crossings[0].h).toBeLessThanOrEqual(-6);
    expect(r.violations).toEqual([]);
    expect(r.crossings[0].geometry?.road?.length).toBeGreaterThan(2);
  });
  it('builds and bills a requested bridge, including an unsafe manual one, and clears back to the original result', () => {
    const context = roadContext('primary'), d = startDesign(), before = evaluate(context, d);
    d.crossingOverrides = [{ roadId: 0, type: 'bridge' }];
    const bridged = evaluate(context, d);
    expect(bridged.crossings[0].h).toBeGreaterThanOrEqual(6);
    expect(bridged.kind[bridged.crossings[0].i]).toBe(1);
    expect(bridged.cost.bridges).toBeGreaterThan(0);
    const sum = PART_KEYS.reduce((sum, k) => sum + bridged.parts[k].reduce((a, b) => a + b, 0), 0);
    expect(sum).toBeCloseTo(bridged.cost.total, 3);
    d.profileMode = 'manual'; d.vpis = [{ s: 0, z: 400, r: null }, { s: 4000, z: 400, r: null }];
    const unsafe = evaluate(context, d);
    expect(unsafe.cost.bridges).toBeGreaterThan(0);
    expect(unsafe.violations.some((v) => v.title === 'Our bridge is too low over this road')).toBe(true);
    d.profileMode = 'auto'; d.crossingOverrides = [];
    expect(evaluate(context, d).cost).toEqual(before.cost);
  });
});

describe('saved Auto pins in evaluation', () => {
  it('clears positional object choices after a pack change without discarding station-based edits', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) });
    const store = new Store('pack', startDesign, 'ground', 'old-objects');
    store.update((d) => {
      d.buildingOverrides = [{ j: 2, action: 'keep' }]; d.crossingOverrides = [{ roadId: 3, type: 'junction' }];
      d.gradePins = [{ s: 1000, z: 408 }]; d.wallOverrides = [{ s0: 800, s1: 1200, side: 'L', height: 4 }];
    });
    const same = new Store('pack', startDesign, 'ground', 'old-objects');
    expect(same.design.buildingOverrides).toHaveLength(1);
    const changed = new Store('pack', startDesign, 'ground', 'new-objects');
    expect(changed.objectDataChanged).toBe(true);
    expect(changed.design.buildingOverrides).toEqual([]); expect(changed.design.crossingOverrides).toEqual([]);
    expect(changed.design.gradePins).toEqual(store.design.gradePins); expect(changed.design.wallOverrides).toEqual(store.design.wallOverrides);
  });
  it('uses the smoothed pinned grade for quantities, reports impossible heights, and restores auto on clear', () => {
    const d = startDesign(), base = evaluate(ctx, d);
    d.gradePins = [{ s: 1000, z: 408 }];
    const pinned = evaluate(ctx, d);
    expect(Math.abs(pinned.grade[100] - 408)).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(pinned.quantities.fill).toBeGreaterThan(base.quantities.fill);
    expect(pinned.profileFeasible).toBe(true);
    d.gradePins = [{ s: 10, z: 450 }];
    const bad = evaluate(ctx, d);
    expect(bad.valid).toBe(false);
    expect(bad.violations.some((v) => v.kind === 'profile' && v.title.includes('Pinned height') && /400/.test(v.fix))).toBe(true);
    d.gradePins = [];
    expect(evaluate(ctx, d).cost).toEqual(base.cost);
  });

  it('keeps pins saved but inactive in Manual and restores them across undo, redo and reload', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) });
    const store = new Store('pins', startDesign);
    store.update((d) => { d.gradePins = [{ s: 1000, z: 408 }]; });
    expect(new Store('pins', startDesign).design.gradePins).toEqual(store.design.gradePins);
    store.undo(); expect(store.design.gradePins ?? []).toEqual([]);
    store.redo(); expect(store.design.gradePins).toHaveLength(1);
    store.update((d) => { d.profileMode = 'manual'; d.vpis = [{ s: 0, z: 400, r: null }, { s: 2000, z: 400, r: null }]; });
    const manual = evaluate(ctx, store.design);
    expect(manual.grade[100]).toBe(400);
    expect(manual.violations).toEqual([]);
  });
});
