// A new road, motorway or railway built across our route goes through the crossing engine and is grade-separated
// (QA final sweep, main e24df59: "cannot trace where this road goes", "Roads cross here"). The QA's projects,
// saved from the game (window.trapla.getProject()), on the Královec railway mission.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateProject } from '../src/core/project-evaluate';
import { createRailwayRoute } from '../src/core/project-railway';
import type { ProjectDesign, ProjectResult } from '../src/core/project';

const D11 = 'public/scenarios/d11';
const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/qa-final/${name}.json`, 'utf8')) as ProjectDesign;
/** what keeps the project from a total, or makes it invalid, other than the new line's own free ends */
const problems = (r: ProjectResult) => r.issues.filter(i => !['road-ends-nowhere', 'motorway-needs-interchange'].includes(i.code)).map(i => i.violation.title);

describe.skipIf(!['meta.json', 'transport.json.gz', 'overlays.json', 'height.i16.gz'].every(f => existsSync(`${D11}/${f}`)))('new lines across our railway', async () => {
  const { projectContext } = await import('../scripts/eval-project');
  const run = (design: ProjectDesign) => evaluateProject(projectContext(design).ctx, { epoch: 'e', revision: 1, design });
  it('a new road across the valley our railway bridges passes high over that bridge on its own', () => {
    const design = fixture('rail-new-road'), r = run(design);
    expect(problems(r)).toEqual([]);
    const c = r.routes['route:railway'].legacy!.crossings.find(c => c.crossedRoute?.id === design.routes[1].id)!;
    expect(c).toMatchObject({ type: 'bridge', above: true });
  }, 60_000);
  it('a new railway or motorway across it is crossed by our railway, not left as "roads cross here"', () => {
    for (const name of ['rail-new-railway', 'rail-new-motorway']) {
      const design = fixture(name), r = run(design);
      expect(r.issues.filter(i => i.code === 'roads-cross' || i.code === 'roads-overlap')).toEqual([]);
      expect(r.routes['route:railway'].legacy!.crossings.some(c => c.crossedRoute && c.type === 'bridge')).toBe(true);
    }
  }, 120_000);
  it('a new railway across our road is crossed by our road (the mission outranks it)', () => {
    const design = fixture('d11-road'), ours = run(design).routes[design.routes[0].id].legacy!, terrain = projectContext(design).ctx.legacy.terrain;
    const k = Math.round(3000 / ours.ds), nx = -ours.ty[k], ny = ours.tx[k];
    const end = (side: number) => { const x = ours.x[k] + side * 2500 * nx, y = ours.y[k] + side * 2500 * ny;
      return { position: { x, y, z: terrain.heightAt(x, y) }, anchor: { kind: 'free' as const }, binding: 'resolved' as const }; };
    design.routes.push(createRailwayRoute('route:new-rail', 'New railway', { a: end(-1), b: end(1) }, 1, 120));
    const r = run(design);
    expect(r.issues.filter(i => i.code === 'roads-cross' || i.code === 'roads-overlap')).toEqual([]);
    const c = r.routes[design.routes[0].id].legacy!.crossings.find(c => c.crossedRoute?.id === 'route:new-rail');
    expect(['bridge', 'overbridge', 'tunnel']).toContain(c?.type);
    // (and the new railway keeps the height that crossing was built for)
    expect(r.issues.filter(i => i.code === 'crossing').map(i => i.violation.title)).toEqual([]);
  }, 60_000);
});
