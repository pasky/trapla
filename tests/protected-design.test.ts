// Auto keeps out of protected areas as real designers do (research/75): the D35 stage-1 motorway, whose tunnel
// once ended in the nature monument Pod skálou, now runs under it mined and comes out beyond its protected forest,
// in a tunnel no steeper than the law allows (5 %, NV 264/2009; research/73, /76).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../src/core/data/categories';
import { TUNNEL_RULES } from '../src/core/data/prices';
import { evaluate, type Design } from '../src/core/evaluate';
import { natureHits } from '../src/core/nature-works';
import { cutCoverMask, KIND, tunnelGrade } from '../src/core/structures';

const D35 = 'public/scenarios/d35';
describe.skipIf(!['meta.json', 'protected.json', 'height.i16.gz'].every(f => existsSync(`${D35}/${f}`)))('D35 under the protected escarpment', () => {
  it('tunnels under Pod skálou and its forest, no steeper than 5 %', async () => {
    const { loadPack, evalContext } = await import('../scripts/loadpack');
    const pack = loadPack(D35), ctx = evalContext(pack);
    const d = JSON.parse(readFileSync('scripts/scenarios/d35/d35-stage1-motorway.json', 'utf8')).design as Design;
    const r = evaluate(ctx, d);
    expect(r.violations.map(v => v.title)).toEqual([]);
    const h = Float64Array.from(r.grade, (g, i) => g - r.ground[i]);
    const hits = natureHits({ ...r, crownWidth: CATEGORIES[d.category].crownWidth, cutCover: cutCoverMask(r.kind, r.runs, h, r.ds) }, pack.terrain, true);
    expect(hits.filter(x => x.level === 'ban')).toEqual([]);
    const tunnels = r.runs.filter(q => q.kind === KIND.tunnel);
    expect(tunnels.length).toBeGreaterThan(0);
    for (const t of tunnels) expect(tunnelGrade(t, r.grade, r.ds)).toBeLessThanOrEqual(TUNNEL_RULES.maxGrade + 1e-6);
  }, 120_000);
  it('a road through the same hill gets no long tunnel steeper than 5 %, not even at its ends', async () => {
    // (its grade search once kept the limit only between knots wholly in a tunnel: 5.9 % at the ends of 1.9 km)
    const { loadPack, evalContext } = await import('../scripts/loadpack');
    const ctx = evalContext(loadPack(D35));
    const r = evaluate(ctx, JSON.parse(readFileSync('scripts/scenarios/d35/default.json', 'utf8')).design as Design);
    const long = r.runs.filter(q => q.kind === KIND.tunnel && q.length > TUNNEL_RULES.gradeFromLength);
    expect(long.length).toBeGreaterThan(0);
    for (const t of long) expect(tunnelGrade(t, r.grade, r.ds)).toBeLessThanOrEqual(TUNNEL_RULES.maxGrade + 1e-6);
  }, 120_000);
});
