// Where evaluate() spends its time, or what it allocates, by function (docs/evaluate-performance.md):
//
//   node scripts/dev/profile.mjs                          the five saved D11 designs, 12 rounds
//   node scripts/dev/profile.mjs --pack d3-full:d3-full-motorway --design scripts/scenarios/d3-full/d3-full-motorway.json --rounds 4
//   … --tree 2          the call tree by inclusive time, branches of at least 2 % (default: off)
//   … --sub footprintConflicts   the tree under one function, in % of that function
//   … --lines retainingPass      a function's own time by line
//   … --alloc           sampled allocation by function instead (objects already collected included)
//   … --top 40          rows of the tables (default 30)
//
// tsx runs the sources as one line per file, so node's profiler cannot tell their functions' lines apart:
// this bundles the engine first (esbuild, unminified, names kept) and profiles the bundle in a child
// process; lines shown are the bundle's, with the source file each comes from.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1] ?? d; };
const rounds = Number(arg('--rounds', 12)), top = Number(arg('--top', 30)), pack = arg('--pack', 'd11'), design = arg('--design');
const root = process.cwd(), dir = mkdtempSync(join(tmpdir(), 'trapla-profile-'));
const [packId, presetId] = pack.split(':');
const designs = design ? [design] : ['best', 'demo', 'direct-80', 'direct-90', 'town-centre'].map(n => `scripts/${n}-design.json`);
writeFileSync(join(dir, 'entry.ts'), `
import { readFileSync } from 'node:fs';
import { loadPack, evalContext } from '${root}/scripts/loadpack.ts';
import { evaluate } from '${root}/src/core/evaluate.ts';
import { scenarioParams } from '${root}/src/core/data/scenario.ts';
const pack = loadPack('${root}/public/scenarios/${packId}');
const ctx = evalContext(pack, ${design ? `scenarioParams('${packId}', ${presetId ? `'${presetId}'` : 'undefined'})` : 'pack.scenario'});
const designs = ${JSON.stringify(designs)}.map(f => JSON.parse(readFileSync('${root}/' + f, 'utf8')).design);
for (const d of designs) evaluate(ctx, d);
const t0 = performance.now();
for (let r = 0; r < ${rounds}; r++) for (const d of designs) evaluate(ctx, d);
console.log(((performance.now() - t0) / ${rounds}).toFixed(0), 'ms per round of', designs.length, 'design(s)');
`);
const bundle = join(dir, 'bundle.mjs');
await build({ entryPoints: [join(dir, 'entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'warning' });
const source = readFileSync(bundle, 'utf8').split('\n');
// esbuild heads every module with a "// path" comment
const marks = source.flatMap((l, i) => /^\/\/ .*\.ts$/.test(l) ? [[i, l.slice(3).split('/').slice(-2).join('/')]] : []);
const fileOf = (line) => { let f = '?'; for (const [i, m] of marks) { if (i > line) break; f = m; } return f; };
const node = (args) => { const r = spawnSync(process.execPath, ['--max-old-space-size=6000', ...args], { stdio: ['ignore', 'inherit', 'inherit'] }); if (r.status) process.exit(r.status); };
const pct = (v, of) => `${(v / of * 100).toFixed(1).padStart(5)} %`;
const where = (cf) => cf.url.endsWith('bundle.mjs') ? `${fileOf(cf.lineNumber)}  (bundle :${cf.lineNumber + 1})` : cf.url.split('/').pop() || '(native)';

if (process.argv.includes('--alloc')) {
  writeFileSync(join(dir, 'alloc.mjs'), `
import inspector from 'node:inspector'; import { writeFileSync } from 'node:fs';
const session = new inspector.Session(); session.connect();
const post = (m, p) => new Promise((res, rej) => session.post(m, p, (e, r) => e ? rej(e) : res(r)));
await post('HeapProfiler.startSampling', { samplingInterval: 16384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
await import('${bundle}');
writeFileSync('${join(dir, 'alloc.json')}', JSON.stringify((await post('HeapProfiler.stopSampling')).profile));`);
  node([join(dir, 'alloc.mjs')]);
  const by = new Map(); let total = 0;
  const walk = (n) => { const k = `${n.callFrame.functionName || '(anonymous)'}  ${where(n.callFrame)}`; by.set(k, (by.get(k) ?? 0) + n.selfSize); total += n.selfSize; n.children.forEach(walk); };
  walk(JSON.parse(readFileSync(join(dir, 'alloc.json'), 'utf8')).head);
  console.log(`sampled allocation: ${(total / 1e6).toFixed(0)} MB in ${rounds + 1} rounds (the warm-up included)`);
  for (const [k, v] of [...by].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(pct(v, total), k);
  process.exit(0);
}

node(['--cpu-prof', `--cpu-prof-dir=${dir}`, bundle]);
const profile = JSON.parse(readFileSync(join(dir, readdirSync(dir).find(f => f.endsWith('.cpuprofile'))), 'utf8'));
const nodes = new Map(profile.nodes.map(n => [n.id, n])), self = new Map();
profile.samples.forEach((id, k) => self.set(id, (self.get(id) ?? 0) + profile.timeDeltas[k]));
const total = [...self.values()].reduce((a, b) => a + b, 0), name = (n) => n.callFrame.functionName || '(anonymous)';
const inclusive = new Map();
const inc = (id) => { let t = inclusive.get(id); if (t === undefined) { const n = nodes.get(id); t = (self.get(id) ?? 0) + (n.children ?? []).reduce((a, c) => a + inc(c), 0); inclusive.set(id, t); } return t; };
inc(profile.nodes[0].id);
const sum = (ids, of) => ids.reduce((a, id) => a + (of.get(id) ?? 0), 0);
/** the tree under `ids` (nodes of one function, merged), children merged by function; % of `base` */
const tree = (ids, label, level, base, cut, depth) => {
  const t = sum(ids, inclusive);
  if (t / base * 100 < cut || level > depth) return;
  console.log(`${'  '.repeat(level)}${pct(t, base)}  ${label}   (own ${(sum(ids, self) / base * 100).toFixed(1)})`);
  const kids = new Map();
  for (const id of ids) for (const c of nodes.get(id).children ?? []) { const k = name(nodes.get(c)); kids.set(k, [...(kids.get(k) ?? []), c]); }
  for (const [k, g] of [...kids].sort((a, b) => sum(b[1], inclusive) - sum(a[1], inclusive))) tree(g, k, level + 1, base, cut, depth);
};
const occurrences = (fn) => { const out = []; const find = (id, inside) => { const n = nodes.get(id), here = name(n) === fn; if (here && !inside) out.push(id); (n.children ?? []).forEach(c => find(c, inside || here)); }; find(profile.nodes[0].id, false); return out; };

console.log(`${(total / 1000).toFixed(0)} ms sampled`);
const sub = arg('--sub'), lines = arg('--lines');
if (sub) { const ids = occurrences(sub); console.log(`${sub}: ${pct(sum(ids, inclusive), total)} of the run`); tree(ids, sub, 0, sum(ids, inclusive), Number(arg('--tree', 2.5)), 7); }
else if (lines) {
  const ticks = new Map(); let all = 0;
  for (const n of profile.nodes) { all += n.hitCount ?? 0; if (name(n) === lines) for (const t of n.positionTicks ?? []) ticks.set(t.line, (ticks.get(t.line) ?? 0) + t.ticks); }
  for (const [line, t] of [...ticks].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(pct(t, all), `:${line}  ${source[line - 1].trim().slice(0, 140)}`);
} else if (process.argv.includes('--tree')) tree([profile.nodes[0].id], '(root)', 0, total, Number(arg('--tree', 2)), 12);
else {
  const own = new Map(), incl = new Map();
  for (const [id, t] of self) { const n = nodes.get(id), k = `${name(n)}  ${where(n.callFrame)}`; own.set(k, (own.get(k) ?? 0) + t); }
  const walk = (id, seen) => { const n = nodes.get(id), k = name(n); if (!seen.has(k)) incl.set(k, (incl.get(k) ?? 0) + inclusive.get(id)); const next = seen.has(k) ? seen : new Set(seen).add(k); (n.children ?? []).forEach(c => walk(c, next)); };
  walk(profile.nodes[0].id, new Set());
  console.log('--- own time');
  for (const [k, v] of [...own].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(pct(v, total), k);
  console.log('--- with what it calls');
  for (const [k, v] of [...incl].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(pct(v, total), k);
}
