import { expect, it, vi } from 'vitest';
import { StorageGuard } from '../src/ui/storage-guard';

it('propagates storage failures while opening, then keeps work in memory and reports once', () => {
  const failing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); } };
  vi.stubGlobal('localStorage', failing);
  try {
    const guard = new StorageGuard(), seen: string[] = [];
    guard.onProblem = () => seen.push(guard.problem!);
    expect(() => guard.setItem('k', 'v')).toThrow('quota');
    guard.strict = false;
    expect(guard.getItem('k')).toBeNull();
    guard.setItem('k', 'v'); guard.setItem('k', 'w');
    expect(seen).toEqual(['Error: quota']);
  } finally { vi.unstubAllGlobals(); }
});
