// Independent screen: do a crossing's raised/lowered stretches (junction approaches, ramps to a bridge
// over us) still put earth on OTHER mapped roads? A rough circle test (|z - ground| × 1.5 beyond the
// half-width, cut short by retaining walls), so it over-reports at ramp ends and at junction mouths;
// roads regraded as ties or handled by our own footprint works are skipped (crossing-works.ts).
// npx tsx scripts/crossing-footprint-audit.ts [--straight] [--random N] [--seed S] [--dump DIR] [scripts/foo-design.json ...]
import { readFileSync, writeFileSync } from 'node:fs';
import { loadPack } from './loadpack';
import { evaluate, type Design } from '../src/core/evaluate';
import { ROAD_CLASSES } from '../src/core/data/urban';
import type { CrossingPoint } from '../src/core/crossings';

const { meta, terrain, scenario, buildings, roads } = loadPack(process.env.PACK);
const A = { x: meta.A.xy[0], y: meta.A.xy[1] }, B = { x: meta.B.xy[0], y: meta.B.xy[1] };
const ctx = { terrain, scenario, buildings, roads, a: A, b: B };
const args = process.argv.slice(2);
const opt = (name: string, fallback: number) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : fallback; };
const files = args.filter((a, i) => a.endsWith('.json') && !['--random', '--seed', '--dump'].includes(args[i - 1] ?? ''));
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

const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
let total = 0;
const dump = args.includes('--dump') ? args[args.indexOf('--dump') + 1] : undefined;
if (dump) for (const { name, design } of designs) writeFileSync(`${dump}/${name.replace(/[/]/g, '_')}.json`, JSON.stringify({ design }));
for (const { name, design } of designs) {
  const r = evaluate(ctx, design);
  for (const c of r.crossings) {
    const g = c.geometry; if (!g || !roads) continue;
    const source = roads.connectedCrossingPath(c.roadId!, c.x, c.y, 2000);
    const onSource = (x: number, y: number) => source.some((q, i) => i > 0 && segDist(x, y, source[i - 1].x, source[i - 1].y, q.x, q.y) < 0.5);
    const paths: [string, CrossingPoint[]][] = [...(g.road ? [['road', g.road] as [string, CrossingPoint[]]] : []), ...(g.links ?? []).map((l, k) => [`link${k}`, l] as [string, CrossingPoint[]])];
    const hits = new Map<string, { way: number; cls: string; at: CrossingPoint; over: number; raised: number; path: string; endGap: number }>();
    for (const [label, path] of paths) for (let i = 0; i < path.length; i++) {
      const q = path[i], dz = Math.abs(q.z - q.ground);
      if (dz <= 0.3 || q.surface === 'deck') continue;
      const reach = g.width / 2 + (dz > 0.15 ? dz * 1.5 : 0);
      // a retaining wall cuts the slope short on its side (the larger offset bounds the query)
      const half = q.wall ? Math.max(...q.wall.map(o => o ?? reach)) : reach;
      roads.nearSegments([q.x - half - 10, q.y - half - 10, q.x + half + 10, q.y + half + 10], s => {
        if (s.way === c.roadId) return;
        if (onSource(s.ax, s.ay) && onSource(s.bx, s.by)) return;
        if (g.ties?.some(t => t.way === s.way)) return; // regraded to meet the approach
        if (r.footprintConflicts.some(f => f.roadId === s.way)) return; // under our own earthworks: the main footprint check
        const other = ROAD_CLASSES[s.cls].width / 2, d = segDist(q.x, q.y, s.ax, s.ay, s.bx, s.by);
        const over = half + other - d;
        if (over <= 0) return;
        const endGap = Math.min(Math.hypot(q.x - path[0].x, q.y - path[0].y), Math.hypot(q.x - path[path.length - 1].x, q.y - path[path.length - 1].y));
        const key = `${label}:${s.way}`, prev = hits.get(key);
        if (!prev || over > prev.over) hits.set(key, { way: s.way, cls: s.cls, at: q, over, raised: q.z - q.ground, path: label, endGap });
      });
    }
    for (const h of hits.values()) {
      total++;
      console.log(`${name}: km ${(c.s / 1000).toFixed(3)} ${c.type}/${c.cls} way ${c.roadId} ${h.path} over ${h.cls} way ${h.way} by ${h.over.toFixed(1)} m `
        + `(raised ${h.raised.toFixed(1)} m, ${h.endGap.toFixed(0)} m from path end) at ${h.at.x.toFixed(0)},${h.at.y.toFixed(0)}${c.issues?.length ? ' [has issues]' : ''}`);
    }
  }
}
console.log(`${total} crossing works over other roads`);
