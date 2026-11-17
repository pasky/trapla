// The end of a bridge in a fill (playtest sweep 3, P1 #4; research/68): a cone of fill in front of the abutment,
// 1:1.5, quarter cones round the crest corners, paved under the deck.
import { describe, expect, it } from 'vitest';
import { abutmentCone, CONE, coneReach, conePavingCost } from '../src/core/abutment-cone';
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
});
