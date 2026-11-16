// A 50 px drag at km 6 of the Královec railway (QA final sweep, main e24df59) left two streams at km 2.07 / 2.36
// in a cutting, 4 km from the drag, and a track at km 6.29 with no buildable crossing ("lower our railway by
// 0.1 m", which was already 6 m deeper than its bridge needs: the track is too steep for its ramps). The QA's projects, saved from the game
// (window.trapla.getProject()): the starter and the same after the drag.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateProject } from '../src/core/project-evaluate';
import type { ProjectDesign } from '../src/core/project';
import type { Result } from '../src/core/evaluate';

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
    // the plan moved from km 4.4 on; up to km 2.5 the grade is the starter's
    for (let s = 0; s <= 2500; s += 50) expect(Math.abs(at(r, s) - at(r0, s))).toBeLessThan(0.1);
    // the track at km 6.29, too steep for a bridge over our cutting or a reroute, passes under our bridge
    const track = r.crossings.find(c => c.roadId === 3637);
    expect(track?.type).toBe('bridge');
  }, 120_000);
});
