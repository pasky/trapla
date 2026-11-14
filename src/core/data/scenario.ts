import type { CategoryId, TerrainClass } from './categories';

// Traffic → minimum category: the highest design-year AADT at which a rural two-lane section still meets the
// level of service required for a class I road (research/14-category-capacity.md).
//   - Required LOS: C (ČSN 73 6101 asks "C to D" for class I roads; TP 188 worked example 2, an I/27 bypass,
//     uses C).
//   - Design hour = 50th-highest hour = AADT × 0.103 (TP 189 (2018) tab. 6, class I; CSD 2025 median 0.102).
//   - LOS C volume, both directions: 1,200 veh/h for S 11.5 (TP 188 (2018) tab. 4-13). This assumes climb
//     class 2 (hilly), total curviness 75–150 grad/km and 15 % slow vehicles. The current I/16 Trutnov–border
//     has 12–15 % heavy vehicles (CSD 2025).
//   - Width coefficients S 9.5 0.85, S 7.5 0.60 (TP 188 §4.4.3).
// These are representative values, not a per-design TP 188 assessment. Steeper or more winding designs carry less.
const DESIGN_HOUR_FACTOR = 0.103;
const LOS_C_VOLUME_S115 = 1_200;
const WIDTH_COEF: Partial<Record<CategoryId, number>> = { 'S7.5': 0.60, 'S9.5': 0.85, 'S11.5': 1.0 };
const maxAadt = (c: CategoryId) => Math.floor((LOS_C_VOLUME_S115 * WIDTH_COEF[c]!) / DESIGN_HOUR_FACTOR);

/** Category is sufficient while AADT ≤ maxAadt (6,990 / 9,902 / 11,650). Above S 11.5 a two-lane road
 *  misses LOS C; the next step (2+1 / four-lane) is not playable, so D 27.5 stands in. */
export const TRAFFIC_THRESHOLDS: { maxAadt: number; category: CategoryId }[] = [
  { maxAadt: maxAadt('S7.5'), category: 'S7.5' },
  { maxAadt: maxAadt('S9.5'), category: 'S9.5' },
  { maxAadt: maxAadt('S11.5'), category: 'S11.5' },
  { maxAadt: Infinity, category: 'D27.5' },
];

export const CATEGORY_RANK: Record<CategoryId, number> = { 'S7.5': 0, 'S9.5': 1, 'S11.5': 2, 'D27.5': 3 };

export function minCategoryForTraffic(aadt: number): CategoryId {
  for (const t of TRAFFIC_THRESHOLDS) if (aadt <= t.maxAadt) return t.category;
  return 'D27.5';
}

export interface ScenarioParams {
  id: string;
  title: string;
  /** traffic Y, vehicles/day (scenario value) */
  traffic: number;
  /** travel-time target X, minutes (calibration in PLAN.md) */
  maxTravelMin: number;
  terrainClass: TerrainClass;
  /** max longitudinal gradient (PROVISIONAL, see norms.ts) */
  maxGradient: number;
}

export const D11_SCENARIO: ScenarioParams = {
  id: 'd11',
  title: 'Trutnov → Polish border',
  traffic: 9_000,
  maxTravelMin: 14.5,
  terrainClass: 'hilly',
  maxGradient: 0.06,
};
