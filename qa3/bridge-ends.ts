// QA3: every bridge end of a design: fill height at the abutment, cone or not, and why not (closed end, held deck,
// the cell beside not earth, coneStands false). Usage:
//   SCENARIO=d11 npx tsx qa3/bridge-ends.ts rail [design.json]     (Královec mission project, design = legacy pis)
//   npx tsx qa3/bridge-ends.ts project <project.json>               (the mission route of a saved project)
import { readFileSync } from 'node:fs';
import type { Design, Result } from '../src/core/evaluate';
import { evaluateProjectRailway, replaceRailwayFromDesign } from '../src/core/project-railway';
import { evaluateProject } from '../src/core/project-evaluate';
import type { ProjectDesign } from '../src/core/project';
import { projectContext } from '../scripts/eval-project';
import { coneStands } from '../src/core/abutment-cone';
import { KIND } from '../src/core/structures';

const [mode, file] = process.argv.slice(2);
let r: Result, terrain;
if (mode === 'rail') {
  const project = JSON.parse(readFileSync('tests/fixtures/qa-final/rail-kralovec.json', 'utf8')) as ProjectDesign;
  const { ctx } = projectContext(project), id = project.routes.find(q => q.kind === 'railway')!.id;
  const p = file ? replaceRailwayFromDesign(project, id, JSON.parse(readFileSync(file, 'utf8')) as Design) : project;
  const res = evaluateProjectRailway(ctx.legacy, p, id, ctx.environment.objectData, {});
  if (res.status !== 'evaluated') throw new Error(res.reason);
  r = res.result; terrain = ctx.legacy.terrain;
} else {
  const project = JSON.parse(readFileSync(file, 'utf8')) as ProjectDesign;
  const { ctx } = projectContext(project);
  const res = evaluateProject(ctx, { epoch: 'cli', revision: 1, design: project });
  r = Object.values(res.routes)[0].legacy!; terrain = ctx.legacy.terrain;
}
console.log(`total ${(r.cost.total / 1e9).toFixed(3)} bn, valid ${r.valid}`);
for (const run of r.runs.filter(x => x.kind === KIND.bridge)) {
  for (const [k, i, into] of [[0, run.i0, 1], [1, run.i1, -1]] as const) {
    const e = i - into, h = r.grade[i] - terrain.heightAt(r.x[i], r.y[i]);
    const cone = (r.cones ?? []).find(c => c.i === i);
    const why = cone ? `cone reach ${cone.reach.toFixed(0)} m` : run.closedEnds?.[k] ? 'CLOSED end (wall)' : r.kind[e] !== KIND.earth ? `beside: kind ${r.kind[e]}` : !coneStands(terrain, { x: r.x[i], y: r.y[i] }, r.grade[i]) ? 'coneStands false' : 'no cone (other)';
    console.log(`bridge ${(run.s0 / 1000).toFixed(2)}–${(run.s1 / 1000).toFixed(2)} ${k ? 'end  ' : 'start'} km ${(r.s[i] / 1000).toFixed(2)} grade ${r.grade[i].toFixed(0)} fill ${h.toFixed(1)} m → ${why}${run.forced ? ' (forced)' : ''}`);
  }
}
if (process.env.WHERE) for (const s of process.env.WHERE.split(',').map(Number)) {
  const i = Math.round(s / r.ds);
  console.log(`km ${(s / 1000).toFixed(2)}: x ${r.x[i].toFixed(0)} y ${r.y[i].toFixed(0)} ground ${terrain.heightAt(r.x[i], r.y[i]).toFixed(0)}`);
}
