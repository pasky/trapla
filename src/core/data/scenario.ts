import type { CategoryId, TerrainClass } from './categories';

/** PLACEHOLDER traffic → minimum category thresholds (vehicles/day). Not norm values. */
export const TRAFFIC_THRESHOLDS: { maxAadt: number; category: CategoryId }[] = [
  { maxAadt: 5_000, category: 'S7.5' },
  { maxAadt: 12_000, category: 'S9.5' },
  { maxAadt: Infinity, category: 'S11.5' },
];

export const CATEGORY_RANK: Record<CategoryId, number> = { 'S7.5': 0, 'S9.5': 1, 'S11.5': 2, 'D27.5': 3 };

export function minCategoryForTraffic(aadt: number): CategoryId {
  for (const t of TRAFFIC_THRESHOLDS) if (aadt < t.maxAadt) return t.category;
  return 'S11.5';
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
