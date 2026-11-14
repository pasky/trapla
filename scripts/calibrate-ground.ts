// Fit an explicitly approximate official-corridor S9.5 surrogate to D11 1109 SO101 excavation shares.
// Usage: npx tsx scripts/calibrate-ground.ts [initial-profile-table.json] [actual|planned] [--check]
// Prints a candidate table; does not overwrite the pack or source table. See research/10 §6.
import { readFileSync } from 'node:fs';
import { evaluate, type Design, type EvalContext } from '../src/core/evaluate';
import type { GroundProfile } from '../src/core/ground';
import { loadPack } from './loadpack';

const { meta, scenario, terrain, buildings, roads } = loadPack();
const a = { x: meta.A.xy[0], y: meta.A.xy[1] }, b = { x: meta.B.xy[0], y: meta.B.xy[1] };
const ctx: EvalContext = { terrain, scenario, a, b, buildings, roads };
const off = meta.official.xy as [number, number][];
const distance = (p: number[], q: { x: number; y: number }) => Math.hypot(p[0] - q.x, p[1] - q.y);
let ia = 0, ib = 0;
off.forEach((p, i) => { if (distance(p, a) < distance(off[ia], a)) ia = i; if (distance(p, b) < distance(off[ib], b)) ib = i; });
const seg = off.slice(Math.min(ia, ib), Math.max(ia, ib) + 1);
const pis = [];
let acc = 0;
for (let i = 1; i < seg.length - 1; i++) {
  acc += Math.hypot(seg[i][0] - seg[i - 1][0], seg[i][1] - seg[i - 1][1]);
  if (acc > 1500) { pis.push({ x: seg[i][0], y: seg[i][1], r: null }); acc = 0; }
}
if (ia > ib) pis.reverse();
const design: Design = { category: 'S9.5', speed: 90, pis, profileMode: 'auto', vpis: [] };
const table: Record<string, GroundProfile> = JSON.parse(readFileSync(process.argv[2] ?? 'pipeline/ground_profiles.json', 'utf8'));
const targetVolumes = process.argv[3] === 'planned' ? [1536933, 658934, 553555] : [1177963, 505032, 1093421];
const total = targetVolumes.reduce((a, b) => a + b, 0), target = targetVolumes.map((v) => v / total);
// Only clastic bedrock is fitted: the comparator cannot identify independent profiles for every lithology.
const fitted = new Set(['perm_sand', 'perm_congl', 'perm_fine', 'carb_sand', 'carb_mixed']);
const profiles = terrain.ground!.profiles as (GroundProfile & { key: string })[];
function apply(alpha: number, beta: number) {
  for (const p of profiles) {
    const original = table[p.key];
    if (!original) continue;
    p.classIto = original.classIto * (fitted.has(p.key) ? alpha : 1);
    p.classIIto = fitted.has(p.key) ? Math.max(p.classIto + 0.25, original.classIIto * beta) : original.classIIto;
  }
}
function trial(alpha: number, beta: number) {
  apply(alpha, beta);
  const r = evaluate(ctx, design);
  const shares = r.quantities.cutByClass.map((v) => v / r.quantities.cut);
  const loss = shares.reduce((s, v, i) => s + (v - target[i]) ** 2, 0);
  return { alpha, beta, loss, shares, valid: r.valid, cut: r.quantities.cut, cost: r.cost.total };
}
console.log('target', target, 'initial', trial(1, 1));
if (process.argv.includes('--check')) process.exit(0);
let best = trial(1, 1);
for (let ai = 0; ai <= 12; ai++) for (let bi = 0; bi <= 10; bi++) {
  const r = trial(1 + ai * 0.15, 0.75 + bi * 0.075);
  if (r.valid && r.loss < best.loss) best = r;
}
for (const step of [0.05, 0.015, 0.005]) {
  const centre = best;
  for (let ai = -2; ai <= 2; ai++) for (let bi = -2; bi <= 2; bi++) {
    const r = trial(centre.alpha + ai * step, centre.beta + bi * step);
    if (r.valid && r.loss < best.loss) best = r;
  }
}
console.log('best', best);
apply(best.alpha, best.beta);
for (const key of fitted) {
  const p = profiles.find((p) => p.key === key)!;
  console.log(key, p.classIto.toFixed(2), p.classIIto.toFixed(2));
}
