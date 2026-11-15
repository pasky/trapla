import type { ProjectIdentity, ProjectResult, ProjectSnapshot, RouteId, RouteResult } from './project';

/** Additive worker messages; legacy init/eval/result remain unchanged. */
export type ProjectWorkerIn =
  | { type: 'project-eval'; id: number; snapshot: ProjectSnapshot; displayedResult: ProjectIdentity | null }
  | { type: 'project-preview'; id: number; snapshot: ProjectSnapshot; routeId: RouteId; materialValue?: number };
export type ProjectWorkerOut =
  | { type: 'project-result'; id: number; result: ProjectResult;
      /** Change lists are relative to this last acknowledged DISPLAYED snapshot, not the last eval.
       * null or mismatch: compare every route's engineeringRevision against displayed geometry. */
      baseIdentity: ProjectIdentity | null;
      changedRouteIds: RouteId[]; removedRouteIds: RouteId[]; dependentRouteIds: RouteId[] }
  | { type: 'project-preview'; id: number; identity: ProjectIdentity; routeId: RouteId; routeRevision: number; result: RouteResult }
  | { type: 'project-error'; id: number; identity: ProjectIdentity; message: string };

/** Preview acceptance must include route identity: switching editors cannot repaint another route. */
export function acceptsProjectMessage(current: ProjectSnapshot, message: ProjectWorkerOut, activeRouteId?: RouteId): boolean {
  const identity = message.type === 'project-result' ? message.result : message.identity;
  if (identity.epoch !== current.epoch || identity.revision !== current.revision) return false;
  if (message.type !== 'project-preview') return true;
  const route = current.design.routes.find(r => r.id === message.routeId);
  return message.routeId === activeRouteId && route?.revision === message.routeRevision
    && message.result.routeId === route.id && message.result.revision === route.revision;
}

/** A settled result contains the ENTIRE coherent project, never the active route's bill. */
export function isScorableProject(result: ProjectResult): boolean {
  return result.complete && result.valid && result.cost.total !== null && Number.isFinite(result.cost.total)
    && result.cost.total >= 0 && result.acousticScreen.complete
    && result.issues.every(i => i.blocking !== 'incomplete' && i.blocking !== 'invalid')
    && Object.values(result.routes).every(r => r.complete && r.valid && r.accepted);
}
