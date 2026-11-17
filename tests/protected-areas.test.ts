import { describe, expect, it } from 'vitest';
import { ProtectedAreas } from '../src/core/protected-areas';
import { protectedRule, type ProtectedData } from '../src/core/data/protected';

const square = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];
// a 10 × 10 grid of 10 m cells (100 m square); row 0 is the north edge
const data: ProtectedData = { version: 1, source: 'test', sites: [
  // a monument with a hole in its middle
  { kind: 'PP', name: 'Mon', rings: [square(20, 20, 80, 80), square(40, 40, 60, 60)] },
  // its zone: 10 m round it (the monument itself a hole)
  { kind: 'OP', of: 'PP', name: 'Mon', rings: [square(10, 10, 90, 90), square(20, 20, 80, 80)] },
  // a landscape area, zone III, over the east half
  { kind: 'CHKO', zone: 'III', name: 'Land', rings: [square(50, 0, 100, 100)] },
] };
const areas = new ProtectedAreas(data, 10, 10, 10);
const site = (x: number, y: number, motorway = false) => areas.rulingSite(areas.comboAt(x, y), motorway);

describe('protected areas on the grid', () => {
  it('fills rings even-odd at cell centres', () => {
    expect(site(25, 25)).toBe(0); // the monument
    expect(site(45, 45)).toBe(-1); // its hole
    expect(site(15, 50)).toBe(1); // the zone ring
    expect(site(5, 50)).toBe(-1); // outside everything
    expect(areas.comboAt(95, 5)).toBeGreaterThanOrEqual(0); // inside the landscape area
  });
  it('names the strictest area that takes no works, by road', () => {
    // zone III of a landscape area forbids only motorways
    expect(site(95, 5)).toBe(-1);
    expect(site(95, 5, true)).toBe(2);
    // the monument outranks the landscape area that overlaps it
    expect(site(75, 50, true)).toBe(0);
    expect(areas.combos[areas.comboAt(75, 50)]).toEqual([0, 2]);
  });
  it('visits only the runs of a row in a column range', () => {
    const seen: [number, number, number][] = [];
    areas.rowRuns(5, 0, 9, (c0, c1, combo) => seen.push([c0, c1, combo])); // y 45: zone, monument, hole, monument, zone
    const cols = seen.flatMap(([c0, c1]) => Array.from({ length: c1 - c0 + 1 }, (_, k) => c0 + k));
    expect(cols).toEqual([1, 2, 3, 5, 6, 7, 8, 9]); // col 4 (the hole) is no run; col 5, in the hole, lies in zone III
    expect(seen.find(([c0]) => c0 === 6)![2]).toBe(areas.comboAt(65, 45));
  });
  it('rules by the act: national parks exempt villages, bird areas forbid nothing', () => {
    expect(protectedRule({ kind: 'NP', zone: 'C' }).level).toBe('ban');
    expect(protectedRule({ kind: 'NP', zone: 'C' }, false, true).level).toBe('info');
    expect(protectedRule({ kind: 'PO' }, true).level).toBe('info');
    expect(protectedRule({ kind: 'CHKO', zone: 'II' }).level).toBe('ban');
    expect(protectedRule({ kind: 'OP', of: 'PP' }).level).toBe('consent');
  });
});
