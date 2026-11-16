// Locality of the full evaluation: move a bend sideways and measure how much the grade line, the
// violations and the bill change far from it (beyond ±FAR m of the bend, downstream compared at the
// same ground, i.e. chainage shifted by the length change).
//   SCENARIO=d3-full npx tsx scripts/locality.ts scripts/scenarios/d3-full/d3-full-motorway.json
// env BENDS=5,14,17 (default: every 4th bend), MOVES=20,60 (m, along the route normal), FAR=5000
import { readFileSync } from 'node:fs';
import { loadPack } from './loadpack';
import { evaluate, type Design, type EvalContext, type Result } from '../src/core/evaluate';

const { meta, scenario, terrain, buildings, roads, junctions } = loadPack();
const ctx: EvalContext = { terrain, scenario, buildings, roads, junctions, a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] } };
const d0: Design = JSON.parse(readFileSync(process.argv[2], 'utf8')).design;
const FAR = Number(process.env.FAR ?? 5000);
const moves = (process.env.MOVES ?? '20,60').split(',').map(Number);
const t0 = performance.now();
const r0 = evaluate(ctx, d0);


console.log(`base: ${(r0.length / 1000).toFixed(2)} km, ${(r0.cost.total / 1e9).toFixed(3)} bn, ${r0.violations.length} violations, material ${r0.quantities.materialValue.toFixed(1)}, ${(performance.now() - t0).toFixed(0)} ms`);
const bends = process.env.BENDS ? process.env.BENDS.split(',').map(Number)
  : d0.pis.map((_, k) => k).filter(k => k % 4 === 1);

const at = (r: Result, arr: ArrayLike<number>, s: number) => {
  const f = Math.max(0, Math.min(r.n - 1, s / r.ds)), i = Math.min(r.n - 2, Math.floor(f));
  return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
};
const partSum = (r: Result, keep: (s: number) => boolean) => {
  let t = 0;
  for (const p of Object.values(r.parts)) for (let i = 0; i < r.n; i++) if (keep(r.s[i])) t += p[i];
  return t;
};
let worst = 0, changed = 0, trials = 0;
for (const k of bends) {
  const p = d0.pis[k];
  let bi = 0, bd = Infinity;
  for (let i = 0; i < r0.n; i++) { const dd = Math.hypot(r0.x[i] - p.x, r0.y[i] - p.y); if (dd < bd) { bd = dd; bi = i; } }
  const sb = r0.s[bi], nx = -r0.ty[bi], ny = r0.tx[bi];
  for (const m of moves) {
    const d = structuredClone(d0);
    d.pis[k].x = Math.round((p.x + nx * m) * 10) / 10; d.pis[k].y = Math.round((p.y + ny * m) * 10) / 10;
    const r = evaluate(ctx, d);
    const dL = r.length - r0.length;
    // far stations of the base: upstream compared at the same chainage, downstream shifted by dL
    let maxUp = 0, maxDown = 0, sUp = NaN, sDown = NaN;
    for (let i = 0; i < r0.n; i++) {
      const s = r0.s[i];
      if (s < sb - FAR) { const dz = Math.abs(at(r, r.grade, s) - r0.grade[i]); if (dz > maxUp) { maxUp = dz; sUp = s; } }
      else if (s > sb + FAR && s + dL <= r.length) { const dz = Math.abs(at(r, r.grade, s + dL) - r0.grade[i]); if (dz > maxDown) { maxDown = dz; sDown = s; } }
    }
    const far0 = (s: number) => s < sb - FAR || s > sb + FAR, far1 = (s: number) => s < sb - FAR || s > sb + FAR + dL;
    const farV = r.violations.filter(v => far1((v.s0 + v.s1) / 2));
    const farV0 = r0.violations.filter(v => far0((v.s0 + v.s1) / 2));
    const farBill = partSum(r, far1) - partSum(r0, far0);
    worst = Math.max(worst, maxUp, maxDown);
    trials++;
    if (JSON.stringify(farV.map(v => v.title)) !== JSON.stringify(farV0.map(v => v.title))) changed++;
    console.log(`bend ${k} @${(sb / 1000).toFixed(2)} km ${m} m: dL ${dL.toFixed(1)} m; far grade Δ up ${maxUp.toFixed(2)} m${maxUp > 0.01 ? ` @${(sUp / 1000).toFixed(2)}` : ''}, down ${maxDown.toFixed(2)} m${maxDown > 0.01 ? ` @${(sDown / 1000).toFixed(2)}` : ''}; `
      + `far bill ${(farBill / 1e6).toFixed(1)} M; far violations ${farV0.length} → ${farV.length}${farV.length ? ' [' + farV.map(v => `${(v.s0 / 1000).toFixed(2)} ${v.title}`).join('; ') + ']' : ''}; `
      + `material ${r.quantities.materialValue.toFixed(1)}; total ${((r.cost.total - r0.cost.total) / 1e6).toFixed(1)} M`);
  }
}
console.log(`worst far grade change ${worst.toFixed(2)} m; far violations changed in ${changed} of ${trials} moves`);
