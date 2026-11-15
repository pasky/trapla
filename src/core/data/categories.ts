import { RAILWAY_EVIDENCE, railRouteBasePerKm, SPOZES, TRACK_CENTRES_M } from './railway';
// Route categories as data rows (policy rows): the road Type list offers the single-carriageway S rows;
// the D 27.5 row is the paired motorway corridor (mode 'motorway'), never offered as a road width.
//
// Sources: SFDI SPK CN 2026 (research/data/spk-cn-2026-oceneni.csv), "defined standard" column, CZK
// excl. VAT, 2026 price level. ČSN 73 6101 (2018) design speeds per research/00 §4.1.

export type CategoryId = 'S7.5' | 'S9.5' | 'S11.5' | 'D27.5' | 'D27.5-1' | 'R1' | 'R2';
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
  /** Category's own max longitudinal gradient by terrain class; absent = the scenario's road value. */
  maxGradient?: Record<TerrainClass, number>;
  /** crown width (koruna), m */
  crownWidth: number;
  /** design speeds the player may pick, km/h (base speed lowered by 10 or 20 where justified) */
  speeds: number[];
  /** road class used for the earthworks allowance included in the norm */
  roadClass: 'I' | 'II' | 'motorway' | 'motorway-carriageway' | 'rail';
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
  /** two carriageways about the spine (motorway): see data/motorway.ts D275_SECTION */
  paired?: boolean;
  /** railway: number of tracks (drawn and priced per track) */
  tracks?: 1 | 2;
  /** Price-book markups by kind of work, replacing SPK's "other objects" surcharge (railway: SPOŽES P1). */
  markup?: { base: number; earth: number; bridge: number; tunnel: number };
  /** Own tunnel price per km of tube (railway: SPOŽES J rows), replacing the SPK road tube rows. */
  tunnelPerKm?: { rural: number; urban: number };
  /** one carriageway of a split motorway; its axis is the middle of its half of the formation, the
   * median lies on its left (the travel direction's inside) */
  carriageway?: boolean;
}

export const CATEGORIES: Record<CategoryId, Category> = {
  'S7.5': {
    id: 'S7.5', mode: 'road', label: 'S 7.5 (class II road)', enabled: true, crownWidth: 7.5,
    speeds: [90, 80, 70], roadClass: 'II',
    normPerKm: { hilly: 36_142_000, mountainous: 41_448_000 },
    normCodes: { hilly: 'A.1.S2.7,5.NER', mountainous: 'A.1.S2.7,5.NEH' },
    bridgePerKm: 481_621_000, bridgeCode: 'A.2.S.7,5.N', tunnelTubes: 1,
    section: { lane: 3.0, hardShoulder: 0.25, edgeLine: 0.125, centreLine: 0.125, dash: 3, gap: 6 },
  },
  'S9.5': {
    id: 'S9.5', mode: 'road', label: 'S 9.5 (class I road)', enabled: true, crownWidth: 9.5,
    speeds: [90, 80, 70], roadClass: 'I',
    normPerKm: { hilly: 56_912_000, mountainous: 67_982_000 },
    normCodes: { hilly: 'A.1.S1.9,5.NER', mountainous: 'A.1.S1.9,5.NEH' },
    bridgePerKm: 579_911_000, bridgeCode: 'A.2.S.9,5.N', tunnelTubes: 1,
    section: { lane: 3.5, hardShoulder: 0.75, edgeLine: 0.25, centreLine: 0.125, dash: 3, gap: 6 },
  },
  'S11.5': {
    id: 'S11.5', mode: 'road', label: 'S 11.5 (class I road)', enabled: true, crownWidth: 11.5,
    speeds: [90, 80, 70], roadClass: 'I',
    normPerKm: { hilly: 68_894_000, mountainous: 82_163_000 },
    normCodes: { hilly: 'A.1.S1.11,5.NER', mountainous: 'A.1.S1.11,5.NEH' },
    bridgePerKm: 692_398_000, bridgeCode: 'A.2.S.11,5.N', tunnelTubes: 1,
    section: { lane: 3.5, hardShoulder: 1.75, edgeLine: 0.25, centreLine: 0.125, dash: 3, gap: 6 },
  },
  // Paired motorway corridor: VL 1 sheet 11-02 widths (data/motorway.ts), whole-category SPK norm
  // (both carriageways, earth-built interchange branches at 1 per 7 km included, research/33 §3),
  // D27.5 bridge row per km of the average of the two parallel bridges, one 2-lane tube per direction.
  'D27.5': {
    id: 'D27.5', mode: 'motorway', label: 'D 27.5 (motorway)', enabled: false, crownWidth: 27.5, paired: true, gradeSeparated: true,
    // PROVISIONAL: older-edition ČSN 73 6101 D26.5/D27.5 maxima (VUT "Aplikace ČSN 73 6101" p. 10: 4 % hilly,
    // 4.5 % mountainous); current 2018 values not found in public sources (research/22 §2, research/33 §1).
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
    maxGradient: { hilly: 0.04, mountainous: 0.045 },
    speeds: [130, 120, 110], roadClass: 'motorway-carriageway',
    normPerKm: { hilly: 0.6 * 187_632_000, mountainous: 0.6 * 214_512_000 },
    normCodes: { hilly: '60 % × A.1.D.27,5.NER', mountainous: '60 % × A.1.D.27,5.NEH' },
    bridgePerKm: 1_495_178_000 / 2, bridgeCode: '½ × A.2.D.27,5.N', tunnelTubes: 1,
  },
  // New electrified (25 kV) conventional line, mixed traffic, ≤ 160 km/h. Formation: SŽDC S3 X fig. 4
  // uncanted single-track half-width 3.1 m (research/23); double track adds the PROVISIONAL 4.0 m track
  // centres (data/railway.ts). Base per route-km and structures: SPOŽES 2026 items (data/railway.ts);
  // bridge = H02 per m² over the formation width (PROVISIONAL deck width); double track: one 2-track tube.
  'R1': {
    id: 'R1', mode: 'railway', label: 'Single-track railway', enabled: false, crownWidth: 2 * RAILWAY_EVIDENCE.uncantedFormationHalfWidthM,
    tracks: 1, gradeSeparated: true, speeds: [160, 140, 120], roadClass: 'rail', maxGradient: { hilly: 0.04, mountainous: 0.04 },
    normPerKm: { hilly: railRouteBasePerKm(1), mountainous: railRouteBasePerKm(1) },
    normCodes: { hilly: 'SPOŽES 2026', mountainous: 'SPOŽES 2026' },
    bridgePerKm: SPOZES.bridgeLongPerM2 * 2 * RAILWAY_EVIDENCE.uncantedFormationHalfWidthM * 1000, bridgeCode: 'SPOŽES H02', tunnelTubes: 1,
    tunnelPerKm: { rural: SPOZES.tunnelSinglePerKm, urban: SPOZES.tunnelSingleUrbanPerKm },
    markup: { base: 0, earth: SPOZES.markup.substructure, bridge: SPOZES.markup.bridges, tunnel: SPOZES.markup.tunnels },
  },
  'R2': {
    id: 'R2', mode: 'railway', label: 'Double-track railway', enabled: false, crownWidth: 2 * RAILWAY_EVIDENCE.uncantedFormationHalfWidthM + TRACK_CENTRES_M,
    tracks: 2, gradeSeparated: true, speeds: [160, 140, 120], roadClass: 'rail', maxGradient: { hilly: 0.04, mountainous: 0.04 },
    normPerKm: { hilly: railRouteBasePerKm(2), mountainous: railRouteBasePerKm(2) },
    normCodes: { hilly: 'SPOŽES 2026', mountainous: 'SPOŽES 2026' },
    bridgePerKm: SPOZES.bridgeLongPerM2 * (2 * RAILWAY_EVIDENCE.uncantedFormationHalfWidthM + TRACK_CENTRES_M) * 1000, bridgeCode: 'SPOŽES H02', tunnelTubes: 1,
    tunnelPerKm: { rural: SPOZES.tunnelDoublePerKm, urban: SPOZES.tunnelDoubleUrbanPerKm },
    markup: { base: 0, earth: SPOZES.markup.substructure, bridge: SPOZES.markup.bridges, tunnel: SPOZES.markup.tunnels },
  },
};

export const PLAYABLE_CATEGORIES: CategoryId[] = (Object.keys(CATEGORIES) as CategoryId[])
  .filter((k) => CATEGORIES[k].enabled);
