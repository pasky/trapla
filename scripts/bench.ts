// Bench + realism numbers. Usage:
//   npx tsx scripts/bench.ts                    straight line, the reference design, an official-line-like design
//   npx tsx scripts/bench.ts a.json [b.json…]   the given designs ({design: …} files)
import { readFileSync } from 'node:fs';
import { PART_KEYS } from '../src/core/cost';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { evaluate, type Design, type EvalContext, type Result } from '../src/core/evaluate';
import { loadPack } from './loadpack';

const { meta, terrain, buildings, roads } = loadPack();
const a = { x: meta.A.xy[0], y: meta.A.xy[1] }, b = { x: meta.B.xy[0], y: meta.B.xy[1] };
const ctx: EvalContext = { terrain, scenario: D11_SCENARIO, a, b, buildings, roads };
const M = (v: number) => (v / 1e6).toFixed(0);

export function describe(r: Result): string[] {
  const q = r.quantities, c = r.cost, km = r.length / 1000;
  const xs: Record<string, number> = {};
  for (const x of r.crossings) xs[`${x.type}:${x.cls}`] = (xs[`${x.type}:${x.cls}`] ?? 0) + 1;
  return [
    `total ${M(c.total)} M CZK = ${M(c.total / km)} M/km ${r.valid ? 'VALID' : `NOT VALID (${r.violations.length})`}`,
    `  road base ${M(c.roadBase)} | earthworks ${M(c.earthworks)} | bridges ${M(c.bridges)} | tunnels ${M(c.tunnels)} | crossings ${M(c.crossings)} | noise walls ${M(c.noiseWalls)} | other objects ${M(c.surcharge)} | land ${M(c.landDetail.land)} | forest ${M(c.landDetail.forest)} | buildings ${M(c.landDetail.buildings)}`,
    `  earth detail: ${Object.entries(c.earthDetail).map(([k, v]) => `${k} ${M(v)}`).join(', ')}`,
    `  cut ${(q.cut / 1e3).toFixed(0)}k m³ (class I/II/III ${q.cutByClass.map((v) => `${((100 * v) / Math.max(1, q.cut)).toFixed(0)} %`).join(' / ')}), fill ${(q.fill / 1e3).toFixed(0)}k m³, ${(q.cut / r.length).toFixed(0)} / ${(q.fill / r.length).toFixed(0)} m³ per m; surplus ${(q.surplus / 1e3).toFixed(0)}k, bought ${(q.deficit / 1e3).toFixed(0)}k, avg haul ${q.avgHaul.toFixed(0)} m; material value ${q.materialValue.toFixed(0)} CZK/m³`,
    `  bridges ${q.bridges} / ${q.bridgeLength.toFixed(0)} m, tunnels ${q.tunnels} / ${q.tunnelLength.toFixed(0)} m; built-up ${(q.urbanLength / 1000).toFixed(2)} km; buildings ${q.buildingsHit}; noise walls ${q.wallLength.toFixed(0)} m (D = ${q.noiseDistance.toFixed(0)} m); forest ${(q.forestArea / 1e4).toFixed(1)} ha`,
    `  crossings ${r.crossings.length} (${q.crossingsPaid} paid): ${Object.entries(xs).map(([k, v]) => `${k} ${v}`).join(', ')}`,
  ];
}

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
