// Robustness of Auto's crossing treatments under small drags: move the bend nearest a chainage by a
// few metres (seeded), evaluate, and count invalid results and their violations.
// SCENARIO=i16-nova-paka npx tsx scripts/small-drag-audit.ts scripts/scenarios/i16-nova-paka/default.json --at 3300 --n 24 --radius 25
import { readFileSync } from 'node:fs';
import { evaluate, type Design, type EvalContext } from '../src/core/evaluate';
import { loadPack } from './loadpack';

const { meta, scenario, terrain, buildings, roads, junctions } = loadPack();
const ctx: EvalContext = { terrain, scenario, a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] }, buildings, roads, junctions };
const args = process.argv.slice(2);
const opt = (name: string, value: number) => { const i = args.indexOf(`--${name}`); return i >= 0 ? Number(args[i + 1]) : value; };
const file = args.find(a => a.endsWith('.json'))!;
const at = opt('at', 3300), count = opt('n', 24), radius = opt('radius', 25);
const design: Design = JSON.parse(readFileSync(file, 'utf8')).design;
const base = evaluate(ctx, design);
// the bend whose curve is nearest the chainage
let pi = 0, best = Infinity;
base.curves.forEach((c, k) => { const d = Math.abs((c.sStart + c.sEnd) / 2 - at); if (d < best) { best = d; pi = c.index ?? k; } });
let seed = 12345;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const titles = new Map<string, number>();
let invalid = 0, total = 0, ms = 0;
console.log(`${file}: base ${(base.cost.total / 1e9).toFixed(4)} bn ${base.valid ? 'VALID' : 'INVALID'}; dragging bend ${pi + 1} (km ${(at / 1000).toFixed(2)}) by up to ${radius} m`);
for (let k = 0; k < count; k++) {
  const a = rand() * 2 * Math.PI, r = radius * Math.sqrt(rand());
  const pis = design.pis.map((p, j) => j === pi ? { ...p, x: p.x + r * Math.cos(a), y: p.y + r * Math.sin(a) } : p);
  const t0 = performance.now();
  const res = evaluate(ctx, { ...design, pis });
  ms += performance.now() - t0;
  total += res.cost.total;
  if (!res.valid) invalid++;
  for (const v of res.violations) titles.set(v.title, (titles.get(v.title) ?? 0) + 1);
  if (process.env.VERBOSE) console.log(`  #${k} ${(res.cost.total / 1e9).toFixed(4)} bn ${res.valid ? '' : res.violations.map(v => `[km ${(v.s0 / 1000).toFixed(2)}] ${v.title}`).join('; ')}`);
}
console.log(`invalid ${invalid}/${count}, mean ${(total / count / 1e9).toFixed(4)} bn, mean eval ${(ms / count).toFixed(0)} ms`);
for (const [t, n] of [...titles].sort((p, q) => q[1] - p[1])) console.log(`  ${n}× ${t}`);
