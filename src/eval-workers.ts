// The two evaluation workers of a session. Full evaluations and drag previews run in separate workers, so
// that a preview never waits behind a full evaluation (hundreds of ms on long routes). The full worker hands
// each full result to the preview worker directly (MessageChannel): the base its windowed previews re-solve
// locally. Messages: worker-protocol.ts.
import type { ScenarioParams } from './core/data/scenario';
import type { ProjectEnvironment } from './core/project';
import { endpointJunctions, type Pack } from './scenario';
import type { WorkerInit } from './worker-protocol';

export function startEvalWorkers(pack: Pack, scenario: ScenarioParams, a: { x: number; y: number }, b: { x: number; y: number },
  projectEnvironment: ProjectEnvironment): { worker: Worker; previewWorker: Worker } {
  const { meta } = pack;
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const previewWorker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const bases = new MessageChannel();
  const init: WorkerInit = {
    type: 'init', nx: meta.nx, ny: meta.ny, cell: meta.cell, base: meta.heights.base, scale: meta.heights.scale,
    q: pack.q.slice(), lc: pack.lc.slice(), ground: pack.terrain.ground, watercourses: pack.terrain.watercourses?.data, protectedAreas: pack.terrain.protectedData, railTunnels: pack.terrain.railTunnels?.data, a, b, buildings: pack.overlays.buildings,
    binfo: pack.overlays.binfo, net: pack.roadNet, scenario, junctions: endpointJunctions(meta, scenario),
    projectEnvironment,
  };
  const previewInit: WorkerInit = { ...init, q: pack.q.slice(), lc: pack.lc.slice(), role: 'preview', port: bases.port2 };
  worker.postMessage({ ...init, role: 'full', port: bases.port1 }, [init.q.buffer, init.lc.buffer, bases.port1]);
  previewWorker.postMessage(previewInit, [previewInit.q.buffer, previewInit.lc.buffer, bases.port2]);
  return { worker, previewWorker };
}
