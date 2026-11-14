import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { legacyBill, fixturePath, numericLeaves, regressionContext, regressionPackAvailable, type CostFixture } from '../scripts/eval-regression';
import { evaluate, type EvalContext } from '../src/core/evaluate';

// Frozen at 2e10999 before performance work; these are computed bills, not price-table assertions.
const fixtures: CostFixture[] = JSON.parse(readFileSync(fixturePath, 'utf8'));
describe.skipIf(!regressionPackAvailable())('saved-design bills survive evaluate optimizations', () => {
  let ctx: EvalContext;
  beforeAll(() => { ctx = regressionContext(); });
  for (const f of fixtures) it(f.name, () => {
    const result = evaluate(ctx, structuredClone(f.design));
    // Model 14's explicit new footprint works are additive; retain the original frozen bills.
    const actual = legacyBill(result);
    const sum = Object.values(result.parts).reduce((total, cells) => total + cells.reduce((a, b) => a + b, 0), 0);
    expect(sum).toBeCloseTo(result.cost.total, 3);
    for (const group of ['cost', 'parts'] as const) {
      const got = new Map(numericLeaves(actual[group]));
      for (const [key, value] of numericLeaves(f.expected[group])) {
        expect(Math.abs(got.get(key)! - value), `${group}.${key}`).toBeLessThan(0.005);
      }
    }
    expect(actual.vpis).toEqual(f.expected.vpis);
    expect(actual.materialValue).toBe(f.expected.materialValue);
  });
});
