// QA3: per-bend design speed on a saved design: each bend alone at 80 and at 70 against the design at 90.
// Usage: npx tsx qa3/speed-per-bend.ts scripts/best-design.json
import { readFileSync } from 'node:fs';
import { evaluate, type Design, type EvalContext } from '../src/core/evaluate';
import { loadPack } from '../scripts/loadpack';

const { meta, scenario, terrain, buildings, roads, junctions } = loadPack();
const ctx: EvalContext = { terrain, scenario, a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] }, buildings, roads, junctions };
const f = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const base = (f.design ?? f) as Design;
const r0 = evaluate(ctx, base);
console.log(`base: ${(r0.cost.total / 1e6).toFixed(0)} M, valid ${r0.valid}`);
for (let i = 0; i < base.pis.length; i++) for (const v of [80, 70]) {
  const d: Design = structuredClone(base); d.pis[i] = { ...d.pis[i], speed: v };
  const r = evaluate(ctx, d);
  const dc = (r.cost.total - r0.cost.total) / 1e6;
  console.log(`bend ${i + 1} at ${v}: ${dc >= 0 ? '+' : ''}${dc.toFixed(0)} M, ${r.travelMin.toFixed(2)} min, valid ${r.valid}${r.valid ? '' : ' ' + r.violations.map(x => x.title).join('; ')}`);
}
