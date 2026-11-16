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

  it('a service road crossing a low embankment gets short ramps, and the road beside it is rebuilt or closed', () => {
    // Owner report (km 8.64 near bend 11): a service-road bridge over us with ramps running hundreds of
    // metres, and "Road realignment needs engineering … intersects an unhandled road" next to it.
    // Since model 20 the service road is lowered (≈ 3.9 m) under a box instead: shorter ramps, cheaper.
    const r = run('tests/fixtures/service-overbridge-design.json');
    const service = r.crossings.find(c => c.roadId === 4826)!;
    expect(service.type).toBe('underpass'); expect(service.issues ?? []).toEqual([]);
    for (const ramp of ramps(r, 4826)) expect(ramp).toBeLessThan(150);
    expect(r.violations.filter(v => v.kind === 'footprint')).toEqual([]);
    expect(r.footprintConflicts.find(c => c.roadId === 4829)?.action).toBe('relocation');
    // On the loop design the bridge over us would land 7 m up, right where a class III road joins that
    // falls away at 8 % and cannot be regraded to meet it (crossing-works.ts); the reroute along our road
    // cannot be built either. Lowered under a box instead, the joining road is regraded to meet it.
    const loop = run('tests/fixtures/service-loop-design.json');
    const lowered = loop.crossings.find(c => c.roadId === 4826)!;
    expect(lowered.type).toBe('underpass'); expect(lowered.tieLength).toBeGreaterThan(0); expect(loop.valid).toBe(true);
  });

  it('every published design stays valid with ramps under 250 m', () => {
    const designs = ['best', 'demo', 'direct-80', 'direct-90', 'town-centre'].map(n => `scripts/${n}-design.json`);
    for (const file of designs) {
      const r = run(file);
      expect(r.valid, file).toBe(true);
      // the 250 m cap is for ramps up to bridges over us; a junction's regraded approach is not capped (known
      // gap, AGENTS.md: town-centre km 11.65 meets class I road 2136 5.6 m up over 271 m since model 29)
      for (const c of r.crossings) if (c.type !== 'junction') for (const ramp of rampsOf(c)) expect(ramp, `${file} km ${c.s}`).toBeLessThan(250);
    }
    // best km 3.70: a track bridge over our road had a 330 m ramp at 6 %; at the 10 % track gradient ≈ 80 m.
    // Since model 20 the track is lowered 5.8 m under a box instead; its uphill ramp climbs with the
    // track itself (≈ 7 %) at 10 %, ≈ 120 m.
    expect(Math.max(...ramps(run('scripts/best-design.json'), 4174))).toBeLessThan(130);
  });

  it('keeps a track bridge over a deep cutting when the cheaper reroute cannot be built', () => {
    // model 18 preferred a 1.5 km reroute (21.5 M) to this 148 m bridge (90.7 M); that reroute runs on
    // ground far steeper than a track may be, so the bridge stays (model 20)
    const c = run('scripts/town-centre-design.json').crossings.find(c => c.roadId === 3637)!;
    expect(c.type).toBe('overbridge'); expect(c.issues ?? []).toEqual([]);
  });
}, 120_000);
