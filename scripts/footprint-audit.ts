// Footprint conflict report. Optional PACK=/path/to/scenario selects an explicit data snapshot.
// npx tsx scripts/footprint-audit.ts --straight scripts/*-design.json
import { readFileSync } from 'node:fs';
import { loadPack } from './loadpack';
import { evaluate, type Design } from '../src/core/evaluate';
import { surchargeRate } from '../src/core/cost';
const { meta, terrain, scenario, buildings, roads } = loadPack(process.env.PACK);
const ctx = { terrain, scenario, buildings, roads, a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] } };
for (const file of process.argv.slice(2)) {
  const d: Design = file === '--straight' ? { category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] }
    : JSON.parse(readFileSync(file, 'utf8')).design;
  const r = evaluate(ctx, d), groups: Record<string, { count: number; affectedM: number; builtM: number; cost: number; withSurcharge: number }> = {};
  for (const c of r.footprintConflicts) {
    const key = `${c.feature}/${c.action}`, g = groups[key] ??= { count: 0, affectedM: 0, builtM: 0, cost: 0, withSurcharge: 0 };
    g.count++; g.affectedM += c.affectedLength ?? c.length; g.builtM += c.cost ? c.length : 0;
    g.cost += c.cost; g.withSurcharge += c.cost + (c.cost - (c.landCost ?? 0) - (c.lumpCost ?? 0)) * surchargeRate(r.cell.urban[c.i]);
  }
  const sum = Object.values(r.parts).reduce((s, values) => s + values.reduce((a, b) => a + b, 0), 0);
  console.log(JSON.stringify({ file, valid: r.valid, violations: r.violations.length, footprintViolations: r.violations.filter(v => v.kind === 'footprint').length,
    total: r.cost.total, partsError: sum - r.cost.total, groups,
    remedies: { wallFaces: r.retainingWalls.length, wallArea: r.retainingWalls.reduce((a, w) => a + w.area, 0),
      wallLength: r.retainingWalls.reduce((a, w) => a + w.s1 - w.s0, 0), wallCost: r.retainingWalls.reduce((a, w) => a + w.cost, 0),
      wetWallMaxHeight: r.retainingWalls.reduce((h, w) => w.watertight ? Math.max(h, w.height) : h, 0),
      supportRuns: r.runs.filter(run => run.pierStations !== undefined).length,
      maxAdjustedSpan: r.runs.reduce((h, run) => Math.max(h, run.layout?.span ?? 0), 0),
      bridgeLength: r.quantities.bridgeLength, tunnelLength: r.quantities.tunnelLength },
    ...(process.env.WALLS ? { walls: r.retainingWalls } : {}),
    ...(process.env.DETAIL ? { conflicts: r.footprintConflicts.map(({ geometry, original, originals, ...c }) => c), issues: r.violations, timing: r.timing } : {}) }));
}
