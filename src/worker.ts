// Recompute worker: holds its own copy of the terrain, evaluates only the latest request.

import { BuildingIndex } from './core/buildings';
import { D11_SCENARIO } from './core/data/scenario';
import { evaluate, type Design, type EvalContext } from './core/evaluate';
import { Terrain } from './core/terrain';

export type WorkerIn =
  | { type: 'init'; nx: number; ny: number; cell: number; base: number; scale: number; q: Uint16Array; lc: Uint8Array;
      a: { x: number; y: number }; b: { x: number; y: number }; buildings: [number, number, number][] }
  | { type: 'eval'; id: number; design: Design };

let ctx: EvalContext | null = null;
let pending: { id: number; design: Design } | null = null;
let scheduled = false;

function run() {
  scheduled = false;
  if (!pending || !ctx) return;
  const job = pending;
  pending = null;
  try {
    const result = evaluate(ctx, job.design);
    (self as unknown as Worker).postMessage({ type: 'result', id: job.id, result });
  } catch (e) {
    (self as unknown as Worker).postMessage({ type: 'error', id: job.id, message: String((e as Error)?.stack ?? e) });
  }
}

self.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const m = ev.data;
  if (m.type === 'init') {
    const terrain = new Terrain({ nx: m.nx, ny: m.ny, cell: m.cell, base: m.base, scale: m.scale, q: m.q, lc: m.lc });
    ctx = { terrain, scenario: D11_SCENARIO, a: m.a, b: m.b, buildings: new BuildingIndex(m.buildings) };
    (self as unknown as Worker).postMessage({ type: 'ready' });
  } else if (m.type === 'eval') {
    pending = { id: m.id, design: m.design };
    if (!scheduled) { scheduled = true; setTimeout(run, 0); }
  }
};
