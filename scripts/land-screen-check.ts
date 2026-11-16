// Is the multi-road land screen (core/project-ledger.ts `envelope`) still conservative? It takes a road's
// land to reach, from the centreline, to the further slope edge on earthworks and the deck's whole width
// on a bridge. This checks on real designs that nothing the road's own bill pays for along the line lies
// beyond that: the land take billed per cell (cell.width) is never wider than the two slope edges together,
// and every retaining wall stands inside the reach. (Crossing works, relocated roads and channels, links,
// removed old roads and houses are screened separately, by their own geometry or as shared houses.)
//   npx tsx scripts/land-screen-check.ts scripts/*-design.json      (SCENARIO=<id> for another pack's straight line)
import { readFileSync } from 'node:fs';
import { CATEGORIES } from '../src/core/data/categories';
import { evaluate, type Design, type EvalContext } from '../src/core/evaluate';
import { KIND } from '../src/core/structures';
import { startDesign } from '../src/state';
import { loadPack } from './loadpack';

const { meta, scenario, terrain, buildings, roads, junctions } = loadPack();
const ctx: EvalContext = { terrain, scenario, a: { x: meta.A.xy[0], y: meta.A.xy[1] }, b: { x: meta.B.xy[0], y: meta.B.xy[1] }, buildings, roads, junctions };
const designs: [string, Design][] = [['straight', { ...startDesign(), ...structuredClone(scenario.initial ?? {}) } as Design],
  ...process.argv.slice(2).map((f): [string, Design] => [f, JSON.parse(readFileSync(f, 'utf8')).design])];
let bad = 0;
for (const [name, d] of designs) {
  const r = evaluate(ctx, d), half = CATEGORIES[d.category].crownWidth / 2;
  const reach = (i: number) => r.kind[i] === KIND.earth ? Math.max(half, Math.abs(r.dayL[i]), Math.abs(r.dayR[i])) : Math.max(half, r.cell.width[i]);
  let wide = 0, wall = 0, earth = 0;
  for (let i = 0; i < r.n; i++) if (r.kind[i] === KIND.earth) { earth++; wide = Math.max(wide, r.cell.width[i] - (r.dayL[i] + r.dayR[i])); }
  for (const w of r.retainingWalls) wall = Math.max(wall, Math.abs(w.offset) - reach(w.i));
  const ok = wide <= 1e-6 && wall <= 1e-6;
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${r.n} cells (${earth} on earthworks); billed land wider than the two slope edges by ${wide.toFixed(3)} m at most; `
    + `${r.retainingWalls.length} retaining walls, beyond the reach by ${Math.max(0, wall).toFixed(3)} m at most`);
}
if (bad) { console.error(`${bad} design(s) build or buy beyond the screen's reach`); process.exit(1); }
