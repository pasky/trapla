// A finished slip road, selected for the first time, is drawn once by a stroke in its driving direction: a slip road
// is one way, A → B (core/slip-roads.ts: an exit starts on the motorway, an entry ends on it). A one-off sweep of its
// own (render View.sweepLine), not the selection's highlight; nothing stays.
import type { Result } from '../core/evaluate';
import type { ProjectDesign, RouteId } from '../core/project';
import { isSlipRoad } from '../core/slip-roads';

/** The slip road's line from A to B, `lift` m over its surface; null: not a slip road. */
export function slipDrive(design: ProjectDesign, id: RouteId, r: Result, lift = 1.5) {
  const route = design.routes.find(q => q.id === id);
  if (!route || !isSlipRoad(route) || r.n < 2) return null;
  return Array.from({ length: r.n }, (_, i) => ({ x: r.x[i], y: r.y[i], z: r.grade[i] + lift }));
}
