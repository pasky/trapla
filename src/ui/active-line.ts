// The active line on the map: its two ends as they are drawn and labelled (a side road's end on another
// road is where it was built; a paired motorway's directions share the motorway's ends; the return
// direction starts at B), what the mission's ends meet, and bringing the line into view. Moved out of
// main.ts verbatim.
import type { ScenarioParams } from '../core/data/scenario';
import type { Result } from '../core/evaluate';
import { corridorOfRoute } from '../core/project-motorway';
import type { ProjectStore } from '../project-store';
import type { View } from '../render/view';
import type { Session } from '../session';
import type { ActiveRouteStore } from './active-route-store';

export interface ActiveLineContext {
  readonly session: Session;
  readonly store: ActiveRouteStore; readonly projectStore: ProjectStore; readonly scenario: ScenarioParams; readonly view: View;
  /** the mission's ends: where the ends are drawn while no line is active */
  readonly positionA: { x: number; y: number; z: number }; readonly positionB: { x: number; y: number; z: number };
}

export function createActiveLine(app: ActiveLineContext) {
  // a rebuilt stretch's ends carry their own drag handles (labelled), so the tick stays unlabelled
  /** a side road's end on another road follows that road: its drawn end is where it was built */
  const endAt = (end: 'a' | 'b') => {
    const route = app.store.route, r = route && app.session.projectFull?.routes[route.id]?.legacy;
    // a paired motorway's directions are shown on its shared line (A→B): its ends are the motorway's
    const paired = route && corridorOfRoute(app.projectStore.snapshot.design, route.id);
    if (paired?.mode === 'paired') return paired.endpoints[end].position;
    if (!route || route.endpoints[end].anchor.kind !== 'route' || !r) return route?.endpoints[end].position;
    const i = end === 'a' ? 0 : r.n - 1; return { x: r.x[i], y: r.y[i], z: r.grade[i] };
  };
  // the motorway's return direction starts at B
  const reversed = () => !!app.store.route && app.projectStore.snapshot.design.corridors.some(c => c.mode === 'independent' && c.children.reverse === app.store.route!.id);
  /** what the active road's ends meet (the mission's interchanges), in its own direction */
  const endInfo = (end: 'a' | 'b') => app.store.route?.role === 'mission' ? app.scenario.ends?.[reversed() ? (end === 'a' ? 'b' : 'a') : end] : undefined;
  const activeEndpoints = () => ({
    a: { ...(endAt('a') ?? app.positionA), label: app.store.route?.role === 'mission' ? (reversed() ? app.scenario.labels.b : app.scenario.labels.a) : app.store.route?.source ? '' : 'Start', sign: endInfo('a')?.kind },
    b: { ...(endAt('b') ?? app.positionB), label: app.store.route?.role === 'mission' ? (reversed() ? app.scenario.labels.a : app.scenario.labels.b) : app.store.route?.source ? '' : 'End', sign: endInfo('b')?.kind },
    plain: !!app.store.route && app.store.route.role !== 'mission',
  });
  /** the active route as built (else its ends and bends) in view */
  /** `r`: the road to frame (default: the last result shown; right after a switch that is still the old road's) */
  const frameRoute = (r: Result | null = app.session.last) => {
    const d = app.store.read() ? app.store.design : null;
    app.view.frame(r ? Array.from({ length: Math.ceil(r.n / 20) + 1 }, (_, k) => { const i = Math.min(r.n - 1, k * 20); return { x: r.x[i], y: r.y[i] }; })
      : d ? [app.session.ends.a, ...d.pis, app.session.ends.b] : []);
  };
  return { endInfo, activeEndpoints, frameRoute };
}
