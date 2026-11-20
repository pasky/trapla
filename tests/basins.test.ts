// Which sea a tunnel's or cut's ends drain to (core/basins.ts, research/100), on the packs' basins.json where they
// are built (pipeline/build_basins.py): the D35 tunnel under the Hřebeč ridge has its ends in the Elbe's and the
// Danube's basins; its second tunnel, both in the Danube's; a map in one basin answers without rings.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { seaAt, watershedLine, type BasinData } from '../src/core/basins';

const load = (pack: string) => JSON.parse(readFileSync(`public/scenarios/${pack}/basins.json`, 'utf8')) as BasinData;
const built = existsSync('public/scenarios/d35-full/basins.json') && existsSync('public/scenarios/d3-0302/basins.json');

describe.skipIf(!built)('basins', () => {
  it('the Hřebeč tunnel drains to two seas, each end checked', () => {
    const b = load('d35-full');
    // the whole D35 starter's tunnels (research/100), local metres
    expect(watershedLine(b, { x: 6201.2, y: 9459.4, s: 4104 }, { x: 9142.0, y: 9075.4, s: 7084 }))
      .toBe('Its ends drain to different seas: rain at its km 4.10 end runs to the North Sea, at its km 7.08 end to the Black Sea.');
    expect(watershedLine(b, { x: 20666.8, y: 6975.8, s: 19072 }, { x: 21097.4, y: 7105.7, s: 19532 })).toBeNull();
  });
  it('a map in one basin', () => {
    const b = load('d3-0302');
    expect(b.basins).toHaveLength(1);
    expect(seaAt(b, 1000, 1000)).toBe('north');
  });
});

describe('seaAt', () => {
  it('even-odd over a basin’s rings: a hole is not in it, outside every basin is no sea', () => {
    const b: BasinData = { version: 1, source: 's', basins: [{ sea: 'black', river: 'Danube', rings: [[0, 0, 100, 0, 100, 100, 0, 100], [40, 40, 60, 40, 60, 60, 40, 60]] },
      { sea: 'north', river: 'Elbe', rings: [[100, 0, 200, 0, 200, 100, 100, 100]] }] };
    expect(seaAt(b, 10, 10)).toBe('black');
    expect(seaAt(b, 50, 50)).toBeNull();
    expect(seaAt(b, 150, 50)).toBe('north');
    expect(seaAt(b, 250, 50)).toBeNull();
  });
});
