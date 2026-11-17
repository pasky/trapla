// Playtest sweep 3 (main 30d0ad8): a new line built across ours (the QA's projects, saved from the game), a mapped
// road's own curves once it is dragged.
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
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
  // Královec railway, the QA's new railway across ours: it was held at a deck at ground level ("lower this
  // railway here by 7.7 m": a 12.5 ‰ line cannot) while our railway dug itself 15 m down under the ground
  // there (+265 M). A railway of the project follows our crossing as a road does: our line stays where it
  // is, the new one goes over it on its bridge, and our bill rises by that bridge's deck only.
  it('a new railway across our railway passes over it on its own bridge; ours stays where it was', () => {
    const design = fixture('rail-new-railway-across'), r = run(design);
    expect(r.issues.filter(i => i.code !== 'road-ends-nowhere').map(i => i.violation.title)).toEqual([]);
    const ours = r.routes['route:railway'].legacy!, held = r.routes[design.routes[1].id].legacy!;
    const c = ours.crossings.find(c => c.crossedRoute?.id === design.routes[1].id)!;
    expect(c).toMatchObject({ type: 'overbridge', approachLength: 0 });
    let k = 0; for (let q = 1; q < held.n; q++) if (Math.hypot(held.x[q] - c.x, held.y[q] - c.y) < Math.hypot(held.x[k] - c.x, held.y[k] - c.y)) k = q;
    expect(held.kind[k]).toBe(1);
    const deck = c.geometry!.road!.reduce((p, q) => Math.abs(q.d!) < Math.abs(p.d!) ? q : p).z;
    expect(Math.abs(held.grade[k] - deck)).toBeLessThan(1);
    const alone = structuredClone(design); alone.routes = alone.routes.slice(0, 1);
    alone.connections = alone.connections.filter(x => x.ports.every(p => p.kind !== 'route' || p.routeId === 'route:railway'));
    const solo = run(alone).routes['route:railway'].legacy!;
    expect(Math.abs(ours.grade[c.i] - solo.grade[c.i])).toBeLessThan(1);
    expect(ours.cost.total - solo.cost.total).toBeLessThan(2 * c.cost);
    const { alone: bills, expected } = billedOnce(design, r);
    expect(Math.abs(bills - expected)).toBeLessThan(1);
  }, 60_000);
});

// D11 straight start, road III/3012 at our km 2.3, its one bend (the old road's own R 104 m corner) dragged
// 23 m: it used to stay "Your radius" and be too sharp for 70 km/h; built anew, its curve is Auto's.
describe.skipIf(!existsSync(`${D11}/transport.json.gz`))('a mapped road once dragged', async () => {
  it("keeps the old road's own curve only where it still lies on the old road", async () => {
    const { loadPack } = await import('../scripts/loadpack');
    const { objectDataKey } = await import('../src/core/build-controls');
    const { ProjectTransportIndex } = await import('../src/core/project-network');
    const { startDesign } = await import('../src/state');
    const { coveredStretches, derivedStretch, rebuildCommand } = await import('../src/ui/road-edit');
    const { D11_SCENARIO } = await import('../src/core/data/scenario');
    const { makeLegacyProjectContext, projectFromLegacyDesign } = await import('../src/core/project-legacy');
    const pack = loadPack(D11), scenario = D11_SCENARIO;
    const graph = JSON.parse(gunzipSync(readFileSync(`${D11}/transport.json.gz`)).toString());
    const fingerprint = JSON.parse(readFileSync(`${D11}/transport-meta.json`, 'utf8')).fingerprint;
    const objectData = objectDataKey(pack.overlays.buildings, pack.overlays.binfo, pack.overlays.net);
    const A = { x: pack.meta.A.xy[0], y: pack.meta.A.xy[1] }, B = { x: pack.meta.B.xy[0], y: pack.meta.B.xy[1] };
    const lc = makeLegacyProjectContext({ terrain: pack.terrain, scenario, a: A, b: B }, { presetId: 'd11', packId: pack.meta.id, objectData, transportData: fingerprint });
    const design = projectFromLegacyDesign({ ...startDesign(), ...structuredClone(scenario.initial ?? {}), pis: [] }, lc);
    const index = new ProjectTransportIndex(graph, fingerprint, graph.vectorData, pack.terrain, pack.census);
    const ctx = { legacy: { terrain: pack.terrain, scenario, a: A, b: B, buildings: pack.buildings, roads: pack.roads },
      environment: { objectData, transportData: fingerprint, terrainData: 't', pricingData: 'p', waterData: 'w', terrainClass: 'hilly' as const },
      sourceWays: new Map(graph.sources.flatMap((s: { id: string; legacyNetIndex?: number }) => s.legacyNetIndex === undefined ? [] : [[s.id, s.legacyNetIndex]])) as Map<string, number> };
    const ours = evaluateProject(ctx, { epoch: 'e', revision: 1, design }).routes[design.routes[0].id].legacy!;
    const id = 'osm:way:236292102', length = index.source(id)!.stations.at(-1)!;
    let at = 0, best = Infinity;
    for (let s = 0; s <= length; s += 5) { const p = index.position(id, s)!, k = Math.round(2320 / ours.ds), d = Math.hypot(p.x - ours.x[k], p.y - ours.y[k]); if (d < best) { best = d; at = s; } }
    const command = rebuildCommand(index, derivedStretch(index, id, at, coveredStretches(index, id, [{ ...ours, name: 'our road' }]))!, { routeId: 'route:r1', acousticSourceId: 'acoustic:r1' });
    const edited = structuredClone(design); edited.routes.push(...command.routes); edited.connections.push(...command.connections);
    const q = edited.routes[1]; if (q.alignment.kind !== 'pi') throw new Error('converted');
    expect(q.alignment.pis).toMatchObject([{ r: 104, mapped: true }]);
    const curve = (r: ProjectResult) => r.routes['route:r1'].legacy!.curves[0];
    expect(curve(evaluateProject(ctx, { epoch: 'e', revision: 2, design: edited }))).toMatchObject({ r: 104, auto: false });
    // dragged 23 m off: built anew, a new road's curve, no radius problem
    const g = index.position(id, at)!, g2 = index.position(id, at + 5)!, l = Math.hypot(g2.x - g.x, g2.y - g.y);
    q.alignment.pis[0] = { ...q.alignment.pis[0], x: q.alignment.pis[0].x - (g2.y - g.y) / l * 23, y: q.alignment.pis[0].y + (g2.x - g.x) / l * 23 };
    const r = evaluateProject(ctx, { epoch: 'e', revision: 3, design: edited });
    expect(curve(r)).toMatchObject({ auto: true });
    expect(r.routes['route:r1'].legacy!.violations.filter(v => ['radius', 'transition', 'compound', 'arcShort'].includes(v.kind))).toEqual([]);
  }, 120_000);
});
