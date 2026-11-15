import { RAILWAY_EVIDENCE as E } from './data/railway';

export interface BallastSectionInput {
  /** Explicit selected sleeper geometry; no unsourced universal sleeper dimensions. */
  sleeperDepthM: number;
  /** Horizontal rail-bearing offset from track centre; gauge is not rail-centre separation. */
  railBearingOffsetM: number;
  /** SŽ S4/project subgrade drainage slope supplied by caller; not road crossfall. */
  formationCrossfall: number;
  /** S3 X cl39 special under-ballast mat/geogrid/asphalt cases require an extra 50 mm. */
  extraDepthM: number;
}
export interface TrackbedVertex { offset: number; z: number }

/**
 * Actual uncanted single-track ballast polygon, top datum at sleeper-top z=0. S3 X fig4,
 * concrete sleepers and no special widening. Formation width 6.2 m is independent of gauge.
 * No claim of canted, bridge/tunnel, drainage, structural-layer or ground-earthwork design.
 */
export function uncantedBallastSection(input: BallastSectionInput) {
  const { sleeperDepthM: sleeper, railBearingOffsetM: bearing, formationCrossfall: crossfall, extraDepthM: extra } = input;
  const top = E.ballastTopHalfWidthM, slope = E.ballastSlopeHorizontalPerVertical;
  if (![sleeper, bearing, crossfall, extra].every(Number.isFinite) || sleeper <= 0 || bearing <= 0 || bearing >= top
    || extra < 0 || Math.abs(crossfall * slope) >= 1) throw new Error('Invalid explicit track-bed dimensions');
  const base = -sleeper - E.minimumConcreteSleeperBallastM - extra - Math.abs(crossfall) * bearing;
  const rightToe = (top - slope * base) / (1 + slope * crossfall);
  const leftToe = (-top + slope * base) / (1 - slope * crossfall);
  const polygon: TrackbedVertex[] = [
    { offset: leftToe, z: base + crossfall * leftToe }, { offset: -top, z: 0 },
    { offset: top, z: 0 }, { offset: rightToe, z: base + crossfall * rightToe },
  ];
  let area = 0;
  for (let i = 0; i < polygon.length; i++) { const a = polygon[i], b = polygon[(i + 1) % polygon.length]; area += a.offset * b.z - b.offset * a.z; }
  const leftPath = E.uncantedFormationHalfWidthM + leftToe, rightPath = E.uncantedFormationHalfWidthM - rightToe;
  return { polygon, grossAreaM2: Math.abs(area) / 2, formationHalfWidthM: E.uncantedFormationHalfWidthM,
    formation: [{ offset: -E.uncantedFormationHalfWidthM, z: base - crossfall * E.uncantedFormationHalfWidthM },
      { offset: E.uncantedFormationHalfWidthM, z: base + crossfall * E.uncantedFormationHalfWidthM }],
    leftPathM: leftPath, rightPathM: rightPath,
    fitsFormation: Math.min(leftPath, rightPath) >= E.minimumMaintenancePathM };
}

export interface TrackAssemblyInput {
  ballastAreaM2: number;
  sleeperPitchM: number;
  /** Embedded displaced ballast volume per sleeper, not total sleeper mass/volume by guess. */
  sleeperEmbeddedM3: number;
  railKgPerM: number;
  /** Global physical-track station origin: editor splits must retain it. */
  sleeperPhaseM: number;
}
/**
 * Measured assembly quantities on [s0,s1), in physical-source chainage. Half-open sleeper
 * ownership prevents duplication when an editor route is split. Caller supplies sourced
 * selected components; nothing is priced as asphalt or D27.5/S-road construction.
 */
export function trackAssemblyQuantities(s0: number, s1: number, input: TrackAssemblyInput) {
  if (![s0, s1, ...Object.values(input)].every(Number.isFinite) || s0 < 0 || s1 <= s0 || input.sleeperPitchM <= 0
    || input.ballastAreaM2 <= 0 || input.sleeperEmbeddedM3 < 0 || input.railKgPerM <= 0) throw new Error('Invalid track assembly measurement');
  const length = s1 - s0;
  const sleepers = Math.ceil((s1 - input.sleeperPhaseM) / input.sleeperPitchM) - Math.ceil((s0 - input.sleeperPhaseM) / input.sleeperPitchM);
  const ballastM3 = input.ballastAreaM2 * length - sleepers * input.sleeperEmbeddedM3;
  if (ballastM3 < 0) throw new Error('Sleeper displacement exceeds measured ballast');
  return { trackMetres: length, railMetres: 2 * length, railKg: 2 * length * input.railKgPerM, sleepers, ballastM3 };
}
