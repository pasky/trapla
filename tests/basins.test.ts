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
