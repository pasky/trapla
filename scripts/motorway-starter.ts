// Motorway mission starter search (Node, no browser): evaluates a motorway preset through the project evaluator
// as the game does (scripts/loadpack.ts projectContext), then, with --budget, a bounded validity-first search over
// bend moves (the nearest two bends of the first problem, 20–300 m across or along the line, ≤ 800 m from where
// they started). Bends: '<pis JSON>', or --mapped=<km> for a bend every so many km of the mapped line (none within
// 750 m of B, as scripts/scenarios/check.ts --seed).
//   SCENARIO=d11 npx tsx scripts/motorway-starter.ts <presetId> ['<pis JSON>'] [--mapped=1.5] [--budget=200]
import type { Design, Result } from '../src/core/evaluate';
import { scenarioParams } from '../src/core/data/scenario';
import { evaluateProject, type ProjectEvalContext } from '../src/core/project-evaluate';
import { replaceCorridorFromDesign } from '../src/core/project-motorway';
import type { ProjectDesign, ProjectResult } from '../src/core/project';
import type { PI } from '../src/core/horizontal';
import { loadPack, projectContext } from './loadpack';
import { describe } from './report';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const [presetId, pisJson] = args;
const opt = (k: string, d: number) => Number(process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const pack = loadPack();
const scenario = scenarioParams(pack.meta.id, presetId);
if (scenario.mode !== 'motorway' || (scenario.presetId ?? scenario.id) !== presetId) throw new Error(`${presetId}: not a motorway preset of ${pack.meta.id}`);
const { ctx, initial } = projectContext(pack, scenario) as { ctx: ProjectEvalContext; initial: () => ProjectDesign };
const project0 = initial();
const corridorId = project0.corridors[0].id;

function mappedBends(stepKm: number): PI[] {
  const all = pack.meta.official.xy as [number, number][], A = pack.meta.A.xy as [number, number], B = pack.meta.B.xy as [number, number];
  const nearest = (p: [number, number]) => all.reduce((best, q, k) => Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.hypot(all[best][0] - p[0], all[best][1] - p[1]) ? k : best, 0);
  const ia = nearest(A), ib = nearest(B);
  const line = ia < ib ? all.slice(ia + 1, ib) : all.slice(ib + 1, ia).reverse();
  const off = [A, ...line, B];
  const toB = new Array(off.length).fill(0);
  for (let i = off.length - 2; i >= 0; i--) toB[i] = toB[i + 1] + Math.hypot(off[i + 1][0] - off[i][0], off[i + 1][1] - off[i][1]);
  const pis: PI[] = [];
  let run = 0;
  for (let i = 1; i < off.length - 1; i++) {
    run += Math.hypot(off[i][0] - off[i - 1][0], off[i][1] - off[i - 1][1]);
    if (run >= stepKm * 1000 && toB[i] >= 750) { pis.push({ x: Math.round(off[i][0] * 10) / 10, y: Math.round(off[i][1] * 10) / 10, r: null }); run = 0; }
  }
  return pis;
}

const pis: PI[] = process.argv.some(a => a.startsWith('--mapped')) ? mappedBends(opt('mapped', 1.5))
  : pisJson ? JSON.parse(pisJson) : structuredClone(scenario.initial?.pis ?? []);
const start: Design = { category: scenario.initial!.category, speed: opt('speed', scenario.initial!.speed), pis, profileMode: 'auto', vpis: [], structureOverrides: [] };
let revision = 0;
const run = (d: Design): { p: ProjectResult; r: Result } => {
  const design = replaceCorridorFromDesign(project0, corridorId, d);
  const p = evaluateProject(ctx, { epoch: 'starter', revision: ++revision, design });
  const r = Object.values(p.routes).find(rr => rr.legacy)!.legacy!;
  return { p, r };
};
// The project's problems (the game's list) first, then the spine's own (for where they are).
const score = ({ p, r }: ReturnType<typeof run>) => p.issues.length * 1e13 + r.violations.length * 1e12
  + r.violations.reduce((s, v) => s + Math.max(1, v.s1 - v.s0), 0) * 1e7 + (p.cost.total ?? r.cost.total);
const show = ({ p, r }: ReturnType<typeof run>) => ({ valid: p.valid, cost: Math.round((p.cost.total ?? NaN) / 1e6), km: +(r.length / 1000).toFixed(2),
  min: +r.travelMin.toFixed(2), issues: p.issues.map(i => `${i.violation?.title} @ ${i.locations.map(l => Math.round((l as { s0?: number }).s0 ?? 0)).join(',')}`),
  spine: r.violations.map(v => `${Math.round(v.s0)} ${v.title}${process.env.FIX ? ` | ${v.fix}` : ''}`) });
let design = start, result = run(design), best = score(result), used = 0, round = 0;
console.log('start', JSON.stringify(show(result)), JSON.stringify(design.pis));
if (process.env.BILL) { for (const l of describe(result.r)) console.log(l); console.log(`  project total ${Math.round((result.p.cost.total ?? NaN) / 1e6)} M`); }
if (process.env.CROSSINGS) for (const c of result.r.crossings) console.log(`  ${Math.round(c.s)} ${c.cls} ${c.type} ${Math.round(c.cost / 1e6)} M`);
if (process.env.RUNS) console.log('runs', result.r.runs.map(u => `${['earth', 'bridge', 'tunnel'][u.kind] ?? u.kind}:${Math.round(u.s0)}-${Math.round(u.s1)}${process.env.RUNS === 'piers' && u.pierStations ? ` piers ${u.pierStations.map(Math.round).join(',')}${u.framePiers ? ` frames ${u.framePiers.map(Math.round).join(',')}` : ''}` : ''}`).join(' '));
const budget = opt('budget', 0), original = structuredClone(start);
while (!result.p.valid && used < budget && design.pis.length) {
  const vs = result.r.violations;
  if (!vs.length) { console.log('project problems with a clean spine: not searched'); break; }
  const v = vs[round % vs.length], r = result.r;
  const i0 = Math.max(0, Math.min(r.n - 1, Math.round((v.s0 + v.s1) / 2 / r.ds)));
  const x = r.x[i0], y = r.y[i0], tx = r.tx[i0], ty = r.ty[i0];
  const near = design.pis.map((p, i) => ({ i, d: Math.hypot(p.x - x, p.y - y) })).sort((p, q) => p.d - q.d).slice(0, 2);
  const step = [20, 60, 150, 300][Math.floor(round / Math.max(1, vs.length)) % 4];
  let improved = false;
  for (const { i } of near) for (const [dx, dy] of [[-ty, tx], [ty, -tx], [tx, ty], [-tx, -ty]]) {
    if (used >= budget || result.p.valid) break;
    const c = structuredClone(design);
    c.pis[i].x = Math.round(c.pis[i].x + dx * step); c.pis[i].y = Math.round(c.pis[i].y + dy * step);
    if (Math.hypot(c.pis[i].x - original.pis[i].x, c.pis[i].y - original.pis[i].y) > 800) continue;
    const t = run(c), s = score(t); used++;
    if (s < best) { design = c; result = t; best = s; improved = true; console.log(used, `bend ${i} ${step} m`, JSON.stringify(show(t))); }
  }
  round++;
  if (improved && !result.p.valid) round %= Math.max(1, result.r.violations.length);
}
console.log('end', JSON.stringify(show(result)), JSON.stringify(design.pis));
