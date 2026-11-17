// CZK excl. VAT, April 2026 OTSKP. Exact codes/scopes: research/16-official-items.md.
// Quantities below are PROVISIONAL study geometry, not quantities prescribed by OTSKP/SPK.
export const BRIDGE_ITEMS = {
  pierConcrete: 12_934.89, // 334325 / m³, formwork included; reinforcement separate
  abutmentConcrete: 9_377.28, // 333325 / m³
  rebar: 40_874.37, // 334365, 333365 / t
  deckConcrete: 17_952.09, // 422335 / m³, prestressing/rebar separate
  deckRebar: 42_334.95, // 421365 / t
  prestressing: 129_728.57, // 422373 / t
  pileConcrete: 5_534.64, // 22432 / m³
  pileRebar: 48_858.84, // 224365 / t
  pileDrilling: 2_364.57, // 264130 / m, ground I, diameter ≤800 mm
  bearing: 99_333.71, // 42851 / each, ≤1 MN (equivalent allowance, not bearing design)
  joint: 31_699.79, // 93151 / m, movement ≤60 mm
} as const;

// SPK CN 2026 appendices 1 (§A.2) and 5 (bridge sheet D5:E6): free height ≤8 m
// is standard; at 35 m the height attribute adds 30%. Methodology recommends linear interpolation.
export const BRIDGE_HEIGHT = { standard: 8, upper: 35, upperExtra: 0.30 } as const;

export const BRIDGE_GEOMETRY = {
  referenceLength: 120, preferredSpan: 30, // layout assumptions, NOT SPK-prescribed
  // Effective concrete quantities, per metre of carried-road width (not gross structural width).
  abutmentVolumePerWidth: 12, // m³ / m per abutment including wing walls
  capVolumePerWidth: 3, // m³ / m per support
  rebarPerM3: 0.15, deckRebarPerM3: 0.16, prestressPerM3: 0.035, // t/m³
  pilesPerWidth: 6 / 9.5, pileDiameter: 0.8, pileLength: 15,
  bearingsPerWidth: 2 / 9.5,
} as const;

/** Bridge styles (research/50-bridge-styles.md §2, §5; docs/design-realism-plan.md M3). One per bridge run;
 * Auto takes the cheapest that fits, the player may choose another on the bridge card. */
export const BRIDGE_STYLES = {
  /** Short spans: precast beams, falsework or a movable scaffold, ≈ 30 m spans (BRIDGE_GEOMETRY.preferredSpan).
   * Over something no support may stand in, one span may reach 60 m: II/268 Jizera 6 × 30 + 60 + 2 × 30 m on
   * fixed falsework (research/50 §2c, §3 row 1); movable scaffolds 30–60 m (Suchánek). */
  short: { maxSpan: 60 },
  /** Long spans: a launched or cantilevered box, or steel and concrete: equal spans of 45–60 m (Czech tall
   * viaducts 45–58 m: D35 Opatovice 45, D8 Prackovice 48, D8 Rybný potok 58; launched 35–60 m, research/50
   * §2c–e), one span up to `maxSpan` over what lies below (balanced cantilevers, typically 80–250 m, CTU BM01
   * př. 11; D11 Poříčí 151 m). maxSpan is the engine's search limit (SUPPORT_LIMITS.spanM), not a norm.
   * Spans over `capFrom` on a deck at least `capHeight` m high cost at most `capFactor` × the 30 m-span
   * price: PROVISIONAL (thin evidence, no Czech outturn of a launched or cantilevered box): the costed Czech
   * long-span valley bridges are ≈ 0.8–1.0 × SPK with its height attribute, i.e. about the model's 30 m-span
   * price, where the model's provisional deck volume overshoots 1.2–1.6× (research/50 §3, §4); 1.2 is the top
   * of the plan's 1.0–1.2 so as not to make them cheap on thin evidence. A long span over something below has
   * side spans of at least `sideSpan` × it (Czech cantilevers 0.56–0.71: D35 Labe 45/80, D11 Poříčí 94/151,
   * Líčná 85/120, Hačky 60/116; research/50 §2e). */
  long: { minSpan: 45, span: 60, maxSpan: 180, capFrom: 60, capHeight: 40, capFactor: 1.2, sideSpan: 0.56 },
  /** Arch: one arch of 100–250 m (Czech: Napajedla 115, Opárno 135, Podolsko 150, Červená 156, Plasy 180,
   * D3 Sázava 251 m) with the deck on columns, and short approach spans (Opárno 17.5–24 m, Plasy 25–32 m). The
   * bridge is 1.8–2.8 × the arch span (Opárno 273/135, Červená 316/156, Plasy 496/180); rise 1/10–1/5 of the
   * span (Trojský 20/200, Napajedla 20/115). Priced `factor` × a 30 m-span viaduct as high as the arch's highest
   * point (Opárno 0.99, Plasy 0.82 × SPK with its height attribute): PROVISIONAL, two bridges (research/50 §3,
   * §5). */
  arch: { minArch: 100, maxArch: 250, lengthMin: 1.8, lengthMax: 2.8, riseMin: 1 / 10, riseMax: 1 / 5, columnSpan: 30, factor: 1 },
} as const;
