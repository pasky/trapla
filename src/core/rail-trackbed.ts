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
  /** Applicable SŽ S4/project path minimum. The S3 constrained-reconstruction 0.4 m is NOT a new-line default. */
  minimumMaintenancePathM: number;
  /** Explicit upper ballast profile between ±1.7 m, endpoints at sleeper-head datum z=0.
   * S3 X cl45 includes a central depression; no universal flat top is assumed.
   */
  topProfile: readonly TrackbedVertex[];
}
export interface TrackbedVertex { offset: number; z: number }

/**
 * Uncanted single-track ballast polygon for an EXPLICIT selected upper profile, sleeper-head
 * datum z=0. S3 X fig4, concrete sleepers and no special widening. Formation width 6.2 m is
 * independent of gauge. A supplied flat top is only a gross envelope, not S3 cl45's shaped
 * inter-sleeper surface. No claim of canted, bridge/tunnel, drainage, structural-layer or
 * ground-earthwork design. SŽ S4/path applicability remains the caller's responsibility.
 */
export function uncantedBallastSection(input: BallastSectionInput) {
  const { sleeperDepthM: sleeper, railBearingOffsetM: bearing, formationCrossfall: crossfall, extraDepthM: extra } = input;
  const top = E.ballastTopHalfWidthM, slope = E.ballastSlopeHorizontalPerVertical;
  if (![sleeper, bearing, crossfall, extra, input.minimumMaintenancePathM].every(Number.isFinite)
    || sleeper <= 0 || bearing <= 0 || bearing >= top || input.minimumMaintenancePathM <= 0
    || extra < 0 || Math.abs(crossfall * slope) >= 1) throw new Error('Invalid explicit track-bed dimensions');
  const base = -sleeper - E.minimumConcreteSleeperBallastM - extra - Math.abs(crossfall) * bearing;
  const rightToe = (top - slope * base) / (1 + slope * crossfall);
  const leftToe = (-top + slope * base) / (1 - slope * crossfall);
  const profile = input.topProfile;
  if (profile.length < 2 || profile[0].offset !== -top || profile[profile.length - 1].offset !== top
    || profile[0].z !== 0 || profile[profile.length - 1].z !== 0
    || profile.some((p, i) => ![p.offset, p.z].every(Number.isFinite) || p.z > 0 || p.z < base + crossfall * p.offset
      || (i > 0 && p.offset <= profile[i - 1].offset))) throw new Error('Explicit upper ballast profile required');
  const polygon: TrackbedVertex[] = [
    { offset: leftToe, z: base + crossfall * leftToe }, ...profile.map(p => ({ ...p })),
    { offset: rightToe, z: base + crossfall * rightToe },
  ];
  let area = 0;
  for (let i = 0; i < polygon.length; i++) { const a = polygon[i], b = polygon[(i + 1) % polygon.length]; area += a.offset * b.z - b.offset * a.z; }
  const leftPath = E.uncantedFormationHalfWidthM + leftToe, rightPath = E.uncantedFormationHalfWidthM - rightToe;
  return { polygon, grossAreaM2: Math.abs(area) / 2, formationHalfWidthM: E.uncantedFormationHalfWidthM,
    formation: [{ offset: -E.uncantedFormationHalfWidthM, z: base - crossfall * E.uncantedFormationHalfWidthM },
      { offset: E.uncantedFormationHalfWidthM, z: base + crossfall * E.uncantedFormationHalfWidthM }],
    leftPathM: leftPath, rightPathM: rightPath,
    fitsFormation: Math.min(leftPath, rightPath) >= input.minimumMaintenancePathM };
}

export interface TrackAssemblyInput {
  ballastAreaM2: number;
  sleeperPitchM: number;
  /** Embedded displaced ballast volume per sleeper, not total sleeper mass/volume by guess. */
  sleeperEmbeddedM3: number;
  /** Explicit longitudinal extent of prismatic embedded sleeper solid; displacement is clipped,
   * independently of which editor interval owns the procurement count.
   */
  sleeperAlongTrackM: number;
  railKgPerM: number;
  /** First sleeper's leading edge, in [0,pitch); editor splits retain this physical-track phase. */
  sleeperPhaseM: number;
}
/**
 * Measured assembly quantities on [s0,s1), in physical-source chainage. Half-open sleeper
 * ownership prevents duplication when an editor route is split. Caller supplies sourced
 * selected components; nothing is priced as asphalt or D27.5/S-road construction.
 */
export function trackAssemblyQuantities(s0: number, s1: number, input: TrackAssemblyInput) {
  if (![s0, s1, ...Object.values(input)].every(Number.isFinite) || s0 < 0 || s1 <= s0 || input.sleeperPitchM <= 0
    || input.ballastAreaM2 <= 0 || input.sleeperEmbeddedM3 < 0 || input.railKgPerM <= 0
    || input.sleeperAlongTrackM <= 0 || input.sleeperAlongTrackM > input.sleeperPitchM
    || input.sleeperPhaseM < 0 || input.sleeperPhaseM >= input.sleeperPitchM
    || input.sleeperEmbeddedM3 / input.sleeperAlongTrackM > input.ballastAreaM2) throw new Error('Invalid track assembly measurement');
  const length = s1 - s0;
  const sleepers = Math.ceil((s1 - input.sleeperPhaseM) / input.sleeperPitchM) - Math.ceil((s0 - input.sleeperPhaseM) / input.sleeperPitchM);
  // Integral of a periodic prismatic sleeper solid, bounded O(1) even for long source intervals.
  const occupied = (s: number) => {
    const x = Math.max(0, s - input.sleeperPhaseM), periods = Math.floor(x / input.sleeperPitchM);
    return periods * input.sleeperAlongTrackM + Math.min(x - periods * input.sleeperPitchM, input.sleeperAlongTrackM);
  };
  const displaced = (occupied(s1) - occupied(s0)) * input.sleeperEmbeddedM3 / input.sleeperAlongTrackM;
  const ballastM3 = input.ballastAreaM2 * length - displaced;
  return { trackMetres: length, railMetres: 2 * length, railKg: 2 * length * input.railKgPerM, sleepers, ballastM3 };
}
