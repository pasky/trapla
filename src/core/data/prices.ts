// Unit prices, 2026 price level, CZK excl. VAT. Sources: research/00-feasibility-map.md §3 and
// research/data/spk-cn-2026-oceneni.csv. Everything marked PROVISIONAL is a placeholder.

/** Bump whenever prices or cost rules change: scores saved under an older model are not comparable. */
export const COST_MODEL_VERSION = 2;

/** OTSKP 2026 excavation by class: 12273 (I) 183, 12283 (II) 391, 12293 (III) 653 CZK/m³ */
export const EXCAVATION_BY_CLASS = { I: 183, II: 391, III: 653 };
/** SPK CN excavability mix assumed by the norm: 75 % class I, 20 % class II, 5 % class III */
export const EXCAVATION_MIX = { I: 0.75, II: 0.2, III: 0.05 };
/**
 * PROVISIONAL stand-in for geology: the excavation class of the design's cuts depends on the depth
 * below the original ground — class I down to `classIto` metres, class II down to `classIIto`,
 * class III (rock) below. The norm allowance stays valued at the 75/20/5 mix.
 */
export const EXCAVATION_DEPTH_BANDS = { classIto: 3, classIIto: 8 };

export const PRICES = {
  /** weighted excavation price, CZK/m³ (≈ 248) */
  excavation: EXCAVATION_MIX.I * EXCAVATION_BY_CLASS.I + EXCAVATION_MIX.II * EXCAVATION_BY_CLASS.II
    + EXCAVATION_MIX.III * EXCAVATION_BY_CLASS.III,
  /** OTSKP 17110 placing fill with compaction, CZK/m³ (90–116; 100 used) */
  fillPlacing: 100,
  /** OTSKP 12273B haulage, CZK per m³·km */
  haulPerM3Km: 19.64,
  /** surplus cut is hauled this far to a tip, km (no landfill fee: OTSKP 014101 is project-specific) */
  surplusHaulKm: 10,
  /** OTSKP 17180 fill from purchased material, CZK/m³ (charged on top of placing) */
  borrowFill: 636,
  /** excavation items include haul ≤ 1 km: only the haul beyond this is charged, m */
  freeHaul: 1000,
  /** OTSKP 12110 topsoil stripping, CZK/m³ */
  topsoil: 83,
  /** PROVISIONAL: topsoil depth stripped over the footprint, m */
  topsoilDepth: 0.3,
  /** SPK CN "other objects" surcharge, rural: +30.6 % of construction */
  otherObjectsSurcharge: 0.306,
  /** SPK CN A.3.R.2.NE.K bored 2-lane tunnel, rural, up to 500 m: CZK per km */
  tunnelShortPerKm: 1_487_547_000,
  /** SPK CN A.3.R.2.NE.D bored 2-lane tunnel, rural, over 500 m: CZK per km */
  tunnelLongPerKm: 1_549_899_000,
  tunnelLongThreshold: 500,
};

/**
 * Value of a m³ of fill material used for decisions (auto-profile, bridge vs embankment), CZK/m³.
 * The auto-profile searches [lo, hi] for the value at which its grade line neither buys fill nor tips
 * a surplus; `start` (PROVISIONAL, typical for the D11 terrain) is where the search begins and what
 * manual profiles use. Bounds: tipping a surplus costs surplusHaulKm × haulPerM3Km, bought fill borrowFill.
 */
export const MATERIAL_VALUE = { start: 200, lo: -150, hi: 600, /** m³ of imbalance per m of route tolerated */ tolerancePerM: 1.5 };

/** Earthworks the SFDI road norm already includes per km (research/00 §3.1) */
export const NORM_EARTHWORK_ALLOWANCE = {
  cutPerKm: { motorway: 70_000, I: 40_000, II: 20_000 } as Record<string, number>,
  fillShareOfCut: 0.85,
  /** share of cut that is unsuitable: hauled to a tip ≤ 10 km and replaced from a borrow pit (norm
   * assumption; applied identically to the allowance and to the player's design) */
  unsuitableShare: 0.15,
  /** PROVISIONAL: footprint width beyond the crown assumed for the norm's topsoil allowance, m */
  topsoilExtraWidth: 12,
};

/** PROVISIONAL land / surface placeholders (no open parcel prices; Act 416/2009 multiplies by 8) */
export const LAND = {
  /** PROVISIONAL: 8 × 50 CZK/m² for non-building land */
  perM2: 8 * 50,
  /** PROVISIONAL: extra per m² of forest footprint (clearing + forest-land removal fee) */
  forestExtraPerM2: 250,
};

/** Structure selection parameters (game rules, not norm values) */
export const STRUCTURE_RULES = {
  /** a bridge is only considered where the grade is at least this high above ground, m */
  bridgeMinHeight: 4,
  /** a bored tunnel needs at least this much cover above the crown, m (tunnel crown ≈ 8 m) */
  tunnelMinDepth: 14,
  minBridgeLength: 30,
  minTunnelLength: 150,
  /** grade must be at least this far above a river / railway the road crosses, m (deck + clearance) */
  riverClearance: 3,
  railClearance: 7.5,
  /** earthwork gaps shorter than this between two bridges / tunnels are merged into the structure */
  bridgeGapMerge: 60,
  tunnelGapMerge: 150,
};
