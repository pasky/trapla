import type { CategoryId, TerrainClass } from './categories';
import type { PI } from '../horizontal';
import type { EndConnection } from '../terms';

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
  /** Mission ends other than the pack's A/B (pack metres), e.g. railway stations on a mapped line. */
  ports?: { a: { xy: [number, number]; latlon: [number, number]; note: string }; b: { xy: [number, number]; latlon: [number, number]; note: string } };
  /** Railway mission: trains a day (both directions) by period, a sourced count or a labelled prior. */
  railTraffic?: { passengerDay: number; passengerNight: number; freightDay: number; freightNight: number };
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
  /** What each end meets (an interchange whose ramps are not built here, a road it joins): its card. */
  ends?: { a?: EndConnection; b?: EndConnection };
  /** Shown once when the aerial photo is first turned on: what it shows that the map does not. */
  photoNote?: string;
}

export const D11_SCENARIO: ScenarioParams = {
  id: 'd11',
  title: 'Trutnov → Polish border',
  traffic: 9_000,
  maxTravelMin: 14.5,
  terrainClass: 'hilly',
  maxGradient: 0.06,
  labels: { a: 'Trutnov', b: 'PL border', official: 'official D11', brief: '<b>A</b> (D11 near Trutnov) to <b>B</b> (Polish border)' },
  picker: { kind: 'Class I road · 90 km/h', goal: 'Connect Trutnov to the Polish border.' },
};

// New two-lane exercises use explicit GAME PRIORS, not local census/forecast claims.
// The TP188 representative capacity case above and 15% heavy share are uncalibrated here.
// Reference routes/norm category evidence: research/24–26. Time targets are mission choices.
// Superseded by the D3 sections below (kept loadable): its ends are ≈ 1.8 km before the 0301/0302 boundary and
// ≈ 2 km before the end of 0303 on the mapped line (research/39), i.e. most of sections 0302 and 0303.
export const D3_SCENARIO: ScenarioParams = {
  id: 'd3', presetId: 'd3-road', title: 'Jílové → Václavice (earlier map)', retired: true, group: 'Středočeská D3',
  // Editable starter near the reference, validated on this pack; no hidden structure overrides.
  // Three bends moved <12 m by the existing bounded repair tool to resolve a track conflict; under the local
  // grade solve (model 24) the last one 60 + 25 m more for another track and an underpass approach, and the
  // second one 25 m for a track underpass near A.
  initial: { category: 'S9.5', speed: 90, pis: [
    { x: 3872.4, y: 14182.6, r: null }, { x: 3583.7, y: 12646, r: null },
    { x: 4588.5, y: 9743.4, r: null }, { x: 4849.5, y: 8185.1, r: null },
    { x: 5549, y: 6639, r: null }, { x: 7079, y: 5914, r: null }, { x: 8487.7, y: 4262.8, r: null },
  ] },
  picker: { kind: 'Class I road · 90 km/h', goal: 'Cross the Sázava and find a way through the hills.',
    note: 'Earlier map: most of sections 0302 and 0303.' },
  // 11.5 min allows 17.25 km at 90 (mapped reference 15.68 km), 15.33 km at 80.
  traffic: 9_000, heavyShare: 0.15, maxTravelMin: 11.5,
  terrainClass: 'hilly', maxGradient: 0.06,
  labels: { a: 'Jílové', b: 'Václavice', official: 'planned D3', brief: '<b>Jílové</b> to <b>Václavice</b>, across the Sázava' },
};

export const D35_SCENARIO: ScenarioParams = {
  // First stage only: the full 34 km corridor to Mohelnice missed the live-drag budget (research/27).
  // Superseded by the motorway missions (the two-lane road exercise in a motorway corridor); kept loadable.
  id: 'd35', presetId: 'd35-stage1-road', title: 'Opatovec → Staré Město (two-lane road)', retired: true, group: 'D35',
  // Editable starter: mapped-reference bends at ~1.5 km, then bounded validity-first repair moved
  // bend 7 by 7.6 m to clear a track (research/27); under model 24 bend 2 by 25 m (a track with no buildable
  // reroute at km 6.99). No junction: B is the section boundary.
  initial: { category: 'S9.5', speed: 90, pis: [
    { x: 3911.6, y: 4138.6, r: null }, { x: 5364.7, y: 4523.8, r: null }, { x: 7639.4, y: 4311.8, r: null },
    { x: 9356.7, y: 4036.3, r: null }, { x: 11092.7, y: 3524, r: null }, { x: 12724.6, y: 3498.3, r: null },
    { x: 14565.1, y: 3794.8, r: null }, { x: 16198, y: 3345, r: null }, { x: 17709.9, y: 2719.1, r: null },
  ] },
  picker: { kind: 'Class I road · 90 km/h', goal: 'Pass the ridge and villages to Staré Město.' },
  // 12 min allows 18 km at 90 or 16 km at 80 (project section 16.6 km); a mission choice, not a norm.
  traffic: 9_000, heavyShare: 0.15, maxTravelMin: 12,
  terrainClass: 'hilly', maxGradient: 0.06,
  labels: { a: 'Opatovec', b: 'Staré Město', official: 'planned D35', brief: '<b>Opatovec</b> to <b>Staré Město</b>, first stage of D35' },
};

export const NOVA_PAKA_SCENARIO: ScenarioParams = {
  id: 'i16-nova-paka', presetId: 'i16-nova-paka-road', title: 'Nová Paka bypass', group: 'I/16',
  ends: { b: { kind: 'roundabout', with: 'road I/16' } },
  photoNote: 'The photo was taken while the real bypass was being built: the bare earth you see is its construction site, not our road.',
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
export const MOTORWAY_TRAFFIC = { traffic: 30_700, heavyShare: 0.2256 };
export const D3_MOTORWAY: ScenarioParams = {
  ...D3_SCENARIO, presetId: 'd3-motorway', mode: 'motorway', title: 'Motorway D3: Jílové → Václavice (earlier map)',
  // The real 0302/0303 sections are D 27.5/120 (research/25). Starter = the road exercise's bends with
  // the last bend moved 30 m (bounded validity-first search) so the wider body clears a track, and (model 24)
  // the one before it 12 m for another track; not optimised.
  initial: { category: 'D27.5', speed: 120, pis: [
    { x: 3872.4, y: 14182.6, r: null }, { x: 3608.6, y: 12643.7, r: null },
    { x: 4588.5, y: 9743.4, r: null }, { x: 4849.5, y: 8185.1, r: null },
    { x: 5549, y: 6639, r: null }, { x: 7073.9, y: 5903.2, r: null }, { x: 8498.8, y: 4259.8, r: null },
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
  labels: ScenarioParams['labels'], goal: string, note: string, ends: ScenarioParams['ends']): ScenarioParams => ({
  id, presetId: `${id}-motorway`, mode: 'motorway', title, group: 'Středočeská D3', ends,
  initial: { category: 'D27.5', speed, pis },
  picker: { kind: `Motorway · ${speed} km/h`, goal, note },
  ...MOTORWAY_TRAFFIC, maxTravelMin, terrainClass: 'hilly', maxGradient: 0.06, labels,
});
const P = (pts: [number, number][]): PI[] => pts.map(([x, y]) => ({ x, y, r: null }));
// Starters: mapped-line bends every ~1.5 km, none within 750 m of B (a bend that close cannot have its
// curve before the end, research/39).
export const D3_0301 = d3Section('d3-0301', '0301 Praha → Jílové', 120,
  P([[5301.3, 9003.8], [3984.8, 7437.6], [2801.8, 6262.9], [3017.2, 4757.5]]), 4.8, // 9.58 km at 120 (reference 8.71 km)
  { a: 'D0 Praha', b: 'Jílové (on to 0302)', official: 'planned D3', brief: '<b>Prague ring</b> to <b>Jílové</b>, section 0301 of the D3' },
  'Leave the Prague ring and get through the hills to Jílové.', 'Starts in the D0 interchange; its ramps are not part of the job. Continues as section 0302.',
  { a: { kind: 'interchange', with: 'the D0 and road II/101' }, b: { kind: 'interchange', with: 'road II/104', section: 'section 0302' } });
// Starter: mapped-line bends every ~1.5 km, valid as sampled.
export const D3_0302 = d3Section('d3-0302', '0302 Jílové → Hostěradice', 120, P([[2608.6, 6143.7]]), 2.5, // 4.97 km at 120 (reference 4.52 km)
  { a: 'Jílové (from 0301)', b: 'Hostěradice (on to 0303)', official: 'planned D3', brief: '<b>Jílové</b> to <b>Hostěradice</b>, across the Sázava' },
  'Cross the deep Sázava valley.', 'Follows section 0301. Continues as section 0303.',
  { a: { kind: 'interchange', with: 'road II/104', section: 'section 0301' }, b: { kind: 'interchange', with: 'road II/106', section: 'section 0303' } });
// Starter: mapped-line bends every ~1.5 km; bend 3 moved 45 m to the right (bounded search) so that the
// body clears a track at km 6.95 (research/39).
export const D3_0303 = d3Section('d3-0303', '0303 Hostěradice → Václavice', 120,
  P([[2849.5, 9185.1], [3544.1, 7644.6], [5073.2, 6920.3], [6490.3, 5261.7], [8308.2, 4162.2]]), 6.3, // 12.50 km at 120 (reference 11.36 km)
  { a: 'Hostěradice (from 0302)', b: 'Václavice (on to 0304)', official: 'planned D3', brief: '<b>Hostěradice</b> to <b>Václavice</b>, section 0303 of the D3' },
  'Wind through the woods and side valleys towards Benešov.', 'Follows section 0302. Continues as section 0304.',
  { a: { kind: 'interchange', with: 'road II/106', section: 'section 0302' }, b: { kind: 'interchange', with: 'road II/112', section: 'section 0304' } });
// Starter: mapped-line bends every ~1.5 km, valid as sampled.
export const D3_0304 = d3Section('d3-0304', '0304 Václavice → Voračice', 130,
  P([[7708, 15854.6], [7693.5, 14248.4], [6926.6, 12878.5], [6068.5, 11225], [4811.2, 9789.9], [4040.4, 8430.7], [3547.5, 6886.3], [3014.6, 4999.1]]), 8.1, // 17.40 km at 130 (reference 15.82 km)
  { a: 'Václavice (from 0303)', b: 'Voračice (on to 0305/I)', official: 'planned D3', brief: '<b>Václavice</b> to <b>Voračice</b>, section 0304 of the D3' },
  'Get past the ridge at Prostřední vrch and over the valleys.', 'Follows section 0303. Continues as section 0305/I.',
  { a: { kind: 'interchange', with: 'road II/112', section: 'section 0303' }, b: { kind: 'interchange', with: 'road I/18', section: 'section 0305/I' } });
// Starter: mapped-line bends every ~1.5 km; bend 3 moved 12 m to the left (bounded search) so that a
// class II road at km 7.56 gets a buildable crossing.
export const D3_0305 = d3Section('d3-0305', '0305/I Voračice → Nová Hospoda', 130,
  P([[3018.9, 15108.2], [2562.2, 13483.7], [2847, 11675.1], [3706.9, 10000.3], [4588.5, 8638.8], [5054.1, 6964.2], [6481.5, 6188.7], [7979.2, 5463.5], [9211.5, 4014.4]]), 8.7, // 18.72 km at 130 (reference 17.02 km)
  { a: 'Voračice (from 0304)', b: 'Nová Hospoda', official: 'planned D3', brief: '<b>Voračice</b> to <b>Nová Hospoda</b>, where the D3 already runs' },
  'Bridge the Mastník valley and join the D3 that is already open.', 'Follows section 0304. Ends on the open D3.',
  { a: { kind: 'interchange', with: 'road I/18', section: 'section 0304' }, b: { kind: 'joins', with: 'the open D3' } });
export const D35_MOTORWAY: ScenarioParams = {
  ...D35_SCENARIO, presetId: 'd35-stage1-motorway', mode: 'motorway', title: 'Opatovec → Staré Město (first section)', retired: undefined,
  // The real section is D 26.0/130 (research/26), a category without an SPK 2026 row: built as D 27.5.
  initial: { ...D35_SCENARIO.initial!, category: 'D27.5', speed: 130 },
  picker: { kind: 'Motorway · 130 km/h', goal: 'Carry the motorway over the ridge to Staré Město.', note: 'Built 27.5 m wide, our usual motorway; the planned section is 26 m wide.' },
  ...MOTORWAY_TRAFFIC, maxTravelMin: 8.3, // 18 km at 130 (project section 16.6 km)
  ends: { a: { kind: 'joins', with: 'the open D35' }, b: { kind: 'continues', with: 'the next section, to Mohelnice' } },
};
// RETIRED (owner: a railway must start and end on the rail network, not at the motorway's ends). Kept so
// its saves still load (?scenario=d11&preset=d11-railway); not on the start screen.
export const D11_RAILWAY: ScenarioParams = {
  ...D11_SCENARIO, presetId: 'd11-railway', mode: 'railway', title: 'Railway: Trutnov → Polish border', retired: true,
  initial: { category: 'R2', speed: 160 },
  picker: { kind: 'Railway · 160 km/h', goal: 'Lay a double-track electric line through the pass to the border.' },
  maxTravelMin: 9,
};
// The whole Středočeská D3 in one mission (all five sections, 58.5 km published, 57.4 km mapped): from the D0
// interchange to the operating D3 at Nová Hospoda. One design speed, 120 km/h (0301–0303; 0304–0305/I are
// designed for 130). Starter: the five section starters' bends in sequence, bend 4 moved 12 m (a class III road
// at km 8.78 where 0301 meets 0302) and bend 26 12 m (a track at km 49.4 with no buildable reroute). Time: reference + 10 % at 120.
export const D3_FULL = d3Section('d3-full', 'The whole D3: Praha → Nová Hospoda', 120,
  P([[4301.3, 48003.8], [2984.8, 46437.6], [1801.8, 45262.9], [2017.2, 43757.5], [1860.6, 42184.6], [1608.6, 40643.7], [2588.5, 37743.4], [2849.5, 36185.1], [3544.1, 34644.6], [5073.2, 33920.3], [6490.3, 32261.7], [8308.2, 31162.2], [9401.1, 30118.3], [8708, 28354.6], [8693.5, 26748.4], [7926.6, 25378.5], [7068.5, 23725], [5811.2, 22289.9], [5040.4, 20930.7], [4547.5, 19386.3], [4014.6, 17499.1], [3522.9, 16083.9], [3518.9, 14108.2], [3062.2, 12483.7], [3347, 10675.1], [4206.9, 9000.3], [5076.9, 7635.6], [5554.1, 5964.2], [6981.5, 5188.7], [8479.2, 4463.5], [9711.5, 3014.4]]), 31.6, // 63.2 km at 120 (reference 57.4 km)
  { a: 'D0 Praha', b: 'Nová Hospoda', official: 'planned D3', brief: '<b>Prague ring</b> to <b>Nová Hospoda</b>, the whole Středočeská D3' },
  'Take the D3 from the Prague ring across the Sázava to where it is already open.', 'All five sections in one go, 57 km, at one design speed of 120 km/h (sections 0304 and 0305/I alone are designed for 130). The D0 interchange ramps are not part of the job.',
  { a: { kind: 'interchange', with: 'the D0 and road II/101' }, b: { kind: 'joins', with: 'the open D3' } });

// The whole D35 Opatovec → Mohelnice link (research/26–28): both project sections, 34.83 km published; the
// mapped line to where it starts to merge with I/35 (declared merge, PROVISIONAL) is 33.3 km. Built as
// D 27.5 (the project is D 26.0/130, no SPK row). Time target: reference + 10 % at 130 km/h. Starter:
// mapped-line bends every ~1.5 km, the last (400 m before B) dropped, four moved 12–100 m (and under the local grade
// solve, model 24, bends 16/17 another 60/12 m for a stream before B and a class I road, bend 2 12 m for a track
// with no buildable reroute, then bend 17 90 m more for the stream 170 m before B, which the grade cannot clear
// so close to the tie-in) by a bounded
// greedy search (research/39); B at 33.35 km on the mapped line, where it starts to merge with I/35.
export const D35_FULL: ScenarioParams = {
  ...D35_MOTORWAY, id: 'd35-full', presetId: 'd35-full-motorway', title: 'Opatovec → Mohelnice', group: 'D35',
  initial: { category: 'D27.5', speed: 130, pis: P([[3918, 9114.4], [5364.7, 9523.8], [7645.8, 9348.2], [9356.7, 9036.3], [11092.7, 8524], [12724.6, 8498.3], [14565.1, 8794.8], [16196.1, 8337.6], [17709.9, 7719.1], [19116.3, 6932.6], [20631.4, 6960.7], [22517.6, 7547.6], [23954.1, 8069.3], [25909.9, 8135.3], [27602.4, 7468.2], [29118.3, 6704.6], [30545.1, 5529.8], [31079.4, 4117]]) },
  picker: { kind: 'Motorway · 130 km/h', goal: 'Over the ridge and through the Maletín hills to the D35 at Mohelnice.',
    note: 'The whole link, both project sections. Built 27.5 m wide, our usual motorway; the planned road is 26 m wide.' },
  maxTravelMin: 17, // 36.6 km at 130 (reference 33.3 km)
  labels: { a: 'Opatovec', b: 'Mohelnice', official: 'planned D35', brief: '<b>Opatovec</b> to <b>Mohelnice</b>, the whole D35 link' },
  ends: { a: { kind: 'joins', with: 'the open D35' }, b: { kind: 'joins', with: 'road I/35' } },
};

// Railway Trutnov hl.n. → Královec (research/38). Today: the single-track, non-electrified cross-border line
// (OSM: tracks=1, electrified=no, 40–80 km/h; 16.9 km along the mapped track) via Trutnov střed, Libeč,
// Křenov and Bernartice, with passenger trains on to Lubawka and Sędzisław (GW Train Regio timetable
// 2025/26). No announced upgrade of this section was found (an SŽ 2018 study targets Hradec Králové–Trutnov
// only; the RS5 Wrocław studies name no route over Královec): the mission is a game proposal, a new
// single-track electric line between the two stations. It joins the existing track in both stations and
// rebuilds it where it runs along it; elsewhere the old line stays as it is. Ends: OSM station nodes
// (Nominatim, research/38) snapped onto the mapped line (≤ 2.4 m). Time target: a mission choice, 9 min
// running time = 18 km at 120 km/h (stations 12.7 km apart); today's trains take 26 min with four stops
// (KHK D26 timetable 2022). Traffic: PROVISIONAL prior, an hourly passenger train each way by day (16 h) and
// two each way at night, no freight (that 2022 summer timetable ran 4 trains each way).
export const D11_RAIL_KRALOVEC: ScenarioParams = {
  ...D11_SCENARIO, presetId: 'd11-rail-kralovec', mode: 'railway', title: 'Railway: Trutnov → Královec',
  ports: {
    a: { xy: [6640.8, 7782.0], latlon: [50.5652, 15.91106], note: 'Trutnov hlavní nádraží, on the mapped line' },
    b: { xy: [12204.8, 19202.5], latlon: [50.67296, 15.97042], note: 'Královec station, on the mapped line before the border' },
  },
  // Starter: four bends. It leaves Trutnov hl.n. north-west along the station tracks (a turnout's angle,
  // research/38 §5) and curves north under the hill west of the town in a tunnel, past Bernartice, and enters
  // Královec along its tracks. VALID (10.4 bn CZK), not optimised (scripts/rail-starter.ts). The first starter
  // left the station across its tracks through a street of houses (playtest re-test 2).
  initial: { category: 'R1', speed: 120, pis: [
    { x: 6012, y: 8426, r: null }, { x: 7966, y: 11521, r: null }, { x: 11000, y: 16400, r: null }, { x: 11560, y: 18613, r: null },
  ] },
  railTraffic: { passengerDay: 32, passengerNight: 4, freightDay: 0, freightNight: 0 },
  picker: { kind: 'Railway · 120 km/h', goal: 'A faster electric line from Trutnov to the border station at Královec.',
    note: 'A game proposal: no upgrade of this line has been announced. Trains to Poland take 26 minutes on the old single-track line today.' },
  maxTravelMin: 9,
  labels: { a: 'Trutnov hl.n.', b: 'Královec', official: 'official D11', brief: '<b>Trutnov hl.n.</b> to <b>Královec</b> station, by rail' },
};
/** Every playable mission, in picker order. */
export const PRESETS: ScenarioParams[] = [D11_SCENARIO, D11_RAIL_KRALOVEC, D3_FULL, D3_0301, D3_0302, D3_0303, D3_0304, D3_0305,
  D3_SCENARIO, D3_MOTORWAY, D35_FULL, D35_MOTORWAY, D35_SCENARIO, NOVA_PAKA_SCENARIO, D11_RAILWAY];

/** Game parameters per scenario id (= terrain pack directory). Preset IDs scope new project saves.
 * D11 intentionally retains its exact legacy parameters and default. */
export const SCENARIOS: Record<string, ScenarioParams> = {
  d11: D11_SCENARIO, d3: D3_SCENARIO, d35: D35_SCENARIO, 'i16-nova-paka': NOVA_PAKA_SCENARIO,
  'd3-full': D3_FULL, 'd35-full': D35_FULL, 'd3-0301': D3_0301, 'd3-0302': D3_0302, 'd3-0303': D3_0303, 'd3-0304': D3_0304, 'd3-0305': D3_0305,
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
