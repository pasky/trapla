// Edit locality acceptance: small edits (bend moves, new bends, grade pins) must change the design only near
// them. For every edit, against the design before it:
//   (a) how far from the edited stretch (where the plan moved, or the pin) the grade changes (> 0.1 m), and
//       the largest change beyond REACH of it;
//   (b) problems that appear beyond REACH;
//   (c) the bill change;
//   (d) the drag preview's bill against the settled one.
// Plus QA's exact repros (playtest-qa-2 re-tests 4 and 6, the final sweep's railway drag) with pass / fail.
// The railway suite edits the Královec mission (a saved project, evaluated as the game's full worker does).
//   npx tsx scripts/edit-locality.ts                 all suites in parallel (one process per pack)
//   npx tsx scripts/edit-locality.ts d11 d3-full     only these suites
// env: N (random edits per design, default 8; 4 on the 30+ km routes), SEED, REACH (m, default 10000: a
//      boundary's 5 km window and the block beyond it, or a retry judged within 5 km and its window),
//      MPP (metres per screen pixel; default the A–B distance / 800, about the start view)
// Exit 1 if a QA repro or a grade-pin edit changes anything beyond REACH (a pin leaves the plan alone), or a
// repro marked so is not valid; an edit listed in EXPECTED (a far change that is physics, explained there) only
// past its own bound.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadPack } from './loadpack';
import { evaluate, type Design, type EvalContext, type Result } from '../src/core/evaluate';
import { adoptFull, rememberFull } from '../src/core/preview-window';
import { evaluateProjectRailway, railwayDesign, replaceRailwayFromDesign } from '../src/core/project-railway';
import type { ProjectDesign } from '../src/core/project';
import { projectContext } from './eval-project';

/** `project`: the designs are saved projects of one railway mission */
const SUITES: Record<string, { scenario: string; designs: string[]; n?: number; project?: boolean }> = {
  rail: { scenario: 'd11', designs: ['tests/fixtures/qa-final/rail-kralovec.json'], project: true },
  d11: { scenario: 'd11', designs: ['straight', 'scripts/best-design.json', 'scripts/demo-design.json', 'scripts/direct-80-design.json', 'scripts/direct-90-design.json', 'scripts/town-centre-design.json'] },
  'd3-full': { scenario: 'd3-full', designs: ['scripts/scenarios/d3-full/d3-full-motorway.json'], n: 4 },
  'd35-full': { scenario: 'd35-full', designs: ['scripts/scenarios/d35-full/d35-full-motorway.json'], n: 4 },
  ...Object.fromEntries(['d3-0301', 'd3-0302', 'd3-0303', 'd3-0304', 'd3-0305'].map(id => [id, { scenario: id, designs: [`scripts/scenarios/${id}/${id}-motorway.json`] }])),
};
/** `valid`: the repro must also leave a valid design (its problems were Auto's own, not far ones) */
type Edit = { kind: 'bend' | 'insert' | 'pin'; at: number; amount: number; bend?: number; qa?: string; xy?: { x: number; y: number }; valid?: boolean };
/** QA's repros: chainage (m), metres sideways (insert: a new bend; at the start view 10 px ≈ 230 m on D11) */
const QA: Record<string, Edit[]> = {
  straight: [
    { kind: 'pin', at: 9000, amount: 15, qa: 're-test 6: 15 m pin at km 9' }, { kind: 'pin', at: 9000, amount: -15, qa: 're-test 6: 15 m pin at km 9 (down)' },
    { kind: 'insert', at: 9000, amount: 243, qa: 're-test 6: +10 px at km 9 (3°)' }, { kind: 'insert', at: 3000, amount: 220, qa: 're-test 6: +10 px at km 3 (5°)' },
    { kind: 'insert', at: 3000, amount: -440, qa: 're-test 4: −20 px at km 3' },
  ],
  'scripts/scenarios/d35-full/d35-full-motorway.json': [
    { kind: 'insert', at: 11700, amount: 300, qa: 're-test 4: drag at km 11.7' }, { kind: 'insert', at: 25400, amount: 300, qa: 're-test 4: drag at km 25.4' },
  ],
  'scripts/scenarios/d3-full/d3-full-motorway.json': [24500, 29500, 18900, 40000, 50500].map(at => ({ kind: 'insert' as const, at, amount: 300, qa: `re-test 4: drag at km ${at / 1000}` })),
  // the bend the QA's 50 px drag put in (tests/fixtures/qa-final/rail-kralovec-drag.json)
  'tests/fixtures/qa-final/rail-kralovec.json': [{ kind: 'insert', at: 6000, amount: 23, xy: { x: 8877.519500403168, y: 12943.53983494432 }, qa: 'final sweep: 50 px drag at km 6', valid: true }],
};

/** Edits whose far change is physics, not the solve's reach (each with why; still a FAIL if the far change grows
 * past `maxFar` m or a far problem appears): reported as EXPECTED. */
const EXPECTED: Record<string, { label: string; maxFar: number; why: string }[]> = {
  'tests/fixtures/qa-final/rail-kralovec.json': [{ label: 'pin -9 m at km 2.7', maxFar: 3.5,
    why: 'the line climbs at its 12.5 ‰ limit over km 2.25–8.5, so a 9 m lower pin lowers it ≈ 11 m all the way to km 10.5; '
      + 'the support lifts (heights the grade must keep) the old line needed at km 9.83–10.15 are gone with it, '
      + 'and the boundary at km 11.21 saw them in its 5 km window: without them its cheapest height there is 7 m lower, and the block '
      + 'beyond it (to km 13.27) follows. The change starts 0.7 km past the physically changed stretch (PLAN.md "Design realism")' }],
};

const here = fileURLToPath(import.meta.url);
const wanted = process.argv.slice(2).filter(a => !a.startsWith('-'));
if (!process.env.EDIT_SUITE) {
  // the parent: one child per suite, in parallel; then the summary lines
  const names = wanted.length ? wanted : Object.keys(SUITES);
  const outs = await Promise.all(names.map(name => new Promise<{ name: string; code: number; out: string }>(res => {
    const p = spawn(process.execPath, ['--import', 'tsx', here], { env: { ...process.env, EDIT_SUITE: name, SCENARIO: SUITES[name].scenario } });
    let out = '';
    p.stdout.on('data', b => { out += b; }); p.stderr.on('data', b => { out += b; });
    p.on('close', code => res({ name, code: code ?? 1, out }));
  })));
  for (const o of outs) console.log(`\n### ${o.name}\n${o.out.trimEnd()}`);
  console.log('\n### summary');
  for (const o of outs) for (const l of o.out.split('\n').filter(l => l.startsWith('SUMMARY') || l.startsWith('FAIL'))) console.log(`${o.name}: ${l}`);
  process.exit(outs.some(o => o.code !== 0) ? 1 : 0);
}

const suite = SUITES[process.env.EDIT_SUITE];
// a railway mission: its project's context; each design evaluated as that project's railway
const railProject = suite.project ? JSON.parse(readFileSync(suite.designs[0], 'utf8')) as ProjectDesign : undefined;
const railCtx = railProject && projectContext(railProject).ctx;
const ctx: EvalContext = railCtx ? railCtx.legacy : (() => {
  const { meta, scenario, terrain, buildings, roads, junctions } = loadPack();
  return { terrain, scenario, buildings, roads, junctions, a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] } };
})();
const railId = railProject?.routes.find(r => r.kind === 'railway')?.id;
const run = (d: Design, preview = false): Result => {
  if (!railProject || !railCtx || !railId) return evaluate(ctx, d, preview ? { preview: true } : {});
  const r = evaluateProjectRailway(railCtx.legacy, replaceRailwayFromDesign(railProject, railId, d), railId, railCtx.environment.objectData, { preview });
  if (r.status !== 'evaluated') throw new Error(`railway not evaluated: ${r.reason}`);
  return r.result;
};
const REACH = Number(process.env.REACH ?? 10000);
const MPP = Number(process.env.MPP ?? Math.hypot(ctx.b.x - ctx.a.x, ctx.b.y - ctx.a.y) / 800);
let seed = Number(process.env.SEED ?? 1);
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const at = (r: Result, arr: ArrayLike<number>, s: number) => {
  const f = Math.max(0, Math.min(r.n - 1, s / r.ds)), i = Math.min(r.n - 2, Math.floor(f));
  return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
};
const pct = (xs: number[], q: number) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
let failed = 0;

for (const file of suite.designs) {
  const d0: Design = file === 'straight' ? { category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [], structureOverrides: [] }
    : railProject ? railwayDesign(railProject, railProject.routes.find(r => r.id === railId)!) : JSON.parse(readFileSync(file, 'utf8')).design;
  const r0 = run(d0);
  const name = file === 'straight' ? 'straight start' : file.replace(/^.*\//, '').replace('.json', '');
  console.log(`== ${name}: ${(r0.cost.total / 1e9).toFixed(2)} bn ${r0.valid ? 'VALID' : 'NOT VALID'}, ${(r0.length / 1000).toFixed(1)} km, ${MPP.toFixed(0)} m/px`);
  // the station of the base nearest a point (for "how far the plan moved")
  const offBase = (x: number, y: number, s: number) => {
    let best = Infinity;
    const i0 = Math.max(0, Math.floor((s - 3000) / r0.ds)), i1 = Math.min(r0.n - 1, Math.ceil((s + 3000) / r0.ds));
    for (let i = i0; i <= i1; i++) best = Math.min(best, Math.hypot(r0.x[i] - x, r0.y[i] - y));
    return best;
  };
  const edits: Edit[] = [...(QA[file] ?? [])];
  const N = Number(process.env.N ?? suite.n ?? 8);
  for (let k = 0; k < N; k++) {
    const u = rnd(), px = 5 + 15 * rnd(), sign = rnd() < 0.5 ? -1 : 1;
    if (u < 0.25) edits.push({ kind: 'pin', at: 1000 + rnd() * (r0.length - 2000), amount: sign * (3 + 12 * rnd()) });
    else if (u < 0.75 && d0.pis.length) edits.push({ kind: 'bend', bend: Math.floor(rnd() * d0.pis.length), at: 0, amount: sign * px * MPP });
    else edits.push({ kind: 'insert', at: 1000 + rnd() * (r0.length - 2000), amount: sign * px * MPP });
  }
  const rows: { far: number; reach: number; farViol: number; dBill: number; drift: number; kind: string }[] = [];
  for (const e of edits) {
    const d = structuredClone(d0);
    let label: string;
    if (e.kind === 'pin') {
      d.gradePins = [...(d.gradePins ?? []), { s: Math.round(e.at), z: at(r0, r0.grade, e.at) + e.amount }];
      label = `pin ${e.amount > 0 ? '+' : ''}${e.amount.toFixed(0)} m at km ${(e.at / 1000).toFixed(1)}`;

    } else if (e.kind === 'bend') {
      const p = d.pis[e.bend!];
      let bi = 0, bd = Infinity;
      for (let i = 0; i < r0.n; i++) { const q = Math.hypot(r0.x[i] - p.x, r0.y[i] - p.y); if (q < bd) { bd = q; bi = i; } }
      p.x = Math.round((p.x - r0.ty[bi] * e.amount) * 10) / 10; p.y = Math.round((p.y + r0.tx[bi] * e.amount) * 10) / 10;
      e.at = r0.s[bi];
      label = `bend ${e.bend} (km ${(e.at / 1000).toFixed(1)}) ${e.amount.toFixed(0)} m`;
    } else {
      const i = Math.round(e.at / r0.ds), x = e.xy?.x ?? r0.x[i] - r0.ty[i] * e.amount, y = e.xy?.y ?? r0.y[i] + r0.tx[i] * e.amount;
      // in order along the route
      const sOf = (q: { x: number; y: number }) => { let bi = 0, bd = Infinity; for (let j = 0; j < r0.n; j += 2) { const t = Math.hypot(r0.x[j] - q.x, r0.y[j] - q.y); if (t < bd) { bd = t; bi = j; } } return r0.s[bi]; };
      const idx = d.pis.findIndex(q => sOf(q) > e.at);
      d.pis.splice(idx < 0 ? d.pis.length : idx, 0, e.xy ? { x, y, r: null } : { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: null });
      label = `new bend at km ${(e.at / 1000).toFixed(1)} ${e.amount.toFixed(0)} m`;
    }
    // (a railway's full result carries its own lineage: the options its project evaluates it with)
    if (!railProject) rememberFull(ctx, d0, {}, r0); else adoptFull(ctx.terrain, r0);
    const pv = run(d, true);
    const r = run(d);
    const dL = r.length - r0.length;
    // the edited stretch: where the plan moved (> 0.5 m), else the pin; in the edited route's chainage
    let m0 = Infinity, m1 = -Infinity;
    for (let i = 0; i < r.n; i += 2) if (offBase(r.x[i], r.y[i], r.s[i]) > 0.5) { m0 = Math.min(m0, r.s[i]); m1 = Math.max(m1, r.s[i]); }
    if (m0 > m1) { m0 = m1 = e.at; }
    const w0 = m0 - REACH, w1 = m1 + REACH;
    const planEverywhere = m0 <= r.ds && m1 >= r.length - r.ds;
    // (a) grade outside the edited stretch: upstream at the same chainage, downstream at the same ground (+ dL)
    let far = 0, sFar = NaN, reach = 0;
    for (let i = 0; i < r.n; i++) {
      const s = r.s[i];
      if (s >= m0 && s <= m1) continue;
      const s0 = s > m1 ? s - dL : s;
      if (s0 < 0 || s0 > r0.length) continue;
      const dz = Math.abs(r.grade[i] - at(r0, r0.grade, s0));
      if (dz > 0.1) reach = Math.max(reach, s < m0 ? m0 - s : s - m1);
      if ((s < w0 || s > w1) && dz > far) { far = dz; sFar = s; }
    }
    // (b) problems beyond the window that the design before did not have (same title within 150 m)
    const mid = (v: Result['violations'][number]) => (v.s0 + v.s1) / 2;
    const newFar = r.violations.filter(v => {
      const s = mid(v); if (s >= w0 && s <= w1) return false;
      const s0 = s > w1 ? s - dL : s;
      return !r0.violations.some(o => o.title === v.title && Math.abs(mid(o) - s0) < 150);
    });
    const dBill = (r.cost.total - r0.cost.total) / r0.cost.total, drift = (pv.cost.total - r.cost.total) / r.cost.total;
    rows.push({ far: planEverywhere ? NaN : far, reach: planEverywhere ? NaN : reach, farViol: newFar.length, dBill, drift, kind: e.kind });
    let verdict = '';
    if (e.kind === 'pin' || e.qa) {
      const ok = (planEverywhere || far <= 0.5) && !newFar.length && (!e.valid || r.valid);
      const expected = !ok && EXPECTED[file]?.find(x => x.label === label && far <= x.maxFar && !newFar.length && (!e.valid || r.valid));
      verdict = ok ? 'PASS ' : expected ? `EXPECTED (${expected.why}) ` : 'FAIL ';
      if (!ok && !expected) failed++;
    }
    const moved = (v: Result['violations'][number]) => { const j = Math.min(r.n - 1, Math.round(mid(v) / r.ds)); return offBase(r.x[j], r.y[j], r.s[j]); };
    console.log(`${verdict}${e.qa ? `[${e.qa}] ` : ''}${label}: ${(r.cost.total / 1e9).toFixed(2)} bn (${(dBill * 100).toFixed(1)} %) ${r.valid ? 'VALID' : 'NOT VALID'}, `
      + `preview ${(drift * 100).toFixed(1)} %; edited km ${(m0 / 1000).toFixed(1)}–${(m1 / 1000).toFixed(1)}; `
      + (planEverywhere ? 'plan moved along the whole route' : `grade changed up to ${(reach / 1000).toFixed(1)} km away, beyond ${REACH / 1000} km ${far.toFixed(2)} m${far > 0.05 ? ` at km ${(sFar / 1000).toFixed(1)}` : ''}`)
      + `; new far problems: ${newFar.map(v => `km ${(mid(v) / 1000).toFixed(2)} ${v.title}`).join('; ') || 'none'}`
      + (r.valid ? '' : ` | all problems: ${r.violations.map(v => `km ${(mid(v) / 1000).toFixed(2)} ${v.title} (plan moved ${moved(v).toFixed(0)} m)`).join('; ')}`));
  }
  const fars = rows.map(x => x.far).filter(x => Number.isFinite(x)), reaches = rows.map(x => x.reach).filter(x => Number.isFinite(x));
  console.log(`SUMMARY ${name}: ${rows.length} edits; grade reach p50 ${(pct(reaches, 0.5) / 1000).toFixed(1)} / p90 ${(pct(reaches, 0.9) / 1000).toFixed(1)} / max ${(Math.max(0, ...reaches) / 1000).toFixed(1)} km; `
    + `beyond ${REACH / 1000} km max ${Math.max(0, ...fars).toFixed(2)} m in ${fars.filter(x => x > 0.1).length}; `
    + `new far problems in ${rows.filter(x => x.farViol).length}; |bill Δ| p50 ${(pct(rows.map(x => Math.abs(x.dBill)), 0.5) * 100).toFixed(1)} / p90 ${(pct(rows.map(x => Math.abs(x.dBill)), 0.9) * 100).toFixed(1)} %; `
    + `preview drift p50 ${(pct(rows.map(x => x.drift), 0.5) * 100).toFixed(1)} / min ${(Math.min(...rows.map(x => x.drift)) * 100).toFixed(1)} / max ${(Math.max(...rows.map(x => x.drift)) * 100).toFixed(1)} %`);
}
process.exit(failed ? 1 : 0);
