// Automatic footprint remedies: OTSKP April 2026 components, CZK excl. VAT.
// Sources and item scope: research/18-footprint-remedies-rates.md. Geometry is explicitly
// provisional study design, NOT a catalogue all-in tariff or a geotechnical/hydraulic approval.
export const REMEDY_RATES = {
  wallConcrete: 9_343.92, // 327325, m³, formwork included, reinforcement excluded
  wallSteel: 41_635.80, // 327365, t
  foundationExcavation: 315.27, // 13173, m³
  backfill: 195.56, // 17411, m³
  wallDrain: 368.45, // 212625, complete DN≤100 drain per m, trench/pipe/fill included
  wallFilter: 77.11, // 214613, separate vertical filtration blanket per m²
  pressurizedWaterproofing: 325.93, // 711122, ordinary structures against pressure water, asphalt sheets, m²
  waterproofProtection: 204.64, // 711519, underground waterproofing protection textile, m²
  channelExcavation: [190.36, 394.42, 946.92] as const, // 124731 / 124831 / 124931, m³, haul ≤1 km included
  loosePlacement: 21.17, // 17120, m³, on-site surplus placement, not a free landfill
  stoneCover: 1_579.21, // 46451, m³
  filterGeotextile: 87.44, // 28997, m²
  topsoil: 39.19, // 18221, m²
  hydroseed: 29.35, // 18242, m²
};
export const RETAINING_RULES = {
  clearance: 1.5, minimumOffset: 0.75, maxHeight: 15,
  /** Constrained vertical faces may stand at the crown edge; foundations stay in our corridor.
   * 0.1 m is only a positive screen margin outside the mapped feature, not a surveyed safety norm. */
  constrainedClearance: 0.1,
  steelPerM3: 0.12, // provisional 120 kg/m³ RC assembly, not a sourced reinforcement schedule
};
/** Height-dependent cantilever assembly. Base/heel lies behind the wall inside our corridor.
 * No height-independent face-area rate: foundations and section thickness grow with wall height. */
export function retainingAssembly(height: number, watertight = false) {
  const h = Math.max(0.25, height), embed = watertight ? Math.max(1, 0.5 * h) : Math.max(0.6, 0.15 * h);
  const stem = 0.25 + (watertight ? 0.08 : 0.04) * h;
  const baseWidth = Math.max(1.5, (watertight ? 1.2 : 0.6) * h), baseDepth = Math.max(0.25, (watertight ? 0.15 : 0.1) * h);
  const concrete = (h + embed) * stem + baseWidth * baseDepth;
  const trench = baseWidth * (embed + baseDepth), returned = Math.max(0, trench - baseWidth * baseDepth - embed * stem);
  const perM = concrete * (REMEDY_RATES.wallConcrete + RETAINING_RULES.steelPerM3 * REMEDY_RATES.wallSteel)
    + trench * REMEDY_RATES.foundationExcavation + returned * REMEDY_RATES.backfill
    + (watertight ? (h + embed + baseWidth) * (REMEDY_RATES.pressurizedWaterproofing + REMEDY_RATES.waterproofProtection)
      : REMEDY_RATES.wallDrain + h * REMEDY_RATES.wallFilter);
  return { height: h, embed, stem, baseWidth, baseDepth, concrete, steel: concrete * RETAINING_RULES.steelPerM3, trench, perM, perM2: perM / h };
}
export const CHANNEL_RULES = {
  sideSlope: 2, velocity: 2, freeboard: 0.3, minDepth: 0.6,
  liningThickness: 0.3, bankRestorationWidth: 4, maxAdditionalCut: 5, setback: 2,
};
/** Trapezoid A=d*(b+z*d), NOT d*(b+2*z*d). Unit quantities follow this declared section. */
export function channelAssembly(bottom: number, q100: number, classMix: readonly number[] = [1, 0, 0], extraCut = 0) {
  const b = Math.max(0.5, bottom), z = CHANNEL_RULES.sideSlope;
  const hydraulicDepth = (-b + Math.sqrt(b * b + 4 * z * q100 / CHANNEL_RULES.velocity)) / (2 * z);
  const depth = Math.max(CHANNEL_RULES.minDepth, hydraulicDepth + CHANNEL_RULES.freeboard);
  const area = depth * (b + z * depth), perimeter = b + 2 * depth * Math.hypot(1, z);
  const totalDepth = depth + Math.max(0, extraCut), excavation = totalDepth * (b + z * totalDepth);
  const bankRestoration = CHANNEL_RULES.bankRestorationWidth + 2 * Math.max(0, extraCut) * Math.hypot(1, z);
  const excavationRate = REMEDY_RATES.channelExcavation.reduce((sum, rate, i) => sum + rate * (classMix[i] ?? 0), 0);
  const perM = excavation * (excavationRate + REMEDY_RATES.loosePlacement)
    + perimeter * (CHANNEL_RULES.liningThickness * REMEDY_RATES.stoneCover + REMEDY_RATES.filterGeotextile)
    + bankRestoration * (REMEDY_RATES.topsoil + REMEDY_RATES.hydroseed);
  return { bottom: b, depth, area, perimeter, topWidth: b + 2 * z * totalDepth, excavation, perM };
}
