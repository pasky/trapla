// Bounded validity-first local refinement; does not erase controls, change category/speed,
// add PIs or move any saved PI by >200 m. Writes only VALID outputs when --write is explicit.
// PACK=/path/to/d11 npx tsx scripts/repair-designs.ts --budget=400 [--write] scripts/*-design.json
import { readFileSync, writeFileSync } from 'node:fs';
import { evaluate, type Design, type Result } from '../src/core/evaluate';
import { COST_MODEL_VERSION } from '../src/core/data/prices';
import { loadPack } from './loadpack';
const args = process.argv.slice(2), budget = Number(args.find(a => a.startsWith('--budget='))?.split('=')[1] ?? 400);
const files = args.filter(a => !a.startsWith('--'));
const { meta, terrain, scenario, buildings, roads } = loadPack(process.env.PACK);
const ctx = { terrain, scenario, buildings, roads, a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] } };
const hard = (r: Result) => r.violations.filter(v => v.kind !== 'footprint' && v.kind !== 'structure').length;
const severity = (r: Result) => r.violations.reduce((sum, v) => sum + (v.kind === 'structure'
  ? 100 * Number(v.fix.match(/by at least ([\d.]+) m/)?.[1] ?? 1) : Math.max(1, v.s1 - v.s0)), 0);
const score = (r: Result) => hard(r) * 1e15 + r.violations.length * 1e12 + severity(r) * 1e7 + r.cost.total;
for (const file of files) {
  const saved = JSON.parse(readFileSync(file, 'utf8')), original: Design = structuredClone(saved.design);
  let design = structuredClone(original), result = evaluate(ctx, design), best = score(result), used = 0, round = 0;
  console.log(JSON.stringify({ file, stage: 'before', valid: result.valid, cost: result.cost.total, issues: result.violations.map(v => [v.kind, v.s0, v.title]) }));
  const before = result.cost.total;
  while (!result.valid && used < budget && design.pis.length) {
    const violation = result.violations[round % result.violations.length];
    const index = Math.max(0, Math.min(result.n - 1, Math.round((violation.s0 + violation.s1) / 2 / result.ds)));
    const x = result.x[index], y = result.y[index], tx = result.tx[index], ty = result.ty[index];
    const nearest = design.pis.map((p, i) => ({ i, distance: Math.hypot(p.x - x, p.y - y) })).sort((a, b) => a.distance - b.distance).slice(0, 3);
    const step = [8, 20, 45, 90, 160][Math.floor(round / Math.max(1, result.violations.length)) % 5];
    let improved = false;
    for (const { i } of nearest) for (const [dx, dy] of [[-ty, tx], [ty, -tx], [tx, ty], [-tx, -ty], [(-ty + tx) / Math.SQRT2, (tx + ty) / Math.SQRT2], [(ty - tx) / Math.SQRT2, (-tx - ty) / Math.SQRT2]]) {
      if (used >= budget || result.valid) break;
      const candidate = structuredClone(design);
      candidate.pis[i].x = Math.round(candidate.pis[i].x + dx * step); candidate.pis[i].y = Math.round(candidate.pis[i].y + dy * step);
      if (Math.hypot(candidate.pis[i].x - original.pis[i].x, candidate.pis[i].y - original.pis[i].y) > 200) continue;
      const r = evaluate(ctx, candidate), value = score(r); used++;
      if (value < best) {
        design = candidate; result = r; best = value; improved = true;
        console.log(JSON.stringify({ file, evaluation: used, issues: r.violations.length, hard: hard(r), cost: r.cost.total }));
      }
    }
    round++;
    if (improved && !result.valid) round %= Math.max(1, result.violations.length);
  }
  if (result.valid) {
    design.vpis = design.profileMode === 'auto' ? [] : design.vpis;
    const output = { ...saved, design, costModelVersion: COST_MODEL_VERSION };
    const target = args.includes('--write') ? file : `/tmp/repaired-${file.split('/').at(-1)}`;
    writeFileSync(target, JSON.stringify(output) + '\n');
  }
  console.log(JSON.stringify({ file, stage: 'after', evaluations: used, valid: result.valid, cost: result.cost.total, delta: result.cost.total - before,
    movedPIs: design.pis.map((p, i) => ({ i, metres: Math.hypot(p.x - original.pis[i].x, p.y - original.pis[i].y) })).filter(p => p.metres > 0),
    issues: result.violations.map(v => ({ kind: v.kind, s: v.s0, title: v.title, fix: v.fix })) }));
}
