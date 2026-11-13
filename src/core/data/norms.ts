// Geometric norm limits as data. Checks that use them live in core/checks.ts as per-category
// functions (roads now; rail would get its own function using cant instead of superelevation).

export interface SpeedNorms {
  speed: number;
  /** ČSN 73 6101 (2018) minimum horizontal radius at 6 % superelevation, m (research/00 §4.1) */
  minRadius: number;
  /** radius above which no superelevation is needed, m — information only */
  noSuperelevationRadius: number;
  /** minimum transition (clothoid) length, m — "at least vn metres" (research/00 §4.1) */
  minTransition: number;
  /** PROVISIONAL: older-edition minimum crest vertical radius, m (100 km/h value used for 90) */
  minCrestRadius: number;
  /** PROVISIONAL: older-edition minimum sag vertical radius, m (100 km/h value used for 90) */
  minSagRadius: number;
}

export const SPEED_NORMS: Record<number, SpeedNorms> = {
  90: { speed: 90, minRadius: 355, noSuperelevationRadius: 1160, minTransition: 90, minCrestRadius: 6000, minSagRadius: 3400 },
  80: { speed: 80, minRadius: 280, noSuperelevationRadius: 920, minTransition: 80, minCrestRadius: 3000, minSagRadius: 2100 },
  70: { speed: 70, minRadius: 205, noSuperelevationRadius: 705, minTransition: 70, minCrestRadius: 2500, minSagRadius: 1500 },
};

export const PROVISIONAL_NORMS = {
  /** PROVISIONAL: older-edition max gradient for S 9.5 / S 11.5 in hilly terrain (research/00 §4.2) */
  maxGradient: 0.06,
  verticalRadiiNote: 'older edition of ČSN 73 6101, not confirmed for 2018; 90 km/h uses the 100 km/h column',
};

export function speedNorms(speed: number): SpeedNorms {
  const n = SPEED_NORMS[speed];
  if (!n) throw new Error(`no norms for design speed ${speed}`);
  return n;
}
