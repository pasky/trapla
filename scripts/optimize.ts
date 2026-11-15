// Crude random local search over PI positions (calibration aid: what does a good design cost?).
//   npx tsx scripts/optimize.ts <speed> <iterations> [start.json | official | -] [out.json] [seed]
// `official`: fresh PIs every ~1.5 km along the official corridor; `-`: fresh straight line.
// Moves: shift one PI (step shrinking over the run), occasionally insert a PI in the middle of a leg
// or delete one. Invalid designs are penalised per violation.
import { readFileSync, writeFileSync } from 'node:fs';
import { evaluate, type Design, type EvalContext, type Result } from '../src/core/evaluate';
import { loadPack } from './loadpack';
import { describe } from './report';

const { meta, scenario, terrain, buildings, roads } = loadPack();
const a = { x: meta.A.xy[0], y: meta.A.xy[1] }, b = { x: meta.B.xy[0], y: meta.B.xy[1] };
const ctx: EvalContext = { terrain, scenario, a, b, buildings, roads };
const speed = Number(process.argv[2] ?? 90), iters = Number(process.argv[3] ?? 300);
const out = process.argv[5] ?? `/tmp/opt-${speed}.json`;
const start = process.argv[4];
let d: Design = start && start !== '-' && start !== 'official' ? JSON.parse(readFileSync(start, 'utf8')).design
  : { category: 'S9.5', speed, pis: [], profileMode: 'auto', vpis: [] };
if (start === 'official') {
  const off = meta.official.xy as [number, number][];
  if (off.length < 2) throw new Error('This scenario has no mapped reference line. Use - for a straight start or pass a saved design.');
  const distance = (p: number[], q: { x: number; y: number }) => Math.hypot(p[0] - q.x, p[1] - q.y);
  let ia = 0, ib = 0;
  off.forEach((p, i) => { if (distance(p, a) < distance(off[ia], a)) ia = i; if (distance(p, b) < distance(off[ib], b)) ib = i; });
  const seg = off.slice(Math.min(ia, ib), Math.max(ia, ib) + 1);
  if (ia > ib) seg.reverse();
  let acc = 0;
  for (let i = 1; i < seg.length - 1; i++) {
    acc += Math.hypot(seg[i][0] - seg[i - 1][0], seg[i][1] - seg[i - 1][1]);
    if (acc > 1500) { d.pis.push({ x: Math.round(seg[i][0]), y: Math.round(seg[i][1]), r: null }); acc = 0; }
  }
}
d.speed = speed;
d.profileMode = 'auto';
if (!d.pis.length) for (let k = 1; k < 8; k++) d.pis.push({ x: Math.round(a.x + (b.x - a.x) * k / 8), y: Math.round(a.y + (b.y - a.y) * k / 8), r: null });
const score = (r: Result) => r.cost.total + 2e8 * r.violations.length;
let cur = evaluate(ctx, d), curS = score(cur);
let rng = Number(process.argv[6] ?? 12345);
const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
for (let it = 0; it < iters; it++) {
  const nd: Design = JSON.parse(JSON.stringify(d));
  const step = 400 * (1 - it / iters) + 50;
  const move = rand();
  if (move < 0.06 && nd.pis.length < 20) {
    const pts = [a, ...nd.pis, b];
    const k = Math.floor(rand() * (pts.length - 1));
    nd.pis.splice(k, 0, { x: (pts[k].x + pts[k + 1].x) / 2 + (rand() * 2 - 1) * step, y: (pts[k].y + pts[k + 1].y) / 2 + (rand() * 2 - 1) * step, r: null });
  } else if (move < 0.1 && nd.pis.length > 3) {
    nd.pis.splice(Math.floor(rand() * nd.pis.length), 1);
  } else {
    const k = Math.floor(rand() * nd.pis.length);
    nd.pis[k].x += (rand() * 2 - 1) * step; nd.pis[k].y += (rand() * 2 - 1) * step;
  }
  // whole metres, so that the saved design is exactly what was evaluated (a building can hinge on 0.1 m)
  for (const p of nd.pis) { p.x = Math.round(p.x); p.y = Math.round(p.y); }
  const r = evaluate(ctx, nd), s = score(r);
  if (s < curS) { d = nd; cur = r; curS = s; }
  if (it % 100 === 0) console.log(it, (cur.cost.total / 1e6).toFixed(0), cur.violations.length, (cur.length / 1000).toFixed(2), cur.travelMin.toFixed(2), d.pis.length);
}
console.log(`final: ${(cur.length / 1000).toFixed(2)} km, ${cur.travelMin.toFixed(2)} min, ${d.pis.length} PIs`);
for (const l of describe(cur)) console.log(l);
if (cur.violations.length) console.log(cur.violations.map((v) => `${v.title} — ${v.fix}`));
d.vpis = [];
writeFileSync(out, JSON.stringify({ design: d }));
console.log('written', out);
