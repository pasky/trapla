// Invariant screen: does any crossed way's drawn earthworks (ramps to a bridge over us, junction approaches,
// side-road regrades, reroutes) stand on a house left standing or within its working strip (BUILDING_RULES.clearance,
// as our road's), on a mapped railway, on one of our bridge's piers or up into our deck — with no billed remedy?
// Also the turning areas at cut roads' ends and roads moved aside against houses, with the strip. What is screened is what the renderer draws
// (render/crossing-surface.ts crossingSurfaces: the 1:1.5 slopes, cut short by priced walls).
// npx tsx scripts/works-clash-audit.ts [--all] [design.json …]   (--all: every pack's starters and saved designs; ONLY=<pack ids>)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Result } from '../src/core/evaluate';
import type { ProjectDesign } from '../src/core/project';
import { playerEdits } from './works-clash-edits';
import { loadPack, projectContext } from './loadpack';
import { scenarioParams, PRESETS } from '../src/core/data/scenario';
import { evaluateProject } from '../src/core/project-evaluate';
import { projectContext as fullContext } from './eval-project';
import { KIND } from '../src/core/structures';
import { worksClashes, type WorksClash } from '../src/core/works-clash';

export { worksClashes, type WorksClash };

/** Every pack's starters (each preset's opening project), evaluated as the browser does: each route's clashes. */
export function* starterClashes(): Generator<{ name: string; preset: string; result: Result; clashes: WorksClash[] }> {
  // ONLY=<pack ids, comma-separated>: only those packs' starters
  const only = process.env.ONLY?.split(',');
  for (const preset of PRESETS) {
    const id = preset.id, dir = `public/scenarios/${id}`;
    if (only && !only.includes(id)) continue;
    if (!existsSync(`${dir}/meta.json`)) continue;
    const pack = loadPack(dir), sc = scenarioParams(id, preset.presetId);
    const { initial } = projectContext(pack, sc, dir), design = initial();
    const { ctx } = fullContext(design);
    const pr = evaluateProject(ctx, { epoch: 'audit', revision: 1, design });
    for (const [rid, rr] of Object.entries(pr.routes)) if (rr.legacy)
      yield { name: `${preset.presetId ?? id} ${rid}`, preset: preset.presetId ?? id, result: rr.legacy, clashes: worksClashes(rr.legacy, ctx.legacy) };
  }
}

/** A clash's key: the mission, the crossing (or a road's own body) and what it stands on (no km: an edit elsewhere moves
 * stations a little). */
export const clashKey = (preset: string, c: WorksClash) => `${preset} ${c.cls}:${c.roadId ?? ''} ${c.type} ${c.what}:${c.way ?? ''}`;
/** Auto's own clashes on the starters, known and open (PLAN.md "One screen for every earthwork"): the screen does not
 * fail on these; anything else, on a starter or after a player's edit, fails the gate. */
export const KNOWN_FILE = 'scripts/works-clash/known.json';
export const known = (): Record<string, number> => existsSync(KNOWN_FILE) ? JSON.parse(readFileSync(KNOWN_FILE, 'utf8')).clashes : {};
/** What of these clashes (one project's routes) the known list does not cover. */
export function unknownClashes(preset: string, clashes: WorksClash[], list = known()): WorksClash[] {
  const count = new Map<string, WorksClash[]>();
  for (const c of clashes) { const k = clashKey(preset, c); (count.get(k) ?? count.set(k, []).get(k)!).push(c); }
  // (a known key covers all its clashes: a slope's clash spots are counted per 5 m, so their number moves with the line)
  return [...count].flatMap(([k, l]) => list[k] ? [] : l);
}
/** Each route of a project, evaluated as the browser does: its clashes. */
export function projectClashes(design: ProjectDesign) {
  const { ctx } = fullContext(design);
  const pr = evaluateProject(ctx, { epoch: 'audit', revision: 1, design });
  return { result: pr, routes: Object.entries(pr.routes).flatMap(([rid, rr]) => rr.legacy ? [{ id: rid, result: rr.legacy, clashes: worksClashes(rr.legacy, ctx.legacy) }] : []) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // npx tsx scripts/works-clash-audit.ts [--edits] [--gate] [--write-known] [design.json …]
  //   (starters always; --edits: random player edits and saved players' projects, works-clash-edits.ts; --gate: exit 1 on any
  //   clash not in the known list; --write-known: the starters' clashes become the known list)
  const args = process.argv.slice(2), gate = args.includes('--gate');
  let total = 0, failed = 0;
  const report = (name: string, clashes: WorksClash[], unknown: WorksClash[] = clashes) => {
    total += clashes.length; failed += unknown.length;
    if (!clashes.length && !process.env.VERBOSE) return;
    const byCrossing = new Map<string, WorksClash[]>();
    for (const c of clashes) { const k = `${Math.round(c.s)} ${c.cls} ${c.roadId} ${c.type}`; (byCrossing.get(k) ?? byCrossing.set(k, []).get(k)!).push(c); }
    console.log(`${name}: ${clashes.length} clashes${unknown.length ? `, ${unknown.length} NOT KNOWN` : ''}${[...byCrossing].map(([k, l]) => `\n  km ${k}: ${[...new Set(l.map(c => c.what))].map(w => `${l.filter(c => c.what === w).length} ${w}${w === 'road' ? ` (${l.filter(c => c.what === w).map(c => `${c.way} ${c.wayCls} @${Math.round(c.x)},${Math.round(c.y)}`).join('; ')})` : ''}`).join(', ')}${l.some(c => unknown.includes(c)) ? ' ✗' : ''}`).join('')}`);
  };
  const list: Record<string, number> = {}, knownList = known();
  for (const { name, preset, clashes } of starterClashes()) {
    report(name, clashes, unknownClashes(preset, clashes, knownList));
    const own: Record<string, number> = {};
    for (const c of clashes) own[clashKey(preset, c)] = (own[clashKey(preset, c)] ?? 0) + 1;
    for (const [k, n] of Object.entries(own)) list[k] = Math.max(list[k] ?? 0, n);
  }
  if (args.includes('--write-known')) {
    // (both directions of a split motorway draw the same crossing: the count per key is the most one route has)
    writeFileSync(KNOWN_FILE, JSON.stringify({ note: 'Auto\'s own clashes on the starters (open; PLAN.md "One screen for every earthwork"). Regenerate with --write-known only for a reviewed change.', clashes: Object.fromEntries(Object.entries(list).sort()) }, null, 1) + '\n');
    console.log(`wrote ${KNOWN_FILE}: ${Object.keys(list).length} keys`);
  }
  if (args.includes('--edits')) for (const edit of playerEdits()) {
    if (process.env.ONLY_EDIT && !edit.name.includes(process.env.ONLY_EDIT)) continue;
    if (process.env.DUMP) writeFileSync(process.env.DUMP, JSON.stringify(edit.design));
    const { routes } = projectClashes(edit.design), preset = edit.design.presetId ?? edit.design.scenarioId;
    report(edit.name, routes.flatMap(r => r.clashes), routes.flatMap(r => unknownClashes(preset, r.clashes, knownList)));
  }
  for (const file of args.filter(a => a.endsWith('.json'))) {
    const design = JSON.parse(readFileSync(file, 'utf8')) as ProjectDesign;
    const routes = projectClashes(design).routes;
    report(file, routes.flatMap(r => r.clashes), routes.flatMap(r => unknownClashes(design.presetId ?? design.scenarioId, r.clashes, knownList)));
  }
  console.log(`total ${total} · not known ${failed}`);
  if (gate && failed) process.exit(1);
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
