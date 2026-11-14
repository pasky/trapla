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
