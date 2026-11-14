import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluate } from '../src/core/evaluate';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { syntheticTerrain } from '../src/core/terrain';
import { startDesign, Store } from '../src/state';

const terrain = syntheticTerrain(500, 80, 5, () => 400);
const ctx = { terrain, scenario: D11_SCENARIO, a: { x: 100, y: 200 }, b: { x: 2100, y: 200 } };
afterEach(() => vi.unstubAllGlobals());

describe('saved Auto pins in evaluation', () => {
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
