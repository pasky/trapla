// Crossing / footprint outcomes found absurd in the model-17 audit (scripts/outcome-audit.ts), on the
// D11 pack: hundreds of metres of ramps for a track, a 148 m track bridge over a cutting instead of
// a cheap reroute, and an automatic road rebuild failing because it met another road.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluate, type Design, type Result } from '../src/core/evaluate';
import { crossingPlanLength } from '../src/core/crossings';
import { regressionContext, regressionPackAvailable } from '../scripts/eval-regression';

const rampsOf = (c: Result['crossings'][number]) => {
  const g = c.geometry!;
  return (g.approaches ?? []).map(a => crossingPlanLength(g.road!.slice(a.start, a.end + 1)));
};
const ramps = (r: Result, roadId: number) => rampsOf(r.crossings.find(c => c.roadId === roadId)!);

describe.skipIf(!regressionPackAvailable())('crossing outcomes on the D11 pack', () => {
  const ctx = regressionPackAvailable() ? regressionContext(false) : undefined!;
  const run = (file: string) => evaluate(ctx, JSON.parse(readFileSync(file, 'utf8')).design as Design);

  it('a service road carried over our road gets short ramps, and the road beside it is rebuilt or closed', () => {
    // Owner report (km 8.64 near bend 11): a service-road bridge over us with ramps running hundreds of
    // metres, and "Road realignment needs engineering … intersects an unhandled road" next to it.
    for (const file of ['tests/fixtures/service-overbridge-design.json', 'tests/fixtures/service-loop-design.json']) {
      const r = run(file);
      expect(r.crossings.find(c => c.roadId === 4826)?.type).toBe('overbridge');
      for (const ramp of ramps(r, 4826)) expect(ramp).toBeLessThan(150);
      expect(r.violations.filter(v => v.kind === 'footprint')).toEqual([]);
      expect(r.footprintConflicts.find(c => c.roadId === 4829)?.action).toBe('relocation');
    }
    // The parallel loop branch is closed: the bridged road already joins both its ends.
    const loop = run('tests/fixtures/service-loop-design.json').footprintConflicts.find(c => c.roadId === 4829)!;
    expect(loop.closed).toBeDefined();
    expect(loop.cost).toBe(0);
  });

  it('every published design stays valid with ramps under 250 m', () => {
    const designs = ['best', 'demo', 'direct-80', 'direct-90', 'town-centre'].map(n => `scripts/${n}-design.json`);
    for (const file of designs) {
      const r = run(file);
      expect(r.valid, file).toBe(true);
      for (const c of r.crossings) for (const ramp of rampsOf(c)) expect(ramp, `${file} km ${c.s}`).toBeLessThan(250);
    }
    // best km 3.70: a track bridge over our road had a 330 m ramp at 6 %; at the 10 % track gradient ≈ 80 m.
    expect(Math.max(...ramps(run('scripts/best-design.json'), 4174))).toBeLessThan(120);
  });

  it('does not keep a 148 m track bridge over a deep cutting when a reroute costs a quarter', () => {
    const c = run('scripts/town-centre-design.json').crossings.find(c => c.roadId === 3637)!;
    expect(c.type).toBe('diversion');
    expect(c.cost).toBeLessThan(25e6);
  });
}, 120_000);
