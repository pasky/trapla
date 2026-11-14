// Footprint conflict report. Optional PACK=/path/to/scenario selects an explicit data snapshot.
// npx tsx scripts/footprint-audit.ts scripts/*-design.json
import { readFileSync } from 'node:fs';
import { loadPack } from './loadpack';
import { evaluate, type Design } from '../src/core/evaluate';
import { surchargeRate } from '../src/core/cost';
const { meta, terrain, scenario, buildings, roads } = loadPack(process.env.PACK);
const ctx = { terrain, scenario, buildings, roads, a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] } };
for (const file of process.argv.slice(2)) {
  const d: Design = JSON.parse(readFileSync(file, 'utf8')).design;
  const r = evaluate(ctx, d), groups: Record<string, { count: number; affectedM: number; builtM: number; cost: number; withSurcharge: number }> = {};
  for (const c of r.footprintConflicts) {
    const key = `${c.feature}/${c.action}`, g = groups[key] ??= { count: 0, affectedM: 0, builtM: 0, cost: 0, withSurcharge: 0 };
    g.count++; g.affectedM += c.affectedLength ?? c.length; g.builtM += c.cost ? c.length : 0;
    g.cost += c.cost; g.withSurcharge += c.cost * (1 + surchargeRate(r.cell.urban[c.i]));
  }
  const sum = Object.values(r.parts).reduce((s, values) => s + values.reduce((a, b) => a + b, 0), 0);
  console.log(JSON.stringify({ file, valid: r.valid, violations: r.violations.length, footprintViolations: r.violations.filter(v => v.kind === 'footprint').length,
    total: r.cost.total, partsError: sum - r.cost.total, groups,
    ...(process.env.DETAIL ? { conflicts: r.footprintConflicts.map(({ geometry, original, ...c }) => c) } : {}) }));
}
