import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EvalClient, FULL_AFTER_IDLE_MS, type EvalHost } from '../src/eval-client';
import type { ProjectSnapshot } from '../src/core/project';
import type { ProjectWorkerIn } from '../src/core/project-protocol';
import type { WorkerOut } from '../src/worker-protocol';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function setup() {
  let revision = 1;
  const snapshot = () => ({ epoch: 'e', revision, design: { routes: [{ id: 'r', revision }] } }) as unknown as ProjectSnapshot;
  const port = () => ({ sent: [] as ProjectWorkerIn[], onmessage: null as ((ev: MessageEvent<WorkerOut>) => void) | null,
    postMessage(m: ProjectWorkerIn) { this.sent.push(m); } });
  const full = port(), preview = port(), seen: string[] = [];
  const host: EvalHost = {
    snapshot, design: () => null, activeRouteId: () => 'r', previewPrices: () => ({ materialValue: 50 }), displayed: () => null,
    willPost: () => {}, didPost: () => {},
    preview: m => seen.push(`preview ${m.id}`), full: m => seen.push(`full ${m.id}`), error: () => seen.push('error'), band: m => seen.push(`band ${m.id}`),
  };
  const client = new EvalClient(full, preview, host);
  const reply = (m: WorkerOut) => full.onmessage!({ data: m } as MessageEvent<WorkerOut>);
  const fullReply = (id: number, rev = revision) => reply({ type: 'project-result', id, result: { epoch: 'e', revision: rev } as never,
    baseIdentity: null, changedRouteIds: [], removedRouteIds: [], dependentRouteIds: [] });
  const previewReply = (id: number, rev = revision) => { const sent = preview.sent.find(m => m.id === id) as Extract<ProjectWorkerIn, { type: 'project-preview' }>;
    reply({ type: 'project-preview', id, identity: { epoch: 'e', revision: rev }, routeId: 'r', routeRevision: rev,
      result: { routeId: 'r', revision: rev } as never, gesture: sent.gesture }); };
  return { client, full, preview, seen, fullReply, previewReply, edit: () => { revision++; } };
}

it('previews go to the preview worker in one gesture; the full evaluation follows once the drag pauses, and is not repeated on release', () => {
  const t = setup();
  t.edit(); t.client.request(true);
  t.edit(); t.client.request(true);
  expect(t.preview.sent.map(m => m.type === 'project-preview' && m.gesture?.sequence)).toEqual([1, 2]);
  expect(new Set(t.preview.sent.map(m => m.type === 'project-preview' && m.gesture?.id)).size).toBe(1);
  expect(t.full.sent).toHaveLength(0);
  expect(t.client.settled).toBe(false);
  vi.advanceTimersByTime(FULL_AFTER_IDLE_MS);
  expect(t.full.sent.map(m => m.type)).toEqual(['project-eval']);
  t.client.request(false); // the drag ends on the same design: the full request is already out
  expect(t.full.sent).toHaveLength(1);
  t.fullReply(3);
  expect(t.seen).toEqual(['full 3']);
  expect(t.client.settled).toBe(true);
  t.client.forgetLastPost(); t.client.request(false); // …unless it could not be shown
  expect(t.full.sent).toHaveLength(2);
});

it('drops replies the project has moved on from and replies older than one already shown', () => {
  const t = setup();
  t.client.request(false);
  t.edit(); t.client.request(false);
  t.fullReply(1, 1); // for the design before the edit
  expect(t.seen).toEqual([]);
  t.fullReply(2);
  expect(t.seen).toEqual(['full 2']);
  // a drag: older previews of the gesture are shown while it runs, in rising order only
  t.edit(); t.client.request(true); t.edit(); t.client.request(true); t.edit(); t.client.request(true);
  t.previewReply(4, 4); t.previewReply(3, 3);
  expect(t.seen).toEqual(['full 2', 'preview 4']);
  // once the gesture has ended, only a preview of exactly the current design counts
  t.edit(); t.client.request(true); t.edit(); t.client.request(true);
  t.client.endGesture();
  t.previewReply(6, 6);
  expect(t.seen).toEqual(['full 2', 'preview 4']);
  t.previewReply(7);
  expect(t.seen).toEqual(['full 2', 'preview 4', 'preview 7']);
});

it('only the newest noise-band request is answered', () => {
  const t = setup();
  t.client.requestBand({ epoch: 'e', revision: 1 }, 'r', 9.5); t.client.requestBand({ epoch: 'e', revision: 1 }, 'r', 9.5);
  for (const id of [1, 2]) t.full.onmessage!({ data: { type: 'noise-band', id, identity: { epoch: 'e', revision: 1 }, routeId: 'r', footprint: null } } as MessageEvent<WorkerOut>);
  expect(t.seen).toEqual(['band 2']);
});
