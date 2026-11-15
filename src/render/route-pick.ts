import type { Result } from '../core/evaluate';
import { KIND } from '../core/structures';

export type PickRoute = { id: string; result: Pick<Result, 'n' | 's' | 'x' | 'y' | 'grade' | 'ground' | 'kind'> };
export interface RouteHit { routeId: string; s: number; index: number; distance: number }
type Project = (x: number, y: number, z: number) => { sx: number; sy: number; vis: boolean };

/** Pick the actual drawn segments, including inactive roads and ground-level tunnel indications.
 * No sampling stride: small bends and short branches must not vanish from picking. */
export function pickRoute(routes: readonly PickRoute[], x: number, y: number, pixels: number,
  project: Project, activeRouteId?: string): RouteHit | null {
  let hit: RouteHit | null = null, best = pixels * pixels;
  for (const { id, result: r } of routes) {
    if (r.n < 2) continue;
    const at = (i: number) => project(r.x[i], r.y[i], r.kind[i] === KIND.tunnel ? r.ground[i] : r.grade[i]);
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
          best = d2; hit = { routeId: id, s: r.s[i - 1] + t * (r.s[i] - r.s[i - 1]), index: t < .5 ? i - 1 : i, distance: Math.sqrt(d2) };
        }
      }
      prev = p;
    }
  }
  return hit;
}
