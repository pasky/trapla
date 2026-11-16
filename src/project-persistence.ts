import { COST_MODEL_VERSION } from './core/data/prices';
import { PROJECT_EVALUATION_VERSION, type ProjectDesign } from './core/project';
import { projectFromLegacyDesign, type LegacyProjectContext } from './core/project-legacy';
import { assertProjectDesign } from './core/project-validation';
import { cloneProjectValue, projectValueKey } from './core/project-value';
import { readLegacyBytes } from './legacy-storage';
import { projectStorageKeys, type ProjectBest, type ProjectLoadResult, type ProjectSave, type ProjectSaveNamespace, type ProjectStorage } from './project-store-contract';
import { classTraffic } from './core/traffic-census';

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
    && best.missionData === projectMissionKey(d) && best.missionData === projectValueKey(options.mission)
    && bindingRepairs(cloneProjectValue(d), options).length === 0;
}
function bindingRepairs(design: ProjectDesign, options: ProjectLoadOptions): string[] {
  const reasons: string[] = [];
  if (design.objectData !== options.objectData) reasons.push('object-data-changed');
  const transportChanged = design.transportData !== options.transportData;
  if (transportChanged) reasons.push('transport-data-changed');
  const checkPair = (pair: ProjectDesign['routes'][number]['endpoints']) => {
    for (const e of [pair.a, pair.b]) {
      if (e.anchor.kind === 'source' && (transportChanged || e.anchor.location.transportData !== options.transportData)) e.binding = 'unresolved';
      if (e.binding === 'unresolved') reasons.push('unresolved-endpoint');
    }
  };
  const checkAlignment = (a: ProjectDesign['routes'][number]['alignment']) => {
    if (a.kind !== 'corridor') for (const c of a.controls.crossings ?? []) {
      if (c.target.kind === 'source' && c.target.interval.transportData !== options.transportData
        || c.target.kind === 'legacy-way' && c.target.objectData !== options.objectData) reasons.push('unresolved-crossing');
    }
  };
  for (const route of design.routes) {
    if (route.source) {
      if (transportChanged || route.source.intervals.some(i => i.transportData !== options.transportData)) route.source.binding = 'unresolved';
      if (route.source.binding === 'unresolved') reasons.push('unresolved-replacement');
    }
    checkPair(route.endpoints); checkAlignment(route.alignment);
  }
  for (const corridor of design.corridors) {
    checkPair(corridor.endpoints); checkAlignment(corridor.mode === 'paired' ? corridor.spine : corridor.retainedSpine);
  }
  for (const c of design.connections) if (c.ports.some(p => p.kind === 'source' && p.location.transportData !== options.transportData)) reasons.push('unresolved-connection');
  if (projectMissionKey(design) !== projectValueKey(options.mission)) reasons.push('mission-changed');
  return [...new Set(reasons)];
}
export function projectBindingsCurrent(design: ProjectDesign, options: ProjectLoadOptions): boolean {
  return bindingRepairs(cloneProjectValue(design), options).length === 0;
}
/** Saves from before traffic was pre-filled hold roads with "traffic not set" (aadt 0): each gets the
 * average road of its class, as a road rebuilt today without a census count does (the card labels it). */
function settleTraffic(design: ProjectDesign): boolean {
  let changed = false;
  for (const route of design.routes) if (route.kind === 'road' && route.specification.operations.trafficUnknown) {
    const { trafficUnknown: _old, ...rest } = route.specification.operations, t = classTraffic(route.specification.legalClass);
    route.specification.operations = { ...rest, aadt: t.aadt, heavyShare: t.heavyShare };
    changed = true;
  }
  return changed;
}
/** Pure read/migration. Never writes, never constructs legacy Store, never replaces bad bytes. */
export function loadProjectSave(options: ProjectLoadOptions): ProjectLoadResult {
  const raw = options.storage.getItem(projectStorageKeys(options.namespace).project);
  if (raw !== null) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || (parsed as ProjectSave).schemaVersion !== 1) throw new Error('Unsupported save schema');
      const save = parsed as ProjectSave;
      assertProjectDesign(save.design, true);
      if (save.design.scenarioId !== options.namespace.scenarioId || save.design.presetId !== options.namespace.presetId) throw new Error('Save namespace mismatch');
      let originalProject: string | undefined;
      if (settleTraffic(save.design)) originalProject = raw;
      // Whatever the loader drops or rewrites (malformed/stale/newer best, repaired bindings) keeps the
      // exact original envelope in project recovery before the slot is ever written again.
      if (save.best) {
        try {
          // Best is optional: malformed best bytes must not block valid current work.
          assertProjectDesign(save.best.design, true);
          settleTraffic(save.best.design);
          if (!compatibleProjectBest(save.best, options)) { originalProject = raw; save.best = null; }
        } catch { originalProject = raw; save.best = null; }
      } else save.best = null;
      const reasons = bindingRepairs(save.design, options);
      assertProjectDesign(save.design);
      if (reasons.length) { save.best = null; return { status: 'needs-repair', save, original: null, reasons, originalProject: raw }; }
      return { status: 'loaded', save, original: null, ...(originalProject ? { originalProject } : {}) };
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
/** Distinct original envelopes go to `<key>`, then `<key>:2` … `<key>:${PROJECT_RECOVERY_SLOTS}`; an identical
 * original is not stored twice. Full slots throw, so the caller keeps the old bytes instead of losing one. */
export const PROJECT_RECOVERY_SLOTS = 16;
export function preserveProjectOriginal(storage: ProjectLoadOptions['storage'], key: string, original: string): void {
  for (let i = 1; i <= PROJECT_RECOVERY_SLOTS; i++) {
    const slot = i === 1 ? key : `${key}:${i}`, held = storage.getItem(slot);
    if (held === original) return;
    if (held === null) { storage.setItem(slot, original); return; }
  }
  throw new Error('Project recovery slots are full; refusing to overwrite the saved project');
}
/** Recovery must succeed before the new slot is written. Never modifies legacy .design/.best. */
export function persistProjectSave(options: ProjectLoadOptions, save: ProjectSave, load?: ProjectLoadResult): void {
  const keys = projectStorageKeys(options.namespace);
  if (load && 'originalProject' in load && load.originalProject) preserveProjectOriginal(options.storage, keys.projectRecovery, load.originalProject);
  if (load && 'original' in load && load.original && options.storage.getItem(keys.recovery) === null) {
    options.storage.setItem(keys.recovery, JSON.stringify(load.original));
  }
  const disk = cloneProjectValue(save);
  assertProjectDesign(disk.design);
  options.storage.setItem(keys.project, JSON.stringify(disk));
}
