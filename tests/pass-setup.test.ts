// The passes of one design's evaluation (its retries) share the first pass's setup (evaluate.ts passSetup).
// That is only right while no pass writes to it: hashed when made and after every pass.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { regressionContext, regressionPackAvailable } from '../scripts/eval-regression';
import { evaluate, passCache, type Design } from '../src/core/evaluate';
import { stateHash } from './state-hash';

describe('the setup shared by the passes of an evaluation', () => {
  it('stateHash sees a write anywhere but in a skipped object', () => {
    const skipped = { a: [1] }, state = { m: new Map([[1, { z: new Float64Array([1, 2, NaN]) }]]), list: [{ s: 'x' }], skipped, f: () => 0 };
    const h = stateHash(state, new Set([skipped]));
    skipped.a[0] = 2;
    expect(stateHash(state, new Set([skipped]))).toBe(h);
    state.m.get(1)!.z[1] = 2 + 1e-12;
    expect(stateHash(state, new Set([skipped]))).not.toBe(h);
    state.m.get(1)!.z[1] = 2;
    expect(stateHash(state, new Set([skipped]))).toBe(h);
    state.list[0].s = 'y';
    expect(stateHash(state, new Set([skipped]))).not.toBe(h);
  });

  it.skipIf(!regressionPackAvailable())('is changed by no pass (direct-80: a first pass and its regrade retry)', () => {
    const ctx = regressionContext();
    // (a box asked under the track at km 6.20, on too low an embankment: the retry raises our line for it; since cost model
    // 63 Auto's own reroutes there take no homes, which retried before)
    const saved = JSON.parse(readFileSync('scripts/direct-80-design.json', 'utf8')).design as Design;
    const d: Design = { ...saved, crossingOverrides: [...saved.crossingOverrides ?? [], { roadId: 3564, type: 'underpass' }] };
    // (what the setup only points to: the pack and the design)
    const skip = new Set<unknown>([ctx.terrain, ctx.roads, ctx.buildings, ctx.scenario, ctx.junctions, d]);
    const cache = passCache(), hashes: string[] = [];
    cache.onPass = (shared) => { const { timing: _timing, lap: _lap, ...state } = shared; hashes.push(stateHash(state, skip)); };
    const result = evaluate(ctx, d, { trial: true, passCache: cache });
    expect(result.timing['count.regradeRetry']).toBeGreaterThan(0);
    expect(hashes.length).toBeGreaterThanOrEqual(3); // made, after the first pass, after the retry
    expect(new Set(hashes).size).toBe(1);
    // …and handing in the cache is the evaluation evaluate() runs by itself
    expect(result.cost.total).toBe(evaluate(ctx, d).cost.total);
  });
});
