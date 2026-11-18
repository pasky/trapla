// Owner's Královec review (2026-11-17): a crossed way's earthworks over kept houses and the station tracks, into our
// own cut, and ways closed by two stubs onto their own line passing for a reroute. Every pack's starters, as the
// browser evaluates them (scripts/works-clash-audit.ts): what is drawn of another way's works stands on no house
// left standing, no mapped railway, none of our piers and not in our own body; a cut way is closed only as the
// game's rule allows, and says so.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { starterClashes } from '../scripts/works-clash-audit';
import { CLOSURE_ROUND } from '../src/core/crossing-geometry';

/** Screen resolution: walls are placed at the crossing's own samples (≤ 10 m apart, reroutes 5 m) and the renderer
 * refines between them; a toe reaching a metre further between two samples is not a missed remedy. */
const TOLERANCE = { railway: 2, ours: 4 };

describe.skipIf(!existsSync('public/scenarios/d11/meta.json'))('other ways\' works on every pack', () => {
  it('stand on no house, railway, pier or our own body, and close only what may be closed', () => {
    const failures: string[] = [];
    for (const { name, result, clashes } of starterClashes()) {
      const by = new Map<string, typeof clashes>();
      for (const c of clashes) { const k = `${Math.round(c.s)}:${c.roadId}:${c.what}`; (by.get(k) ?? by.set(k, []).get(k)!).push(c); }
      for (const [k, list] of by) {
        const what = list[0].what, allowed = what === 'railway' || what === 'ours' ? TOLERANCE[what] : 0;
        if (list.length > allowed) failures.push(`${name} km ${k}: ${list.length} × ${what}`);
      }
      for (const c of result.crossings) if (c.type === 'reconnection' || c.type === 'diversion') {
        // a public road is closed only where its traffic goes round at most CLOSURE_ROUND further
        if (c.closure && c.cls !== 'track' && c.cls !== 'service' && !Math.round(c.linkLength ?? 0))
          if (!(c.closure.connected[0] && c.closure.connected[1] && (c.closure.extra ?? Infinity) <= CLOSURE_ROUND)) failures.push(`${name} km ${Math.round(c.s)}: public road closed (${JSON.stringify(c.closure)})`);
        // no reroute of next to nothing that is not said to be a closure (two stubs onto the way's own line)
        if (!c.closure && !c.moved && !c.issues?.length && (c.linkLength ?? 0) > 0 && (c.linkLength ?? 0) < 20) failures.push(`${name} km ${Math.round(c.s)}: a ${Math.round(c.linkLength!)} m reroute`);
      }
    }
    expect(failures).toEqual([]);
  }, 300_000);
});

// Roads we move aside (footprint relocations) and the turning areas at cut roads' ends: what they are drawn over
// is bought out (the demo design's service road at km 6.93 was moved aside through a 550 m² building, unbilled).
describe.skipIf(!existsSync('public/scenarios/d11/meta.json'))('roads moved aside', () => {
  it('stand on no house left standing', async () => {
    const { readFileSync } = await import('node:fs');
    const { evalContext, loadPack } = await import('../scripts/loadpack');
    const { evaluate } = await import('../src/core/evaluate');
    const { worksClashes } = await import('../scripts/works-clash-audit');
    const ctx = evalContext(loadPack('public/scenarios/d11'));
    const r = evaluate(ctx, JSON.parse(readFileSync('scripts/demo-design.json', 'utf8')).design);
    expect(worksClashes(r, ctx, 9.5).filter(c => c.what === 'house')).toEqual([]);
    expect(r.demolished.filter(d => d.in === 'reroute').map(d => d.j)).toContain(22326);
  }, 120_000);
});
