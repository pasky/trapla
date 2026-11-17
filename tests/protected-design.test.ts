// Auto keeps out of protected areas as real designers do (research/75): the D35 stage-1 motorway, whose tunnel
// once ended in the nature monument Pod skálou, now runs under it mined and comes out beyond its protected forest,
// in a tunnel no steeper than 3 % (NV 264/2009; research/73).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../src/core/data/categories';
import { TUNNEL_RULES } from '../src/core/data/prices';
import { evaluate } from '../src/core/evaluate';
import { natureHits } from '../src/core/nature-works';
import { cutCoverMask, KIND, tunnelGrade } from '../src/core/structures';

const D35 = 'public/scenarios/d35';
describe.skipIf(!['meta.json', 'protected.json', 'height.i16.gz'].every(f => existsSync(`${D35}/${f}`)))('D35 under the protected escarpment', () => {
  it('tunnels under Pod skálou and its forest, no steeper than 3 %', async () => {
    const { loadPack, evalContext } = await import('../scripts/loadpack');
    const pack = loadPack(D35), ctx = evalContext(pack);
    const d = JSON.parse(readFileSync('scripts/scenarios/d35/d35-stage1-motorway.json', 'utf8')).design;
    const r = evaluate(ctx, d);
    expect(r.violations.map(v => v.title)).toEqual([]);
    const h = Float64Array.from(r.grade, (g, i) => g - r.ground[i]);
    const hits = natureHits({ ...r, crownWidth: CATEGORIES[d.category].crownWidth, cutCover: cutCoverMask(r.kind, r.runs, h, r.ds) }, pack.terrain, true);
    expect(hits.filter(x => x.level === 'ban')).toEqual([]);
    const tunnels = r.runs.filter(q => q.kind === KIND.tunnel);
    expect(tunnels.length).toBeGreaterThan(0);
    for (const t of tunnels) expect(tunnelGrade(t, r.grade, r.ds)).toBeLessThanOrEqual(TUNNEL_RULES.autoMaxGrade + 0.002);
  }, 120_000);
});
