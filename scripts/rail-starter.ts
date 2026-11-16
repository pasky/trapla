// Railway mission starter search (node, no browser): evaluates a railway mission preset through the
// project evaluator exactly as the game does, then a bounded validity-first search over bend moves.
//   npx tsx scripts/rail-starter.ts <presetId> '<pis JSON>' [--budget=300] [--speed=120]
import { evaluate, type Design, type Result } from '../src/core/evaluate';
import { scenarioParams } from '../src/core/data/scenario';
import { evaluateProject, type ProjectEvalContext } from '../src/core/project-evaluate';
import { makeLegacyProjectContext, projectFromLegacyDesign, replaceRouteFromLegacy } from '../src/core/project-legacy';
import { createRailwayProject } from '../src/core/project-railway';
import { loadPack } from './loadpack';

const [presetId, pisJson] = process.argv.slice(2);
const opt = (k: string, d: number) => Number(process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d);
const scenario = scenarioParams('d11', presetId);
if (!scenario.ports || scenario.mode !== 'railway') throw new Error('a railway preset with its own ports');
const { terrain, buildings, roads } = loadPack();
const a = { x: scenario.ports.a.xy[0], y: scenario.ports.a.xy[1] }, b = { x: scenario.ports.b.xy[0], y: scenario.ports.b.xy[1] };
const legacy = { terrain, scenario, a, b, buildings, roads, junctions: [] };
const context = makeLegacyProjectContext(legacy, { presetId, packId: 'd11', objectData: 'node', transportData: null });
const base = projectFromLegacyDesign({ category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] }, context);
const ctx: ProjectEvalContext = { legacy, environment: { objectData: 'node', transportData: null, terrainData: 't', pricingData: 'p', waterData: 'w', terrainClass: scenario.terrainClass } };
const initial: Design = { category: scenario.initial!.category, speed: opt('speed', scenario.initial!.speed), pis: JSON.parse(pisJson ?? '[]'), profileMode: 'auto', vpis: [], ...(process.env.PINS ? { gradePins: JSON.parse(process.env.PINS) } : {}) };
const project0 = createRailwayProject(base, initial, scenario.railTraffic);
let revision = 0;
const run = (d: Design): Result => {
  const design = replaceRouteFromLegacy(project0, 'route:railway', d);
  const p = evaluateProject(ctx, { epoch: 'n', revision: ++revision, design });
  return p.routes['route:railway'].legacy!;
};
void evaluate;
const score = (r: Result) => r.violations.length * 1e12 + r.violations.reduce((s, v) => s + Math.max(1, v.s1 - v.s0), 0) * 1e7 + r.cost.total;
const show = (r: Result) => ({ valid: r.valid, cost: Math.round(r.cost.total / 1e6), km: +(r.length / 1000).toFixed(2), min: +r.travelMin.toFixed(2),
  issues: r.violations.map(v => `${Math.round(v.s0)} ${v.title}${process.env.FIX ? ` | ${v.fix}` : ""}`) });
let design = initial, result = run(design), best = score(result), used = 0, round = 0;
console.log('start', JSON.stringify(show(result)));
if (process.env.CROSSINGS) for (const c of result.crossings) console.log(`  ${Math.round(c.s)} ${c.cls} ${c.type}${c.targetS !== undefined ? ` → ${Math.round(c.targetS)}` : ''}${c.linkLength ? ` link ${Math.round(c.linkLength)} m` : ''} cost ${Math.round(c.cost / 1e6)} M`);
if (process.env.AT) { const at = Number(process.env.AT), r = result;
  console.log('runs', r.runs.filter(u => u.s1 > at - 400 && u.s0 < at + 400).map(u => `${['earth', 'bridge', 'tunnel'][u.kind] ?? u.kind}:${Math.round(u.s0)}-${Math.round(u.s1)}`).join(' '));
  console.log('crossings', r.crossings.filter(c => Math.abs(c.s - at) < 400).map(c => `${Math.round(c.s)} ${c.cls} ${c.what ?? ''}`).join('; '));
  console.log('water', r.waterCrossings.filter(c => Math.abs(c.s - at) < 400).map(c => `${Math.round(c.s)}`).join(' '));
  const i = Math.round(at / r.ds); console.log('xy', Math.round(r.x[i]), Math.round(r.y[i]), 'grade', r.grade[i].toFixed(1), 'ground', r.ground[i].toFixed(1)); }
const budget = opt('budget', 0), original = structuredClone(initial);
while (!result.valid && used < budget && design.pis.length) {
  const v = result.violations[round % result.violations.length];
  const i0 = Math.max(0, Math.min(result.n - 1, Math.round((v.s0 + v.s1) / 2 / result.ds)));
  const x = result.x[i0], y = result.y[i0], tx = result.tx[i0], ty = result.ty[i0];
  const near = design.pis.map((p, i) => ({ i, d: Math.hypot(p.x - x, p.y - y) })).sort((p, q) => p.d - q.d).slice(0, 2);
  const step = [20, 60, 150, 300][Math.floor(round / Math.max(1, result.violations.length)) % 4];
  let improved = false;
  for (const { i } of near) for (const [dx, dy] of [[-ty, tx], [ty, -tx], [tx, ty], [-tx, -ty]]) {
    if (used >= budget || result.valid) break;
    const c = structuredClone(design);
    c.pis[i].x = Math.round(c.pis[i].x + dx * step); c.pis[i].y = Math.round(c.pis[i].y + dy * step);
    if (Math.hypot(c.pis[i].x - original.pis[i].x, c.pis[i].y - original.pis[i].y) > 800) continue;
    const r = run(c), s = score(r); used++;
    if (s < best) { design = c; result = r; best = s; improved = true; console.log(used, JSON.stringify(show(r))); }
  }
  round++;
  if (improved && !result.valid) round %= Math.max(1, result.violations.length);
}
console.log('end', JSON.stringify(show(result)), JSON.stringify(design.pis));
