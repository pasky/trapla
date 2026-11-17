// The end of a bridge in a fill (playtest sweep 3, P1 #4; research/68): a cone of fill in front of the abutment,
// 1:1.5, quarter cones round the crest corners, paved under the deck.
import { describe, expect, it } from 'vitest';
import { abutmentCone, CONE, coneReach, conePavingCost, coneSurface } from '../src/core/abutment-cone';
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
  it('two cones under a short bridge: their union counted once (each where it is the higher), no toe sill', () => {
    const L = 30, A = at, B = { ...at, s: L, x: at.x + L, tx: -1 };
    const ra = { x: A.x, y: A.y, tx: 1, ty: 0, half: 6, top: 112 }, rb = { x: B.x, y: B.y, tx: -1, ty: 0, half: 6, top: 109 };
    const a = abutmentCone(flat, A, 114, 6, 6, L, rb)!, b = abutmentCone(flat, B, 111, 6, 6, L, ra)!;
    expect(a.sill + b.sill).toBe(0);
    expect(a.reach + b.reach).toBeCloseTo(L, 6); // (they meet on the axis)
    let union = 0;
    const g = 0.25;
    for (let x = A.x + g / 2; x < B.x; x += g) for (let y = 150 + g / 2; y < 250; y += g)
      union += Math.max(0, Math.max(coneSurface(ra, x - A.x, y - 200), coneSurface(rb, B.x - x, y - 200)) - 100) * g * g;
    expect(Math.abs(a.volume + b.volume - union) / union).toBeLessThan(0.03);
  });
});
