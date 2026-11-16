import type { Result } from '../core/evaluate';
import { routeIndicationHeight } from './route-indication';

export type PickRoute = { id: string; result: Pick<Result, 'n' | 's' | 'x' | 'y' | 'grade' | 'ground' | 'kind'> };
export interface RouteHit { routeId: string; s: number; index: number; distance: number }
type Project = (x: number, y: number, z: number) => { sx: number; sy: number; vis: boolean; depth?: number };
/** Perspective-correct world interpolation along a projected straight segment. */
export function perspectiveFraction(t: number, a?: number, b?: number): number {
  return a && b && a > 0 && b > 0 ? (t / b) / ((1 - t) / a + t / b) : t;
}

/** Pick the actual drawn segments, including inactive roads and ground-level tunnel indications.
 * No sampling stride: small bends and short branches must not vanish from picking. */
export function pickRoute(routes: readonly PickRoute[], x: number, y: number, pixels: number,
  project: Project, drape: (x: number, y: number) => number, activeRouteId?: string): RouteHit | null {
  let hit: RouteHit | null = null, best = pixels * pixels;
  for (const { id, result: r } of routes) {
    if (r.n < 2) continue;
    const at = (i: number) => project(r.x[i], r.y[i], routeIndicationHeight(r, i, drape));
    let prev = at(0);
    for (let i = 1; i < r.n; i++) {
      const p = at(i);
      if (p.vis && prev.vis) {
        const dx = p.sx - prev.sx, dy = p.sy - prev.sy, length2 = dx * dx + dy * dy;
        const t = length2 ? Math.max(0, Math.min(1, ((x - prev.sx) * dx + (y - prev.sy) * dy) / length2)) : 0;
        const d2 = (prev.sx + t * dx - x) ** 2 + (prev.sy + t * dy - y) ** 2;
        const tied = hit !== null && Math.abs(d2 - best) < 1e-8;
        const preferred = hit !== null && tied && (id === activeRouteId && hit.routeId !== activeRouteId ||
          id !== activeRouteId && hit.routeId !== activeRouteId && id < hit.routeId);
        if (d2 < best && !tied || preferred) {
          const along = perspectiveFraction(t, prev.depth, p.depth);
          best = d2; hit = { routeId: id, s: r.s[i - 1] + along * (r.s[i] - r.s[i - 1]), index: along < .5 ? i - 1 : i, distance: Math.sqrt(d2) };
        }
      }
      prev = p;
    }
  }
  return hit;
}

/** The route whose drawn ground footprint (carriageway, earthworks to the slope edges) covers plan point
 * (x, y): a road end placed there is on that road, never on "open ground" (its slope). Nearest station
 * first; null outside every footprint. */
export function footprintHit(routes: readonly { id: string; result: Pick<Result, 'n' | 's' | 'x' | 'y' | 'tx' | 'ty' | 'dayL' | 'dayR' | 'ds'> }[], x: number, y: number): { routeId: string; s: number } | null {
  let hit: { routeId: string; s: number } | null = null, best = Infinity;
  for (const { id, result: r } of routes) for (let i = 0; i < r.n; i++) {
    const dx = x - r.x[i], dy = y - r.y[i], along = dx * r.tx[i] + dy * r.ty[i];
    if (Math.abs(along) > r.ds) continue;
    const across = -dx * r.ty[i] + dy * r.tx[i], reach = across >= 0 ? r.dayL[i] : r.dayR[i];
    const d = Math.hypot(dx, dy);
    if (Math.abs(across) <= reach && d < best) { best = d; hit = { routeId: id, s: r.s[i] }; }
  }
  return hit;
}
