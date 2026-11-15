// Bench + realism numbers. Usage:
//   npx tsx scripts/bench.ts                    straight line, the reference design, an official-line-like design
//   npx tsx scripts/bench.ts a.json [b.json…]   the given designs ({design: …} files)
import { readFileSync } from 'node:fs';
import { PART_KEYS } from '../src/core/cost';
import { evaluate, type Design, type EvalContext } from '../src/core/evaluate';
import { loadPack } from './loadpack';
import { describe } from './report';

const { meta, scenario, terrain, buildings, roads } = loadPack();
const a = { x: meta.A.xy[0], y: meta.A.xy[1] }, b = { x: meta.B.xy[0], y: meta.B.xy[1] };
const ctx: EvalContext = { terrain, scenario, a, b, buildings, roads };
function report(name: string, d: Design) {
  let r = evaluate(ctx, d);
  for (let i = 1; i < Number(process.env.BENCH_WARMUP ?? 1); i++) r = evaluate(ctx, d);
  const t0 = performance.now(), cpu0 = process.cpuUsage();
  const N = Number(process.env.BENCH_N ?? 5);
  const timing: Record<string, number> = {};
  for (let i = 0; i < N; i++) {
    r = evaluate(ctx, d);
    for (const [k, v] of Object.entries(r.timing)) timing[k] = (timing[k] ?? 0) + v / N;
  }
  const ms = (performance.now() - t0) / N, cpu = process.cpuUsage(cpu0);
  const cpuMs = (cpu.user + cpu.system) / 1000 / N;
  console.log(`\n== ${name}: ${(r.length / 1000).toFixed(2)} km, ${r.travelMin.toFixed(2)} min, eval ${ms.toFixed(0)} ms (CPU ${cpuMs.toFixed(0)} ms)`,
    Object.entries(timing).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' '));
  for (const l of describe(r)) console.log(l);
  // every component array must sum to its line of the bill
  let sum = 0;
  for (const k of PART_KEYS) for (let i = 0; i < r.n; i++) sum += r.parts[k][i];
  if (Math.abs(sum - r.cost.total) > 1) console.log(`  !! parts sum ${sum} ≠ total ${r.cost.total}`);
  if (r.violations.length) console.log('  violations:', r.violations.slice(0, 6).map((v) => `${v.title} — ${v.fix}`));
  return r;
}

if (process.argv.length > 2) {
  for (const f of process.argv.slice(2)) report(f, JSON.parse(readFileSync(f, 'utf8')).design);
  process.exit(0);
}
report('straight (auto profile)', { category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] });
// D11 coordinates: other scenarios pass their own designs as arguments
if (meta.id === 'd11') report('reference bypass (scripts/demo-design.json)', JSON.parse(readFileSync('scripts/demo-design.json', 'utf8')).design);

// follow the official line: take points every ~1.5 km between A and B
const off = meta.official.xy as [number, number][];
if (off.length < 2) {
  console.log('No mapped reference line; skipping the reference design. Pass a saved design to benchmark another route.');
  process.exit(0);
}
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
