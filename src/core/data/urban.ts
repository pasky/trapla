import { railRouteBasePerKm } from './railway';
// Built-up areas: buildings, building land, urban construction rates, crossings of existing roads,
// noise walls. CZK excl. VAT: SPK CN norms are 2026; research examples are at their original dates,
// NOT escalated to 2026. Sources: research/07-property-land.md (buildings,
// land, demolition), research/08-junctions-crossings.md (crossings), research/09-noise-earthworks-urban.md
// (noise walls). UNVERIFIED marks a game allowance or heuristic no source supports yet; PROVISIONAL a
// game rule standing in for a real calculation.

import type { CategoryId } from './categories';
import type { UnderpassSize } from './remedies';

// ---------------------------------------------------------------------------------------------
// Buildings in the footprint: floor area × (building-only estimate × 1.5 + demolition); land separate
// ---------------------------------------------------------------------------------------------

/** kind codes as exported by the pipeline (`binfo[j][2]`, see pipeline/build_pack.py building_info) */
export const BUILDING_KIND = { house: 0, apartments: 1, civic: 2, industrial: 3, minor: 4 } as const;

export interface BuildingKindRow {
  label: string;
  /** Building-only replacement-value estimate per m² floor, excluding plot, CZK — research/07 §2–3.
   * PROVISIONAL proxy for an appraisal, not the statutory valuation method. */
  pricePerM2: number;
  /** demolition incl. disposal per m² of floor area, CZK — research/07 §5 (Czech practice prices it per
   * m³ of built volume: ≈ 1,000 CZK/m³ for a house ≈ 3,000 per m² of floor) */
  demolitionPerM2: number;
  /** PROVISIONAL number of storeys when OSM has no building:levels */
  defaultLevels: number;
  /** PROVISIONAL cap on tagged building:levels (halls are valued by footprint; a few OSM values such
   * as 25 levels on a 400 m² industrial building are towers, silos or errors) */
  maxLevels: number;
  /** people live here: counts for the noise rule */
  dwelling: boolean;
}

export const BUILDING_KINDS: BuildingKindRow[] = [
  // house: researched replacement cost 50k (new construction 40–55k, recommended range 40–60k), EXCL. plot.
  // Do not use the similar Trutnov sale average ≈ 49,600, which includes the plot.
  /* house      */ { label: 'house', pricePerM2: 50_000, demolitionPerM2: 3_000, defaultLevels: 2, maxLevels: 12, dwelling: true },
  // apartments: PROVISIONAL building-only replacement proxy 55k; research/07 sale range 48–65.5k
  // is a cross-check, NOT a building-only appraisal. Demolition 3–8k for blocks.
  /* apartments */ { label: 'apartment block', pricePerM2: 55_000, demolitionPerM2: 4_000, defaultLevels: 4, maxLevels: 12, dwelling: true },
  // civic: replacement-cost basis 55,000 (range 40–80k), UNVERIFIED as a local benchmark
  /* civic      */ { label: 'civic building', pricePerM2: 55_000, demolitionPerM2: 4_000, defaultLevels: 2, maxLevels: 6, dwelling: false },
  // industrial / commercial: hall replacement ≈ 15,000 (9–25k) + business relocation (UNVERIFIED)
  /* industrial */ { label: 'industrial / commercial', pricePerM2: 20_000, demolitionPerM2: 1_500, defaultLevels: 1, maxLevels: 3, dwelling: false },
  // garages / sheds: PROVISIONAL building-only replacement estimate 15k, not the researched
  // 650k sale of a 20 m² garage (which includes land). Simple unheated structure; no local cost award.
  /* minor      */ { label: 'garage / shed', pricePerM2: 15_000, demolitionPerM2: 1_500, defaultLevels: 1, maxLevels: 2, dwelling: false },
];

export const BUILDING_RULES = {
  /** Act 416/2009 §3b(1b): buildings are bought at 1.5× the price set by an expert appraisal, which
   * §3b(2) sets at the usual (market) price — research/07 §1 */
  purchaseMultiplier: 1.5,
  /** PROVISIONAL working strip: a building closer than this to the footprint (slope edge at grade,
   * deck edge under a bridge) has to go as well, m */
  clearance: 3,
  /** PROVISIONAL noise-buyout plot allowance: max(3 × footprint, 400 m²), separate from the building.
   * Additional land at building-land price × 1.5; no cadastral boundaries / parcel overlap model. */
  buyoutPlotMultiple: 3,
  buyoutPlotMinimum: 400,
  /** GAME RULE: a small structure (chimney, silo, tower, shed: ≤ this many m² and ≤ hostedShare of the
   * other's area) standing wholly within a demolished building's outline is demolished with it — it is
   * part of the same works / plot and cannot stay standing in the middle of the cleared site. */
  hostedMaxArea: 200,
  hostedShare: 0.25,
};

// ---------------------------------------------------------------------------------------------
// Land inside built-up areas (OSM landuse residential / commercial / industrial / retail)
// ---------------------------------------------------------------------------------------------
export const URBAN_LAND = {
  /** usual price of serviced building land around Trutnov, CZK/m² (range 600–3,500) — research/07 §2–3 */
  buildingLandPerM2: 1_500,
  /** Act 416/2009 §3b(1b): building land is bought at 1.5× the appraised usual price (other land at 8×,
   * see LAND in prices.ts) */
  multiplier: 1.5,
};

// ---------------------------------------------------------------------------------------------
// Urban ("intravilán") construction rates — SFDI SPK CN 2026, research/data/spk-cn-2026-oceneni.csv
// ---------------------------------------------------------------------------------------------
export const URBAN_RATES = {
  /** "other objects" surcharge in built-up areas: B.1.2 … B.7.2 = 6 + 7.5 + 10 + 10 + 10 + 1.2 + 4.6 % */
  otherObjectsSurcharge: 0.493,
  /** A.3.R.2.NI.K bored 2-lane tunnel, urban, up to 500 m: CZK per km */
  tunnelShortPerKm: 2_203_693_000,
  /** A.3.R.2.NI.D bored 2-lane tunnel, urban, over 500 m: CZK per km */
  tunnelLongPerKm: 2_296_081_000,
};

/**
 * SPK CN road price per km inside built-up areas (…NIR flat+hilly, …NIH mountainous), "defined
 * standard". The motorway has no urban row: its rural price is used.
 */
export const URBAN_NORM_PER_KM: Record<CategoryId, { hilly: number; mountainous: number; codes: [string, string] }> = {
  'S7.5': { hilly: 42_883_000, mountainous: 48_046_000, codes: ['A.1.S2.7,5.NIR', 'A.1.S2.7,5.NIH'] },
  'S9.5': { hilly: 67_852_000, mountainous: 78_271_000, codes: ['A.1.S1.9,5.NIR', 'A.1.S1.9,5.NIH'] },
  'S11.5': { hilly: 82_035_000, mountainous: 94_666_000, codes: ['A.1.S1.11,5.NIR', 'A.1.S1.11,5.NIH'] },
  // Local road in town: M 11,5/7,5, the 7.5 m traffic space with pavements on both sides (SPK report p. 7).
  'M7.5': { hilly: 32_930_000, mountainous: 43_906_000, codes: ['A.1.M.11,5.NIR', 'A.1.M.11,5.NIH'] },
  // Track: SPK has no built-up row; its rural row is used.
  'P4': { hilly: 13_985_684.5, mountainous: 13_985_684.5, codes: ['A.1.P4.NE', 'A.1.P4.NE'] },
  'D27.5': { hilly: 187_632_000, mountainous: 214_512_000, codes: ['A.1.D.27,5.NER', 'A.1.D.27,5.NEH'] },
  // Railway: SPOŽES has no built-up row for track; its dense-area utility relocations (I01) apply instead.
  'R1': { hilly: railRouteBasePerKm(1, true), mountainous: railRouteBasePerKm(1, true), codes: ['SPOŽES 2026', 'SPOŽES 2026'] },
  'R2': { hilly: railRouteBasePerKm(2, true), mountainous: railRouteBasePerKm(2, true), codes: ['SPOŽES 2026', 'SPOŽES 2026'] },
  'D27.5-1': { hilly: 0.6 * 187_632_000, mountainous: 0.6 * 214_512_000, codes: ['60 % × A.1.D.27,5.NER', '60 % × A.1.D.27,5.NEH'] },
};

// ---------------------------------------------------------------------------------------------
// Crossings of existing roads
// ---------------------------------------------------------------------------------------------
export const CROSSING_RULES = {
  /** heuristic: grade this far above the crossed road → it passes under a bridge on our road
   * (4.8 m clearance for class I/II roads by ČSN 73 6201 + ≈ 1.2 m deck, UNVERIFIED) — research/08, m */
  overHeight: 6,
  /** heuristic: grade this far below the crossed road → an overbridge carries it across our cut, m */
  underDepth: 6,
  /** Billing only: ordinary-road crossings this close to A / B belong to the tie-in allowance, m.
   * Motorway/trunk structures still pay; NEVER suppress their clearance checks with this margin. */
  endMargin: 150,
  /** Hard-constraint exemption ONLY at an actual endpoint intersection (coordinate tolerance, m).
   * Allows joining the motorway at B; no exemption for another carriageway 20 m away. */
  endpointTolerance: 1,
  /** crossings closer together than this along the route are one crossing (dual carriageways, slip
   * roads, a junction lying on the route), m */
  mergeDistance: 30,
  /** repeated crossings of the same OSM way within this distance count once (a road weaving along the
   * route), m */
  sameWayMergeDistance: 150,
  /** ČSN 73 6101:2018, research/12 §2 (medium-high confidence). Includes A/B tie-ins;
   * also used in built-up areas as a scenario assumption, not a ČSN 73 6110 value. */
  junctionSpacing: 1500,
  /** PROVISIONAL economical Auto shortlist radius; geometry feedback can choose longer links. */
  linkMaxReach: 750,
  /** Shared hard station reach for manual links and Auto geometry fallback, not a bill cap. */
  linkHardReach: 2000,
  /** PROVISIONAL minimum realignment length per side, including the tie-in, m. */
  linkMinLength: 25,
};

export interface RoadClassRow {
  label: string;
  /** PROVISIONAL width of the crossed road carried by an overbridge, m */
  width: number;
  /** SPK CN bridge row used for the overbridge deck: CZK per km of bridge of that width */
  bridgePerKm: number;
  bridgeCode: string;
  /** Forces a bridge on our road when clearly above; minor tracks/accesses can instead divert.
   * All classes may use an overbridge if cheaper than a link. */
  separable: boolean;
  /** must be grade-separated (motorways, expressways): the grade has to clear it like a railway
   * (STRUCTURE_RULES.railClearance) or pass ≥ CROSSING_RULES.underDepth below it; anything in between
   * is a violation — research/08 "At-grade crossing of motorway / expressway" */
  noAtGrade?: boolean;
  /** Only class I–III through roads are candidates for a new at-grade junction. */
  junction?: boolean;
  /** SPK standard new-road CZK/km, rural / urban flat+hilly rows (approaches and links).
   * Includes standard road earthworks; no second embankment allowance is added. */
  roadPerKm: [number, number];
  roadCodes: [string, string];
  /** Steepest gradient of a rebuilt piece of this road: overbridge ramps, raised junction
   * approaches and relocated stretches. Ordinary (not exceptional) design maxima —
   * research/20: track 10 % (ČSN 73 6109 unpaved field track), service 9 % (ČSN 73 6110 group C,
   * which also governs public-purpose access roads, §8.1.4), streets/local roads 8 % (between
   * group C 9 % and D1 8.33 % justified), class III 7 % and class I/II 6 % (indicative older
   * ČSN 73 6101 table, S 7.5/S 9.5 in hilly terrain; unchanged game value for I/II). */
  rampGradient: number;
  /** Steepest a ramp may be where it follows the crossed road's own slope (justified-case maxima,
   * research/20): paved main field track 15 % (ČSN 73 6109), service roads and streets 12 % (ČSN 73
   * 6110 group C, justified cases), living streets 8 % (D1 justified 8.33 %), class III 9 % and class
   * I/II 7 % (older ČSN 73 6101 table, S 7.5 at 50 / 60 km/h; indicative). PROVISIONAL game rule. */
  rampSteepest: number;
  /** Box size when the way may pass through our embankment in a small underpass (research/19).
   * Class I–III roads keep bridges/junctions; motorways never. */
  underpass?: UnderpassSize;
}

/** PROVISIONAL research-informed estimate for a through-road junction, all-in: based on ŘSD
 * ROUNDABOUT awards (19.8–37.5 M), not an isolated T/X-junction contract (none found).
 * Recommended 25 M, range 15–35 M, low confidence — research/08; examples not escalated to 2026. */
export const JUNCTION = 25_000_000;
/** Scenario-declared connection of our route's end to a retained road (research/28). Inside the zone,
 * our earthworks over THAT road are the junction's own works, paid by `cost`; anything else still counts.
 * - roundabout arm: TP 135 (2017) §1.7.1 places the splitter island over 5–25 m of the arm before the
 *   entry. MODELLING ASSUMPTION: the arm's works reach as far as its longest splitter island; TP 135
 *   does not define an earthworks ownership length.
 * - merge (end-to-end join onto a retained carriageway): PROVISIONAL. ČSN 73 6102 tab. 35 rows for
 *   80/90 km/h were not verified; 90 m is the end taper (Lz) of a documented 130 km/h connector (MD
 *   technical report), used as an upper bound for a slower road.
 * Price: the all-in through-road junction allowance above (research/08, low confidence); no sourced
 * item for an arm on an existing roundabout or a merge, so both are PROVISIONAL reuses of it. */
export const ENDPOINT_JUNCTIONS = {
  'roundabout-arm': { zone: 25, cost: JUNCTION, source: 'TP 135 (2017) §1.7.1 arm splitter island ≤ 25 m; junction allowance, research/08 (PROVISIONAL)' },
  merge: { zone: 90, cost: JUNCTION, source: 'PROVISIONAL taper Lz 90 m (130 km/h connector, MD report); junction allowance, research/08 (PROVISIONAL)' },
  // A motorway end inside a motorway interchange (D3 0301 at the D0): the interchange's earth-built branches are
  // part of the motorway's SPK per-km norm (1 per 7 km, research/33 §3); the lump stands in for the roads it
  // rebuilds at our end. No sourced price for a system interchange exists (research/39).
  interchange: { zone: 90, cost: JUNCTION, source: 'PROVISIONAL taper Lz 90 m (130 km/h connector, MD report); junction allowance, research/08 (PROVISIONAL); earth-built branches in the SPK motorway norm' },
  // A new road's end joining an existing ground road at a priority T (research/29: the automatic form).
  // Zone: MODELLING ASSUMPTION, the mouth with its corner radii and any widening of the joined road;
  // ČSN 73 6102 corner radii and turning-lane lengths were not verified (research/29 §4), so the arm's
  // works are taken to reach as far as a roundabout arm's (TP 135 splitter island ≤ 25 m) plus 5 m.
  // Price: onto a class I/II road the all-in junction allowance (research/08, low confidence); onto a
  // class III/local/service road or track a simple T without turning lanes, 7 M CZK (midpoint of the
  // 5–10 M range, research/29 §6, PROVISIONAL, very low confidence).
  'tie-in': { zone: 30, cost: JUNCTION, source: 'priority T onto a class I/II road; junction allowance, research/08 (PROVISIONAL)' },
  'tie-in-minor': { zone: 30, cost: 7_000_000, source: 'simple priority T onto a minor road, 5–10 M CZK, research/29 (PROVISIONAL)' },
  // A roundabout where a road's end joins (the player's choice; Auto builds a T, research/29 §1).
  // Zone: a roundabout arm (TP 135 splitter island ≤ 25 m) plus the ring's radius at 40 m outer diameter,
  // the middle of the 30–50 m PROVISIONAL compact rural envelope (research/29 §4). Price: ŘSD awards for
  // roundabouts on class I roads, 32 M CZK, range 20–40 M (research/08, medium; also used on class II/III
  // roads, low confidence there). The ring's own land and any house on it are priced with the junction.
  roundabout: { zone: 45, cost: 32_000_000, source: 'roundabout, ŘSD awards 20–40 M CZK (research/08); 40 m ring PROVISIONAL (research/29)' },
  // A rebuilt stretch continuing as the old road beyond its end: the joint is part of the new
  // pavement, no junction is built. Same zone as a T (MODELLING ASSUMPTION), no lump cost.
  continuation: { zone: 30, cost: 0, continuation: true, source: 'the rebuilt stretch continues as the old road (MODELLING ASSUMPTION)' },
} as const;
export type EndpointJunctionKind = keyof typeof ENDPOINT_JUNCTIONS;
/** Simple sjezd onto the service link, NOT onto the class-I road. Very low confidence — research/13. */
export const ACCESS = 500_000;
/** A crossroads where our local road or track meets another minor road at the same level: what it adds to
 * the two pavements (research/43, PROVISIONAL; no separately priced Czech crossroads of this kind was found).
 * Two local roads: 1 M CZK, its extra paved area and edges at the MMR/ÚÚR 2025 local-road unit prices (low
 * confidence). A track meeting a track or service road: 0.25 M CZK, from KoPÚ track budgets (very low
 * confidence). A track meeting a local road (or a local road a track): the access above (research/13). */
export const MINOR_CROSSROADS = { local: 1_000_000, track: 250_000, mixed: ACCESS } as const;
const LOCAL_WAYS = new Set(['unclassified', 'residential', 'living_street']), TRACK_WAYS = new Set(['service', 'track']);
/** The crossroads where our minor road (`ours`: its category's `minor`) meets a crossed way of class `cls`
 * at grade, CZK; undefined when either is not a minor road. */
export function minorCrossroads(ours: 'local' | 'track' | undefined, cls: string): number | undefined {
  const theirs = LOCAL_WAYS.has(cls) ? 'local' : TRACK_WAYS.has(cls) ? 'track' : undefined;
  if (!ours || !theirs) return undefined;
  return theirs === ours ? MINOR_CROSSROADS[ours] : MINOR_CROSSROADS.mixed;
}
const LOCAL_ROAD = {
  roadPerKm: [24_133_000, 32_930_000] as [number, number],
  roadCodes: ['A.1.M.7,5.NER', 'A.1.M.11,5.NIR'] as [string, string],
};

/** keyed by OSM highway class (the pack's `net.cls` list); order = rank, most important first */
export const ROAD_CLASSES: Record<string, RoadClassRow> = {
  motorway: { label: 'motorway', width: 27.5, rampGradient: 0.04, rampSteepest: 0.04, bridgePerKm: 1_495_178_000, bridgeCode: 'A.2.D.27,5.N', separable: true, noAtGrade: true, roadPerKm: [187_632_000, 187_632_000], roadCodes: ['A.1.D.27,5.NER', 'A.1.D.27,5.NER'] },
  trunk: { label: 'expressway', width: 11.5, rampGradient: 0.05, rampSteepest: 0.05, bridgePerKm: 692_398_000, bridgeCode: 'A.2.S.11,5.N', separable: true, noAtGrade: true, roadPerKm: [68_894_000, 82_035_000], roadCodes: ['A.1.S1.11,5.NER', 'A.1.S1.11,5.NIR'] },
  primary: { label: 'class I road', width: 9.5, rampGradient: 0.06, rampSteepest: 0.07, bridgePerKm: 579_911_000, bridgeCode: 'A.2.S.9,5.N', separable: true, junction: true, roadPerKm: [56_912_000, 67_852_000], roadCodes: ['A.1.S1.9,5.NER', 'A.1.S1.9,5.NIR'] },
  secondary: { label: 'class II road', width: 7.5, rampGradient: 0.06, rampSteepest: 0.07, bridgePerKm: 481_621_000, bridgeCode: 'A.2.S.7,5.N', separable: true, junction: true, roadPerKm: [36_142_000, 42_883_000], roadCodes: ['A.1.S2.7,5.NER', 'A.1.S2.7,5.NIR'] },
  tertiary: { label: 'class III road', width: 6.5, rampGradient: 0.07, rampSteepest: 0.09, bridgePerKm: 432_476_000, bridgeCode: 'A.2.S.6,5.N', separable: true, junction: true, roadPerKm: [26_616_000, 34_903_000], roadCodes: ['A.1.S3.6,5.NER', 'A.1.S3.6,5.NIR'] },
  unclassified: { label: 'local road', width: 6.5, rampGradient: 0.08, rampSteepest: 0.12, bridgePerKm: 432_476_000, bridgeCode: 'A.2.S.6,5.N', separable: true, underpass: 'local', ...LOCAL_ROAD },
  residential: { label: 'street', width: 6.5, rampGradient: 0.08, rampSteepest: 0.12, bridgePerKm: 432_476_000, bridgeCode: 'A.2.S.6,5.N', separable: true, underpass: 'local', ...LOCAL_ROAD },
  living_street: { label: 'street', width: 6.5, rampGradient: 0.08, rampSteepest: 0.08, bridgePerKm: 432_476_000, bridgeCode: 'A.2.S.6,5.N', separable: true, underpass: 'local', ...LOCAL_ROAD },
  service: { label: 'service road', width: 4, rampGradient: 0.09, rampSteepest: 0.12, bridgePerKm: 309_613_000, bridgeCode: 'A.2.S.4,0.N', separable: false, underpass: 'track', ...LOCAL_ROAD },
  /** Paved P4 standard, not the unsupported 1.5 M/km gravel allowance (research/13).
   * Conservative for forest/unpaved tracks, but a reproducible SPK 2026 unit price. */
  track: { label: 'track', width: 4, rampGradient: 0.1, rampSteepest: 0.15, bridgePerKm: 309_613_000, bridgeCode: 'A.2.S.4,0.N', separable: false, underpass: 'track', roadPerKm: [13_985_684.5, 13_985_684.5], roadCodes: ['A.1.P4.NE', 'A.1.P4.NE'] },
};

// ---------------------------------------------------------------------------------------------
// Czech source + calibrated ground class, with PROVISIONAL geometric mitigation.
// Manuál 2018 (2020 revision), TP 219 (2019), NV 272/2011; research/11-noise-calculation.md.
// Compact planning calculation, NOT a full acoustic study / legal assessment.
// ---------------------------------------------------------------------------------------------
export const NOISE = {
  /** NV 272/2011 §12(3), annex 3 A: 50 base +10 for roads permitted after 2000, −10 at night.
   * Ordinary residential protected outdoor receivers; no old-road burden correction. */
  limitDayDb: 60,
  limitNightDb: 50,
  /** Manuál 2018 / verze 2020, table 21, class I, 2020 and subsequent forecast years.
   * Reference emission constants used with category speed factors, NOT individual sound powers. */
  lightEmissionDb: 74.1,
  heavyEmissionDb: 81.1,
  /** PROVISIONAL acoustic NA share (including buses/combinations and allocated light goods).
   * 15% scenario prior, not a local count: comparable studies vary substantially (research/11).
   * Night fractions are calculated per category by TP 219 table 3-2, non-E class I. */
  heavyShare: 0.15,
  /** Heavy vehicles capped at 80 km/h; light flow uses design speed (operating-speed assumption). */
  heavySpeed: 80,
  /** Manual §1.10/§2 categorical ground choice. Hard minimizes equal-weight EIA receiver
   * squared error versus mixed and has positive mean residual; no emission adjustment.
   * No continuous G or source-side split is prescribed here. Calibration caveats: research/11 §4. */
  ground: 'hard' as 'hard' | 'mixed',
  /** Manual §1.11 h: a wall is at least twice as long as the protected point's perpendicular distance
   * from it (replaces the former PROVISIONAL 50 m end margins; finite ends are now computed). */
  minWallLengthFactor: 2,
  /** A house's automatic wall is first sought within this route distance either side, m; the window doubles
   * whenever a wider one could change the choice (core/noise.ts), so this only sets the starting cost. */
  wallWindow: 150,
  /** Protected outdoor receiver: 2 m in front of the nearest façade, towards the source. */
  facadeOffset: 2,
  /** Automatic wall heights. 2.0 m stands on a D6 cut top and 2.0–5.5 m in its replacement (ŘSD/DESÚ
   * notice 2024, research/11 §6); 5 m top of the automatic menu is PROVISIONAL (player: 2–6 m). */
  wallHeights: [2, 3, 4, 5],
  /** The player's wall heights (every card offers these): the automatic ones and 6 m (PROVISIONAL top; the D6
   * replacement uses up to 5.5 m, research/11 §6). */
  playerWallHeights: [2, 3, 4, 5, 6],
  /** Propagation: calibrated equivalent near-lane line, m above grade / towards the receiver from the axis
   * (research/11 §3). */
  sourceHeight: 0.5,
  sourceOffset: 1.75,
  /** Barrier geometry: source on the axis of a two-lane road, 1 m above it (Manual 2018 §1.11 a). */
  barrierSourceHeight: 1,
  /** Wall at crown/2 + this on embankments and bridges (deck edge beam), at road level: PROVISIONAL
   * allowance outside the crown (TP 104/2024 §3.4: as close to the traffic as the restraint system
   * allows). In a cut the wall stands on the cut's top edge instead (never inside the slope). */
  wallEdgeOffset: 1.5,
  /** PROVISIONAL highest occupied receiver = 1.5 + (levels − 1) * 3 m above building ground. */
  receiverHeight: 1.5,
  storeyHeight: 3,
  /** PROVISIONAL research-informed calibrated recommendation, all-in per m², range 8,000–14,000.
   * Only project datapoint: ŘSD Radostín 2021, 280 m for 9 M ≈ 10,700/m² IF height is 3 m (assumed,
   * not sourced); not escalated to 2026. OTSKP 34712 panels alone 3,265 — research/09 §1. */
  wallPerM2: 10_000,
};
