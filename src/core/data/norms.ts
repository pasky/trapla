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
  /** smallest crest vertical radius allowed (stopping sight), m */
  minCrestRadius: number;
  /** smallest sag vertical radius allowed, m */
  minSagRadius: number;
  /** where these values come from, as a rule's source names it (absent: ČSN 73 6101, see the rows) */
  norm?: string;
  /** the same for the crest and dip radii where they come from another source */
  verticalNorm?: string;
}

/** Vertical radii: ČSN 73 6101:2018 smallest allowed crest (stopping sight) and sag radii, as scanned in
 * Šilhan, ČVUT FD diploma thesis 2021, tab. 9–10, and the ČVUT FD course 12SDK (2023); 90 km/h independently
 * in Běťáková (research/47 §1.1, /48 §3). */
export const SPEED_NORMS: Record<number, SpeedNorms> = {
  90: { speed: 90, minRadius: 355, noSuperelevationRadius: 1160, minTransition: 90, minCrestRadius: 5500, minSagRadius: 2700 },
  80: { speed: 80, minRadius: 280, noSuperelevationRadius: 920, minTransition: 80, minCrestRadius: 3300, minSagRadius: 2100 },
  70: { speed: 70, minRadius: 205, noSuperelevationRadius: 705, minTransition: 70, minCrestRadius: 2100, minSagRadius: 1500 },
};

/** Motorway design speeds: D 27.5 base 130, lowered by 10 or 20 in justified cases (Radimský 2019 slide 4).
 * Radii at 6 % superelevation and no-superelevation radii: Radimský slide 6 (data/motorway.ts).
 * Transition minimum = vn metres (slide 15; runoff length not modelled, as for roads).
 * Vertical radii: ČSN 73 6101:2018 crest 17,000 / 11,500 / 8,300 m and sag 6,000 / 5,000 / 4,000 m at
 * 130 / 120 / 110, as reproduced by the ČVUT FD course 12SDK (2023) (research/48 §3, medium-high confidence). */
export const MOTORWAY_SPEED_NORMS: Record<number, SpeedNorms> = {
  130: { speed: 130, minRadius: 840, noSuperelevationRadius: 2420, minTransition: 130, minCrestRadius: 17000, minSagRadius: 6000 },
  120: { speed: 120, minRadius: 690, noSuperelevationRadius: 2060, minTransition: 120, minCrestRadius: 11500, minSagRadius: 5000 },
  110: { speed: 110, minRadius: 560, noSuperelevationRadius: 1740, minTransition: 110, minCrestRadius: 8300, minSagRadius: 4000 },
};

/** Railway (new conventional mixed line, ≤ 160 km/h), PROVISIONAL older teaching values (research/23, /34;
 * current ČSN 73 6360-1 tables not public):
 * - min radius from the cant envelope: R ≥ 11.8·V² / (D + I) with ordinary cant D 150 mm and deficiency
 *   I 80 mm (VUT 2009 pp. 4, 9); a 100 km/h freight train then stays within the 80 mm excess (p. 7);
 * - easing curve = linear cant ramp n = 10·V at the full 150 mm: L = 10·V·150/1000 (p. 14), always needed;
 * - vertical rounding: max(2,000 m, 0.4·V²) (Plášek, Úvod do železničních staveb, 2009, p. 28) for crests
 *   and dips. Train noise and the freight ruling gradient have no sourced Czech values: not checked. */
const railNorms = (v: number): SpeedNorms => {
  const rv = Math.max(2000, Math.ceil(0.4 * v * v / 100) * 100);
  return { speed: v, minRadius: Math.max(RAIL_RMIN, Math.ceil(11.8 * v * v / (150 + 80))), noSuperelevationRadius: Infinity,
    minTransition: 10 * v * 150 / 1000, minCrestRadius: rv, minSagRadius: rv };
};
/** PROVISIONAL: smallest radius on an open line whatever the speed, ČSN 73 6360-1:2008 Rmin = 190 m as cited
 * by Plášek 2009 p. 23 (older edition, research/34); binds below ≈ 61 km/h. */
const RAIL_RMIN = 190;
/** 100, 80 and 60 km/h are for rebuilding stretches of existing lines at their own speed (a mapped line's
 * maxspeed): the same cant envelope, ramps and roundings (2,000 m, Plášek's desired value below 80 km/h). */
export const RAIL_SPEED_NORMS: Record<number, SpeedNorms> = Object.fromEntries([160, 140, 120, 100, 80, 60].map(v => [v, railNorms(v)]));

export const LOCAL_NORM = 'ČSN 73 6110 (local roads)';
export const TRACK_NORM = 'ČSN 73 6109 (field tracks, as reproduced by Vébr 2022)';
const TRACK_VERTICAL = 'ČSN 73 6108 final draft (paved forest roads; the field-track values were not found, provisional)';
/** Local roads, ČSN 73 6110:2006 functional group C, design speeds 50 / 40 / 30 km/h (tab. 2; research/42):
 * - smallest radius at 6 % superelevation, tab. 10 (85 / 45 / 25 m), the same banking the road rows use;
 * - no superelevation needed from tab. 11 (700 / 450 / 250 m), information only;
 * - transition curves are not required (§9.4.3 restricts plain circular curves on groups A and B only): 0;
 * - crest / sag radii for stopping sight, tabs. 13–14 (1,000 / 450 / 200 and 700 / 350 / 180 m). */
export const LOCAL_SPEED_NORMS: Record<number, SpeedNorms> = {
  50: { speed: 50, minRadius: 85, noSuperelevationRadius: 700, minTransition: 0, minCrestRadius: 1000, minSagRadius: 700, norm: LOCAL_NORM },
  40: { speed: 40, minRadius: 45, noSuperelevationRadius: 450, minTransition: 0, minCrestRadius: 450, minSagRadius: 350, norm: LOCAL_NORM },
  30: { speed: 30, minRadius: 25, noSuperelevationRadius: 250, minTransition: 0, minCrestRadius: 200, minSagRadius: 180, norm: LOCAL_NORM },
};
/** Paved field tracks, ČSN 73 6109:2013 as reproduced by Vébr 2022 (research/42): smallest radius tab. 2
 * (25 m at 30 km/h, 12.5 m at 20 km/h), plain circular curves (transitions only in justified cases on main
 * tracks), no superelevation threshold given (Infinity: information only). Vertical radii: the field-track
 * tab. 4 values were not recovered; PROVISIONAL the sealed forest-road values of the ČSN 73 6108 final draft
 * tab. 7 (200 m at 30 km/h, 80 m at 20 km/h, crest and sag), the sibling norm with the same speeds. */
export const TRACK_SPEED_NORMS: Record<number, SpeedNorms> = {
  30: { speed: 30, minRadius: 25, noSuperelevationRadius: Infinity, minTransition: 0, minCrestRadius: 200, minSagRadius: 200, norm: TRACK_NORM, verticalNorm: TRACK_VERTICAL },
  20: { speed: 20, minRadius: 12.5, noSuperelevationRadius: Infinity, minTransition: 0, minCrestRadius: 80, minSagRadius: 80, norm: TRACK_NORM, verticalNorm: TRACK_VERTICAL },
};

/** Norm table for a category: motorway, railway, local-road and track rows are separate (never borrowed). */
function normTable(category?: CategoryId): Record<number, SpeedNorms> {
  const c = category ? CATEGORIES[category] : undefined;
  if (c?.minor) return c.minor === 'local' ? LOCAL_SPEED_NORMS : TRACK_SPEED_NORMS;
  const mode = c?.mode ?? 'road';
  return mode === 'motorway' ? MOTORWAY_SPEED_NORMS : mode === 'railway' ? RAIL_SPEED_NORMS : SPEED_NORMS;
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
import type { HorizontalRules, PI } from '../horizontal';
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

/** Hairpin bend (research/47 §3): 17.5 m on the axis, the smallest found on a Czech class I road (I/44
 * Červenohorské sedlo, S 9.5/60, built under an approved departure from ČSN 73 6101; the forest-road floor is
 * 15 m), a plain circular arc (no transitions: Swiss SN 640 198a; the forest-road guide), no straight required
 * next to it (the forest guide's ≈ 20 m straights "may be dropped where cramped"). */
export const HAIRPIN = { radius: 17.5, banking: 0.075 };
export const HAIRPIN_RULES: HorizontalRules = { minRadius: HAIRPIN.radius, transition: 0, plainRadius: 0, compoundRatio: 2, reverseStraight: 0, hairpin: true };

/** A bend's own rules where its stretch has another design speed or it is a hairpin (undefined: the road's).
 * Speeds the category does not have are ignored (the road's apply). */
export function bendRules(pis: readonly PI[], speed: number, category?: CategoryId): ((k: number) => HorizontalRules | undefined) | undefined {
  if (!pis.some(p => p.hairpin || (p.speed !== undefined && p.speed !== speed))) return undefined;
  const allowed = new Set(category ? designSpeeds(category) : [speed]);
  const memo = new Map<number, HorizontalRules>();
  return (k) => {
    const p = pis[k];
    if (!p) return undefined;
    if (p.hairpin) return HAIRPIN_RULES;
    if (p.speed === undefined || p.speed === speed || !allowed.has(p.speed)) return undefined;
    let r = memo.get(p.speed);
    if (!r) memo.set(p.speed, r = horizontalRules(p.speed, category));
    return r;
  };
}

/** The road's norms with the vertical radii of the fastest stretch: until the grade line takes each stretch's
 * own radii (docs/design-realism-plan.md M4-2), the strictest apply everywhere (never too lenient). */
export function roadNorms(pis: readonly PI[], speed: number, category?: CategoryId): SpeedNorms {
  const n = speedNorms(speed, category);
  const allowed = new Set(category ? designSpeeds(category) : [speed]);
  let crest = n.minCrestRadius, sag = n.minSagRadius;
  for (const p of pis) if (p.speed !== undefined && p.speed !== speed && allowed.has(p.speed)) {
    const o = speedNorms(p.speed, category);
    crest = Math.max(crest, o.minCrestRadius); sag = Math.max(sag, o.minSagRadius);
  }
  return crest === n.minCrestRadius && sag === n.minSagRadius ? n : { ...n, minCrestRadius: crest, minSagRadius: sag };
}

/** Everything the horizontal geometry and its checks need for a design speed. */
export function horizontalRules(speed: number, category?: CategoryId): HorizontalRules {
  const n = speedNorms(speed, category);
  // Track: every curve gets its cant ramp (no omission threshold); compound ratio as for roads (PROVISIONAL).
  if (category && CATEGORIES[category].mode === 'railway')
    return { minRadius: n.minRadius, transition: n.minTransition, plainRadius: Infinity, compoundRatio: 2, reverseStraight: 0, speed };
  // Local roads and tracks: plain circular curves, no straight required between opposite curves (ČSN 73
  // 6110 §9.3.1 only recommends room for the change of crossfall; ČSN 73 6109 gives none); compound ratio
  // as for roads (PROVISIONAL, research/42).
  if (category && CATEGORIES[category].minor)
    return { minRadius: n.minRadius, transition: 0, plainRadius: 0, compoundRatio: 2, reverseStraight: 0, speed };
  const h = HORIZONTAL_NORMS[speed];
  if (!h) throw new Error(`no horizontal rules for design speed ${speed}`);
  return {
    minRadius: n.minRadius,
    transition: n.minTransition,
    // Game omission threshold with actual L: 1,350 / 1,067 / 817 m. Not the no-superelevation radius.
    plainRadius: (n.minTransition * n.minTransition) / (24 * h.maxShiftWithoutTransition),
    compoundRatio: h.maxCompoundRatio,
    reverseStraight: h.minReverseStraight,
    speed,
  };
}
