// Unit prices, 2026 price level, CZK excl. VAT. Sources: research/00-feasibility-map.md §3 and
// research/data/spk-cn-2026-oceneni.csv. Everything marked PROVISIONAL is a placeholder.

/** OTSKP 2026 excavation by class: 12273 (I) 183, 12283 (II) 391, 12293 (III) 653 CZK/m³ */
export const EXCAVATION_BY_CLASS = { I: 183, II: 391, III: 653 };
/** SPK CN excavability mix assumed by the norm: 75 % class I, 20 % class II, 5 % class III */
export const EXCAVATION_MIX = { I: 0.75, II: 0.2, III: 0.05 };

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

/** Earthworks the SFDI road norm already includes per km (research/00 §3.1) */
export const NORM_EARTHWORK_ALLOWANCE = {
  cutPerKm: { motorway: 70_000, I: 40_000, II: 20_000 } as Record<string, number>,
  fillShareOfCut: 0.85,
  /** PROVISIONAL: footprint width beyond the crown assumed for the norm's topsoil allowance, m */
  topsoilExtraWidth: 12,
};

/** PROVISIONAL land / surface placeholders (no open parcel prices; Act 416/2009 multiplies by 8) */
export const LAND = {
  /** PROVISIONAL: 8 × 50 CZK/m² for non-building land */
  perM2: 8 * 50,
  /** PROVISIONAL: extra per m² of forest footprint (clearing + forest-land removal fee) */
  forestExtraPerM2: 250,
  /** PROVISIONAL: lump sum per building in the footprint (purchase at 1.5× + demolition) */
  perBuilding: 15_000_000,
};

/** Structure selection parameters (game rules, not norm values) */
export const STRUCTURE_RULES = {
  /** a bridge is only considered where the grade is at least this high above ground, m */
  bridgeMinHeight: 4,
  /** a bored tunnel needs at least this much cover above the crown, m (tunnel crown ≈ 8 m) */
  tunnelMinDepth: 14,
  minBridgeLength: 30,
  minTunnelLength: 150,
  /** earthwork gaps shorter than this between two bridges / tunnels are merged into the structure */
  bridgeGapMerge: 60,
  tunnelGapMerge: 150,
};
