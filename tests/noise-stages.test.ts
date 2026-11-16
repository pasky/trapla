// Staged noise sums (research/36 §2): the grouped far sums stay within FAR_ERROR of the cell-by-cell ones, and
// decisions made from them (refined wherever a threshold lies within that margin) are those of the
// cell-by-cell sums: the same walls, buyouts and violations on every saved design.
import { beforeAll, describe, expect, it } from 'vitest';
import { regressionContext, regressionFixtures, regressionPackAvailable } from '../scripts/eval-regression';
import { NOISE } from '../src/core/data/urban';
import { evaluate, type EvalContext, type Result } from '../src/core/evaluate';
import { NOISE_EXACT } from '../src/core/noise';
import { FAR_ERROR, noiseField, pointTransfer, segmentFlags, transferBuffers, transferDelta, type Sum } from '../src/core/noise-field';

const fixtures = regressionFixtures();
const decisions = (r: Result) => ({
  L: Array.from(r.noise.L), R: Array.from(r.noise.R), bought: r.boughtOut.map((b) => b.j),
  violations: r.violations.map((v) => [v.kind, v.title, v.s0, v.s1, v.target]), valid: r.valid, total: r.cost.total,
});

describe.skipIf(!regressionPackAvailable())('staged noise sums', () => {
  let ctx: EvalContext;
  beforeAll(() => { ctx = regressionContext(); });
  it('grouped sums stay within FAR_ERROR of the cell-by-cell ones (any window, walls, wall change)', () => {
    const worst = [0, 0];
    for (const f of fixtures.filter((x) => ['straight', 'demo', 'direct-80', 'town-centre'].includes(x.name))) {
      const r = evaluate(ctx, structuredClone(f.design)), field = noiseField(r.noise.source!), n = r.n;
      const none = new Float64Array(n), changed = Uint8Array.from(r.noise.L, (v, i) => (v || r.noise.R[i] ? 1 : 0));
      const flags = segmentFlags(field, changed);
      for (const p of r.noise.receivers) {
        const z = Float64Array.from({ length: p.storeys }, (_, k) => p.ground + NOISE.receiverHeight + k * NOISE.storeyHeight);
        for (const scale of [1, 2]) {
          const half = ((p.window[1] - p.window[0]) / 2) * (scale - 1);
          const w0 = Math.max(0, Math.round(p.window[0] - half)), w1 = Math.min(n - 1, Math.round(p.window[1] + half));
          const sums = ([0, 1, 2] as Sum[]).map((sum) => {
            const bare = transferBuffers(z.length), built = transferBuffers(z.length), delta = transferBuffers(z.length);
            pointTransfer(field, p.x, p.y, z, null, null, bare, w0, w1, true, undefined, sum);
            pointTransfer(field, p.x, p.y, z, r.noise.L, r.noise.R, built, w0, w1, true, undefined, sum);
            transferDelta(field, p.x, p.y, z, none, none, r.noise.L, r.noise.R, changed, flags, delta, w0, w1, true, sum);
            return { bare, built, delta };
          });
          for (const s of [0, 1]) for (let k = 0; k < z.length; k++) {
            const a = sums[s], x = sums[2];
            for (const key of ['raw', 'earth', 'screened'] as const) {
              worst[s] = Math.max(worst[s], Math.abs(a.bare[key][k] - x.bare[key][k]) / a.bare[key][k], Math.abs(a.built[key][k] - x.built[key][k]) / a.built[key][k]);
            }
            // a change of walls: the grouped sum with the new walls, by way of the change, against cell by cell
            const after = a.bare.screened[k] + a.delta.screened[k];
            worst[s] = Math.max(worst[s], Math.abs(after - (x.bare.screened[k] + x.delta.screened[k])) / after);
          }
        }
      }
    }
    expect(worst[0]).toBeLessThan(FAR_ERROR[0]);
    expect(worst[1]).toBeLessThan(FAR_ERROR[1]);
    expect(FAR_ERROR[2]).toBe(0);
  }, 60_000);
  for (const f of fixtures) it(`${f.name}: the same walls, buyouts and violations as cell by cell`, () => {
    const staged = evaluate(ctx, structuredClone(f.design));
    NOISE_EXACT.all = true;
    try {
      const cells = evaluate(ctx, structuredClone(f.design));
      expect(decisions(staged)).toEqual(decisions(cells));
      // the houses summed more finely say so (their cards repeat that sum)
      expect(staged.noise.receivers.some((p) => p.sum)).toBe(true);
    } finally { NOISE_EXACT.all = false; }
  }, 60_000);
});
