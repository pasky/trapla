import { readFileSync, writeFileSync } from 'node:fs';
import { serialize, deserialize } from 'node:v8';
import { scenarioParams } from '../../src/core/data/scenario';
import { evaluateProject } from '../../src/core/project-evaluate';
import { replaceRouteFromLegacy } from '../../src/core/project-legacy';
import { loadPack, projectContext } from '../loadpack';
const pack = loadPack('public/scenarios/d3-full');
const { ctx, initial } = projectContext(pack, scenarioParams(pack.meta.id));
let project = initial();
const id = project.routes.find(r => r.role === 'mission')!.id;
project = replaceRouteFromLegacy(project, id, JSON.parse(readFileSync('scripts/scenarios/d3-full/default.json', 'utf8')).design);
const r = evaluateProject(ctx, { epoch: 'x', revision: 1, design: project });
writeFileSync('/tmp/lrr-d3-project.bin', serialize(r));
const time = (v: unknown) => { const b = serialize(v); let best = Infinity; for (let k = 0; k < 5; k++) { const t0 = performance.now(); deserialize(b); best = Math.min(best, performance.now() - t0); } return [b.length, best] as const; };
const [all, tAll] = time(r); console.log('all', (all / 1e6).toFixed(2), 'MB', tAll.toFixed(1), 'ms');
for (const [rid, route] of Object.entries(r.routes)) {
  const rows = Object.entries(route).map(([k, v]) => [k, ...time(v)] as const).sort((a, b) => b[2] - a[2]).slice(0, 6);
  console.log(rid, rows.map(([k, b, t]) => `${k} ${(b / 1e6).toFixed(2)}MB ${t.toFixed(1)}ms`).join(', '));
  const L = route.legacy as any;
  if (L) { const rows = Object.entries(L).map(([k, v]) => [k, ...time(v)] as const).sort((a, b) => b[2] - a[2]).slice(0, 14);
    console.log('  legacy', rows.map(([k, b, t]) => `${k} ${(b / 1e6).toFixed(2)}MB ${t.toFixed(2)}ms`).join(', ')); }
}
const others = Object.entries(r).filter(([k]) => k !== 'routes').map(([k, v]) => [k, ...time(v)] as const).sort((a, b) => b[2] - a[2]).slice(0, 5);
console.log('project', others.map(([k, b, t]) => `${k} ${(b / 1e6).toFixed(2)}MB ${t.toFixed(1)}ms`).join(', '));
