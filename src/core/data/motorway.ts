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

/** TP 133 (MD 2013), personally checked: V 4 edge line 0.25 m wide on a divided road (§2 "Okraj
 * vozovky"), placed at the lane edge; lane lines 0.125 m (§3.1); dashed lines on motorways are 6 m
 * dashes with double gaps (§3.2: "Na dálnici a SMV se úsečka provádí v délce 6 m … Délka mezery je
 * dvojnásobná"). */
export const MOTORWAY_MARKINGS = { edgeLine: 0.25, laneLine: 0.125, dash: 6, gap: 12 } as const;

/** The 150 km/h speed-limit pilot (research/41): a posted limit, never a design speed. MD's D3 pilot
 * (exits 84–131, 47 km, from 5 Oct 2025, extended to the end of 2026) runs on a motorway built for 130 km/h
 * (ČSN 73 6101:2018 tops out at 130), under Act 361/2000 §18(7) (+20 km/h by local regulation on a divided
 * motorway), shown by variable signs only in dry, clear, light traffic; trucks stay at 80 km/h.
 * - `designSpeed`: offered only on a motorway designed for 130 km/h.
 * - `signsPerM`: ŘSD's itemised price of the D3 signing project, 54.4 M CZK (documentation, 42 variable signs,
 *   temporary signs, guardrail changes, power incl. earthworks; ŘSD's Mátl in Ekonomický deník 27 Aug 2025)
 *   over its 47 km. PROVISIONAL: spread by length (the D3 section has 9 junctions; denser junctions would need
 *   more signs).
 * - `lightSpeedRise`: light vehicles' lane speeds in the motorway noise source rise by the limit's +20 km/h.
 *   PROVISIONAL extrapolation: the Czech manual's lane speeds are measured under 130; its emission formula is
 *   used beyond its data (CNOSSOS-EU does the same above 130; its rolling term would give +1.9 dB for
 *   130 → 150). Counted as if 150 applied all day and night: an upper bound. */
export const MOTORWAY_150_PILOT = { limit: 150, designSpeed: 130, signsPerM: 54.4e6 / 47_000, lightSpeedRise: 20 } as const;
