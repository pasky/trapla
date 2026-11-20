// A finished slip road, selected for the first time, is drawn once by a stroke in its driving direction: off the
// motorway for an exit, onto it for an entry (the end on the carriageway and its travel there decide which; core/
// slip-roads.ts). A one-off sweep of its own (render View.sweepLine), not the selection's highlight; nothing stays.
import type { Result } from '../core/evaluate';
import type { ProjectDesign, RouteId } from '../core/project';
import { carriagewayOf, isSlipRoad } from '../core/slip-roads';

/** The slip road's line in its driving direction (`lift` m over its surface), or null when it is not a slip road of
 * a motorway of the project, or its result is not the full one. */
export function slipDrive(design: ProjectDesign, id: RouteId, r: Result, motorway: (routeId: RouteId) => Result | undefined, lift = 1.5) {
  const route = design.routes.find(q => q.id === id);
  if (!route || !isSlipRoad(route) || r.n < 2) return null;
  for (const end of ['a', 'b'] as const) {
    const anchor = route.endpoints[end].anchor;
    if (anchor.kind !== 'route') continue;
    const cw = carriagewayOf(design, anchor.routeId), m = motorway(anchor.routeId);
    if (!cw || !m) continue;
    // the slip road's way out of that end, against the carriageway's travel at the nearest point
    const k = end === 'a' ? 0 : r.n - 1, sign = end === 'a' ? 1 : -1;
    let best = 0, dist = Infinity;
    for (let i = 0; i < m.n; i++) { const d = (m.x[i] - r.x[k]) ** 2 + (m.y[i] - r.y[k]) ** 2; if (d < dist) { dist = d; best = i; } }
    const away = sign * (r.tx[k] * m.tx[best] + r.ty[k] * m.ty[best]) * cw.direction;
    // leaving along the traffic: an exit, driven from this end; else an entry, driven to it
    const fromHere = away > 0, forward = (end === 'a') === fromHere;
    const pts = Array.from({ length: r.n }, (_, i) => { const q = forward ? i : r.n - 1 - i; return { x: r.x[q], y: r.y[q], z: r.grade[q] + lift }; });
    return pts;
  }
  return null;
}
