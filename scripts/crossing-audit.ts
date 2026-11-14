// Streaming elevation/clearance audit of every saved design. No mesh or Cartesian-product arrays.
// node --max-old-space-size=2048 --import tsx scripts/crossing-audit.ts [scripts/foo-design.json ...]
import { readFileSync, readdirSync } from 'node:fs';
import { auditCrossingGeometry } from '../src/core/crossings';
import { D11_SCENARIO } from '../src/core/data/scenario';
import { evaluate } from '../src/core/evaluate';
import { KIND } from '../src/core/structures';
import { loadPack } from './loadpack';

const { meta, terrain, buildings, roads } = loadPack();
const ctx = { terrain, buildings, roads, scenario: D11_SCENARIO,
  a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] } };
const args = process.argv.slice(2), strict = args.includes('--strict');
const selected = args.filter(arg => arg !== '--strict');
const files = selected.length ? selected
  : readdirSync('scripts').filter(name => name.endsWith('-design.json')).sort().map(name => `scripts/${name}`);
let failures = 0, infeasible = 0, crossings = 0;
for (const file of files) {
  const r = evaluate(ctx, JSON.parse(readFileSync(file, 'utf8')).design);
  const issues = auditCrossingGeometry(r.crossings, { ...r, width: r.cell.width,
    left: Float64Array.from(r.kind, (kind, i) => kind === KIND.earth ? r.dayL[i] : r.cell.width[i] / 2),
    right: Float64Array.from(r.kind, (kind, i) => kind === KIND.earth ? r.dayR[i] : r.cell.width[i] / 2),
  }, (x, y) => terrain.heightAt(x, y), roads);
  const errors = issues.filter(v => v.severity === 'error').length, constraints = issues.length - errors;
  crossings += r.crossings.length; failures += errors; infeasible += constraints;
  console.log(`${file}: ${r.crossings.length} crossings, ${errors} geometry errors, ${constraints} infeasible constraints (${r.valid ? 'VALID' : 'INVALID'} design)`);
  for (const v of issues) console.log(`  ${v.severity.toUpperCase()} km ${(v.s / 1000).toFixed(3)} way ${v.roadId}: ${v.message}`);
}
console.log(`${files.length} designs, ${crossings} crossings: ${failures} geometry errors, ${infeasible} blocking design constraints`);
process.exitCode = failures || (strict && infeasible) ? 1 : 0;
