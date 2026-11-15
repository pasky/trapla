// Public command/persistence contract. Implementation follows the C0 API checkpoint.
import type { CorridorDesign, ProjectDesign, ProjectIdentity, ProjectResult, ProjectSnapshot,
  RouteDesign, RouteId, ConnectionDesign, ProjectSelection } from './core/project';

export type ProjectCommand =
  | { type: 'create-route'; route: RouteDesign }
  | { type: 'promote'; routes: RouteDesign[]; connections: ConnectionDesign[] }
  | { type: 'replace-route'; route: RouteDesign }
  | { type: 'delete-route'; routeId: RouteId }
  | { type: 'connect'; connection: ConnectionDesign }
  | { type: 'disconnect'; connectionId: string }
  | { type: 'set-building'; index: number; action: 'buy' | 'keep' | null }
  | { type: 'split-corridor'; corridor: Extract<CorridorDesign, { mode: 'independent' }>; children: [RouteDesign, RouteDesign] }
  | { type: 'rejoin-corridor'; corridor: Extract<CorridorDesign, { mode: 'paired' }>; children: [RouteDesign, RouteDesign] };
export interface ProjectBest {
  cost: number; design: ProjectDesign; at: string;
  model: number; evaluationVersion: number; pricingData: string;
  /** Mission identity + requirements fingerprint, not merely scenario name. */
  missionData: string;
}
export interface ProjectSave {
  schemaVersion: 1; design: ProjectDesign; best: ProjectBest | null;
}
export type ProjectLoadResult =
  | { status: 'loaded' | 'migrated'; save: ProjectSave; original: LegacyBytes | null }
  | { status: 'needs-repair'; save: ProjectSave; original: LegacyBytes | null; reasons: string[] }
  | { status: 'unsupported'; raw: string; reason: string }
  | { status: 'empty' };
/** Read these BEFORE constructing legacy Store (its constructor persists immediately).
 * Preserve exact bytes in a recovery key before writing the separate project-v1 key. */
export interface LegacyBytes { design: string | null; best: string | null }
export interface ProjectStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface ProjectSaveNamespace { scenarioId: string; presetId: string }
/** Pack fingerprint is deliberately NOT in the key: changed packs must recover the user's geometry,
 * not hide it behind a fresh namespace. Keep schemas in one stable slot so newer saves are detected. */
export function projectStorageKeys(namespace: ProjectSaveNamespace): { project: string; recovery: string } {
  const suffix = `${encodeURIComponent(namespace.scenarioId)}:${encodeURIComponent(namespace.presetId)}`;
  return { project: `trapla.project:${suffix}`, recovery: `trapla.recovery:${suffix}` };
}
/** Continue means there are bytes to load/recover, NOT proof they are valid or scored.
 * Even malformed/newer saves must reach the recovery UI rather than being overwritten by Start. */
export function hasProjectSave(storage: Pick<ProjectStorage, 'getItem'>, namespace: ProjectSaveNamespace): boolean {
  return storage.getItem(projectStorageKeys(namespace).project) !== null;
}
export interface ProjectStoreApi {
  readonly snapshot: ProjectSnapshot;
  readonly best: ProjectBest | null;
  readonly inTransaction: boolean;
  begin(): void;
  /** Failed commands leave the draft unchanged; unknown sources are not silently dropped. */
  dispatch(command: ProjectCommand): void;
  /** Copy-on-write draft update for continuous drags; validates before publishing. */
  update(edit: (draft: ProjectDesign) => void): void;
  commit(): void;
  cancel(): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Requires current settled identity, complete validity, and no open transaction. */
  offerBest(result: ProjectResult): boolean;
  subscribe(listener: (snapshot: ProjectSnapshot, committed: boolean) => void): () => void;
}
export interface ProjectEditorState {
  activeRouteId: RouteId | null; selection: ProjectSelection;
}
/** Selection repair is UI-only: never an undoable design mutation. */
export function repairProjectEditor(state: ProjectEditorState, design: ProjectDesign, settled?: ProjectResult): ProjectEditorState {
  const ids = new Set(design.routes.map(r => r.id));
  const activeRouteId = state.activeRouteId && ids.has(state.activeRouteId) ? state.activeRouteId : design.routes[0]?.id ?? null;
  let selection = state.selection;
  if (selection?.kind === 'route') {
    const routeId = selection.routeId;
    const route = design.routes.find(r => r.id === routeId);
    if (!route) selection = null;
    else {
      const target = selection.target, alignment = route.alignment;
      if (target.kind !== 'range') {
        const count = target.kind === 'pi' ? (alignment.kind === 'pi' ? alignment.pis.length : 0)
          : alignment.kind === 'corridor' ? 0
          : target.kind === 'vpi' ? (alignment.vertical.kind === 'manual' ? alignment.vertical.vpis.length : 0)
          : alignment.vertical.kind === 'auto' ? alignment.vertical.pins.length : 0;
        if (!Number.isInteger(target.index) || target.index < 0 || target.index >= count) selection = null;
      }
    }
  }
  if (selection?.kind === 'work') {
    const workId = selection.workId;
    if (!settled?.works.items.some(w => w.id === workId)) selection = null;
  }
  if (selection?.kind === 'building' && selection.objectData !== design.objectData) selection = null;
  if (selection?.kind === 'source' && selection.interval.transportData !== design.transportData) selection = null;
  return { activeRouteId, selection };
}
export function sameProjectIdentity(a: ProjectIdentity, b: ProjectIdentity): boolean {
  return a.epoch === b.epoch && a.revision === b.revision;
}
