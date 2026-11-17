// QA3: a new road carried over our road by our overbridge: what its "built with that bridge, not twice" credit
// takes off against what our road bills for that overbridge, and the new road's own bridges inside the window.
// (the credit itself is shown on the new road's card: "Its 593 m on the bridge over our road … −238.3 M CZK")
// Usage: npx tsx qa3/held-credit.ts qa3/designs/d11-new-road-across-km12.5.json
import { readFileSync } from 'node:fs';
import { evaluateProject } from '../src/core/project-evaluate';
import type { ProjectDesign } from '../src/core/project';
import { projectContext } from '../scripts/eval-project';

const design = JSON.parse(readFileSync(process.argv[2], 'utf8')) as ProjectDesign;
const { ctx } = projectContext(design);
const res = evaluateProject(ctx, { epoch: 'cli', revision: 1, design });
for (const [id, rr] of Object.entries(res.routes)) {
  const l = rr.legacy; if (!l) continue;
  const over = l.crossings.filter((c: any) => c.crossedRoute);
  console.log(id, (l.cost.total / 1e6).toFixed(1), 'M');
  for (const c of over as any[]) console.log(`  our overbridge for ${JSON.stringify(c.crossedRoute).slice(0, 60)}: ${(c.cost / 1e6).toFixed(1)} M, span ${c.span?.toFixed?.(0)} m, approaches ${c.approachLength?.toFixed?.(0)} m at s ${c.s.toFixed(0)}`);
  const br = l.runs.filter(r => r.kind === 1).map(r => `${r.s0.toFixed(0)}–${r.s1.toFixed(0)}`);
  console.log('  bridges', br.join(' '));
}
