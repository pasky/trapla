// Geometric norm limits as data. Checks that use them live in core/checks.ts as per-category
// functions (roads now; rail would get its own function using cant instead of superelevation).

export interface SpeedNorms {
  speed: number;
  /** ČSN 73 6101 (2018) minimum horizontal radius at 6 % superelevation, m (research/00 §4.1) */
  minRadius: number;
  /** radius above which no superelevation is needed, m — information only */
  noSuperelevationRadius: number;
  /** speed-based transition minimum, m; 2018 also requires ≥ runoff length (not modelled), research/15-horizontal-pairs.md */
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

/** Four-lane divided class I road (S 21.5): 110 km/h, lowered by 10 or 20 in justified cases (Radimský 2019
 * slide 4). The ČSN 73 6101:2018 radii and vertical radii are by design speed, whatever the category: 110 is the
 * motorway row, 90 the road row; 100: radius 470 m at 6 % superelevation, 1,440 m with none (Radimský slide 6,
 * research/00 §4.1), crest 7,900 m and sag 3,400 m (ČVUT FD 12SDK 2023, research/48 §3). */
export const DIVIDED_SPEED_NORMS: Record<number, SpeedNorms> = {
  110: MOTORWAY_SPEED_NORMS[110],
  100: { speed: 100, minRadius: 470, noSuperelevationRadius: 1440, minTransition: 100, minCrestRadius: 7900, minSagRadius: 3400 },
  90: SPEED_NORMS[90],
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

export const RAMP_NORM = 'ČSN 73 6110 rows (the slip-road table of ČSN 73 6102 was not found; provisional)';
/** Slip roads of a motorway interchange at 50 / 40 km/h (research/90 §2: a D35 design uses 40–70 km/h ramps). The
 * ramp table of ČSN 73 6102 was not found (research/90 §3): PROVISIONAL the ČSN 73 6110 rows of the same speeds
 * (radius at 6 % banking, crest and sag for stopping sight), plain circular curves. The D35 design's 50 km/h ramp
 * has 95 m, its 40 km/h loop 55 m: above these minima. */
export const RAMP_SPEED_NORMS: Record<number, SpeedNorms> = {
  50: { ...LOCAL_SPEED_NORMS[50], norm: RAMP_NORM },
  40: { ...LOCAL_SPEED_NORMS[40], norm: RAMP_NORM },
};

/** Norm table for a category: motorway, railway, local-road and track rows are separate (never borrowed). */
function normTable(category?: CategoryId): Record<number, SpeedNorms> {
  const c = category ? CATEGORIES[category] : undefined;
  if (c?.ramp) return RAMP_SPEED_NORMS;
  if (c?.minor) return c.minor === 'local' ? LOCAL_SPEED_NORMS : TRACK_SPEED_NORMS;
  const mode = c?.mode ?? 'road';
  if (c?.roadClass === 'divided' || c?.roadClass === 'divided-carriageway') return DIVIDED_SPEED_NORMS;
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
// whereas VUT prescribes 1.5vn for that calculation: this is a game concession (research/15-horizontal-pairs.md).
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
  // 100 km/h (S 21.5 lowered by 10): the same rules, a straight of at least 2·vn between opposite plain arcs (VUT p. 18)
  100: { maxShiftWithoutTransition: 0.25, maxCompoundRatio: 2, minReverseStraight: 200 },
  90: { maxShiftWithoutTransition: 0.25, maxCompoundRatio: 2, minReverseStraight: 180 },
  80: { maxShiftWithoutTransition: 0.25, maxCompoundRatio: 2, minReverseStraight: 160 },
  70: { maxShiftWithoutTransition: 0.25, maxCompoundRatio: 2, minReverseStraight: 140 },
};

/** Hairpin bend ("točka"). ČSN 73 6101:2000 §8.5.7 p. 23: "Točky jsou výjimečná řešení, přípustná zpravidla na
 * dvoupruhových silnicích v území horského charakteru"; its table 12 p. 24 gives the smallest hairpin radii at
 * 7 % / 8 % banking: 45 km/h 75 / 65 m, 40: 60 / 50, 35: 45 / 40, 30: 35 / 30 m (research/54 §1). The 2018
 * edition has no hairpins: the game takes the 2000 table, 30 m at 8 % banking for 30 km/h (I/44 Červenohorské
 * sedlo has 17.5 m hairpins, a further approved departure, not offered). A plain circular arc (no transitions:
 * Swiss SN 640 198a; the forest-road guide), no straight required next to it (the forest guide's ≈ 20 m straights
 * "may be dropped where cramped"), research/47 §3. */
export const HAIRPIN = {
  radius: 30, banking: 0.08,
  /** table 12 at 8 % banking: [radius m, speed km/h] — a hairpin of this radius is driven at this speed */
  speeds: [[30, 30], [40, 35], [50, 40], [65, 45]] as [number, number][],
  /** "Točka je směrový oblouk o velkém středovém úhlu a malém poloměru; v točce se směr trasy obrací téměř o
   * 180°" (MZe TD 2020 §7.7 p. 82, after Makovník 1973): a bend turning less is no hairpin. 150° is the game's
   * reading of "almost 180°" (PROVISIONAL); the neck curves either side turn the rest. */
  minTurn: (150 * Math.PI) / 180,
  /** Steepest grade in a hairpin: the resultant of grade and banking √(s² + p²) at most 10 % where icing is
   * frequent (ČSN 73 6101:2018 §8.10.1, Radimský slides 12–14; mountain passes), with p = 8 %: s ≤ 6 % */
  maxGrade: Math.sqrt(0.1 ** 2 - 0.08 ** 2),
  /** Lane width a 16.5 m articulated lorry sweeps turning through 90° on a lane of radius R (VUT/HBH, Metodika
   * pro rozšíření jízdních pruhů ve směrových obloucích, 2015, tab. 5 p. 11), [R, m] */
  sweptLane: [[15, 5.3], [20, 4.7], [25, 4.3], [30, 4.0], [40, 3.6], [50, 3.4]] as [number, number][],
  /** safety margin added to it: class I 0.75 m, class II / III 0.50 m (ibid. tab. 2–3) */
  marginClassI: 0.75, marginOther: 0.5,
  /** pavement of the widening, CZK/m²: OTSKP 2026 layers of a class I (≈ 2,000) and a class III (≈ 1,300)
   * structure (research/46 §3; class II PROVISIONAL at the class III price) */
  pavementClassI: 2000, pavementOther: 1300,
};

/** Extra width of each lane of a hairpin of radius r on the axis, m (0 if the lane is wide enough) */
export function hairpinLaneWidening(r: number, category: CategoryId): number {
  const c = CATEGORIES[category], lane = c.section?.lane ?? 3.5;
  const t = HAIRPIN.sweptLane;
  let swept = t[0][1];
  if (r >= t[t.length - 1][0]) swept = t[t.length - 1][1];
  else for (let k = 1; k < t.length; k++) if (r <= t[k][0]) { swept = t[k - 1][1] + (t[k][1] - t[k - 1][1]) * Math.max(0, r - t[k - 1][0]) / (t[k][0] - t[k - 1][0]); break; }
  const margin = c.roadClass === 'I' ? HAIRPIN.marginClassI : HAIRPIN.marginOther;
  return Math.max(0, swept + margin - lane);
}
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
    // (a stretch is never faster than its road: design-speed.ts bendSpeed)
    if (p.speed === undefined || p.speed >= speed || !allowed.has(p.speed)) return undefined;
    let r = memo.get(p.speed);
    if (!r) memo.set(p.speed, r = horizontalRules(p.speed, category));
    return r;
  };
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
  if (category && (CATEGORIES[category].minor || CATEGORIES[category].ramp))
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
