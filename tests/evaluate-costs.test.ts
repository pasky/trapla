import { beforeAll, describe, expect, it } from 'vitest';
import { bill, regressionFixtures, numericLeaves, regressionContext, regressionPackAvailable } from '../scripts/eval-regression';
import { evaluate, type EvalContext } from '../src/core/evaluate';

// Model 15 changes actual profiles/structures/earthwork, not merely additive bill lines.
// Both recognized packs retain frozen computed bills; the model-13 archive stays untouched.
const fixtures = regressionFixtures();
describe.skipIf(!regressionPackAvailable())('engineered-design bills survive evaluate optimizations', () => {
  let ctx: EvalContext;
  beforeAll(() => { ctx = regressionContext(); });
  for (const f of fixtures) it(f.name, () => {
    const result = evaluate(ctx, structuredClone(f.design));
    const actual = bill(result);
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
    expect(actual.geometryHash).toBe(f.expected.geometryHash);
    expect(actual.valid).toBe(f.expected.valid);
    expect(actual.violations).toEqual(f.expected.violations);
  });
});
