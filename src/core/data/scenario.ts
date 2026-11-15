import type { CategoryId, TerrainClass } from './categories';
import type { PI } from '../horizontal';

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
  /** Stable mission/preset identity, separate from the terrain pack id. Legacy D11 uses d11. */
  presetId?: string;
  /** Fresh designs only; loading an existing design must never overwrite its specification. */
  initial?: { category: CategoryId; speed: 70 | 80 | 90; pis?: PI[] };
  /** Short catalogue copy; D3/D35 road exercises are not motorway demand forecasts. */
  picker?: { kind: string; goal: string; note?: string };
  /** traffic Y, vehicles/day (scenario value) */
  traffic: number;
  /** travel-time target X, minutes (calibration in PLAN.md) */
  maxTravelMin: number;
  terrainClass: TerrainClass;
  /** max longitudinal gradient (PROVISIONAL, see norms.ts) */
  maxGradient: number;
  /** acoustic heavy-vehicle (NA) share of the traffic for the noise model; default NOISE.heavyShare (15 %) */
  heavyShare?: number;
  /** map / HUD wording: endpoint markers, the official line's map label and legend entry, the HUD brief (HTML) */
  labels: { a: string; b: string; official: string; brief: string };
}

export const D11_SCENARIO: ScenarioParams = {
  id: 'd11',
  title: 'Trutnov → Polish border',
  traffic: 9_000,
  maxTravelMin: 14.5,
  terrainClass: 'hilly',
  maxGradient: 0.06,
  labels: { a: 'Trutnov', b: 'PL border', official: 'official D11', brief: '<b>A</b> (D11 near Trutnov) to <b>B</b> (Polish border)' },
};

// New two-lane exercises use explicit GAME PRIORS, not local census/forecast claims.
// The TP188 representative capacity case above and 15% heavy share are uncalibrated here.
// Reference routes/norm category evidence: research/24–26. Time targets are mission choices.
export const D3_SCENARIO: ScenarioParams = {
  id: 'd3', presetId: 'd3-road', title: 'Jílové → Václavice',
  // Editable starter near the reference, validated on this pack; no hidden structure overrides.
  // Three bends moved <12 m by the existing bounded repair tool to resolve a track conflict.
  initial: { category: 'S9.5', speed: 90, pis: [
    { x: 3872.4, y: 14182.6, r: null }, { x: 3608.6, y: 12643.7, r: null },
    { x: 4588.5, y: 9743.4, r: null }, { x: 4849.5, y: 8185.1, r: null },
    { x: 5549, y: 6639, r: null }, { x: 7079, y: 5914, r: null }, { x: 8520, y: 4281, r: null },
  ] },
  picker: { kind: 'Road through Posázaví', goal: 'Cross the Sázava and find a way through the hills.' },
  // 11.5 min allows 17.25 km at 90 (mapped reference 15.68 km), 15.33 km at 80.
  traffic: 9_000, heavyShare: 0.15, maxTravelMin: 11.5,
  terrainClass: 'hilly', maxGradient: 0.06,
  labels: { a: 'Jílové', b: 'Václavice', official: 'planned D3', brief: '<b>Jílové</b> to <b>Václavice</b>, across the Sázava' },
};

export const D35_SCENARIO: ScenarioParams = {
  id: 'd35', presetId: 'd35-road', title: 'Opatovec → Mohelnice',
  initial: { category: 'S9.5', speed: 90 },
  picker: { kind: 'Road across the hills', goal: 'Pass the ridges and villages on the way to Mohelnice.' },
  traffic: 9_000, heavyShare: 0.15, maxTravelMin: 24,
  terrainClass: 'hilly', maxGradient: 0.06,
  labels: { a: 'Opatovec', b: 'Mohelnice', official: 'planned D35', brief: '<b>Opatovec</b> to <b>Mohelnice</b>' },
};

export const NOVA_PAKA_SCENARIO: ScenarioParams = {
  id: 'i16-nova-paka', presetId: 'i16-nova-paka-road', title: 'Nová Paka bypass',
  // S11.5/70 is the actual project's category (OPD entry); 10,000/day is a GAME PRIOR,
  // not the project's forecast. Eight minutes permits 9.33 km at 70 km/h (reference 8.479 km).
  initial: { category: 'S11.5', speed: 70 },
  picker: { kind: 'Class I road · 70 km/h', goal: 'Take traffic around town without moving too much earth.',
    note: 'Ground includes the real bypass’s cuts. Photo shows construction.' },
  traffic: 10_000, heavyShare: 0.15, maxTravelMin: 8,
  terrainClass: 'hilly', maxGradient: 0.06,
  labels: { a: 'Kumburský Újezd', b: 'Vidochov', official: 'bypass reference', brief: '<b>Kumburský Újezd</b> to <b>Vidochov</b>, around Nová Paka' },
};

/** Game parameters per scenario id (= terrain pack directory). Preset IDs scope new project saves.
 * D11 intentionally retains its exact legacy parameters and default. */
export const SCENARIOS: Record<string, ScenarioParams> = {
  d11: D11_SCENARIO, d3: D3_SCENARIO, d35: D35_SCENARIO, 'i16-nova-paka': NOVA_PAKA_SCENARIO,
};
export const DEFAULT_SCENARIO = 'd11';

export function scenarioParams(id: string): ScenarioParams {
  const sc = SCENARIOS[id];
  if (!sc) throw new Error(`unknown scenario "${id}" (known: ${Object.keys(SCENARIOS).join(', ')})`);
  return sc;
}
