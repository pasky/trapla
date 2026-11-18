// Every bridge end standing in a fill: a cone in front of its abutment, or a closed end (a wall down to the ground) on
// a fill of at most CONE.closedMax, whose wall is billed with the bridge (abutment-cone.ts, support-layout.ts). Runs
// every installed pack's straight start and saved designs and every preset as the game starts it, and lists each end
// that breaks the rule, and each house standing under a cone (what is drawn is what is billed: it goes); exit 1 if any does.
//   npx tsx scripts/bridge-ends-audit.ts [--only d11,d3-0302]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { CONE, coneCovers, conePavingCost } from '../src/core/abutment-cone';
import type { BuildingIndex as Buildings } from '../src/core/buildings';
import type { Terrain } from '../src/core/terrain';
import { bridgeModel, bridgeVariableCosts, frameBeamCost } from '../src/core/bridge';
import { CATEGORIES, type CategoryId } from '../src/core/data/categories';
import { EXCAVATION_BY_CLASS } from '../src/core/data/prices';
import { routeCategory } from '../src/core/route-section';
import { PRESETS } from '../src/core/data/scenario';
import { evaluate, type Design, type Result } from '../src/core/evaluate';
import { evaluateProject } from '../src/core/project-evaluate';
import { KIND } from '../src/core/structures';
import { evalContext, loadPack, projectContext } from './loadpack';

/** what is wrong with the bridge ends of a full (not a preview) result of a line of `category`: none, or one line per
 * end; and whether its bill holds exactly its bridges' decks, abutments, regrading, cones' paving and the walls of its
 * closed ends (the bill's bridges line taken apart independently of where the walls are billed) */
export function bridgeEndProblems(r: Result, category: CategoryId | 'existing', ground?: { buildings?: Buildings; terrain: Terrain }): string[] {
  const out: string[] = [], km = (s: number) => (s / 1000).toFixed(2);
  // (a house the cone's fill lies on is demolished, bought out, or kept by the player: then the cone is not there)
  const bld = ground?.buildings;
  if (bld) {
    const gone = new Set([...r.demolished, ...r.boughtOut].map(d => d.j));
    for (const c of r.cones ?? []) {
      const under = coneCovers(c, c.length, 0, (x, y) => ground!.terrain.heightAt(x, y));
      bld.near(c.x + c.tx * c.length / 2, c.y + c.ty * c.length / 2, Math.hypot(c.length, c.side), j => {
        if (!gone.has(j) && bld.anyPoint(j, 1, under)) out.push(`the cone at km ${km(c.s)} stands on house ${j}, which stays`);
      });
    }
  }
  /** the cone's top over the ground at the abutment (the bridge's end), on the stations */
  const fillAt = (s: number) => {
    const f = Math.max(0, Math.min(r.n - 1 - 1e-9, s / r.ds)), j = Math.floor(f), t = f - j;
    return (r.grade[j] - r.ground[j]) * (1 - t) + (r.grade[j + 1] - r.ground[j + 1]) * t - CONE.deckDepth;
  };
  let walls = 0;
  for (const run of r.runs) if (run.kind === KIND.bridge) for (const [k, i, into] of [[0, run.i0, 1], [1, run.i1, -1]] as const) {
    const beside = i - into;
    if (beside < 0 || beside >= r.n || r.kind[beside] !== KIND.earth) continue;
    const fill = fillAt(k ? run.s1 : run.s0), cone = r.cones?.some(c => c.i === i), wall = run.endWalls?.[k];
    const where = `bridge km ${km(run.s0)}–${km(run.s1)} ${k ? 'end' : 'start'} (fill ${fill.toFixed(1)} m)`;
    if (run.closedEnds?.[k]) {
      if (cone) out.push(`${where}: closed and a cone`);
      // (its height as the wall reads it at the abutment, and as the stations do there)
      if (!wall || wall.height > CONE.closedMax + 1e-9 || fill > CONE.closedMax + 0.5) out.push(`${where}: a wall ${wall ? wall.height.toFixed(1) : '?'} m high, over ${CONE.closedMax} m`);
      if (!wall || !(wall.cost > 0)) out.push(`${where}: its wall has no price`);
      else walls += wall.cost;
    } else if (!cone && fill > 2 && run.coneReach) out.push(`${where}: neither a cone nor a wall`);
  }
  if (category !== 'existing') {
    const model = bridgeModel(CATEGORIES[category]), h = Float64Array.from(r.grade, (g, i) => g - r.ground[i]);
    let expected = walls;
    for (const run of r.runs) if (run.kind === KIND.bridge) {
      for (const [, v] of bridgeVariableCosts(model, h, r.ds, run)) expected += v;
      expected += model.abutments + (run.regradeM3 ? (run.regradeM3[0] + run.regradeM3[1]) * EXCAVATION_BY_CLASS.II : 0);
      expected += (run.framePiers?.length ?? 0) * frameBeamCost(CATEGORIES[category].crownWidth); // (a frame pier's crossbeam)
    }
    for (const c of r.cones ?? []) expected += conePavingCost(c);
    const billed = r.parts.bridges.reduce((a, b) => a + b, 0);
    if (Math.abs(billed - expected) > 1) out.push(`the bridges billed ${(billed / 1e6).toFixed(2)} M, their parts and walls ${(expected / 1e6).toFixed(2)} M`);
  }
  return out;
}

/** every result a pack's cases give: the straight start and the saved designs (single-road evaluator), every preset
 * as the game starts it (each route of the project) */
export function packResults(id: string, each: (name: string, r: Result, category: CategoryId | 'existing', ground: { buildings?: Buildings; terrain: Terrain }) => void) {
  const pack = loadPack(`public/scenarios/${id}`), ctx = evalContext(pack);
  const designs: [string, Design][] = [['straight', { category: 'S9.5', speed: 90, pis: [], profileMode: 'auto', vpis: [] }]];
  const dir = id === 'd11' ? 'scripts' : `scripts/scenarios/${id}`;
  if (existsSync(dir)) for (const f of readdirSync(dir).filter(f => f.endsWith('.json') && (id !== 'd11' || f.endsWith('-design.json'))).sort()) {
    const design = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')).design as Design | undefined;
    if (design?.pis && !PRESETS.some(p => p.id === id && p.ports && f === `${p.presetId}.json`)) designs.push([`${dir}/${f}`, design]);
  }
  for (const [name, design] of designs) each(`${id} ${name}`, evaluate(ctx, design), design.category, ctx);
  for (const scenario of PRESETS.filter(p => p.id === id)) {
    const { ctx: project, initial } = projectContext(pack, scenario);
    const design = initial(), result = evaluateProject(project, { epoch: 'audit', revision: 1, design });
    for (const route of design.routes) { const legacy = result.routes[route.id]?.legacy; if (legacy) each(`${id} ${scenario.presetId ?? id} ${route.id}`, legacy, routeCategory(route), project.legacy); }
  }
}

if (process.argv[1]?.endsWith('bridge-ends-audit.ts')) {
  const only = (() => { const i = process.argv.indexOf('--only'); return i < 0 ? undefined : process.argv[i + 1].split(','); })();
  const packs = [...new Set(PRESETS.map(p => p.id))].filter(id => existsSync(`public/scenarios/${id}/meta.json`) && (!only || only.includes(id)));
  let bad = 0, ends = 0, closed = 0;
  for (const id of packs) packResults(id, (name, r, category, ground) => {
    const bridges = r.runs.filter(q => q.kind === KIND.bridge), walls = bridges.reduce((t, q) => t + (q.closedEnds?.filter(Boolean).length ?? 0), 0);
    ends += 2 * bridges.length; closed += walls;
    const problems = bridgeEndProblems(r, category, ground);
    bad += problems.length;
    console.log(`${name}: ${(r.cost.total / 1e9).toFixed(3)} bn ${r.valid ? 'VALID' : 'not valid'}, ${bridges.length} bridges, ${r.cones?.length ?? 0} cones, ${walls} walls`
      + (problems.length ? `\n  ${problems.join('\n  ')}` : ''));
  });
  console.log(`${ends} bridge ends, ${closed} closed; ${bad ? `${bad} BAD` : 'each a cone, or a billed wall within the limit'}`);
  process.exit(bad ? 1 : 0);
}
