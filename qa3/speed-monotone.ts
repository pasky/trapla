// QA3: does a lower design speed ever make Auto's design dearer? (D11, one bend at km 11.7; the bend's
// stretch is the whole road). Usage: npx tsx qa3/speed-monotone.ts [design.json]
import { readFileSync } from 'node:fs';
import { evaluate, type Design, type EvalContext } from '../src/core/evaluate';
import { loadPack } from '../scripts/loadpack';

const { meta, scenario, terrain, buildings, roads, junctions } = loadPack();
const ctx: EvalContext = { terrain, scenario, a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] }, buildings, roads, junctions };
const base = JSON.parse(readFileSync(process.argv[2] ?? 'qa3/designs/d11-one-bend-70.json', 'utf8')) as Design;
for (const v of [90, 80, 70]) {
  const d: Design = structuredClone(base);
  d.pis = d.pis.map(p => ({ ...p, speed: v }));
  const r = evaluate(ctx, d);
  const br = r.runs.filter(x => x.kind === 1).map(x => `${(x.s0 / 1000).toFixed(2)}–${(x.s1 / 1000).toFixed(2)}`).join(' ');
  console.log(`bend speed ${v}: ${(r.cost.total / 1e9).toFixed(3)} bn, bridges ${(r.cost.bridges / 1e6).toFixed(0)} M, earth ${(r.cost.earthworks / 1e6).toFixed(0)} M, ${r.travelMin.toFixed(2)} min, valid ${r.valid}\n   bridges at ${br}`);
}
