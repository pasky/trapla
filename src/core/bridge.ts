// SPK-normalized quantity model. See research/16-bridge-cost-model.md for evidence/limitations.
// All prices exclude land and other-objects surcharge. O(1) per station, O(n) per priced run.
import { BRIDGE_GEOMETRY as G, BRIDGE_HEIGHT as H, BRIDGE_ITEMS as P, BRIDGE_STYLES as S } from './data/bridges';

export type BridgeRow = { bridgePerKm: number } & ({ crownWidth: number } | { width: number });
export interface BridgeLayout { span: number; pierDensity: number }
/** How a bridge is built (data/bridges.ts BRIDGE_STYLES): short spans (the default), long spans, an arch. */
export type BridgeStyle = 'short' | 'long' | 'arch';
export const BRIDGE_STYLE_ORDER: readonly BridgeStyle[] = ['short', 'long', 'arch'];
/** An arch bridge's arch: its springings (route chainage) and the deck's greatest height over the ground
 * along the bridge, m (its price, BRIDGE_STYLES.arch.factor). */
export interface BridgeArch { s0: number; s1: number; height: number }

/** Summary of a nonuniform support arrangement. Billing integrates each actual span below;
 * the longest span is retained here for diagnostics, never applied to the whole viaduct. */
export function supportBridgeLayout(s0: number, s1: number, piers: readonly number[]): BridgeLayout {
  let previous = s0, span = 0;
  for (const s of piers) { span = Math.max(span, s - previous); previous = s; }
  return { span: Math.max(span, s1 - previous), pierDensity: piers.length / (s1 - s0) };
}

/** Equal spans ≤30 m on the main road. No invented pier in a single-span bridge. */
export function bridgeLayout(length: number): BridgeLayout {
  const spans = Math.max(1, Math.ceil(length / G.preferredSpan - 1e-9));
  return { span: length / spans, pierDensity: (spans - 1) / length };
}

/** Long spans: equal-span layouts with spans of 45–60 m (fewer, longer where none fits), longest first: the
 * longest, the shortest and one between (a long bridge has many; the price is smooth in the span). */
export function longLayouts(length: number): BridgeLayout[] {
  const n0 = Math.max(1, Math.ceil(length / S.long.span - 1e-9)), n1 = Math.max(n0, Math.floor(length / S.long.minSpan + 1e-9));
  return [...new Set([n0, Math.round((n0 + n1) / 2), n1])].map(n => ({ span: length / n, pierDensity: (n - 1) / length }));
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
    + pierArea * Math.max(H.standard, height - span / 20) * pierUnit;
  const referenceHeight = H.standard + reference.span / 20;
  // Fit the intercept to SPK, subtracting support/endpoint work already bundled in that norm.
  // This residual includes equipment, erection, access and other unitemized ordinary bridge work.
  const residualPerM2 = (row.bridgePerKm / 1000 - abutments / G.referenceLength
    - reference.pierDensity * pier(referenceHeight, reference.span, G.pileLength)) / width
    - deckConcretePerM2(reference.span) * deckUnit;
  const perM = (height: number, layout = reference, pileLength: number = G.pileLength) =>
    width * (residualPerM2 + deckConcretePerM2(layout.span) * deckUnit)
    + layout.pierDensity * pier(height, layout.span, pileLength);
  /** Long spans over BRIDGE_STYLES.long.capFrom on a high deck: at most capFactor × the 30 m-span price. */
  const longPerM = (height: number, layout: BridgeLayout, pileLength: number = G.pileLength) => {
    const p = perM(height, layout, pileLength);
    return layout.span > S.long.capFrom && height >= S.long.capHeight ? Math.min(p, S.long.capFactor * perM(height, reference, pileLength)) : p;
  };
  // the grade search's reference spans of the long-span style (over the same reference length)
  const longReference = [S.long.minSpan, S.long.span].map(span => ({ span, pierDensity: 1 / span }));
  /** per metre at the reference length: the cheaper of short and long spans (a run chooses its style later,
   * with its supports) */
  const bestPerM = (height: number) => Math.min(perM(height), perM(height, longReference[0]), perM(height, longReference[1]));
  return { width, abutments, residualPerM2, pierArea, referenceHeight, perM, longPerM, bestPerM,
    /** DP has no run state: amortize two abutments over the declared reference length. */
    estimatePerM: (height: number) => bestPerM(height) + abutments / G.referenceLength,
    /** Whole uniform bridge, also useful for sensitivity and benchmark scripts. */
    total: (length: number, height: number, layout = bridgeLayout(length), pileLength: number = G.pileLength) =>
      length * perM(height, layout, pileLength) + abutments
      + 2 * (foundation(pileLength) - foundation(G.pileLength)),
  };
}
export type BridgeModel = ReturnType<typeof bridgeModel>;

export interface PricedBridgeRun {
  i0: number; i1: number; length: number; layout?: BridgeLayout; pierStations?: readonly number[];
  /** absent: short spans */
  style?: Exclude<BridgeStyle, 'short'>; arch?: BridgeArch;
}

/** Per metre of a style's deck at height h on a span of `layout` (an arch: as a 30 m-span viaduct of the
 * run's length at the arch bridge's greatest height). */
function stylePerM(model: BridgeModel, run: PricedBridgeRun): (height: number, layout: BridgeLayout) => number {
  if (run.style === 'arch' && run.arch) {
    const p = S.arch.factor * model.perM(run.arch.height, bridgeLayout(run.length));
    return () => p;
  }
  return run.style === 'long' ? model.longPerM : model.perM;
}

/** Span-overlap integration shared by selector and bill. O(cells + supports), including a
 * pier inside a station cell. Support density retains the calibrated run-average allowance;
 * the deck section and span/20 height conversion use the actual local span. */
export function* bridgeVariableCosts(model: BridgeModel, h: ArrayLike<number>, ds: number, run: PricedBridgeRun): Generator<[number, number]> {
  const layout = run.layout ?? bridgeLayout(run.length), perM = stylePerM(model, run);
  const start = Math.max(0, (run.i0 - 0.5) * ds), end = Math.min((h.length - 1) * ds, (run.i1 + 0.5) * ds);
  const supports = run.pierStations ? [start, ...run.pierStations, end] : undefined;
  let spanIndex = 0;
  for (let i = run.i0; i <= run.i1; i++) {
    const left = Math.max(0, (i - 0.5) * ds), right = Math.min((h.length - 1) * ds, (i + 0.5) * ds);
    if (!supports) { yield [i, (right - left) * perM(h[i], layout)]; continue; }
    let s = left, cost = 0;
    while (s < right - 1e-9) {
      while (spanIndex + 1 < supports.length - 1 && supports[spanIndex + 1] <= s + 1e-9) spanIndex++;
      const next = Math.min(right, supports[spanIndex + 1]);
      cost += (next - s) * perM(h[i], { span: supports[spanIndex + 1] - supports[spanIndex], pierDensity: layout.pierDensity });
      s = next;
    }
    yield [i, cost];
  }
}

/** Exact selector cost, matching cell billing including endpoint half-cells and local surcharge.
 * Fixed abutments split equally over first/last cells (both halves on a one-cell bridge). */
export function bridgeRunCost(model: BridgeModel, h: ArrayLike<number>, ds: number,
  surcharge: (i: number) => number, land: (i: number) => number) {
  return (i0: number, i1: number, length: number, layout = bridgeLayout(length), pierStations?: readonly number[],
    style?: Pick<PricedBridgeRun, 'style' | 'arch'>) => {
    let cost = model.abutments / 2 * (2 + surcharge(i0) + surcharge(i1));
    // DP/balance selectors have no adjusted supports: retain their allocation-free hot loop.
    if (pierStations === undefined) {
      const perM = style?.style ? stylePerM(model, { i0, i1, length, ...style }) : model.perM;
      for (let i = i0; i <= i1; i++) {
        const len = i === 0 || i === h.length - 1 ? ds / 2 : ds;
        cost += len * (perM(h[i], layout) * (1 + surcharge(i)) + model.width * land(i));
      }
      return cost;
    }
    for (const [i, variable] of bridgeVariableCosts(model, h, ds, { i0, i1, length, layout, pierStations, ...style })) {
      const len = i === 0 || i === h.length - 1 ? ds / 2 : ds;
      cost += variable * (1 + surcharge(i)) + len * model.width * land(i);
    }
    return cost;
  };
}

/** A run's price before its supports are placed (the structure choice): the cheaper of short spans and the
 * long-span layouts (support-layout then places the supports and picks the style). */
export function equalSpanRunCost(model: BridgeModel, h: ArrayLike<number>, price: ReturnType<typeof bridgeRunCost>) {
  // (a run's price depends on its cells only: the structure choice asks for the same runs at every fill value)
  const memo = new Map<number, number>();
  return (i0: number, i1: number, length: number) => {
    const key = i0 * h.length + i1;
    let best = memo.get(key);
    if (best !== undefined) return best;
    best = price(i0, i1, length);
    let top = -Infinity;
    for (let i = i0; i <= i1; i++) if (h[i] > top) top = h[i];
    for (const layout of longLayouts(length)) if (longMayPay(model, top, length, layout))
      best = Math.min(best, price(i0, i1, length, layout, undefined, { style: 'long' }));
    memo.set(key, best);
    return best;
  };
}
/** Can a long-span layout be cheaper than short spans anywhere on a bridge at most `top` high? Per metre, the
 * short spans' extra piers make their price rise faster with height (and their pier height is floored lower), so
 * if they are no dearer at the top they are no dearer anywhere: the long layout cannot pay. */
export function longMayPay(model: BridgeModel, top: number, length: number, layout: BridgeLayout): boolean {
  return model.longPerM(top, layout) < model.perM(top, bridgeLayout(length));
}

/** An arch's rib (its underside; the rib is ARCH_RIB_DEPTH deep, PROVISIONAL: drawn and checked, not priced), m: a parabola from the springings at sa, sb (ground za, zb) up to its crown
 * zc at the middle; shared by the support check and the drawing. */
export function archRib(sa: number, sb: number, za: number, zb: number, zc: number): (s: number) => number {
  const a = sb - sa, sm = (sa + sb) / 2, rise = zc - (za + zb) / 2;
  return (s: number) => { const t = (s - sm) / (a / 2); return za + (zb - za) * (s - sa) / a + rise * (1 - t * t); };
}
/** the underside of an arch's rib at its crown is this far under the road: the deck on its columns
 * (BRIDGE_STYLES.arch.columnSpan / 20) and the rib itself, ARCH_RIB_DEPTH */
export const ARCH_RIB_DEPTH = 2;
export const ARCH_DECK_DEPTH = S.arch.columnSpan / 20 + ARCH_RIB_DEPTH;
/** the columns standing on an arch's rib, at most BRIDGE_STYLES.arch.columnSpan apart (not its springings) */
export function archColumns(arch: { s0: number; s1: number }): number[] {
  const k = Math.max(1, Math.ceil((arch.s1 - arch.s0) / S.arch.columnSpan - 1e-9));
  return Array.from({ length: k - 1 }, (_, j) => arch.s0 + (arch.s1 - arch.s0) * (j + 1) / k);
}
