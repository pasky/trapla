// Auto's own grade line never squeezes two roundings (vertical curves) into each other: on Auto every height
// point is the game's, and a player cannot see or move them, so "two roundings overlap" would be a problem
// nobody can fix. Evaluates the saved designs, the starters, QA's repros and seeded small drags (a bend moved,
// a bend put in, a few to 40 screen px at the start view) and fails on any such overlap of an Auto line.
//   npx tsx scripts/vc-overlap-audit.ts              all suites in parallel (one process per pack)
//   npx tsx scripts/vc-overlap-audit.ts rail d11     only these suites
// env: N (drags per design, default 12; 4 on the 30+ km routes), SEED
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadPack } from './loadpack';
import { evaluate, type Design, type EvalContext, type Result } from '../src/core/evaluate';
import { evaluateProjectRailway, railwayDesign, replaceRailwayFromDesign } from '../src/core/project-railway';
import type { ProjectDesign } from '../src/core/project';
import { projectContext } from './eval-project';

const pack = (id: string, ...more: string[]) => [...['default', 'reference'].map(f => `scripts/scenarios/${id}/${f}.json`), ...more];
/** `rail`: designs of the Královec railway mission (saved projects, or plain designs evaluated as its railway) */
const SUITES: Record<string, { scenario: string; designs: string[]; n?: number; rail?: string; repros?: { label: string; pis: Design['pis'] }[] }> = {
  rail: { scenario: 'd11', rail: 'tests/fixtures/qa-final/rail-kralovec.json', n: 24,
    // drags that squeezed two roundings at a lift's widened block end (the owner's km 2.03 / 2.04 by the tunnel)
    repros: [
      { label: 'owner: bend 3 dragged, roundings at km 2.03 / 2.04', pis: [{ x: 6012, y: 8426, r: null }, { x: 7966, y: 11521, r: null }, { x: 11493.4, y: 16218.7, r: null }, { x: 11560, y: 18613, r: null }] },
      { label: 'bend 3 dragged, km 2.03 / 2.04', pis: [{ x: 6012, y: 8426, r: null }, { x: 7966, y: 11521, r: null }, { x: 10545.5, y: 16055.6, r: null }, { x: 11560, y: 18613, r: null }] },
      { label: 'bend 2 dragged, km 6.16', pis: [{ x: 6012, y: 8426, r: null }, { x: 7543.2, y: 11914.6, r: null }, { x: 11000, y: 16400, r: null }, { x: 11560, y: 18613, r: null }] },
      { label: 'new bend at km 7.24, km 6.30 / 6.34', pis: [{ x: 6012, y: 8426, r: null }, { x: 7966, y: 11521, r: null }, { x: 8988.7, y: 14250.7, r: null }, { x: 11000, y: 16400, r: null }, { x: 11560, y: 18613, r: null }] },
      { label: 'starter, new bend at km 5.50, km 2.35 / 2.42', pis: [{ x: 7300, y: 8300, r: null }, { x: 10065, y: 9045, r: null }, { x: 10590.8, y: 10908.7, r: null }, { x: 11046, y: 16435, r: null }] },
    ],
    designs: ['tests/fixtures/qa-final/rail-kralovec.json', 'tests/fixtures/qa-final/rail-kralovec-drag.json', 'scripts/scenarios/d11/d11-rail-kralovec.json', 'qa3/designs/rail-kralovec-drag-km6.json'] },
  d11: { scenario: 'd11', designs: ['straight', 'scripts/best-design.json', 'scripts/demo-design.json', 'scripts/direct-80-design.json', 'scripts/direct-90-design.json',
    'scripts/town-centre-design.json', 'qa3/designs/d11-deep-cut-tunnel.json', 'qa3/designs/d11-one-bend-70.json'] },
  d3: { scenario: 'd3', designs: pack('d3', 'scripts/scenarios/d3/d3-motorway.json') },
  d35: { scenario: 'd35', designs: pack('d35', 'scripts/scenarios/d35/d35-stage1-motorway.json') },
  'i16-nova-paka': { scenario: 'i16-nova-paka', designs: pack('i16-nova-paka') },
  'i46-sternberk': { scenario: 'i46-sternberk', designs: pack('i46-sternberk') },
  'd3-full': { scenario: 'd3-full', designs: ['scripts/scenarios/d3-full/d3-full-motorway.json'], n: 4 },
  'd35-full': { scenario: 'd35-full', designs: ['scripts/scenarios/d35-full/d35-full-motorway.json'], n: 4 },
  ...Object.fromEntries(['d3-0301', 'd3-0302', 'd3-0303', 'd3-0304', 'd3-0305'].map(id => [id, { scenario: id, designs: pack(id, `scripts/scenarios/${id}/${id}-motorway.json`), n: 6 }])),
};

const here = fileURLToPath(import.meta.url);
if (!process.env.VC_SUITE) {
  const names = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const outs = await Promise.all((names.length ? names : Object.keys(SUITES)).map(name => new Promise<{ name: string; code: number; out: string }>(res => {
    const p = spawn(process.execPath, ['--import', 'tsx', here], { env: { ...process.env, VC_SUITE: name, SCENARIO: SUITES[name].scenario } });
    let out = '';
    p.stdout.on('data', b => { out += b; }); p.stderr.on('data', b => { out += b; });
    p.on('close', code => res({ name, code: code ?? 1, out }));
  })));
  for (const o of outs) console.log(`\n### ${o.name}\n${o.out.trimEnd()}`);
  const bad = outs.filter(o => o.code !== 0);
  console.log(bad.length ? `\nFAIL: ${bad.map(o => o.name).join(', ')}` : '\nOK: no Auto line squeezes its own roundings');
  process.exit(bad.length ? 1 : 0);
}

const suite = SUITES[process.env.VC_SUITE];
const railProject = suite.rail ? JSON.parse(readFileSync(suite.rail, 'utf8')) as ProjectDesign : undefined;
const railCtx = railProject && projectContext(railProject).ctx;
const railId = railProject?.routes.find(r => r.kind === 'railway')?.id;
const ctx: EvalContext = railCtx ? railCtx.legacy : (() => {
  const { meta, scenario, terrain, buildings, roads, junctions } = loadPack();
  return { terrain, scenario, buildings, roads, junctions, a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] } };
})();
const run = (d: Design): Result => {
  if (!railProject || !railCtx || !railId) return evaluate(ctx, d);
  const r = evaluateProjectRailway(railCtx.legacy, replaceRailwayFromDesign(railProject, railId, d), railId, railCtx.environment.objectData, {});
  if (r.status !== 'evaluated') throw new Error(`railway not evaluated: ${r.reason}`);
  return r.result;
};
const load = (file: string): Design => {
  if (file === 'straight') return { category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] };
  const j = JSON.parse(readFileSync(file, 'utf8'));
  if (j.routes && railId) return railwayDesign(j as ProjectDesign, (j as ProjectDesign).routes.find(r => r.kind === 'railway')!);
  return j.design ?? j;
};
/** the squeezed roundings of a result's line (where its points are Auto's): shorter than radius × change of grade */
const squeezed = (d: Design, r: Result) => d.profileMode !== 'auto' ? []
  : r.vcurves.flatMap((c, k) => c.type !== 'none' && c.len < c.r * Math.abs(r.grades[k + 1] - r.grades[k]) - 1e-3 ? [c.s] : []);
const MPP = Math.hypot(ctx.b.x - ctx.a.x, ctx.b.y - ctx.a.y) / 800;
let seed = Number(process.env.SEED ?? 1);
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let failed = 0, total = 0;
const report = (label: string, d: Design, r: Result) => {
  total++;
  const bad = squeezed(d, r);
  if (!bad.length) return;
  failed++;
  console.log(`  FAIL ${label}: roundings squeezed at ${bad.map(s => `km ${(s / 1000).toFixed(2)}`).join(', ')}; ${r.violations.filter(v => v.kind === 'vcOverlap').map(v => `${v.title} — ${v.fix}`).join('; ')}`);
  console.log(`    design: ${JSON.stringify({ pis: d.pis })}`);
};
for (const q of suite.repros ?? []) {
  const d = { ...load(suite.designs[0]), pis: q.pis }, r = run(d);
  console.log(`== repro ${q.label}: ${(r.cost.total / 1e9).toFixed(2)} bn ${r.valid ? 'VALID' : 'NOT VALID'}`);
  report(q.label, d, r);
}
for (const file of suite.designs) {
  const d0 = load(file), r0 = run(d0);
  console.log(`== ${file}: ${(r0.cost.total / 1e9).toFixed(2)} bn ${r0.valid ? 'VALID' : 'NOT VALID'}, ${(r0.length / 1000).toFixed(1)} km`);
  report('as saved', d0, r0);
  const N = Number(process.env.N ?? suite.n ?? 12);
  for (let k = 0; k < N; k++) {
    const d = structuredClone(d0), px = (rnd() < 0.5 ? -1 : 1) * (3 + 37 * rnd());
    let label: string;
    if (d.pis.length && rnd() < 0.5) {
      const b = Math.floor(rnd() * d.pis.length), p = d.pis[b], a = rnd() * 2 * Math.PI;
      p.x = Math.round((p.x + Math.cos(a) * px * MPP) * 10) / 10; p.y = Math.round((p.y + Math.sin(a) * px * MPP) * 10) / 10;
      label = `bend ${b + 1} moved ${Math.abs(px).toFixed(0)} px`;
    } else {
      const at = 500 + rnd() * (r0.length - 1000), i = Math.round(at / r0.ds), off = px * MPP;
      const x = Math.round((r0.x[i] - r0.ty[i] * off) * 10) / 10, y = Math.round((r0.y[i] + r0.tx[i] * off) * 10) / 10;
      const sOf = (q: { x: number; y: number }) => { let bi = 0, bd = Infinity; for (let j = 0; j < r0.n; j += 2) { const t = Math.hypot(r0.x[j] - q.x, r0.y[j] - q.y); if (t < bd) { bd = t; bi = j; } } return r0.s[bi]; };
      const idx = d.pis.findIndex(q => sOf(q) > at);
      d.pis.splice(idx < 0 ? d.pis.length : idx, 0, { x, y, r: null });
      label = `new bend at km ${(at / 1000).toFixed(2)} ${off.toFixed(0)} m aside`;
    }
    let r: Result;
    // (an evaluation that throws is a failure too: a broken drag must not pass for a clean one)
    try { r = run(d); } catch (e) { failed++; total++; console.log(`  FAIL ${label}: ${(e as Error).message}`); continue; }
    report(label, d, r);
  }
}
console.log(`SUMMARY ${process.env.VC_SUITE}: ${failed} of ${total} Auto lines squeeze their roundings`);
process.exit(failed ? 1 : 0);
