// Recompute worker: holds its own copy of the terrain, evaluates only the latest request.
// `project-preview` requests (while a drag is in progress) run the fast approximate evaluation of the
// dragged route. Messages: worker-protocol.ts.

import { BuildingIndex } from './core/buildings';
import type { EvalContext, Result } from './core/evaluate';
import { adoptFull, previewBase } from './core/preview-window';
import { RoadNet } from './core/roadnet';
import { Terrain } from './core/terrain';
import type { ProjectEnvironment, ProjectResult } from './core/project';
import { evaluateProject, previewProjectRoute } from './core/project-evaluate';
import type { NoiseBandOut } from './core/project-protocol';
import { noiseBand } from './core/noise';
import type { WorkerIn, WorkerOut } from './worker-protocol';
export type { WorkerIn, WorkerOut } from './worker-protocol';

/** the one place a reply leaves the worker (typed: worker-protocol.ts) */
const post = (message: WorkerOut, transfer?: Transferable[]) => {
  const scope = self as unknown as Worker;
  if (transfer) scope.postMessage(message, transfer); else scope.postMessage(message);
};

let ctx: EvalContext | null = null;
let pending: Exclude<WorkerIn, { type: 'init' | 'source-ways' | 'noise-band' }> | null = null;
/** the newest noise-band request: served only when no evaluation waits */
let band: Extract<WorkerIn, { type: 'noise-band' }> | null = null;
let scheduled = false;
let projectEnvironment: ProjectEnvironment | null = null;
let lastProject: ProjectResult | null = null;
/** full worker: where full results go for the preview worker */
let basePort: MessagePort | null = null;
let sourceWays: Map<string, number> | undefined;
let railPaths: Map<string, { xy: number[]; stations: number[] }> | undefined;

/** A preview's own per-station arrays move to the main thread instead of being copied (a long route's
 * preview is ≈ 1.7 MB). Never the full result's (`quantities` may be shared with a windowed preview's base). */
function previewBuffers(r: Result): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  const add = (v: unknown) => { if (ArrayBuffer.isView(v) && v.buffer instanceof ArrayBuffer) buffers.add(v.buffer); };
  for (const k of ['s', 'x', 'y', 'tx', 'ty', 'ground', 'grade', 'kind', 'cut', 'fill', 'dayL', 'dayR', 'zDayL', 'zDayR', 'oob', 'wallSurfaceL', 'wallSurfaceR'] as const) add(r[k]);
  for (const v of Object.values(r.parts)) add(v);
  for (const v of Object.values(r.cell)) add(v);
  add(r.geology.ids);
  return [...buffers];
}

function runBand() {
  const job = band!;
  band = null;
  const route = lastProject && lastProject.epoch === job.identity.epoch && lastProject.revision === job.identity.revision
    ? lastProject.routes[job.routeId]?.legacy : undefined;
  const terrain = ctx!.terrain;
  let footprint = null;
  try { footprint = route ? noiseBand(route, (x, y) => terrain.heightAt(x, y), job.crownWidth) : null; }
  catch (e) { console.error('noise band', e); }
  const out: NoiseBandOut = { type: 'noise-band', id: job.id, identity: job.identity, routeId: job.routeId, footprint };
  post(out);
}

function run() {
  scheduled = false;
  if (!ctx) return;
  if (!pending) { if (band) runBand(); return; }
  const job = pending;
  pending = null;
  try {
    if (!projectEnvironment) throw new Error('Project environment missing from worker init');
    const projectContext = { legacy: ctx, environment: projectEnvironment, sourceWays, ...(railPaths ? { railPaths } : {}) };
    if (job.type === 'project-preview') {
      const result = previewProjectRoute(projectContext, job.snapshot, job.routeId, { materialValue: job.materialValue, structureValue: job.structureValue }, lastProject);
      post({ type: 'project-preview', id: job.id,
        identity: { epoch: job.snapshot.epoch, revision: job.snapshot.revision }, routeId: job.routeId, routeRevision: result.revision, result,
        ...(job.gesture ? { gesture: job.gesture } : {}) }, result.legacy ? previewBuffers(result.legacy) : []);
    } else {
      const result = evaluateProject(projectContext, job.snapshot);
      const known = lastProject && job.displayedResult?.epoch === lastProject.epoch && job.displayedResult.revision === lastProject.revision ? lastProject : null;
      const baseIdentity = known ? { epoch: known.epoch, revision: known.revision } : null;
      const changedRouteIds = Object.keys(result.routes).filter(id => result.routes[id].engineeringRevision !== known?.routes[id]?.engineeringRevision);
      const removedRouteIds = known ? Object.keys(known.routes).filter(id => !Object.prototype.hasOwnProperty.call(result.routes, id)) : [];
      lastProject = result; // One result only; never retain a history of typed arrays.
      basePort?.postMessage(Object.values(result.routes).flatMap(r => r.legacy ? [previewBase(r.legacy)] : []));
      post({ type: 'project-result', id: job.id, result, baseIdentity,
        changedRouteIds, removedRouteIds, dependentRouteIds: [] });
    }
  } catch (e) {
    const message = String((e as Error)?.stack ?? e);
    post({ type: 'project-error', id: job.id, identity: { epoch: job.snapshot.epoch, revision: job.snapshot.revision }, message });
  } finally {
    if (band && !scheduled) { scheduled = true; setTimeout(run, 0); }
  }
}

self.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const m = ev.data;
  if (m.type === 'init') {
    pending = null; band = null; lastProject = null; sourceWays = undefined; railPaths = undefined; projectEnvironment = m.projectEnvironment ?? null;
    basePort = m.role === 'full' ? m.port ?? null : null;
    if (m.role === 'preview' && m.port) m.port.onmessage = (e: MessageEvent<Result[]>) => {
      if (ctx) for (const r of e.data) adoptFull(ctx.terrain, r);
    };
    const terrain = new Terrain({ nx: m.nx, ny: m.ny, cell: m.cell, base: m.base, scale: m.scale, q: m.q, lc: m.lc, ground: m.ground, watercourses: m.watercourses, protectedAreas: m.protectedAreas });
    ctx = {
      terrain, scenario: m.scenario, a: m.a, b: m.b, buildings: new BuildingIndex(m.buildings, m.binfo),
      roads: m.net ? new RoadNet(m.net) : undefined, ...(m.junctions?.length ? { junctions: m.junctions } : {}),
    };
    post({ type: 'ready' });
  } else if (m.type === 'source-ways') {
    sourceWays = new Map(m.ways);
    railPaths = m.rails ? new Map(m.rails.map(([id, xy, stations]) => [id, { xy, stations }])) : undefined;
  } else {
    if (m.type === 'noise-band') band = m; else pending = m;
    if (!scheduled) { scheduled = true; setTimeout(run, 0); }
  }
};
