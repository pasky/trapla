// Road categories as data rows. v1 plays only single-carriageway S categories; the motorway row is
// kept (disabled) to show where future categories plug in.
//
// Sources: SFDI SPK CN 2026 (research/data/spk-cn-2026-oceneni.csv), "defined standard" column, CZK
// excl. VAT, 2026 price level. ČSN 73 6101 (2018) design speeds per research/00 §4.1.

export type CategoryId = 'S7.5' | 'S9.5' | 'S11.5' | 'D27.5';
export type TerrainClass = 'hilly' | 'mountainous';

export interface Category {
  id: CategoryId;
  label: string;
  enabled: boolean;
  /** crown width (koruna), m */
  crownWidth: number;
  /** design speeds the player may pick, km/h (base speed lowered by 10 or 20 where justified) */
  speeds: number[];
  /** road class used for the earthworks allowance included in the norm */
  roadClass: 'I' | 'II' | 'motorway';
  /** SPK CN road price per km, CZK. 'hilly' = flat+hilly rows (…NER), 'mountainous' = …NEH */
  normPerKm: Record<TerrainClass, number>;
  normCodes: Record<TerrainClass, string>;
  /** SPK CN bridge price per km of bridge, CZK */
  bridgePerKm: number;
  bridgeCode: string;
  /** number of tunnel tubes for this category (motorway = 2) */
  tunnelTubes: number;
}

export const CATEGORIES: Record<CategoryId, Category> = {
  'S7.5': {
    id: 'S7.5', label: 'S 7.5 (class II road)', enabled: true, crownWidth: 7.5,
    speeds: [90, 80, 70], roadClass: 'II',
    normPerKm: { hilly: 36_142_000, mountainous: 41_448_000 },
    normCodes: { hilly: 'A.1.S2.7,5.NER', mountainous: 'A.1.S2.7,5.NEH' },
    bridgePerKm: 481_621_000, bridgeCode: 'A.2.S.7,5.N', tunnelTubes: 1,
  },
  'S9.5': {
    id: 'S9.5', label: 'S 9.5 (class I road)', enabled: true, crownWidth: 9.5,
    speeds: [90, 80, 70], roadClass: 'I',
    normPerKm: { hilly: 56_912_000, mountainous: 67_982_000 },
    normCodes: { hilly: 'A.1.S1.9,5.NER', mountainous: 'A.1.S1.9,5.NEH' },
    bridgePerKm: 579_911_000, bridgeCode: 'A.2.S.9,5.N', tunnelTubes: 1,
  },
  'S11.5': {
    id: 'S11.5', label: 'S 11.5 (class I road)', enabled: true, crownWidth: 11.5,
    speeds: [90, 80, 70], roadClass: 'I',
    normPerKm: { hilly: 68_894_000, mountainous: 82_163_000 },
    normCodes: { hilly: 'A.1.S1.11,5.NER', mountainous: 'A.1.S1.11,5.NEH' },
    bridgePerKm: 692_398_000, bridgeCode: 'A.2.S.11,5.N', tunnelTubes: 1,
  },
  // Not playable in v1 (needs interchanges, twin tubes, motorway norms).
  'D27.5': {
    id: 'D27.5', label: 'D 27.5 (motorway)', enabled: false, crownWidth: 27.5,
    speeds: [130, 120, 110], roadClass: 'motorway',
    normPerKm: { hilly: 187_632_000, mountainous: 214_512_000 },
    normCodes: { hilly: 'A.1.D.27,5.NER', mountainous: 'A.1.D.27,5.NEH' },
    bridgePerKm: 1_495_178_000, bridgeCode: 'A.2.D.27,5.N', tunnelTubes: 2,
  },
};

export const PLAYABLE_CATEGORIES: CategoryId[] = (Object.keys(CATEGORIES) as CategoryId[])
  .filter((k) => CATEGORIES[k].enabled);
