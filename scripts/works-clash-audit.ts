// Invariant screen: does any crossed way's drawn earthworks (ramps to a bridge over us, junction approaches,
// side-road regrades, reroutes) stand on a house that is kept, on a mapped railway, on one of our bridge's
// piers or up into our deck — with no billed remedy? What is screened is what the renderer draws
// (render/crossing-surface.ts crossingSurfaces: the 1:1.5 slopes, cut short by priced walls).
// npx tsx scripts/works-clash-audit.ts [--all] [design.json …]   (--all: every pack's starters and saved designs)
import { existsSync, readFileSync } from 'node:fs';
import { evaluate, type EvalContext, type Result } from '../src/core/evaluate';
import { loadPack, evalContext, projectContext } from './loadpack';
import { scenarioParams, PRESETS } from '../src/core/data/scenario';
import { evaluateProject } from '../src/core/project-evaluate';
import { projectContext as fullContext } from './eval-project';
import { CATEGORIES } from '../src/core/data/categories';
import { KIND } from '../src/core/structures';
import { bridgeLayout } from '../src/core/bridge';
import { protectedRasterCells } from '../src/core/protected-raster';
import { crossingBaseHeight, crossingSurfaces, groundSegment } from '../src/render/crossing-surface';

export interface WorksClash { path: string; i: number; s: number; roadId?: number; cls: string; type: string; what: 'house' | 'railway' | 'pier' | 'deck' | 'ours'; x: number; y: number; j?: number }

/** Earth this thin is the drape tolerance, not a slope (crossing-works.ts DRAPED). */
const DRAPED = 0.3;

export function worksClashes(r: Result, ctx: Pick<EvalContext, 'terrain' | 'buildings'>, crownWidth: number): WorksClash[] {
  const natural = (x: number, y: number) => ctx.terrain.heightAt(x, y), base = crossingBaseHeight(r, crownWidth, natural);
  const gone = new Set<number>([...r.demolished.map(d => d.j), ...r.boughtOut.map(d => d.j)]);
  const out: WorksClash[] = [], seen = new Set<string>();
  // our own body (its own checks own what lies under it): lateral reach per station
  /** Where (x, y) lies in our own earth body: in its formation, or on a cut / fill slope (else null). */
  const bodyAt = (x: number, y: number, inset = 0): 'formation' | 'cut' | 'fill' | null => {
    for (let i = 0; i + 1 < r.n; i++) {
      const dx = r.x[i + 1] - r.x[i], dy = r.y[i + 1] - r.y[i], len2 = dx * dx + dy * dy;
      if (Math.abs(x - r.x[i]) > 400 || Math.abs(y - r.y[i]) > 400) continue;
      const t = ((x - r.x[i]) * dx + (y - r.y[i]) * dy) / (len2 || 1);
      if (t < 0 || t > 1) continue;
      const lat = ((y - r.y[i]) * dx - (x - r.x[i]) * dy) / Math.sqrt(len2 || 1);
      const k = t < 0.5 ? i : i + 1;
      // (over a tunnel or under a bridge is no clash with our body: piers are checked on their own)
      if (r.kind[k] !== KIND.earth) continue;
      const reach = lat >= 0 ? r.dayL[k] : r.dayR[k];
      if (Math.abs(lat) > reach - inset) continue;
      if (Math.abs(lat) <= crownWidth / 2 + 1) return 'formation';
      // (dug away where the natural ground stands above our grade there)
      return ctx.terrain.heightAt(x, y) > r.grade[i] + (r.grade[i + 1] - r.grade[i]) * t ? 'cut' : 'fill';
    }
    return null;
  };
  const ours = (x: number, y: number, inset = 0) => bodyAt(x, y, inset) !== null;
  // our bridge piers and deck: per bridge station, the deck underside
  const piers: { x: number; y: number }[] = [];
  for (const run of r.runs) if (run.kind === KIND.bridge) {
    const length = run.s1 - run.s0, spans = Math.max(1, Math.round(length / bridgeLayout(length).span));
    const stations = run.pierStations ?? Array.from({ length: spans - 1 }, (_, k) => run.s0 + length * (k + 1) / spans);
    for (const s of stations) {
      const i = Math.min(r.n - 2, Math.floor(s / r.ds)), t = s / r.ds - i;
      piers.push({ x: r.x[i] + (r.x[i + 1] - r.x[i]) * t, y: r.y[i] + (r.y[i + 1] - r.y[i]) * t });
    }
  }
  for (const surface of [...crossingSurfaces(r.crossings, natural, base)]) {
    const c = surface.crossing, pathKind = surface.tie ? 'tie' : surface.link ? 'link' : 'road';
    let at = 0;
    const add = (what: WorksClash['what'], x: number, y: number, j?: number) => {
      const key = `${c.s}:${c.roadId}:${what}:${j ?? `${Math.round(x / 5)},${Math.round(y / 5)}`}`;
      if (!seen.has(key)) { seen.add(key); out.push({ path: pathKind, i: at, s: c.s, roadId: c.roadId, cls: c.cls, type: c.type, what, x, y, j }); }
    };
    const sec = surface.sections;
    for (let i = 0; i + 1 < sec.length; i++) {
      if (!groundSegment(surface, i)) continue;
      const a = sec[i], b = sec[i + 1];
      at = i;
      const raised = (q: typeof a) => Math.abs(q.edge[0].z - natural(q.edge[0].x, q.edge[0].y)) > DRAPED || Math.abs(q.edge[1].z - natural(q.edge[1].x, q.edge[1].y)) > DRAPED;
      if (!raised(a) && !raised(b)) continue;
      const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y, len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const tx = dx / len, ty = dy / len, x = (a.p.x + b.p.x) / 2, y = (a.p.y + b.p.y) / 2;
      // half-widths of the drawn body (toe to toe) on either side; the screen is the smaller of the two
      // sections' reach, so a slope only partly over a house still counts where both ends reach it
      const reach = (q: typeof a, k: 0 | 1) => Math.hypot(q.toe[k].x - q.p.x, q.toe[k].y - q.p.y);
      const left = Math.min(reach(a, 1), reach(b, 1)), right = Math.min(reach(a, 0), reach(b, 0));
      const half = Math.max(left, right);
      if (ctx.buildings) ctx.buildings.near(x, y, len / 2 + half + 5, j => {
        if (gone.has(j)) return;
        // (rectangle centred between the sections, off-centre by the side difference)
        const shift = (left - right) / 2, cx = x - ty * shift, cy = y + tx * shift;
        if (ctx.buildings!.hits(j, cx, cy, tx, ty, len / 2, (left + right) / 2) && !ours((ctx.buildings as any).ox[j], (ctx.buildings as any).oy[j])) add('house', (ctx.buildings as any).ox[j], (ctx.buildings as any).oy[j], j);
      });
      // (a quarter metre's tolerance: the walls stand at the raster cell's edge)
      protectedRasterCells(ctx.terrain, { i: 0, s: 0, x, y, tx, ty, along: len / 2, left: left - 0.25, right: right - 0.25 }, f => {
        if (f.feature === 'railway' && !ours(f.x, f.y)) add('railway', f.x, f.y);
      });
      // our own body (formation, slopes): a bridge over us and a reroute keep their slopes out of it (a junction
      // meets our road, a box's way passes through our embankment, by design)
      if (c.type === 'overbridge' || surface.link) {
        // (the slope's own height there beyond the drape tolerance: a toe grazing our slope's edge is not a body in it)
        for (const q of [a, b]) for (const k of [0, 1] as const) for (const t of [0.25, 0.5, 0.75]) {
          if (Math.abs(q.edge[k].z - natural(q.edge[k].x, q.edge[k].y)) * (1 - t) < DRAPED) continue;
          const x = q.edge[k].x + (q.toe[k].x - q.edge[k].x) * t, y = q.edge[k].y + (q.toe[k].y - q.edge[k].y) * t;
          if (Math.hypot(q.toe[k].x - q.edge[k].x, q.toe[k].y - q.edge[k].y) <= 1) continue;
          // (a fill beside our fill merges with it: one body; anything in our formation or our cut, or a cut into
          // our embankment, is not buildable as drawn)
          const body = bodyAt(x, y, 1), fill = q.edge[k].z > natural(q.edge[k].x, q.edge[k].y);
          if (body === 'formation' || body === 'cut' || (body === 'fill' && !fill)) add('ours', x, y);
        }
      }
      for (const p of piers) {
        const u = (p.x - a.p.x) * tx + (p.y - a.p.y) * ty, v = -(p.x - a.p.x) * ty + (p.y - a.p.y) * tx;
        if (u >= 0 && u <= len && (v >= 0 ? v <= left : -v <= right)) add('pier', p.x, p.y);
      }
    }
  }
  return out;
}

/** Every pack's starters (each preset's opening project), evaluated as the browser does: each route's clashes. */
export function* starterClashes(): Generator<{ name: string; result: Result; clashes: WorksClash[] }> {
  for (const preset of PRESETS) {
    const id = preset.id, dir = `public/scenarios/${id}`;
    if (!existsSync(`${dir}/meta.json`)) continue;
    const pack = loadPack(dir), sc = scenarioParams(id, preset.presetId);
    const { initial } = projectContext(pack, sc, dir), design = initial();
    const { ctx } = fullContext(design);
    const pr = evaluateProject(ctx, { epoch: 'audit', revision: 1, design });
    for (const [rid, rr] of Object.entries(pr.routes)) if (rr.legacy) {
      const spec = design.routes.find(x => x.id === rid)!.specification as { category?: string };
      yield { name: `${preset.presetId ?? id} ${rid}`, result: rr.legacy, clashes: worksClashes(rr.legacy, ctx.legacy, CATEGORIES[(spec.category ?? 'S9.5') as keyof typeof CATEGORIES]?.crownWidth ?? 9.5) };
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let total = 0;
  const report = (name: string, clashes: WorksClash[]) => {
    total += clashes.length;
    const byCrossing = new Map<string, WorksClash[]>();
    for (const c of clashes) { const k = `${Math.round(c.s)} ${c.cls} ${c.roadId} ${c.type}`; (byCrossing.get(k) ?? byCrossing.set(k, []).get(k)!).push(c); }
    console.log(`${name}: ${clashes.length} clashes${[...byCrossing].map(([k, l]) => `\n  km ${k}: ${[...new Set(l.map(c => c.what))].map(w => `${l.filter(c => c.what === w).length} ${w}`).join(', ')}`).join('')}`);
  };
  if (args.includes('--all') || !args.length) for (const { name, clashes } of starterClashes()) report(name, clashes);
  for (const file of args.filter(a => a.endsWith('.json'))) {
    const pack = loadPack(process.env.SCENARIO ? `public/scenarios/${process.env.SCENARIO}` : undefined), ctx = evalContext(pack);
    const d = JSON.parse(readFileSync(file, 'utf8')).design;
    report(file, worksClashes(evaluate(ctx, d), ctx, CATEGORIES[d.category as keyof typeof CATEGORIES]?.crownWidth ?? 9.5));
  }
  console.log(`total ${total}`);
}

/** A cut way (reroute) whose cut ends stay joined over other roads: how far round is it from one cut end to the
 * other over the mapped network, without the stretch our earthworks take and without crossing our road except
 * where a crossing carries traffic? (Infinity: not joined at all.) */
export function closureDetours(r: Result, net: { cls: string[]; ways: number[][] }) {
  const SNAP = 2, key = (x: number, y: number) => `${Math.round(x / SNAP)},${Math.round(y / SNAP)}`;
  const ids = new Map<string, number>(), xs: number[] = [], ys: number[] = [];
  const node = (x: number, y: number) => {
    const cx = Math.round(x / SNAP), cy = Math.round(y / SNAP);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const id = ids.get(`${cx + dx},${cy + dy}`);
      if (id !== undefined && Math.hypot(xs[id] - x, ys[id] - y) <= SNAP) return id;
    }
    const id = xs.length; xs.push(x); ys.push(y); ids.set(key(x, y), id); return id;
  };
  // our earthworks (only crossings carrying traffic pass them)
  const inside = (x: number, y: number) => {
    for (let i = 0; i + 1 < r.n; i++) {
      if (Math.abs(x - r.x[i]) > 300 || Math.abs(y - r.y[i]) > 300) continue;
      const dx = r.x[i + 1] - r.x[i], dy = r.y[i + 1] - r.y[i], len2 = dx * dx + dy * dy;
      const t = ((x - r.x[i]) * dx + (y - r.y[i]) * dy) / (len2 || 1);
      if (t < 0 || t > 1) continue;
      const k = t < 0.5 ? i : i + 1;
      if (r.kind[k] !== KIND.earth) continue;
      const lat = ((y - r.y[i]) * dx - (x - r.x[i]) * dy) / Math.sqrt(len2 || 1);
      if (Math.abs(lat) <= (lat >= 0 ? r.dayL[k] : r.dayR[k])) return true;
    }
    return false;
  };
  const carried = new Set(r.crossings.filter(c => ['bridge', 'tunnel', 'overbridge', 'underpass', 'junction'].includes(c.type)).map(c => c.roadId));
  const adj: [number, number][][] = [];
  const edge = (a: number, b: number, w: number) => { (adj[a] ??= []).push([b, w]); (adj[b] ??= []).push([a, w]); };
  for (let way = 0; way < net.ways.length; way++) {
    const w = net.ways[way];
    if (!w || w.length < 5) continue;
    for (let j = 1; j + 3 < w.length; j += 2) {
      const ax = w[j], ay = w[j + 1], bx = w[j + 2], by = w[j + 3], len = Math.hypot(bx - ax, by - ay);
      // split into ≤ 10 m pieces so the removed stretch and our footprint cut it where they do
      const count = Math.max(1, Math.ceil(len / 10));
      let prev = node(ax, ay);
      for (let m = 1; m <= count; m++) {
        const t = m / count, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, mx = ax + (bx - ax) * (m - 0.5) / count, my = ay + (by - ay) * (m - 0.5) / count;
        const next = node(x, y);
        if (carried.has(way) || !inside(mx, my)) edge(prev, next, len / count);
        prev = next;
      }
    }
  }
  const out: { s: number; roadId?: number; cls: string; type: string; linkLength: number; detour: number; target?: number }[] = [];
  for (const c of r.crossings) if ((c.type === 'reconnection' || c.type === 'diversion') && !c.moved && c.geometry?.removed) {
    const links = c.geometry.links ?? [[], []];
    // the two cut ends: where each link starts (on the old way), else the way's ends of the removed stretch
    const ends = links.filter(l => l.length).map(l => l[0]);
    if (ends.length < 2) continue;
    const near = (p: { x: number; y: number }) => { let best = -1, gap = Infinity; for (let i = 0; i < xs.length; i++) { const g = Math.hypot(xs[i] - p.x, ys[i] - p.y); if (g < gap && adj[i]?.length) { gap = g; best = i; } } return best; };
    const from = near(ends[0]), to = near(ends[1]);
    const dist = new Float64Array(xs.length).fill(Infinity);
    dist[from] = 0;
    const heap: [number, number][] = [[0, from]];
    while (heap.length) {
      heap.sort((a, b) => b[0] - a[0]);
      const [d, u] = heap.pop()!;
      if (d > dist[u]) continue;
      if (u === to || d > 20000) break;
      for (const [v, w] of adj[u] ?? []) if (d + w < dist[v]) { dist[v] = d + w; heap.push([d + w, v]); }
    }
    out.push({ s: c.s, roadId: c.roadId, cls: c.cls, type: c.type, linkLength: c.linkLength ?? 0, detour: dist[to], target: c.targetS });
  }
  return out;
}
