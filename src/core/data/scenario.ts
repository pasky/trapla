import type { CategoryId, TerrainClass } from './categories';
import type { PI } from '../horizontal';
import type { EndConnection } from '../terms';
import type { EndpointJunctionKind } from './urban';
export interface EndJunctionDecl { kind: EndpointJunctionKind; osmWayIds: number[]; ways: number[]; about?: string }

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

export const CATEGORY_RANK: Record<CategoryId, number> = { P4: -2, 'M7.5': -1, 'S7.5': 0, 'S9.5': 1, 'S11.5': 2, 'D27.5': 3, 'D27.5-1': 3, 'S21.5': 3, 'S21.5-1': 3, R1: 0, R2: 0 };

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
  /** The start screen's card: what the line is (its length is added) and what you do, in one line each.
   * `section`: the mission is one choice of its corridor's card (`group`), labelled so; `startHere`: the one
   * mission offered first to a new player; `aside`: a short warning under the card (such cards go last); `note`:
   * a short fact under it. */
  picker?: { kind: string; goal: string; section?: string; startHere?: boolean; aside?: string; note?: string };
  /** The corridor the mission belongs to: its sections share one card on the start screen. */
  group?: string;
  /** Superseded mission: not offered on the start screen; a save of one is listed under "Your older saves"
   * (and its direct link still loads). */
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
  /** The mission's own connection of an end to a retained road, where the pack declares none there (pack meta
   * A/B.junction): the same form, legacy net way indices (resolved from the OSM ways; a test checks them). */
  junctions?: { a?: EndJunctionDecl; b?: EndJunctionDecl };
  /** Shown once when the aerial photo is first turned on: what it shows that the map does not. */
  photoNote?: string;
}

export const D11_SCENARIO: ScenarioParams = {
  id: 'd11',
  title: 'Trutnov → Polish border', group: 'Trutnov',
  traffic: 9_000,
  maxTravelMin: 14.5,
  terrainClass: 'hilly',
  maxGradient: 0.06,
  labels: { a: 'Trutnov', b: 'PL border', official: 'official D11', brief: '<b>A</b> (D11 near Trutnov) to <b>B</b> (Polish border)' },
  picker: { kind: 'Class I road', goal: 'Connect Trutnov to the Polish border through the hills.', section: 'Class I road' },
};

// New two-lane exercises use explicit GAME PRIORS, not local census/forecast claims.
// The TP188 representative capacity case above and 15% heavy share are uncalibrated here.
// Reference routes/norm category evidence: research/24–26. Time targets are mission choices.
// Superseded by the D3 sections below (kept loadable): its ends are ≈ 1.8 km before the 0301/0302 boundary and
// ≈ 2 km before the end of 0303 on the mapped line (research/39), i.e. most of sections 0302 and 0303.
export const D3_SCENARIO: ScenarioParams = {
  id: 'd3', presetId: 'd3-road', title: 'Jílové → Václavice, two-lane road', retired: true, group: 'Středočeská D3',
  // Editable starter near the reference, validated on this pack; no hidden structure overrides.
  // Three bends moved <12 m by the existing bounded repair tool to resolve a track conflict; under the local
  // grade solve (model 25) the last one 60 + 25 m more for another track and an underpass approach, and the
  // second one 25 m for a track underpass near A.
  initial: { category: 'S9.5', speed: 90, pis: [
    { x: 3872.4, y: 14182.6, r: null }, { x: 3583.7, y: 12646, r: null },
    { x: 4588.5, y: 9743.4, r: null }, { x: 4849.5, y: 8185.1, r: null },
    { x: 5549, y: 6639, r: null }, { x: 7079, y: 5914, r: null }, { x: 8487.7, y: 4262.8, r: null },
  ] },
  picker: { kind: 'Class I road', goal: 'Cross the Sázava and find a way through the hills.' },
  // 11.5 min allows 17.25 km at 90 (mapped reference 15.68 km), 15.33 km at 80.
  traffic: 9_000, heavyShare: 0.15, maxTravelMin: 11.5,
  terrainClass: 'hilly', maxGradient: 0.06,
  labels: { a: 'Jílové', b: 'Václavice', official: 'planned D3', brief: '<b>Jílové</b> to <b>Václavice</b>, across the Sázava' },
};

export const D35_SCENARIO: ScenarioParams = {
  // First stage only: the full 34 km corridor to Mohelnice missed the live-drag budget (research/27).
  // Superseded by the motorway missions (the two-lane road exercise in a motorway corridor); kept loadable.
  id: 'd35', presetId: 'd35-stage1-road', title: 'Opatovec → Staré Město, two-lane road', retired: true, group: 'D35',
  // Editable starter: mapped-reference bends at ~1.5 km, then bounded validity-first repair moved
  // bend 7 by 7.6 m to clear a track (research/27); under model 25 bend 2 by 25 m (a track with no buildable
  // reroute at km 6.99). No junction: B is the section boundary.
  initial: { category: 'S9.5', speed: 90, pis: [
    { x: 3911.6, y: 4138.6, r: null }, { x: 5364.7, y: 4523.8, r: null }, { x: 7639.4, y: 4311.8, r: null },
    { x: 9356.7, y: 4036.3, r: null }, { x: 11092.7, y: 3524, r: null }, { x: 12724.6, y: 3498.3, r: null },
    { x: 14565.1, y: 3794.8, r: null }, { x: 16198, y: 3345, r: null }, { x: 17709.9, y: 2719.1, r: null },
  ] },
  picker: { kind: 'Class I road', goal: 'Pass the ridge and villages to Staré Město.' },
  // 12 min allows 18 km at 90 or 16 km at 80 (project section 16.6 km); a mission choice, not a norm.
  traffic: 9_000, heavyShare: 0.15, maxTravelMin: 12,
  terrainClass: 'hilly', maxGradient: 0.06,
  labels: { a: 'Opatovec', b: 'Staré Město', official: 'planned D35', brief: '<b>Opatovec</b> to <b>Staré Město</b>, first stage of D35' },
};

export const NOVA_PAKA_SCENARIO: ScenarioParams = {
  // RETIRED (replaced by the Šternberk bypass, research/88): its terrain and photo were captured while the real
  // bypass was being built. Kept so its saves still load (?scenario=i16-nova-paka); not on the start screen.
  id: 'i16-nova-paka', presetId: 'i16-nova-paka-road', title: 'Nová Paka bypass', group: 'I/16', retired: true,
  ends: { b: { kind: 'roundabout', with: 'road I/16' } },
  photoNote: 'The photo was taken while the real bypass was being built: the bare earth you see is its construction site, not our road.',
  // S11.5/70 is the actual project's category (OPD entry); 10,000/day is a GAME PRIOR,
  // not the project's forecast. Eight minutes permits 9.33 km at 70 km/h (reference 8.479 km).
  // Editable starter along the mapped bypass: its nine curves as bends at their mapped tangent points and radii
  // (R 360–1,475 m), then bends 0 and 6 moved 4 / 6 m off two side roads (2026-11-17, PLAN.md "Nová Paka
  // starter"). The ground already has the real bypass's cuts (photo note): its earthworks come cheap here.
  initial: { category: 'S11.5', speed: 70, pis: [
    { x: 6624.2, y: 5430.2, r: 360 }, { x: 7268.3, y: 5556.3, r: 1475 }, { x: 7952.4, y: 6016.8, r: 460 },
    { x: 8681.1, y: 6184.7, r: 385 }, { x: 8686.4, y: 6756.4, r: 400 }, { x: 8951.8, y: 6960.2, r: 530 },
    { x: 9478.9, y: 7633.8, r: 770 }, { x: 11069.8, y: 7293.7, r: 500 }, { x: 10748.1, y: 9346.6, r: 470 },
  ] },
  picker: { kind: 'Class I road', goal: 'Take traffic around town without moving too much earth.',
    aside: 'The real road is already in the ground here.' },
  traffic: 10_000, heavyShare: 0.15, maxTravelMin: 8,
  terrainClass: 'hilly', maxGradient: 0.06,
  labels: { a: 'Kumburský Újezd', b: 'Vidochov', official: 'bypass reference', brief: '<b>Kumburský Újezd</b> to <b>Vidochov</b>, around Nová Paka' },
};

// The I/46 Šternberk bypass (research/88): planned, not built (ŘSD leaflet 07/2025: 4,708 m, S 11.5/90 to the
// interchange at km 2.0, S 11.5/70 past it "where the terrain is mountainous"; 2,037 M ex VAT; permit suspended until
// 9/2027 at the latest). Ends: where the OSM planned line leaves the I/46 from Olomouc south of the town (the real
// start is the split of an interchange there) and where it rejoins the I/46 towards Opava past the Domašov turn.
// Traffic: the town count, not a forecast: ŘSD CSD 2025 on the I/46 through Šternberk, from the town sign to the
// Domašov turn (sections 7-1096 16,731, 7-1091 12,816, 7-2182 9,671, 7-2196 5,241 vehicles a day over 957 / 651 /
// 753 / 1,335 m), averaged over their lengths: 10,453 a day, 898 heavy (8.6 %, used as the noise model's heavy
// share). Time target: a mission choice, the mapped line + 10 % at the real project's speeds (2.0 km at 90, 2.23 km
// at 70: 3.57 → 3.6 min). Starter: the mapped line's five curves as bends at its tangent intersections, radii
// near the mapped ones, the three past km 2.0 at 70 km/h as the real project; VALID as placed (880 M).
export const STERNBERK_SCENARIO: ScenarioParams = {
  id: 'i46-sternberk', presetId: 'i46-sternberk-road', title: 'Šternberk bypass', group: 'I/46',
  initial: { category: 'S11.5', speed: 90, pis: [
    { x: 2646.9, y: 3503.2, r: 1500 }, { x: 3212.8, y: 4153.7, r: 1000 }, { x: 3452.5, y: 4769.9, r: 800, speed: 70 },
    { x: 3466.1, y: 5342.5, r: 360, speed: 70 }, { x: 4574.1, y: 5350, r: 340, speed: 70 },
  ] },
  picker: { kind: 'Class I road', goal: 'Take the I/46 around the town, over a wooded valley and up towards Opava.' },
  traffic: 10_453, heavyShare: 0.086, maxTravelMin: 3.6,
  terrainClass: 'hilly', maxGradient: 0.06,
  labels: { a: 'Olomouc', b: 'Opava', official: 'planned bypass', brief: 'Around <b>Šternberk</b>, from the <b>Olomouc</b> road to the <b>Opava</b> road' },
  ends: { a: { kind: 'joins', with: 'road I/46 from Olomouc' }, b: { kind: 'joins', with: 'road I/46 to Opava' } },
};

// Motorway missions in the same corridors: separate presets (own saves) next to the unchanged road
// exercises. Traffic: GAME PRIOR = CSD 2020 national mean motorway AADT "cca 30 700 voz/24h" (ŘSD
// census page), not a local forecast (none found, research/33 §2). Acoustic heavy share 22.56 %: TP 219
// tab. 4-2 first-class motorway mix (19 % goods + 1 % buses + 32 % of 8 % light goods, Manuál tab. 20).
// Capacity: D 27.5 carries it. Time targets are mission choices (≈ 10 % longer than the reference).
export const MOTORWAY_TRAFFIC = { traffic: 30_700, heavyShare: 0.2256 };
export const D3_MOTORWAY: ScenarioParams = {
  ...D3_SCENARIO, presetId: 'd3-motorway', mode: 'motorway', title: 'Jílové → Václavice, motorway', retired: true,
  // The real 0302/0303 sections are D 27.5/120 (research/25). Starter = the road exercise's bends with
  // the last bend moved 30 m (bounded validity-first search) so the wider body clears a track, and (model 25)
  // the one before it 12 m for another track; not optimised.
  initial: { category: 'D27.5', speed: 120, pis: [
    { x: 3872.4, y: 14182.6, r: null }, { x: 3608.6, y: 12643.7, r: null },
    { x: 4588.5, y: 9743.4, r: null }, { x: 4849.5, y: 8185.1, r: null },
    { x: 5549, y: 6639, r: null }, { x: 7073.9, y: 5903.2, r: null }, { x: 8498.8, y: 4259.8, r: null },
  ] },
  picker: { kind: 'Motorway', goal: 'Both directions together; split them where the hills ask for it.' },
  ...MOTORWAY_TRAFFIC, maxTravelMin: 8.6, // 17.2 km at 120 (reference 15.68 km)
};

// Středočeská D3 as its real construction sections (ŘSD leaflets 09/2025, research/39): one pack and one
// motorway mission per section, D 27.5 at the section's design speed. Ends: section boundaries on the mapped
// proposed line (by leaflet chainage), the D0 interchange (0301) and the operating D3 (0305/I). Time targets
// are mission choices: reference length + 10 % at the design speed, rounded up to 0.1 min.
const d3Section = (id: string, section: string, title: string, speed: 120 | 130, pis: PI[], maxTravelMin: number,
  labels: ScenarioParams['labels'], goal: string, ends: ScenarioParams['ends']): ScenarioParams => ({
  id, presetId: `${id}-motorway`, mode: 'motorway', title, group: 'Středočeská D3', ends,
  initial: { category: 'D27.5', speed, pis },
  // the start screen's chip names the section by its places (the section number is ŘSD's, not the player's)
  picker: { kind: 'Motorway', goal, section: /^Whole/.test(section) ? section : title },
  ...MOTORWAY_TRAFFIC, maxTravelMin, terrainClass: 'hilly', maxGradient: 0.06, labels,
});
const startHere = (p: ScenarioParams): ScenarioParams => ({ ...p, picker: { ...p.picker!, startHere: true } });
const P = (pts: [number, number][]): PI[] => pts.map(([x, y]) => ({ x, y, r: null }));
// Starters: mapped-line bends every ~1.5 km, none within 750 m of B (a bend that close cannot have its
// curve before the end, research/39).
export const D3_0301 = d3Section('d3-0301', '0301', 'Praha → Jílové', 120,
  P([[5301.3, 9003.8], [3984.8, 7437.6], [2801.8, 6262.9], [3017.2, 4757.5]]), 4.8, // 9.58 km at 120 (reference 8.71 km)
  { a: 'D0 Praha', b: 'Jílové (on to 0302)', official: 'planned D3', brief: '<b>Prague ring</b> to <b>Jílové</b>, section 0301 of the D3' },
  'Leave the Prague ring and get through the hills to Jílové.',
  { a: { kind: 'interchange', with: 'the D0 and road II/101' }, b: { kind: 'interchange', with: 'road II/104', section: 'section 0302' } });
// Starter: mapped-line bends every ~1.5 km, valid as sampled.
// The start screen offers it first ("Start here"): the smallest pack (≈ 4 MB to load), a 4.5 km line that
// evaluates fast, and one plain story: the deep Sázava valley, bridged or not.
export const D3_0302 = startHere(d3Section('d3-0302', '0302', 'Jílové → Hostěradice', 120, P([[2608.6, 6143.7]]), 2.5, // 4.97 km at 120 (reference 4.52 km)
  { a: 'Jílové (from 0301)', b: 'Hostěradice (on to 0303)', official: 'planned D3', brief: '<b>Jílové</b> to <b>Hostěradice</b>, across the Sázava' },
  'Cross the deep Sázava valley.',
  { a: { kind: 'interchange', with: 'road II/104', section: 'section 0301' }, b: { kind: 'interchange', with: 'road II/106', section: 'section 0303' } }));
// Starter: mapped-line bends every ~1.5 km; bend 3 moved 45 m to the right (bounded search) so that the
// body clears a track at km 6.95 (research/39).
export const D3_0303 = d3Section('d3-0303', '0303', 'Hostěradice → Václavice', 120,
  P([[2849.5, 9185.1], [3544.1, 7644.6], [5073.2, 6920.3], [6490.3, 5261.7], [8308.2, 4162.2]]), 6.3, // 12.50 km at 120 (reference 11.36 km)
  { a: 'Hostěradice (from 0302)', b: 'Václavice (on to 0304)', official: 'planned D3', brief: '<b>Hostěradice</b> to <b>Václavice</b>, section 0303 of the D3' },
  'Wind through the woods and side valleys towards Benešov.',
  { a: { kind: 'interchange', with: 'road II/106', section: 'section 0302' }, b: { kind: 'interchange', with: 'road II/112', section: 'section 0304' } });
// Starter: mapped-line bends every ~1.5 km, valid as sampled.
export const D3_0304 = d3Section('d3-0304', '0304', 'Václavice → Voračice', 130,
  P([[7708, 15854.6], [7693.5, 14248.4], [6926.6, 12878.5], [6068.5, 11225], [4811.2, 9789.9], [4040.4, 8430.7], [3547.5, 6886.3], [3014.6, 4999.1]]), 8.1, // 17.40 km at 130 (reference 15.82 km)
  { a: 'Václavice (from 0303)', b: 'Voračice (on to 0305/I)', official: 'planned D3', brief: '<b>Václavice</b> to <b>Voračice</b>, section 0304 of the D3' },
  'Get past the ridge at Prostřední vrch and over the valleys.',
  { a: { kind: 'interchange', with: 'road II/112', section: 'section 0303' }, b: { kind: 'interchange', with: 'road I/18', section: 'section 0305/I' } });
// Starter: mapped-line bends every ~1.5 km; bend 3 moved 12 m to the left (bounded search) so that a
// class II road at km 7.56 gets a buildable crossing.
export const D3_0305 = d3Section('d3-0305', '0305/I', 'Voračice → Nová Hospoda', 130,
  P([[3018.9, 15108.2], [2562.2, 13483.7], [2847, 11675.1], [3706.9, 10000.3], [4588.5, 8638.8], [5054.1, 6964.2], [6481.5, 6188.7], [7979.2, 5463.5], [9211.5, 4014.4]]), 8.7, // 18.72 km at 130 (reference 17.02 km)
  { a: 'Voračice (from 0304)', b: 'Nová Hospoda', official: 'planned D3', brief: '<b>Voračice</b> to <b>Nová Hospoda</b>, where the D3 already runs' },
  'Bridge the Mastník valley and join the D3 that is already open.',
  { a: { kind: 'interchange', with: 'road I/18', section: 'section 0304' }, b: { kind: 'joins', with: 'the open D3' } });
export const D35_MOTORWAY: ScenarioParams = {
  ...D35_SCENARIO, presetId: 'd35-stage1-motorway', mode: 'motorway', title: 'Opatovec → Staré Město', retired: undefined,
  // The real section is D 26.0/130 (research/26), a category without an SPK 2026 row: built as D 27.5.
  initial: { ...D35_SCENARIO.initial!, category: 'D27.5', speed: 130 },
  picker: { kind: 'Motorway', goal: 'Carry the motorway over the ridge to Staré Město.', section: 'Opatovec → Staré Město' },
  ...MOTORWAY_TRAFFIC, maxTravelMin: 8.3, // 18 km at 130 (project section 16.6 km)
  ends: { a: { kind: 'joins', with: 'the open D35' }, b: { kind: 'continues', with: 'the next section, to Mohelnice' } },
};
// RETIRED (owner: a railway must start and end on the rail network, not at the motorway's ends). Kept so
// its saves still load (?scenario=d11&preset=d11-railway); not on the start screen.
export const D11_RAILWAY: ScenarioParams = {
  ...D11_SCENARIO, presetId: 'd11-railway', mode: 'railway', title: 'Trutnov → Polish border, railway', retired: true,
  initial: { category: 'R2', speed: 160 },
  picker: { kind: 'Railway', goal: 'Lay a double-track electric line through the pass to the border.' },
  maxTravelMin: 9,
};
// The whole Středočeská D3 in one mission (all five sections, 58.5 km published, 57.4 km mapped): from the D0
// interchange to the operating D3 at Nová Hospoda. One design speed, 120 km/h (0301–0303; 0304–0305/I are
// designed for 130). Starter: the five section starters' bends in sequence, bend 4 moved 12 m (a class III road
// at km 8.78 where 0301 meets 0302), bend 26 12 m (a track at km 49.4 with no buildable reroute) and, under the local
// grade solve's long-block boundaries, bend 6 12 m (a span over a road at km 12 and an overbridge at km 33). Time:
// reference + 10 % at 120.
export const D3_FULL = d3Section('d3-full', 'Whole route', 'Praha → Nová Hospoda', 120,
  P([[4301.3, 48003.8], [2984.8, 46437.6], [1801.8, 45262.9], [2017.2, 43757.5], [1860.6, 42184.6], [1608.6, 40643.7], [2577.1, 37739.6], [2849.5, 36185.1], [3544.1, 34644.6], [5073.2, 33920.3], [6490.3, 32261.7], [8308.2, 31162.2], [9401.1, 30118.3], [8708, 28354.6], [8693.5, 26748.4], [7926.6, 25378.5], [7068.5, 23725], [5811.2, 22289.9], [5040.4, 20930.7], [4547.5, 19386.3], [4014.6, 17499.1], [3522.9, 16083.9], [3518.9, 14108.2], [3062.2, 12483.7], [3347, 10675.1], [4206.9, 9000.3], [5076.9, 7635.6], [5554.1, 5964.2], [6981.5, 5188.7], [8479.2, 4463.5], [9711.5, 3014.4]]), 31.6, // 63.2 km at 120 (reference 57.4 km)
  { a: 'D0 Praha', b: 'Nová Hospoda', official: 'planned D3', brief: '<b>Prague ring</b> to <b>Nová Hospoda</b>, the whole Středočeská D3' },
  'Take the D3 from the Prague ring across the Sázava to where it is already open.',
  { a: { kind: 'interchange', with: 'the D0 and road II/101' }, b: { kind: 'joins', with: 'the open D3' } });

// The whole D35 Opatovec → Mohelnice link (research/26–28): both project sections, 34.83 km published; the
// mapped line to where it starts to merge with I/35 (declared merge, PROVISIONAL) is 33.3 km. Built as
// D 27.5 (the project is D 26.0/130, no SPK row). Time target: reference + 10 % at 130 km/h. Starter:
// mapped-line bends every ~1.5 km, the last (400 m before B) dropped, four moved 12–100 m (and under the local grade
// solve, model 25, bends 16/17 another 60/12 m for a stream before B and a class I road, bend 2 12 m for a track
// with no buildable reroute, then bend 17 90 + 150 m more for the stream 170 m before B, which the grade cannot
// clear so close to the tie-in) by a bounded
// greedy search (research/39); B at 33.35 km on the mapped line, where it starts to merge with I/35.
export const D35_FULL: ScenarioParams = {
  ...D35_MOTORWAY, id: 'd35-full', presetId: 'd35-full-motorway', title: 'Opatovec → Mohelnice', group: 'D35',
  initial: { category: 'D27.5', speed: 130, pis: P([[3918, 9114.4], [5364.7, 9523.8], [7645.8, 9348.2], [9356.7, 9036.3], [11092.7, 8524], [12724.6, 8498.3], [14565.1, 8794.8], [16196.1, 8337.6], [17709.9, 7719.1], [19116.3, 6932.6], [20631.4, 6960.7], [22517.6, 7547.6], [23954.1, 8069.3], [25909.9, 8135.3], [27602.4, 7468.2], [29118.3, 6704.6], [30545.1, 5529.8], [30952.6, 4036.8]]) },
  picker: { kind: 'Motorway', goal: 'Over the ridge and through the Maletín hills to the D35 at Mohelnice.', section: 'Whole link' },
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
  ...D11_SCENARIO, presetId: 'd11-rail-kralovec', mode: 'railway', title: 'Trutnov → Královec',
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
  picker: { kind: 'Railway', goal: 'Build a faster electric line from Trutnov to the border station at Královec.' },
  maxTravelMin: 9,
  labels: { a: 'Trutnov hl.n.', b: 'Královec', official: 'official D11', brief: '<b>Trutnov hl.n.</b> to <b>Královec</b> station, by rail' },
};
// The real project (research/87): D11 stavba 1109 Trutnov – státní hranice ČR/PR, 21.175 km, ŘSD leaflets 04–05/2026:
// D 26.0/130 for its first ≈ 1 km to the Střítež interchange, D 21.5/110 from there to the border (MÚK Střítež,
// Poříčí, Královec; twin-tube tunnels Poříčí 540/576 m and Opevnění 2 × 492 m; 2024 contract CZK 11.71 bn ex VAT).
// Neither width has an SPK 2026 row: built as D 27.5 at the 110 km/h of almost all its length. A = the pack's A on the
// mapped D11, 21.0 km before the border, where section 1108 from Jaroměř (being built) meets 1109; B = the border,
// where OSM's ref turns D11 → S3. Traffic: ŘSD's 2040 forecast for Trutnov – Polsko, 13,000 vehicles a day (D11
// brochure 08/2017 p. 7); acoustic heavy share the motorway mix of MOTORWAY_TRAFFIC (no share published). Time
// target: a mission choice, the mapped line + 10 % at 110 (23.1 km). Starter: mapped-line bends every ~1.5 km, none
// within 750 m of B (scripts/motorway-starter.ts --mapped=1.5), VALID as sampled; it is also the reference the real
// contract is compared with (research/87).
export const D11_MOTORWAY: ScenarioParams = {
  ...D11_SCENARIO, presetId: 'd11-motorway', mode: 'motorway', title: 'Motorway D11: Trutnov → Polish border',
  initial: { category: 'D27.5', speed: 110, pis: P([[7297.6, 4769.1], [8172.4, 5885.6], [9633.4, 6226.9], [10032.7, 7613.4], [9898.7, 9089.2],
    [10102.1, 10610.2], [10834.1, 12046], [10670.3, 13528.3], [10008.6, 14908.1], [10279.5, 16368.1], [11399.3, 17363], [11619.5, 18839.6],
    [12099.7, 20182.6]]) },
  picker: { kind: 'Motorway', goal: 'Take the D11 over the hills to the Polish S3.', section: 'Motorway D11' },
  traffic: 13_000, heavyShare: MOTORWAY_TRAFFIC.heavyShare, maxTravelMin: 12.6,
  labels: { ...D11_SCENARIO.labels, brief: '<b>A</b> (D11 near Trutnov) to <b>B</b> (Polish border, where the S3 goes on)' },
  ends: { a: { kind: 'joins', with: 'the D11 from Jaroměř' }, b: { kind: 'continues', with: 'the S3 in Poland' } },
  // B: the S3 carriageways that start there (OSM ways 1171616839 into B, 1171616840 out of it; ref S3, both mapped
  // motorway) are our motorway's continuation: met at B, not a road our earthworks cover (as the D3 0305/I joins
  // the open D3). The road mission keeps the pack's plain end.
  junctions: { b: { kind: 'merge', osmWayIds: [1171616839, 1171616840], ways: [2267, 2268],
    about: 'The S3 carriageways that start at the border, where OSM ref D11 turns S3' } },
};
// The I/35 Turnov – Úlibice through Český ráj (research/89): the former R35, a class I road since 2016, planned by ŘSD as
// four stages (MÚK Ohrazenice; Ohrazenice – Valdštejnsko ≈ 5.5 km; Valdštejnsko – Čímyšl ≈ 12.5 km; Čímyšl – Úlibice
// ≈ 14.5 km; the 2023 technical study, 33.0 km, E1 line of the 2021 EIA opinion, revoked 12/2025, new EIA from 2026).
// Category: S 21.5 at 110 km/h, the real project's to MÚK Žernov (km 12.4); beyond it the real road is the 2+1
// S 15.25/110, which the game cannot change to mid-route (research/89 §6). Not a motorway in law: CHKO Český ráj's
// zones III–IV need consent, a note (zákon 114/1992 §26; categories.ts motorwayByLaw). Ends: the packs' A and B on the
// mapped line (OSM highway=proposed ways 1012219137, 1012219136, 883368325): km 0.6 past the D10 / I/35 interchange and
// the Liberec–Turnov railway; km 6.4 past the Valdštejnsko interchange, the railway and road I/35 the line bridges and
// road III/2835; km 18.9 at the Čímyšl interchange; km 33.02 where the D35 Úlibice bypass starts (research/89 §7).
// Traffic: the EIA's 2040 forecast (dokumentace 2020 p. 76), averaged over each stretch's segments by length, its heavy
// share (NA) the noise model's. Time targets: a mission choice, the mapped line + 10 % at 110 km/h, rounded up to 0.1
// min. Starters: the mapped line's nodes every ≈ 0.6 km, none within 750 m of B (scripts/motorway-starter.ts
// --mapped=0.6), VALID as sampled. (The Valdštejnsko – Čímyšl reference fixture is every 1.0 km, not check.ts --seed's
// 1.5 km, which crosses a pond lengthwise: do not reseed it.)
const i35Section = (id: string, title: string, section: string, pis: PI[], traffic: number, heavyShare: number, maxTravelMin: number,
  labels: ScenarioParams['labels'], goal: string, ends: ScenarioParams['ends']): ScenarioParams => ({
  id, presetId: `${id}-road`, mode: 'motorway', title, group: 'Český ráj', ends,
  initial: { category: 'S21.5', speed: 110, pis },
  picker: { kind: 'Four-lane road', goal, section, note: 'Not a motorway: a motorway may not enter the protected landscape.' },
  traffic, heavyShare, maxTravelMin, terrainClass: 'hilly', maxGradient: 0.06, labels,
});
const I35_OHRAZENICE = { kind: 'interchange', with: 'the D10 and road I/35 to Liberec' } as const;
const I35_UL = { kind: 'continues', with: 'the D35 to Hradec Králové' } as const;
export const I35_TURNOV = i35Section('i35-turnov', 'Turnov → Valdštejnsko', 'Turnov → Valdštejnsko', P([[2115.2, 3958.9], [2672.8, 3509.4], [3360.8, 3198.4], [3748.5, 2641.7], [4259, 2303.6], [5004.7, 2056.5], [5555.7, 1798.3]]), 19_505, 0.150, 3.5, // 6.38 km at 110 (mapped 5.80 km)
  { a: 'Ohrazenice', b: 'Valdštejnsko', official: 'planned I/35', brief: '<b>Ohrazenice</b> to <b>Valdštejnsko</b>, past Turnov' },
  'Cross the Jizera and pass Turnov at the edge of Český ráj.',
  { a: I35_OHRAZENICE, b: { kind: 'interchange', with: 'road I/35', section: 'the next stage, to Čímyšl' } });
export const I35_ROVENSKO = i35Section('i35-rovensko', 'Valdštejnsko → Čímyšl', 'Valdštejnsko → Čímyšl', P([[3000, 9527.5], [3787.6, 9708.7], [4568.1, 9652.5], [5148.6, 9119], [5796.7, 8658], [6082.5, 8070.1], [6366.1, 7476.4], [6919.5, 7149.7], [7599.9, 6941.6], [8042.8, 6491.3], [8031.3, 5518.6], [8037.8, 4804.6], [7548.3, 4205.1], [7054, 3758.4], [6855.9, 3195.2], [6983.2, 2614.9]]), 17_249, 0.164, 7.5, // 13.75 km at 110 (mapped 12.50 km)
  { a: 'Valdštejnsko', b: 'Čímyšl', official: 'planned I/35', brief: '<b>Valdštejnsko</b> to <b>Čímyšl</b>, round Rovensko under Trosky' },
  'Climb the sandstone scarps round Rovensko, under Trosky castle.',
  { a: { kind: 'interchange', with: 'road I/35', section: 'the stage from Turnov' }, b: { kind: 'interchange', with: 'road I/35', section: 'the last stage, to Úlibice' } });
export const I35_JICIN = i35Section('i35-jicin', 'Čímyšl → Úlibice', 'Čímyšl → Úlibice', P([[2998.4, 9284.6], [3589.5, 8941.6], [3941.6, 8395.2], [3957.3, 7777.3], [4370.5, 7171.4], [5196.1, 6828.1], [5842.7, 6197.2], [6492, 5636.4], [7117.3, 5264.6], [7660.7, 4750.2], [8146.2, 4203.7], [8944.6, 3804.3], [10314.8, 3298.9], [11160.5, 2910.6]]), 11_871, 0.205, 8.5, // 15.53 km at 110 (mapped 14.12 km)
  { a: 'Čímyšl', b: 'Úlibice', official: 'planned I/35', brief: '<b>Čímyšl</b> to <b>Úlibice</b>, past Jičín to the D35' },
  'Cross the Cidlina valley and reach the D35 at Úlibice.',
  { a: { kind: 'interchange', with: 'road I/35', section: 'the stage from Valdštejnsko' }, b: I35_UL });
export const I35_FULL = i35Section('i35-full', 'Turnov → Úlibice', 'Whole route', P([[2115.2, 19958.9], [2672.8, 19509.4], [3360.8, 19198.4], [3748.5, 18641.7], [4259, 18303.6], [5004.7, 18056.5], [5555.7, 17798.3], [6267.7, 17830], [7000, 17527.5], [7787.6, 17708.7], [8568.1, 17652.5], [9148.6, 17119], [9796.7, 16658], [10082.5, 16070.1], [10366.1, 15476.4], [10919.5, 15149.7], [11599.9, 14941.6], [12042.8, 14491.3], [12031.3, 13518.6], [12037.8, 12804.6], [11548.3, 12205.1], [11054, 11758.4], [10855.9, 11195.2], [10983.2, 10614.9], [11711.1, 9956], [12998.4, 9284.6], [13589.5, 8941.6], [13941.6, 8395.2], [13957.3, 7777.3], [14370.5, 7171.4], [15196.1, 6828.1], [15842.7, 6197.2], [16492, 5636.4], [17117.3, 5264.6], [17660.7, 4750.2], [18146.2, 4203.7], [18944.6, 3804.3], [20314.8, 3298.9], [21160.5, 2910.6]]), 15_235, 0.175, 19.5, // 35.66 km at 110 (mapped 32.42 km)
  { a: 'Turnov', b: 'Úlibice', official: 'planned I/35', brief: '<b>Turnov</b> to <b>Úlibice</b>, along the edge of Český ráj' },
  'Take the road from Turnov to the D35 at Úlibice, round the protected rocks and ponds of Český ráj.',
  { a: I35_OHRAZENICE, b: I35_UL });

/** Every playable mission, in picker order. */
export const PRESETS: ScenarioParams[] = [D11_MOTORWAY, D11_SCENARIO, D11_RAIL_KRALOVEC, D3_FULL, D3_0301, D3_0302, D3_0303, D3_0304, D3_0305,
  D3_SCENARIO, D3_MOTORWAY, D35_FULL, D35_MOTORWAY, D35_SCENARIO, I35_FULL, I35_TURNOV, I35_ROVENSKO, I35_JICIN, STERNBERK_SCENARIO, NOVA_PAKA_SCENARIO, D11_RAILWAY];

/** Game parameters per scenario id (= terrain pack directory). Preset IDs scope new project saves.
 * D11 intentionally retains its exact legacy parameters and default. */
export const SCENARIOS: Record<string, ScenarioParams> = {
  d11: D11_SCENARIO, d3: D3_SCENARIO, d35: D35_SCENARIO, 'i16-nova-paka': NOVA_PAKA_SCENARIO, 'i46-sternberk': STERNBERK_SCENARIO,
  'd3-full': D3_FULL, 'd35-full': D35_FULL, 'i35-full': I35_FULL, 'i35-turnov': I35_TURNOV, 'i35-rovensko': I35_ROVENSKO, 'i35-jicin': I35_JICIN, 'd3-0301': D3_0301, 'd3-0302': D3_0302, 'd3-0303': D3_0303, 'd3-0304': D3_0304, 'd3-0305': D3_0305,
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
