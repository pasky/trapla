// Geometric norm limits as data. Checks that use them live in core/checks.ts as per-category
// functions (roads now; rail would get its own function using cant instead of superelevation).

export interface SpeedNorms {
  speed: number;
  /** ČSN 73 6101 (2018) minimum horizontal radius at 6 % superelevation, m (research/00 §4.1) */
  minRadius: number;
  /** radius above which no superelevation is needed, m — information only */
  noSuperelevationRadius: number;
  /** speed-based transition minimum, m; 2018 also requires ≥ runoff length (not modelled), research/15 */
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

/** Motorway design speeds: D 27.5 base 130, lowered by 10 or 20 in justified cases (Radimský 2019 slide 4).
 * Radii at 6 % superelevation and no-superelevation radii: Radimský slide 6 (data/motorway.ts).
 * Transition minimum = vn metres (slide 15; runoff length not modelled, as for roads).
 * Vertical radii: the 2018 table is not public (research/22 §2, /29 §1, §6), so PROVISIONAL older-edition
 * values, as for the road rows: crest = ČSN 73 6101:2004 "Rv zast. dovolené" 15,000 / 12,000 / 10,000 m
 * at 130 / 120 / 110 (reproduced in Mahdal, VUT 2012, p. 8; research/29 §6). Sag: the older VUT
 * "Aplikace ČSN 73 6101" p. 11 gives 5,000 m at 120 only; 110 uses it (conservative); 130 has no older
 * column found and reuses 5,000 m: UNVERIFIED, may be too lenient at 130. */
export const MOTORWAY_SPEED_NORMS: Record<number, SpeedNorms> = {
  130: { speed: 130, minRadius: 840, noSuperelevationRadius: 2420, minTransition: 130, minCrestRadius: 15000, minSagRadius: 5000 },
  120: { speed: 120, minRadius: 690, noSuperelevationRadius: 2060, minTransition: 120, minCrestRadius: 12000, minSagRadius: 5000 },
  110: { speed: 110, minRadius: 560, noSuperelevationRadius: 1740, minTransition: 110, minCrestRadius: 10000, minSagRadius: 5000 },
};

/** Norm table for a category: motorway rows are separate (never borrowed from the 90 km/h road rows). */
function normTable(category?: CategoryId): Record<number, SpeedNorms> {
  return category && CATEGORIES[category].mode === 'motorway' ? MOTORWAY_SPEED_NORMS : SPEED_NORMS;
}
export function speedNorms(speed: number, category?: CategoryId): SpeedNorms {
  const n = normTable(category)[speed];
  if (!n) throw new Error(`no norms for design speed ${speed}`);
  return n;
}
/** Design speeds the category may be built for, fastest first. */
export function designSpeeds(category: CategoryId): number[] {
  return Object.keys(normTable(category)).map(Number).sort((a, b) => b - a);
}

// ---- horizontal curve rules (table-driven; rail / motorway rows can differ later) ----------------
// Source: ČSN 73 6101 as reproduced in the VUT teaching text "Aplikace ČSN 73 6101"
// (fce.vutbr.cz/pko/sad/pdf/aplikace.pdf, chapters "Směrové oblouky" and "Přechodnice").
// Older edition, not independently verified for 2018. Omission threshold below uses actual model L,
// whereas VUT prescribes 1.5vn for that calculation: this is a game concession (research/15).
import type { HorizontalRules } from '../horizontal';
import { CATEGORIES, type CategoryId } from './categories';

export interface HorizontalNormRow {
  /** a circular arc needs no transition when the transition would shift it by at most this: ΔR = L²/(24·R), m */
  maxShiftWithoutTransition: number;
  /** compound curve of same-direction arcs without intermediate transitions: larger / smaller neighbouring radius */
  maxCompoundRatio: number;
  /** straight between two opposite arcs that have no transitions, m ("2·vn") */
  minReverseStraight: number;
}

// Motorway rows apply the same VUT rules (shift 0.25 m, ratio 2, reverse straight 2·vn) at motorway vn.
export const HORIZONTAL_NORMS: Record<number, HorizontalNormRow> = {
  130: { maxShiftWithoutTransition: 0.25, maxCompoundRatio: 2, minReverseStraight: 260 },
  120: { maxShiftWithoutTransition: 0.25, maxCompoundRatio: 2, minReverseStraight: 240 },
  110: { maxShiftWithoutTransition: 0.25, maxCompoundRatio: 2, minReverseStraight: 220 },
  90: { maxShiftWithoutTransition: 0.25, maxCompoundRatio: 2, minReverseStraight: 180 },
  80: { maxShiftWithoutTransition: 0.25, maxCompoundRatio: 2, minReverseStraight: 160 },
  70: { maxShiftWithoutTransition: 0.25, maxCompoundRatio: 2, minReverseStraight: 140 },
};

/** Everything the horizontal geometry and its checks need for a design speed. */
export function horizontalRules(speed: number, category?: CategoryId): HorizontalRules {
  const n = speedNorms(speed, category), h = HORIZONTAL_NORMS[speed];
  if (!h) throw new Error(`no horizontal rules for design speed ${speed}`);
  return {
    minRadius: n.minRadius,
    transition: n.minTransition,
    // Game omission threshold with actual L: 1,350 / 1,067 / 817 m. Not the no-superelevation radius.
    plainRadius: (n.minTransition * n.minTransition) / (24 * h.maxShiftWithoutTransition),
    compoundRatio: h.maxCompoundRatio,
    reverseStraight: h.minReverseStraight,
  };
}
