// Map-derived excavation priors. Weathering depths are ESTIMATES, not ČSN definitions or borehole logs.
// The authoritative lithology/depth table is pipeline/ground_profiles.json, shipped in pack metadata.
import { EXCAVATION_MIX } from './data/prices';

export interface GroundProfile {
  name: string;
  /** Depth below original ground, m: loose / decomposed material (class I estimate). */
  classIto: number;
  /** Depth below original ground, m: weathered / rippable rock (class II estimate); III below. */
  classIIto: number;
  /** Unmapped ground uses the norm's volumetric mix, never a fictitious weathering depth. */
  normMix?: boolean;
}
export interface GroundMeta {
  file: string;
  nx: number;
  ny: number;
  cell: number;
  profiles: GroundProfile[];
  /** Hash of the categorical grid and profile table; invalidates saved scores after pack rebuilds. */
  fingerprint?: string;
}
export interface GroundData extends Omit<GroundMeta, 'file'> { ids: Uint8Array }
export const UNKNOWN_GROUND: GroundProfile = {
  name: 'Unmapped ground — norm prior', classIto: 0, classIIto: 0, normMix: true,
};
export const NORM_CAP_I = EXCAVATION_MIX.I;
export const NORM_CAP_II = EXCAVATION_MIX.I + EXCAVATION_MIX.II;

export function groundDescription(g: GroundProfile): string {
  return g.normMix ? `${g.name} (I/II/III 75/20/5 %)`
    : `${g.name} · loose/decomposed to ~${g.classIto} m, weathered/rippable to ~${g.classIIto} m (estimated)`;
}
