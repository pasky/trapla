// Twists (core/twists.ts, data/twists.ts): every twist a mission offers is met by a VALID reference design
// (scripts/twists/<preset>/), asks for something (the starter breaks it), and the default twists with every curveball
// and the goal can be met together (the reveal can be reached); and every word of them a player reads is plain.
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { MISSION_TWISTS } from '../src/core/data/twists';
import { CURVEBALLS } from '../src/core/data/curveballs';
import { PRESETS } from '../src/core/data/scenario';
import { jargonIn } from '../src/core/terms';
import { checkTwists, inside, landmarkShape, twistLine, TWIST_NAMES, TWIST_ORDER, zoneRuns, type TwistFacts } from '../src/core/twists';
import { missionLandmarks } from '../src/core/mission-twists';
import type { HeritageData } from '../src/core/heritage';
import type { Result } from '../src/core/evaluate';

describe('twists', () => {
  it('say what they ask in plain words', () => {
    const texts: string[] = [];
    const terms = { earthShare: 0.1, bridgeM: 300, forestHa: 5, budget: 2e9, maxTravelMin: 4, landmarks: [] };
    for (const t of TWIST_ORDER) texts.push(TWIST_NAMES[t], twistLine(t, terms));
    for (const c of Object.values(CURVEBALLS)) texts.push(c.headline, c.story, c.ask, c.zone?.label ?? '');
    for (const m of Object.values(MISSION_TWISTS)) texts.push(m.real.story, m.real.priceText);
    // what the card says, broken and met
    const facts: TwistFacts = { valid: true, cost: 1e9, travelMin: 4, cut: 1e5, fill: 2e5, surplus: 0, deficit: 5e4, forestM2: 9e4,
      tunnels: [{ routeId: 'r', s0: 0, s1: 300, x: 0, y: 0 }], bridges: [{ routeId: 'r', s0: 0, s1: 400, x: 0, y: 0 }], homes: [{ j: 1, x: 0, y: 0 }], results: [] };
    for (const c of checkTwists(TWIST_ORDER, facts, terms, { manual: false, scratch: false, curveballs: [{ id: 'x', headline: 'h', ask: 'Keep the bill under 85 %', budget: 0.5 }], startBill: 1e9 }))
      texts.push(c.name, c.status, ...c.issues.map(i => i.text));
    const bad = texts.flatMap(t => jargonIn(t).map(why => `${why}: ${t}`));
    expect(bad).toEqual([]);
  });

  it('find our line in a place by what it does there: its slopes, its deck, its piers', () => {
    // a straight road east along y = 0, 10 m stations: a fill to x = 100, a bridge 100–300 (one pier at 200), a deep tunnel after
    const n = 51, r = { n, ds: 10, s: new Float64Array(n), x: new Float64Array(n), y: new Float64Array(n), tx: new Float64Array(n).fill(1), ty: new Float64Array(n),
      kind: new Uint8Array(n), grade: new Float64Array(n), ground: new Float64Array(n), dayL: new Float64Array(n).fill(12), dayR: new Float64Array(n).fill(12),
      runs: [{ kind: 1, i0: 10, i1: 30, s0: 100, s1: 300, length: 200, pierStations: [200] }] } as unknown as Result;
    for (let i = 0; i < n; i++) { r.s[i] = r.x[i] = 10 * i; r.kind[i] = i >= 10 && i <= 30 ? 1 : i > 40 ? 2 : 0; r.grade[i] = 100; r.ground[i] = i > 40 ? 130 : 95; }
    const circle = (x: number, y: number, rr: number) => ({ kind: 'circle' as const, x, y, r: rr });
    expect(zoneRuns(r, 'r', circle(50, 18, 8), ['fill']).map(u => u.use)).toEqual(['fill']); // its slope reaches 12 m aside
    expect(zoneRuns(r, 'r', circle(150, 18, 8), ['bridge'], 7)).toEqual([]); // the deck is 7 m aside, not the slope's 12
    expect(zoneRuns(r, 'r', circle(200, 0, 5), ['cut', 'fill', 'pier']).map(u => u.use)).toEqual(['pier']);
    expect(zoneRuns(r, 'r', circle(160, 0, 15), ['cut', 'fill', 'pier'])).toEqual([]); // the deck over it, no pier there
    expect(zoneRuns(r, 'r', circle(450, 0, 10), ['cut', 'fill', 'bridge'])).toEqual([]); // 30 m of ground over a mined tunnel
  });

  it('keep clear of the heritage areas and monuments near the line, not of one at a fixed end', () => {
    // A (0, 0) to B (4000, 0); a zone with a hole across the line, one far off, a cross by the line, a church at B
    const square = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1];
    const heritage: HeritageData = { version: 1, source: 'test', zones: [
      { name: 'Near zone', code: '1', rings: [square(1000, -500, 2000, 500), square(1400, -100, 1600, 100)] },
      { name: 'Far zone', code: '2', rings: [square(1000, 3000, 2000, 4000)] },
    ], monuments: [
      { name: 'Kříž, Ves', kind: 'cross', x: 3000, y: 80, code: '3' },
      { name: 'Kostel, Konec', kind: 'church', x: 4100, y: 0, code: '4' },
    ] };
    const frame = { origin: [0, 0] as const, width: 5000, height: 5000, a: { x: 0, y: 0 }, b: { x: 4000, y: 0 } };
    const found = missionLandmarks({ initial: { pis: [] } } as never, frame, heritage);
    expect(found.map(l => `${l.name} ${l.ring}`)).toEqual(['Near zone 0', 'Kříž, Ves 50']);
    const zone = landmarkShape(found[0]);
    expect([inside(zone, 1200, 0), inside(zone, 1500, 0), inside(zone, 2500, 0)]).toEqual([true, false, false]); // the hole is outside
    expect(inside(zone, found[0].x, found[0].y)).toBe(true); // its name stands in it, not in the hole
    // an end in the hole, 100 m from the zone's ground: the zone still counts
    expect(missionLandmarks({ initial: { pis: [] } } as never, { ...frame, a: { x: 1500, y: 0 } }, heritage).map(l => l.name)).toContain('Near zone');
  });

  for (const preset of Object.keys(MISSION_TWISTS)) {
    const scenario = PRESETS.find(p => (p.presetId ?? p.id) === preset);
    it.skipIf(!scenario || !existsSync(`public/scenarios/${scenario.id}/meta.json`))(`${preset}: every offered twist met by a valid reference design`, async () => {
      const { checkMission } = await import('../scripts/twists-check');
      expect(checkMission(preset, () => {}).failures).toEqual([]);
    }, 300_000);
  }
});
