import type { PairedCrossSection } from '../paired-carriageways';

import type { PairedCategoryId } from './categories';

/** One divided road's cross-section per direction, from the spine out: half the median, inner paved
 * shoulder, inner lane, outer lane, outer paved shoulder, unpaved verge (counted in the category width). */
export interface PairedSection {
  innerLane: number; outerLane: number;
  lanesPerDirection: 2;
  outerPavedShoulder: number; innerPavedShoulder: number; includedSoftShoulder: number;
  median: number; normalCrossfall: number;
}

/**
 * MD VL1 01/2022 sheet 11-02, personally inspected dimensioned drawing.
 * research/22-motorway-evidence.md. Category width includes soft shoulders; optional
 * delineator/barrier shoulders OUTSIDE category width are not silently included here.
 */
export const D275_SECTION: PairedSection = {
  innerLane: 3.75, outerLane: 3.75,
  lanesPerDirection: 2,
  outerPavedShoulder: 3.5,
  innerPavedShoulder: 0.5,
  includedSoftShoulder: 0.5,
  median: 3.5,
  normalCrossfall: 0.025,
};
/** Four-lane divided class I road: MD VL 1 (2022) sheet 11-06 "D a S 21,5": NK 0.50 + ZK 1.50 + JP 3.50 +
 * JP 3.25 + ZK 0.50 + SDP 3.00 + … = 21.50 m (the 2018 revision counts the guide strip in the paved shoulder;
 * research/89 §6). The normal crossfall is taken as the motorway's (not on the sheet as read). */
export const S215_SECTION: PairedSection = {
  innerLane: 3.25, outerLane: 3.5,
  lanesPerDirection: 2,
  outerPavedShoulder: 1.5,
  innerPavedShoulder: 0.5,
  includedSoftShoulder: 0.5,
  median: 3.0,
  normalCrossfall: 0.025,
};
export const PAIRED_SECTIONS: Record<PairedCategoryId, PairedSection> = { 'D27.5': D275_SECTION, 'S21.5': S215_SECTION };

/** Physical paved bands (not nominal half-category widths); representative axis = lane-pair centre. */
export function pairedCrossSection(category: PairedCategoryId): PairedCrossSection {
  const d = PAIRED_SECTIONS[category], inside = d.median / 2, lanes = d.innerLane + d.outerLane;
  const pavedWidth = d.innerPavedShoulder + lanes + d.outerPavedShoulder;
  const outside = inside + pavedWidth, axis = inside + d.innerPavedShoulder + lanes / 2;
  return { right: { min: -outside, max: -inside, axis: -axis }, left: { min: inside, max: outside, axis },
    formation: { min: -outside - d.includedSoftShoulder, max: outside + d.includedSoftShoulder } };
}
export const d275CrossSection = (): PairedCrossSection => pairedCrossSection('D27.5');

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

/** TP 133 (MD 2013), personally checked: V 4 edge line 0.25 m wide on a divided road (§2 "Okraj
 * vozovky"), placed at the lane edge; lane lines 0.125 m (§3.1); dashed lines on motorways are 6 m
 * dashes with double gaps (§3.2: "Na dálnici a SMV se úsečka provádí v délce 6 m … Délka mezery je
 * dvojnásobná"). */
export const MOTORWAY_MARKINGS = { edgeLine: 0.25, laneLine: 0.125, dash: 6, gap: 12 } as const;

