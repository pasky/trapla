import { describe, expect, it } from 'vitest';
import { bridgeLayout, bridgeModel, bridgeRunCost } from '../src/core/bridge';
import { cellLength, costParts, landPerM2, surchargeRate, sumParts } from '../src/core/cost';
import { CATEGORIES } from '../src/core/data/categories';
import { chooseStructures, KIND } from '../src/core/structures';

describe('geometry-priced bridges', () => {
  it('normalizes the complete reference object, not a deck plus a second charge for bundled supports', () => {
    for (const row of Object.values(CATEGORIES)) {
      const model = bridgeModel(row);
      expect(model.total(120, model.referenceHeight)).toBeCloseTo(row.bridgePerKm * 0.12, 5);
      expect(model.total(120, model.referenceHeight + 27)).toBeCloseTo(row.bridgePerKm * 0.12 * 1.3, 5);
      expect(model.estimatePerM(model.referenceHeight) * 120).toBeCloseTo(model.total(120, model.referenceHeight), 5);
    }
  });

  it('prices height and foundations only where supports exist, and charges longer clear spans more per area', () => {
    const model = bridgeModel(CATEGORIES['S9.5']);
    expect(model.total(120, 40)).toBeGreaterThan(model.total(120, 10));
    expect(model.total(30, 40)).toBe(model.total(30, 10)); // bank-top abutments, no pier
    expect(model.total(120, 10, bridgeLayout(120), 25)).toBeGreaterThan(model.total(120, 10));
    const single = (span: number) => model.perM(0, { span, pierDensity: 0 });
    expect(single(70)).toBeGreaterThan(single(40));
    expect(single(40)).toBeGreaterThan(single(20));
    expect(model.total(30, 10) / 30).toBeGreaterThan(single(30)); // fixed endpoints are not lost
  });

  it('matches selector and bill over varying heights/urban rates, clipped endpoints and split runs', () => {
    const n = 21, ds = 10, h = Float64Array.from({ length: n }, (_, i) => 6 + i);
    const urban = Float64Array.from(h, (_, i) => i / (n - 1));
    const model = bridgeModel(CATEGORIES['S9.5']);
    for (const ranges of [[[0, 20]], [[0, 0], [4, 10], [15, 20]]]) {
      const kind = new Uint8Array(n), width = new Float64Array(n), zero = new Float64Array(n);
      const runs = ranges.map(([i0, i1]) => {
        let length = 0;
        for (let i = i0; i <= i1; i++) { kind[i] = KIND.bridge; width[i] = model.width; length += cellLength(i, n, ds); }
        return { kind: KIND.bridge, i0, i1, length, s0: 0, s1: length };
      });
      const parts = costParts({ category: 'S9.5', terrainClass: 'hilly', n, ds, kind, h, urban, width, runs,
        cutI: zero, cutII: zero, cutIII: zero, fill: zero, usable: 0.85, haul: { moment: 0, reused: 0, surplus: 0, deficit: 0 } });
      const price = bridgeRunCost(model, h, ds, i => surchargeRate(urban[i]), i => landPerM2(urban[i]));
      for (const r of runs) {
        expect(sumParts(parts, r.i0, r.i1).total).toBeCloseTo(price(r.i0, r.i1, r.length), 5);
        const layout = bridgeLayout(r.length);
        let variable = 0, billed = 0;
        for (let i = r.i0; i <= r.i1; i++) {
          variable += cellLength(i, n, ds) * model.perM(h[i], layout); billed += parts.bridges[i];
        }
        expect(billed - variable).toBeCloseTo(model.abutments, 5);
      }
    }
  });

  it('rejects a locally cheap but fixed-cost-expensive run, while preserving forced and painted bridges', () => {
    const n = 13, input = { ds: 10, h: new Float64Array(n).fill(20),
      earthPerM: new Float64Array(n).fill(200), bridgePerM: 100, tunnelPerM: 1e6,
      bridgeRunCost: (_a: number, _b: number, length: number) => length * 100 + 20_000 };
    expect(chooseStructures(input).runs).toEqual([]);
    const forced = new Uint8Array(n); forced[6] = 1;
    expect(chooseStructures({ ...input, forced }).runs).toHaveLength(1);
    const overrides = new Int8Array(n).fill(-1); overrides.fill(KIND.bridge, 4, 7);
    expect(chooseStructures({ ...input, overrides }).runs).toHaveLength(1);
    // A long viable automatic run split by earth paint must reprice each remnant's abutments.
    const long = { ...input, h: new Float64Array(101).fill(20), earthPerM: new Float64Array(101).fill(200) };
    const paint = new Int8Array(101).fill(-1); paint.fill(KIND.earth, 10, 91);
    expect(chooseStructures({ ...long, overrides: paint }).runs).toEqual([]);
  });
});
