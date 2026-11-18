// Mapped road bridges and tunnels crossed by our road (a pack's structures.json, pipeline/build_structures.py): every
// one must be a crossing of its own (selectable, engineered and billed, or an existing structure kept with its
// clearance), never a gap in the crossed road. For each pack: the straight line, the mission's starter and N random
// designs (outcome-audit.ts's generator); prints each such crossing and flags what is wrong.
//   npx tsx scripts/mapped-structures-audit.ts [--random N] [--seed S] [pack …]   (default: every pack with structures.json)
// Exit 1 on a flag.
import { existsSync, readdirSync } from 'node:fs';
import { loadPack } from './loadpack';
import { evaluate, type Design } from '../src/core/evaluate';
import { CROSSING_RULES } from '../src/core/data/urban';
import { crossingOutcome } from '../src/core/terms';

const args = process.argv.slice(2);
const opt = (name: string, fallback: number) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : fallback; };
const named = args.filter((a, i) => !a.startsWith('--') && !['--random', '--seed'].includes(args[i - 1] ?? ''));
const packs = named.length ? named : readdirSync('public/scenarios').filter(d => existsSync(`public/scenarios/${d}/structures.json`)).sort();
const flags: string[] = [];
const counts: Record<string, number> = {};
for (const id of packs) {
  const pack = loadPack(`public/scenarios/${id}`), { meta, scenario, terrain, buildings, roads, junctions } = pack;
  if (!roads?.structures.size) { console.log(`\n# ${id}: no mapped structures`); continue; }
  const A = { x: meta.A.xy[0], y: meta.A.xy[1] }, B = { x: meta.B.xy[0], y: meta.B.xy[1] };
  const ctx = { terrain, scenario, buildings, roads, junctions, a: A, b: B };
  let seed = opt('--seed', 1);
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const base = scenario.initial ?? { category: 'S9.5' as const, speed: 90 };
  const designs: { name: string; design: Design }[] = [{ name: 'straight', design: { category: base.category, speed: base.speed, pis: [], profileMode: 'auto', vpis: [] } }];
  if (scenario.initial?.pis?.length) designs.push({ name: 'starter', design: { category: base.category, speed: base.speed, pis: scenario.initial.pis, profileMode: 'auto', vpis: [] } });
  for (let k = 0; k < opt('--random', 6); k++) {
    const count = 2 + Math.floor(rand() * 7), dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy);
    const pis = Array.from({ length: count }, (_, j) => {
      const t = (j + 0.5 + (rand() - 0.5) * 0.6) / count, off = (rand() - 0.5) * 3000;
      return { x: Math.round(A.x + dx * t - dy / len * off), y: Math.round(A.y + dy * t + dx / len * off), r: null };
    });
    designs.push({ name: `random-${k}`, design: { category: base.category, speed: base.speed, pis, profileMode: 'auto', vpis: [] } });
  }
  console.log(`\n# ${id}: ${roads.structures.size} mapped structures`);
  for (const { name, design } of designs) {
    let r;
    try { r = evaluate(ctx, design); } catch (e) { console.log(`  ${name}: ${(e as Error).message}`); continue; }
    // every hit of our line on a mapped bridge or tunnel, and the crossing that owns it
    const hits = roads.intersections(r.n, r.s, r.x, r.y).filter(h => roads.structure(h.way) && roads.structure(h.way)!.kind !== 'covered');
    const lines: string[] = [];
    for (const h of hits) {
      const own = r.crossings.find(c => c.roadId === h.way && Math.abs(c.s - h.s) <= CROSSING_RULES.sameWayMergeDistance)
        ?? r.crossings.find(c => Math.abs(c.s - h.s) <= CROSSING_RULES.mergeDistance);
      const fp = r.footprintConflicts.find(f => f.roadId === h.way);
      const kind = roads.structure(h.way)!.kind;
      if (!own && !fp) { flags.push(`${id} ${name}: km ${(h.s / 1000).toFixed(3)} mapped ${kind} way ${h.way} (${h.cls}) has no crossing`); continue; }
      if (!own) { lines.push(`    km ${(h.s / 1000).toFixed(3)} ${kind} ${h.cls} way ${h.way}: under our works (${fp!.action})`); continue; }
      const label = crossingOutcome(own).label;
      const key = `${kind}:${own.roadId === h.way ? own.type : 'merged'}${own.kept ? ' kept' : ''}`;
      counts[key] = (counts[key] ?? 0) + 1;
      lines.push(`    km ${(h.s / 1000).toFixed(3)} ${kind} ${h.cls} way ${h.way}: ${own.roadId === h.way ? '' : `merged into way ${own.roadId} · `}${own.type}${own.kept ? ' KEPT' : ''} h=${own.h.toFixed(1)} cost ${(own.cost / 1e6).toFixed(2)} M · "${label}"${own.issues?.length ? ` ISSUES: ${own.issues.map(v => v.title).join('; ')}` : ''}`);
      if (own.roadId === h.way && own.kept && own.cost !== 0) flags.push(`${id} ${name}: km ${(h.s / 1000).toFixed(3)} kept structure billed ${own.cost}`);
      if (own.roadId === h.way && own.kept && !own.geometry?.road?.length) flags.push(`${id} ${name}: km ${(h.s / 1000).toFixed(3)} kept structure not drawn`);
      if (own.roadId === h.way && !own.kept && own.type === 'atGrade') flags.push(`${id} ${name}: km ${(h.s / 1000).toFixed(3)} mapped ${kind} left at grade`);
    }
    console.log(`  ${name}: ${(r.cost.total / 1e9).toFixed(3)} bn ${r.valid ? 'VALID' : 'INVALID'}, ${hits.length} mapped structure hits`);
    for (const l of lines) console.log(l);
  }
}
console.log('\n## Outcomes'); for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${k}: ${v}`);
console.log(`\n## Flags (${flags.length})`); for (const f of flags) console.log(`  ${f}`);
process.exit(flags.length ? 1 : 0);
