// Compatibility for the existing road widgets only. ProjectStore owns ALL persistence/history;
// selecting a route never mutates it. Imported/exact/corridor alignments are never fitted to PIs here.
import type { Design } from '../core/evaluate';
import type { ProjectDesign, ProjectResult, RouteId } from '../core/project';
import { legacyDesignForRoute, replaceRouteFromLegacy } from '../core/project-legacy';
import type { ProjectStoreApi } from '../project-store-contract';
import { carryVpis } from '../core/carry-heights';
import { horizontalRules } from '../core/data/norms';
import { buildAlignment } from '../core/horizontal';

export class ActiveRouteStore {
  activeRouteId: RouteId | null;
  onHistory?: () => void;
  private atomic = false;
  private cached: { project: ProjectDesign; id: RouteId; design: Design | null } | null = null;
  constructor(readonly project: ProjectStoreApi, private initialProject: () => ProjectDesign) {
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
  /** A paired motorway is edited as its forward direction (A→B), the orientation of its shared line. */
  private togetherAs(id: RouteId | null): RouteId | null {
    const corridor = this.project.snapshot.design.corridors.find(c => c.mode === 'paired' && c.children.reverse === id);
    return corridor ? corridor.children.forward : id;
  }
  switchRoute(id: RouteId): boolean {
    if (!this.project.snapshot.design.routes.some(r => r.id === id)) return false;
    if (this.project.inTransaction) return false;
    this.activeRouteId = this.togetherAs(id);
    return true;
  }
  on(listener: (design: Design | null, committed: boolean) => void) {
    return this.project.subscribe((_snapshot, committed) => {
      if (this.atomic && !committed) return;
      if (!this.route) this.activeRouteId = this.project.snapshot.design.routes[0]?.id ?? null;
      this.activeRouteId = this.togetherAs(this.activeRouteId);
      listener(this.read(), committed);
    });
  }
  update(edit: (design: Design) => void, committed = true) {
    if (!this.activeRouteId || !this.read()) return;
    const id = this.activeRouteId, before = this.design, design = structuredClone(before);
    edit(design);
    this.carryHeights(before, design);
    const own = !this.project.inTransaction;
    if (own) this.project.begin();
    this.atomic = committed;
    try {
      this.project.update(draft => Object.assign(draft, replaceRouteFromLegacy(draft, id, design)));
      if (committed) this.project.commit();
    } catch (error) { if (own) this.project.cancel(); throw error; }
    finally { this.atomic = false; }
  }
  /** By hand, a change of plan keeps the height points on their ground (core/carry-heights.ts). */
  private carryHeights(before: Design, after: Design) {
    const ends = this.route?.endpoints;
    if (!ends || before.profileMode !== 'manual' || after.profileMode !== 'manual' || JSON.stringify(after.vpis) !== JSON.stringify(before.vpis)) return;
    if (before.speed === after.speed && before.category === after.category && JSON.stringify(before.pis) === JSON.stringify(after.pis)) return;
    const a = ends.a.position, b = ends.b.position;
    after.vpis = carryVpis(buildAlignment(a, b, before.pis, horizontalRules(before.speed, before.category)),
      buildAlignment(a, b, after.pis, horizontalRules(after.speed, after.category)), before.vpis);
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
  /** Start over: the whole initial project in one undoable step, not the active route alone. */
  reset() {
    const fresh = structuredClone(this.initialProject());
    this.editProject(draft => { for (const key of Object.keys(draft)) delete (draft as unknown as Record<string, unknown>)[key]; Object.assign(draft, fresh); });
    this.activeRouteId = this.project.snapshot.design.routes.find(r => r.role === 'mission')?.id ?? this.project.snapshot.design.routes[0]?.id ?? null;
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
