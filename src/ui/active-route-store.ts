// Compatibility for the existing road widgets only. ProjectStore owns ALL persistence/history;
// selecting a route never mutates it. Imported/exact/corridor alignments are never fitted to PIs here.
import type { Design } from '../core/evaluate';
import type { ProjectDesign, ProjectResult, RouteId } from '../core/project';
import { legacyDesignForRoute, replaceRouteFromLegacy } from '../core/project-legacy';
import type { ProjectStoreApi } from '../project-store-contract';

export class ActiveRouteStore {
  activeRouteId: RouteId | null;
  onHistory?: () => void;
  private atomic = false;
  private cached: { project: ProjectDesign; id: RouteId; design: Design | null } | null = null;
  constructor(readonly project: ProjectStoreApi, private initialRoad: () => Design) {
    this.activeRouteId = project.snapshot.design.routes[0]?.id ?? null;
  }
  get route() { return this.project.snapshot.design.routes.find(r => r.id === this.activeRouteId) ?? null; }
  read(): Design | null {
    const project = this.project.snapshot.design, id = this.activeRouteId;
    if (!id) return null;
    if (this.cached?.project === project && this.cached.id === id) return this.cached.design;
    let design: Design | null = null;
    try { design = legacyDesignForRoute(project, id); } catch { /* A different editor/kernel is required. */ }
    this.cached = { project, id, design };
    return design;
  }
  get design(): Design {
    const design = this.read();
    if (!design) throw new Error('This route cannot be edited with road bend controls');
    return design;
  }
  get best() { return this.project.best; }
  /** Changed bindings remain in project state for repair; never clear choices to rebind indices. */
  get objectDataChanged() { return false; }
  switchRoute(id: RouteId): boolean {
    if (!this.project.snapshot.design.routes.some(r => r.id === id)) return false;
    if (this.project.inTransaction) return false;
    this.activeRouteId = id;
    return true;
  }
  on(listener: (design: Design | null, committed: boolean) => void) {
    return this.project.subscribe((_snapshot, committed) => {
      if (this.atomic && !committed) return;
      if (!this.route) this.activeRouteId = this.project.snapshot.design.routes[0]?.id ?? null;
      listener(this.read(), committed);
    });
  }
  update(edit: (design: Design) => void, committed = true) {
    if (!this.activeRouteId || !this.read()) return;
    const id = this.activeRouteId, design = structuredClone(this.design);
    edit(design);
    const own = !this.project.inTransaction;
    if (own) this.project.begin();
    this.atomic = committed;
    try {
      this.project.update(draft => Object.assign(draft, replaceRouteFromLegacy(draft, id, design)));
      if (committed) this.project.commit();
    } catch (error) { if (own) this.project.cancel(); throw error; }
    finally { this.atomic = false; }
  }
  editProject(edit: (project: ProjectDesign) => void) {
    const own = !this.project.inTransaction;
    if (own) this.project.begin(); this.atomic = true;
    try { this.project.update(edit); if (own) this.project.commit(); }
    catch (error) { if (own) this.project.cancel(); throw error; }
    finally { this.atomic = false; }
  }
  commit() { if (this.project.inTransaction) this.project.commit(); }
  replace(design: Design) {
    this.update(draft => {
      for (const key of Object.keys(draft)) delete (draft as unknown as Record<string, unknown>)[key];
      Object.assign(draft, structuredClone(design));
    });
  }
  reset() {
    const fresh = this.initialRoad();
    if (this.project.snapshot.design.routes.length > 1) fresh.buildingOverrides = structuredClone(this.project.snapshot.design.buildingOverrides);
    this.replace(fresh);
  }
  loadBest() {
    const best = this.project.best;
    if (!best) return;
    this.onHistory?.();
    if (this.project.inTransaction) this.project.commit();
    this.project.begin();
    this.project.update(draft => Object.assign(draft, structuredClone(best.design)));
    this.project.commit();
  }
  undo() { this.onHistory?.(); this.project.undo(); }
  redo() { this.onHistory?.(); this.project.redo(); }
  undoLabel() { return this.project.canUndo() ? 'Undo edit' : ''; }
  redoLabel() { return this.project.canRedo() ? 'Redo edit' : ''; }
  offerBest(result: ProjectResult) { return this.project.offerBest(result); }
}
