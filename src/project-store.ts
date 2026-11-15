import { COST_MODEL_VERSION } from './core/data/prices';
import { PROJECT_EVALUATION_VERSION, type ProjectDesign, type ProjectResult, type ProjectSnapshot } from './core/project';
import { isScorableProject } from './core/project-protocol';
import { assertProjectDesign } from './core/project-validation';
import { cloneProjectValue as copy, freezeProjectValue as freeze, projectValueKey as key } from './core/project-value';
import { loadProjectSave, persistProjectSave, projectMissionKey, type ProjectLoadOptions } from './project-persistence';
import type { ProjectBest, ProjectCommand, ProjectLoadResult, ProjectSave, ProjectStoreApi } from './project-store-contract';

export interface ProjectStoreOptions extends ProjectLoadOptions {
  initial: () => ProjectDesign;
  /** Tests may inject a unique epoch. Production defaults to crypto.randomUUID(). */
  epoch?: string;
}
export interface OpenProjectStoreResult { load: ProjectLoadResult; store: ProjectStore | null }
const contentKey = (value: { revision: number }) => { const { revision: _revision, ...content } = value; return key(content); };

/** Whole-project copy-on-write transactions. Results/typed arrays and editor selection never enter history. */
export class ProjectStore implements ProjectStoreApi {
  private current: ProjectSnapshot;
  private savedBest: ProjectBest | null;
  private history: ProjectDesign[];
  private index = 0;
  private baseline: ProjectDesign | null = null;
  private listeners = new Set<(snapshot: ProjectSnapshot, committed: boolean) => void>();
  private versions = new Map<string, number>();

  private constructor(private options: ProjectStoreOptions, save: ProjectSave) {
    this.current = freeze({ epoch: options.epoch ?? crypto.randomUUID(), revision: 0, design: copy(save.design) });
    this.savedBest = save.best ? freeze(copy(save.best)) : null;
    this.history = [copy(save.design)];
    for (const item of [...save.design.routes, ...save.design.corridors, ...save.design.connections]) this.versions.set(item.id, item.revision);
  }
  static open(options: ProjectStoreOptions): OpenProjectStoreResult {
    const load = loadProjectSave(options);
    if (load.status === 'unsupported') return { load, store: null };
    const save: ProjectSave = load.status === 'empty' ? { schemaVersion: 1, design: copy(options.initial()), best: null } : copy(load.save);
    assertProjectDesign(save.design);
    if (save.design.scenarioId !== options.namespace.scenarioId || save.design.presetId !== options.namespace.presetId) throw new Error('Initial namespace mismatch');
    // On a migration, recovery is durable BEFORE the new save. Quota failures propagate; old bytes remain.
    if (load.status !== 'loaded') persistProjectSave(options, save, load);
    return { load, store: new ProjectStore(options, save) };
  }
  get snapshot(): ProjectSnapshot { return this.current; }
  get best(): ProjectBest | null { return this.savedBest; }
  get inTransaction(): boolean { return this.baseline !== null; }
  subscribe(fn: (snapshot: ProjectSnapshot, committed: boolean) => void): () => void {
    this.listeners.add(fn); return () => { this.listeners.delete(fn); };
  }
  private emit(committed: boolean) { for (const fn of this.listeners) fn(this.current, committed); }
  private revised(design: ProjectDesign): ProjectDesign {
    const next = copy(design);
    const old = new Map([...this.current.design.routes, ...this.current.design.corridors, ...this.current.design.connections].map(v => [v.id, v]));
    for (const value of [...next.routes, ...next.corridors, ...next.connections]) {
      const previous = old.get(value.id), known = this.versions.get(value.id);
      value.revision = previous && contentKey(previous) === contentKey(value) ? previous.revision : known === undefined ? 0 : known + 1;
    }
    return next;
  }
  private publish(design: ProjectDesign, committed: boolean) {
    for (const value of [...design.routes, ...design.corridors, ...design.connections]) this.versions.set(value.id, value.revision);
    this.current = freeze({ epoch: this.current.epoch, revision: this.current.revision + 1, design: copy(design) });
    this.emit(committed);
  }
  begin(): void {
    if (this.inTransaction) throw new Error('A project transaction is already open');
    this.baseline = copy(this.current.design);
  }
  update(edit: (draft: ProjectDesign) => void): void {
    if (!this.inTransaction) throw new Error('Begin a project transaction before updating');
    const draft = copy(this.current.design);
    edit(draft);
    assertProjectDesign(draft);
    if (draft.scenarioId !== this.options.namespace.scenarioId || draft.presetId !== this.options.namespace.presetId) throw new Error('Cannot change save namespace');
    const next = this.revised(draft);
    if (key(next) !== key(this.current.design)) this.publish(next, false);
  }
  dispatch(command: ProjectCommand): void {
    const own = !this.inTransaction;
    if (own) this.begin();
    try {
      this.update(d => {
        const addRoute = (r: ProjectDesign['routes'][number]) => { if (d.routes.some(old => old.id === r.id)) throw new Error('Route identity exists'); d.routes.push(copy(r)); };
        switch (command.type) {
          case 'create-route': addRoute(command.route); break;
          case 'promote':
            for (const route of command.routes) addRoute(route);
            d.connections.push(...copy(command.connections));
            break;
          case 'replace-route': {
            const i = d.routes.findIndex(r => r.id === command.route.id);
            if (i < 0) throw new Error('Unknown route');
            d.routes[i] = copy(command.route); break;
          }
          case 'delete-route':
            if (!d.routes.some(r => r.id === command.routeId)) throw new Error('Unknown route');
            d.routes = d.routes.filter(r => r.id !== command.routeId);
            d.connections = d.connections.filter(c => !c.ports.some(p => p.kind === 'route' && p.routeId === command.routeId));
            break;
          case 'connect': {
            const i = d.connections.findIndex(c => c.id === command.connection.id);
            if (i < 0) d.connections.push(copy(command.connection)); else d.connections[i] = copy(command.connection);
            break;
          }
          case 'disconnect': d.connections = d.connections.filter(c => c.id !== command.connectionId); break;
          case 'set-building':
            d.buildingOverrides = d.buildingOverrides.filter(b => b.j !== command.index);
            if (command.action !== null) d.buildingOverrides.push({ j: command.index, action: command.action });
            break;
          case 'split-corridor': case 'rejoin-corridor': {
            const i = d.corridors.findIndex(c => c.id === command.corridor.id);
            if (i < 0) throw new Error('Unknown corridor');
            const old = d.corridors[i];
            if (old.children.forward !== command.corridor.children.forward || old.children.reverse !== command.corridor.children.reverse) throw new Error('Cannot replace child identities');
            if (command.children.length !== 2 || new Set(command.children.map(r => r.id)).size !== 2
              || !command.children.every(r => r.id === old.children.forward || r.id === old.children.reverse)) throw new Error('Missing corridor children');
            for (const child of command.children) {
              const j = d.routes.findIndex(r => r.id === child.id);
              if (j < 0 || child.acousticSourceId !== d.routes[j].acousticSourceId) throw new Error('Cannot replace physical acoustic identity');
              d.routes[j] = copy(child);
            }
            d.corridors[i] = copy(command.corridor); break;
          }
        }
      });
      if (own) this.commit();
    } catch (e) { if (own) this.cancel(); throw e; }
  }
  commit(): void {
    if (!this.baseline) throw new Error('No project transaction');
    const design = this.current.design;
    if (key(design) === key(this.baseline)) { this.baseline = null; return; }
    persistProjectSave(this.options, { schemaVersion: 1, design, best: this.savedBest });
    this.history = this.history.slice(0, this.index + 1);
    this.history.push(copy(design));
    if (this.history.length > 200) this.history.shift();
    this.index = this.history.length - 1;
    this.baseline = null;
    this.publish(design, true);
  }
  cancel(): void {
    if (!this.baseline) return;
    const baseline = this.baseline; this.baseline = null;
    if (key(baseline) !== key(this.current.design)) this.publish(this.revised(baseline), true);
  }
  canUndo(): boolean { return this.index > 0; }
  canRedo(): boolean { return this.index + 1 < this.history.length; }
  private moveHistory(index: number): void {
    if (this.inTransaction) this.cancel();
    if (index < 0 || index >= this.history.length) return;
    const design = this.revised(this.history[index]);
    persistProjectSave(this.options, { schemaVersion: 1, design, best: this.savedBest });
    this.index = index; this.publish(design, true);
  }
  undo(): void { this.moveHistory(this.index - 1); }
  redo(): void { this.moveHistory(this.index + 1); }
  offerBest(result: ProjectResult): boolean {
    const d = this.current.design;
    if (this.inTransaction || result.epoch !== this.current.epoch || result.revision !== this.current.revision || !isScorableProject(result)
      || d.objectData !== this.options.objectData || d.transportData !== this.options.transportData
      || projectMissionKey(d) !== key(this.options.mission)
      || Object.keys(result.routes).length !== d.routes.length || d.routes.some(r => result.routes[r.id]?.revision !== r.revision)
      || d.routes.some(r => r.source?.binding === 'unresolved' || r.endpoints.a.binding === 'unresolved' || r.endpoints.b.binding === 'unresolved')) return false;
    const total = result.cost.total!;
    const attributed = Object.values(result.cost.routes).reduce((sum, cost) => sum + cost, result.cost.shared);
    if (!Number.isFinite(attributed) || Math.abs(attributed - total) > 0.005 || this.savedBest && this.savedBest.cost <= total) return false;
    const best: ProjectBest = { cost: total, design: copy(d), at: new Date().toISOString(), model: COST_MODEL_VERSION,
      evaluationVersion: PROJECT_EVALUATION_VERSION, pricingData: this.options.pricingData, missionData: projectMissionKey(d) };
    persistProjectSave(this.options, { schemaVersion: 1, design: d, best });
    this.savedBest = freeze(best); return true;
  }
}
export function openProjectStore(options: ProjectStoreOptions): OpenProjectStoreResult { return ProjectStore.open(options); }
