// A 50 px drag at km 6 of the Královec railway (QA final sweep, main e24df59) left two streams at km 2.07 / 2.36
// in a cutting, 4 km from the drag, and a track at km 6.29 with no buildable crossing ("lower our railway by
// 0.1 m", which was already 6 m deeper than its bridge needs: the track is too steep for its ramps). The QA's projects, saved from the game
// (window.trapla.getProject()): the starter and the same after the drag.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateProject } from '../src/core/project-evaluate';
import type { ProjectDesign } from '../src/core/project';
import type { Result } from '../src/core/evaluate';
import type { GradePinViolation } from '../src/core/grade-pins';
import { railwayDesign, replaceRailwayFromDesign } from '../src/core/project-railway';

const D11 = 'public/scenarios/d11';
const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/qa-final/${name}.json`, 'utf8')) as ProjectDesign;

describe.skipIf(!['meta.json', 'transport.json.gz', 'overlays.json', 'height.i16.gz'].every(f => existsSync(`${D11}/${f}`)))('a drag on the Královec railway', async () => {
  const { projectContext } = await import('../scripts/eval-project');
  const run = (design: ProjectDesign) => evaluateProject(projectContext(design).ctx, { epoch: 'e', revision: 1, design });
  it('stays valid and leaves the grade before the dragged stretch alone', () => {
    const base = run(fixture('rail-kralovec')), drag = run(fixture('rail-kralovec-drag'));
    expect(base.issues.map(i => i.violation.title)).toEqual([]);
    expect(drag.issues.map(i => i.violation.title)).toEqual([]);
    const r0 = base.routes['route:railway'].legacy!, r = drag.routes['route:railway'].legacy!;
    const at = (x: Result, s: number) => x.grade[Math.round(s / x.ds)];
    // the plan moved from km 4.4 on; up to km 1.75 the grade is the starter's (beyond it, the cut before the
    // tunnel of km 1.98–4.5 and that tunnel follow its far end, which the drag moved: one structure)
    for (let s = 0; s <= 1750; s += 50) expect(Math.abs(at(r, s) - at(r0, s))).toBeLessThan(0.1);
    // the track at km 6.29, too steep for a bridge over our cutting or a reroute, passes under our railway: under
    // our bridge, or (since cost model 39, the bridge's ends on fills with their cones) through a box in our embankment,
    // or (since the owner's per-piece rule, model 42) it is closed where both its parts still reach other tracks
    const track = r.crossings.find(c => c.roadId === 3637)!;
    if (track.type === 'diversion') expect(track.closure?.connected).toEqual([true, true]);
    else expect(['bridge', 'underpass']).toContain(track.type);
  }, 120_000);

  // QA sweep 3 second re-check: the profile drag 8 px up at km 2.03 pinned 441.9 m, out of reach of the climb from
  // A. The line stays Auto's own (no far problems), and the height the card suggests is one Auto then meets: the
  // slopes' bound it used to suggest (440.44 m) failed the search again.
  it('leaves an unreachable pin out and suggests a height Auto meets', () => {
    const base = fixture('rail-kralovec'), rail = base.routes.find(r => r.kind === 'railway')!;
    const pinned = (z: number) => replaceRailwayFromDesign(base, rail.id, { ...railwayDesign(base, rail), gradePins: [{ s: 2030, z }] });
    const r0 = run(base).routes['route:railway'].legacy!, out = run(pinned(441.9)).routes['route:railway'].legacy!;
    expect(out.cost.total).toBe(r0.cost.total);
    const v = out.violations.find(v => 'pin' in v) as GradePinViolation;
    expect(out.violations).toEqual([v]);
    expect(v.pin.suggested!.z).toBeLessThan(440.44);
    expect(v.fix).toBe(`Set it to ${v.pin.suggested!.z.toFixed(1)} m, or unpin`);
    const set = run(pinned(v.pin.suggested!.z)).routes['route:railway'].legacy!;
    expect(set.violations.filter(x => 'pin' in x)).toEqual([]);
  }, 120_000);
});
