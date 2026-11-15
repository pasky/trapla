// Crossing / footprint outcome audit: every crossing treatment and footprint remedy with its
// geometry stats (ramp, link, box lengths, costs), every violation, and absurdity flags.
// npx tsx scripts/outcome-audit.ts [--random N] [--seed S] [--quiet] [scripts/foo-design.json ...]
import { readFileSync } from 'node:fs';
import { loadPack } from './loadpack';
import { evaluate, type Design } from '../src/core/evaluate';
import { crossingPlanLength } from '../src/core/crossings';
import { ROAD_CLASSES } from '../src/core/data/urban';
import { violationText } from '../src/core/checks';

const { meta, terrain, scenario, buildings, roads } = loadPack(process.env.PACK);
const A = { x: meta.A.xy[0], y: meta.A.xy[1] }, B = { x: meta.B.xy[0], y: meta.B.xy[1] };
const ctx = { terrain, scenario, buildings, roads, a: A, b: B };
const args = process.argv.slice(2);
const opt = (name: string, fallback: number) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : fallback; };
const quiet = args.includes('--quiet');
const files = args.filter((a, i) => a.endsWith('.json') && !['--random', '--seed'].includes(args[i - 1] ?? ''));
let seed = opt('--seed', 1);
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

const designs: { name: string; design: Design }[] = [];
if (!files.length || args.includes('--straight'))
  designs.push({ name: 'straight', design: { category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] } });
for (const file of files) designs.push({ name: file, design: JSON.parse(readFileSync(file, 'utf8')).design });
for (let k = 0; k < opt('--random', 0); k++) {
  // Random bends: 2–8 PIs offset up to ±1.5 km from the A–B line, monotone along it.
  const count = 2 + Math.floor(rand() * 7), dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy);
  const pis = Array.from({ length: count }, (_, j) => {
    const t = (j + 0.5 + (rand() - 0.5) * 0.6) / count, off = (rand() - 0.5) * 3000;
    return { x: Math.round(A.x + dx * t - dy / len * off), y: Math.round(A.y + dy * t + dx / len * off), r: null };
  });
  designs.push({ name: `random-${k}`, design: { category: rand() < 0.3 ? 'S7.5' : 'S9.5', speed: rand() < 0.5 ? 80 : 90, pis, profileMode: 'auto', vpis: [] } });
}

const flags: string[] = [];
const summary: Record<string, number> = {};
for (const { name, design } of designs) {
  const t0 = performance.now();
  const r = evaluate(ctx, design);
  const ms = performance.now() - t0;
  console.log(`\n## ${name}: ${(r.cost.total / 1e9).toFixed(6)} bn, ${r.valid ? 'VALID' : 'INVALID'}, ${r.violations.length} violations, ${ms.toFixed(0)} ms`);
  for (const c of r.crossings) {
    const g = c.geometry;
    const ramps = g?.approaches && g.road ? g.approaches.map(a => crossingPlanLength(g.road!.slice(a.start, a.end + 1))) : [];
    const rise = g?.deck && g.road ? Math.max(...g.road.map(q => q.z - q.ground)) : undefined;
    const links = g?.links?.map(l => crossingPlanLength(l)) ?? [];
    const key = `${c.type}/${c.cls}`; summary[key] = (summary[key] ?? 0) + 1;
    const line = `  km ${(c.s / 1000).toFixed(3)} ${c.cls} way ${c.roadId} ${c.type} h=${c.h.toFixed(1)} cost ${(c.cost / 1e6).toFixed(2)} M`
      + (c.span !== undefined ? ` span ${c.span.toFixed(1)}` : '')
      + (ramps.length ? ` ramps ${ramps.map(v => v.toFixed(0)).join('+')} m` : '')
      + (rise !== undefined ? ` max fill ${rise.toFixed(1)} m` : '')
      + (links.length ? ` links ${links.map(v => v.toFixed(0)).join('+')} m → km ${((c.targetS ?? 0) / 1000).toFixed(2)}` : '')
      + (c.underpassLength ? ` box ${c.underpassLength.toFixed(1)} m` : '')
      + (c.issues?.length ? ` ISSUES: ${c.issues.map(v => v.title).join('; ')}` : '');
    if (!quiet || c.issues?.length) console.log(line);
    if (ramps.some(v => v > 250)) flags.push(`${name}: ramp > 250 m: ${line.trim()}`);
    if (links.reduce((a, b) => a + b, 0) > 1000) flags.push(`${name}: link > 1 km: ${line.trim()}`);
  }
  for (const f of r.footprintConflicts) {
    const g = f.geometry;
    const ramps = g?.approaches && g.road ? g.approaches.map(a => crossingPlanLength(g.road!.slice(a.start, a.end + 1))) : [];
    const line = `  FP km ${(f.s0 / 1000).toFixed(3)} ${f.feature}/${f.action} ${f.cls ?? ''} way ${f.roadId ?? '-'} len ${f.length.toFixed(1)} aff ${(f.affectedLength ?? 0).toFixed(1)} cost ${(f.cost / 1e6).toFixed(2)} M`
      + (ramps.length ? ` ramps ${ramps.map(v => v.toFixed(0)).join('+')}` : '');
    const key = `fp:${f.feature}/${f.action}`; summary[key] = (summary[key] ?? 0) + 1;
    if (!quiet || f.action === 'blocked') console.log(line + (f.action === 'blocked' ? `  ${f.detail}` : ''));
  }
  for (const v of r.violations) {
    console.log(`  V [${v.kind}/${v.basis}] km ${(v.s0 / 1000).toFixed(2)}: ${violationText(v)}${v.detail ? ` | ${v.detail}` : ''}`);
    if (v.kind === 'footprint' || v.kind === 'crossing') flags.push(`${name}: ${v.kind} violation km ${(v.s0 / 1000).toFixed(2)}: ${v.title}`);
  }
}
console.log('\n## Outcome counts'); for (const [k, v] of Object.entries(summary).sort()) console.log(`  ${k}: ${v}`);
console.log(`\n## Flags (${flags.length})`); for (const f of flags) console.log(`  ${f}`);
void ROAD_CLASSES;
