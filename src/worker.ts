// Recompute worker: holds its own copy of the terrain, evaluates only the latest request.
// `preview` requests (while a drag is in progress) run the fast approximate evaluation.

import { BuildingIndex, type BuildingInfo } from './core/buildings';
import type { ScenarioParams } from './core/data/scenario';
import { evaluate, type Design, type EndpointJunction, type EvalContext } from './core/evaluate';
import { RoadNet, type RoadNetData } from './core/roadnet';
import type { WaterData } from './core/watercourses';
import type { GroundData } from './core/ground';
import { Terrain } from './core/terrain';
import type { ProjectEnvironment, ProjectResult } from './core/project';
import { evaluateProject, previewProjectRoute } from './core/project-evaluate';
import type { ProjectWorkerIn } from './core/project-protocol';

export type WorkerIn =
  | { type: 'init'; nx: number; ny: number; cell: number; base: number; scale: number; q: Uint16Array; lc: Uint8Array;
      a: { x: number; y: number }; b: { x: number; y: number }; buildings: [number, number, number][];
      binfo?: (BuildingInfo | null)[]; net?: RoadNetData; ground?: GroundData; scenario: ScenarioParams; watercourses?: WaterData;
      projectEnvironment?: ProjectEnvironment; junctions?: EndpointJunction[] }
  | { type: 'eval'; id: number; design: Design; preview?: boolean; materialValue?: number }
  | ProjectWorkerIn;

let ctx: EvalContext | null = null;
let pending: Exclude<WorkerIn, { type: 'init' }> | null = null;
let scheduled = false;
let projectEnvironment: ProjectEnvironment | null = null;
let lastProject: ProjectResult | null = null;

function run() {
  scheduled = false;
  if (!pending || !ctx) return;
  const job = pending;
  pending = null;
  try {
    if (job.type === 'eval') {
      const result = evaluate(ctx, job.design, { preview: job.preview, materialValue: job.materialValue });
      (self as unknown as Worker).postMessage({ type: 'result', id: job.id, result });
    } else {
      if (!projectEnvironment) throw new Error('Project environment missing from worker init');
      const projectContext = { legacy: ctx, environment: projectEnvironment };
      if (job.type === 'project-preview') {
        const result = previewProjectRoute(projectContext, job.snapshot, job.routeId, job.materialValue);
        (self as unknown as Worker).postMessage({ type: 'project-preview', id: job.id,
          identity: { epoch: job.snapshot.epoch, revision: job.snapshot.revision }, routeId: job.routeId, routeRevision: result.revision, result,
          ...(job.gesture ? { gesture: job.gesture } : {}) });
      } else {
        const result = evaluateProject(projectContext, job.snapshot);
        const known = lastProject && job.displayedResult?.epoch === lastProject.epoch && job.displayedResult.revision === lastProject.revision ? lastProject : null;
        const baseIdentity = known ? { epoch: known.epoch, revision: known.revision } : null;
        const changedRouteIds = Object.keys(result.routes).filter(id => result.routes[id].engineeringRevision !== known?.routes[id]?.engineeringRevision);
        const removedRouteIds = known ? Object.keys(known.routes).filter(id => !Object.prototype.hasOwnProperty.call(result.routes, id)) : [];
        lastProject = result; // One result only; never retain a history of typed arrays.
        (self as unknown as Worker).postMessage({ type: 'project-result', id: job.id, result, baseIdentity,
          changedRouteIds, removedRouteIds, dependentRouteIds: [] });
      }
    }
  } catch (e) {
    const message = String((e as Error)?.stack ?? e);
    (self as unknown as Worker).postMessage(job.type === 'eval' ? { type: 'error', id: job.id, message }
      : { type: 'project-error', id: job.id, identity: { epoch: job.snapshot.epoch, revision: job.snapshot.revision }, message });
  }
}

self.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const m = ev.data;
  if (m.type === 'init') {
    pending = null; lastProject = null; projectEnvironment = m.projectEnvironment ?? null;
    const terrain = new Terrain({ nx: m.nx, ny: m.ny, cell: m.cell, base: m.base, scale: m.scale, q: m.q, lc: m.lc, ground: m.ground, watercourses: m.watercourses });
    ctx = {
      terrain, scenario: m.scenario, a: m.a, b: m.b, buildings: new BuildingIndex(m.buildings, m.binfo),
      roads: m.net ? new RoadNet(m.net) : undefined, ...(m.junctions?.length ? { junctions: m.junctions } : {}),
    };
    (self as unknown as Worker).postMessage({ type: 'ready' });
  } else {
    pending = m;
    if (!scheduled) { scheduled = true; setTimeout(run, 0); }
  }
};
