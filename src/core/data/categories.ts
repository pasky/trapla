import { RAIL_MAX_GRADIENT, RAILWAY_EVIDENCE, railEverywherePerKm, railRouteBasePerKm, SPOZES, TRACK_CENTRES_M } from './railway';
// Route categories as data rows (policy rows): the road Type list offers the single-carriageway S rows;
// the D 27.5 row is the paired motorway corridor (mode 'motorway'), never offered as a road width.
//
// Sources: SFDI SPK CN 2026 (research/data/spk-cn-2026-oceneni.csv), "defined standard" column, CZK
// excl. VAT, 2026 price level. ČSN 73 6101 (2018) design speeds per research/00 §4.1.

export type CategoryId = 'S7.5' | 'S9.5' | 'S11.5' | 'M7.5' | 'P4' | 'D27.5' | 'D27.5-1' | 'S21.5' | 'S21.5-1' | 'R1' | 'R2';
/** A divided road built as a paired corridor (mode 'motorway'): the corridor's category; `carriagewayOf` its one direction. */
export type PairedCategoryId = 'D27.5' | 'S21.5';
/** Legal class of a road (who owns it; the cross-section is chosen separately). */
export type LegalClass = 'I' | 'II' | 'III' | 'local' | 'service' | 'track';
export type TerrainClass = 'hilly' | 'mountainous';

/**
 * Two-lane cross-section inside the crown, per side of the axis (drawn by the renderer: lanes, hard
 * shoulder, gravel verge, painted lines). MD VL 1 (2022) sheets 12-04 … 12-06: lane `a`, hard shoulder `c`
 * (its inner 0.25 m is the guide strip, vodicí proužek), unpaved verge `e` = 0.50 m counted in the crown.
 * Markings, TP 133 (2013): edge line V 4 on the inner edge of the guide strip, 0.25 m wide where the
 * hard shoulder is wider than 0.5 m, otherwise 0.125 m; centre line V 2a 3 m dash / 6 m gap, 0.125 m
 * (outside motorways). Solid V 1a needs sight distances, which are not modelled: always V 2a.
 */
export interface CrossSection {
  lane: number;
  hardShoulder: number;
  edgeLine: number;
  centreLine: number;
  dash: number;
  gap: number;
}

export interface Category {
  id: CategoryId;
  label: string;
  /** offered in the road Type list (single-carriageway roads only) */
  enabled: boolean;
  /** infrastructure kind: decides norms, junction rules, noise source and drawing (core/mode-policy.ts) */
  mode: 'road' | 'motorway' | 'railway';
  /** No at-grade junction or access anywhere along the route: every crossed road is grade-separated or
   * rerouted to such a crossing, never to the route's ends (motorway: ČSN 73 6101, research/08). */
  gradeSeparated?: boolean;
  /** Category's own max longitudinal gradient by terrain class; absent = the scenario's road value.
   * Roads and motorways: ČSN 73 6101:2018 table by category × terrain (flat / hilly / mountainous), scanned in
   * Šilhan, ČVUT FD thesis 2021, tab. 8 (research/47 §1.1); the game's terrain classes are hilly and mountainous. */
  maxGradient?: Record<TerrainClass, number>;
  /** crown width (koruna), m */
  crownWidth: number;
  /** design speeds the player may pick, km/h (base speed lowered by 10 or 20 where justified) */
  speeds: number[];
  /** road class used for the earthworks allowance included in the norm */
  roadClass: 'I' | 'II' | 'motorway' | 'motorway-carriageway' | 'divided' | 'divided-carriageway' | 'rail' | 'local' | 'track';
  /** Built under the local-road norm ČSN 73 6110 ('local') or the field-track norm ČSN 73 6109 ('track')
   * instead of ČSN 73 6101: own speed rows (data/norms.ts), no junction spacing (research/42). */
  minor?: 'local' | 'track';
  /** Single-carriageway roads: the legal classes this cross-section may carry, the first when a road is
   * switched to it (S 7.5: class II/III, S 9.5: I/II, S 11.5: I; research/42 for the minor rows). */
  legalClasses?: LegalClass[];
  /** SPK CN road price per km, CZK. 'hilly' = flat+hilly rows (…NER), 'mountainous' = …NEH */
  normPerKm: Record<TerrainClass, number>;
  normCodes: Record<TerrainClass, string>;
  /** SPK CN bridge price per km of bridge, CZK */
  bridgePerKm: number;
  bridgeCode: string;
  /** number of tunnel tubes for this category (motorway = 2) */
  tunnelTubes: number;
  /** lanes and markings of a single carriageway */
  section?: CrossSection;
  /** two carriageways about the spine (motorway): see data/motorway.ts PAIRED_SECTIONS */
  paired?: boolean;
  /** A share of another category's norm (one direction of a split motorway: 60 % of D 27.5); its
   * earthwork allowance is the same share of that category's allowance. */
  normShareOf?: { category: CategoryId; share: number };
  /** Railway: per-km items charged on every metre incl. bridges and tunnels (track, catenary, signalling,
   * telecoms, utilities); the rest of `normPerKm` (sleeper-bed layers, ditches) is ground-only. */
  everywherePerKm?: { rural: number; urban: number };
  /** railway: number of tracks (drawn and priced per track) */
  tracks?: 1 | 2;
  /** Price-book markups by kind of work, replacing SPK's "other objects" surcharge (railway: SPOŽES P1). */
  markup?: { base: number; earth: number; bridge: number; tunnel: number };
  /** Own tunnel price per km of tube (railway: SPOŽES J rows), replacing the SPK road tube rows. */
  tunnelPerKm?: { rural: number; urban: number };
  /** one carriageway of a split motorway; its axis is the middle of its half of the formation, the
   * median lies on its left (the travel direction's inside) */
  carriageway?: boolean;
  /** A paired corridor's one direction (its category when split), and back from a direction to its corridor. */
  carriagewayOf?: CategoryId;
  pairedOf?: PairedCategoryId;
  /** A motorway in law (dálnice), not only in build: a protected landscape area takes none (zákon 114/1992
   * §26(1)(f), research/75). A divided class I road (S 21.5) is built the same way but is not one. */
  motorwayByLaw?: boolean;
}

export const CATEGORIES: Record<CategoryId, Category> = {
  'S7.5': {
    id: 'S7.5', mode: 'road', label: 'S 7.5 (class II road)', enabled: true, crownWidth: 7.5,
    speeds: [90, 80, 70], roadClass: 'II', legalClasses: ['II', 'III'], maxGradient: { hilly: 0.07, mountainous: 0.09 },
    normPerKm: { hilly: 36_142_000, mountainous: 41_448_000 },
    normCodes: { hilly: 'A.1.S2.7,5.NER', mountainous: 'A.1.S2.7,5.NEH' },
    bridgePerKm: 481_621_000, bridgeCode: 'A.2.S.7,5.N', tunnelTubes: 1,
    section: { lane: 3.0, hardShoulder: 0.25, edgeLine: 0.125, centreLine: 0.125, dash: 3, gap: 6 },
  },
  'S9.5': {
    id: 'S9.5', mode: 'road', label: 'S 9.5 (class I road)', enabled: true, crownWidth: 9.5,
    speeds: [90, 80, 70], roadClass: 'I', legalClasses: ['I', 'II'], maxGradient: { hilly: 0.06, mountainous: 0.08 },
    normPerKm: { hilly: 56_912_000, mountainous: 67_982_000 },
    normCodes: { hilly: 'A.1.S1.9,5.NER', mountainous: 'A.1.S1.9,5.NEH' },
    bridgePerKm: 579_911_000, bridgeCode: 'A.2.S.9,5.N', tunnelTubes: 1,
    section: { lane: 3.5, hardShoulder: 0.75, edgeLine: 0.25, centreLine: 0.125, dash: 3, gap: 6 },
  },
  'S11.5': {
    id: 'S11.5', mode: 'road', label: 'S 11.5 (class I road)', enabled: true, crownWidth: 11.5,
    speeds: [90, 80, 70], roadClass: 'I', legalClasses: ['I'], maxGradient: { hilly: 0.06, mountainous: 0.075 },
    normPerKm: { hilly: 68_894_000, mountainous: 82_163_000 },
    normCodes: { hilly: 'A.1.S1.11,5.NER', mountainous: 'A.1.S1.11,5.NEH' },
    bridgePerKm: 692_398_000, bridgeCode: 'A.2.S.11,5.N', tunnelTubes: 1,
    section: { lane: 3.5, hardShoulder: 1.75, edgeLine: 0.25, centreLine: 0.125, dash: 3, gap: 6 },
  },
  // Two-lane local road (ČSN 73 6110 functional group C, research/42): SPK 2026 local-road rows, outside
  // built-up areas M 7,5/7,5 (main traffic space 7.5 m); inside them M 11,5/7,5 (data/urban.ts, its two
  // pavements are priced but not drawn). Bridge: the S 7.5 deck row (no local-road bridge row; same deck
  // width). Lanes: PROVISIONAL 3.0 m (§8.2.2 allows 2.75–3.50 m) with the S 7.5 strips, so 7.5 m in all.
  'M7.5': {
    id: 'M7.5', mode: 'road', label: 'M 7.5 (local road)', enabled: true, crownWidth: 7.5, minor: 'local',
    speeds: [50, 40, 30], roadClass: 'local', legalClasses: ['local', 'service'],
    // ČSN 73 6110 tab. 12, group C: 9 % ordinary; 12 % in justified cases (mountainous terrain taken as one)
    maxGradient: { hilly: 0.09, mountainous: 0.12 },
    normPerKm: { hilly: 24_133_000, mountainous: 32_079_000 },
    normCodes: { hilly: 'A.1.M.7,5.NER', mountainous: 'A.1.M.7,5.NEH' },
    bridgePerKm: 481_621_000, bridgeCode: 'A.2.S.7,5.N', tunnelTubes: 1,
    section: { lane: 3.0, hardShoulder: 0.25, edgeLine: 0.125, centreLine: 0.125, dash: 3, gap: 6 },
  },
  // One-lane paved track, ČSN 73 6109 category P 4,0/30 (main) or P 4,0/20 (secondary), free width 4.0 m
  // including 2 × 0.5 m verges (research/42). SPK 2026 A.1.P4.NE everywhere (no mountainous or built-up
  // row) and the P 4 bridge row. One 3 m lane, no markings.
  'P4': {
    id: 'P4', mode: 'road', label: 'P 4.0 (one-lane track)', enabled: true, crownWidth: 4, minor: 'track',
    speeds: [30, 20], roadClass: 'track', legalClasses: ['track', 'service'],
    // ČSN 73 6109 tab. 3: paved 15 % at 30 km/h (18 % at 20 km/h, not used: one value per road)
    maxGradient: { hilly: 0.15, mountainous: 0.15 },
    normPerKm: { hilly: 13_985_684.5, mountainous: 13_985_684.5 },
    normCodes: { hilly: 'A.1.P4.NE', mountainous: 'A.1.P4.NE' },
    bridgePerKm: 304_735_878.7401868, bridgeCode: 'A.2.P.4.N', tunnelTubes: 1,
    section: { lane: 1.5, hardShoulder: 0, edgeLine: 0, centreLine: 0, dash: 3, gap: 6 },
  },
  // Paired motorway corridor: VL 1 sheet 11-02 widths (data/motorway.ts), whole-category SPK norm
  // (both carriageways, earth-built interchange branches at 1 per 7 km included, research/33 §3),
  // D27.5 bridge row per km of the average of the two parallel bridges, one 2-lane tube per direction.
  'D27.5': {
    id: 'D27.5', mode: 'motorway', label: 'D 27.5 (motorway)', enabled: false, crownWidth: 27.5, paired: true, gradeSeparated: true,
    carriagewayOf: 'D27.5-1', motorwayByLaw: true,
    // ČSN 73 6101:2018 D 27.5: 4 % hilly, 4.5 % mountainous (exceeding needs the road authority's consent)
    maxGradient: { hilly: 0.04, mountainous: 0.045 },
    speeds: [130, 120, 110], roadClass: 'motorway',
    normPerKm: { hilly: 187_632_000, mountainous: 214_512_000 },
    normCodes: { hilly: 'A.1.D.27,5.NER', mountainous: 'A.1.D.27,5.NEH' },
    bridgePerKm: 1_495_178_000, bridgeCode: 'A.2.D.27,5.N', tunnelTubes: 2,
  },
  // One direction of a split motorway: half the D 27.5 formation (half median + inner shoulder + 2 lanes
  // + hard shoulder + verge = 13.75 m), so two of them side by side tile the paired formation exactly.
  // Price: SPK 2026 report p. 7, "half of a future divided road" = 60 % of the category norm (built as its
  // own body). Where the two run side by side as one formation, the corridor ledger charges 50 % each
  // (core/project-motorway.ts). Bridge: the D27.5 row per m² of deck (half the row over half the width);
  // one 2-lane tube.
  'D27.5-1': {
    id: 'D27.5-1', mode: 'motorway', label: 'D 27.5 (one direction)', enabled: false, crownWidth: 13.75, carriageway: true, gradeSeparated: true,
    pairedOf: 'D27.5', motorwayByLaw: true,
    normShareOf: { category: 'D27.5', share: 0.6 },
    maxGradient: { hilly: 0.04, mountainous: 0.045 },
    speeds: [130, 120, 110], roadClass: 'motorway-carriageway',
    normPerKm: { hilly: 0.6 * 187_632_000, mountainous: 0.6 * 214_512_000 },
    normCodes: { hilly: '60 % × A.1.D.27,5.NER', mountainous: '60 % × A.1.D.27,5.NEH' },
    bridgePerKm: 1_495_178_000 / 2, bridgeCode: '½ × A.2.D.27,5.N', tunnelTubes: 1,
  },
  // Four-lane divided class I road (silnice I. třídy), built as a paired corridor like the motorway but not a
  // motorway in law (research/89 §6). Widths: MD VL 1 (2022) sheet 11-06 "D a S 21,5" (data/motorway.ts
  // S215_SECTION). Design speed 110, lowered by 10 or 20 in justified cases (Radimský 2019 slide 4); radii and
  // vertical radii by speed as for every category (data/norms.ts). Max gradient ČSN 73 6101:2018 (Zavadil, UTB
  // thesis 2023, tab. 12): S 21.5 4 % flat, 4.5 % (up to 6 %) hilly, 6 % mountainous. Price: SPK 2026 has no
  // S 21.5 row; its D 21.5 rows (the same VL 1 cross-section; the ŘSD study of the I/35 prices its S 21.5 stretch
  // with "A.1.D.21,5.NER - DÁLNICE (D 21,5)", research/89 §6), the D 21.5 bridge row, one 2-lane tube per direction.
  'S21.5': {
    id: 'S21.5', mode: 'motorway', label: 'S 21.5 (four-lane road)', enabled: false, crownWidth: 21.5, paired: true, gradeSeparated: true,
    carriagewayOf: 'S21.5-1',
    maxGradient: { hilly: 0.045, mountainous: 0.06 },
    speeds: [110, 100, 90], roadClass: 'divided',
    normPerKm: { hilly: 146_694_000, mountainous: 167_028_000 },
    normCodes: { hilly: 'A.1.D.21,5.NER', mountainous: 'A.1.D.21,5.NEH' },
    bridgePerKm: 1_194_135_000, bridgeCode: 'A.2.D.21,5.N', tunnelTubes: 2,
  },
  // One direction of a split S 21.5: half its formation (10.75 m), 60 % of its norm as for 'D27.5-1'.
  'S21.5-1': {
    id: 'S21.5-1', mode: 'motorway', label: 'S 21.5 (one direction)', enabled: false, crownWidth: 10.75, carriageway: true, gradeSeparated: true,
    pairedOf: 'S21.5', normShareOf: { category: 'S21.5', share: 0.6 },
    maxGradient: { hilly: 0.045, mountainous: 0.06 },
    speeds: [110, 100, 90], roadClass: 'divided-carriageway',
    normPerKm: { hilly: 0.6 * 146_694_000, mountainous: 0.6 * 167_028_000 },
    normCodes: { hilly: '60 % × A.1.D.21,5.NER', mountainous: '60 % × A.1.D.21,5.NEH' },
    bridgePerKm: 1_194_135_000 / 2, bridgeCode: '½ × A.2.D.21,5.N', tunnelTubes: 1,
  },
  // New electrified (25 kV) conventional line, mixed traffic, ≤ 160 km/h. Formation: SŽDC S3 X fig. 4
  // uncanted single-track half-width 3.1 m (research/23); double track adds the PROVISIONAL 4.0 m track
  // centres (data/railway.ts). Base per route-km and structures: SPOŽES 2026 items (data/railway.ts);
  // bridge = H02 per m² over the formation width (PROVISIONAL deck width); double track: one 2-track tube.
  'R1': {
    id: 'R1', mode: 'railway', label: 'Single-track railway', enabled: false, crownWidth: 2 * RAILWAY_EVIDENCE.uncantedFormationHalfWidthM,
    tracks: 1, gradeSeparated: true, speeds: [160, 140, 120], roadClass: 'rail', maxGradient: { hilly: RAIL_MAX_GRADIENT, mountainous: RAIL_MAX_GRADIENT },
    normPerKm: { hilly: railRouteBasePerKm(1), mountainous: railRouteBasePerKm(1) }, everywherePerKm: { rural: railEverywherePerKm(1), urban: railEverywherePerKm(1, true) },
    normCodes: { hilly: 'SPOŽES 2026', mountainous: 'SPOŽES 2026' },
    bridgePerKm: SPOZES.bridgeLongPerM2 * 2 * RAILWAY_EVIDENCE.uncantedFormationHalfWidthM * 1000, bridgeCode: 'SPOŽES H02', tunnelTubes: 1,
    tunnelPerKm: { rural: SPOZES.tunnelSinglePerKm, urban: SPOZES.tunnelSingleUrbanPerKm },
    markup: { base: 0, earth: SPOZES.markup.substructure, bridge: SPOZES.markup.bridges, tunnel: SPOZES.markup.tunnels },
  },
  'R2': {
    id: 'R2', mode: 'railway', label: 'Double-track railway', enabled: false, crownWidth: 2 * RAILWAY_EVIDENCE.uncantedFormationHalfWidthM + TRACK_CENTRES_M,
    tracks: 2, gradeSeparated: true, speeds: [160, 140, 120], roadClass: 'rail', maxGradient: { hilly: RAIL_MAX_GRADIENT, mountainous: RAIL_MAX_GRADIENT },
    normPerKm: { hilly: railRouteBasePerKm(2), mountainous: railRouteBasePerKm(2) }, everywherePerKm: { rural: railEverywherePerKm(2), urban: railEverywherePerKm(2, true) },
    normCodes: { hilly: 'SPOŽES 2026', mountainous: 'SPOŽES 2026' },
    bridgePerKm: SPOZES.bridgeLongPerM2 * (2 * RAILWAY_EVIDENCE.uncantedFormationHalfWidthM + TRACK_CENTRES_M) * 1000, bridgeCode: 'SPOŽES H02', tunnelTubes: 1,
    tunnelPerKm: { rural: SPOZES.tunnelDoublePerKm, urban: SPOZES.tunnelDoubleUrbanPerKm },
    markup: { base: 0, earth: SPOZES.markup.substructure, bridge: SPOZES.markup.bridges, tunnel: SPOZES.markup.tunnels },
  },
};

/** The paired corridor a category belongs to (itself, or the corridor of one direction); none for other roads. */
export function pairedCategoryOf(id: CategoryId): PairedCategoryId | undefined {
  const c = CATEGORIES[id];
  return c.paired ? id as PairedCategoryId : c.pairedOf;
}

/** Single-carriageway road cross-sections a road (RoadSpec.crossSection) may have. */
export const ROAD_CROSS_SECTIONS = (Object.keys(CATEGORIES) as CategoryId[]).filter((k) => CATEGORIES[k].legalClasses);
export const PLAYABLE_CATEGORIES: CategoryId[] = (Object.keys(CATEGORIES) as CategoryId[])
  .filter((k) => CATEGORIES[k].enabled);
