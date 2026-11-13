// Built-up areas: buildings, building land, urban construction rates, crossings of existing roads,
// noise walls. 2026 price level, CZK excl. VAT. Everything marked PROVISIONAL is an invented
// placeholder (no open source found yet); the rest cites its source.

import type { CategoryId } from './categories';

// ---------------------------------------------------------------------------------------------
// Buildings in the footprint: floor area × market price × 1.5 + demolition
// ---------------------------------------------------------------------------------------------

/** kind codes as exported by the pipeline (`binfo[j][2]`, see pipeline/build_d11.py building_info) */
export const BUILDING_KIND = { house: 0, apartments: 1, civic: 2, industrial: 3, minor: 4 } as const;

export interface BuildingKindRow {
  label: string;
  /** PROVISIONAL market price per m² of floor area, CZK */
  pricePerM2: number;
  /** PROVISIONAL number of storeys when OSM has no building:levels */
  defaultLevels: number;
  /** people live here: counts for the noise rule */
  dwelling: boolean;
}

export const BUILDING_KINDS: BuildingKindRow[] = [
  /* house      */ { label: 'house', pricePerM2: 45_000, defaultLevels: 2, dwelling: true },
  /* apartments */ { label: 'apartment block', pricePerM2: 45_000, defaultLevels: 4, dwelling: true },
  /* civic      */ { label: 'civic building', pricePerM2: 45_000, defaultLevels: 2, dwelling: false },
  /* industrial */ { label: 'industrial / commercial', pricePerM2: 20_000, defaultLevels: 1, dwelling: false },
  /* minor      */ { label: 'garage / shed', pricePerM2: 10_000, defaultLevels: 1, dwelling: false },
];

export const BUILDING_RULES = {
  /** Act 416/2009 §3b: buildings are bought at 1.5× the appraised price (research/00 §3.3) */
  purchaseMultiplier: 1.5,
  /** PROVISIONAL demolition incl. disposal, CZK per m² of floor area (≈ 1,000 CZK per m³ built volume) */
  demolitionPerM2Floor: 3_000,
  /** tagged building:levels above this are treated as tagging errors (towers, chimneys) */
  maxLevels: 12,
};

// ---------------------------------------------------------------------------------------------
// Land inside built-up areas (OSM landuse residential / commercial / industrial / retail)
// ---------------------------------------------------------------------------------------------
export const URBAN_LAND = {
  /** PROVISIONAL market price of building land, CZK/m² */
  buildingLandPerM2: 1_500,
  /** Act 416/2009 §3b: building land is bought at 1.5× (other land at 8×, see LAND in prices.ts) */
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
  'D27.5': { hilly: 187_632_000, mountainous: 214_512_000, codes: ['A.1.D.27,5.NER', 'A.1.D.27,5.NEH'] },
};

// ---------------------------------------------------------------------------------------------
// Crossings of existing roads
// ---------------------------------------------------------------------------------------------
export const CROSSING_RULES = {
  /** PROVISIONAL: grade this far above the crossed road → it passes under a bridge on our road
   * (4.8 m clearance + ≈ 1.2 m deck), m */
  overHeight: 6,
  /** PROVISIONAL: grade this far below the crossed road → an overbridge carries it across our cut, m */
  underDepth: 6,
  /** crossings closer than this to A / B belong to the tie-in and are ignored, m */
  endMargin: 150,
  /** crossings closer together than this along the route are one crossing (dual carriageways, slip
   * roads, a junction lying on the route), m */
  mergeDistance: 30,
  /** repeated crossings of the same OSM way within this distance count once (a road weaving along the
   * route), m */
  sameWayMergeDistance: 150,
};

export interface RoadClassRow {
  label: string;
  /** PROVISIONAL width of the crossed road carried by an overbridge, m */
  width: number;
  /** SPK CN bridge row used for the overbridge deck: CZK per km of bridge of that width */
  bridgePerKm: number;
  bridgeCode: string;
  /** can be grade-separated (forced bridge on our road when clearly above, overbridge when clearly below) */
  separable: boolean;
  /** lump sum when the crossing is neither: junction, side-road reconnection or track diversion, CZK */
  atGrade: number;
  atGradeLabel: string;
}

/** SPK CN A.4.N grade-separated interchange (class I roads below S 20.75), each */
const INTERCHANGE = 76_700_900;
/** PROVISIONAL at-grade junction with a through road, all-in */
const JUNCTION = 12_000_000;
/** PROVISIONAL reconnection of a side street (short realignment + minor junction), all-in */
const SIDE_ROAD = 4_000_000;

/** keyed by OSM highway class (the pack's `net.cls` list); order = rank, most important first */
export const ROAD_CLASSES: Record<string, RoadClassRow> = {
  motorway: { label: 'motorway', width: 27.5, bridgePerKm: 1_495_178_000, bridgeCode: 'A.2.D.27,5.N', separable: true, atGrade: INTERCHANGE, atGradeLabel: 'interchange' },
  trunk: { label: 'expressway', width: 11.5, bridgePerKm: 692_398_000, bridgeCode: 'A.2.S.11,5.N', separable: true, atGrade: INTERCHANGE, atGradeLabel: 'interchange' },
  primary: { label: 'class I road', width: 9.5, bridgePerKm: 579_911_000, bridgeCode: 'A.2.S.9,5.N', separable: true, atGrade: JUNCTION, atGradeLabel: 'junction' },
  secondary: { label: 'class II road', width: 7.5, bridgePerKm: 481_621_000, bridgeCode: 'A.2.S.7,5.N', separable: true, atGrade: JUNCTION, atGradeLabel: 'junction' },
  tertiary: { label: 'class III road', width: 6.5, bridgePerKm: 432_476_000, bridgeCode: 'A.2.S.6,5.N', separable: true, atGrade: JUNCTION, atGradeLabel: 'junction' },
  unclassified: { label: 'local road', width: 6.5, bridgePerKm: 432_476_000, bridgeCode: 'A.2.S.6,5.N', separable: true, atGrade: SIDE_ROAD, atGradeLabel: 'side-road reconnection' },
  residential: { label: 'street', width: 6.5, bridgePerKm: 432_476_000, bridgeCode: 'A.2.S.6,5.N', separable: true, atGrade: SIDE_ROAD, atGradeLabel: 'side-road reconnection' },
  living_street: { label: 'street', width: 6.5, bridgePerKm: 432_476_000, bridgeCode: 'A.2.S.6,5.N', separable: true, atGrade: SIDE_ROAD, atGradeLabel: 'side-road reconnection' },
  /** PROVISIONAL: driveways and yard roads are reconnected along the new road, never bridged */
  service: { label: 'service road', width: 4, bridgePerKm: 309_613_000, bridgeCode: 'A.2.S.4,0.N', separable: false, atGrade: 1_000_000, atGradeLabel: 'access reconnection' },
  /** PROVISIONAL: field and forest tracks are diverted to the nearest crossing */
  track: { label: 'track', width: 4, bridgePerKm: 309_613_000, bridgeCode: 'A.2.S.4,0.N', separable: false, atGrade: 500_000, atGradeLabel: 'track diversion' },
};

// ---------------------------------------------------------------------------------------------
// Noise walls — PROVISIONAL screening rule standing in for a real noise calculation
// ---------------------------------------------------------------------------------------------
export const NOISE = {
  /** Czech limits for main roads (Government Regulation 272/2011): 60 dB day, 50 dB night — context
   * only, the rule below does not compute levels */
  limitDayDb: 60,
  limitNightDb: 50,
  /** PROVISIONAL: dwellings within this distance of the road need a wall, at the reference traffic
   * and design speed, m */
  refDistance: 100,
  refTraffic: 9_000,
  refSpeed: 90,
  /** PROVISIONAL scaling D = refDistance · (Q/Q₀)^(2/3) · (v/v₀)^(5/3): +3 dB per doubling of traffic,
   * ≈ 25·log₁₀(v) dB with speed, −4.5 dB per doubling of distance (line source over soft ground) */
  trafficExponent: 2 / 3,
  speedExponent: 5 / 3,
  /** wall extends this far beyond the exposed stretch, m */
  margin: 50,
  /** no wall on a side where the cut edge is at least this far above the road (the cut screens), m */
  cutShield: 4,
  /** PROVISIONAL wall height, m */
  wallHeight: 3,
  /** PROVISIONAL all-in price per m² of wall (OTSKP 2026 item 34712 reinforced-concrete wall panels
   * alone: 3,265 CZK/m²; posts and foundations are extra) */
  wallPerM2: 8_000,
};
