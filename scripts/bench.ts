// Bench + realism numbers. Usage:
//   npx tsx scripts/bench.ts                    straight line, the reference design, an official-line-like design
//   npx tsx scripts/bench.ts a.json [b.json…]   the given designs ({design: …} files)
import { readFileSync } from 'node:fs';
import { PART_KEYS } from '../src/core/cost';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { evaluate, type Design, type EvalContext } from '../src/core/evaluate';
import { loadPack } from './loadpack';
import { describe } from './report';

const { meta, terrain, buildings, roads } = loadPack();
const a = { x: meta.A.xy[0], y: meta.A.xy[1] }, b = { x: meta.B.xy[0], y: meta.B.xy[1] };
const ctx: EvalContext = { terrain, scenario: D11_SCENARIO, a, b, buildings, roads };
function report(name: string, d: Design) {
  let r = evaluate(ctx, d);
  const t0 = performance.now();
  const N = 5;
  for (let i = 0; i < N; i++) r = evaluate(ctx, d);
  const ms = (performance.now() - t0) / N;
  console.log(`\n== ${name}: ${(r.length / 1000).toFixed(2)} km, ${r.travelMin.toFixed(2)} min, eval ${ms.toFixed(0)} ms`,
    Object.entries(r.timing).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' '));
  for (const l of describe(r)) console.log(l);
  // every component array must sum to its line of the bill
  let sum = 0;
  for (const k of PART_KEYS) for (let i = 0; i < r.n; i++) sum += r.parts[k][i];
  if (Math.abs(sum - r.cost.total) > 1) console.log(`  !! parts sum ${sum} ≠ total ${r.cost.total}`);
  if (r.violations.length) console.log('  violations:', r.violations.slice(0, 6).map((v) => v.msg));
  return r;
}

if (process.argv.length > 2) {
  for (const f of process.argv.slice(2)) report(f, JSON.parse(readFileSync(f, 'utf8')).design);
  process.exit(0);
}
report('straight (auto profile)', { category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] });
report('reference bypass (scripts/demo-design.json)', JSON.parse(readFileSync('scripts/demo-design.json', 'utf8')).design);

// follow the official line: take points every ~1.5 km between A and B
const off = meta.official.xy as [number, number][];
const dist = (p: number[], q: { x: number; y: number }) => Math.hypot(p[0] - q.x, p[1] - q.y);
let ia = 0, ib = 0;
off.forEach((p, i) => { if (dist(p, a) < dist(off[ia], a)) ia = i; if (dist(p, b) < dist(off[ib], b)) ib = i; });
const seg = off.slice(Math.min(ia, ib), Math.max(ia, ib) + 1);
const pis = [];
let acc = 0;
for (let i = 1; i < seg.length - 1; i++) {
  acc += Math.hypot(seg[i][0] - seg[i - 1][0], seg[i][1] - seg[i - 1][1]);
  if (acc > 1500) { pis.push({ x: seg[i][0], y: seg[i][1], r: null }); acc = 0; }
}
if (ia > ib) pis.reverse();
report(`official-ish (${pis.length} PIs)`, { category: 'S9.5', speed: 90, pis, profileMode: 'auto', vpis: [] });
