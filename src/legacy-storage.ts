import type { LegacyBytes, ProjectStorage } from './project-store-contract';
/** The exact bytes of an old single-road save (before the project store), read before anything is written. */
export function readLegacyBytes(storage: Pick<ProjectStorage, 'getItem'>, legacyKey: string): LegacyBytes {
  return { design: storage.getItem(`${legacyKey}.design`), best: storage.getItem(`${legacyKey}.best`) };
}
