// Reproducible watercourse decisions; pass one or more saved {design: ...} files.
import { readFileSync } from 'node:fs';
import { PART_KEYS } from '../src/core/cost';
import { evaluate } from '../src/core/evaluate';
import { loadPack } from './loadpack';

const { meta, terrain, buildings, roads, scenario } = loadPack();
const ctx = { terrain, buildings, roads, scenario,
  a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] } };
for (const f of process.argv.slice(2)) {
  const r = evaluate(ctx, JSON.parse(readFileSync(f, 'utf8')).design);
  const sum = PART_KEYS.reduce((s, k) => s + r.parts[k].reduce((a, b) => a + b, 0), 0);
  if (!Number.isFinite(sum) || Math.abs(sum - r.cost.total) > 0.01) throw new Error('Parts sum mismatch');
  console.log(`\n## ${f}: ${r.valid ? 'VALID' : 'INVALID'}, ${(r.cost.total / 1e9).toFixed(4)} bn CZK; parts Δ ${(sum - r.cost.total).toFixed(6)} CZK`);
  console.log('| km | OSM way / type | local x,y m | catchment km² | est. Q100 m³/s | choice / opening | length m | item M CZK | fill m |');
  console.log('|---:|---|---|---:|---:|---|---:|---:|---:|');
  for (const c of r.waterCrossings) console.log(`| ${(c.s / 1000).toFixed(3)} | ${c.id} / ${c.waterKind} | ${c.x.toFixed(0)},${c.y.toFixed(0)} | ${c.catchmentKm2.toFixed(3)}${c.truncated ? '*' : ''} | ${c.q100.toFixed(2)} | ${c.structure} / ${c.opening} | ${c.length.toFixed(1)} | ${(c.cost / 1e6).toFixed(3)} | ${(r.grade[c.i] - r.ground[c.i]).toFixed(1)} |`);
  console.log('\n* incomplete catchment; Q proxy doubled, not a statistical bound. Costs before surcharge; bridge cost = associated run divided equally among its watercourse crossings (not an extra charge). Opening is the required screening opening, not the priced bridge span.');
  for (const v of r.violations) console.log(`- km ${(v.s0 / 1000).toFixed(3)}: ${v.title} — ${v.fix}`);
}
