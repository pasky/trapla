import { afterEach, expect, it, vi } from 'vitest';
import { evaluate } from '../src/core/evaluate';
import { D11_SCENARIO } from '../src/core/data/scenario';
import type { WorkerIn } from '../src/worker';

vi.mock('../src/core/evaluate', () => ({ evaluate: vi.fn(() => ({ cost: { total: 0 } })) }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('coalesces each queued edit burst to its latest design, without dropping the next burst', async () => {
  vi.useFakeTimers();
  const scope = { postMessage: vi.fn(), onmessage: (_ev: MessageEvent<WorkerIn>) => {} };
  vi.stubGlobal('self', scope);
  await import('../src/worker');
  const send = (data: WorkerIn) => scope.onmessage({ data } as MessageEvent<WorkerIn>);
  send({ type: 'init', nx: 2, ny: 2, cell: 5, base: 0, scale: 1, q: new Uint16Array(4), lc: new Uint8Array(4),
    a: { x: 0, y: 0 }, b: { x: 5, y: 5 }, buildings: [], scenario: D11_SCENARIO });
  const design = { category: 'S9.5' as const, speed: 90, pis: [], profileMode: 'auto' as const, vpis: [] };
  for (let id = 1; id <= 20; id++) send({ type: 'eval', id, design: { ...design, speed: id } });
  expect(evaluate).not.toHaveBeenCalled();
  await vi.runAllTimersAsync();
  expect(evaluate).toHaveBeenCalledTimes(1);
  expect(vi.mocked(evaluate).mock.calls[0][1].speed).toBe(20);
  expect(scope.postMessage).toHaveBeenLastCalledWith({ type: 'result', id: 20, result: { cost: { total: 0 } } });
  send({ type: 'eval', id: 21, design });
  send({ type: 'eval', id: 22, design });
  await vi.runAllTimersAsync();
  expect(evaluate).toHaveBeenCalledTimes(2);
  expect(scope.postMessage).toHaveBeenLastCalledWith({ type: 'result', id: 22, result: { cost: { total: 0 } } });
});
