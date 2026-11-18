import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { fitPlacedBend } from '../src/core/bend-fit';
import { dropStraightBends, passBends } from '../src/core/bend-order';
import { ROAD_CHECKS } from '../src/core/checks';
import { bendRules, horizontalRules, speedNorms } from '../src/core/data/norms';
import { buildAlignment, nearestLeg, type PI } from '../src/core/horizontal';

// QA sweep 3 re-check (playtest-findings, screenshot 427): D35 first section, the motorway clicked at km 12 and
// dragged 40 px along itself; the new bend landed at (14876, 3860), beyond bend 7 at (14565, 3795): "Bend 7 turns
// back almost on itself (178°)". The drag as the editor plays it, frame by frame (map-gestures onPiDrag), then
// the placed bend's fit on release.
it('a drag along the road past the next bend reorders the bends instead of folding the line', () => {
  const d = JSON.parse(readFileSync('scripts/scenarios/d35/d35-stage1-motorway.json', 'utf8')).design;
  const a = { x: 2393.8, y: 3212 }, b = { x: 18222.3, y: 2459.4 }; // the pack's A and B
  const problems = (pis: readonly PI[]) => {
    const al = buildAlignment(a, b, [...pis], horizontalRules(d.speed, d.category), bendRules([...pis], d.speed, d.category));
    return ROAD_CHECKS.horizontal(al, speedNorms(d.speed, d.category), { a, b, pis: [...pis], category: d.category }).map(v => v.title);
  };
  const start = { x: 13962, y: 3697.6 }, end = { x: 14876, y: 3860 };
  let pis: readonly PI[] = d.pis.map((p: PI) => ({ ...p }));
  let i = nearestLeg(a, b, [...pis], start);
  pis = [...pis.slice(0, i), { ...start, r: null }, ...pis.slice(i)];
  const passed = pis[i + 1];
  for (let f = 1; f <= 20; f++) {
    const moved = pis.map((p, k) => k === i ? { ...p, x: start.x + (end.x - start.x) * f / 20, y: start.y + (end.y - start.y) * f / 20 } : p);
    ({ pis, i } = passBends(a, b, moved, i));
  }
  expect(pis[i]).toMatchObject(end);
  expect(pis[i - 1]).toBe(passed); // the bend it passed comes first now
  expect(problems(pis).some(t => /turns back/.test(t))).toBe(false);
  expect(problems(fitPlacedBend(a, b, pis, i, d.category, d.speed) ?? pis)).toEqual([]);
  // dragged back, the two swap back
  const back = passBends(a, b, pis.map((p, k) => k === i ? { ...p, ...start } : p), i);
  expect(back.i).toBe(i - 1);
  expect(back.pis[i]).toBe(passed);
});

it('leaves a hairpin and an ordinary sharp neighbour alone', () => {
  // a serpentine: dragged onto the leg back from the next bend, a hairpin, the bend stays before it (an ordinary
  // bend there would be passed)
  const a = { x: 0, y: 0 }, b = { x: 0, y: 200 };
  const serpentine = (hairpin: boolean): PI[] => [{ x: 100, y: 99, r: null }, { x: 1000, y: 0, r: null, ...(hairpin ? { hairpin } : {}) }, { x: 0, y: 100, r: null }];
  expect(passBends(a, b, serpentine(true), 0).i).toBe(0);
  expect(passBends(a, b, serpentine(false), 0).i).toBe(1);
  // a bend pulled out sideways: its neighbours turn sharply, but it has passed none of them
  const side: PI[] = [{ x: 0, y: 1000, r: null }, { x: 300, y: 1200, r: null }, { x: 600, y: 1000, r: null }];
  expect(passBends({ x: 0, y: 0 }, { x: 600, y: 0 }, side.map((p, k) => k === 1 ? { ...p, y: 3000 } : p), 1).i).toBe(1);
});

// QA P2 fixes re-check (screenshot 471): D35 km 4.2, the new bend dragged 50 px back along the road passes bend 2 and
// ends 137 m before it, on the line through bend 2 and bend 3: bend 2 is then "Bend 3 · turns 0° · no curve
// (straight)". On release it goes; a real bend, a hairpin and the dragged bend where it bends stay.
it('a bend a drag leaves on the line goes on release', () => {
  const d = JSON.parse(readFileSync('scripts/scenarios/d35/d35-stage1-motorway.json', 'utf8')).design;
  const a = { x: 2393.8, y: 3212 }, b = { x: 18222.3, y: 2459.4 };
  const b2: PI = d.pis[1], b3: PI = d.pis[2];
  const L = Math.hypot(b3.x - b2.x, b3.y - b2.y), ux = (b3.x - b2.x) / L, uy = (b3.y - b2.y) / L;
  const start = { x: b2.x + 0.3 * L * ux, y: b2.y + 0.3 * L * uy }, end = { x: b2.x - 137 * ux, y: b2.y - 137 * uy };
  let pis: readonly PI[] = d.pis.map((p: PI) => ({ ...p }));
  let i = nearestLeg(a, b, [...pis], start);
  pis = [...pis.slice(0, i), { ...start, r: null }, ...pis.slice(i)];
  for (let f = 1; f <= 10; f++) {
    const moved = pis.map((p, k) => k === i ? { ...p, x: start.x + (end.x - start.x) * f / 10, y: start.y + (end.y - start.y) * f / 10 } : p);
    ({ pis, i } = passBends(a, b, moved, i));
  }
  expect(i).toBe(1);
  expect(pis[2]).toMatchObject({ x: b2.x, y: b2.y });
  const out = dropStraightBends(a, b, pis, [i - 1, i, i + 1]);
  expect(out.dropped).toEqual([2]);
  expect(out.pis.length).toBe(d.pis.length);
  expect(out.pis[1]).toMatchObject(end);
  // a hairpin on the line stays; nothing else of the line goes
  expect(dropStraightBends(a, b, pis.map((p, k) => k === 2 ? { ...p, hairpin: true } : p), [1, 2, 3]).dropped).toEqual([]);
  expect(dropStraightBends(a, b, d.pis, [0, 1, 2, 3]).dropped).toEqual([]);
});

// QA second-round re-check (screenshot 479): the same drag in the editor's perspective ends at (5228, 4541.8), a little
// off that line: bend 2's corner then turns 2.2°, but the curve fit leaves it out (it turns against the dragged bend
// where no S-curve fits, 4.9 m off the line between its neighbours) and the card said "turns 0° · no curve
// (straight)" with radius and speed choices. On release it goes too, and the line is the same; the dragged bend
// stays, and so does a neighbour whose radius or speed the player set.
it('a neighbour the curve fit leaves out after a drag goes on release', () => {
  const d = JSON.parse(readFileSync('scripts/scenarios/d35/d35-stage1-motorway.json', 'utf8')).design;
  const a = { x: 2393.8, y: 3212 }, b = { x: 18222.3, y: 2459.4 };
  const pis: PI[] = [d.pis[0], { x: 5228, y: 4541.8, r: null }, ...d.pis.slice(1)];
  const build = (ps: readonly PI[]) => buildAlignment(a, b, [...ps], horizontalRules(d.speed, d.category), bendRules([...ps], d.speed, d.category));
  const before = build(pis), left = before.curves[2];
  expect(left).toMatchObject({ index: 2, ignored: true });
  expect(left.offset).toBeCloseTo(4.9, 1);
  const fit = { speed: d.speed, category: d.category, dragged: 1 };
  expect(dropStraightBends(a, b, pis, [0, 1, 2]).dropped).toEqual([]); // not straight: 2.2°
  const out = dropStraightBends(a, b, pis, [0, 1, 2], fit);
  expect(out.dropped).toEqual([2]);
  const after = build(out.pis);
  expect(after.length).toBeCloseTo(before.length, 6);
  expect(after.curves.map(c => [c.x, c.y, c.rEff, c.sStart])).toEqual(before.curves.filter(c => c.index !== 2).map(c => [c.x, c.y, c.rEff, c.sStart]));
  // the dragged bend, a radius or a speed set by the player stay
  expect(dropStraightBends(a, b, pis, [0, 1, 2], { ...fit, dragged: 2 }).dropped).toEqual([]);
  expect(dropStraightBends(a, b, pis.map((p, k) => k === 2 ? { ...p, r: 2000 } : p), [0, 1, 2], fit).dropped).toEqual([]);
  expect(dropStraightBends(a, b, pis.map((p, k) => k === 2 ? { ...p, speed: 100 } : p), [0, 1, 2], fit).dropped).toEqual([]);
});
