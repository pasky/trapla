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

export const CATEGORY_RANK: Record<CategoryId, number> = { 'S7.5': 0, 'S9.5': 1, 'S11.5': 2, 'D27.5': 3, 'D27.5-1': 3, R1: 0, R2: 0 };

export function minCategoryForTraffic(aadt: number): CategoryId {
  for (const t of TRAFFIC_THRESHOLDS) if (aadt <= t.maxAadt) return t.category;
  return 'D27.5';
}

export interface ScenarioParams {
  id: string;
  title: string;
  /** Stable mission/preset identity, separate from the terrain pack id. Legacy D11 uses d11. */
  presetId?: string;
  /** What the mission builds: a road (default), a paired motorway corridor (core/project-motorway.ts) or a
   * railway (core/project-railway.ts). */
  mode?: 'road' | 'motorway' | 'railway';
  /** Fresh designs only; loading an existing design must never overwrite its specification. */
  initial?: { category: CategoryId; speed: number; pis?: PI[] };
  /** Short catalogue copy; D3/D35 road exercises are not motorway demand forecasts. */
  picker?: { kind: string; goal: string; note?: string };
  /** Picker heading shared by the sections of one corridor (cards in PRESETS order). */
  group?: string;
  /** Superseded mission: no Start card in the picker; its saves stay loadable (Continue, direct link). */
  retired?: boolean;
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
// Superseded by the D3 sections below (kept loadable): its ends are ≈ 1.8 km before the 0301/0302 boundary and
// ≈ 2 km before the end of 0303 on the mapped line (research/39), i.e. most of sections 0302 and 0303.
export const D3_SCENARIO: ScenarioParams = {
  id: 'd3', presetId: 'd3-road', title: 'Jílové → Václavice (earlier map)', retired: true, group: 'Středočeská D3',
  // Editable starter near the reference, validated on this pack; no hidden structure overrides.
  // Three bends moved <12 m by the existing bounded repair tool to resolve a track conflict.
  initial: { category: 'S9.5', speed: 90, pis: [
    { x: 3872.4, y: 14182.6, r: null }, { x: 3608.6, y: 12643.7, r: null },
    { x: 4588.5, y: 9743.4, r: null }, { x: 4849.5, y: 8185.1, r: null },
    { x: 5549, y: 6639, r: null }, { x: 7079, y: 5914, r: null }, { x: 8520, y: 4281, r: null },
  ] },
  picker: { kind: 'Road through Posázaví', goal: 'Cross the Sázava and find a way through the hills.',
    note: 'Earlier map: most of sections 0302 and 0303.' },
  // 11.5 min allows 17.25 km at 90 (mapped reference 15.68 km), 15.33 km at 80.
  traffic: 9_000, heavyShare: 0.15, maxTravelMin: 11.5,
  terrainClass: 'hilly', maxGradient: 0.06,
  labels: { a: 'Jílové', b: 'Václavice', official: 'planned D3', brief: '<b>Jílové</b> to <b>Václavice</b>, across the Sázava' },
};

export const D35_SCENARIO: ScenarioParams = {
  // First stage only: the full 34 km corridor to Mohelnice missed the live-drag budget (research/27).
  id: 'd35', presetId: 'd35-stage1-road', title: 'Opatovec → Staré Město',
  // Editable starter: mapped-reference bends at ~1.5 km, then bounded validity-first repair moved
  // bend 7 by 7.6 m to clear a track (research/27). No junction: B is the section boundary.
  initial: { category: 'S9.5', speed: 90, pis: [
    { x: 3911.6, y: 4138.6, r: null }, { x: 5364.7, y: 4523.8, r: null }, { x: 7643.7, y: 4336.4, r: null },
    { x: 9356.7, y: 4036.3, r: null }, { x: 11092.7, y: 3524, r: null }, { x: 12724.6, y: 3498.3, r: null },
    { x: 14565.1, y: 3794.8, r: null }, { x: 16198, y: 3345, r: null }, { x: 17709.9, y: 2719.1, r: null },
  ] },
  picker: { kind: 'Road across the hills', goal: 'Pass the ridge and villages to Staré Město.' },
  // 12 min allows 18 km at 90 or 16 km at 80 (project section 16.6 km); a mission choice, not a norm.
  traffic: 9_000, heavyShare: 0.15, maxTravelMin: 12,
  terrainClass: 'hilly', maxGradient: 0.06,
  labels: { a: 'Opatovec', b: 'Staré Město', official: 'planned D35', brief: '<b>Opatovec</b> to <b>Staré Město</b>, first stage of D35' },
};

export const NOVA_PAKA_SCENARIO: ScenarioParams = {
  id: 'i16-nova-paka', presetId: 'i16-nova-paka-road', title: 'Nová Paka bypass',
  // S11.5/70 is the actual project's category (OPD entry); 10,000/day is a GAME PRIOR,
  // not the project's forecast. Eight minutes permits 9.33 km at 70 km/h (reference 8.479 km).
  // Editable starter: mapped-reference bends at ~1.5 km, then bounded validity-first repair moved
  // bends 0/1 by 23.1/6.6 m (research/27). Not cost-optimised; the roundabout arm is a declared junction.
  initial: { category: 'S11.5', speed: 70, pis: [
    { x: 7832, y: 5962, r: null }, { x: 8841, y: 6871, r: null }, { x: 10208.9, y: 7474.7, r: null }, { x: 10894.3, y: 8418.4, r: null },
  ] },
  picker: { kind: 'Class I road · 70 km/h', goal: 'Take traffic around town without moving too much earth.',
    note: 'Ground includes the real bypass’s cuts. Photo shows construction.' },
  traffic: 10_000, heavyShare: 0.15, maxTravelMin: 8,
  terrainClass: 'hilly', maxGradient: 0.06,
  labels: { a: 'Kumburský Újezd', b: 'Vidochov', official: 'bypass reference', brief: '<b>Kumburský Újezd</b> to <b>Vidochov</b>, around Nová Paka' },
};

// Motorway missions in the same corridors: separate presets (own saves) next to the unchanged road
// exercises. Traffic: GAME PRIOR = CSD 2020 national mean motorway AADT "cca 30 700 voz/24h" (ŘSD
// census page), not a local forecast (none found, research/33 §2). Acoustic heavy share 22.56 %: TP 219
// tab. 4-2 first-class motorway mix (19 % goods + 1 % buses + 32 % of 8 % light goods, Manuál tab. 20).
// Capacity: D 27.5 carries it. Time targets are mission choices (≈ 10 % longer than the reference).
const MOTORWAY_TRAFFIC = { traffic: 30_700, heavyShare: 0.2256 };
export const D3_MOTORWAY: ScenarioParams = {
  ...D3_SCENARIO, presetId: 'd3-motorway', mode: 'motorway', title: 'Motorway D3: Jílové → Václavice (earlier map)',
  // The real 0302/0303 sections are D 27.5/120 (research/25). Starter = the road exercise's bends with
  // the last bend moved 30 m (bounded validity-first search) so the wider body clears a track; not optimised.
  initial: { category: 'D27.5', speed: 120, pis: [
    { x: 3872.4, y: 14182.6, r: null }, { x: 3608.6, y: 12643.7, r: null },
    { x: 4588.5, y: 9743.4, r: null }, { x: 4849.5, y: 8185.1, r: null },
    { x: 5549, y: 6639, r: null }, { x: 7079, y: 5914, r: null }, { x: 8498.8, y: 4259.8, r: null },
  ] },
  picker: { kind: 'Motorway · 120 km/h', goal: 'Both directions together; split them where the hills ask for it.',
    note: 'Earlier map: most of sections 0302 and 0303.' },
  ...MOTORWAY_TRAFFIC, maxTravelMin: 8.6, // 17.2 km at 120 (reference 15.68 km)
};

// Středočeská D3 as its real construction sections (ŘSD leaflets 09/2025, research/39): one pack and one
// motorway mission per section, D 27.5 at the section's design speed. Ends: section boundaries on the mapped
// proposed line (by leaflet chainage), the D0 interchange (0301) and the operating D3 (0305/I). Time targets
// are mission choices: reference length + 10 % at the design speed, rounded up to 0.1 min.
const d3Section = (id: string, title: string, speed: 120 | 130, pis: PI[], maxTravelMin: number,
  labels: ScenarioParams['labels'], goal: string, note: string): ScenarioParams => ({
  id, presetId: `${id}-motorway`, mode: 'motorway', title, group: 'Středočeská D3',
  initial: { category: 'D27.5', speed, pis },
  picker: { kind: `Motorway · ${speed} km/h`, goal, note },
  ...MOTORWAY_TRAFFIC, maxTravelMin, terrainClass: 'hilly', maxGradient: 0.06, labels,
});
const P = (pts: [number, number][]): PI[] => pts.map(([x, y]) => ({ x, y, r: null }));
export const D3_0301 = d3Section('d3-0301', '0301 Praha → Jílové', 120, P([]), 4.8, // 9.58 km at 120 (reference 8.71 km)
  { a: 'D0 Praha', b: 'Jílové', official: 'planned D3', brief: '<b>Prague ring</b> to <b>Jílové</b>, section 0301 of the D3' },
  'Leave the Prague ring and get through the hills to Jílové.', 'Starts at the D0 interchange. Continues as section 0302.');
// Starter: mapped-line bends every ~1.5 km, valid as sampled.
export const D3_0302 = d3Section('d3-0302', '0302 Jílové → Hostěradice', 120, P([[2608.6, 6143.7], [3588.5, 3243.4]]), 2.5, // 4.97 km at 120 (reference 4.52 km)
  { a: 'Jílové', b: 'Hostěradice', official: 'planned D3', brief: '<b>Jílové</b> to <b>Hostěradice</b>, across the Sázava' },
  'Cross the deep Sázava valley.', 'Follows section 0301. Continues as section 0303.');
// Starter: mapped-line bends every ~1.5 km; bend 3 moved 45 m to the right (bounded search) so that the
// body clears a track at km 6.95 (research/39).
export const D3_0303 = d3Section('d3-0303', '0303 Hostěradice → Václavice', 120,
  P([[2849.5, 9185.1], [3544.1, 7644.6], [5073.2, 6920.3], [6490.3, 5261.7], [8308.2, 4162.2], [9401.1, 3118.3]]), 6.3, // 12.50 km at 120 (reference 11.36 km)
  { a: 'Hostěradice', b: 'Václavice', official: 'planned D3', brief: '<b>Hostěradice</b> to <b>Václavice</b>, section 0303 of the D3' },
  'Wind through the woods and side valleys towards Benešov.', 'Follows section 0302. Continues as section 0304.');
export const D3_0304 = d3Section('d3-0304', '0304 Václavice → Voračice', 130, P([]), 8.1, // 17.40 km at 130 (reference 15.82 km)
  { a: 'Václavice', b: 'Voračice', official: 'planned D3', brief: '<b>Václavice</b> to <b>Voračice</b>, section 0304 of the D3' },
  'Get past the ridge at Prostřední vrch and over the valleys.', 'Follows section 0303. Continues as section 0305/I.');
export const D3_0305 = d3Section('d3-0305', '0305/I Voračice → Nová Hospoda', 130, P([]), 8.7, // 18.72 km at 130 (reference 17.02 km)
  { a: 'Voračice', b: 'Nová Hospoda', official: 'planned D3', brief: '<b>Voračice</b> to <b>Nová Hospoda</b>, where the D3 already runs' },
  'Bridge the Mastník valley and join the D3 that is already open.', 'Follows section 0304. Ends on the open D3.');
export const D35_MOTORWAY: ScenarioParams = {
  ...D35_SCENARIO, presetId: 'd35-stage1-motorway', mode: 'motorway', title: 'Motorway D35: Opatovec → Staré Město',
  // The real section is D 26.0/130 (research/26), a category without an SPK 2026 row: built as D 27.5.
  initial: { ...D35_SCENARIO.initial!, category: 'D27.5', speed: 130 },
  picker: { kind: 'Motorway · 130 km/h', goal: 'Carry the motorway over the ridge to Staré Město.', note: 'Built as D 27.5; the planned section is D 26.0.' },
  ...MOTORWAY_TRAFFIC, maxTravelMin: 8.3, // 18 km at 130 (project section 16.6 km)
};
// Railway exercise in the D11 pass, between the road mission's ports (own saves). Not a planned project:
// the line through the pass today is single-track and not electrified (OSM tags in the pack's transport
// data: tracks=1, electrified=no, maxspeed 40–100). Trains: the PROVISIONAL prior of rail-noise.ts (128 a
// day). Time target: a mission choice, 9 min = 24 km at 160 km/h or 21 km at 140 (A–B 18.6 km in a line).
export const D11_RAILWAY: ScenarioParams = {
  ...D11_SCENARIO, presetId: 'd11-railway', mode: 'railway', title: 'Railway: Trutnov → Polish border',
  initial: { category: 'R2', speed: 160 },
  picker: { kind: 'Railway · 160 km/h', goal: 'Lay a double-track electric line through the pass to the border.',
    note: 'An exercise, not a planned line. The line there today is single-track, without wires.' },
  maxTravelMin: 9,
};
/** Every playable mission, in picker order. */
export const PRESETS: ScenarioParams[] = [D11_SCENARIO, D11_RAILWAY, D3_0301, D3_0302, D3_0303, D3_0304, D3_0305,
  D3_SCENARIO, D3_MOTORWAY, D35_SCENARIO, D35_MOTORWAY, NOVA_PAKA_SCENARIO];

/** Game parameters per scenario id (= terrain pack directory). Preset IDs scope new project saves.
 * D11 intentionally retains its exact legacy parameters and default. */
export const SCENARIOS: Record<string, ScenarioParams> = {
  d11: D11_SCENARIO, d3: D3_SCENARIO, d35: D35_SCENARIO, 'i16-nova-paka': NOVA_PAKA_SCENARIO,
  'd3-0301': D3_0301, 'd3-0302': D3_0302, 'd3-0303': D3_0303, 'd3-0304': D3_0304, 'd3-0305': D3_0305,
};
export const DEFAULT_SCENARIO = 'd11';

export function scenarioParams(id: string, presetId?: string | null): ScenarioParams {
  if (presetId) {
    const preset = PRESETS.find(p => p.id === id && (p.presetId ?? p.id) === presetId);
    if (preset) return preset;
  }
  const sc = SCENARIOS[id];
  if (!sc) throw new Error(`unknown scenario "${id}" (known: ${Object.keys(SCENARIOS).join(', ')})`);
  return sc;
}
