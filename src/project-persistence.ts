import { COST_MODEL_VERSION } from './core/data/prices';
import { PROJECT_EVALUATION_VERSION, type ProjectDesign } from './core/project';
import { projectFromLegacyDesign, type LegacyProjectContext } from './core/project-legacy';
import { assertProjectDesign } from './core/project-validation';
import { cloneProjectValue, projectValueKey } from './core/project-value';
import { readLegacyBytes } from './legacy-storage';
import { projectStorageKeys, type ProjectBest, type ProjectLoadResult, type ProjectSave, type ProjectSaveNamespace, type ProjectStorage } from './project-store-contract';

export interface ProjectLoadOptions {
  storage: ProjectStorage; namespace: ProjectSaveNamespace;
  objectData: string; transportData: string | null; pricingData: string;
  /** Current mission requirements, including preset-specific travel/operation goals. */
  mission: ProjectDesign['mission'];
  legacy?: { key: string; context: LegacyProjectContext;
    /** Explicit certification by bootstrap that this preset retains old mission/evaluation semantics. */
    compatibleSemantics: boolean };
}
export const projectMissionKey = (design: Pick<ProjectDesign, 'mission'>) => projectValueKey(design.mission);
export function compatibleProjectBest(best: ProjectBest, options: ProjectLoadOptions): boolean {
  const d = best.design;
  return Number.isFinite(best.cost) && best.cost >= 0 && typeof best.at === 'string'
    && best.model === COST_MODEL_VERSION && best.evaluationVersion === PROJECT_EVALUATION_VERSION
    && best.pricingData === options.pricingData && d.objectData === options.objectData && d.transportData === options.transportData
    && d.scenarioId === options.namespace.scenarioId && d.presetId === options.namespace.presetId
    && best.missionData === projectMissionKey(d) && best.missionData === projectValueKey(options.mission);
}
function bindingRepairs(design: ProjectDesign, options: ProjectLoadOptions): string[] {
  const reasons: string[] = [];
  if (design.objectData !== options.objectData) reasons.push('object-data-changed');
  if (design.transportData !== options.transportData) {
    reasons.push('transport-data-changed');
    for (const route of design.routes) {
      if (route.source) route.source.binding = 'unresolved';
      for (const e of [route.endpoints.a, route.endpoints.b]) if (e.anchor.kind === 'source') e.binding = 'unresolved';
    }
  }
  if (projectMissionKey(design) !== projectValueKey(options.mission)) reasons.push('mission-changed');
  return reasons;
}
/** Pure read/migration. Never writes, never constructs legacy Store, never replaces bad bytes. */
export function loadProjectSave(options: ProjectLoadOptions): ProjectLoadResult {
  const raw = options.storage.getItem(projectStorageKeys(options.namespace).project);
  if (raw !== null) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || (parsed as ProjectSave).schemaVersion !== 1) throw new Error('Unsupported save schema');
      const save = parsed as ProjectSave;
      assertProjectDesign(save.design);
      if (save.design.scenarioId !== options.namespace.scenarioId || save.design.presetId !== options.namespace.presetId) throw new Error('Save namespace mismatch');
      if (save.best) {
        assertProjectDesign(save.best.design);
        if (!compatibleProjectBest(save.best, options)) save.best = null;
      } else save.best = null;
      const reasons = bindingRepairs(save.design, options);
      if (reasons.length) { save.best = null; return { status: 'needs-repair', save, original: null, reasons }; }
      return { status: 'loaded', save, original: null };
    } catch (e) { return { status: 'unsupported', raw, reason: String(e) }; }
  }
  if (!options.legacy) return { status: 'empty' };
  const original = readLegacyBytes(options.storage, options.legacy.key);
  if (original.design === null && original.best === null) return { status: 'empty' };
  try {
    if (original.design === null) throw new Error('Legacy current design missing');
    const design = projectFromLegacyDesign(JSON.parse(original.design), options.legacy.context);
    let best: ProjectBest | null = null;
    if (original.best !== null && options.legacy.compatibleSemantics) {
      // A malformed best does not discard a recoverable current design; exact old bytes survive.
      try {
        const b = JSON.parse(original.best);
        if (b && b.model === COST_MODEL_VERSION && b.pricingData === options.pricingData) {
          const candidate = projectFromLegacyDesign(b.design, options.legacy.context);
          const migrated = { cost: b.cost, at: b.at, design: candidate, model: b.model, pricingData: b.pricingData,
            evaluationVersion: PROJECT_EVALUATION_VERSION, missionData: projectMissionKey(candidate) };
          if (compatibleProjectBest(migrated, options)) best = migrated;
        }
      } catch { /* Preserved verbatim in original; current design can still migrate. */ }
    }
    const reasons = bindingRepairs(design, options);
    const save: ProjectSave = { schemaVersion: 1, design, best: reasons.length ? null : best };
    return reasons.length ? { status: 'needs-repair', save, original, reasons } : { status: 'migrated', save, original };
  } catch (e) { return { status: 'unsupported', raw: original.design ?? original.best!, reason: String(e) }; }
}
/** Recovery must succeed before the new slot is written. Never modifies legacy .design/.best. */
export function persistProjectSave(options: ProjectLoadOptions, save: ProjectSave, load?: ProjectLoadResult): void {
  const keys = projectStorageKeys(options.namespace);
  if (load && 'original' in load && load.original && options.storage.getItem(keys.recovery) === null) {
    options.storage.setItem(keys.recovery, JSON.stringify(load.original));
  }
  const disk = cloneProjectValue(save);
  assertProjectDesign(disk.design);
  options.storage.setItem(keys.project, JSON.stringify(disk));
}
