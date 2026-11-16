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
import type { NoiseBandOut, ProjectWorkerIn } from './core/project-protocol';
import { noiseBand } from './core/noise';

export type WorkerIn =
  | { type: 'init'; nx: number; ny: number; cell: number; base: number; scale: number; q: Uint16Array; lc: Uint8Array;
      a: { x: number; y: number }; b: { x: number; y: number }; buildings: [number, number, number][];
      binfo?: (BuildingInfo | null)[]; net?: RoadNetData; ground?: GroundData; scenario: ScenarioParams; watercourses?: WaterData;
      projectEnvironment?: ProjectEnvironment; junctions?: EndpointJunction[] }
  | { type: 'eval'; id: number; design: Design; preview?: boolean; materialValue?: number }
  /** Legacy road-net way of each mapped source, whenever the pack's road links are loaded. */
  | { type: 'source-ways'; ways: [string, number][]; rails?: [string, number[], number[]][] }
  | ProjectWorkerIn;

let ctx: EvalContext | null = null;
let pending: Exclude<WorkerIn, { type: 'init' | 'source-ways' | 'noise-band' }> | null = null;
/** the newest noise-band request: served only when no evaluation waits */
let band: Extract<WorkerIn, { type: 'noise-band' }> | null = null;
let scheduled = false;
let projectEnvironment: ProjectEnvironment | null = null;
let lastProject: ProjectResult | null = null;
let sourceWays: Map<string, number> | undefined;
let railPaths: Map<string, { xy: number[]; stations: number[] }> | undefined;

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
  (self as unknown as Worker).postMessage(out);
}

function run() {
  scheduled = false;
  if (!ctx) return;
  if (!pending) { if (band) runBand(); return; }
  const job = pending;
  pending = null;
  try {
    if (job.type === 'eval') {
      const result = evaluate(ctx, job.design, { preview: job.preview, materialValue: job.materialValue });
      (self as unknown as Worker).postMessage({ type: 'result', id: job.id, result });
    } else {
      if (!projectEnvironment) throw new Error('Project environment missing from worker init');
      const projectContext = { legacy: ctx, environment: projectEnvironment, sourceWays, ...(railPaths ? { railPaths } : {}) };
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
  } finally {
    if (band && !scheduled) { scheduled = true; setTimeout(run, 0); }
  }
}

self.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const m = ev.data;
  if (m.type === 'init') {
    pending = null; band = null; lastProject = null; sourceWays = undefined; railPaths = undefined; projectEnvironment = m.projectEnvironment ?? null;
    const terrain = new Terrain({ nx: m.nx, ny: m.ny, cell: m.cell, base: m.base, scale: m.scale, q: m.q, lc: m.lc, ground: m.ground, watercourses: m.watercourses });
    ctx = {
      terrain, scenario: m.scenario, a: m.a, b: m.b, buildings: new BuildingIndex(m.buildings, m.binfo),
      roads: m.net ? new RoadNet(m.net) : undefined, ...(m.junctions?.length ? { junctions: m.junctions } : {}),
    };
    (self as unknown as Worker).postMessage({ type: 'ready' });
  } else if (m.type === 'source-ways') {
    sourceWays = new Map(m.ways);
    railPaths = m.rails ? new Map(m.rails.map(([id, xy, stations]) => [id, { xy, stations }])) : undefined;
  } else {
    if (m.type === 'noise-band') band = m; else pending = m;
    if (!scheduled) { scheduled = true; setTimeout(run, 0); }
  }
};
