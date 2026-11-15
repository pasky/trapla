import { RAILWAY_EVIDENCE as E } from './data/railway';
import type { RailwaySpec } from './project';
import type { TransportSource } from './project-transport';

export interface RailTrainGroup { speed: number; day: number; night: number }
export interface CantPolicy { maxCantMm: number; deficiencyMm: number; excessMm: number }

function finiteNonnegative(value: number): boolean { return Number.isFinite(value) && value >= 0; }
function checkTrains(trains: readonly RailTrainGroup[]): RailTrainGroup[] {
  if (trains.some(t => ![t.speed, t.day, t.night].every(finiteNonnegative) || (t.day + t.night > 0 && t.speed <= 0))) throw new Error('Invalid train operations');
  const active = trains.filter(t => t.day + t.night > 0);
  if (!active.length) throw new Error('Train operations are unspecified or empty');
  return active;
}

/** Physics only, no implicit road radius, AADT, or permitted cant deficiency. */
export function equilibriumCantMm(speedKmh: number, radiusM: number): number {
  if (!finiteNonnegative(speedKmh) || !(radiusM > 0) || Number.isNaN(radiusM)) throw new Error('Invalid train speed or curve radius');
  return E.equilibriumCantCoefficient * speedKmh * speedKmh / radiusM;
}

/** Intersect ALL operating-speed constraints: faster trains impose deficiency, slower trains excess. */
export function railCantEnvelope(radiusM: number, trains: readonly RailTrainGroup[], policy: CantPolicy) {
  const active = checkTrains(trains);
  if (![policy.maxCantMm, policy.deficiencyMm, policy.excessMm].every(finiteNonnegative)) throw new Error('Invalid cant policy');
  let minimumMm = 0, maximumMm = policy.maxCantMm;
  for (const train of active) {
    const eq = equilibriumCantMm(train.speed, radiusM);
    minimumMm = Math.max(minimumMm, eq - policy.deficiencyMm);
    maximumMm = Math.min(maximumMm, eq + policy.excessMm);
  }
  return { minimumMm, maximumMm, feasible: minimumMm <= maximumMm };
}

/**
 * Explicit older-teaching ordinary envelope, never a current norm certificate. Caller must state
 * annual loading; counts alone cannot determine it without train masses. No turnouts, ≤160 km/h.
 */
export function provisionalConventionalCantPolicy(radiusM: number, maximumOperatingSpeedKmh: number, annualMillionTonnes: number): CantPolicy {
  if (!finiteNonnegative(annualMillionTonnes) || !(maximumOperatingSpeedKmh > 0 && maximumOperatingSpeedKmh <= 160)
    || !(radiusM > 50)) throw new Error('Explicit radius, speed up to 160 km/h and annual railway loading are required');
  // Older teaching source p4 small-radius absolute cap; no standing cant on a straight.
  const radiusCap = radiusM === Infinity ? 0 : radiusM < 290 ? (radiusM - 50) / 1.5 : Infinity;
  return { maxCantMm: Math.min(radiusCap, annualMillionTonnes > 20 ? E.highLoadCantMm : E.ordinaryCantMm),
    deficiencyMm: E.ordinaryDeficiencyMm, excessMm: E.ordinaryExcessMm };
}

/** Only the cant-ramp part of the transition requirement. Curvature/deficiency-rate checks remain missing.
 * The 445 low-speed floor is an explicitly conservative policy extension from the source's
 * limit-column footnote, not a sourced standard-column requirement (research/23).
 */
export function provisionalLinearCantRampMetres(deltaCantMm: number, speedKmh: number): number {
  if (!Number.isFinite(deltaCantMm) || !(speedKmh > 0 && speedKmh <= 160)) throw new Error('Cant ramp prototype supports positive speeds up to 160 km/h');
  const n = Math.max(E.linearCantRampFactor * speedKmh, speedKmh <= 80 ? E.conservativeRampMinimumInverseSlope : 0);
  return n * Math.abs(deltaCantMm) / 1000;
}

export interface RailPassByExposure { dayTrains: number; nightTrains: number; /** Receiver-specific single-event SEL dB(A), externally modelled/measured. */ selDb: number }
/**
 * Integrate supplied train-event exposure into 16h/8h LAeq. This is NOT a railway emission
 * prediction: absent SEL is unknown, not zero/road noise. Each pass-by must be represented once.
 */
export function railEquivalentExposure(events: readonly RailPassByExposure[]) {
  if (!events.length || events.some(e => !Number.isFinite(e.selDb) || ![e.dayTrains, e.nightTrains].every(finiteNonnegative))) throw new Error('Explicit train-event exposures required');
  let dayEnergy = 0, nightEnergy = 0;
  for (const event of events) {
    const energy = 10 ** (event.selDb / 10);
    dayEnergy += event.dayTrains * energy / (16 * 3600);
    nightEnergy += event.nightTrains * energy / (8 * 3600);
  }
  if (![dayEnergy, nightEnergy].every(Number.isFinite)) throw new Error('Train exposure overflow');
  return { dayEnergy, nightEnergy, dayDb: dayEnergy > 0 ? 10 * Math.log10(dayEnergy) : null,
    nightDb: nightEnergy > 0 ? 10 * Math.log10(nightEnergy) : null };
}

/** Relocation permit/history needs explicit classification; unknown is never silently assigned new-line limits. */
export function railwayNoiseLimits(classification: 'new-line' | 'relocation-unresolved') {
  if (classification === 'new-line') return { ...E.newLineNoise };
  if (classification === 'relocation-unresolved') return null;
  throw new Error('Unknown railway noise classification');
}

/**
 * Imported-line capability screen. Raw missing/ambiguous tags remain unknown. A one-track
 * prototype never claims another parallel way or turns an electrified line into a diesel line.
 * This is a metadata screen, not acceptance of source replacement or physical reconnection.
 */
export function railwaySourceCompatibility(source: TransportSource, spec: RailwaySpec) {
  const unresolved: string[] = [], incompatible: string[] = [];
  if (source.kind !== 'railway' || source.tags.railway !== 'rail') incompatible.push('not-conventional-rail');
  const gauge = source.tags.gauge;
  if (gauge === undefined || !/^\d+$/.test(gauge)) unresolved.push('gauge');
  else if (Number(gauge) !== spec.gaugeMm) incompatible.push('gauge-change');
  const electrified = source.tags.electrified;
  if (electrified === undefined || !['no', 'contact_line', 'yes'].includes(electrified)) unresolved.push('electrification');
  else if (electrified === 'no') { if (spec.electrification !== 'none') incompatible.push('electrification-change'); }
  else {
    if (spec.electrification === 'none') incompatible.push('electrification-removal');
    const { voltage, frequency } = source.tags;
    if (voltage === undefined || frequency === undefined) unresolved.push('electrical-system');
    else if ((spec.electrification === 'AC25kV' && (voltage !== '25000' || frequency !== '50'))
      || (spec.electrification === 'DC3kV' && (voltage !== '3000' || frequency !== '0'))
      || spec.electrification === 'other') incompatible.push('electrical-system-change');
  }
  // tracks is a source tag, NOT the number of neighbouring OSM ways. Unknown is not guessed.
  if (source.tags.tracks === undefined || !/^\d+$/.test(source.tags.tracks)) unresolved.push('track-count');
  else if (Number(source.tags.tracks) !== spec.tracks) incompatible.push('track-count-change');
  if (source.elevation === 'unknown') unresolved.push('source-elevation');
  return { compatible: !unresolved.length && !incompatible.length, unresolved, incompatible,
    preservedNeighbourIds: [...(source.parallelSourceIds ?? [])] };
}
