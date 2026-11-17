import { describe, expect, it } from 'vitest';
import { ProtectedAreas } from '../src/core/protected-areas';
import { PROTECTED_ORDER, protectedRule, type ProtectedData } from '../src/core/data/protected';
import { natureNote, natureProblems, type NatureHit, type NatureWork } from '../src/core/nature-works';
import { Terrain } from '../src/core/terrain';
import { footprintConflicts, type FootprintRoute } from '../src/core/footprint';
import { KIND, type Run } from '../src/core/structures';
import { textGuard } from './player-text-helpers';

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
const site = (x: number, y: number, motorway = false, any = false) => areas.rulingSite(areas.comboAt(x, y), motorway, false, any);

describe('protected areas on the grid', () => {
  it('fills rings even-odd at cell centres', () => {
    expect(site(25, 25)).toBe(0); // the monument
    expect(site(45, 45)).toBe(-1); // its hole
    expect(site(15, 50)).toBe(-1); // the zone ring takes works (with consent)
    expect(site(15, 50, false, true)).toBe(1);
    expect(site(5, 50)).toBe(-1); // outside everything
    expect(areas.comboAt(95, 5)).toBeGreaterThanOrEqual(0); // inside the landscape area
  });
  it('names the strictest area that takes no works, by road', () => {
    // zone III of a landscape area forbids only motorways
    expect(site(95, 5)).toBe(-1);
    expect(site(95, 5, false, true)).toBe(2); // named, works allowed
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

describe('protected-area text', () => {
  it('says what stands where in plain words, with the Act in the rule line', () => {
    const { problems, checkViolation, check } = textGuard();
    for (const kind of PROTECTED_ORDER) for (const zone of kind === 'CHKO' ? ['I', 'II', 'III'] : kind === 'NP' ? ['A'] : [undefined]) {
      const terrain = new Terrain({ nx: 10, ny: 10, cell: 10, base: 0, scale: 0.1, q: new Uint16Array(100), lc: new Uint8Array(100),
        protectedAreas: { version: 1, source: 't', sites: [{ kind, zone, of: kind === 'OP' ? 'PP' : undefined, name: 'Mon', rings: [square(0, 0, 100, 100)] }] } });
      for (const works of [['earth'], ['pier'], ['abutment', 'pier'], ['portal', 'pit'], ['pit', 'earth', 'portal']] as NatureWork[][]) {
        const hits: NatureHit[] = works.map((work, k) => ({ site: 0, level: 'ban', work, i0: k, i1: k, s0: 100 * k, s1: 100 * k + 10, area: 25, x: 5, y: 5 }));
        for (const v of natureProblems(terrain, hits, true, 2000)) { checkViolation(v, `${kind} ${zone ?? ''} ${works}`); expect(v.basis).toBe('law'); }
        check(`${kind} note`, natureNote(terrain, hits.map(h => ({ ...h, level: 'consent' as const })), false));
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('our works in a protected area', () => {
  const n = 101, array = (v: number) => new Float64Array(n).fill(v);
  const route = (kind: number, runs: Run[] = []): FootprintRoute => ({ n, ds: 10, s: Float64Array.from({ length: n }, (_, i) => i * 10),
    x: Float64Array.from({ length: n }, (_, i) => 100 + i * 10), y: array(250), tx: array(1), ty: array(0),
    kind: new Uint8Array(n).fill(kind), grade: array(105), dayL: array(20), dayR: array(20), zDayL: array(100), zDayR: array(100), crownWidth: 10, runs });
  // a monument 80 m long across the route (km 0.40–0.48) and its 50 m zone round it
  const terrain = new Terrain({ nx: 260, ny: 100, cell: 5, base: 0, scale: 0.01, q: new Uint16Array(26000).fill(10000), lc: new Uint8Array(26000),
    protectedAreas: { version: 1, source: 't', sites: [{ kind: 'PP', name: 'Mon', rings: [square(500, 200, 580, 300)] },
      { kind: 'OP', of: 'PP', name: 'Mon', rings: [square(450, 150, 630, 350), square(500, 200, 580, 300)] }] } });
  it('earthworks in a monument are against the law; in its zone they are not', () => {
    const v = footprintConflicts(route(KIND.earth), terrain, undefined, [], []).violations;
    expect(v.map(x => [x.basis, x.title, x.s0, x.s1])).toEqual([['law', 'Our earthworks reach into a nature monument', 395, 485]]);
    expect(v[0].rule).toMatch(/§36/);
  });
  it('a bridge with no supports in the monument takes nothing; one with a pier in it does', () => {
    const clear: Run = { kind: KIND.bridge, i0: 0, i1: 100, s0: 0, s1: 1000, length: 1000, pierStations: [300, 600] };
    expect(footprintConflicts(route(KIND.bridge, [clear]), terrain, undefined, [], []).violations).toEqual([]);
    const pier = { ...clear, pierStations: [300, 440, 600] };
    expect(footprintConflicts(route(KIND.bridge, [pier]), terrain, undefined, [], []).violations.map(x => x.title)).toEqual(['A bridge pier stands in a nature monument']);
  });
});
