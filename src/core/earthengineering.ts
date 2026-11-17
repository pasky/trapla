// Side-slope shapes of fills and cuts (data/prices.ts SIDE_SLOPES, research/48). Not a geotechnical design.
import { SIDE_SLOPES as S, SUBGRADE } from './data/prices';

/** The face of a fill at a point `local` m above the ground below it, on a fill `height` m high at the crown
 * edge: its slope 1:n and how much lower the face may go before the next band (Infinity: none). */
export function fillFace(local: number, height: number): [n: number, hold: number] {
  if (local > S.fillUpperFrom) {
    const high = Math.max(0, Math.min(1, (height - S.fillStandardTo) / S.fillHighBlend));
    return [S.fillUpper + (S.fillHighUpper - S.fillUpper) * high, local - S.fillUpperFrom];
  }
  if (local > S.fillToeHeight) return [height > S.fillUpperFrom ? S.fillMiddle : S.fillUpper, local - S.fillToeHeight];
  return [S.fillToe, Infinity];
}

/** The face of a cut at a point `depth` m below the ground above it, in a cut `cutDepth` m deep at the crown
 * edge; `rockFrom` = depth of the sound rock (class III) top, Infinity where unknown. Slope 1:n, how much
 * higher the face may go before the next layer, whether it stands in rock. */
export function cutFace(depth: number, cutDepth: number, rockFrom: number, ground?: { key?: string }): [n: number, hold: number, rock: boolean] {
  const soil = cutDepth <= S.cutShallowDepth ? S.cutShallow : S.cutSoil, rock = rockSlope(ground);
  if (depth > rockFrom && rock !== 'soil') return [rock, depth - rockFrom, rock <= S.rockFaceSteepest];
  return [soil, Infinity, false];
}

/** the slope 1:n of a cut in the sound rock of this ground ('soil': like soil), SIDE_SLOPES.rockByGround */
export function rockSlope(ground?: { key?: string }): number | 'soil' {
  return (ground?.key && S.rockByGround[ground.key]) || S.cutRock;
}

/** CZK per metre of route for the works a section's ground needs: netting `rockFace` m of rock face (both
 * sides, measured down the slope) and treating `subgrade` m of soft ground under a fill. */
export function groundWorksPerM(rockFace: number, subgrade: number): number {
  return rockFace * S.rockFacePerM2 + subgrade * SUBGRADE.perM2;
}

/** whether a fill this high on this ground has its subgrade treated (SUBGRADE) */
export function treatedSubgrade(height: number, ground: { key?: string }): boolean {
  return height > SUBGRADE.fromHeight && !!ground.key && SUBGRADE.grounds.includes(ground.key);
}
