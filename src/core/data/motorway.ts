import type { PairedCrossSection } from '../paired-carriageways';

/**
 * MD VL1 01/2022 sheet 11-02, personally inspected dimensioned drawing.
 * research/22-motorway-evidence.md. Category width includes soft shoulders; optional
 * delineator/barrier shoulders OUTSIDE category width are not silently included here.
 */
export const D275_SECTION = {
  laneWidth: 3.75,
  lanesPerDirection: 2,
  outerPavedShoulder: 3.5,
  innerPavedShoulder: 0.5,
  includedSoftShoulder: 0.5,
  median: 3.5,
  normalCrossfall: 0.025,
} as const;

/** Physical paved bands (not nominal half-category widths); representative axis = lane-pair centre. */
export function d275CrossSection(): PairedCrossSection {
  const d = D275_SECTION, inside = d.median / 2;
  const pavedWidth = d.innerPavedShoulder + d.lanesPerDirection * d.laneWidth + d.outerPavedShoulder;
  const outside = inside + pavedWidth, axis = inside + d.innerPavedShoulder + d.lanesPerDirection * d.laneWidth / 2;
  return { right: { min: -outside, max: -inside, axis: -axis }, left: { min: inside, max: outside, axis },
    formation: { min: -outside - d.includedSoftShoulder, max: outside + d.includedSoftShoulder } };
}

/** Radimský 2019 slides 4/6/15, ČSN 73 6101:2018 revision; research/21 and /22.
 * Radius requires 6% superelevation AND stopping sight distance, not an unconditional curve approval.
 * Transition speed floor is NOT full runoff design. Vertical/grade values deliberately absent.
 */
export function motorwayHorizontalEvidence(speed: number) {
  const row = ({ 130: [840, 2420], 120: [690, 2060], 110: [560, 1740] } as Record<number, number[]>)[speed];
  if (!row) throw new Error('Unsupported motorway design speed');
  return { minRadiusAtSixPercent: row[0], noSuperelevationRadius: row[1], speedTransitionFloor: speed,
    maxGradient: null, minCrestRadius: null, minSagRadius: null, complete: false as const };
}
