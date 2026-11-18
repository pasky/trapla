// Pure helpers for shaping a reroute (no DOM): where a dragged bend point goes among the others, the
// automatic path's own bend points to start from, and whether a crossed road can be shaped at all.
import type { Design, Result } from '../core/evaluate';
import { MAX_LINK_VIA } from '../core/crossings';

type XY = { x: number; y: number };
/** Distance along `path` to the point of it nearest to `p`. */
export function arcPosition(path: readonly XY[], p: XY): number {
  let best = Infinity, at = 0, run = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len))) : 0;
    const d = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    if (d < best) { best = d; at = run + t * len; }
    run += len;
  }
  return at;
}
/** Insert a bend point at `p` (a point on the drawn link `path`) between the existing bend points it
 * lies between along the path; returns the new list and the new point's index. */
export function insertViaPoint(path: readonly XY[], via: readonly XY[], p: XY): { via: XY[]; index: number } {
  const s = arcPosition(path, p);
  let index = 0;
  while (index < via.length && arcPosition(path, via[index]) <= s) index++;
  const next = via.map(q => ({ ...q }));
  next.splice(index, 0, { x: p.x, y: p.y });
  return { via: next, index };
}

/** A way crossed more than once shares one crossing choice: its reroutes are shaped only once the
 * player has chosen "Cut it" for all of them. */
export function shapeable(r: Result | null, d: Design, roadId: number): boolean {
  const count = r?.crossings.filter(c => c.roadId === roadId).length ?? 0;
  return count <= 1 || (d.crossingOverrides ?? []).some(o => o.roadId === roadId && o.type === 'reconnection');
}

/** The automatic path's own bend points (Douglas–Peucker, ends excluded), so that shaping it starts
 * from where it is and a drag changes it only near the pointer. */
/** The bend points a first drag starts from keep the shape within this many metres of the automatic
 * path (Douglas–Peucker): about a lane's width, few enough points to grab (doubled only if they would
 * still exceed the point limit). */
export const SHAPE_TOLERANCE = 2;
export function simplifyLink(path: readonly XY[], limit = MAX_LINK_VIA - 4): XY[] {
  const dp = (lo: number, hi: number, tolerance: number, out: number[]) => {
    let far = -1, worst = tolerance;
    const a = path[lo], b = path[hi], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    for (let i = lo + 1; i < hi; i++) {
      const d = Math.abs((path[i].x - a.x) * dy - (path[i].y - a.y) * dx) / len;
      if (d > worst) { worst = d; far = i; }
    }
    if (far < 0) return;
    dp(lo, far, tolerance, out); out.push(far); dp(far, hi, tolerance, out);
  };
  for (let tolerance = SHAPE_TOLERANCE; ; tolerance *= 2) {
    const kept: number[] = [];
    if (path.length > 2) dp(0, path.length - 1, tolerance, kept);
    if (kept.length <= limit) return kept.map(i => ({ x: path[i].x, y: path[i].y }));
  }
}

