import type { Result } from '../core/evaluate';
import { routeIndicationHeight } from './route-indication';

export type PickRoute = { id: string; result: Pick<Result, 'n' | 's' | 'x' | 'y' | 'grade' | 'ground' | 'kind'> };
export interface RouteHit { routeId: string; s: number; index: number; distance: number }
type Project = (x: number, y: number, z: number) => { sx: number; sy: number; vis: boolean; depth?: number };
/** Perspective-correct world interpolation along a projected straight segment. */
export function perspectiveFraction(t: number, a?: number, b?: number): number {
  return a && b && a > 0 && b > 0 ? (t / b) / ((1 - t) / a + t / b) : t;
}

/** stations per culling box (pickRoute) */
const CHUNK = 64;
/** each route's plan extent per CHUNK stations (x0, y0, x1, y1), by its x array (results are not changed once made) */
const planBoxes = new WeakMap<object, Float64Array>();
function boxesOf(r: PickRoute['result']): Float64Array {
  let b = planBoxes.get(r.x);
  if (b) return b;
  const chunks = Math.ceil((r.n - 1) / CHUNK);
  b = new Float64Array(4 * chunks);
  for (let c = 0; c < chunks; c++) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = c * CHUNK, e = Math.min(r.n - 1, (c + 1) * CHUNK); i <= e; i++) {
      const x = r.x[i], y = r.y[i];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    b[4 * c] = x0; b[4 * c + 1] = y0; b[4 * c + 2] = x1; b[4 * c + 3] = y1;
  }
  planBoxes.set(r.x, b);
  return b;
}

/** Pick the actual drawn segments, including inactive roads and ground-level tunnel indications.
 * No sampling stride: small bends and short branches must not vanish from picking. A stretch of CHUNK stations
 * whose box (plan extent, indication heights) lies in front of the camera and projects farther than `pixels` from
 * the point is passed over: none of its segments can be the hit (a long route projected every station at every
 * hover). */
export function pickRoute(routes: readonly PickRoute[], x: number, y: number, pixels: number,
  project: Project, drape: (x: number, y: number) => number, activeRouteId?: string): RouteHit | null {
  let hit: RouteHit | null = null, best = pixels * pixels;
  for (const { id, result: r } of routes) {
    if (r.n < 2) continue;
    const at = (i: number) => project(r.x[i], r.y[i], routeIndicationHeight(r, i, drape));
    const boxes = boxesOf(r);
    for (let c = 0, chunks = boxes.length / 4; c < chunks; c++) {
      const first = c * CHUNK, last = Math.min(r.n - 1, (c + 1) * CHUNK);
      let z0 = Infinity, z1 = -Infinity;
      for (let i = first; i <= last; i++) { const z = routeIndicationHeight(r, i, drape); if (z < z0) z0 = z; if (z > z1) z1 = z; }
      let sx0 = Infinity, sy0 = Infinity, sx1 = -Infinity, sy1 = -Infinity, front = true;
      for (let k = 0; k < 8 && front; k++) {
        const q = project(boxes[4 * c + (k & 1 ? 2 : 0)], boxes[4 * c + (k & 2 ? 3 : 1)], k & 4 ? z1 : z0);
        if (!q.vis) front = false;
        else { if (q.sx < sx0) sx0 = q.sx; if (q.sx > sx1) sx1 = q.sx; if (q.sy < sy0) sy0 = q.sy; if (q.sy > sy1) sy1 = q.sy; }
      }
      if (front) {
        const dx = Math.max(sx0 - x, 0, x - sx1), dy = Math.max(sy0 - y, 0, y - sy1);
        if (dx * dx + dy * dy > (pixels + 1) ** 2) continue;
      }
      let prev = at(first);
      for (let i = first + 1; i <= last; i++) {
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
