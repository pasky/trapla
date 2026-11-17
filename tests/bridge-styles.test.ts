// Bridge styles (cost model 35, research/50, docs/design-realism-plan.md M3): Auto takes the cheapest style
// that fits; the player's style is kept where it fits and said where it does not; the bill is the price weighed.
import { describe, expect, it } from 'vitest';
import { archRib, bridgeModel, bridgeRunCost, bridgeVariableCosts, ARCH_DECK_DEPTH } from '../src/core/bridge';
import { CATEGORIES } from '../src/core/data/categories';
import { BRIDGE_STYLES } from '../src/core/data/bridges';
import { remedyBridgeSupports, type BridgePrice, type SupportRoute } from '../src/core/support-layout';
import { KIND, type Run } from '../src/core/structures';
import { syntheticTerrain, Terrain } from '../src/core/terrain';
import { styleMask } from '../src/core/overrides';

const model = bridgeModel(CATEGORIES['S9.5']);
/** a 300 m bridge (km 0.095–0.395) on a straight road, deck at `grade`, ground by chainage */
function route(grade: number, ground: (s: number) => number): SupportRoute {
  const n = 61, s = Float64Array.from({ length: n }, (_, i) => i * 10);
  const kind = new Uint8Array(n); kind.fill(KIND.bridge, 10, 40);
  return { n, ds: 10, s, x: Float64Array.from(s, v => 100 + v), y: new Float64Array(n).fill(150), tx: new Float64Array(n).fill(1), ty: new Float64Array(n),
    grade: new Float64Array(n).fill(grade), ground: Float64Array.from(s, ground), crownWidth: 9.5, kind,
    runs: [{ kind: KIND.bridge, i0: 10, i1: 39, s0: 95, s1: 395, length: 300 }] };
}
const priceOf = (r: SupportRoute): BridgePrice => {
  const h = Float64Array.from(r.grade, (z, i) => z - r.ground[i]), bill = bridgeRunCost(model, h, r.ds, () => 0, () => 0);
  return (i0, i1, length, layout, piers, style) => bill(i0, i1, length, layout, piers, style);
};
const flat = () => syntheticTerrain(150, 60, 5, () => 100);
const spans = (run: Run) => { const s = [run.s0, ...run.pierStations ?? [], run.s1]; return s.slice(1).map((v, k) => v - s[k]); };
/** the bill of a run as cost.ts sums it: its cells plus two abutments */
const billed = (r: SupportRoute, run: Run) => {
  let sum = model.abutments;
  for (const [, v] of bridgeVariableCosts(model, Float64Array.from(r.grade, (z, i) => z - r.ground[i]), r.ds, run)) sum += v;
  return sum;
};

describe('bridge styles', () => {
  it('a tall viaduct gets long spans, cheaper than short ones; a low one keeps short spans', () => {
    const tall = route(160, () => 100), result = remedyBridgeSupports(tall, flat(), undefined, undefined, undefined, undefined, undefined, undefined, { price: priceOf(tall) });
    const run = result.runs[0];
    expect(run.style).toBe('long');
    expect(run.styles!.long!).toBeLessThan(run.styles!.short!);
    for (const span of spans(run)) { expect(span).toBeGreaterThanOrEqual(BRIDGE_STYLES.long.minSpan - 1e-6); expect(span).toBeLessThanOrEqual(BRIDGE_STYLES.long.span + 1e-6); }
    expect(billed(tall, run)).toBeCloseTo(run.styles!.long!, 0);
    const low = route(110, () => 100), lowRun = remedyBridgeSupports(low, flat(), undefined, undefined, undefined, undefined, undefined, undefined, { price: priceOf(low) }).runs[0];
    expect(lowRun.style).toBeUndefined();
    expect(lowRun.styles!.short!).toBeLessThan(lowRun.styles!.long!);
  });

  it('over a river too wide for a short span: one long span between its banks, side spans beside it', () => {
    const t = new Terrain({ nx: 150, ny: 60, cell: 5, base: 100, scale: 1, q: new Uint16Array(9000), lc: new Uint8Array(9000),
      watercourses: { version: 1, method: 'test', reaches: [{ id: 1, kind: 'river', width: 80, points: [[345, 50], [345, 250]], catchmentKm2: [10, 10], truncated: [false, false] }] } });
    const r = route(125, () => 100), result = remedyBridgeSupports(r, t, undefined, undefined, undefined, undefined, undefined, undefined, { price: priceOf(r) });
    const run = result.runs[0], s = spans(run), main = Math.max(...s), k = s.indexOf(main);
    expect(result.diagnostics.filter(d => d.reason === 'span-limit')).toEqual([]);
    expect(run.style).toBe('long');
    expect(run.styles!.short).toBeUndefined();
    expect(main).toBeGreaterThan(BRIDGE_STYLES.short.maxSpan);
    for (const j of [k - 1, k + 1]) if (j >= 0 && j < s.length) expect(s[j]).toBeGreaterThanOrEqual(BRIDGE_STYLES.long.sideSpan * main - 1e-6);
    expect(billed(r, run)).toBeCloseTo(run.styles!.long!, 0);
  });

  it('long spans over 60 m on a high deck cost at most the capped share of the 30 m-span price', () => {
    const layout = { span: 120, pierDensity: 1 / 120 };
    expect(model.longPerM(60, layout)).toBeLessThanOrEqual(BRIDGE_STYLES.long.capFactor * model.perM(60) + 1e-6);
    expect(model.longPerM(60, layout)).toBeLessThan(model.perM(60, layout));
    // low, the model's own span price (no evidence it is cheaper)
    expect(model.longPerM(20, layout)).toBe(model.perM(20, layout));
  });

  it('an arch where the valley fits one, its rib clear of the ground; the player’s arch where none fits is said', () => {
    // a valley 40 m deep under a deck 2 m above its rims (x = s − 245 from its middle)
    const valley = (s: number) => { const x = (s - 245) / 150; return Math.abs(x) < 1 ? 120 + 40 * x * x : 160; };
    const r = route(162, valley), asked = new Uint8Array(r.n).fill(3);
    const result = remedyBridgeSupports(r, flat(), undefined, Int8Array.from(asked, () => KIND.bridge), undefined, undefined, undefined, undefined, { asked, price: priceOf(r) });
    const run = result.runs[0], arch = run.arch!;
    expect(run.style).toBe('arch');
    expect(run.styleChosen).toBe('arch');
    const a = arch.s1 - arch.s0;
    expect(a).toBeGreaterThanOrEqual(BRIDGE_STYLES.arch.minArch);
    expect(run.length / a).toBeGreaterThanOrEqual(BRIDGE_STYLES.arch.lengthMin - 1e-9);
    expect(run.length / a).toBeLessThanOrEqual(BRIDGE_STYLES.arch.lengthMax + 1e-9);
    const rib = archRib(arch.s0, arch.s1, valley(arch.s0), valley(arch.s1), 162 - ARCH_DECK_DEPTH);
    for (let s = arch.s0; s <= arch.s1; s += 5) expect(rib(s)).toBeGreaterThanOrEqual(valley(s) - 0.01);
    // priced as a 30 m-span viaduct as high as its highest point, as billed
    expect(billed(r, run)).toBeCloseTo(run.styles!.arch!, 0);
    expect(run.styles!.arch!).toBeGreaterThanOrEqual(run.styles!.short!);
    expect(result.violations).toEqual([]);
    // flat ground under a low deck: no arch; built as Auto would, and said
    const low = route(112, () => 100), none = remedyBridgeSupports(low, flat(), undefined, Int8Array.from(asked, () => KIND.bridge), undefined, undefined, undefined, undefined, { asked, price: priceOf(low) });
    expect(none.runs[0].style).toBeUndefined();
    expect(none.runs[0].styles!.arch).toBeUndefined();
    expect(none.violations.map(v => v.title)).toEqual(['This bridge cannot be built with an arch']);
  });

  it('the style is painted over the bridge and survives normalising', () => {
    const s = Float64Array.from({ length: 11 }, (_, i) => i * 10);
    expect(Array.from(styleMask(s, [{ s0: 20, s1: 60, kind: 1, style: 'long' }, { s0: 60, s1: 80, kind: 2, style: 'arch' }]))).toEqual([0, 0, 2, 2, 2, 2, 0, 0, 0, 0, 0]);
  });
});
