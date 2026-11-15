import { afterEach, expect, it, vi } from 'vitest';
import { evaluateProject, previewProjectRoute } from '../src/core/project-evaluate';
import type { ProjectResult, ProjectSnapshot, RouteResult } from '../src/core/project';
import { D11_SCENARIO } from '../src/core/data/scenario';
import type { WorkerIn } from '../src/worker';

vi.mock('../src/core/project-evaluate', () => ({ evaluateProject: vi.fn(), previewProjectRoute: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const snapshot = (revision: number) => ({ epoch: 'load', revision } as ProjectSnapshot);
const route = (revision: number) => ({ routeId: 'route', revision, engineeringRevision: `geometry:${revision}` } as RouteResult);

it('coalesces project requests, echoes preview gesture identity, and resets delta baselines after skipped publication', async () => {
  vi.resetModules(); vi.useFakeTimers();
  const scope = { postMessage: vi.fn(), onmessage: (_ev: MessageEvent<WorkerIn>) => {} }; vi.stubGlobal('self', scope);
  await import('../src/worker');
  vi.mocked(evaluateProject).mockImplementation((_ctx, s) => ({ epoch: s.epoch, revision: s.revision,
    routes: { route: route(s.revision) } } as unknown as ProjectResult));
  vi.mocked(previewProjectRoute).mockImplementation((_ctx, s) => route(s.revision));
  const send = (data: WorkerIn) => scope.onmessage({ data } as MessageEvent<WorkerIn>);
  const init: Extract<WorkerIn, { type: 'init' }> = { type: 'init', nx: 2, ny: 2, cell: 5, base: 0, scale: 1,
    q: new Uint16Array(4), lc: new Uint8Array(4), a: { x: 0, y: 0 }, b: { x: 5, y: 5 }, buildings: [], scenario: D11_SCENARIO,
    projectEnvironment: { objectData: 'objects', transportData: null, terrainData: 'terrain', pricingData: 'price', waterData: 'water', terrainClass: 'hilly' } };
  send(init);
  for (let id = 1; id <= 12; id++) send({ type: 'project-eval', id, snapshot: snapshot(id), displayedResult: null });
  await vi.runAllTimersAsync();
  expect(evaluateProject).toHaveBeenCalledTimes(1);
  expect(scope.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'project-result', id: 12,
    baseIdentity: null, changedRouteIds: ['route'], result: expect.objectContaining({ epoch: 'load', revision: 12 }) }));
  send({ type: 'project-eval', id: 13, snapshot: snapshot(13), displayedResult: { epoch: 'load', revision: 12 } });
  await vi.runAllTimersAsync();
  expect(scope.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ baseIdentity: { epoch: 'load', revision: 12 } }));
  // The UI rejected revision 13: comparing only to the worker's last evaluation would miss changes.
  send({ type: 'project-eval', id: 14, snapshot: snapshot(14), displayedResult: { epoch: 'load', revision: 12 } });
  await vi.runAllTimersAsync();
  expect(scope.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ baseIdentity: null, changedRouteIds: ['route'] }));
  send({ type: 'project-preview', id: 15, snapshot: snapshot(15), routeId: 'route', gesture: { id: 'drag', sequence: 2 } });
  send({ type: 'project-preview', id: 16, snapshot: snapshot(16), routeId: 'route', gesture: { id: 'drag', sequence: 3 } });
  await vi.runAllTimersAsync();
  expect(previewProjectRoute).toHaveBeenCalledTimes(1);
  expect(scope.postMessage).toHaveBeenLastCalledWith({ type: 'project-preview', id: 16, identity: { epoch: 'load', revision: 16 },
    routeId: 'route', routeRevision: 16, result: route(16), gesture: { id: 'drag', sequence: 3 } });
  send({ type: 'project-eval', id: 17, snapshot: snapshot(17), displayedResult: null });
  send(init); // An old queued job must not run against a newly loaded terrain/context.
  await vi.runAllTimersAsync();
  expect(evaluateProject).toHaveBeenCalledTimes(3);
  send({ ...init, projectEnvironment: undefined });
  send({ type: 'project-eval', id: 18, snapshot: snapshot(18), displayedResult: null });
  await vi.runAllTimersAsync();
  expect(scope.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'project-error', id: 18,
    identity: { epoch: 'load', revision: 18 }, message: expect.stringContaining('environment missing') }));
});
