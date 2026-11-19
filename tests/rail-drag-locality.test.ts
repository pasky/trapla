// A 50 px drag at km 6 of the Královec railway (QA final sweep, main e24df59) left two streams at km 2.07 / 2.36
// in a cutting, 4 km from the drag, and a track at km 6.29 with no buildable crossing ("lower our railway by
// 0.1 m", which was already 6 m deeper than its bridge needs: the track is too steep for its ramps). The QA's projects, saved from the game
// (window.trapla.getProject()): the starter and the same after the drag.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateProject } from '../src/core/project-evaluate';
import type { ProjectDesign } from '../src/core/project';
import type { Result } from '../src/core/evaluate';
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

  // The owner's rule (2026-11-19): a pin the player set is honoured; what it costs is said where it is, each problem's fix
  // the pin (a height Auto reaches within the norm there, or unpin), and the line is Auto's own beyond the stretch it
  // re-solves around the pin. Cost model 51 left both pins below out (the bill Auto's own, one problem at the pin).
  const pinned = (z: number) => {
    const base = fixture('rail-kralovec'), rail = base.routes.find(r => r.kind === 'railway')!;
    return replaceRailwayFromDesign(base, rail.id, { ...railwayDesign(base, rail), gradePins: [{ s: 2030, z }] });
  };
  const atS = (x: Result, s: number) => x.grade[Math.round(s / x.ds)];
  const local = (r0: Result, out: Result) => {
    for (let s = 0; s <= r0.length; s += 50) if (s < 1500 || s > 2600) expect(Math.abs(atS(out, s) - atS(r0, s))).toBeLessThan(0.01);
  };
  // QA sweep 3 second re-check: the profile drag 8 px up at km 2.03 pinned 441.9 m, out of reach of the climb from A at
  // its 12.5 ‰ limit: the climb to it steeper, said there; the stream at km 2.087 then runs through the cut, said there.
  it('honours a pin out of reach of the climb, steeper there, and suggests a height Auto meets within the norm', () => {
    const r0 = run(fixture('rail-kralovec')).routes['route:railway'].legacy!, out = run(pinned(441.9)).routes['route:railway'].legacy!;
    expect(Math.abs(atS(out, 2030) - 441.9)).toBeLessThanOrEqual(0.5);
    local(r0, out);
    expect(out.violations.some(v => 'pin' in v)).toBe(false);
    const steep = out.violations.filter(v => v.kind === 'gradient');
    expect(steep.length).toBeGreaterThan(0);
    for (const v of steep) { expect(v.s0).toBeGreaterThanOrEqual(1500); expect(v.s1).toBeLessThanOrEqual(2100); }
    // every problem is the pin's: its fix the suggested height (the slopes' bound, 440.44 m, is out of the search's reach)
    const z = out.violations[0].target!.pin!.z!;
    expect(z).toBeLessThan(440.44);
    for (const v of out.violations) {
      expect(v.target?.pin).toEqual({ s: 2030, z });
      expect(v.fix).toBe(`Set the pin at km 2.03 to ${z.toFixed(1)} m, or unpin`);
    }
    expect(run(pinned(z)).routes['route:railway'].legacy!.violations).toEqual([]);
  }, 120_000);

  // QA P2 fixes re-check (main 5331cc1): 439.5 m is met only 0.9 m too high for the tunnel under the stream at km 2.087
  // (9 m under its bed), so the stream runs through the open cut. Honoured: the stream's problems say so, the fix the pin.
  it('honours a pin that leaves a stream in the cut, and says so at the stream', () => {
    const r0 = run(fixture('rail-kralovec')).routes['route:railway'].legacy!, out = run(pinned(439.5)).routes['route:railway'].legacy!;
    expect(Math.abs(atS(out, 2030) - 439.5)).toBeLessThanOrEqual(0.5);
    local(r0, out);
    expect(out.violations.map(v => v.title).sort()).toEqual(['Our cutting runs through a stream', 'Our earthworks block a stream']);
    const z = out.violations[0].target!.pin!.z!;
    for (const v of out.violations) { expect(v.s0).toBeGreaterThan(2000); expect(v.s1).toBeLessThan(2150); expect(v.target?.pin).toEqual({ s: 2030, z }); }
    expect(run(pinned(z)).routes['route:railway'].legacy!.violations).toEqual([]);
  }, 120_000);
});
