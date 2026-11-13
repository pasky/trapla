// Crude random local search over PI positions (calibration aid: what does a good design cost?).
// npx tsx scripts/optimize.ts <speed> <iterations> [start.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { evaluate, type Design } from '../src/core/evaluate';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { loadPack } from './loadpack';

const { meta, terrain, buildings } = loadPack();
const a = { x: meta.A.xy[0], y: meta.A.xy[1] }, b = { x: meta.B.xy[0], y: meta.B.xy[1] };
const ctx = { terrain, scenario: D11_SCENARIO, a, b, buildings };
const speed = Number(process.argv[2] ?? 90), iters = Number(process.argv[3] ?? 300);
let d: Design = process.argv[4] ? JSON.parse(readFileSync(process.argv[4], 'utf8')).design
  : { category: 'S9.5', speed, pis: [], profileMode: 'auto', vpis: [] };
d.speed = speed;
if (!d.pis.length) for (let k = 1; k < 8; k++) d.pis.push({ x: a.x + (b.x - a.x) * k / 8, y: a.y + (b.y - a.y) * k / 8, r: null });
const score = (r: ReturnType<typeof evaluate>) => r.cost.total + 2e8 * r.violations.length;
let cur = evaluate(ctx, d), curS = score(cur);
let rng = 12345; const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
for (let it = 0; it < iters; it++) {
  const nd: Design = JSON.parse(JSON.stringify(d));
  const k = Math.floor(rand() * nd.pis.length);
  const step = 400 * (1 - it / iters) + 50;
  nd.pis[k].x += (rand() * 2 - 1) * step; nd.pis[k].y += (rand() * 2 - 1) * step;
  const r = evaluate(ctx, nd), s = score(r);
  if (s < curS) { d = nd; cur = r; curS = s; }
  if (it % 50 === 0) console.log(it, (cur.cost.total / 1e6).toFixed(0), cur.violations.length, (cur.length / 1000).toFixed(2), cur.travelMin.toFixed(2));
}
const q = cur.quantities;
console.log(`final ${(cur.cost.total / 1e6).toFixed(0)} M CZK, ${(cur.length / 1000).toFixed(2)} km, ${cur.travelMin.toFixed(2)} min, viol ${cur.violations.length}, bridges ${q.bridges}/${q.bridgeLength.toFixed(0)} m tunnels ${q.tunnels}/${q.tunnelLength.toFixed(0)} m, buildings ${q.buildingsHit}`);
console.log(cur.violations.map((v) => v.msg));
d.pis = d.pis.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), r: p.r }));
writeFileSync(`/tmp/opt-${speed}.json`, JSON.stringify({ design: d }));
