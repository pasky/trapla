// Side-slope shapes of fills and cuts (data/prices.ts SIDE_SLOPES, research/48). Not a geotechnical design.
import { SIDE_SLOPES as S } from './data/prices';

/** The face of a fill at a point `local` m above the ground below it, on a fill `height` m high at the crown
 * edge: its slope 1:n and how much lower the face may go before the next band (Infinity: none). */
export function fillFace(local: number, height: number): [n: number, hold: number] {
  if (local > S.fillUpperFrom) return [S.fillUpper, local - S.fillUpperFrom];
  if (local > S.fillToeHeight) return [height > S.fillUpperFrom ? S.fillMiddle : S.fillUpper, local - S.fillToeHeight];
  return [S.fillToe, Infinity];
}

/** The face of a cut at a point `depth` m below the ground above it, in a cut `cutDepth` m deep at the crown
 * edge; `rockFrom` = depth of the sound rock (class III) top, Infinity where unknown. Slope 1:n, how much
 * higher the face may go before the next layer, whether it stands in rock. */
export function cutFace(depth: number, cutDepth: number, rockFrom: number): [n: number, hold: number, rock: boolean] {
  if (depth > rockFrom) return [S.cutRock, depth - rockFrom, true];
  return [cutDepth <= S.cutShallowDepth ? S.cutShallow : S.cutSoil, Infinity, false];
}

/** CZK per metre of route for netting `rockFace` m of rock face (both sides, measured down the slope). */
export function rockFacePerM(rockFace: number): number {
  return rockFace * S.rockFacePerM2;
}
