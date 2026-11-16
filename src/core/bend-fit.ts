// A bend placed by the drag that rebuilds a mapped line can land where its curve has no room (too close
// to the stretch's end or to a neighbouring bend: track curves at 120 km/h are ≥ 740 m in radius). The
// drag's bend is then moved along the line, bounded, to where its curve fits; a player's later moves are
// left alone (their violation and its fix stay the player's).
import { ROAD_CHECKS } from './checks';
import { bendRules, horizontalRules, speedNorms } from './data/norms';
import type { CategoryId } from './data/categories';
import { buildAlignment, type PI, type Vec2 } from './horizontal';

/** Furthest the fit moves the bend, m: beyond that the drag's intent is no longer kept. */
export const BEND_FIT_MAX = 150;

const crowding = (a: Vec2, b: Vec2, pis: PI[], category: CategoryId, speed: number) => {
  const al = buildAlignment(a, b, pis, horizontalRules(speed, category), bendRules(pis, speed, category));
  return ROAD_CHECKS.horizontal(al, speedNorms(speed, category), { a, b, pis, category }).filter(v => v.horizontal?.extraDistance !== undefined);
};

/** `pis` with bend `i` moved along the chord A→B (either way, ≤ BEND_FIT_MAX m) to where no bend lacks room
 * for its curve, or null when it fits already or no such place is near. */
export function fitPlacedBend(a: Vec2, b: Vec2, pis: readonly PI[], i: number, category: CategoryId, speed: number): PI[] | null {
  const now = crowding(a, b, [...pis], category, speed);
  if (!now.length || !pis[i]) return null;
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
  for (let d = 10; d <= BEND_FIT_MAX; d += 10) for (const sign of [1, -1]) {
    const moved = pis.map((p, k) => k === i ? { ...p, x: p.x + sign * d * ux, y: p.y + sign * d * uy } : { ...p });
    if (!crowding(a, b, moved, category, speed).length) return moved;
  }
  return null;
}
