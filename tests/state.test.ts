import { expect, it, vi } from 'vitest';
import { startDesign, Store } from '../src/state';

it('keeps the design but resets incomparable best scores when the ground pack changes', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  try {
    const legacy = new Store('test', startDesign);
    legacy.update((d) => { d.speed = 80; });
    legacy.offerBest(100, legacy.design);
    expect(new Store('test', startDesign).best?.cost).toBe(100);
    const mapped = new Store('test', startDesign, 'ground-hash-A');
    expect(mapped.design.speed).toBe(80);
    expect(mapped.best).toBeNull();
    expect(mapped.offerBest(150, mapped.design)).toBe(true);
    expect(new Store('test', startDesign, 'ground-hash-A').best?.cost).toBe(150);
    expect(new Store('test', startDesign, 'ground-hash-B').best).toBeNull();

    // An accepted pre-fingerprint best must be stamped on disk even when no cheaper result replaces
    // it; otherwise Load best could rebind old building/road indices after the next pack rebuild.
    const oldObjects = new Store('objects', startDesign, 'ground');
    oldObjects.update((d) => { d.buildingOverrides = [{ j: 2, action: 'keep' }]; });
    oldObjects.offerBest(100, oldObjects.design);
    const accepted = new Store('objects', startDesign, 'ground', 'object-pack-A');
    expect(accepted.best?.design.objectData).toBe('object-pack-A');
    expect(accepted.offerBest(200, accepted.design)).toBe(false);
    expect(JSON.parse(values.get('objects.best')!).design.objectData).toBe('object-pack-A');
    const rebuilt = new Store('objects', startDesign, 'ground', 'object-pack-B');
    expect(rebuilt.best).toBeNull();
    expect(rebuilt.design.buildingOverrides).toEqual([]);
  } finally {
    vi.unstubAllGlobals();
  }
});
