// QA3: Královec railway after a 50 px drag at km 6 (qa3/designs/rail-kralovec-drag-km6.json): bend 3 at each
// design speed, evaluated as the game's worker does (the mission project). Usage: npx tsx qa3/rail-speed.ts
import { readFileSync } from 'node:fs';
import type { Design } from '../src/core/evaluate';
import { evaluateProjectRailway, replaceRailwayFromDesign } from '../src/core/project-railway';
import type { ProjectDesign } from '../src/core/project';
import { projectContext } from '../scripts/eval-project';

const project = JSON.parse(readFileSync('tests/fixtures/qa-final/rail-kralovec.json', 'utf8')) as ProjectDesign;
const ctx = projectContext(project).ctx, id = project.routes.find(r => r.kind === 'railway')!.id;
const base = JSON.parse(readFileSync('qa3/designs/rail-kralovec-drag-km6.json', 'utf8')) as Design;
for (const v of [undefined, 160, 140, 100]) {
  const d: Design = structuredClone(base);
  if (v) d.pis[2] = { ...d.pis[2], speed: v };
  const res = evaluateProjectRailway(ctx.legacy, replaceRailwayFromDesign(project, id, d), id, ctx.environment.objectData, {});
  if (res.status !== 'evaluated') { console.log(v, res.reason); continue; }
  const r = res.result;
  console.log(`bend 3 at ${v ?? 'line (120)'}: ${(r.cost.total / 1e9).toFixed(3)} bn, ${r.travelMin.toFixed(2)} min, valid ${r.valid}`);
}
