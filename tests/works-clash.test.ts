// Owner's Královec review (2026-11-17): a crossed way's earthworks over kept houses and the station tracks, into our
// own cut, and ways closed by two stubs onto their own line passing for a reroute. Every pack's starters, as the
// browser evaluates them (scripts/works-clash-audit.ts): what is drawn of another way's works stands on no house
// left standing, no mapped railway, none of our piers and not in our own body; a cut way is closed only as the
// game's rule allows, and says so. Since the one screen (src/core/works-clash.ts) also screens other mapped roads and our
// road's own body, Auto's clashes still open are a reviewed list (scripts/works-clash-known.json).
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { known, starterClashes, unknownClashes } from '../scripts/works-clash-audit';
import { CLOSURE_ROUND } from '../src/core/crossing-geometry';

describe.skipIf(!existsSync('public/scenarios/d11/meta.json'))('other ways\' works on every pack', () => {
  it('stand on no house, railway, pier, other road or our own body beyond the known open ones, and close only what may be closed', () => {
    const failures: string[] = [], list = known();
    for (const { name, preset, result, clashes } of starterClashes()) {
      // (Auto's own clashes still open are listed, scripts/works-clash-known.json; any other fails)
      for (const c of unknownClashes(preset, clashes, list)) failures.push(`${name} km ${Math.round(c.s)}: ${c.type} ${c.roadId} over ${c.what} ${c.way ?? ''}`);
      for (const c of result.crossings) if (c.type === 'reconnection' || c.type === 'diversion') {
        // a public road is closed only where its traffic goes round at most CLOSURE_ROUND further
        if (c.closure && c.cls !== 'track' && c.cls !== 'service' && !Math.round(c.linkLength ?? 0))
          if (!(c.closure.connected[0] && c.closure.connected[1] && (c.closure.extra ?? Infinity) <= CLOSURE_ROUND)) failures.push(`${name} km ${Math.round(c.s)}: public road closed (${JSON.stringify(c.closure)})`);
        // …and a track or service road serving houses on both parts' sides likewise, unless nothing else can be built (research/86)
        if (c.closure?.serves?.some(Boolean) && c.closure.connected[0] && c.closure.connected[1] && !Math.round(c.linkLength ?? 0) && !c.farClosure && !c.buyout && !((c.closure.extra ?? Infinity) <= CLOSURE_ROUND))
          failures.push(`${name} km ${Math.round(c.s)}: access to houses closed (${JSON.stringify({ ...c.closure, reach: undefined })})`);
        // (or bought out, where that costs less than the way across it replaces, and billed and drawn as bought out)
        if (c.buyout && !(c.accessFor?.length && c.accessFor.every(j => c.houses?.includes(j) && result.demolished.some(p => p.j === j)) && c.cost < (c.buyout.instead?.cost ?? 0)))
          failures.push(`${name} km ${Math.round(c.s)}: a buyout not cheaper or not billed (${JSON.stringify(c.buyout)})`);
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

// Owner (2026-11-20, recurring: "we have embankment interfering with another road if we drag the crossing road"): a
// crossing's ring slid along our road rebuilds the crossed road between its junctions; held on its bridge over our road,
// it rose straight from the junction nodes at its steepest grade (its ramp embankments drawn as fans round the nodes)
// and still missed its deck. A designer keeps a junction's grade there and raises the junction with the ramps, the roads
// meeting there regraded down from it (core/junction-raise.ts).
describe.skipIf(!existsSync('public/scenarios/d11/meta.json'))('a slid crossing between two junctions', () => {
  it('raises the junctions with its ramps: valid, nothing under its works (D11 motorway km 8.39, slid −40 m)', async () => {
    const { playerEdits } = await import('../scripts/works-clash-edits');
    const { projectClashes } = await import('../scripts/works-clash-audit');
    const [edit] = [...playerEdits(['d11:d11-motorway'], 7, { roadIds: [4828], slides: [-40] })];
    const { result, routes } = projectClashes(edit.design);
    const r = result.routes['route:edited'].legacy!;
    expect(routes.find(q => q.id === 'route:edited')!.clashes).toEqual([]);
    expect(result.issues.filter(i => i.scope.routeIds.includes('route:edited')).map(i => i.violation.title)).toEqual([]);
    expect(r.valid).toBe(true);
    // both ends raised: the roads meeting there regraded down from the node (drawn and billed with the junction), the
    // end's fill a cone round it, and a junction's grade within its zone
    const junctions = r.footprintConflicts.filter(f => f.action === 'junction');
    expect(junctions.map(j => (j.geometry?.ties?.length ?? 0) >= 2 && j.cost > 0)).toEqual([true, true]);
    expect(r.cones?.filter(c => c.end).length).toBe(2);
    for (const [a, b] of [[0, 30], [r.length - 30, r.length]]) for (let k = 1; k < r.n; k++)
      if (r.s[k] > a && r.s[k - 1] < b) expect(Math.abs(r.grade[k] - r.grade[k - 1]) / (r.s[k] - r.s[k - 1])).toBeLessThanOrEqual(0.06 + 1e-9);
  }, 300_000);
  it('a class I road under the rebuilt road\'s fill beside its junction is the footprint\'s, a problem (I/35 km 23.13, slid −40 m)', async () => {
    const { playerEdits } = await import('../scripts/works-clash-edits');
    const { projectClashes } = await import('../scripts/works-clash-audit');
    const [edit] = [...playerEdits(['i35-full:i35-full-road'], 7, { roadIds: [5053], slides: [-40] })];
    const { result, routes } = projectClashes(edit.design);
    const r = result.routes['route:edited'].legacy!;
    expect(routes.find(q => q.id === 'route:edited')!.clashes).toEqual([]);
    // (deeper than the junction regrades it: an ordinary road hit, not the junction's mouth)
    expect(r.footprintConflicts.some(f => f.feature === 'road' && f.action === 'blocked' && f.cls === 'primary')).toBe(true);
    expect(r.valid).toBe(false);
  }, 300_000);
});
