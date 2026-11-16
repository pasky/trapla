// Unit prices, CZK excl. VAT. SPK CN / OTSKP norms are 2026; research market/contract examples
// remain at their original dates, NOT escalated to 2026. Sources: research/00-feasibility-map.md §3 and
// research/data/spk-cn-2026-oceneni.csv; land: research/07-property-land.md; earthworks:
// research/09-noise-earthworks-urban.md §3. PROVISIONAL marks a placeholder or game heuristic.

/** Bump whenever prices or cost rules change: scores saved under an older model are not comparable.
 * 20: motorway and railway scoring enabled (paired / split D 27.5 corridors: motorway norms, no level
 * junctions, motorway noise source; R1/R2 railways: SPOŽES prices, CNOSSOS train noise); road bills
 * unchanged (eval-regression identical).
 * 21: finite-segment noise (Manuál 2018 §1.10–1.11, §1.19), walls on the cross-section's line, the
 * cheapest automatic wall per house (research/36).
 * 23: the structure choice prices the buildings each option demolishes and settles the fill value on
 * the final grade line (By hand from Auto's heights bills the same); piers of a chosen bridge miss
 * what lies below; an automatic bridge whose piers cannot is not chosen; a stream at a bridge's end
 * is spanned; a chimney / silo / shed standing within a demolished building goes with it. */
export const COST_MODEL_VERSION = 23;

/** OTSKP 2026 excavation by class: 12273 (I) 183, 12283 (II) 391, 12293 (III) 653 CZK/m³ */
export const EXCAVATION_BY_CLASS = { I: 183, II: 391, III: 653 };
/** SPK CN excavability mix assumed by the norm: 75 % class I, 20 % class II, 5 % class III */
export const EXCAVATION_MIX = { I: 0.75, II: 0.2, III: 0.05 };
// Local excavation profiles come from the ČGS ground grid, not a universal depth rule.
// Estimated lithology-dependent weathering: pipeline/ground_profiles.json, research/10-geology-excavation.md.

export const PRICES = {
  /** weighted excavation price, CZK/m³ (≈ 248) */
  excavation: EXCAVATION_MIX.I * EXCAVATION_BY_CLASS.I + EXCAVATION_MIX.II * EXCAVATION_BY_CLASS.II
    + EXCAVATION_MIX.III * EXCAVATION_BY_CLASS.III,
  /** OTSKP 17110 placing fill (the route's own cut) with compaction, CZK/m³ (90–116; 100 used) */
  fillPlacing: 100,
  /** OTSKP 12273B haulage, CZK per m³·km */
  haulPerM3Km: 19.64,
  /** surplus cut is hauled this far to a tip, km (no landfill fee: OTSKP 014101 is project-specific) */
  surplusHaulKm: 10,
  /** OTSKP 17180 "placing fill from purchased material", CZK/m³: a composite item that includes the
   * placing, so 17110 is not charged on bought fill (research/09 §3) */
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
 * manual profiles use. Bounds: a m³ of surplus cut costs its haul to a tip (≈ −196); a m³ of fill
 * bought instead of placed from the route's own cut costs borrowFill − fillPlacing (536), since
 * decisions add fillPlacing to every m³ of fill.
 */
export const MATERIAL_VALUE = {
  start: 200,
  lo: -PRICES.surplusHaulKm * PRICES.haulPerM3Km,
  hi: PRICES.borrowFill - PRICES.fillPlacing,
  /** m³ of imbalance per m of route tolerated */
  tolerancePerM: 1.5,
};

/** Earthworks the SFDI road norm already includes per km (research/00 §3.1) */
export const NORM_EARTHWORK_ALLOWANCE = {
  // One direction of a split motorway: 60 % of the motorway allowance, like its 60 % norm (SPK p. 7).
  cutPerKm: { motorway: 70_000, 'motorway-carriageway': 0.6 * 70_000, I: 40_000, II: 20_000 } as Record<string, number>,
  fillShareOfCut: 0.85,
  /** share of cut that is unsuitable: hauled to a tip ≤ 10 km and replaced from a borrow pit (norm
   * assumption; applied identically to the allowance and to the player's design) */
  unsuitableShare: 0.15,
  /** PROVISIONAL: footprint width beyond the crown assumed for the norm's topsoil allowance, m */
  topsoilExtraWidth: 12,
};

/** Land outside built-up areas (research/07). Act 416/2009 §3b(1a): non-building land is bought at 8×
 * the price set by an expert appraisal, which §3b(2) sets at the usual (market) price. */
export const LAND = {
  /** 8 × 40 CZK/m²: Czech farmland trades mostly at 30–55 CZK/m² (2024–25; low confidence locally).
   * Forest at the same 320 incl. standing timber is a PROVISIONAL research-informed estimate,
   * NOT a sourced combined land+timber valuation (forest land alone 8–50 CZK/m²). */
  perM2: 8 * 40,
  /** PROVISIONAL research-informed estimate per m² forest footprint: PUPFL removal levy ≈ 20
   * (0–50, statutory formula is site-specific) + clearing ≈ 30 (15–40); neither is a sourced
   * local rate (research/07 §4). */
  forestExtraPerM2: 50,
};

/** Structure selection parameters (game rules, not norm values) */
export const STRUCTURE_RULES = {
  /** PROVISIONAL stepped-slope geometry, not a quoted ČSN requirement. I/27 Klatovy's EIA uses
   * 1 m benches in cuts >6 m; repeated 6 m lifts and 2 m fill benches are game assumptions.
   * See research/15-bridge-vs-embankment.md and 15-followup.md. */
  bermInterval: 6,
  fillBermWidth: 2,
  cutBermWidth: 1,
  /** PROVISIONAL stability/ground-treatment reserve above 6 m, CZK/m³ per additional metre.
   * D11 1107 documents drains, granular mattresses, reinforced slopes and settlement monitoring;
   * no isolated priced BOQ was recovered. These are sensitivity parameters, NOT tender rates.
   * Applied independently of the mass-balance material price (free soil is not free engineering). */
  engineeringFromHeight: 6,
  highFillPerM3PerM: 35,
  highCutPerM3PerM: 20,
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
