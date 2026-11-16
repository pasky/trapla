// Ways merged into one crossing (within 30 m of each other along our road) share its treatment; one our
// earthworks would then bury is a crossing of its own (QA final sweep, main e24df59: a 60 px drag at km 30
// of the whole D3 left "Our earthworks cover 41 m of a track" at km 29.6).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scenarioParams } from '../src/core/data/scenario';
import { objectDataKey } from '../src/core/build-controls';
import { makeLegacyProjectContext, projectFromLegacyDesign, legacyDesignForRoute, replaceRouteFromLegacy } from '../src/core/project-legacy';
import { createMotorwayProject } from '../src/core/project-motorway';
import { evaluateProject } from '../src/core/project-evaluate';
import { registerNet } from '../src/core/project-roadnet';
import { buildAlignment, nearestLeg, station } from '../src/core/horizontal';
import { horizontalRules } from '../src/core/data/norms';
import { NOISE } from '../src/core/data/urban';
import { startDesign } from '../src/state';

const DIR = 'public/scenarios/d3-full';
describe.skipIf(!['meta.json', 'transport.json.gz', 'overlays.json', 'height.i16.gz'].every(f => existsSync(`${DIR}/${f}`)))('whole D3', () => {
  it('a drag at km 30 treats both tracks that cross there, none is buried', async () => {
    const { loadPack } = await import('../scripts/loadpack');
    const { projectContext } = await import('../scripts/eval-project');
    const pack = loadPack(DIR), scenario = scenarioParams('d3-full');
    const objectData = objectDataKey(pack.overlays.buildings, pack.overlays.binfo, pack.overlays.net);
    registerNet(objectData, pack.overlays.net.ways.length);
    const transportData = JSON.parse(readFileSync(`${DIR}/transport-meta.json`, 'utf8')).fingerprint;
    const A = { x: pack.meta.A.xy[0], y: pack.meta.A.xy[1] }, B = { x: pack.meta.B.xy[0], y: pack.meta.B.xy[1] };
    const lc = makeLegacyProjectContext({ terrain: pack.terrain, scenario, a: A, b: B }, { presetId: scenario.presetId ?? scenario.id, packId: pack.meta.id, objectData, transportData });
    const design = createMotorwayProject(projectFromLegacyDesign({ ...startDesign(), category: 'S9.5', speed: 90 }, lc),
      { ...startDesign(), ...structuredClone(scenario.initial ?? {}) }, { aadt: scenario.traffic, heavyShare: scenario.heavyShare ?? NOISE.heavyShare });
    const fwd = design.routes[0], shown = legacyDesignForRoute(design, fwd.id), a = fwd.endpoints.a.position, b = fwd.endpoints.b.position;
    const st = station(buildAlignment(a, b, shown.pis, horizontalRules(shown.speed, shown.category)), 5), k = 6000;
    const p = { x: st.x[k], y: st.y[k] };
    // the road pulled 60 m sideways at km 30: two tracks 30 m apart now cross it within one merged crossing
    shown.pis.splice(nearestLeg(a, b, shown.pis, p), 0, { x: p.x - st.ty[k] * 60, y: p.y + st.tx[k] * 60, r: null });
    const next = replaceRouteFromLegacy(design, fwd.id, shown);
    const r = evaluateProject(projectContext(next).ctx, { epoch: 'e', revision: 1, design: next });
    // (on the stretch the drag changed, from the bend before it at km 16; with cost model 31's lower grade line
    // the 4 % climb from km 7.5 leaves the 30 m span over a track at km 16.66 0.1 m short of its deck depth,
    // which no lift within the grade limit reaches: reported, with that reason)
    expect(r.issues.filter(i => !(i.locations?.[0]?.s0 && Math.abs(i.locations[0].s0 - 16659) < 5)).map(i => i.violation.title)).toEqual([]);
    const near = r.routes[fwd.id].legacy!.crossings.filter(c => c.s > 29500 && c.s < 29700 && c.cls === 'track');
    expect(near.map(c => c.type)).toEqual(['diversion', 'diversion']);
  }, 120_000);
});
