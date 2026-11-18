// QA P2 re-check: III/3012's mapped corner dragged ≈ 22 m (the card: "up to 0 m from the old road", 0 CZK) — does our
// road's bridge over it change? Compares the saved project with the same project without the rebuilt road.
// Usage: SCENARIO=d11 npx tsx qa3/kept-corner.ts qa3/designs/d11-iii3012-corner-kept-on-old-road.json
import { readFileSync } from 'node:fs';
import { evaluateProject } from '../src/core/project-evaluate';
import type { ProjectDesign } from '../src/core/project';
import { projectContext } from '../scripts/eval-project';

const design = JSON.parse(readFileSync(process.argv[2], 'utf8')) as ProjectDesign;
const without = { ...design, routes: design.routes.filter((r) => r.role === 'mission'), connections: [] } as ProjectDesign;
for (const [name, d] of [['with the rebuilt road', design], ['mission only', without]] as const) {
  const { ctx } = projectContext(d);
  const res = evaluateProject(ctx, { epoch: 'cli', revision: 1, design: d });
  for (const [id, rr] of Object.entries(res.routes)) {
    const l = rr.legacy; if (!l) continue;
    const br = l.runs.filter((r) => r.kind === 1 && r.s0 < 3000).map((r) => `${r.s0.toFixed(0)}–${r.s1.toFixed(0)}`);
    const cx = l.crossings.filter((c) => c.s > 1800 && c.s < 2800).map((c: any) => `${c.cls}:${c.type}@${c.s.toFixed(0)} sine ${c.sine?.toFixed?.(3)} at (${c.x?.toFixed?.(0)}, ${c.y?.toFixed?.(0)})`);
    console.log(name, id, (l.cost.total / 1e6).toFixed(1), 'M', l.valid ? 'VALID' : 'not valid', '| bridges <3 km', br.join(' '), '|', cx.join(' '));
  }
}
