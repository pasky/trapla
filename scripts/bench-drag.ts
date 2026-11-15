// Drag benchmark: consecutive evaluations of a PI moved in small steps, as the worker sees a
// live drag (every step changes the route length, so every station shifts). Unlike bench.ts it
// never repeats an identical design, so caches that only help identical inputs do not flatter it.
// Usage: npx tsx scripts/bench-drag.ts [design.json …]   (default: the five published designs)
import { readFileSync } from 'node:fs';
import { evaluate, type Design, type EvalContext } from '../src/core/evaluate';
import { loadPack } from './loadpack';

const { meta, scenario, terrain, buildings, roads } = loadPack();
const ctx: EvalContext = { terrain, scenario, a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] }, buildings, roads };
const files = process.argv.slice(2).length ? process.argv.slice(2)
  : ['best', 'demo', 'direct-80', 'direct-90', 'town-centre'].map(n => `scripts/${n}-design.json`);
const STEPS = Number(process.env.STEPS ?? 24), PHASES = ['stations', 'profile', 'sections', 'structures', 'earthworks', 'crossings', 'footprint', 'town', 'cost', 'total'];
// JIT warm-up on an unrelated route, so the first drag step is not a cold start.
for (let i = 0; i < 6; i++) evaluate(ctx, { category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] });
for (const file of files) {
  const base: Design = JSON.parse(readFileSync(file, 'utf8')).design;
  const k = Math.floor(base.pis.length / 2);
  const sums: Record<string, number> = {}, totals: number[] = [];
  for (let step = 0; step < STEPS; step++) {
    const d = structuredClone(base);
    if (d.pis[k]) { d.pis[k].x += 1.5 * step; d.pis[k].y -= 0.9 * step; }
    const t = evaluate(ctx, d).timing;
    let previous = 0;
    for (const key of PHASES) if (t[key] !== undefined) { sums[key] = (sums[key] ?? 0) + t[key] - previous; previous = t[key]; }
    totals.push(t.total);
  }
  totals.sort((a, b) => a - b);
  console.log(`${file}: mean ${(totals.reduce((a, v) => a + v, 0) / STEPS).toFixed(1)} ms, median ${totals[STEPS >> 1].toFixed(1)}, max ${totals[STEPS - 1].toFixed(1)} |`,
    PHASES.filter(k => k !== 'total' && sums[k] !== undefined).map(k => `${k} ${(sums[k] / STEPS).toFixed(1)}`).join(' '));
}
