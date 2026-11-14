import { afterEach, describe, expect, it, vi } from 'vitest';
import { autoProfile } from '../src/core/autoprofile';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { STRUCTURE_RULES } from '../src/core/data/prices';
import { evaluate } from '../src/core/evaluate';
import { normalizeOverrides, overrideMask, paintOverride } from '../src/core/overrides';
import { chooseStructures } from '../src/core/structures';
import { RIVER_CROSSING_BIT, syntheticTerrain } from '../src/core/terrain';
import { buildProfile, elevations } from '../src/core/vertical';
import { startDesign, Store } from '../src/state';

afterEach(() => vi.unstubAllGlobals());

describe('manual structure ranges', () => {
  it('repaints, splits, merges and partially erases ranges without mutating history', () => {
    const a = [{ s0: 100, s1: 500, kind: 1 as const }];
    const b = paintOverride(a, 200, 300, 2);
    expect(b).toEqual([{ s0: 100, s1: 200, kind: 1 }, { s0: 200, s1: 300, kind: 2 }, { s0: 300, s1: 500, kind: 1 }]);
    expect(paintOverride(b, 200, 300, 1)).toEqual(a);
    expect(paintOverride(a, 150, 450, null)).toEqual([{ s0: 100, s1: 150, kind: 1 }, { s0: 450, s1: 500, kind: 1 }]);
    expect(a).toEqual([{ s0: 100, s1: 500, kind: 1 }]);
    expect(normalizeOverrides([null, { s0: NaN, s1: 50, kind: 1 }, ...a])).toEqual(a);
    expect(normalizeOverrides(undefined)).toEqual([]);
  });

  it('maps chainage, not array indices, with unambiguous adjacent boundaries', () => {
    const ranges = [{ s0: 10, s1: 30, kind: 0 as const }, { s0: 30, s1: 50, kind: 2 as const }];
    expect([...overrideMask([0, 10, 20, 30, 40, 50], ranges)]).toEqual([-1, 0, 0, 2, 2, 2]);
    expect([...overrideMask([0, 20, 40, 60], ranges)]).toEqual([-1, 0, 2, -1]);
  });

  it('persists, undoes, redoes and removes manual paint; older saves remain automatic', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) });
    const old = startDesign(); delete old.structureOverrides;
    data.set('test.design', JSON.stringify(old));
    const store = new Store('test', startDesign);
    expect(store.design.structureOverrides).toEqual([]);
    store.update((d) => { d.structureOverrides = paintOverride([], 100, 300, 1); });
    expect(new Store('test', startDesign).design.structureOverrides).toEqual(store.design.structureOverrides);
    store.undo(); expect(store.design.structureOverrides).toEqual([]);
    store.redo(); expect(store.design.structureOverrides).toHaveLength(1);
    store.update((d) => { d.structureOverrides = paintOverride(d.structureOverrides!, 100, 300, null); });
    expect(store.design.structureOverrides).toEqual([]);
    store.undo(); expect(store.design.structureOverrides).toHaveLength(1);
  });
});

describe('manual structure decisions', () => {
  const input = (height: number) => ({ ds: 10, h: new Float64Array(101).fill(height), earthPerM: new Float64Array(101).fill(1), bridgePerM: 1e6, tunnelPerM: 1e6 });
  const s = Float64Array.from({ length: 101 }, (_, i) => i * 10);

  it('retains uneconomic bridge/tunnel choices and suppresses economical structures for earthwork', () => {
    for (const kind of [1, 2] as const) {
      const r = chooseStructures({ ...input(kind === 1 ? 20 : -30), overrides: overrideMask(s, [{ s0: 300, s1: 600, kind }]) });
      expect(r.kind[40]).toBe(kind);
      expect(r.runs).toHaveLength(1);
      expect(r.violations).toEqual([]);
    }
    const r = chooseStructures({ ...input(20), earthPerM: new Float64Array(101).fill(1e9), overrides: overrideMask(s, [{ s0: 300, s1: 600, kind: 0 }]) });
    expect(r.kind[40]).toBe(0);
    expect(r.kind[20]).toBe(1);
  });

  it('reconsiders unrequested short automatic remnants after earthwork splits a run', () => {
    const earthPerM = new Float64Array(101).fill(1); earthPerM.fill(1e9, 20, 41);
    const r = chooseStructures({ ...input(20), earthPerM, overrides: overrideMask(s, [{ s0: 220, s1: 410, kind: 0 }]) });
    expect(r.kind[20]).toBe(0);
    expect(r.runs).toEqual([]);
    expect(r.violations).toEqual([]);
  });

  it('keeps too-short and buried/exposed manual structures and flags them', () => {
    for (const kind of [1, 2] as const) {
      const r = chooseStructures({ ...input(0), overrides: overrideMask(s, [{ s0: 300, s1: 310, kind }]) });
      expect(r.kind[30]).toBe(kind);
      expect(r.violations.some((v) => v.msg.includes('minimum'))).toBe(true);
      expect(r.violations.some((v) => v.msg.includes('ground'))).toBe(true);
    }
  });

  it('does not silently reinstate a bridge over manual earthwork at a forced crossing', () => {
    const forced = new Uint8Array(101); forced[40] = 1;
    const r = chooseStructures({ ...input(10), forced, overrides: overrideMask(s, [{ s0: 300, s1: 600, kind: 0 }]) });
    expect(r.kind[40]).toBe(0);
    expect(r.violations.some((v) => v.msg.includes('crossing requires a bridge'))).toBe(true);
  });

  it('evaluation exposes crossing conflicts and bills the requested earthwork', () => {
    const terrain = syntheticTerrain(500, 80, 5, (x) => x > 800 && x < 1400 ? 380 : 400);
    for (let row = 0; row < terrain.ny; row++) terrain.lc[row * terrain.nx + 220] = RIVER_CROSSING_BIT;
    const d = { ...startDesign(), profileMode: 'manual' as const,
      vpis: [{ s: 0, z: 400, r: null }, { s: 2000, z: 400, r: null }],
      structureOverrides: [{ s0: 900, s1: 1100, kind: 0 as const }] };
    const r = evaluate({ terrain, scenario: D11_SCENARIO, a: { x: 100, y: 200 }, b: { x: 2100, y: 200 } }, d);
    expect(r.kind[Math.round(1000 / r.ds)]).toBe(0);
    expect(r.valid).toBe(false);
    expect(r.violations.some((v) => v.kind === 'structure' && v.msg.includes('crossing'))).toBe(true);
    expect(r.cost.earthworks).toBeGreaterThan(0);
  });
});

describe('override-aware automatic grade line', () => {
  it('samples isolated cost-class stations and selects the matching kind/class LUT', () => {
    const s = Float64Array.from({ length: 201 }, (_, i) => i * 10), g = new Float64Array(201);
    const costClass = new Uint8Array(201); costClass[102] = 1; // skipped by the ordinary stride
    for (const kind of [-1, 0, 1, 2]) {
      const structureKind = new Int8Array(201).fill(-1); structureKind[102] = kind;
      const r = autoProfile(s, g, {
        maxGradient: 0.06, minCrest: 6000, minSag: 3400, costClass, costClassCount: 2, structureKind, vpiPenalty: 0,
        costPerM: (_h, k = -1, c = 0) => c === 1 ? [17, 7, 11, 13][k + 1] : 0,
      });
      expect(r.cost).toBeCloseTo([17, 7, 11, 13][kind + 1] * 10);
    }
  });

  it('optimises bridge/tunnel ranges with their own costs and height/cover bounds', () => {
    const s = Float64Array.from({ length: 201 }, (_, i) => i * 10), g = new Float64Array(201);
    const opt = { maxGradient: 0.06, minCrest: 6000, minSag: 3400,
      costPerM: (h: number, kind = -1) => kind >= 1 ? 100 : 1e4 * h * h };
    for (const kind of [1, 2] as const) {
      const mask = overrideMask(s, [{ s0: 800, s1: 1200, kind }]);
      const minH = Float64Array.from(mask, (k) => k === 1 ? STRUCTURE_RULES.bridgeMinHeight : NaN);
      const maxH = Float64Array.from(mask, (k) => k === 2 ? -STRUCTURE_RULES.tunnelMinDepth : NaN);
      const r = autoProfile(s, g, { ...opt, structureKind: mask, minH, maxH });
      const z = elevations(buildProfile(r.vpis, opt.minCrest, opt.minSag), s);
      expect(r.feasible).toBe(true);
      for (let i = 80; i < 120; i++) {
        if (kind === 1) expect(z[i]).toBeGreaterThanOrEqual(STRUCTURE_RULES.bridgeMinHeight);
        else expect(z[i]).toBeLessThanOrEqual(-STRUCTURE_RULES.tunnelMinDepth);
      }
    }
  });
});
