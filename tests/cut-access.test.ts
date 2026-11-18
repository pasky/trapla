// The owner's D11 km 17.67 case (2026-11-18): the service road that is the access to a hamlet east of our road (the
// saved best design, its bend near km 17.6 moved 60 m east). A track or service road serving buildings is closed only
// as a public road is (its traffic going round at most CLOSURE_ROUND further, research/86): Auto keeps the hamlet's way
// across; the player's "Cut it", whose new road cannot reach a crossing (a railway on the ground), closes it and says
// what each part still reaches and how far round; a part's end dragged onto road I/16 is led there.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluate, type Design } from '../src/core/evaluate';
import { crossingOutcome } from '../src/core/terms';

const D11 = 'public/scenarios/d11';
describe.skipIf(!existsSync(`${D11}/meta.json`))('a cut service road that serves a hamlet (D11 km 17.67)', async () => {
  const { loadPack, evalContext } = await import('../scripts/loadpack');
  const { scenarioParams } = await import('../src/core/data/scenario');
  const ctx = evalContext(loadPack(D11), scenarioParams('d11'));
  const design: Design = JSON.parse(readFileSync('scripts/best-design.json', 'utf8')).design;
  design.pis[14].x += 60;
  const SERVICE = 5531;
  const at = (d: Design) => { const r = evaluate(ctx, d); return { r, c: r.crossings.find(c => c.roadId === SERVICE)! }; };
  it('Auto keeps the hamlet\'s way across our road', () => {
    const { r, c } = at(design);
    expect(Math.round(c.s)).toBe(17667);
    expect(c.type).toBe('underpass'); expect(c.issues ?? []).toEqual([]); expect(r.valid).toBe(true);
  }, 60_000);
  it('the player\'s "Cut it" with no new road to a crossing is closed, and the card says what each part reaches', () => {
    const { r, c } = at({ ...structuredClone(design), crossingOverrides: [{ roadId: SERVICE, type: 'reconnection' }] });
    expect(c.closure?.connected).toEqual([true, true]);
    expect(c.closure?.serves).toEqual([true, false]);
    expect(c.farClosure).toBe(true); expect(c.issues ?? []).toEqual([]); expect(r.valid).toBe(true);
    // each part is drawn from where it ends, beyond our earthworks, to the road it still reaches
    expect(c.closure?.reach?.map(p => p?.cls)).toEqual(['primary', 'tertiary']);
    const o = crossingOutcome(c, 'road', (way) => way === c.closure!.reach![0]!.way ? 'road I/16' : undefined);
    expect(o.label).toBe('Cut · no new road needed');
    expect(o.explain).toBe('The service road is cut by our road. The east part still reaches road I/16, the west part a class III road; each just ends at our earthworks. Its traffic has no way round over other roads within 1.5 km. No new road can lead it to a crossing from here.');
  }, 60_000);
  it('a part\'s end led onto road I/16 is built there, the other part still just ends', () => {
    const { c } = at({ ...structuredClone(design), crossingOverrides: [{ roadId: SERVICE, type: 'reconnection', ends: [{ way: 2243, x: 11780, y: 18122 }, null] }] });
    expect(c.endTo?.[0]?.built).toBe(true); expect(c.issues ?? []).toEqual([]);
    expect(c.geometry?.links?.[0].length).toBeGreaterThan(1); expect(c.geometry?.links?.[1].length).toBe(0);
    expect(c.closure?.connected).toEqual([false, true]);
  }, 60_000);
});
