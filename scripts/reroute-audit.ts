// Independent check of every automatic reroute (the new road of a cut crossed road), as built:
// its own grade along the ground (or its engineered profile), and what it runs across.
// npx tsx scripts/reroute-audit.ts [--straight] [--random N] [--seed S] [scripts/foo-design.json ...]
import { readFileSync } from 'node:fs';
import { loadPack } from './loadpack';
import { evaluate, type Design } from '../src/core/evaluate';
import { ROAD_CLASSES } from '../src/core/data/urban';
import { protectedRasterCells } from '../src/core/protected-raster';
import { clipFootprint } from '../src/core/footprint-geometry';

const { meta, terrain, scenario, buildings, roads } = loadPack(process.env.PACK);
const A = { x: meta.A.xy[0], y: meta.A.xy[1] }, B = { x: meta.B.xy[0], y: meta.B.xy[1] };
const ctx = { terrain, scenario, buildings, roads, a: A, b: B };
const args = process.argv.slice(2);
const opt = (name: string, fallback: number) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : fallback; };
const files = args.filter((a, i) => a.endsWith('.json') && !['--random', '--seed'].includes(args[i - 1] ?? ''));
let seed = opt('--seed', 1);
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const designs: { name: string; design: Design }[] = [];
if (!files.length || args.includes('--straight'))
  designs.push({ name: 'straight', design: { category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] } });
for (const file of files) designs.push({ name: file, design: JSON.parse(readFileSync(file, 'utf8')).design });
for (let k = 0; k < opt('--random', 0); k++) {
  const count = 2 + Math.floor(rand() * 7), dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy);
  const pis = Array.from({ length: count }, (_, j) => {
    const t = (j + 0.5 + (rand() - 0.5) * 0.6) / count, off = (rand() - 0.5) * 3000;
    return { x: Math.round(A.x + dx * t - dy / len * off), y: Math.round(A.y + dy * t + dx / len * off), r: null };
  });
  designs.push({ name: `random-${k}`, design: { category: rand() < 0.3 ? 'S7.5' : 'S9.5', speed: rand() < 0.5 ? 80 : 90, pis, profileMode: 'auto', vpis: [] } });
}

const total: Record<string, number> = {};
const count = (k: string) => { total[k] = (total[k] ?? 0) + 1; };
for (const { name, design } of designs) {
  const r = evaluate(ctx, design);
  const gone = new Set(r.demolished.map(b => b.j));
  for (const c of r.crossings) {
    if ((c.type !== 'reconnection' && c.type !== 'diversion') || !c.geometry?.links) continue;
    const row = ROAD_CLASSES[c.cls], half = c.geometry.width / 2;
    // it must lead to a crossing that carries traffic over or under us (or a route end), not another cut road
    const target = r.crossings.find(t => t !== c && t.s === c.targetS && t.roadId === c.targetRoadId);
    if (target && (target.type === 'reconnection' || target.type === 'diversion') && !c.requestedType) {
      count('leads to another cut road');
      console.log(`${name}: km ${(c.s / 1000).toFixed(3)} ${c.type}/${c.cls} way ${c.roadId} leads to km ${(target.s / 1000).toFixed(3)} ${target.type} way ${target.roadId}`);
    }
    c.geometry.links.forEach((link, k) => {
      if (link.length < 2) return;
      count('links');
      const found = new Set<string>();
      // grade of the built surface over every 20 m (the drawn z: ground, or an engineered profile)
      const d = [0];
      for (let i = 1; i < link.length; i++) d.push(d[i - 1] + Math.hypot(link[i].x - link[i - 1].x, link[i].y - link[i - 1].y));
      let steepest = 0;
      for (let i = 0, j = 0; i < link.length; i++) {
        while (j < link.length && d[j] - d[i] < 20) j++;
        if (j === link.length) break;
        steepest = Math.max(steepest, Math.abs(link[j].z - link[i].z) / (d[j] - d[i]));
      }
      // the class's ordinary gradient, or its justified-case maximum where the reroute says it needed it
      const limit = c.linkGrade ?? row.rampGradient;
      // (1 point of slack: the drawn surface follows ground bumps between the 5 m profile samples)
      if (steepest > limit + 0.015) found.add(`steeper than ${Math.round(limit * 100)} % (${(steepest * 100).toFixed(0)} %)`);
      const depth = Math.max(...link.map(p => Math.abs(p.z - p.ground)));
      if (depth > 10.01) found.add(`earthworks ${depth.toFixed(1)} m`);
      for (let i = 1; i < link.length; i++) {
        const p = link[i - 1], q = link[i], len = Math.hypot(q.x - p.x, q.y - p.y);
        if (len < 1e-6) continue;
        const cell = { i: 0, s: 0, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, tx: (q.x - p.x) / len, ty: (q.y - p.y) / len, along: len / 2, left: half, right: half };
        protectedRasterCells(terrain, cell, f => { if (f.feature !== 'stream') found.add(f.feature); });
        terrain.watercourses?.nearSegments([Math.min(p.x, q.x) - 5, Math.min(p.y, q.y) - 5, Math.max(p.x, q.x) + 5, Math.max(p.y, q.y) + 5], s => {
          if (clipFootprint(s, cell)) found.add(`stream ${s.reach.id}`);
        });
        buildings.near(cell.x, cell.y, len / 2 + half + 5, j => { if (!gone.has(j) && buildings.hits(j, cell.x, cell.y, cell.tx, cell.ty, len / 2, half)) found.add('building'); });
        roads?.nearSegments([Math.min(p.x, q.x), Math.min(p.y, q.y), Math.max(p.x, q.x), Math.max(p.y, q.y)], s => {
          if (ROAD_CLASSES[s.cls]?.noAtGrade && clipFootprint(s, cell)) found.add('motorway');
        });
      }
      const streams = [...found].filter(f => f.startsWith('stream')).length;
      const culverts = c.culverts ?? 0;
      for (const f of found) count(f.startsWith('stream') ? 'stream crossings' : f.replace(/ \(.*\)| \d.*/, ''));
      const problems = [...found].filter(f => !f.startsWith('stream'));
      const reported = !!c.issues?.length;
      if (problems.length || (streams && !culverts)) count(reported ? 'links with a problem (reported as a violation)' : 'links with a problem (unreported)');
      if (problems.length && !reported) console.log(`${name}: km ${(c.s / 1000).toFixed(3)} ${c.type}/${c.cls} way ${c.roadId} link ${k}: ${[...found].join(', ')}${c.issues?.length ? ' [has issues]' : ''}`);
    });
  }
}
console.log('\n## Totals'); for (const [k, v] of Object.entries(total).sort()) console.log(`  ${k}: ${v}`);
