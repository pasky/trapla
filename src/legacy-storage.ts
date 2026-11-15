import type { LegacyBytes, ProjectStorage } from './project-store-contract';
/** Always call before constructing legacy Store: it normalises/persists immediately. */
export function readLegacyBytes(storage: Pick<ProjectStorage, 'getItem'>, legacyKey: string): LegacyBytes {
  return { design: storage.getItem(`${legacyKey}.design`), best: storage.getItem(`${legacyKey}.best`) };
}
