import { readFileSync } from 'node:fs';
// Bench + sanity: evaluate the naive straight design and a design following the official line.
import { evaluate, type Design } from '../src/core/evaluate';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { loadPack } from './loadpack';

const { meta, terrain, buildings } = loadPack();
const a = { x: meta.A.xy[0], y: meta.A.xy[1] }, b = { x: meta.B.xy[0], y: meta.B.xy[1] };
const ctx = { terrain, scenario: D11_SCENARIO, a, b, buildings };
const M = (v: number) => (v / 1e6).toFixed(0);

function report(name: string, d: Design) {
  let r = evaluate(ctx, d);
  const t0 = performance.now();
  for (let i = 0; i < 3; i++) r = evaluate(ctx, d);
  const ms = (performance.now() - t0) / 3;
  const q = r.quantities, c = r.cost;
  console.log(`\n== ${name}: ${(r.length / 1000).toFixed(2)} km, ${r.travelMin.toFixed(2)} min, eval ${ms.toFixed(0)} ms`, r.timing);
  console.log(`total ${M(c.total)} M CZK = ${M(c.total / (r.length / 1000))} M/km; base ${M(c.roadBase)} earth ${M(c.earthworks)} bridges ${M(c.bridges)} tunnels ${M(c.tunnels)} surcharge ${M(c.surcharge)} land ${M(c.land)}`);
  console.log(`cut ${(q.cut / 1e3).toFixed(0)}k m³ fill ${(q.fill / 1e3).toFixed(0)}k m³ (per km cut ${(q.cut / r.length).toFixed(0)}k), surplus ${(q.surplus/1e3).toFixed(0)}k deficit ${(q.deficit/1e3).toFixed(0)}k haul ${q.avgHaul.toFixed(0)} m; bridges ${q.bridges} / ${q.bridgeLength.toFixed(0)} m, tunnels ${q.tunnels} / ${q.tunnelLength.toFixed(0)} m; buildings ${q.buildingsHit}, forest ${(q.forestArea/1e4).toFixed(1)} ha`);
  console.log('earth detail', Object.fromEntries(Object.entries(c.earthDetail).map(([k, v]) => [k, M(v)])));
  console.log(`VPIs ${r.vpis.length}, violations ${r.violations.length}:`, r.violations.slice(0, 8).map((v) => v.msg));
  return r;
}

if (process.argv[2]) {
  report(process.argv[2], JSON.parse(readFileSync(process.argv[2], 'utf8')).design);
  process.exit(0);
}
report('straight', { category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] });

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
console.log(JSON.stringify(pis.map((p) => [Math.round(p.x), Math.round(p.y)])));
