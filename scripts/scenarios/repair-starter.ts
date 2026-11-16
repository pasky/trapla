// Starter repair for scenario packs (research/39): SCENARIO=<id> [NEAR=2] [MOVES=-12,12,...] [OUT=file]
//   npx tsx scripts/scenarios/repair-starter.ts <fixture.json>
// Greedy bounded repair: for the first violation, move one of the 2 nearest bends along the route normal
// (12–60 m); accept the candidate with the fewest violations (then cost); repeat until valid or no progress.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadPack } from '../loadpack';
import { evaluate, type Design, type EvalContext } from '../../src/core/evaluate';
const { meta, scenario, terrain, buildings, roads, junctions } = loadPack();
const ctx: EvalContext = { terrain, scenario, buildings, roads, junctions, a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] } };
const saved = JSON.parse(readFileSync(process.argv[2], 'utf8')); const original: Design = saved.design;
let d: Design = structuredClone(original), r = evaluate(ctx, d);
const tried = new Set<string>();
for (let round = 0; round < 20 && r.violations.length; round++) {
  console.log(`round ${round}: ${r.violations.length} violations, ${(r.cost.total / 1e9).toFixed(3)} bn: ${r.violations.map(v => `${(v.s0 / 1000).toFixed(2)} ${v.title}`).join('; ')}`);
  let best: { d: Design; r: typeof r } | null = null;
  for (const v of r.violations) {
    const i = Math.round((v.s0 + v.s1) / 2 / r.ds), nx = -r.ty[i], ny = r.tx[i];
    const near = d.pis.map((p, k) => ({ k, dist: Math.hypot(p.x - r.x[i], p.y - r.y[i]) })).sort((a, b) => a.dist - b.dist).slice(0, Number(process.env.NEAR ?? 2));
    for (const { k } of near) for (const m of (process.env.MOVES ?? "-12,12,-25,25,-40,40,-60,60").split(",").map(Number)) {
      const c = structuredClone(d); c.pis[k].x = Math.round((c.pis[k].x + nx * m) * 10) / 10; c.pis[k].y = Math.round((c.pis[k].y + ny * m) * 10) / 10;
      if (Math.hypot(c.pis[k].x - original.pis[k].x, c.pis[k].y - original.pis[k].y) > 200) continue;
      const key = JSON.stringify(c.pis); if (tried.has(key)) continue; tried.add(key);
      const cr = evaluate(ctx, c);
      if (cr.violations.length < (best?.r.violations.length ?? r.violations.length) || (best && cr.violations.length === best.r.violations.length && cr.cost.total < best.r.cost.total)) best = { d: c, r: cr };
      if (cr.violations.length === 0) break;
    }
    if (best && best.r.violations.length < r.violations.length) break; // improve one at a time
  }
  if (!best || best.r.violations.length >= r.violations.length) { console.log('no progress'); break; }
  d = best.d; r = best.r;
}
console.log(`final: ${r.violations.length} violations, ${(r.cost.total / 1e9).toFixed(3)} bn, moved`, JSON.stringify(d.pis.map((p, k) => ({ k, m: +Math.hypot(p.x - original.pis[k].x, p.y - original.pis[k].y).toFixed(1) })).filter(p => p.m > 0)));
writeFileSync(process.env.OUT ?? '/tmp/nudged.json', JSON.stringify({ ...saved, design: d }, null, 2));
