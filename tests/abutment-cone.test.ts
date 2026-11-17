// The end of a bridge in a fill (playtest sweep 3, P1 #4; research/68): a cone of fill in front of the abutment,
// 1:1.5, quarter cones round the crest corners, paved under the deck.
import { describe, expect, it } from 'vitest';
import { abutmentCone, CONE, coneReach, conePavingCost, conesMeet, coneSurface } from '../src/core/abutment-cone';
import { syntheticTerrain } from '../src/core/terrain';

describe('abutment cones', () => {
  const flat = syntheticTerrain(200, 200, 2, () => 100);
  const at = { s: 0, x: 100, y: 200, tx: 1, ty: 0, i: 1, earthCell: 0 };
  it('on level ground: a 1:1.5 prism across the crest and two quarter cones (research/68 §4), its toe 0.6 + 1.5 h out', () => {
    const h = 12, c = abutmentCone(flat, at, 100 + h + CONE.deckDepth, 14, 14)!;
    expect(c.height).toBeCloseTo(h, 6);
    expect(c.reach).toBeCloseTo(CONE.berm + CONE.slope * h, 1);
    // the berm's strip, the front prism and the quarter cones (grid of 2 m: within 3 %)
    const exact = 2 * 14 * h * CONE.berm + 0.75 * 2 * 14 * h * h + Math.PI / 3 * (CONE.slope * h) ** 2 * h / 2
      + Math.PI * CONE.berm * CONE.slope * h * h / 2;
    expect(Math.abs(c.volume - exact) / exact).toBeLessThan(0.03);
    expect(conePavingCost(c)).toBeCloseTo(c.paved * CONE.pavingPerM2 + c.sill * CONE.sillPerM, 6);
    expect(c.sill).toBeCloseTo(2 * 14 + 2 * CONE.paveMargin, 6);
  });
  it('an abutment set into a bank has none; on a falling valley side it reaches further', () => {
    expect(abutmentCone(flat, at, 100 + CONE.deckDepth + 0.2, 14, 14)).toBeNull();
    const falling = (u: number) => 100 - 0.3 * u;
    expect(coneReach(110, falling)).toBeGreaterThan(CONE.berm + CONE.slope * 10);
  });
  it('across a cross slope it goes on down the low side to the ground, as far as it is drawn and billed', () => {
    const tilted = syntheticTerrain(400, 400, 2, (_x, y) => 100 - 0.3 * (y - 200)), c = abutmentCone(tilted, { ...at, y: 200 }, 122, 4.75, 4.75)!;
    // just beyond the outermost fill on the low side (+y here, the normal (−ty, tx) = (0, 1)), the cone is in the ground
    const v = c.side + CONE.grid / 2;
    for (const u of [0, c.reach / 2]) expect(coneSurface(c, u, v)).toBeLessThanOrEqual(100 - 0.3 * v);
    expect(c.side).toBeGreaterThan(4.75 + CONE.berm + CONE.slope * 20);
  });
  it('two cones under a short bridge each go as far as where they meet: no fill counted twice, no toe sill', () => {
    const L = 30, meet = conesMeet(112, 112, L), a = abutmentCone(flat, at, 114, 6, 6, meet)!;
    const b = abutmentCone(flat, { ...at, s: L, x: 100 + L, tx: -1 }, 114, 6, 6, L - meet)!;
    expect(meet).toBeCloseTo(L / 2, 6);
    expect(a.length).toBeLessThanOrEqual(meet + 1e-9);
    expect(a.sill + b.sill).toBe(0);
    const whole = abutmentCone(flat, at, 114, 6, 6)!;
    expect(a.volume).toBeLessThan(whole.volume);
  });
});
