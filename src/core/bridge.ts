// SPK-normalized quantity model. See research/16-bridge-cost-model.md for evidence/limitations.
// All prices exclude land and other-objects surcharge. O(1) per station, O(n) per priced run.
import { BRIDGE_GEOMETRY as G, BRIDGE_HEIGHT as H, BRIDGE_ITEMS as P } from './data/bridges';

export type BridgeRow = { bridgePerKm: number } & ({ crownWidth: number } | { width: number });
export interface BridgeLayout { span: number; pierDensity: number }

/** Equal spans ≤30 m on the main road. No invented pier in a single-span bridge. */
export function bridgeLayout(length: number): BridgeLayout {
  const spans = Math.max(1, Math.ceil(length / G.preferredSpan - 1e-9));
  return { span: length / spans, pierDensity: (spans - 1) / length };
}

/** PROVISIONAL equivalent concrete m³/m² by span regime, continuous at class boundaries.
 * Slab ≤20 m; ordinary beam 20–40 m; long-span box proxy >40 m (not a feasibility check). */
export function deckConcretePerM2(span: number): number {
  if (span <= 20) return 0.45;
  if (span <= 40) return 0.45 + (span - 20) * 0.02;
  return 0.85 + (span - 40) * 0.025;
}

export function bridgeModel(row: BridgeRow) {
  const width = 'crownWidth' in row ? row.crownWidth : row.width;
  const pierUnit = P.pierConcrete + G.rebarPerM3 * P.rebar;
  const abutmentUnit = P.abutmentConcrete + G.rebarPerM3 * P.rebar;
  const deckUnit = P.deckConcrete + G.deckRebarPerM3 * P.deckRebar + G.prestressPerM3 * P.prestressing;
  const pilePerM = P.pileDrilling + Math.PI * G.pileDiameter ** 2 / 4 * (P.pileConcrete + G.rebarPerM3 * P.pileRebar);
  // Explicit standard bored-pile allowance. No inference of founding strata from surface geology.
  const foundation = (pileLength: number) => width * (G.pilesPerWidth * pileLength * pilePerM + G.capVolumePerWidth * abutmentUnit);
  const bearing = width * G.bearingsPerWidth * P.bearing;
  const abutments = 2 * (width * G.abutmentVolumePerWidth * abutmentUnit + foundation(G.pileLength) + bearing + width * P.joint);
  const reference = bridgeLayout(G.referenceLength);
  // Fit the effective reinforced-concrete support section to SPK's +30% at 35 m vs 8 m.
  // It includes height-sensitive erection/access as well as actual pier material: not a design section.
  const pierArea = row.bridgePerKm / 1000 * H.upperExtra / (H.upper - H.standard) / reference.pierDensity / pierUnit;
  const pier = (height: number, span: number, pileLength: number) => foundation(pileLength) + bearing
    + pierArea * Math.max(0, height - span / 20) * pierUnit;
  const referenceHeight = H.standard + reference.span / 20;
  // Fit the intercept to SPK, subtracting support/endpoint work already bundled in that norm.
  // This residual includes equipment, erection, access and other unitemized ordinary bridge work.
  const residualPerM2 = (row.bridgePerKm / 1000 - abutments / G.referenceLength
    - reference.pierDensity * pier(referenceHeight, reference.span, G.pileLength)) / width
    - deckConcretePerM2(reference.span) * deckUnit;
  const perM = (height: number, layout = reference, pileLength: number = G.pileLength) =>
    width * (residualPerM2 + deckConcretePerM2(layout.span) * deckUnit)
    + layout.pierDensity * pier(height, layout.span, pileLength);
  return { width, abutments, residualPerM2, pierArea, referenceHeight, perM,
    /** DP has no run state: amortize two abutments over the declared reference length. */
    estimatePerM: (height: number) => perM(height) + abutments / G.referenceLength,
    /** Whole uniform bridge, also useful for sensitivity and benchmark scripts. */
    total: (length: number, height: number, layout = bridgeLayout(length), pileLength: number = G.pileLength) =>
      length * perM(height, layout, pileLength) + abutments
      + 2 * (foundation(pileLength) - foundation(G.pileLength)),
  };
}
export type BridgeModel = ReturnType<typeof bridgeModel>;

/** Exact selector cost, matching cell billing including endpoint half-cells and local surcharge.
 * Fixed abutments split equally over first/last cells (both halves on a one-cell bridge). */
export function bridgeRunCost(model: BridgeModel, h: ArrayLike<number>, ds: number,
  surcharge: (i: number) => number, land: (i: number) => number) {
  return (i0: number, i1: number, length: number) => {
    const layout = bridgeLayout(length);
    let cost = model.abutments / 2 * (2 + surcharge(i0) + surcharge(i1));
    for (let i = i0; i <= i1; i++) {
      const len = i === 0 || i === h.length - 1 ? ds / 2 : ds;
      cost += len * (model.perM(h[i], layout) * (1 + surcharge(i)) + model.width * land(i));
    }
    return cost;
  };
}
