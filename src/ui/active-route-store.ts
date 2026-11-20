// Compatibility for the existing road widgets only. ProjectStore owns ALL persistence/history;
// selecting a route never mutates it. Imported/exact/corridor alignments are never fitted to PIs here.
import type { Design } from '../core/evaluate';
import type { ProjectDesign, ProjectResult, RouteId } from '../core/project';
import { legacyDesignForRoute, replaceRouteFromLegacy } from '../core/project-legacy';
import type { ProjectStoreApi } from '../project-store-contract';
import { carryVpis } from '../core/carry-heights';
import { bendRules, horizontalRules } from '../core/data/norms';
import { buildAlignment } from '../core/horizontal';
import { historyLabel } from '../core/history-label';

export class ActiveRouteStore {
  activeRouteId: RouteId | null;
  /** A motorway's direction is edited on its own (its bends, then, change only it). Selection only:
   * choosing it never changes the project. */
  oneDirection = false;
  /** before an undo / redo (and before loading the best design); what it returns runs after the step */
  onHistory?: () => (() => void) | void;
  private atomic = false;
  private cached: { project: ProjectDesign; id: RouteId; one: boolean; design: Design | null } | null = null;
  constructor(readonly project: ProjectStoreApi, private initialProject: () => ProjectDesign) {
    this.activeRouteId = project.snapshot.design.routes[0]?.id ?? null;
  }
  get route() { return this.project.snapshot.design.routes.find(r => r.id === this.activeRouteId) ?? null; }
  read(): Design | null {
    const project = this.project.snapshot.design, id = this.activeRouteId;
    if (!id) return null;
    const one = this.directionEdit(id);
    if (this.cached?.project === project && this.cached.id === id && this.cached.one === one) return this.cached.design;
    let design: Design | null = null;
    try { design = legacyDesignForRoute(project, id, { oneDirection: one }); } catch { /* A different editor/kernel is required. */ }
    this.cached = { project, id, one, design };
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
  /** A paired motorway is edited as its forward direction (A→B), the orientation of its shared line,
   * unless one direction alone is edited. */
  private togetherAs(id: RouteId | null): RouteId | null {
    if (this.oneDirection) return id;
    const corridor = this.project.snapshot.design.corridors.find(c => c.mode === 'paired' && c.children.reverse === id);
    return corridor ? corridor.children.forward : id;
  }
  /** the active route is a direction of a paired motorway edited on its own */
  private directionEdit(id: RouteId) {
    return this.oneDirection && this.project.snapshot.design.corridors.some(c => c.mode === 'paired' && (c.children.forward === id || c.children.reverse === id));
  }
  /** `created`: a road this open transaction just created (e.g. by the first drag of a mapped road).
   * `oneDirection`: a motorway direction alone (anything else: the whole road). */
  switchRoute(id: RouteId, created = false, oneDirection = false): boolean {
    if (!this.project.snapshot.design.routes.some(r => r.id === id)) return false;
    if (this.project.inTransaction && !created) return false;
    this.oneDirection = oneDirection;
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
  /** A step taken back while the pointer still holds it (Ctrl+Z during a drag): the rest of that gesture
   * changes nothing, its end commits nothing, until the pointer is let go (`release`). */
  private cancelled = false;
  cancelStep() { if (this.project.inTransaction) this.project.cancel(); this.cancelled = true; }
  release() { this.cancelled = false; }
  update(edit: (design: Design) => void, committed = true) {
    if (this.cancelled || !this.activeRouteId || !this.read()) return;
    const id = this.activeRouteId, before = this.design, design = structuredClone(before);
    edit(design);
    this.carryHeights(before, design);
    const own = !this.project.inTransaction;
    if (own) this.project.begin();
    this.atomic = committed;
    try {
      const one = this.directionEdit(id);
      this.project.update(draft => Object.assign(draft, replaceRouteFromLegacy(draft, id, design, { oneDirection: one })));
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
    after.vpis = carryVpis(buildAlignment(a, b, before.pis, horizontalRules(before.speed, before.category), bendRules(before.pis, before.speed, before.category)),
      buildAlignment(a, b, after.pis, horizontalRules(after.speed, after.category), bendRules(after.pis, after.speed, after.category)), before.vpis);
  }
  editProject(edit: (project: ProjectDesign) => void) {
    if (this.cancelled) return;
    const own = !this.project.inTransaction;
    if (own) this.project.begin(); this.atomic = true;
    try { this.project.update(edit); if (own) this.project.commit(); }
    catch (error) { if (own) this.project.cancel(); throw error; }
    finally { this.atomic = false; }
  }
  /** `label`: the undo step's name where the designs alone would not say it (core/history-label.ts) */
  commit(label?: string) { if (!this.cancelled && this.project.inTransaction) this.project.commit(label); }
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
    // (the whole design: a key the best lacks, e.g. dead ends taken up since, goes too)
    this.project.update(draft => { for (const key of Object.keys(draft)) if (!(key in best.design)) delete (draft as unknown as Record<string, unknown>)[key]; Object.assign(draft, structuredClone(best.design)); });
    this.project.commit();
  }
  undo() { const after = this.onHistory?.(); this.project.undo(); after?.(); }
  redo() { const after = this.onHistory?.(); this.project.redo(); after?.(); }
  /** what an undo (redo) takes back (does again), in plain words ("moving bend 3"); '' when there is nothing */
  undoLabel() { return this.project.canUndo() ? this.stepLabel('undo') : ''; }
  redoLabel() { return this.project.canRedo() ? this.stepLabel('redo') : ''; }
  private stepLabel(step: 'undo' | 'redo') {
    const note = this.project.historyNote?.(step);
    if (note) return note;
    const pair = this.project.historyStep?.(step);
    return pair ? historyLabel(pair[0], pair[1]) : 'edit';
  }
  offerBest(result: ProjectResult) { return this.project.offerBest(result); }
}
