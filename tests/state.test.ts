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
  } finally {
    vi.unstubAllGlobals();
  }
});
