import type { ProjectIdentity, ProjectResult, ProjectSnapshot, RouteId, RouteResult } from './project';

export interface PreviewGesture { id: string; sequence: number }
export interface PreviewWindow { id: string; lastDisplayedSequence: number }
/** Additive worker messages; legacy init/eval/result remain unchanged. */
export type ProjectWorkerIn =
  | { type: 'project-eval'; id: number; snapshot: ProjectSnapshot; displayedResult: ProjectIdentity | null }
  | { type: 'project-preview'; id: number; snapshot: ProjectSnapshot; routeId: RouteId; materialValue?: number; gesture?: PreviewGesture };
export type ProjectWorkerOut =
  | { type: 'project-result'; id: number; result: ProjectResult;
      /** Change lists are relative to this last acknowledged DISPLAYED snapshot, not the last eval.
       * null or mismatch: compare every route's engineeringRevision against displayed geometry. */
      baseIdentity: ProjectIdentity | null;
      changedRouteIds: RouteId[]; removedRouteIds: RouteId[]; dependentRouteIds: RouteId[] }
  | { type: 'project-preview'; id: number; identity: ProjectIdentity; routeId: RouteId; routeRevision: number; result: RouteResult; gesture?: PreviewGesture }
  | { type: 'project-error'; id: number; identity: ProjectIdentity; message: string };

/** Preview acceptance must include route identity: switching editors cannot repaint another route. */
/** Full publication remains exact-current. A preview window is valid ONLY for one active gesture:
 * caller clears it on commit/cancel, undo/redo, load and route switch. Older accepted previews stay
 * visibly provisional; monotonically advancing sequence avoids starving a 16 ms pointer stream. */
export function acceptsProjectMessage(current: ProjectSnapshot, message: ProjectWorkerOut, activeRouteId?: RouteId,
  window?: PreviewWindow): boolean {
  const identity = message.type === 'project-result' ? message.result : message.identity;
  if (identity.epoch !== current.epoch) return false;
  if (message.type !== 'project-preview') return identity.revision === current.revision;
  const route = current.design.routes.find(r => r.id === message.routeId);
  if (!route || message.routeId !== activeRouteId || message.result.routeId !== route.id
    || message.result.revision !== message.routeRevision) return false;
  if (window) return message.gesture?.id === window.id && Number.isSafeInteger(message.gesture.sequence)
    && message.gesture.sequence > window.lastDisplayedSequence && identity.revision <= current.revision && message.routeRevision <= route.revision;
  return identity.revision === current.revision && route.revision === message.routeRevision;
}

/** A settled result contains the ENTIRE coherent project, never the active route's bill. */
export function isScorableProject(result: ProjectResult): boolean {
  return result.complete && result.valid && result.cost.total !== null && result.cost.unpriced.length === 0 && Number.isFinite(result.cost.total)
    && result.cost.total >= 0 && result.acousticScreen.complete
    && result.issues.every(i => i.blocking !== 'incomplete' && i.blocking !== 'invalid')
    && Object.values(result.routes).every(r => r.complete && r.valid && r.accepted);
}
