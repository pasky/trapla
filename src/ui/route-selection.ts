import type { Sel } from './inspector';

export type RouteLocalSelection = Exclude<Sel, { kind: 'building' }>;
/** Buildings have a project owner; every index or kilometre belongs to an explicit route. */
export type RouteSelection =
  | { kind: 'route'; routeId: string; target: RouteLocalSelection }
  | Extract<Sel, { kind: 'building' }>;

export function qualifySelection(routeId: string, selection: Sel | null): RouteSelection | null {
  return selection === null || selection.kind === 'building' ? selection : { kind: 'route', routeId, target: selection };
}
export function activeSelection(routeId: string | null, selection: RouteSelection | null): Sel | null {
  return selection?.kind === 'route' ? selection.routeId === routeId ? selection.target : null : selection;
}

/** UI-only state: switching does not call the design store or create an undo transaction. */
export class RouteSelectionState {
  activeRouteId: string | null = null;
  selection: RouteSelection | null = null;
  switchRoute(id: string) {
    if (this.activeRouteId === id) return;
    this.activeRouteId = id;
    if (this.selection?.kind === 'route') this.selection = null;
  }
  select(selection: RouteSelection | null) {
    if (selection?.kind === 'route') this.activeRouteId = selection.routeId;
    this.selection = selection;
  }
  /** Repair after undo/deletion without altering the project, including an empty project. */
  reconcile(ids: readonly string[]) {
    if (this.activeRouteId === null || !ids.includes(this.activeRouteId)) {
      this.activeRouteId = ids[0] ?? null;
      if (this.selection?.kind === 'route') this.selection = null;
    }
    if (this.selection?.kind === 'route' && !ids.includes(this.selection.routeId)) this.selection = null;
  }
  get local() { return activeSelection(this.activeRouteId, this.selection); }
}
