// Playtest sweep 3 (main 30d0ad8): a new line built across ours. The QA's projects, saved from the game.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateProject } from '../src/core/project-evaluate';
import { surchargeRate, structureSurcharge } from '../src/core/cost';
import { CATEGORIES } from '../src/core/data/categories';
import { routeCategory } from '../src/core/route-section';
import type { ProjectDesign, ProjectResult } from '../src/core/project';

const D11 = 'public/scenarios/d11';
const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/qa3/${name}.json`, 'utf8')) as ProjectDesign;

/** Billed once: every road draws and prices its own body; a crossing the owner builds for another of the
 * player's lines (its deck and ramps there, which that line draws) is billed by the owner, so the sum of the
 * roads' bills is the sum of their own bodies and works, less exactly what the owners bill for those. */
function billedOnce(design: ProjectDesign, r: ProjectResult) {
  let alone = 0, bodies = 0, owned = 0;
  for (const route of design.routes) {
    const own = r.routes[route.id]?.legacy; if (!own) continue;
    alone += r.cost.alone[route.id]!;
    bodies += own.cost.total + r.works.items.filter(w => w.owner.id === route.id && w.cost > 0).reduce((t, w) => t + w.cost, 0);
    const cat = routeCategory(route);
    for (const c of own.crossings) if (c.designed && c.type === 'overbridge') {
      const u = own.cell.urban[c.i];
      owned += (c.cost - (c.worksCost ?? 0)) * (1 + (cat === 'existing' ? surchargeRate(u) : structureSurcharge(CATEGORIES[cat], u)));
    }
  }
  return { alone, expected: bodies - owned, owned };
}

describe.skipIf(!['meta.json', 'transport.json.gz', 'overlays.json', 'height.i16.gz'].every(f => existsSync(`${D11}/${f}`)))('a new line across ours', async () => {
  const { projectContext } = await import('../scripts/eval-project');
  const run = (design: ProjectDesign) => evaluateProject(projectContext(design).ctx, { epoch: 'e', revision: 1, design });
  // D11 km 12.5: the new road rides our overbridge, and right beside its ramps crosses a dip on its own
  // viaduct (≈ 185 M). It used to be let off everything within the ramps' reach (−238 M) while our road
  // billed the overbridge at 37 M: ≈ 160 m of viaduct billed by neither road.
  it('a road carried over ours is let off what our road bills for that bridge, no more', () => {
    const design = fixture('d11-new-road-across-km12.5'), r = run(design);
    const { alone, expected, owned } = billedOnce(design, r);
    expect(owned).toBeGreaterThan(0);
    expect(Math.abs(alone - expected)).toBeLessThan(1);
  }, 60_000);
  // Královec railway, the new railway across our line where it runs through a cutting: a 12.5 ‰ line cannot
  // dip 7.7 m to a deck at ground level; it passes over our railway on that bridge built higher, at least
  // clear of our line, and its stretch over our cutting is a bridge.
  it('a new railway across our railway passes over it on its own bridge', () => {
    const design = fixture('rail-new-railway-across'), r = run(design);
    expect(r.issues.filter(i => i.code !== 'road-ends-nowhere').map(i => i.violation.title)).toEqual([]);
    const ours = r.routes['route:railway'].legacy!, held = r.routes[design.routes[1].id].legacy!;
    const c = ours.crossings.find(c => c.crossedRoute?.id === design.routes[1].id)!;
    expect(c.type).toBe('overbridge');
    let k = 0; for (let q = 1; q < held.n; q++) if (Math.hypot(held.x[q] - c.x, held.y[q] - c.y) < Math.hypot(held.x[k] - c.x, held.y[k] - c.y)) k = q;
    expect(held.kind[k]).toBe(1);
    expect(held.grade[k] - ours.grade[c.i]).toBeGreaterThanOrEqual(7.5 - 0.5);
  }, 60_000);
});
