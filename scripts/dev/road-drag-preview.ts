// Node probe of a road drag's previews (a new bend between bends k and k+1 moved on a loop, as drag-perf --mode road),
// each a windowed preview against the remembered full result. Prints per-preview ms, window and phases.
//   SCENARIO=d11 PRESET=d11-motorway BEND=6 npx tsx scripts/dev/road-drag-preview.ts scripts/scenarios/d11/d11-motorway.json
import { readFileSync } from 'node:fs';
import { evaluate, type Design, type EvalContext } from '../../src/core/evaluate';
import { loadPack } from '../loadpack';
import { scenarioParams } from '../../src/core/data/scenario';
const pack = loadPack(); const { meta, terrain, buildings, roads } = pack;
const scenario = scenarioParams(meta.id, process.env.PRESET);
const ctx: EvalContext = { terrain, scenario, a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] }, buildings, roads };
const base: Design = JSON.parse(readFileSync(process.argv[2], 'utf8')).design;
for (let i = 0; i < 3; i++) evaluate(ctx, base);
const mv = evaluate(ctx, base).quantities.materialValue;
const k = Number(process.env.BEND ?? Math.floor(base.pis.length / 2)), N = Number(process.env.STEPS ?? 40);
const p = base.pis[k], q = base.pis[k + 1] ?? { x: meta.B.xy[0], y: meta.B.xy[1] };
const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
const ms: number[] = [], sums: Record<string, number> = {};
for (let step = 0; step < N; step++) {
  const u = step / N, d = structuredClone(base);
  d.pis.splice(k + 1, 0, { x: mid.x + 60 * Math.sin(u * 2 * Math.PI), y: mid.y + 36 * (1 - Math.cos(u * 2 * Math.PI)), r: null });
  const t0 = performance.now(); const r = evaluate(ctx, d, { preview: true, materialValue: mv }); ms.push(performance.now() - t0);
  for (const [key, v] of Object.entries(r.timing as Record<string, number>)) sums[key] = (sums[key] ?? 0) + v / N;
}
ms.sort((a, b) => a - b);
console.log(`median ${ms[N >> 1].toFixed(1)} p90 ${ms[Math.floor(N * 0.9)].toFixed(1)} max ${ms[N - 1].toFixed(1)} ms |`, Object.entries(sums).map(([key, v]) => `${key} ${v.toFixed(1)}`).join(' '));
