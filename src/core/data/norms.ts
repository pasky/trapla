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

// ---- horizontal curve rules (table-driven; rail / motorway rows can differ later) ----------------
// Source: ČSN 73 6101 as reproduced in the VUT teaching text "Aplikace ČSN 73 6101"
// (fce.vutbr.cz/pko/sad/pdf/aplikace.pdf, chapters "Směrové oblouky" and "Přechodnice").
import type { HorizontalRules } from '../horizontal';

export interface HorizontalNormRow {
  /** a circular arc needs no transition when the transition would shift it by at most this: ΔR = L²/(24·R), m */
  maxShiftWithoutTransition: number;
  /** compound curve of same-direction arcs without intermediate transitions: larger / smaller neighbouring radius */
  maxCompoundRatio: number;
  /** straight between two opposite arcs that have no transitions, m ("2·vn") */
  minReverseStraight: number;
}

export const HORIZONTAL_NORMS: Record<number, HorizontalNormRow> = {
  90: { maxShiftWithoutTransition: 0.25, maxCompoundRatio: 2, minReverseStraight: 180 },
  80: { maxShiftWithoutTransition: 0.25, maxCompoundRatio: 2, minReverseStraight: 160 },
  70: { maxShiftWithoutTransition: 0.25, maxCompoundRatio: 2, minReverseStraight: 140 },
};

/** Everything the horizontal geometry and its checks need for a design speed. */
export function horizontalRules(speed: number): HorizontalRules {
  const n = speedNorms(speed), h = HORIZONTAL_NORMS[speed];
  if (!h) throw new Error(`no horizontal rules for design speed ${speed}`);
  return {
    minRadius: n.minRadius,
    transition: n.minTransition,
    // ΔR = L²/(24·R) ≤ limit  ⇔  R ≥ L²/(24·limit): 1,350 / 1,067 / 817 m for 90 / 80 / 70 km/h
    plainRadius: (n.minTransition * n.minTransition) / (24 * h.maxShiftWithoutTransition),
    compoundRatio: h.maxCompoundRatio,
    reverseStraight: h.minReverseStraight,
  };
}
