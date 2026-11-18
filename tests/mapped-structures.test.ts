// Mapped road bridges and tunnels (a pack's structures.json, pipeline/build_structures.py) are crossings like any other
// (the owner's D11 report: the local road's 60 m bridge over the planned D11, which the crossing network left out, was
// drawn flat across our cut, not selectable, nothing built or billed). A bridge our road passes under with room is kept
// as it stands; one too low is rebuilt and billed.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RoadNet, withStructures } from '../src/core/roadnet';
import { evaluate, type Design } from '../src/core/evaluate';
import { crossingOutcome } from '../src/core/terms';

describe('a road net with mapped structures', () => {
  const net = new RoadNet(withStructures({ cls: ['tertiary', 'track'], ways: [[0, 0, 0, 100, 0], [0, 140, 0, 240, 0]] },
    { version: 1, cls: ['motorway', 'tertiary'], ways: [[1, 100, 0, 140, 0]], kind: ['bridge'] }));
  it('adds them after the net\'s own ways, joined to the ways either side', () => {
    expect(net.wayCount).toBe(3);
    expect(net.structure(2)).toEqual({ kind: 'bridge', xy: [100, 0, 140, 0] });
    expect(net.structure(1)).toBeUndefined();
    expect(net.wayClass(2)).toBe('tertiary');
    // (the way runs on over its bridge: a crossing's path reaches beyond it)
    const path = net.connectedCrossingPath(0, 50, 0, 200);
    expect(path[path.length - 1].x).toBe(240);
  });
  it('an edited network keeps them', () => {
    const edited = net.edited([{ way: 0, d0: 10, d1: 20 }], [{ cls: 'track', xy: [0, 50, 10, 50] }]);
    expect(edited.structure(2)?.kind).toBe('bridge');
  });
});

const DIR = 'public/scenarios/d11';
const fixture = (name: string): Design => JSON.parse(readFileSync(`tests/fixtures/${name}`, 'utf8')).design;
describe.skipIf(!existsSync(`${DIR}/structures.json`))('D11 along the official line: the local road\'s bridge at km 6.30', async () => {
  const { loadPack, evalContext } = await import('../scripts/loadpack');
  const pack = loadPack(DIR), ctx = evalContext(pack);
  const at = (r: ReturnType<typeof evaluate>) => r.crossings.find(c => pack.roads!.structure(c.roadId)?.kind === 'bridge' && Math.abs(c.s - 6300) < 100)!;
  it('with Auto\'s grade 3.5 m under its deck: rebuilt higher on ramps, billed', () => {
    const c = at(evaluate(ctx, fixture('d11-official-line-design.json')));
    expect(c).toBeDefined();
    expect(c.mapped).toBe('bridge');
    expect([c.type, c.kept, c.h < -3 && c.h > -4]).toEqual(['overbridge', undefined, true]);
    expect(c.cost).toBeGreaterThan(10e6);
    expect(crossingOutcome(c).explain).toMatch(/old bridge here is too low or too short/);
  });
  it('with the grade by hand 11 m under it: kept as it stands, nothing billed, its deck drawn over our cut', () => {
    const c = at(evaluate(ctx, fixture('d11-official-line-lowered-design.json')));
    expect([c.type, c.kept, c.cost]).toEqual(['overbridge', true, 0]);
    expect(crossingOutcome(c).label).toBe('Existing bridge kept');
    // the whole mapped bridge (60 m) is drawn as its deck, at the level of its ends, no ramps
    const g = c.geometry!, deck = g.road!.slice(g.deck!.start, g.deck!.end + 1);
    expect(c.span).toBeGreaterThan(58); expect(c.approachLength).toBe(0);
    expect(deck.every(q => q.surface === 'deck')).toBe(true);
    expect(Math.abs(deck[0].z - pack.terrain.heightAt(deck[0].x, deck[0].y))).toBeLessThan(0.3);
  });
});
